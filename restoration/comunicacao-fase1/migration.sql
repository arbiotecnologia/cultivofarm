-- =============================================================================
-- Comunicação — Fase 1 · Fundação (PROPOSTA)
-- Arquivo: restoration/comunicacao-fase1/migration.sql
-- Estado: NÃO APLICADO. Só aplicar em staging após validar Fase 0.2.
-- Escopo: templates, regras, eventos, outbox, preferências, audit log.
-- Convenções: schema public, RLS ligada, RPCs SECURITY DEFINER,
--             search_path fixo, revoke anon, grants mínimos.
-- Idempotente e transacional (BEGIN/COMMIT).
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
-- 1. Templates (versionados; ativos imutáveis)
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
  CONSTRAINT comunicacao_templates_corpo_chk CHECK (length(corpo) <= 30000),
  CONSTRAINT comunicacao_templates_assunto_chk CHECK (assunto IS NULL OR length(assunto) <= 300),
  CONSTRAINT comunicacao_templates_versao_chk CHECK (versao >= 1),
  CONSTRAINT comunicacao_templates_variaveis_arr CHECK (jsonb_typeof(variaveis) = 'array'),
  CONSTRAINT comunicacao_templates_locale_chk CHECK (locale IN ('pt-BR'))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_comunicacao_templates_chave_canal_versao
  ON public.comunicacao_templates (chave, canal, versao);

-- Garantir no máximo 1 versão active por (chave, canal)
CREATE UNIQUE INDEX IF NOT EXISTS ux_comunicacao_templates_active_por_chave_canal
  ON public.comunicacao_templates (chave, canal)
  WHERE status = 'active';

-- Templates ativos são imutáveis (só permite passar para archived e updated_by/updated_at/archived_at)
CREATE OR REPLACE FUNCTION public.comunicacao_templates_guard_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'active' AND NEW.status = 'active' THEN
    IF (NEW.corpo,NEW.assunto,NEW.variaveis,NEW.canal,NEW.chave,NEW.versao,NEW.locale)
       IS DISTINCT FROM
       (OLD.corpo,OLD.assunto,OLD.variaveis,OLD.canal,OLD.chave,OLD.versao,OLD.locale) THEN
      RAISE EXCEPTION 'comunicacao_templates: template ativo é imutável (chave=% canal=% versao=%). Crie nova versão.', OLD.chave, OLD.canal, OLD.versao
        USING ERRCODE = 'check_violation';
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
-- 2. Regras por evento
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.comunicacao_regras (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key           text NOT NULL,
  perfil              public.app_role,      -- pode ser NULL quando estratégia é source-based
  estrategia          text NOT NULL DEFAULT 'by_role',  -- by_role | source_participants | broadcast_role
  canal               public.comunicacao_canal NOT NULL,
  template_chave      text NOT NULL,
  template_versao     integer,              -- NULL => usa versão active corrente
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
  CONSTRAINT comunicacao_regras_condicoes_obj CHECK (jsonb_typeof(condicoes) = 'object')
);

CREATE INDEX IF NOT EXISTS ix_comunicacao_regras_event_enabled
  ON public.comunicacao_regras (event_key, enabled);

-- -----------------------------------------------------------------------------
-- 3. Eventos publicados (fonte de verdade + idempotência)
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
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT comunicacao_eventos_event_chk CHECK (length(event_key) BETWEEN 3 AND 100),
  CONSTRAINT comunicacao_eventos_payload_obj CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT comunicacao_eventos_idem_chk CHECK (length(idempotency_key) BETWEEN 8 AND 200),
  CONSTRAINT comunicacao_eventos_error_chk CHECK (processing_error IS NULL OR length(processing_error) <= 2000)
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
  template_snapshot     jsonb NOT NULL,  -- {assunto,corpo,variaveis,canal}
  canal                 public.comunicacao_canal NOT NULL,
  recipient_user_id     uuid,
  recipient_cliente_id  uuid,
  recipient_hash        text,            -- hash do endereço minimizado; endereço real resolvido pelo worker
  payload_snapshot      jsonb NOT NULL DEFAULT '{}'::jsonb,
  status                public.comunicacao_outbox_status NOT NULL DEFAULT 'pending',
  attempts              integer NOT NULL DEFAULT 0,
  max_attempts          integer NOT NULL DEFAULT 5,
  next_attempt_at       timestamptz NOT NULL DEFAULT now(),
  locked_at             timestamptz,
  locked_by             text,
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
  CONSTRAINT comunicacao_outbox_snapshot_obj CHECK (jsonb_typeof(template_snapshot) = 'object'),
  CONSTRAINT comunicacao_outbox_payload_obj  CHECK (jsonb_typeof(payload_snapshot) = 'object'),
  CONSTRAINT comunicacao_outbox_idem_chk CHECK (length(idempotency_key) BETWEEN 8 AND 250),
  CONSTRAINT comunicacao_outbox_recipient_chk CHECK (
    recipient_user_id IS NOT NULL OR recipient_cliente_id IS NOT NULL OR recipient_hash IS NOT NULL
  )
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
-- 5. Preferências
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
  CONSTRAINT comunicacao_preferencias_scope_chk
    CHECK ((user_id IS NOT NULL) OR (cliente_id IS NOT NULL)),
  CONSTRAINT comunicacao_preferencias_source_chk
    CHECK (source IN ('user','cliente_portal','admin','system'))
);

