-- =============================================================================
-- Comunicação — Fase 2 · Adapters e trigger de OS (PROPOSTA — v1)
-- Arquivo: restoration/comunicacao-fase2/migration.sql
-- Estado: NÃO APLICADO. Aplicar apenas em staging após Fase 1 aplicada.
--
-- Estritamente aditivo sobre Fase 1 v3. Não altera assinaturas existentes.
-- Todas as novas RPCs seguem o padrão: search_path=public, SECURITY DEFINER,
-- REVOKE anon, grants mínimos. Nenhum caminho novo é executável por
-- authenticated exceto UI de admin/gestor (com has_role/RLS).
--
-- Fatos comprovados no schema (auditados sobre migrations existentes):
--   • profiles.user_id é o identificador de usuário (profiles.id é PK interno).
--   • profiles.telefone (text) — não há coluna whatsapp/celular dedicada.
--   • clientes.telefone (text), clientes.telefones (text[]), clientes.email.
--   • ordens_servico.status enum status_os: valor exato 'pronto_entrega'.
--   • ordens_servico_onfarm.status enum status_os_onfarm: mesmo valor.
--   • portal_notificacoes sem policy de INSERT p/ authenticated → uso via
--     função SECURITY DEFINER.
--   • notificacoes_operacionais tem INSERT WITH CHECK (true) mas o adapter
--     encapsula via RPC dedicada para auditoria consistente e minimização.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Metadados de canal em comunicacao_templates (aditivo)
-- -----------------------------------------------------------------------------
-- Não altera constraints já existentes na Fase 1 (assunto continua opcional
-- por schema). O reforço "email exige assunto" é aplicado por CHECK adicional
-- e revalidado nas RPCs de metadados.
ALTER TABLE public.comunicacao_templates
  ADD COLUMN IF NOT EXISTS provider_template_name text,
  ADD COLUMN IF NOT EXISTS language_code          text,
  ADD COLUMN IF NOT EXISTS parameter_mapping      jsonb NOT NULL DEFAULT '[]'::jsonb;

