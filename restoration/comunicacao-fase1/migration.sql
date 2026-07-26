-- =============================================================================
-- Comunicação — Fase 1 · Fundação (PROPOSTA — v2, corretiva)
-- Arquivo: restoration/comunicacao-fase1/migration.sql
-- Estado: NÃO APLICADO. Aplicar apenas em staging após Fase 0.2 aplicada.
--
-- Correções v2 (respondendo à revisão do commit 3d4f3dc9):
--   1. rpc_publish_communication_event expande transacionalmente para outbox
--      (regras enabled, template ativo/versão fixa, destinatários server-side,
--       snapshot imutável, idempotency_key determinística, evento processed/failed).
--   2. Autorização por evento restrita:
--        - Fase 1: publicação manual só administrador.
--        - produto_pronto_retirada: exige o.status = 'pronto_entrega' (exato).
--        - produto_pronto_aplicacao: sem mapeamento de status comprovado no
--          enum status_os_onfarm — permanece manual/admin.
--        - administrative_important_update: perfil-alvo whitelisted e apenas
--          usuários ativos daquele app_role.
--   3. comunicacao_preferencias: XOR estrito user_id/cliente_id;
--      email_verificado/telefone_verificado só por RPC administrativa
--      (verify_communication_channel). Consent (enabled/whatsapp opt) separado.
--      Cliente portal somente via has_role + get_cliente_ids_for_user.
--   4. rpc_claim_communication_outbox: usa p_lease_seconds, reclama processing
--      expirado, valida batch/worker/lease, retorna linhas atualizadas.
--   5. complete/fail exigem p_worker_id e validam locked_by/lease.
--   6. Renderização compartilhada permanece no worker (supabase/functions/_shared).
--   7. UI real (rota/guard/CRUD) fora deste artefato.
--   8. types.ts atualizado manualmente no repositório.
--   9. Audit log: before/after reais, actor server-side, tamanhos limitados,
--      helper NÃO executável por authenticated; trigger permite transições ativas
--      (ativação/arquivamento) e proíbe apenas alteração de conteúdo em active.
--  10. Testes de comportamento no repositório: state machine, expansão de outbox,
--      opt-out, RLS por papel, ausência de rede.
--
-- Convenções: schema public, RLS ligada, RPCs SECURITY DEFINER, search_path fixo,
-- revoke anon, grants mínimos. Idempotente e transacional (BEGIN/COMMIT).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 0. Enums
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'comunicacao_canal') THEN
    CREATE TYPE public.comunicacao_canal AS ENUM ('email','whatsapp','in_app','push');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'comunicacao_template_status') THEN
    CREATE TYPE public.comunicacao_template_status AS ENUM ('draft','active','archived');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'comunicacao_outbox_status') THEN
    CREATE TYPE public.comunicacao_outbox_status AS ENUM ('pending','processing','sent','failed','cancelled','skipped','dead_letter');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'comunicacao_evento_status') THEN
    CREATE TYPE public.comunicacao_evento_status AS ENUM ('received','processed','skipped','failed');
  END IF;
END$$;