-- unicidade: (user_id, canal) e (cliente_id, canal)
CREATE UNIQUE INDEX IF NOT EXISTS ux_comunicacao_preferencias_user_canal
  ON public.comunicacao_preferencias (user_id, canal) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_comunicacao_preferencias_cliente_canal
  ON public.comunicacao_preferencias (cliente_id, canal) WHERE cliente_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 6. Audit log (append-only)
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
  CONSTRAINT comunicacao_audit_entidade_chk CHECK (length(entidade) BETWEEN 2 AND 80)
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
             public.comunicacao_audit_log
       FROM anon;

GRANT SELECT ON public.comunicacao_templates,
                public.comunicacao_regras,
                public.comunicacao_preferencias
       TO authenticated;
-- Escrita somente via RPC; sem INSERT/UPDATE/DELETE direto
GRANT ALL ON public.comunicacao_templates,
             public.comunicacao_regras,
             public.comunicacao_eventos,
             public.comunicacao_outbox,
             public.comunicacao_preferencias,
             public.comunicacao_audit_log
       TO service_role;

ALTER TABLE public.comunicacao_templates      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comunicacao_regras         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comunicacao_eventos        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comunicacao_outbox         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comunicacao_preferencias   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comunicacao_audit_log      ENABLE ROW LEVEL SECURITY;

-- Templates: leitura para administrador e gestor; escrita exclusiva via RPC (sem policy WRITE)
DROP POLICY IF EXISTS "comunicacao_templates_select_admin_gestor" ON public.comunicacao_templates;
CREATE POLICY "comunicacao_templates_select_admin_gestor"
  ON public.comunicacao_templates FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'gestor'));

-- Regras: idem
DROP POLICY IF EXISTS "comunicacao_regras_select_admin_gestor" ON public.comunicacao_regras;
CREATE POLICY "comunicacao_regras_select_admin_gestor"
  ON public.comunicacao_regras FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'gestor'));

-- Eventos e Outbox: leitura para administrador; sem escrita direta
DROP POLICY IF EXISTS "comunicacao_eventos_select_admin" ON public.comunicacao_eventos;
CREATE POLICY "comunicacao_eventos_select_admin"
  ON public.comunicacao_eventos FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(),'administrador'));

DROP POLICY IF EXISTS "comunicacao_outbox_select_admin" ON public.comunicacao_outbox;
CREATE POLICY "comunicacao_outbox_select_admin"
  ON public.comunicacao_outbox FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(),'administrador'));

-- Preferências: usuário só vê/altera as próprias
DROP POLICY IF EXISTS "comunicacao_preferencias_select_own" ON public.comunicacao_preferencias;
CREATE POLICY "comunicacao_preferencias_select_own"
  ON public.comunicacao_preferencias FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());
-- (escrita via RPC única)

-- Audit log: leitura administrador
DROP POLICY IF EXISTS "comunicacao_audit_select_admin" ON public.comunicacao_audit_log;
CREATE POLICY "comunicacao_audit_select_admin"
  ON public.comunicacao_audit_log FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(),'administrador'));