-- CHECKs (idempotentes). Aplicam apenas se ainda não existirem.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'comunicacao_templates_email_assunto_chk'
  ) THEN
    ALTER TABLE public.comunicacao_templates
      ADD CONSTRAINT comunicacao_templates_email_assunto_chk
      CHECK (canal <> 'email' OR (assunto IS NOT NULL AND length(assunto) BETWEEN 1 AND 300));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'comunicacao_templates_whatsapp_meta_chk'
  ) THEN
    ALTER TABLE public.comunicacao_templates
      ADD CONSTRAINT comunicacao_templates_whatsapp_meta_chk
      CHECK (
        canal <> 'whatsapp' OR (
          provider_template_name IS NOT NULL
          AND length(provider_template_name) BETWEEN 1 AND 512
          AND language_code IS NOT NULL
          AND language_code ~ '^[a-z]{2}(_[A-Z]{2})?$'
          AND jsonb_typeof(parameter_mapping) = 'array'
          AND jsonb_array_length(parameter_mapping) <= 64
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'comunicacao_templates_non_whatsapp_meta_chk'
  ) THEN
    -- Canais não-whatsapp não devem carregar metadados de provedor de WA.
    ALTER TABLE public.comunicacao_templates
      ADD CONSTRAINT comunicacao_templates_non_whatsapp_meta_chk
      CHECK (
        canal = 'whatsapp' OR (
          provider_template_name IS NULL AND language_code IS NULL
          AND jsonb_array_length(COALESCE(parameter_mapping,'[]'::jsonb)) = 0
        )
      );
  END IF;
END$$;

-- -----------------------------------------------------------------------------
-- 2. RPC: definir metadados de template (mantém Fase 1 imutável)
-- -----------------------------------------------------------------------------
-- Metadados são MUTÁVEIS mesmo em templates 'active' (não afetam corpo/assunto).
-- Mudança é auditada. Validação estrita por canal.
CREATE OR REPLACE FUNCTION public.rpc_set_communication_template_metadata(
  p_template_id           uuid,
  p_provider_template_name text,
  p_language_code          text,
  p_parameter_mapping      jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.comunicacao_templates%rowtype;
BEGIN
  IF NOT public.has_role(auth.uid(),'administrador') THEN
    RAISE EXCEPTION 'apenas administrador' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO r FROM public.comunicacao_templates WHERE id = p_template_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'template não encontrado'; END IF;

  IF r.canal = 'whatsapp' THEN
    IF p_provider_template_name IS NULL OR length(p_provider_template_name) = 0 THEN
      RAISE EXCEPTION 'whatsapp: provider_template_name obrigatório';
    END IF;
    IF p_language_code IS NULL OR p_language_code !~ '^[a-z]{2}(_[A-Z]{2})?$' THEN
      RAISE EXCEPTION 'whatsapp: language_code inválido (BCP47 curto, ex.: pt_BR)';
    END IF;
    IF jsonb_typeof(COALESCE(p_parameter_mapping,'[]'::jsonb)) <> 'array' THEN
      RAISE EXCEPTION 'whatsapp: parameter_mapping deve ser array';
    END IF;
    IF jsonb_array_length(COALESCE(p_parameter_mapping,'[]'::jsonb)) > 64 THEN
      RAISE EXCEPTION 'whatsapp: parameter_mapping excede 64 itens';
    END IF;
  ELSE
    IF p_provider_template_name IS NOT NULL OR p_language_code IS NOT NULL
       OR jsonb_array_length(COALESCE(p_parameter_mapping,'[]'::jsonb)) > 0 THEN
      RAISE EXCEPTION 'metadados de whatsapp não são aceitos para canal %', r.canal;
    END IF;
  END IF;

  UPDATE public.comunicacao_templates
     SET provider_template_name = p_provider_template_name,
         language_code = p_language_code,
         parameter_mapping = COALESCE(p_parameter_mapping,'[]'::jsonb),
         updated_by = auth.uid()
   WHERE id = p_template_id;

  PERFORM public._comunicacao_write_audit(
    'template.set_metadata','comunicacao_templates', p_template_id,
    to_jsonb(r),
    (SELECT to_jsonb(t) FROM public.comunicacao_templates t WHERE t.id = p_template_id));
  RETURN jsonb_build_object('ok',true);
END$$;
REVOKE ALL ON FUNCTION public.rpc_set_communication_template_metadata(uuid,text,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_set_communication_template_metadata(uuid,text,text,jsonb) TO authenticated;

-- -----------------------------------------------------------------------------
-- 3. Publicação a partir de trigger/sistema (não passa pelo gate "admin")
-- -----------------------------------------------------------------------------
-- Extrai a lógica de expansão em função interna reutilizável. Mantemos
-- rpc_publish_communication_event como está (mudança seria breaking).
-- A função interna é chamada tanto pela trigger de OS quanto por qualquer
-- outro caminho controlado por SECURITY DEFINER.
CREATE OR REPLACE FUNCTION public._comunicacao_expand_event(
  _event_id uuid, _event_key text, _source_id uuid, _payload jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_rule public.comunicacao_regras%rowtype;
  v_tpl  public.comunicacao_templates%rowtype;
  v_rec  record;
  v_snapshot jsonb;
  v_payload_snapshot jsonb;
  v_idem_out text;
  v_enq int := 0;
  v_skp int := 0;
  v_row int := 0;
  v_target_role public.app_role;
BEGIN
  IF _event_key = 'administrative_important_update' THEN
    BEGIN
      v_target_role := (_payload ->> 'target_role')::public.app_role;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'target_role inválido: %', _payload ->> 'target_role';
    END;
  END IF;

  FOR v_rule IN
    SELECT * FROM public.comunicacao_regras
     WHERE event_key = _event_key
       AND enabled = true
       AND (
         _event_key <> 'administrative_important_update'
         OR (estrategia = 'broadcast_role' AND perfil = v_target_role)
       )
     ORDER BY prioridade ASC
  LOOP
    v_tpl := public._comunicacao_resolve_template(v_rule.template_chave, v_rule.canal, v_rule.template_versao);
    IF v_tpl.id IS NULL OR v_tpl.canal <> v_rule.canal THEN
      v_skp := v_skp + 1; CONTINUE;
    END IF;

    v_snapshot := jsonb_build_object(
      'assunto', v_tpl.assunto,
      'corpo',   v_tpl.corpo,
      'variaveis', v_tpl.variaveis,
      'canal',   v_tpl.canal,
      'locale',  v_tpl.locale,
      -- metadados de canal viajam no snapshot (imutáveis por outbox_id)
      'provider_template_name', v_tpl.provider_template_name,
      'language_code',          v_tpl.language_code,
      'parameter_mapping',      v_tpl.parameter_mapping
    );

    FOR v_rec IN
      SELECT * FROM public._comunicacao_resolve_recipients(_event_key, v_rule, _source_id)
    LOOP
      IF NOT public._comunicacao_can_deliver(v_rec.recipient_user_id, v_rec.recipient_cliente_id, v_rule.canal) THEN
        v_skp := v_skp + 1; CONTINUE;
      END IF;

      v_payload_snapshot := public._comunicacao_build_snapshot(
        _event_key, _source_id, _payload,
        v_rec.recipient_user_id, v_rec.recipient_cliente_id
      );

      v_idem_out := encode(digest(
        concat_ws('|', _event_id::text, v_rule.id::text, v_tpl.id::text,
                  COALESCE(v_rec.recipient_user_id::text,''),
                  COALESCE(v_rec.recipient_cliente_id::text,'')),
        'sha256'), 'hex');

      INSERT INTO public.comunicacao_outbox(
        event_id, rule_id, template_id, template_chave, template_versao,
        template_snapshot, canal, recipient_user_id, recipient_cliente_id,
        payload_snapshot, idempotency_key)
      VALUES (
        _event_id, v_rule.id, v_tpl.id, v_tpl.chave, v_tpl.versao,
        v_snapshot, v_rule.canal, v_rec.recipient_user_id, v_rec.recipient_cliente_id,
        v_payload_snapshot, v_idem_out)
      ON CONFLICT (idempotency_key) DO NOTHING;

      GET DIAGNOSTICS v_row = ROW_COUNT;
      IF v_row = 1 THEN v_enq := v_enq + 1; ELSE v_skp := v_skp + 1; END IF;
    END LOOP;
  END LOOP;

  UPDATE public.comunicacao_eventos
     SET status = 'processed', processed_at = now(),
         outbox_enqueued = v_enq, outbox_skipped = v_skp
   WHERE id = _event_id;

  RETURN jsonb_build_object('enqueued', v_enq, 'skipped', v_skp);
END$$;
REVOKE ALL ON FUNCTION public._comunicacao_expand_event(uuid,text,uuid,jsonb) FROM PUBLIC, anon, authenticated;

-- Publicação por sistema (sem gate de administrador). Uso restrito a
-- triggers/edge functions internas. NÃO CHAMÁVEL por authenticated.
CREATE OR REPLACE FUNCTION public._comunicacao_publish_system_event(
  _event_key text, _source_type text, _source_id uuid,
  _payload jsonb, _idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_event_id uuid; v_expand jsonb;
BEGIN
  IF _event_key NOT IN ('produto_pronto_retirada') THEN
    RAISE EXCEPTION 'evento não permitido para caminho sistema: %', _event_key;
  END IF;
  IF _idempotency_key IS NULL OR length(_idempotency_key) < 8 THEN
    RAISE EXCEPTION 'idempotency_key inválido';
  END IF;

  INSERT INTO public.comunicacao_eventos(event_key,source_type,source_id,payload,created_by,idempotency_key)
  VALUES (_event_key,_source_type,_source_id,COALESCE(_payload,'{}'::jsonb),NULL,_idempotency_key)
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_event_id;

  IF v_event_id IS NULL THEN
    SELECT id INTO v_event_id FROM public.comunicacao_eventos WHERE idempotency_key = _idempotency_key;
    RETURN jsonb_build_object('ok',true,'event_id',v_event_id,'duplicated',true);
  END IF;

  v_expand := public._comunicacao_expand_event(v_event_id, _event_key, _source_id, COALESCE(_payload,'{}'::jsonb));

  PERFORM public._comunicacao_write_audit(
    'event.publish.system','comunicacao_eventos', v_event_id, NULL,
    jsonb_build_object('event_key',_event_key,'expand',v_expand));

  RETURN jsonb_build_object(
    'ok',true,'event_id',v_event_id,'duplicated',false,
    'enqueued', v_expand->'enqueued','skipped', v_expand->'skipped');
END$$;
REVOKE ALL ON FUNCTION public._comunicacao_publish_system_event(text,text,uuid,jsonb,text) FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 4. Trigger: transição real ordens_servico.status → 'pronto_entrega'
-- -----------------------------------------------------------------------------
-- Dispara apenas quando status muda de valor DIFERENTE para 'pronto_entrega'.
-- Idempotência 100% por OS: mesmo se o gatilho re-executar, a idempotency_key
-- é per-OS e ON CONFLICT DO NOTHING protege eventos e outbox.
-- Nenhum dado do payload do UPDATE é considerado — tudo é derivado do banco.
CREATE OR REPLACE FUNCTION public._comunicacao_trg_os_pronto_retirada()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_idem text;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status = 'pronto_entrega'::public.status_os THEN
    v_idem := 'os_pronto_retirada:ordens_servico:' || NEW.id::text;
    PERFORM public._comunicacao_publish_system_event(
      'produto_pronto_retirada','ordens_servico', NEW.id,
      '{}'::jsonb, v_idem);
  END IF;
  RETURN NEW;
END$$;
REVOKE ALL ON FUNCTION public._comunicacao_trg_os_pronto_retirada() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._comunicacao_trg_os_onfarm_pronto_retirada()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_idem text;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status = 'pronto_entrega'::public.status_os_onfarm THEN
    v_idem := 'os_pronto_retirada:ordens_servico_onfarm:' || NEW.id::text;
    PERFORM public._comunicacao_publish_system_event(
      'produto_pronto_retirada','ordens_servico_onfarm', NEW.id,
      '{}'::jsonb, v_idem);
  END IF;
  RETURN NEW;
END$$;
REVOKE ALL ON FUNCTION public._comunicacao_trg_os_onfarm_pronto_retirada() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_comunicacao_os_pronto_retirada ON public.ordens_servico;
CREATE TRIGGER trg_comunicacao_os_pronto_retirada
  AFTER UPDATE OF status ON public.ordens_servico
  FOR EACH ROW
  WHEN (NEW.status IS DISTINCT FROM OLD.status)
  EXECUTE FUNCTION public._comunicacao_trg_os_pronto_retirada();

DROP TRIGGER IF EXISTS trg_comunicacao_os_onfarm_pronto_retirada ON public.ordens_servico_onfarm;
CREATE TRIGGER trg_comunicacao_os_onfarm_pronto_retirada
  AFTER UPDATE OF status ON public.ordens_servico_onfarm
  FOR EACH ROW
  WHEN (NEW.status IS DISTINCT FROM OLD.status)
  EXECUTE FUNCTION public._comunicacao_trg_os_onfarm_pronto_retirada();

-- Nota: build_snapshot lê ordens_servico direto; para ordens_servico_onfarm,
-- as colunas numero_os/data_programada equivalem em nome (ambas as tabelas).
-- Amplia _comunicacao_build_snapshot para escolher a tabela pelo source_type.
CREATE OR REPLACE FUNCTION public._comunicacao_build_snapshot(
  _event_key text, _source_id uuid, _payload jsonb,
  _user_id uuid, _cliente_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_codigo_os text; v_data_prevista text;
  v_nome_dest text; v_titulo text; v_mensagem text; v_target_role text;
BEGIN
  IF _user_id IS NOT NULL THEN
    SELECT nome INTO v_nome_dest FROM public.profiles WHERE user_id = _user_id LIMIT 1;
  ELSIF _cliente_id IS NOT NULL THEN
    SELECT nome INTO v_nome_dest FROM public.clientes WHERE id = _cliente_id LIMIT 1;
  END IF;

  IF _event_key IN ('produto_pronto_retirada','produto_pronto_aplicacao') THEN
    -- Tenta ambas as tabelas (source_id é único por tabela; UNION resolve).
    SELECT numero_os, to_char(data_programada,'DD/MM/YYYY')
      INTO v_codigo_os, v_data_prevista
      FROM (
        SELECT numero_os, data_programada FROM public.ordens_servico WHERE id = _source_id
        UNION ALL
        SELECT numero_os, data_programada FROM public.ordens_servico_onfarm WHERE id = _source_id
      ) x LIMIT 1;
    RETURN jsonb_build_object(
      'nome_destinatario', COALESCE(v_nome_dest,''),
      'codigo_os',         COALESCE(v_codigo_os,''),
      'data_prevista',     COALESCE(v_data_prevista,'')
    );
  END IF;

  IF _event_key = 'administrative_important_update' THEN
    v_titulo    := left(COALESCE(_payload ->> 'titulo',''), 200);
    v_mensagem  := left(COALESCE(_payload ->> 'mensagem',''), 2000);
    v_target_role := _payload ->> 'target_role';
    RETURN jsonb_build_object(
      'nome_destinatario', COALESCE(v_nome_dest,''),
      'titulo',            v_titulo,
      'mensagem',          v_mensagem,
      'target_role',       COALESCE(v_target_role,'')
    );
  END IF;

  RETURN '{}'::jsonb;
END$$;
REVOKE ALL ON FUNCTION public._comunicacao_build_snapshot(text,uuid,jsonb,uuid,uuid) FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 5. RPC: preview server-side de contagem para administrative_important_update
-- -----------------------------------------------------------------------------
-- Retorna número estimado de destinatários por canal, considerando regras
-- ativas + preferências. Uso exclusivo de admin/gestor na UI de Comunicados.
CREATE OR REPLACE FUNCTION public.rpc_preview_administrative_broadcast_count(
  p_target_role public.app_role
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_total_users int := 0;
  v_by_canal jsonb := '{}'::jsonb;
  v_rule record;
BEGIN
  IF NOT (public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'gestor')) THEN
    RAISE EXCEPTION 'apenas administrador ou gestor' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_target_role IS NULL THEN
    RAISE EXCEPTION 'target_role obrigatório';
  END IF;

  SELECT count(DISTINCT pr.user_id) INTO v_total_users
    FROM public.user_roles ur
    JOIN public.profiles pr ON pr.user_id = ur.user_id
   WHERE ur.role = p_target_role
     AND COALESCE(pr.ativo,true) = true;

  FOR v_rule IN
    SELECT canal, count(DISTINCT pr.user_id) AS n
      FROM public.comunicacao_regras r
      JOIN public.user_roles ur ON ur.role = r.perfil
      JOIN public.profiles   pr ON pr.user_id = ur.user_id
     WHERE r.event_key = 'administrative_important_update'
       AND r.enabled = true
       AND r.estrategia = 'broadcast_role'
       AND r.perfil = p_target_role
       AND COALESCE(pr.ativo,true) = true
       AND public._comunicacao_can_deliver(pr.user_id, NULL, r.canal)
     GROUP BY canal
  LOOP
    v_by_canal := v_by_canal || jsonb_build_object(v_rule.canal::text, v_rule.n);
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'target_role', p_target_role,
    'total_users_in_role', v_total_users,
    'estimated_recipients_by_canal', v_by_canal
  );
END$$;
REVOKE ALL ON FUNCTION public.rpc_preview_administrative_broadcast_count(public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_preview_administrative_broadcast_count(public.app_role) TO authenticated;

-- -----------------------------------------------------------------------------
-- 6. RPC: resolução de endereço no momento do envio (service_role only)
-- -----------------------------------------------------------------------------
-- Chamada pelo worker antes do adapter enviar. Revalida can_deliver
-- (opt-in/verificação/opt-out), normaliza address (email lower, phone E.164)
-- e retorna:
--   { ok:true, canal, address, address_hash, redacted, user_id, cliente_id }
-- ou { ok:false, outcome: 'skipped'|'cancelled', reason }
-- Nunca vaza o endereço em log — o worker deve tratar como PII.
CREATE OR REPLACE FUNCTION public.rpc_resolve_outbox_address(p_outbox_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r public.comunicacao_outbox%rowtype;
  v_role text; v_email text; v_phone_raw text; v_phone text; v_ok boolean;
  v_hash text; v_redacted text;
BEGIN
  v_role := COALESCE(current_setting('request.jwt.claims', true)::jsonb ->> 'role', session_user);
  IF v_role IS NOT NULL AND v_role NOT IN ('service_role') AND current_user <> 'service_role' THEN
    RAISE EXCEPTION 'apenas service_role' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO r FROM public.comunicacao_outbox WHERE id = p_outbox_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'outbox não encontrado'; END IF;
  IF r.status NOT IN ('processing') THEN
    RETURN jsonb_build_object('ok',false,'outcome','skipped','reason','not_processing');
  END IF;

  -- Revalida preferência/opt-in/verificação no momento do envio.
  v_ok := public._comunicacao_can_deliver(r.recipient_user_id, r.recipient_cliente_id, r.canal);
  IF NOT v_ok THEN
    RETURN jsonb_build_object('ok',false,'outcome','skipped','reason','opt_out_or_unverified');
  END IF;

  -- in_app não precisa de address externo. Retorna alvo interno.
  IF r.canal = 'in_app' THEN
    RETURN jsonb_build_object(
      'ok',true,'canal','in_app',
      'user_id', r.recipient_user_id,
      'cliente_id', r.recipient_cliente_id
    );
  END IF;

  IF r.canal = 'email' THEN
    IF r.recipient_user_id IS NOT NULL THEN
      SELECT lower(nullif(trim(email),'')) INTO v_email FROM public.profiles WHERE user_id = r.recipient_user_id;
    ELSE
      SELECT lower(nullif(trim(email),'')) INTO v_email FROM public.clientes  WHERE id = r.recipient_cliente_id;
    END IF;
    IF v_email IS NULL OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
      RETURN jsonb_build_object('ok',false,'outcome','cancelled','reason','invalid_email');
    END IF;
    v_hash := encode(digest(v_email,'sha256'),'hex');
    v_redacted := left(split_part(v_email,'@',1),2) || '***@' || split_part(v_email,'@',2);
    RETURN jsonb_build_object(
      'ok',true,'canal','email','address',v_email,'address_hash',v_hash,'redacted',v_redacted,
      'user_id', r.recipient_user_id, 'cliente_id', r.recipient_cliente_id);
  END IF;

  IF r.canal = 'whatsapp' THEN
    IF r.recipient_user_id IS NOT NULL THEN
      SELECT telefone INTO v_phone_raw FROM public.profiles WHERE user_id = r.recipient_user_id;
    ELSE
      SELECT COALESCE(telefone, (telefones)[1]) INTO v_phone_raw
        FROM public.clientes WHERE id = r.recipient_cliente_id;
    END IF;
    v_phone_raw := regexp_replace(COALESCE(v_phone_raw,''), '[^0-9]', '', 'g');
    -- Aceita 10-11 dígitos BR (adiciona 55) ou já com DDI 12-13 dígitos.
    IF length(v_phone_raw) IN (10,11) THEN
      v_phone := '+55' || v_phone_raw;
    ELSIF length(v_phone_raw) BETWEEN 12 AND 15 THEN
      v_phone := '+' || v_phone_raw;
    ELSE
      RETURN jsonb_build_object('ok',false,'outcome','cancelled','reason','invalid_phone');
    END IF;
    v_hash := encode(digest(v_phone,'sha256'),'hex');
    v_redacted := left(v_phone,4) || repeat('*', GREATEST(0, length(v_phone)-6)) || right(v_phone,2);
    RETURN jsonb_build_object(
      'ok',true,'canal','whatsapp','address',v_phone,'address_hash',v_hash,'redacted',v_redacted,
      'user_id', r.recipient_user_id, 'cliente_id', r.recipient_cliente_id);
  END IF;

  RETURN jsonb_build_object('ok',false,'outcome','cancelled','reason','unsupported_canal');
END$$;
REVOKE ALL ON FUNCTION public.rpc_resolve_outbox_address(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_resolve_outbox_address(uuid) TO service_role;

-- -----------------------------------------------------------------------------
-- 7. RPCs: skip e cancel (novos terminadores; complementam sent/fail)
-- -----------------------------------------------------------------------------
-- skip: item pulado por opt-out/preferência (não-erro; não conta como tentativa
--        malsucedida do provedor). Terminal.
-- cancel: item cancelado permanentemente (endereço inválido, template inválido,
--         config faltante em produção). Terminal.
CREATE OR REPLACE FUNCTION public.rpc_skip_communication_delivery(
  p_outbox_id uuid, p_worker_id text, p_reason text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.comunicacao_outbox%rowtype; v_role text;
BEGIN
  v_role := COALESCE(current_setting('request.jwt.claims', true)::jsonb ->> 'role', session_user);
  IF v_role IS NOT NULL AND v_role NOT IN ('service_role') AND current_user <> 'service_role' THEN
    RAISE EXCEPTION 'apenas service_role' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NULLIF(trim(COALESCE(p_worker_id,'')),'') IS NULL THEN
    RAISE EXCEPTION 'worker_id obrigatório';
  END IF;
  SELECT * INTO r FROM public.comunicacao_outbox WHERE id = p_outbox_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'outbox não encontrado'; END IF;
  IF r.status <> 'processing' THEN
    RAISE EXCEPTION 'outbox não estava em processing (status=%)', r.status;
  END IF;
  IF r.locked_by IS DISTINCT FROM p_worker_id THEN
    RAISE EXCEPTION 'lease pertence a outro worker';
  END IF;
  UPDATE public.comunicacao_outbox
     SET status = 'skipped', error_code = 'skipped',
         error_message = left(COALESCE(p_reason,''), 2000),
         locked_at = NULL, locked_by = NULL, lease_expires_at = NULL
   WHERE id = p_outbox_id;
  RETURN jsonb_build_object('ok',true,'status','skipped');
END$$;
REVOKE ALL ON FUNCTION public.rpc_skip_communication_delivery(uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_skip_communication_delivery(uuid,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.rpc_cancel_communication_delivery(
  p_outbox_id uuid, p_worker_id text, p_reason text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.comunicacao_outbox%rowtype; v_role text;
BEGIN
  v_role := COALESCE(current_setting('request.jwt.claims', true)::jsonb ->> 'role', session_user);
  IF v_role IS NOT NULL AND v_role NOT IN ('service_role') AND current_user <> 'service_role' THEN
    RAISE EXCEPTION 'apenas service_role' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NULLIF(trim(COALESCE(p_worker_id,'')),'') IS NULL THEN
    RAISE EXCEPTION 'worker_id obrigatório';
  END IF;
  SELECT * INTO r FROM public.comunicacao_outbox WHERE id = p_outbox_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'outbox não encontrado'; END IF;
  IF r.status <> 'processing' THEN
    RAISE EXCEPTION 'outbox não estava em processing (status=%)', r.status;
  END IF;
  IF r.locked_by IS DISTINCT FROM p_worker_id THEN
    RAISE EXCEPTION 'lease pertence a outro worker';
  END IF;
  UPDATE public.comunicacao_outbox
     SET status = 'cancelled', error_code = 'cancelled',
         error_message = left(COALESCE(p_reason,''), 2000),
         locked_at = NULL, locked_by = NULL, lease_expires_at = NULL
   WHERE id = p_outbox_id;
  RETURN jsonb_build_object('ok',true,'status','cancelled');
END$$;
REVOKE ALL ON FUNCTION public.rpc_cancel_communication_delivery(uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_cancel_communication_delivery(uuid,text,text) TO service_role;

-- -----------------------------------------------------------------------------
-- 8. RPCs de escrita in_app (encapsulam inserts diretos)
-- -----------------------------------------------------------------------------
-- portal_notificacoes: NÃO tem policy de INSERT para authenticated. Precisa
-- ser inserida via SECURITY DEFINER. Restrita a service_role.
CREATE OR REPLACE FUNCTION public.rpc_create_portal_notification_secure(
  p_cliente_id uuid, p_titulo text, p_mensagem text, p_tipo text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_role text; v_id uuid; v_tipo public.tipo_notificacao_portal;
BEGIN
  v_role := COALESCE(current_setting('request.jwt.claims', true)::jsonb ->> 'role', session_user);
  IF v_role IS NOT NULL AND v_role NOT IN ('service_role') AND current_user <> 'service_role' THEN
    RAISE EXCEPTION 'apenas service_role' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_cliente_id IS NULL THEN RAISE EXCEPTION 'cliente_id obrigatório'; END IF;
  IF p_titulo IS NULL OR length(trim(p_titulo)) = 0 THEN RAISE EXCEPTION 'titulo obrigatório'; END IF;
  IF length(p_titulo) > 200 THEN RAISE EXCEPTION 'titulo excede 200'; END IF;
  IF p_mensagem IS NOT NULL AND length(p_mensagem) > 4000 THEN RAISE EXCEPTION 'mensagem excede 4000'; END IF;
  BEGIN
    v_tipo := COALESCE(p_tipo,'informativo')::public.tipo_notificacao_portal;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'tipo inválido: %', p_tipo;
  END;
  INSERT INTO public.portal_notificacoes(cliente_id, titulo, mensagem, tipo)
  VALUES (p_cliente_id, p_titulo, p_mensagem, v_tipo)
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok',true,'notification_id',v_id);
END$$;
REVOKE ALL ON FUNCTION public.rpc_create_portal_notification_secure(uuid,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_create_portal_notification_secure(uuid,text,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.rpc_create_operational_notification_secure(
  p_usuario_id uuid, p_titulo text, p_mensagem text, p_tipo text, p_link text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_role text; v_id uuid;
BEGIN
  v_role := COALESCE(current_setting('request.jwt.claims', true)::jsonb ->> 'role', session_user);
  IF v_role IS NOT NULL AND v_role NOT IN ('service_role') AND current_user <> 'service_role' THEN
    RAISE EXCEPTION 'apenas service_role' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_usuario_id IS NULL THEN RAISE EXCEPTION 'usuario_id obrigatório'; END IF;
  IF p_titulo IS NULL OR length(trim(p_titulo)) = 0 THEN RAISE EXCEPTION 'titulo obrigatório'; END IF;
  IF length(p_titulo) > 200 THEN RAISE EXCEPTION 'titulo excede 200'; END IF;
  IF p_mensagem IS NOT NULL AND length(p_mensagem) > 4000 THEN RAISE EXCEPTION 'mensagem excede 4000'; END IF;
  IF p_link IS NOT NULL AND length(p_link) > 500 THEN RAISE EXCEPTION 'link excede 500'; END IF;
  IF p_tipo IS NULL OR length(p_tipo) > 60 THEN RAISE EXCEPTION 'tipo obrigatório (<=60)'; END IF;
  INSERT INTO public.notificacoes_operacionais(usuario_id, tipo, titulo, mensagem, link)
  VALUES (p_usuario_id, p_tipo, p_titulo, p_mensagem, p_link)
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok',true,'notification_id',v_id);
END$$;
REVOKE ALL ON FUNCTION public.rpc_create_operational_notification_secure(uuid,text,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_create_operational_notification_secure(uuid,text,text,text,text) TO service_role;

COMMIT;

-- =============================================================================
-- Fim da migration Fase 2 (proposta) — NÃO APLICADA.
-- =============================================================================