-- -----------------------------------------------------------------------------
-- 1. Templates
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.comunicacao_templates (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chave         text NOT NULL,
  nome          text NOT NULL,
  canal         public.comunicacao_canal NOT NULL,
  versao        integer NOT NULL DEFAULT 1,
  status        public.comunicacao_template_status NOT NULL DEFAULT 'draft',
  locale        text NOT NULL DEFAULT 'pt-BR',
  assunto       text,
  corpo         text NOT NULL,
  variaveis     jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by    uuid,
  updated_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  archived_at   timestamptz,
  CONSTRAINT comunicacao_templates_chave_chk CHECK (length(chave) BETWEEN 3 AND 120),
  CONSTRAINT comunicacao_templates_corpo_chk CHECK (length(corpo) BETWEEN 1 AND 30000),
  CONSTRAINT comunicacao_templates_assunto_chk CHECK (assunto IS NULL OR length(assunto) <= 300),
  CONSTRAINT comunicacao_templates_versao_chk CHECK (versao >= 1),
  CONSTRAINT comunicacao_templates_variaveis_arr CHECK (jsonb_typeof(variaveis) = 'array' AND jsonb_array_length(variaveis) <= 64),
  CONSTRAINT comunicacao_templates_locale_chk CHECK (locale IN ('pt-BR'))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_comunicacao_templates_chave_canal_versao
  ON public.comunicacao_templates (chave, canal, versao);

CREATE UNIQUE INDEX IF NOT EXISTS ux_comunicacao_templates_active_por_chave_canal
  ON public.comunicacao_templates (chave, canal)
  WHERE status = 'active';

-- Trigger: em 'active', bloqueia mudança de conteúdo; permite transição de status
-- (active -> archived) e atualização de timestamps/updated_by/archived_at.
CREATE OR REPLACE FUNCTION public.comunicacao_templates_guard_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'active' THEN
    IF (NEW.corpo, NEW.assunto, NEW.variaveis, NEW.canal, NEW.chave, NEW.versao, NEW.locale)
       IS DISTINCT FROM
       (OLD.corpo, OLD.assunto, OLD.variaveis, OLD.canal, OLD.chave, OLD.versao, OLD.locale) THEN
      RAISE EXCEPTION 'comunicacao_templates: conteúdo de template ativo é imutável (chave=% canal=% versao=%). Crie nova versão.',
        OLD.chave, OLD.canal, OLD.versao USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.status NOT IN ('active','archived') THEN
      RAISE EXCEPTION 'template ativo só pode transitar para archived' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END$$;

DROP TRIGGER IF EXISTS trg_comunicacao_templates_guard ON public.comunicacao_templates;
CREATE TRIGGER trg_comunicacao_templates_guard
  BEFORE UPDATE ON public.comunicacao_templates
  FOR EACH ROW EXECUTE FUNCTION public.comunicacao_templates_guard_immutable();

-- -----------------------------------------------------------------------------
-- 2. Regras
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.comunicacao_regras (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key           text NOT NULL,
  perfil              public.app_role,
  estrategia          text NOT NULL DEFAULT 'by_role',
  canal               public.comunicacao_canal NOT NULL,
  template_chave      text NOT NULL,
  template_versao     integer,
  condicoes           jsonb NOT NULL DEFAULT '{}'::jsonb,
  prioridade          integer NOT NULL DEFAULT 100,
  enabled             boolean NOT NULL DEFAULT false,
  cooldown_seconds    integer NOT NULL DEFAULT 0,
  created_by          uuid,
  updated_by          uuid,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT comunicacao_regras_event_chk CHECK (length(event_key) BETWEEN 3 AND 100),
  CONSTRAINT comunicacao_regras_estrategia_chk CHECK (estrategia IN ('by_role','source_participants','broadcast_role')),
  CONSTRAINT comunicacao_regras_prio_chk CHECK (prioridade BETWEEN 0 AND 1000),
  CONSTRAINT comunicacao_regras_cooldown_chk CHECK (cooldown_seconds BETWEEN 0 AND 604800),
  CONSTRAINT comunicacao_regras_condicoes_obj CHECK (jsonb_typeof(condicoes) = 'object' AND length(condicoes::text) <= 8000)
);

CREATE INDEX IF NOT EXISTS ix_comunicacao_regras_event_enabled
  ON public.comunicacao_regras (event_key, enabled);

-- -----------------------------------------------------------------------------
-- 3. Eventos
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.comunicacao_eventos (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key         text NOT NULL,
  source_type       text,
  source_id         uuid,
  payload           jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at       timestamptz NOT NULL DEFAULT now(),
  created_by        uuid,
  idempotency_key   text NOT NULL,
  status            public.comunicacao_evento_status NOT NULL DEFAULT 'received',
  processed_at      timestamptz,
  processing_error  text,
  outbox_enqueued   integer NOT NULL DEFAULT 0,
  outbox_skipped    integer NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT comunicacao_eventos_event_chk CHECK (length(event_key) BETWEEN 3 AND 100),
  CONSTRAINT comunicacao_eventos_payload_obj CHECK (jsonb_typeof(payload) = 'object' AND length(payload::text) <= 8000),
  CONSTRAINT comunicacao_eventos_idem_chk CHECK (length(idempotency_key) BETWEEN 8 AND 200),
  CONSTRAINT comunicacao_eventos_error_chk CHECK (processing_error IS NULL OR length(processing_error) <= 2000),
  CONSTRAINT comunicacao_eventos_counts_chk CHECK (outbox_enqueued >= 0 AND outbox_skipped >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_comunicacao_eventos_idem
  ON public.comunicacao_eventos (idempotency_key);
CREATE INDEX IF NOT EXISTS ix_comunicacao_eventos_event_time
  ON public.comunicacao_eventos (event_key, occurred_at DESC);

-- -----------------------------------------------------------------------------
-- 4. Outbox
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.comunicacao_outbox (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id              uuid NOT NULL REFERENCES public.comunicacao_eventos(id) ON DELETE RESTRICT,
  rule_id               uuid REFERENCES public.comunicacao_regras(id) ON DELETE SET NULL,
  template_id           uuid REFERENCES public.comunicacao_templates(id) ON DELETE SET NULL,
  template_chave        text NOT NULL,
  template_versao       integer NOT NULL,
  template_snapshot     jsonb NOT NULL,
  canal                 public.comunicacao_canal NOT NULL,
  recipient_user_id     uuid,
  recipient_cliente_id  uuid,
  recipient_hash        text,
  payload_snapshot      jsonb NOT NULL DEFAULT '{}'::jsonb,
  status                public.comunicacao_outbox_status NOT NULL DEFAULT 'pending',
  attempts              integer NOT NULL DEFAULT 0,
  max_attempts          integer NOT NULL DEFAULT 5,
  next_attempt_at       timestamptz NOT NULL DEFAULT now(),
  locked_at             timestamptz,
  locked_by             text,
  lease_expires_at      timestamptz,
  provider_message_id   text,
  error_code            text,
  error_message         text,
  sent_at               timestamptz,
  idempotency_key       text NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT comunicacao_outbox_attempts_chk CHECK (attempts >= 0 AND attempts <= 50),
  CONSTRAINT comunicacao_outbox_max_chk CHECK (max_attempts BETWEEN 1 AND 20),
  CONSTRAINT comunicacao_outbox_error_chk CHECK (error_message IS NULL OR length(error_message) <= 2000),
  CONSTRAINT comunicacao_outbox_error_code_chk CHECK (error_code IS NULL OR length(error_code) <= 80),
  CONSTRAINT comunicacao_outbox_provider_id_chk CHECK (provider_message_id IS NULL OR length(provider_message_id) <= 200),
  CONSTRAINT comunicacao_outbox_snapshot_obj CHECK (jsonb_typeof(template_snapshot) = 'object' AND length(template_snapshot::text) <= 40000),
  CONSTRAINT comunicacao_outbox_payload_obj  CHECK (jsonb_typeof(payload_snapshot) = 'object' AND length(payload_snapshot::text) <= 8000),
  CONSTRAINT comunicacao_outbox_idem_chk CHECK (length(idempotency_key) BETWEEN 8 AND 250),
  CONSTRAINT comunicacao_outbox_recipient_chk CHECK (
    recipient_user_id IS NOT NULL OR recipient_cliente_id IS NOT NULL OR recipient_hash IS NOT NULL
  ),
  CONSTRAINT comunicacao_outbox_worker_chk CHECK (locked_by IS NULL OR length(locked_by) BETWEEN 1 AND 80)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_comunicacao_outbox_idem
  ON public.comunicacao_outbox (idempotency_key);
CREATE INDEX IF NOT EXISTS ix_comunicacao_outbox_worker
  ON public.comunicacao_outbox (status, next_attempt_at)
  WHERE status IN ('pending','processing');
CREATE INDEX IF NOT EXISTS ix_comunicacao_outbox_event
  ON public.comunicacao_outbox (event_id);

CREATE OR REPLACE FUNCTION public.comunicacao_outbox_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END$$;

DROP TRIGGER IF EXISTS trg_comunicacao_outbox_touch ON public.comunicacao_outbox;
CREATE TRIGGER trg_comunicacao_outbox_touch
  BEFORE UPDATE ON public.comunicacao_outbox
  FOR EACH ROW EXECUTE FUNCTION public.comunicacao_outbox_touch();

-- -----------------------------------------------------------------------------
-- 5. Preferências — XOR estrito, verificação separada de consentimento
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.comunicacao_preferencias (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid,
  cliente_id            uuid,
  canal                 public.comunicacao_canal NOT NULL,
  enabled               boolean NOT NULL DEFAULT true,
  telefone_verificado   boolean NOT NULL DEFAULT false,
  email_verificado      boolean NOT NULL DEFAULT false,
  whatsapp_opt_in_at    timestamptz,
  whatsapp_opt_out_at   timestamptz,
  source                text NOT NULL DEFAULT 'user',
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT comunicacao_preferencias_scope_xor CHECK (
    (user_id IS NOT NULL AND cliente_id IS NULL)
    OR (user_id IS NULL AND cliente_id IS NOT NULL)
  ),
  CONSTRAINT comunicacao_preferencias_source_chk
    CHECK (source IN ('user','cliente_portal','admin','system'))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_comunicacao_preferencias_user_canal
  ON public.comunicacao_preferencias (user_id, canal) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_comunicacao_preferencias_cliente_canal
  ON public.comunicacao_preferencias (cliente_id, canal) WHERE cliente_id IS NOT NULL;

-- Histórico de opt-in/out (LGPD). Append-only.
CREATE TABLE IF NOT EXISTS public.comunicacao_consent_log (
  id            bigserial PRIMARY KEY,
  user_id       uuid,
  cliente_id    uuid,
  canal         public.comunicacao_canal NOT NULL,
  acao          text NOT NULL,
  source        text NOT NULL,
  actor_id      uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT comunicacao_consent_scope_xor CHECK (
    (user_id IS NOT NULL AND cliente_id IS NULL)
    OR (user_id IS NULL AND cliente_id IS NOT NULL)
  ),
  CONSTRAINT comunicacao_consent_acao_chk CHECK (acao IN ('opt_in','opt_out','enabled_on','enabled_off','verified_email','verified_phone'))
);
CREATE INDEX IF NOT EXISTS ix_comunicacao_consent_scope_time
  ON public.comunicacao_consent_log (COALESCE(user_id, cliente_id), created_at DESC);

CREATE OR REPLACE FUNCTION public.comunicacao_consent_no_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'comunicacao_consent_log é append-only' USING ERRCODE='insufficient_privilege'; END$$;
DROP TRIGGER IF EXISTS trg_comunicacao_consent_noupd ON public.comunicacao_consent_log;
CREATE TRIGGER trg_comunicacao_consent_noupd
  BEFORE UPDATE OR DELETE ON public.comunicacao_consent_log
  FOR EACH ROW EXECUTE FUNCTION public.comunicacao_consent_no_mutation();

-- -----------------------------------------------------------------------------
-- 6. Audit log — append-only, actor server-side
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.comunicacao_audit_log (
  id            bigserial PRIMARY KEY,
  acao          text NOT NULL,
  entidade      text NOT NULL,
  entity_id     uuid,
  actor_id      uuid,
  before_state  jsonb,
  after_state   jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT comunicacao_audit_acao_chk CHECK (length(acao) BETWEEN 2 AND 80),
  CONSTRAINT comunicacao_audit_entidade_chk CHECK (length(entidade) BETWEEN 2 AND 80),
  CONSTRAINT comunicacao_audit_before_size CHECK (before_state IS NULL OR length(before_state::text) <= 16000),
  CONSTRAINT comunicacao_audit_after_size  CHECK (after_state  IS NULL OR length(after_state::text)  <= 16000)
);
CREATE INDEX IF NOT EXISTS ix_comunicacao_audit_entidade_time
  ON public.comunicacao_audit_log (entidade, created_at DESC);

CREATE OR REPLACE FUNCTION public.comunicacao_audit_no_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'comunicacao_audit_log é append-only' USING ERRCODE = 'insufficient_privilege';
END$$;

DROP TRIGGER IF EXISTS trg_comunicacao_audit_noupd ON public.comunicacao_audit_log;
CREATE TRIGGER trg_comunicacao_audit_noupd
  BEFORE UPDATE OR DELETE ON public.comunicacao_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.comunicacao_audit_no_mutation();

-- -----------------------------------------------------------------------------
-- 7. Grants + RLS
-- -----------------------------------------------------------------------------
REVOKE ALL ON public.comunicacao_templates,
             public.comunicacao_regras,
             public.comunicacao_eventos,
             public.comunicacao_outbox,
             public.comunicacao_preferencias,
             public.comunicacao_consent_log,
             public.comunicacao_audit_log
       FROM anon;

GRANT SELECT ON public.comunicacao_templates,
                public.comunicacao_regras,
                public.comunicacao_preferencias
       TO authenticated;
GRANT ALL ON public.comunicacao_templates,
             public.comunicacao_regras,
             public.comunicacao_eventos,
             public.comunicacao_outbox,
             public.comunicacao_preferencias,
             public.comunicacao_consent_log,
             public.comunicacao_audit_log
       TO service_role;

ALTER TABLE public.comunicacao_templates      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comunicacao_regras         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comunicacao_eventos        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comunicacao_outbox         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comunicacao_preferencias   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comunicacao_consent_log    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comunicacao_audit_log      ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "comunicacao_templates_select_admin_gestor" ON public.comunicacao_templates;
CREATE POLICY "comunicacao_templates_select_admin_gestor"
  ON public.comunicacao_templates FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'gestor'));

DROP POLICY IF EXISTS "comunicacao_regras_select_admin_gestor" ON public.comunicacao_regras;
CREATE POLICY "comunicacao_regras_select_admin_gestor"
  ON public.comunicacao_regras FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'gestor'));

DROP POLICY IF EXISTS "comunicacao_eventos_select_admin" ON public.comunicacao_eventos;
CREATE POLICY "comunicacao_eventos_select_admin"
  ON public.comunicacao_eventos FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'administrador'));