-- -----------------------------------------------------------------------------
-- 8. Helpers internos
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._comunicacao_write_audit(
  _acao text, _entidade text, _entity_id uuid,
  _before jsonb, _after jsonb
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.comunicacao_audit_log(acao, entidade, entity_id, actor_id, before_state, after_state)
  VALUES (_acao, _entidade, _entity_id, auth.uid(), _before, _after);
$$;
REVOKE ALL ON FUNCTION public._comunicacao_write_audit(text,text,uuid,jsonb,jsonb) FROM PUBLIC, anon;

-- -----------------------------------------------------------------------------
-- 9. RPCs: Templates
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_create_communication_template(
  p_chave text, p_nome text, p_canal public.comunicacao_canal,
  p_assunto text, p_corpo text, p_variaveis jsonb DEFAULT '[]'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_versao integer;
BEGIN
  IF NOT public.has_role(auth.uid(),'administrador') THEN
    RAISE EXCEPTION 'apenas administrador pode criar templates' USING ERRCODE = 'insufficient_privilege';
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

  PERFORM public._comunicacao_write_audit('template.create','comunicacao_templates',v_id,NULL,
    jsonb_build_object('chave',p_chave,'canal',p_canal,'versao',v_versao));

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
    RAISE EXCEPTION 'template ativo é imutável; use rpc_create_communication_template para nova versão';
  END IF;
  UPDATE public.comunicacao_templates
     SET nome = p_nome, assunto = p_assunto, corpo = p_corpo,
         variaveis = COALESCE(p_variaveis,'[]'::jsonb), updated_by = auth.uid()
   WHERE id = p_template_id;
  PERFORM public._comunicacao_write_audit('template.update','comunicacao_templates',p_template_id,to_jsonb(r),NULL);
  RETURN jsonb_build_object('ok',true);
END$$;
REVOKE ALL ON FUNCTION public.rpc_update_communication_template(uuid,text,text,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_update_communication_template(uuid,text,text,text,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.rpc_activate_communication_template(p_template_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.comunicacao_templates%rowtype;
BEGIN
  IF NOT public.has_role(auth.uid(),'administrador') THEN
    RAISE EXCEPTION 'apenas administrador' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO r FROM public.comunicacao_templates WHERE id = p_template_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'template não encontrado'; END IF;
  IF r.status = 'archived' THEN RAISE EXCEPTION 'template arquivado'; END IF;

  -- Arquivar versão active anterior (mesma chave/canal)
  UPDATE public.comunicacao_templates
     SET status = 'archived', archived_at = now(), updated_by = auth.uid()
   WHERE chave = r.chave AND canal = r.canal AND status = 'active' AND id <> r.id;

  UPDATE public.comunicacao_templates
     SET status = 'active', updated_by = auth.uid()
   WHERE id = p_template_id;

  PERFORM public._comunicacao_write_audit('template.activate','comunicacao_templates',p_template_id,to_jsonb(r),NULL);
  RETURN jsonb_build_object('ok',true);
END$$;
REVOKE ALL ON FUNCTION public.rpc_activate_communication_template(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_activate_communication_template(uuid) TO authenticated;

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
DECLARE v_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(),'administrador') THEN
    RAISE EXCEPTION 'apenas administrador' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_rule_id IS NULL THEN
    INSERT INTO public.comunicacao_regras(event_key,perfil,estrategia,canal,template_chave,template_versao,
      condicoes,prioridade,enabled,cooldown_seconds,created_by,updated_by)
    VALUES (p_event_key,p_perfil,COALESCE(p_estrategia,'by_role'),p_canal,p_template_chave,p_template_versao,
      COALESCE(p_condicoes,'{}'::jsonb),COALESCE(p_prioridade,100),COALESCE(p_enabled,false),
      COALESCE(p_cooldown_seconds,0),auth.uid(),auth.uid())
    RETURNING id INTO v_id;
    PERFORM public._comunicacao_write_audit('rule.create','comunicacao_regras',v_id,NULL,
      jsonb_build_object('event_key',p_event_key));
  ELSE
    UPDATE public.comunicacao_regras
       SET event_key = p_event_key, perfil = p_perfil, estrategia = COALESCE(p_estrategia,'by_role'),
           canal = p_canal, template_chave = p_template_chave, template_versao = p_template_versao,
           condicoes = COALESCE(p_condicoes,'{}'::jsonb), prioridade = COALESCE(p_prioridade,100),
           enabled = COALESCE(p_enabled,false), cooldown_seconds = COALESCE(p_cooldown_seconds,0),
           updated_by = auth.uid(), updated_at = now()
     WHERE id = p_rule_id
     RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'regra não encontrada'; END IF;
    PERFORM public._comunicacao_write_audit('rule.update','comunicacao_regras',v_id,NULL,NULL);
  END IF;
  RETURN jsonb_build_object('ok',true,'rule_id',v_id);
END$$;
REVOKE ALL ON FUNCTION public.rpc_upsert_communication_rule(uuid,text,public.app_role,text,public.comunicacao_canal,text,integer,jsonb,integer,boolean,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_upsert_communication_rule(uuid,text,public.app_role,text,public.comunicacao_canal,text,integer,jsonb,integer,boolean,integer) TO authenticated;

-- -----------------------------------------------------------------------------
-- 11. RPC: Publicar evento (whitelist estrita de event_keys)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_publish_communication_event(
  p_event_key text, p_source_type text, p_source_id uuid,
  p_payload jsonb, p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'autenticação requerida' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Whitelist rígida Fase 1
  IF p_event_key NOT IN ('produto_pronto_retirada','produto_pronto_aplicacao','administrative_important_update') THEN
    RAISE EXCEPTION 'event_key não permitido nesta fase: %', p_event_key;
  END IF;

  -- Restrições de autorização por evento
  IF p_event_key = 'administrative_important_update' THEN
    IF NOT public.has_role(auth.uid(),'administrador') THEN
      RAISE EXCEPTION 'apenas administrador pode publicar administrative_important_update'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF p_event_key IN ('produto_pronto_retirada','produto_pronto_aplicacao') THEN
    IF p_source_type <> 'ordens_servico' OR p_source_id IS NULL THEN
      RAISE EXCEPTION 'source ordens_servico/id requerido';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.ordens_servico o
       WHERE o.id = p_source_id
         AND o.status IN ('pronto_entrega','entregue')
    ) THEN
      RAISE EXCEPTION 'ordem_servico inválida para este evento';
    END IF;
    IF NOT (public.has_role(auth.uid(),'administrador')
         OR public.has_role(auth.uid(),'gestor')
         OR public.has_role(auth.uid(),'producao')
         OR public.has_role(auth.uid(),'administrativo')) THEN
      RAISE EXCEPTION 'perfil sem autorização para publicar este evento'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  IF jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'payload deve ser objeto JSON';
  END IF;

  INSERT INTO public.comunicacao_eventos(event_key,source_type,source_id,payload,created_by,idempotency_key)
  VALUES (p_event_key,p_source_type,p_source_id,p_payload,auth.uid(),p_idempotency_key)
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.comunicacao_eventos WHERE idempotency_key = p_idempotency_key;
    RETURN jsonb_build_object('ok',true,'event_id',v_id,'duplicated',true);
  END IF;

  PERFORM public._comunicacao_write_audit('event.publish','comunicacao_eventos',v_id,NULL,
    jsonb_build_object('event_key',p_event_key));

  RETURN jsonb_build_object('ok',true,'event_id',v_id,'duplicated',false);
END$$;
REVOKE ALL ON FUNCTION public.rpc_publish_communication_event(text,text,uuid,jsonb,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_publish_communication_event(text,text,uuid,jsonb,text) TO authenticated;

-- -----------------------------------------------------------------------------
-- 12. RPC: Preferências
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_update_communication_preferences(
  p_canal public.comunicacao_canal, p_enabled boolean,
  p_email_verificado boolean, p_telefone_verificado boolean,
  p_whatsapp_opt_in boolean
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'autenticação requerida' USING ERRCODE = 'insufficient_privilege';
  END IF;
  INSERT INTO public.comunicacao_preferencias(user_id, canal, enabled,
      email_verificado, telefone_verificado,
      whatsapp_opt_in_at, whatsapp_opt_out_at, source)
  VALUES (v_uid, p_canal, COALESCE(p_enabled,true),
      COALESCE(p_email_verificado,false), COALESCE(p_telefone_verificado,false),
      CASE WHEN p_whatsapp_opt_in IS TRUE THEN now() END,
      CASE WHEN p_whatsapp_opt_in IS FALSE THEN now() END,
      'user')
  ON CONFLICT (user_id, canal) WHERE user_id IS NOT NULL DO UPDATE
    SET enabled = EXCLUDED.enabled,
        email_verificado = EXCLUDED.email_verificado,
        telefone_verificado = EXCLUDED.telefone_verificado,
        whatsapp_opt_in_at  = COALESCE(EXCLUDED.whatsapp_opt_in_at, public.comunicacao_preferencias.whatsapp_opt_in_at),
        whatsapp_opt_out_at = COALESCE(EXCLUDED.whatsapp_opt_out_at, public.comunicacao_preferencias.whatsapp_opt_out_at),
        updated_at = now();
  RETURN jsonb_build_object('ok',true);
END$$;
REVOKE ALL ON FUNCTION public.rpc_update_communication_preferences(public.comunicacao_canal,boolean,boolean,boolean,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_update_communication_preferences(public.comunicacao_canal,boolean,boolean,boolean,boolean) TO authenticated;

-- -----------------------------------------------------------------------------
-- 13. Worker RPCs (service_role only)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_claim_communication_outbox(
  p_batch_size integer, p_worker_id text, p_lease_seconds integer DEFAULT 60
) RETURNS SETOF public.comunicacao_outbox
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ids uuid[];
BEGIN
  IF current_user <> 'service_role' AND NOT (current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role' THEN
    -- Permitir apenas via service_role: em Postgres, function é dona; validamos via GRANT
    NULL;
  END IF;

  WITH cte AS (
    SELECT id
      FROM public.comunicacao_outbox
     WHERE status = 'pending'
       AND next_attempt_at <= now()
     ORDER BY next_attempt_at ASC
     LIMIT GREATEST(1, LEAST(COALESCE(p_batch_size,10), 100))
     FOR UPDATE SKIP LOCKED
  )
  UPDATE public.comunicacao_outbox o
     SET status = 'processing',
         locked_at = now(),
         locked_by = COALESCE(p_worker_id,'unknown'),
         attempts = o.attempts + 1
   FROM cte
   WHERE o.id = cte.id
   RETURNING o.id INTO v_ids;

  RETURN QUERY SELECT * FROM public.comunicacao_outbox WHERE id = ANY(v_ids);
END$$;
REVOKE ALL ON FUNCTION public.rpc_claim_communication_outbox(integer,text,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_claim_communication_outbox(integer,text,integer) TO service_role;

CREATE OR REPLACE FUNCTION public.rpc_complete_communication_delivery(
  p_outbox_id uuid, p_provider_message_id text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.comunicacao_outbox
     SET status = 'sent',
         sent_at = now(),
         provider_message_id = p_provider_message_id,
         locked_at = NULL, locked_by = NULL
   WHERE id = p_outbox_id AND status = 'processing';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'outbox não estava em processing';
  END IF;
  RETURN jsonb_build_object('ok',true);
END$$;
REVOKE ALL ON FUNCTION public.rpc_complete_communication_delivery(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_complete_communication_delivery(uuid,text) TO service_role;

CREATE OR REPLACE FUNCTION public.rpc_fail_communication_delivery(
  p_outbox_id uuid, p_error_code text, p_error_message text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.comunicacao_outbox%rowtype; v_backoff int;
BEGIN
  SELECT * INTO r FROM public.comunicacao_outbox WHERE id = p_outbox_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'outbox não encontrado'; END IF;
  IF r.status <> 'processing' THEN RAISE EXCEPTION 'outbox não estava em processing'; END IF;

  IF r.attempts >= r.max_attempts THEN
    UPDATE public.comunicacao_outbox
       SET status = 'dead_letter', error_code = p_error_code,
           error_message = left(COALESCE(p_error_message,''),2000),
           locked_at = NULL, locked_by = NULL
     WHERE id = p_outbox_id;
    RETURN jsonb_build_object('ok',true,'status','dead_letter');
  END IF;

  v_backoff := LEAST(3600, POWER(2, r.attempts)::int * 30);
  UPDATE public.comunicacao_outbox
     SET status = 'pending',
         next_attempt_at = now() + make_interval(secs => v_backoff),
         error_code = p_error_code,
         error_message = left(COALESCE(p_error_message,''),2000),
         locked_at = NULL, locked_by = NULL
   WHERE id = p_outbox_id;
  RETURN jsonb_build_object('ok',true,'status','pending','retry_in_seconds',v_backoff);
END$$;
REVOKE ALL ON FUNCTION public.rpc_fail_communication_delivery(uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_fail_communication_delivery(uuid,text,text) TO service_role;

COMMIT;

-- =============================================================================
-- Fim da migration Fase 1 (proposta)
-- =============================================================================