DROP POLICY IF EXISTS "comunicacao_outbox_select_admin" ON public.comunicacao_outbox;
CREATE POLICY "comunicacao_outbox_select_admin"
  ON public.comunicacao_outbox FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'administrador'));

DROP POLICY IF EXISTS "comunicacao_preferencias_select_own" ON public.comunicacao_preferencias;
CREATE POLICY "comunicacao_preferencias_select_own"
  ON public.comunicacao_preferencias FOR SELECT TO authenticated
  USING (
    (user_id IS NOT NULL AND user_id = auth.uid())
    OR (
      cliente_id IS NOT NULL
      AND cliente_id IN (SELECT public.get_cliente_ids_for_user(auth.uid()))
    )
  );

DROP POLICY IF EXISTS "comunicacao_audit_select_admin" ON public.comunicacao_audit_log;
CREATE POLICY "comunicacao_audit_select_admin"
  ON public.comunicacao_audit_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'administrador'));

DROP POLICY IF EXISTS "comunicacao_consent_select_admin" ON public.comunicacao_consent_log;
CREATE POLICY "comunicacao_consent_select_admin"
  ON public.comunicacao_consent_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'administrador'));

-- -----------------------------------------------------------------------------
-- 8. Helpers internos — actor server-side, sem execução por authenticated
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._comunicacao_write_audit(
  _acao text, _entidade text, _entity_id uuid,
  _before jsonb, _after jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.comunicacao_audit_log(acao, entidade, entity_id, actor_id, before_state, after_state)
  VALUES (_acao, _entidade, _entity_id, auth.uid(),
          CASE WHEN _before IS NULL THEN NULL ELSE _before END,
          CASE WHEN _after  IS NULL THEN NULL ELSE _after  END);
END$$;
REVOKE ALL ON FUNCTION public._comunicacao_write_audit(text,text,uuid,jsonb,jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._comunicacao_write_consent(
  _user_id uuid, _cliente_id uuid, _canal public.comunicacao_canal,
  _acao text, _source text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.comunicacao_consent_log(user_id, cliente_id, canal, acao, source, actor_id)
  VALUES (_user_id, _cliente_id, _canal, _acao, _source, auth.uid());
END$$;
REVOKE ALL ON FUNCTION public._comunicacao_write_consent(uuid,uuid,public.comunicacao_canal,text,text) FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 9. RPCs: Templates (create/update/activate/archive)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_create_communication_template(
  p_chave text, p_nome text, p_canal public.comunicacao_canal,
  p_assunto text, p_corpo text, p_variaveis jsonb DEFAULT '[]'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_versao integer;
BEGIN
  IF NOT public.has_role(auth.uid(),'administrador') THEN
    RAISE EXCEPTION 'apenas administrador' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF jsonb_typeof(p_variaveis) <> 'array' THEN
    RAISE EXCEPTION 'variaveis deve ser array JSON';
  END IF;

  SELECT COALESCE(MAX(versao),0) + 1 INTO v_versao
    FROM public.comunicacao_templates
   WHERE chave = p_chave AND canal = p_canal;

  INSERT INTO public.comunicacao_templates(chave,nome,canal,versao,status,assunto,corpo,variaveis,created_by,updated_by)
  VALUES (p_chave,p_nome,p_canal,v_versao,'draft',p_assunto,p_corpo,p_variaveis,auth.uid(),auth.uid())
  RETURNING id INTO v_id;

  PERFORM public._comunicacao_write_audit(
    'template.create','comunicacao_templates',v_id, NULL,
    jsonb_build_object('chave',p_chave,'canal',p_canal,'versao',v_versao,'nome',p_nome));

  RETURN jsonb_build_object('ok',true,'template_id',v_id,'versao',v_versao);
END$$;
REVOKE ALL ON FUNCTION public.rpc_create_communication_template(text,text,public.comunicacao_canal,text,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_create_communication_template(text,text,public.comunicacao_canal,text,text,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.rpc_update_communication_template(
  p_template_id uuid, p_nome text, p_assunto text, p_corpo text, p_variaveis jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.comunicacao_templates%rowtype;
BEGIN
  IF NOT public.has_role(auth.uid(),'administrador') THEN
    RAISE EXCEPTION 'apenas administrador' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO r FROM public.comunicacao_templates WHERE id = p_template_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'template não encontrado'; END IF;
  IF r.status = 'active' THEN
    RAISE EXCEPTION 'template ativo é imutável; crie nova versão via rpc_create_communication_template';
  END IF;
  IF r.status = 'archived' THEN
    RAISE EXCEPTION 'template arquivado';
  END IF;
  UPDATE public.comunicacao_templates
     SET nome = p_nome, assunto = p_assunto, corpo = p_corpo,
         variaveis = COALESCE(p_variaveis,'[]'::jsonb), updated_by = auth.uid()
   WHERE id = p_template_id;
  PERFORM public._comunicacao_write_audit(
    'template.update','comunicacao_templates',p_template_id,
    to_jsonb(r),
    (SELECT to_jsonb(t) FROM public.comunicacao_templates t WHERE t.id = p_template_id));
  RETURN jsonb_build_object('ok',true);
END$$;
REVOKE ALL ON FUNCTION public.rpc_update_communication_template(uuid,text,text,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_update_communication_template(uuid,text,text,text,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.rpc_activate_communication_template(p_template_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.comunicacao_templates%rowtype; prev public.comunicacao_templates%rowtype;
BEGIN
  IF NOT public.has_role(auth.uid(),'administrador') THEN
    RAISE EXCEPTION 'apenas administrador' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO r FROM public.comunicacao_templates WHERE id = p_template_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'template não encontrado'; END IF;
  IF r.status = 'archived' THEN RAISE EXCEPTION 'template arquivado'; END IF;

  SELECT * INTO prev FROM public.comunicacao_templates
    WHERE chave = r.chave AND canal = r.canal AND status = 'active' AND id <> r.id
    FOR UPDATE;
  IF FOUND THEN
    UPDATE public.comunicacao_templates
       SET status = 'archived', archived_at = now(), updated_by = auth.uid()
     WHERE id = prev.id;
    PERFORM public._comunicacao_write_audit(
      'template.archive_prev_on_activate','comunicacao_templates',prev.id,
      to_jsonb(prev),
      jsonb_build_object('archived_by_activation_of', p_template_id));
  END IF;

  UPDATE public.comunicacao_templates
     SET status = 'active', updated_by = auth.uid()
   WHERE id = p_template_id;

  PERFORM public._comunicacao_write_audit(
    'template.activate','comunicacao_templates',p_template_id,
    to_jsonb(r),
    (SELECT to_jsonb(t) FROM public.comunicacao_templates t WHERE t.id = p_template_id));
  RETURN jsonb_build_object('ok',true);
END$$;
REVOKE ALL ON FUNCTION public.rpc_activate_communication_template(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_activate_communication_template(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.rpc_archive_communication_template(p_template_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.comunicacao_templates%rowtype;
BEGIN
  IF NOT public.has_role(auth.uid(),'administrador') THEN
    RAISE EXCEPTION 'apenas administrador' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO r FROM public.comunicacao_templates WHERE id = p_template_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'template não encontrado'; END IF;
  IF r.status = 'archived' THEN
    RETURN jsonb_build_object('ok',true,'already_archived',true);
  END IF;
  UPDATE public.comunicacao_templates
     SET status = 'archived', archived_at = now(), updated_by = auth.uid()
   WHERE id = p_template_id;
  PERFORM public._comunicacao_write_audit(
    'template.archive','comunicacao_templates',p_template_id,
    to_jsonb(r),
    (SELECT to_jsonb(t) FROM public.comunicacao_templates t WHERE t.id = p_template_id));
  RETURN jsonb_build_object('ok',true);
END$$;
REVOKE ALL ON FUNCTION public.rpc_archive_communication_template(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_archive_communication_template(uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- 10. RPC: Regras
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_upsert_communication_rule(
  p_rule_id uuid, p_event_key text, p_perfil public.app_role,
  p_estrategia text, p_canal public.comunicacao_canal,
  p_template_chave text, p_template_versao integer,
  p_condicoes jsonb, p_prioridade integer, p_enabled boolean, p_cooldown_seconds integer
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; prev public.comunicacao_regras%rowtype;
BEGIN
  IF NOT public.has_role(auth.uid(),'administrador') THEN
    RAISE EXCEPTION 'apenas administrador' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_event_key NOT IN ('produto_pronto_retirada','produto_pronto_aplicacao','administrative_important_update') THEN
    RAISE EXCEPTION 'event_key não permitido nesta fase: %', p_event_key;
  END IF;
  IF p_rule_id IS NULL THEN
    INSERT INTO public.comunicacao_regras(event_key,perfil,estrategia,canal,template_chave,template_versao,
      condicoes,prioridade,enabled,cooldown_seconds,created_by,updated_by)
    VALUES (p_event_key,p_perfil,COALESCE(p_estrategia,'by_role'),p_canal,p_template_chave,p_template_versao,
      COALESCE(p_condicoes,'{}'::jsonb),COALESCE(p_prioridade,100),COALESCE(p_enabled,false),
      COALESCE(p_cooldown_seconds,0),auth.uid(),auth.uid())
    RETURNING id INTO v_id;
    PERFORM public._comunicacao_write_audit(
      'rule.create','comunicacao_regras',v_id, NULL,
      jsonb_build_object('event_key',p_event_key,'canal',p_canal,'template_chave',p_template_chave));
  ELSE
    SELECT * INTO prev FROM public.comunicacao_regras WHERE id = p_rule_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'regra não encontrada'; END IF;
    UPDATE public.comunicacao_regras
       SET event_key = p_event_key, perfil = p_perfil, estrategia = COALESCE(p_estrategia,'by_role'),
           canal = p_canal, template_chave = p_template_chave, template_versao = p_template_versao,
           condicoes = COALESCE(p_condicoes,'{}'::jsonb), prioridade = COALESCE(p_prioridade,100),
           enabled = COALESCE(p_enabled,false), cooldown_seconds = COALESCE(p_cooldown_seconds,0),
           updated_by = auth.uid(), updated_at = now()
     WHERE id = p_rule_id
     RETURNING id INTO v_id;
    PERFORM public._comunicacao_write_audit(
      'rule.update','comunicacao_regras',v_id,
      to_jsonb(prev),
      (SELECT to_jsonb(r) FROM public.comunicacao_regras r WHERE r.id = v_id));
  END IF;
  RETURN jsonb_build_object('ok',true,'rule_id',v_id);
END$$;
REVOKE ALL ON FUNCTION public.rpc_upsert_communication_rule(uuid,text,public.app_role,text,public.comunicacao_canal,text,integer,jsonb,integer,boolean,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_upsert_communication_rule(uuid,text,public.app_role,text,public.comunicacao_canal,text,integer,jsonb,integer,boolean,integer) TO authenticated;

-- -----------------------------------------------------------------------------
-- 11. Helpers internos de expansão (server-side)
-- -----------------------------------------------------------------------------

-- Resolve template ativo (ou versão fixa), retorna registro completo.
CREATE OR REPLACE FUNCTION public._comunicacao_resolve_template(
  _chave text, _canal public.comunicacao_canal, _versao integer
) RETURNS public.comunicacao_templates
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.comunicacao_templates%rowtype;
BEGIN
  IF _versao IS NULL THEN
    SELECT * INTO r FROM public.comunicacao_templates
     WHERE chave = _chave AND canal = _canal AND status = 'active'
     LIMIT 1;
  ELSE
    SELECT * INTO r FROM public.comunicacao_templates
     WHERE chave = _chave AND canal = _canal AND versao = _versao
     LIMIT 1;
  END IF;
  RETURN r; -- pode ser NULL row
END$$;
REVOKE ALL ON FUNCTION public._comunicacao_resolve_template(text,public.comunicacao_canal,integer) FROM PUBLIC, anon, authenticated;

-- Verifica se o destinatário permite envio no canal (preferência + verificação).
CREATE OR REPLACE FUNCTION public._comunicacao_can_deliver(
  _user_id uuid, _cliente_id uuid, _canal public.comunicacao_canal
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.comunicacao_preferencias%rowtype;
BEGIN
  IF _user_id IS NOT NULL THEN
    SELECT * INTO p FROM public.comunicacao_preferencias
      WHERE user_id = _user_id AND canal = _canal;
  ELSIF _cliente_id IS NOT NULL THEN
    SELECT * INTO p FROM public.comunicacao_preferencias
      WHERE cliente_id = _cliente_id AND canal = _canal;
  ELSE
    RETURN false;
  END IF;
  -- Padrão: enabled=true, verificações false. In_app não requer verificação.
  IF _canal = 'in_app' THEN
    RETURN COALESCE(p.enabled, true);
  END IF;
  IF NOT COALESCE(p.enabled, true) THEN RETURN false; END IF;
  IF _canal = 'whatsapp' AND p.whatsapp_opt_out_at IS NOT NULL THEN RETURN false; END IF;
  IF _canal = 'whatsapp' AND (p.whatsapp_opt_in_at IS NULL OR NOT COALESCE(p.telefone_verificado,false)) THEN
    RETURN false;
  END IF;
  IF _canal = 'email' AND NOT COALESCE(p.email_verificado,false) THEN
    RETURN false;
  END IF;
  IF _canal = 'push' AND _user_id IS NULL THEN RETURN false; END IF;
  RETURN true;
END$$;
REVOKE ALL ON FUNCTION public._comunicacao_can_deliver(uuid,uuid,public.comunicacao_canal) FROM PUBLIC, anon, authenticated;

-- Resolve destinatários por regra + evento. Retorna set de (user_id, cliente_id).
CREATE OR REPLACE FUNCTION public._comunicacao_resolve_recipients(
  _event_key text, _rule public.comunicacao_regras, _payload jsonb, _source_id uuid
) RETURNS TABLE (recipient_user_id uuid, recipient_cliente_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_perfil_alvo public.app_role;
  v_os_cliente uuid;
BEGIN
  IF _event_key = 'administrative_important_update' THEN
    -- Payload restrito: {"target_role":"<app_role>"} — apenas usuários ativos.
    BEGIN
      v_perfil_alvo := (_payload ->> 'target_role')::public.app_role;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'target_role inválido';
    END;
    IF v_perfil_alvo IS NULL THEN
      RAISE EXCEPTION 'target_role requerido';
    END IF;
    RETURN QUERY
      SELECT ur.user_id, NULL::uuid
        FROM public.user_roles ur
        JOIN public.profiles pr ON pr.id = ur.user_id
       WHERE ur.role = v_perfil_alvo
         AND COALESCE(pr.ativo, true) = true;
    RETURN;
  END IF;

  IF _event_key IN ('produto_pronto_retirada','produto_pronto_aplicacao') THEN
    -- Cliente da OS
    SELECT o.cliente_id INTO v_os_cliente
      FROM public.ordens_servico o WHERE o.id = _source_id;
    IF v_os_cliente IS NULL THEN RETURN; END IF;

    IF COALESCE(_rule.estrategia,'by_role') = 'source_participants' THEN
      -- Cliente + usuários vinculados ao cliente_produtor
      RETURN QUERY
        SELECT NULL::uuid, v_os_cliente
        UNION
        SELECT ucp.user_id, NULL::uuid
          FROM public.usuarios_cliente_produtor ucp
         WHERE ucp.cliente_id = v_os_cliente;
      RETURN;
    ELSE
      -- by_role: usuários ativos com o perfil
      IF _rule.perfil IS NULL THEN RETURN; END IF;
      RETURN QUERY
        SELECT ur.user_id, NULL::uuid
          FROM public.user_roles ur
          JOIN public.profiles pr ON pr.id = ur.user_id
         WHERE ur.role = _rule.perfil
           AND COALESCE(pr.ativo,true) = true;
      RETURN;
    END IF;
  END IF;
END$$;
REVOKE ALL ON FUNCTION public._comunicacao_resolve_recipients(text,public.comunicacao_regras,jsonb,uuid) FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 12. RPC: Publicar evento COM EXPANSÃO TRANSACIONAL PARA OUTBOX
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_publish_communication_event(
  p_event_key text, p_source_type text, p_source_id uuid,
  p_payload jsonb, p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_event_id uuid;
  v_duplicated boolean := false;
  v_rule public.comunicacao_regras%rowtype;
  v_tpl  public.comunicacao_templates%rowtype;
  v_rec  record;
  v_snapshot jsonb;
  v_payload_snapshot jsonb;
  v_idem_out text;
  v_enq int := 0;
  v_skp int := 0;
  v_key_whitelist text[];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'autenticação requerida' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Whitelist rígida (Fase 1)
  IF p_event_key NOT IN ('produto_pronto_retirada','produto_pronto_aplicacao','administrative_important_update') THEN
    RAISE EXCEPTION 'event_key não permitido nesta fase: %', p_event_key;
  END IF;
  IF jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'payload deve ser objeto JSON';
  END IF;
  IF length(p_payload::text) > 4000 THEN
    RAISE EXCEPTION 'payload excede 4000 chars';
  END IF;

  -- Autorização por evento — Fase 1: publicação MANUAL só administrador.
  -- Eventos de OS futuramente virão de trigger/RPC ligada à transição de status.
  IF NOT public.has_role(auth.uid(),'administrador') THEN
    RAISE EXCEPTION 'apenas administrador pode publicar eventos nesta fase (manual)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Validação de source/status por event_key
  IF p_event_key = 'produto_pronto_retirada' THEN
    IF p_source_type <> 'ordens_servico' OR p_source_id IS NULL THEN
      RAISE EXCEPTION 'source ordens_servico/id requerido';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.ordens_servico o
       WHERE o.id = p_source_id AND o.status = 'pronto_entrega'
    ) THEN
      RAISE EXCEPTION 'ordens_servico não está em pronto_entrega';
    END IF;

  ELSIF p_event_key = 'produto_pronto_aplicacao' THEN
    -- IMPORTANTE: não há status equivalente comprovado no enum status_os_onfarm.
    -- Fase 1: aceita apenas publicação manual admin, source OS obrigatório e existente.
    IF p_source_type <> 'ordens_servico' OR p_source_id IS NULL THEN
      RAISE EXCEPTION 'source ordens_servico/id requerido';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.ordens_servico o WHERE o.id = p_source_id) THEN
      RAISE EXCEPTION 'ordem_servico inexistente';
    END IF;

  ELSIF p_event_key = 'administrative_important_update' THEN
    -- Payload whitelist estrita
    v_key_whitelist := ARRAY['target_role','titulo','mensagem'];
    PERFORM 1 FROM jsonb_object_keys(p_payload) k WHERE NOT (k = ANY(v_key_whitelist));
    IF FOUND THEN
      RAISE EXCEPTION 'chaves de payload não permitidas para administrative_important_update';
    END IF;
    IF p_payload ->> 'target_role' IS NULL THEN
      RAISE EXCEPTION 'target_role obrigatório';
    END IF;
    IF length(COALESCE(p_payload->>'titulo','')) > 200 THEN
      RAISE EXCEPTION 'titulo excede 200 chars';
    END IF;
    IF length(COALESCE(p_payload->>'mensagem','')) > 2000 THEN
      RAISE EXCEPTION 'mensagem excede 2000 chars';
    END IF;
  END IF;

  -- Insere evento (idempotência)
  INSERT INTO public.comunicacao_eventos(event_key,source_type,source_id,payload,created_by,idempotency_key)
  VALUES (p_event_key,p_source_type,p_source_id,p_payload,auth.uid(),p_idempotency_key)
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_event_id;

  IF v_event_id IS NULL THEN
    SELECT id INTO v_event_id FROM public.comunicacao_eventos WHERE idempotency_key = p_idempotency_key;
    v_duplicated := true;
    RETURN jsonb_build_object('ok',true,'event_id',v_event_id,'duplicated',true);
  END IF;

  -- Expansão transacional: regras enabled -> template -> destinatários -> outbox
  BEGIN
    FOR v_rule IN
      SELECT * FROM public.comunicacao_regras
       WHERE event_key = p_event_key AND enabled = true
       ORDER BY prioridade ASC
    LOOP
      v_tpl := public._comunicacao_resolve_template(v_rule.template_chave, v_rule.canal, v_rule.template_versao);
      IF v_tpl.id IS NULL THEN
        v_skp := v_skp + 1;
        CONTINUE;
      END IF;
      IF v_tpl.canal <> v_rule.canal THEN
        v_skp := v_skp + 1;
        CONTINUE;
      END IF;

      v_snapshot := jsonb_build_object(
        'assunto', v_tpl.assunto,
        'corpo', v_tpl.corpo,
        'variaveis', v_tpl.variaveis,
        'canal', v_tpl.canal,
        'locale', v_tpl.locale
      );
      v_payload_snapshot := jsonb_build_object(
        'event_key', p_event_key,
        'source_type', p_source_type,
        'source_id', p_source_id,
        'payload', p_payload
      );

      FOR v_rec IN
        SELECT * FROM public._comunicacao_resolve_recipients(p_event_key, v_rule, p_payload, p_source_id)
      LOOP
        -- Preferência/opt-in do destinatário
        IF NOT public._comunicacao_can_deliver(v_rec.recipient_user_id, v_rec.recipient_cliente_id, v_rule.canal) THEN
          v_skp := v_skp + 1;
          CONTINUE;
        END IF;

        v_idem_out := encode(digest(
          concat_ws('|', v_event_id::text, v_rule.id::text, v_tpl.id::text,
                    COALESCE(v_rec.recipient_user_id::text,''),
                    COALESCE(v_rec.recipient_cliente_id::text,'')),
          'sha256'), 'hex');

        INSERT INTO public.comunicacao_outbox(
          event_id, rule_id, template_id, template_chave, template_versao,
          template_snapshot, canal, recipient_user_id, recipient_cliente_id,
          payload_snapshot, idempotency_key)
        VALUES (
          v_event_id, v_rule.id, v_tpl.id, v_tpl.chave, v_tpl.versao,
          v_snapshot, v_rule.canal, v_rec.recipient_user_id, v_rec.recipient_cliente_id,
          v_payload_snapshot, v_idem_out)
        ON CONFLICT (idempotency_key) DO NOTHING;

        IF FOUND THEN v_enq := v_enq + 1; ELSE v_skp := v_skp + 1; END IF;
      END LOOP;
    END LOOP;

    UPDATE public.comunicacao_eventos
       SET status = 'processed', processed_at = now(),
           outbox_enqueued = v_enq, outbox_skipped = v_skp
     WHERE id = v_event_id;

  EXCEPTION WHEN others THEN
    -- Marca evento como failed com erro sanitizado; expansão anterior faz rollback pela transação externa
    UPDATE public.comunicacao_eventos
       SET status = 'failed', processed_at = now(),
           processing_error = left(regexp_replace(SQLERRM, '\s+', ' ', 'g'), 2000)
     WHERE id = v_event_id;
    RAISE;
  END;

  PERFORM public._comunicacao_write_audit(
    'event.publish','comunicacao_eventos',v_event_id, NULL,
    jsonb_build_object('event_key',p_event_key,'enqueued',v_enq,'skipped',v_skp));

  RETURN jsonb_build_object(
    'ok',true,'event_id',v_event_id,'duplicated',false,
    'enqueued',v_enq,'skipped',v_skp);
END$$;
REVOKE ALL ON FUNCTION public.rpc_publish_communication_event(text,text,uuid,jsonb,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_publish_communication_event(text,text,uuid,jsonb,text) TO authenticated;

-- -----------------------------------------------------------------------------
-- 13. RPC: Preferências — consent (usuário) vs verificação (admin)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_update_communication_preferences(
  p_canal public.comunicacao_canal,
  p_enabled boolean,
  p_whatsapp_opt_in boolean
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_prev public.comunicacao_preferencias%rowtype;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'autenticação requerida' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_prev FROM public.comunicacao_preferencias
    WHERE user_id = v_uid AND canal = p_canal;

  INSERT INTO public.comunicacao_preferencias(user_id, canal, enabled,
      whatsapp_opt_in_at, whatsapp_opt_out_at, source)
  VALUES (v_uid, p_canal, COALESCE(p_enabled,true),
      CASE WHEN p_whatsapp_opt_in IS TRUE THEN now() END,
      CASE WHEN p_whatsapp_opt_in IS FALSE THEN now() END,
      'user')
  ON CONFLICT (user_id, canal) WHERE user_id IS NOT NULL DO UPDATE
    SET enabled = EXCLUDED.enabled,
        whatsapp_opt_in_at  = CASE WHEN p_whatsapp_opt_in IS TRUE THEN now()
                                   ELSE public.comunicacao_preferencias.whatsapp_opt_in_at END,
        whatsapp_opt_out_at = CASE WHEN p_whatsapp_opt_in IS FALSE THEN now()
                                   ELSE public.comunicacao_preferencias.whatsapp_opt_out_at END,
        updated_at = now();

  -- Log LGPD: opt-out prevalece
  IF p_whatsapp_opt_in IS FALSE THEN
    PERFORM public._comunicacao_write_consent(v_uid, NULL, p_canal, 'opt_out','user');
  ELSIF p_whatsapp_opt_in IS TRUE THEN
    PERFORM public._comunicacao_write_consent(v_uid, NULL, p_canal, 'opt_in','user');
  END IF;
  IF v_prev.id IS NULL OR v_prev.enabled IS DISTINCT FROM COALESCE(p_enabled,true) THEN
    PERFORM public._comunicacao_write_consent(
      v_uid, NULL, p_canal,
      CASE WHEN COALESCE(p_enabled,true) THEN 'enabled_on' ELSE 'enabled_off' END,
      'user');
  END IF;

  RETURN jsonb_build_object('ok',true);
END$$;
REVOKE ALL ON FUNCTION public.rpc_update_communication_preferences(public.comunicacao_canal,boolean,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_update_communication_preferences(public.comunicacao_canal,boolean,boolean) TO authenticated;

-- Verificação (email/telefone): apenas service_role ou administrador com evidência externa.
CREATE OR REPLACE FUNCTION public.rpc_verify_communication_channel(
  p_user_id uuid, p_cliente_id uuid, p_canal public.comunicacao_canal,
  p_email_verificado boolean, p_telefone_verificado boolean
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'administrador') THEN
    RAISE EXCEPTION 'apenas administrador (verificação exige evidência externa)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF (p_user_id IS NOT NULL) = (p_cliente_id IS NOT NULL) THEN
    RAISE EXCEPTION 'informe exatamente um: user_id ou cliente_id';
  END IF;
  INSERT INTO public.comunicacao_preferencias(user_id, cliente_id, canal, enabled,
     email_verificado, telefone_verificado, source)
  VALUES (p_user_id, p_cliente_id, p_canal, true,
     COALESCE(p_email_verificado,false), COALESCE(p_telefone_verificado,false), 'admin')
  ON CONFLICT (user_id, canal) WHERE user_id IS NOT NULL DO UPDATE
     SET email_verificado = COALESCE(p_email_verificado, public.comunicacao_preferencias.email_verificado),
         telefone_verificado = COALESCE(p_telefone_verificado, public.comunicacao_preferencias.telefone_verificado),
         updated_at = now();
  -- (cliente_id path segue índice único correspondente)
  IF p_cliente_id IS NOT NULL THEN
    INSERT INTO public.comunicacao_preferencias(cliente_id, canal, enabled,
       email_verificado, telefone_verificado, source)
    VALUES (p_cliente_id, p_canal, true,
       COALESCE(p_email_verificado,false), COALESCE(p_telefone_verificado,false), 'admin')
    ON CONFLICT (cliente_id, canal) WHERE cliente_id IS NOT NULL DO UPDATE
       SET email_verificado = COALESCE(p_email_verificado, public.comunicacao_preferencias.email_verificado),
           telefone_verificado = COALESCE(p_telefone_verificado, public.comunicacao_preferencias.telefone_verificado),
           updated_at = now();
  END IF;
  IF p_email_verificado IS TRUE THEN
    PERFORM public._comunicacao_write_consent(p_user_id, p_cliente_id, p_canal, 'verified_email','admin');
  END IF;
  IF p_telefone_verificado IS TRUE THEN
    PERFORM public._comunicacao_write_consent(p_user_id, p_cliente_id, p_canal, 'verified_phone','admin');
  END IF;
  RETURN jsonb_build_object('ok',true);
END$$;
REVOKE ALL ON FUNCTION public.rpc_verify_communication_channel(uuid,uuid,public.comunicacao_canal,boolean,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_verify_communication_channel(uuid,uuid,public.comunicacao_canal,boolean,boolean) TO authenticated;

-- -----------------------------------------------------------------------------
-- 14. Worker RPCs — claim/complete/fail com lease e worker_id
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_claim_communication_outbox(
  p_batch_size integer, p_worker_id text, p_lease_seconds integer DEFAULT 60
) RETURNS SETOF public.comunicacao_outbox
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_batch int := GREATEST(1, LEAST(COALESCE(p_batch_size,10), 100));
  v_lease int := GREATEST(5, LEAST(COALESCE(p_lease_seconds,60), 900));
  v_worker text := NULLIF(trim(COALESCE(p_worker_id,'')), '');
  v_role text;
BEGIN
  v_role := COALESCE(current_setting('request.jwt.claims', true)::jsonb ->> 'role', session_user);
  IF v_role IS NOT NULL AND v_role NOT IN ('service_role') AND current_user <> 'service_role' THEN
    -- Barreira dupla: GRANT já bloqueia authenticated/anon; aqui apenas defense-in-depth.
    RAISE EXCEPTION 'apenas service_role pode reivindicar itens da outbox' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_worker IS NULL OR length(v_worker) > 80 THEN
    RAISE EXCEPTION 'worker_id inválido (1..80 chars)';
  END IF;

  RETURN QUERY
  WITH candidatos AS (
    SELECT id FROM public.comunicacao_outbox
     WHERE (
        (status = 'pending' AND next_attempt_at <= now())
        OR (status = 'processing' AND lease_expires_at IS NOT NULL AND lease_expires_at < now())
     )
     ORDER BY next_attempt_at ASC
     LIMIT v_batch
     FOR UPDATE SKIP LOCKED
  ),
  updated AS (
    UPDATE public.comunicacao_outbox o
       SET status = 'processing',
           locked_at = now(),
           locked_by = v_worker,
           lease_expires_at = now() + make_interval(secs => v_lease),
           attempts = o.attempts + 1
      FROM candidatos c
     WHERE o.id = c.id
     RETURNING o.*
  )
  SELECT * FROM updated;
END$$;
REVOKE ALL ON FUNCTION public.rpc_claim_communication_outbox(integer,text,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_claim_communication_outbox(integer,text,integer) TO service_role;

CREATE OR REPLACE FUNCTION public.rpc_complete_communication_delivery(
  p_outbox_id uuid, p_worker_id text, p_provider_message_id text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.comunicacao_outbox%rowtype;
BEGIN
  IF NULLIF(trim(COALESCE(p_worker_id,'')),'') IS NULL THEN
    RAISE EXCEPTION 'worker_id obrigatório';
  END IF;
  IF p_provider_message_id IS NOT NULL AND length(p_provider_message_id) > 200 THEN
    RAISE EXCEPTION 'provider_message_id excede 200 chars';
  END IF;
  SELECT * INTO r FROM public.comunicacao_outbox WHERE id = p_outbox_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'outbox não encontrado'; END IF;
  IF r.status <> 'processing' THEN
    RAISE EXCEPTION 'outbox não estava em processing (status=%)', r.status;
  END IF;
  IF r.locked_by IS DISTINCT FROM p_worker_id THEN
    RAISE EXCEPTION 'lease pertence a outro worker';
  END IF;
  IF r.lease_expires_at IS NOT NULL AND r.lease_expires_at < now() THEN
    RAISE EXCEPTION 'lease expirado';
  END IF;

  UPDATE public.comunicacao_outbox
     SET status = 'sent', sent_at = now(),
         provider_message_id = p_provider_message_id,
         locked_at = NULL, locked_by = NULL, lease_expires_at = NULL
   WHERE id = p_outbox_id;
  RETURN jsonb_build_object('ok',true);
END$$;
REVOKE ALL ON FUNCTION public.rpc_complete_communication_delivery(uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_complete_communication_delivery(uuid,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.rpc_fail_communication_delivery(
  p_outbox_id uuid, p_worker_id text, p_error_code text, p_error_message text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.comunicacao_outbox%rowtype; v_backoff int;
BEGIN
  IF NULLIF(trim(COALESCE(p_worker_id,'')),'') IS NULL THEN
    RAISE EXCEPTION 'worker_id obrigatório';
  END IF;
  IF p_error_code IS NOT NULL AND length(p_error_code) > 80 THEN
    RAISE EXCEPTION 'error_code excede 80 chars';
  END IF;
  SELECT * INTO r FROM public.comunicacao_outbox WHERE id = p_outbox_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'outbox não encontrado'; END IF;
  IF r.status <> 'processing' THEN RAISE EXCEPTION 'outbox não estava em processing'; END IF;
  IF r.locked_by IS DISTINCT FROM p_worker_id THEN
    RAISE EXCEPTION 'lease pertence a outro worker';
  END IF;

  IF r.attempts >= r.max_attempts THEN
    UPDATE public.comunicacao_outbox
       SET status = 'dead_letter', error_code = left(COALESCE(p_error_code,''),80),
           error_message = left(COALESCE(p_error_message,''),2000),
           locked_at = NULL, locked_by = NULL, lease_expires_at = NULL
     WHERE id = p_outbox_id;
    RETURN jsonb_build_object('ok',true,'status','dead_letter');
  END IF;

  v_backoff := LEAST(3600, POWER(2, r.attempts)::int * 30);
  UPDATE public.comunicacao_outbox
     SET status = 'pending',
         next_attempt_at = now() + make_interval(secs => v_backoff),
         error_code = left(COALESCE(p_error_code,''),80),
         error_message = left(COALESCE(p_error_message,''),2000),
         locked_at = NULL, locked_by = NULL, lease_expires_at = NULL
   WHERE id = p_outbox_id;
  RETURN jsonb_build_object('ok',true,'status','pending','retry_in_seconds',v_backoff);
END$$;
REVOKE ALL ON FUNCTION public.rpc_fail_communication_delivery(uuid,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_fail_communication_delivery(uuid,text,text,text) TO service_role;

COMMIT;

-- =============================================================================
-- Fim da migration Fase 1 v2 (proposta)
-- =============================================================================
