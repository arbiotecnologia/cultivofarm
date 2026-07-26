-- =============================================================================
-- Comunicação — Fase 2 · Adapters, triggers e RPCs (PROPOSTA — v2 corretiva)
-- Arquivo: restoration/comunicacao-fase2/migration.sql
-- Estado: NÃO APLICADO. Aplicar apenas em staging após Fase 1 v3 aplicada.
--
-- Correções v2 aplicadas sobre v1:
--   1. Constraints de metadados/assunto agora só disparam quando status='active'
--      (drafts incompletos são permitidos e editáveis). Ativação valida tudo
--      via _comunicacao_validate_active_template + trigger dedicado.
--   2. Helpers *_v2 source-aware para on-farm: dispatch por CASE em allowlist
--      fechada ('ordens_servico','ordens_servico_onfarm'), sem SQL dinâmico.
--   3. RPC de falha nova rpc_fail_communication_delivery_v2 com p_is_permanent
--      (a Fase 1 permanece intocada; 4 params). Compatível, lease-safe.
--   4. RPC de defer rpc_defer_communication_delivery (não conta como tentativa
--      de provedor; usada quando canal está OFF/config ausente/timeout SMTP).
--   5. Idempotência in_app: tabela comunicacao_inapp_dispatch (PK outbox_id) +
--      rpc_dispatch_inapp_notification, para que reexecução retorne o mesmo
--      notification_id sem novo INSERT.
--   6. Coluna provider_template_status em templates: adapter WA só envia quando
--      snapshot contém 'approved'.
--
-- Todos os REVOKE/GRANT são explícitos. Nenhuma nova RPC service_role-only é
-- exposta a anon/authenticated.
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. Colunas em comunicacao_templates (aditivo, idempotente)
-- =============================================================================
ALTER TABLE public.comunicacao_templates
  ADD COLUMN IF NOT EXISTS provider_template_name   text,
  ADD COLUMN IF NOT EXISTS language_code            text,
  ADD COLUMN IF NOT EXISTS parameter_mapping        jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS provider_template_status text;

-- Se v1 já criou CHECKs unconditional, remova antes de recriar como conditional.
ALTER TABLE public.comunicacao_templates
  DROP CONSTRAINT IF EXISTS comunicacao_templates_email_assunto_chk,
  DROP CONSTRAINT IF EXISTS comunicacao_templates_whatsapp_meta_chk,
  DROP CONSTRAINT IF EXISTS comunicacao_templates_non_whatsapp_meta_chk,
  DROP CONSTRAINT IF EXISTS comunicacao_templates_provider_status_chk;

-- CHECKs condicionais: drafts podem ser incompletos; active/archived exige
-- completude. Para non_whatsapp, metadados WA proibidos sempre.
ALTER TABLE public.comunicacao_templates
  ADD CONSTRAINT comunicacao_templates_email_assunto_chk
  CHECK (
    status = 'draft'
    OR canal <> 'email'
    OR (assunto IS NOT NULL AND length(assunto) BETWEEN 1 AND 300)
  );

ALTER TABLE public.comunicacao_templates
  ADD CONSTRAINT comunicacao_templates_whatsapp_meta_chk
  CHECK (
    status = 'draft'
    OR canal <> 'whatsapp'
    OR (
      provider_template_name IS NOT NULL
      AND length(provider_template_name) BETWEEN 1 AND 512
      AND language_code IS NOT NULL
      AND language_code ~ '^[a-z]{2}(_[A-Z]{2})?$'
      AND jsonb_typeof(parameter_mapping) = 'array'
      AND jsonb_array_length(parameter_mapping) <= 64
      AND provider_template_status = 'approved'
    )
  );

ALTER TABLE public.comunicacao_templates
  ADD CONSTRAINT comunicacao_templates_non_whatsapp_meta_chk
  CHECK (
    canal = 'whatsapp'
    OR (
      provider_template_name IS NULL
      AND language_code IS NULL
      AND provider_template_status IS NULL
      AND jsonb_array_length(COALESCE(parameter_mapping,'[]'::jsonb)) = 0
    )
  );

ALTER TABLE public.comunicacao_templates
  ADD CONSTRAINT comunicacao_templates_provider_status_chk
  CHECK (
    provider_template_status IS NULL
    OR provider_template_status IN ('draft','pending','approved','rejected','paused','disabled')
  );

-- =============================================================================
-- 2. RPC: definir metadados de template (mutável mesmo em active — para WA
--    apenas provider_template_status pode ser corrigido; corpo/canal continuam
--    imutáveis por trigger da Fase 1).
-- =============================================================================
CREATE OR REPLACE FUNCTION public.rpc_set_communication_template_metadata(
  p_template_id            uuid,
  p_provider_template_name text,
  p_language_code          text,
  p_parameter_mapping      jsonb,
  p_provider_template_status text DEFAULT NULL
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
      RAISE EXCEPTION 'whatsapp: language_code inválido (ex.: pt_BR)';
    END IF;
    IF jsonb_typeof(COALESCE(p_parameter_mapping,'[]'::jsonb)) <> 'array' THEN
      RAISE EXCEPTION 'whatsapp: parameter_mapping deve ser array';
    END IF;
    IF jsonb_array_length(COALESCE(p_parameter_mapping,'[]'::jsonb)) > 64 THEN
      RAISE EXCEPTION 'whatsapp: parameter_mapping excede 64 itens';
    END IF;
    IF p_provider_template_status IS NOT NULL
       AND p_provider_template_status NOT IN ('draft','pending','approved','rejected','paused','disabled') THEN
      RAISE EXCEPTION 'whatsapp: provider_template_status inválido';
    END IF;
  ELSE
    IF p_provider_template_name IS NOT NULL OR p_language_code IS NOT NULL
       OR p_provider_template_status IS NOT NULL
       OR jsonb_array_length(COALESCE(p_parameter_mapping,'[]'::jsonb)) > 0 THEN
      RAISE EXCEPTION 'metadados de whatsapp não são aceitos para canal %', r.canal;
    END IF;
  END IF;

  UPDATE public.comunicacao_templates
     SET provider_template_name   = p_provider_template_name,
         language_code            = p_language_code,
         parameter_mapping        = COALESCE(p_parameter_mapping,'[]'::jsonb),
         provider_template_status = p_provider_template_status,
         updated_by = auth.uid()
   WHERE id = p_template_id;

  PERFORM public._comunicacao_write_audit(
    'template.set_metadata','comunicacao_templates', p_template_id,
    to_jsonb(r),
    (SELECT to_jsonb(t) FROM public.comunicacao_templates t WHERE t.id = p_template_id));
  RETURN jsonb_build_object('ok',true);
END$$;
REVOKE ALL ON FUNCTION public.rpc_set_communication_template_metadata(uuid,text,text,jsonb,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_set_communication_template_metadata(uuid,text,text,jsonb,text) TO authenticated;

-- =============================================================================
-- 3. Helpers *_v2 source-aware — allowlist fechada, sem SQL dinâmico
-- =============================================================================
-- Allowlist válida: 'ordens_servico', 'ordens_servico_onfarm'. Qualquer outro
-- valor gera exceção (bloqueia UUID-collision cega). Dispatch por CASE.
CREATE OR REPLACE FUNCTION public._comunicacao_resolve_recipients_v2(
  _event_key text, _rule public.comunicacao_regras,
  _source_type text, _source_id uuid
) RETURNS TABLE (recipient_user_id uuid, recipient_cliente_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_os_cliente uuid;
BEGIN
  IF _event_key = 'administrative_important_update' THEN
    IF _rule.estrategia <> 'broadcast_role' OR _rule.perfil IS NULL THEN
      RETURN;
    END IF;
    RETURN QUERY
      SELECT DISTINCT pr.user_id, NULL::uuid
        FROM public.user_roles ur
        JOIN public.profiles pr ON pr.user_id = ur.user_id
       WHERE ur.role = _rule.perfil
         AND COALESCE(pr.ativo, true) = true;
    RETURN;
  END IF;

  IF _event_key IN ('produto_pronto_retirada','produto_pronto_aplicacao') THEN
    IF _source_type NOT IN ('ordens_servico','ordens_servico_onfarm') THEN
      RAISE EXCEPTION 'source_type inválido para % : %', _event_key, _source_type;
    END IF;

    -- Dispatch por CASE — cada CASE lê APENAS sua tabela. Sem SQL dinâmico.
    CASE _source_type
      WHEN 'ordens_servico' THEN
        SELECT o.cliente_id INTO v_os_cliente
          FROM public.ordens_servico o WHERE o.id = _source_id;
      WHEN 'ordens_servico_onfarm' THEN
        SELECT o.cliente_id INTO v_os_cliente
          FROM public.ordens_servico_onfarm o WHERE o.id = _source_id;
    END CASE;

    IF v_os_cliente IS NULL THEN RETURN; END IF;

    IF _rule.estrategia = 'source_participants' THEN
      RETURN QUERY
        SELECT NULL::uuid AS recipient_user_id, v_os_cliente AS recipient_cliente_id
        UNION
        SELECT DISTINCT pr.user_id, NULL::uuid
          FROM public.profiles pr
         WHERE pr.cliente_id = v_os_cliente
           AND COALESCE(pr.ativo, true) = true;
      RETURN;
    ELSIF _rule.estrategia = 'by_role' THEN
      IF _rule.perfil IS NULL THEN RETURN; END IF;
      RETURN QUERY
        SELECT DISTINCT pr.user_id, NULL::uuid
          FROM public.user_roles ur
          JOIN public.profiles pr ON pr.user_id = ur.user_id
         WHERE ur.role = _rule.perfil
           AND pr.cliente_id = v_os_cliente
           AND COALESCE(pr.ativo, true) = true;
      RETURN;
    ELSE
      RETURN;  -- broadcast_role em OS: bloqueado
    END IF;
  END IF;
END$$;
REVOKE ALL ON FUNCTION public._comunicacao_resolve_recipients_v2(text,public.comunicacao_regras,text,uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._comunicacao_build_snapshot_v2(
  _event_key text, _source_type text, _source_id uuid, _payload jsonb,
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
    IF _source_type NOT IN ('ordens_servico','ordens_servico_onfarm') THEN
      RAISE EXCEPTION 'source_type inválido para %: %', _event_key, _source_type;
    END IF;
    -- NOTA: o payload usa o rótulo canônico 'data_prevista' para o template,
    -- mas as ORIGENS diferem por tabela:
    --   ordens_servico        → coluna data_programada
    --   ordens_servico_onfarm → coluna data_recomendada  (não existe data_programada nesta tabela)
    CASE _source_type
      WHEN 'ordens_servico' THEN
        SELECT o.numero_os, to_char(o.data_programada,'DD/MM/YYYY')
          INTO v_codigo_os, v_data_prevista
          FROM public.ordens_servico o WHERE o.id = _source_id;
      WHEN 'ordens_servico_onfarm' THEN
        SELECT o.numero_os, to_char(o.data_recomendada,'DD/MM/YYYY')
          INTO v_codigo_os, v_data_prevista
          FROM public.ordens_servico_onfarm o WHERE o.id = _source_id;
    END CASE;

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
REVOKE ALL ON FUNCTION public._comunicacao_build_snapshot_v2(text,text,uuid,jsonb,uuid,uuid) FROM PUBLIC, anon, authenticated;

-- =============================================================================
-- 4. Expansão system-side (usa helpers v2)
-- =============================================================================
CREATE OR REPLACE FUNCTION public._comunicacao_expand_event(
  _event_id uuid, _event_key text, _source_type text, _source_id uuid, _payload jsonb
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
      'provider_template_name',   v_tpl.provider_template_name,
      'language_code',            v_tpl.language_code,
      'parameter_mapping',        v_tpl.parameter_mapping,
      'provider_template_status', v_tpl.provider_template_status
    );

    FOR v_rec IN
      SELECT * FROM public._comunicacao_resolve_recipients_v2(_event_key, v_rule, _source_type, _source_id)
    LOOP
      IF NOT public._comunicacao_can_deliver(v_rec.recipient_user_id, v_rec.recipient_cliente_id, v_rule.canal) THEN
        v_skp := v_skp + 1; CONTINUE;
      END IF;

      v_payload_snapshot := public._comunicacao_build_snapshot_v2(
        _event_key, _source_type, _source_id, _payload,
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
REVOKE ALL ON FUNCTION public._comunicacao_expand_event(uuid,text,text,uuid,jsonb) FROM PUBLIC, anon, authenticated;

-- Publicação por sistema (usa expand v2 com source_type)
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
  IF _source_type NOT IN ('ordens_servico','ordens_servico_onfarm') THEN
    RAISE EXCEPTION 'source_type inválido: %', _source_type;
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

  v_expand := public._comunicacao_expand_event(v_event_id, _event_key, _source_type, _source_id, COALESCE(_payload,'{}'::jsonb));

  PERFORM public._comunicacao_write_audit(
    'event.publish.system','comunicacao_eventos', v_event_id, NULL,
    jsonb_build_object('event_key',_event_key,'source_type',_source_type,'expand',v_expand));

  RETURN jsonb_build_object(
    'ok',true,'event_id',v_event_id,'duplicated',false,
    'enqueued', v_expand->'enqueued','skipped', v_expand->'skipped');
END$$;
REVOKE ALL ON FUNCTION public._comunicacao_publish_system_event(text,text,uuid,jsonb,text) FROM PUBLIC, anon, authenticated;

-- =============================================================================
-- 4.b. RPC autenticada v2 (substitui uso da rpc Fase 1 na UI Fase 2). Sem
--      overload do nome antigo — nome distinto. Apenas administrador. Reproduz
--      todas as validações rígidas/whitelist/idempotência da RPC Fase 1, mas
--      chama _comunicacao_expand_event v2 (com source_type) para que TODO
--      outbox manual/broadcast receba metadata WA no snapshot e helpers
--      source-aware. A RPC antiga permanece intacta para compatibilidade.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.rpc_publish_communication_event_v2(
  p_event_key text, p_source_type text, p_source_id uuid,
  p_payload jsonb, p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_event_id uuid;
  v_expand   jsonb;
  v_target_role public.app_role;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'autenticação requerida' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT public.has_role(auth.uid(),'administrador') THEN
    RAISE EXCEPTION 'apenas administrador pode publicar eventos (v2)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_event_key NOT IN ('produto_pronto_retirada','produto_pronto_aplicacao','administrative_important_update') THEN
    RAISE EXCEPTION 'event_key não permitido: %', p_event_key;
  END IF;
  IF jsonb_typeof(COALESCE(p_payload,'{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'payload deve ser objeto JSON';
  END IF;
  IF p_idempotency_key IS NULL OR length(p_idempotency_key) < 8 THEN
    RAISE EXCEPTION 'idempotency_key inválido (mín. 8 chars)';
  END IF;

  IF p_event_key IN ('produto_pronto_retirada','produto_pronto_aplicacao') THEN
    -- payload NÃO aceita chaves (dados derivados do banco)
    IF (SELECT count(*) FROM jsonb_object_keys(COALESCE(p_payload,'{}'::jsonb))) > 0 THEN
      RAISE EXCEPTION 'payload não aceita chaves para %', p_event_key;
    END IF;
    -- source_type restrito à allowlist Fase 2 (regular + on-farm)
    IF p_source_type NOT IN ('ordens_servico','ordens_servico_onfarm') THEN
      RAISE EXCEPTION 'source_type inválido para %: %', p_event_key, p_source_type;
    END IF;
    IF p_source_id IS NULL THEN
      RAISE EXCEPTION 'source_id obrigatório';
    END IF;

    IF p_event_key = 'produto_pronto_retirada' THEN
      -- Manual admin sobre OS regular: exige status pronto_entrega (paridade Fase 1).
      IF p_source_type = 'ordens_servico' THEN
        IF NOT EXISTS (SELECT 1 FROM public.ordens_servico o
                        WHERE o.id = p_source_id AND o.status = 'pronto_entrega'::public.status_os) THEN
          RAISE EXCEPTION 'ordens_servico não está em pronto_entrega';
        END IF;
      ELSE
        IF NOT EXISTS (SELECT 1 FROM public.ordens_servico_onfarm o
                        WHERE o.id = p_source_id AND o.status = 'pronto_entrega'::public.status_os_onfarm) THEN
          RAISE EXCEPTION 'ordens_servico_onfarm não está em pronto_entrega';
        END IF;
      END IF;
    ELSE
      -- produto_pronto_aplicacao: somente OS regular existente (on-farm sem definição de negócio)
      IF p_source_type <> 'ordens_servico' THEN
        RAISE EXCEPTION 'produto_pronto_aplicacao aceita apenas ordens_servico (regular)';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM public.ordens_servico o WHERE o.id = p_source_id) THEN
        RAISE EXCEPTION 'ordem_servico inexistente';
      END IF;
    END IF;

  ELSE  -- administrative_important_update
    IF EXISTS (
      SELECT 1 FROM jsonb_object_keys(COALESCE(p_payload,'{}'::jsonb)) k
       WHERE k NOT IN ('target_role','titulo','mensagem')
    ) THEN
      RAISE EXCEPTION 'chaves de payload não permitidas para administrative_important_update';
    END IF;
    IF p_payload ->> 'target_role' IS NULL THEN
      RAISE EXCEPTION 'target_role obrigatório';
    END IF;
    BEGIN
      v_target_role := (p_payload ->> 'target_role')::public.app_role;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'target_role inválido: %', p_payload ->> 'target_role';
    END;
    IF length(COALESCE(p_payload->>'titulo','')) > 200 THEN
      RAISE EXCEPTION 'titulo excede 200 chars';
    END IF;
    IF length(COALESCE(p_payload->>'mensagem','')) > 2000 THEN
      RAISE EXCEPTION 'mensagem excede 2000 chars';
    END IF;
  END IF;

  -- Insere evento (idempotência atômica)
  INSERT INTO public.comunicacao_eventos(event_key,source_type,source_id,payload,created_by,idempotency_key)
  VALUES (p_event_key, p_source_type, p_source_id, COALESCE(p_payload,'{}'::jsonb), auth.uid(), p_idempotency_key)
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_event_id;

  IF v_event_id IS NULL THEN
    SELECT id INTO v_event_id FROM public.comunicacao_eventos WHERE idempotency_key = p_idempotency_key;
    RETURN jsonb_build_object('ok',true,'event_id',v_event_id,'duplicated',true);
  END IF;

  -- Expansão v2 (source-aware). Falhas propagam e derrubam a transação.
  v_expand := public._comunicacao_expand_event(
    v_event_id, p_event_key, p_source_type, p_source_id, COALESCE(p_payload,'{}'::jsonb));

  PERFORM public._comunicacao_write_audit(
    'event.publish.v2','comunicacao_eventos', v_event_id, NULL,
    jsonb_build_object(
      'event_key', p_event_key,
      'source_type', p_source_type,
      'source_id',   p_source_id,
      'expand', v_expand));

  RETURN jsonb_build_object(
    'ok',true,'event_id',v_event_id,'duplicated',false,
    'enqueued', v_expand->'enqueued','skipped', v_expand->'skipped');
END$$;
REVOKE ALL ON FUNCTION public.rpc_publish_communication_event_v2(text,text,uuid,jsonb,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_publish_communication_event_v2(text,text,uuid,jsonb,text) TO authenticated;


-- =============================================================================
-- 5. Triggers em ordens_servico e ordens_servico_onfarm
-- =============================================================================
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

-- =============================================================================
-- 6. RPC: preview server-side (admin/gestor)
-- =============================================================================
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
    'ok', true, 'target_role', p_target_role,
    'total_users_in_role', v_total_users,
    'estimated_recipients_by_canal', v_by_canal);
END$$;
REVOKE ALL ON FUNCTION public.rpc_preview_administrative_broadcast_count(public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_preview_administrative_broadcast_count(public.app_role) TO authenticated;

-- =============================================================================
-- 7. RPC: resolve endereço (service_role-only)
-- =============================================================================
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

  v_ok := public._comunicacao_can_deliver(r.recipient_user_id, r.recipient_cliente_id, r.canal);
  IF NOT v_ok THEN
    RETURN jsonb_build_object('ok',false,'outcome','skipped','reason','opt_out_or_unverified');
  END IF;

  IF r.canal = 'in_app' THEN
    RETURN jsonb_build_object(
      'ok',true,'canal','in_app',
      'user_id', r.recipient_user_id,
      'cliente_id', r.recipient_cliente_id);
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
    RETURN jsonb_build_object('ok',true,'canal','email','address',v_email,
      'address_hash',v_hash,'redacted',v_redacted,
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
    IF length(v_phone_raw) IN (10,11) THEN
      v_phone := '+55' || v_phone_raw;
    ELSIF length(v_phone_raw) BETWEEN 12 AND 15 THEN
      v_phone := '+' || v_phone_raw;
    ELSE
      RETURN jsonb_build_object('ok',false,'outcome','cancelled','reason','invalid_phone');
    END IF;
    v_hash := encode(digest(v_phone,'sha256'),'hex');
    v_redacted := left(v_phone,4) || repeat('*', GREATEST(0, length(v_phone)-6)) || right(v_phone,2);
    RETURN jsonb_build_object('ok',true,'canal','whatsapp','address',v_phone,
      'address_hash',v_hash,'redacted',v_redacted,
      'user_id', r.recipient_user_id, 'cliente_id', r.recipient_cliente_id);
  END IF;

  RETURN jsonb_build_object('ok',false,'outcome','cancelled','reason','unsupported_canal');
END$$;
REVOKE ALL ON FUNCTION public.rpc_resolve_outbox_address(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_resolve_outbox_address(uuid) TO service_role;

-- =============================================================================
-- 8. Terminadores: skip, cancel, defer, fail_v2 (todos service_role-only, lease-safe)
-- =============================================================================
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
  IF NULLIF(trim(COALESCE(p_worker_id,'')),'') IS NULL THEN RAISE EXCEPTION 'worker_id obrigatório'; END IF;
  SELECT * INTO r FROM public.comunicacao_outbox WHERE id = p_outbox_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'outbox não encontrado'; END IF;
  IF r.status <> 'processing' THEN RAISE EXCEPTION 'outbox não estava em processing (status=%)', r.status; END IF;
  IF r.locked_by IS DISTINCT FROM p_worker_id THEN RAISE EXCEPTION 'lease pertence a outro worker'; END IF;
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
  IF NULLIF(trim(COALESCE(p_worker_id,'')),'') IS NULL THEN RAISE EXCEPTION 'worker_id obrigatório'; END IF;
  SELECT * INTO r FROM public.comunicacao_outbox WHERE id = p_outbox_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'outbox não encontrado'; END IF;
  IF r.status <> 'processing' THEN RAISE EXCEPTION 'outbox não estava em processing (status=%)', r.status; END IF;
  IF r.locked_by IS DISTINCT FROM p_worker_id THEN RAISE EXCEPTION 'lease pertence a outro worker'; END IF;
  UPDATE public.comunicacao_outbox
     SET status = 'cancelled', error_code = 'cancelled',
         error_message = left(COALESCE(p_reason,''), 2000),
         locked_at = NULL, locked_by = NULL, lease_expires_at = NULL
   WHERE id = p_outbox_id;
  RETURN jsonb_build_object('ok',true,'status','cancelled');
END$$;
REVOKE ALL ON FUNCTION public.rpc_cancel_communication_delivery(uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_cancel_communication_delivery(uuid,text,text) TO service_role;

-- Defer: devolve item a 'pending' sem consumir tentativa; agenda próximo retry.
-- Usado quando canal está OFF/config ausente/timeout de infra transitório.
-- IMPORTANTE: rpc_claim_communication_outbox (Fase 1) já incrementou attempts
-- no momento do claim. Como defer não é tentativa real de provedor,
-- devolvemos o incremento com GREATEST(r.attempts - 1, 0). Defer repetido
-- nunca fica negativo e nunca "estoura" max_attempts.
CREATE OR REPLACE FUNCTION public.rpc_defer_communication_delivery(
  p_outbox_id uuid, p_worker_id text, p_reason text, p_delay_seconds int DEFAULT 300
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.comunicacao_outbox%rowtype; v_role text; v_delay int; v_attempts int;
BEGIN
  v_role := COALESCE(current_setting('request.jwt.claims', true)::jsonb ->> 'role', session_user);
  IF v_role IS NOT NULL AND v_role NOT IN ('service_role') AND current_user <> 'service_role' THEN
    RAISE EXCEPTION 'apenas service_role' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NULLIF(trim(COALESCE(p_worker_id,'')),'') IS NULL THEN RAISE EXCEPTION 'worker_id obrigatório'; END IF;
  v_delay := GREATEST(30, LEAST(3600, COALESCE(p_delay_seconds, 300)));
  SELECT * INTO r FROM public.comunicacao_outbox WHERE id = p_outbox_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'outbox não encontrado'; END IF;
  IF r.status <> 'processing' THEN RAISE EXCEPTION 'outbox não estava em processing (status=%)', r.status; END IF;
  IF r.locked_by IS DISTINCT FROM p_worker_id THEN RAISE EXCEPTION 'lease pertence a outro worker'; END IF;
  -- desfaz o incremento contabilizado pelo claim (canal OFF/config ausente
  -- não é tentativa de provedor). Nunca abaixo de zero.
  v_attempts := GREATEST(COALESCE(r.attempts, 0) - 1, 0);
  UPDATE public.comunicacao_outbox
     SET status = 'pending',
         attempts = v_attempts,
         next_attempt_at = now() + make_interval(secs => v_delay),
         error_code = 'deferred',
         error_message = left(COALESCE(p_reason,''), 2000),
         locked_at = NULL, locked_by = NULL, lease_expires_at = NULL
   WHERE id = p_outbox_id;
  RETURN jsonb_build_object('ok',true,'status','deferred','retry_in_seconds',v_delay,'attempts',v_attempts);
END$$;
REVOKE ALL ON FUNCTION public.rpc_defer_communication_delivery(uuid,text,text,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_defer_communication_delivery(uuid,text,text,integer) TO service_role;

-- fail_v2: substitui a RPC de fase 1 (que continua existindo e intacta) com
-- suporte a p_is_permanent → dead_letter imediato. lease-safe.
-- IMPORTANTE: attempts já foi incrementado por rpc_claim_communication_outbox
-- (Fase 1) no momento do claim. Portanto NÃO incrementamos novamente e a
-- comparação com max_attempts usa r.attempts diretamente (paridade com a RPC
-- da Fase 1). Backoff exponencial também usa r.attempts (número de tentativas
-- já contabilizadas, incluindo a que acabou de falhar).
CREATE OR REPLACE FUNCTION public.rpc_fail_communication_delivery_v2(
  p_outbox_id uuid, p_worker_id text, p_error_code text, p_error_message text, p_is_permanent boolean
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.comunicacao_outbox%rowtype; v_role text; v_backoff int;
BEGIN
  v_role := COALESCE(current_setting('request.jwt.claims', true)::jsonb ->> 'role', session_user);
  IF v_role IS NOT NULL AND v_role NOT IN ('service_role') AND current_user <> 'service_role' THEN
    RAISE EXCEPTION 'apenas service_role' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NULLIF(trim(COALESCE(p_worker_id,'')),'') IS NULL THEN RAISE EXCEPTION 'worker_id obrigatório'; END IF;
  IF p_error_code IS NOT NULL AND length(p_error_code) > 80 THEN RAISE EXCEPTION 'error_code excede 80'; END IF;
  SELECT * INTO r FROM public.comunicacao_outbox WHERE id = p_outbox_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'outbox não encontrado'; END IF;
  IF r.status <> 'processing' THEN RAISE EXCEPTION 'outbox não estava em processing'; END IF;
  IF r.locked_by IS DISTINCT FROM p_worker_id THEN RAISE EXCEPTION 'lease pertence a outro worker'; END IF;

  -- Permanente → dead_letter imediato (sem novo incremento).
  -- Transitório: se attempts (já incrementado pelo claim) alcançou max, também morre.
  IF p_is_permanent OR r.attempts >= r.max_attempts THEN
    UPDATE public.comunicacao_outbox
       SET status = 'dead_letter',
           error_code = left(COALESCE(p_error_code,''),80),
           error_message = left(COALESCE(p_error_message,''),2000),
           locked_at = NULL, locked_by = NULL, lease_expires_at = NULL
     WHERE id = p_outbox_id;
    RETURN jsonb_build_object('ok',true,'status','dead_letter','attempts',r.attempts);
  END IF;

  -- Transitório com tentativas remanescentes: reagenda sem novo incremento.
  v_backoff := LEAST(3600, POWER(2, GREATEST(r.attempts - 1, 0))::int * 30);
  UPDATE public.comunicacao_outbox
     SET status = 'pending',
         next_attempt_at = now() + make_interval(secs => v_backoff),
         error_code = left(COALESCE(p_error_code,''),80),
         error_message = left(COALESCE(p_error_message,''),2000),
         locked_at = NULL, locked_by = NULL, lease_expires_at = NULL
   WHERE id = p_outbox_id;
  RETURN jsonb_build_object('ok',true,'status','pending','retry_in_seconds',v_backoff,'attempts',r.attempts);
END$$;
REVOKE ALL ON FUNCTION public.rpc_fail_communication_delivery_v2(uuid,text,text,text,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_fail_communication_delivery_v2(uuid,text,text,text,boolean) TO service_role;


-- =============================================================================
-- 9. In-app: idempotência por outbox_id
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.comunicacao_inapp_dispatch (
  outbox_id       uuid PRIMARY KEY,
  notification_id uuid NOT NULL,
  target_kind     text NOT NULL CHECK (target_kind IN ('portal','operacional')),
  created_at      timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON public.comunicacao_inapp_dispatch FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.comunicacao_inapp_dispatch TO service_role;

ALTER TABLE public.comunicacao_inapp_dispatch ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "comunicacao_inapp_dispatch_deny_all" ON public.comunicacao_inapp_dispatch;
-- Sem políticas para authenticated → RLS deny-all para todos exceto service_role
-- (que bypassa RLS). Nenhuma role autenticada pode ler/escrever.

-- RPC service_role-only. Faz UPSERT idempotente por outbox_id.
CREATE OR REPLACE FUNCTION public.rpc_dispatch_inapp_notification(
  p_outbox_id  uuid,
  p_cliente_id uuid,
  p_user_id    uuid,
  p_titulo     text,
  p_mensagem   text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role text;
  v_existing_id uuid;
  v_existing_kind text;
  v_new_id uuid;
  v_kind text;
  v_tipo public.tipo_notificacao_portal;
BEGIN
  v_role := COALESCE(current_setting('request.jwt.claims', true)::jsonb ->> 'role', session_user);
  IF v_role IS NOT NULL AND v_role NOT IN ('service_role') AND current_user <> 'service_role' THEN
    RAISE EXCEPTION 'apenas service_role' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_outbox_id IS NULL THEN RAISE EXCEPTION 'outbox_id obrigatório'; END IF;
  IF p_cliente_id IS NULL AND p_user_id IS NULL THEN
    RAISE EXCEPTION 'cliente_id ou user_id é obrigatório';
  END IF;
  IF p_cliente_id IS NOT NULL AND p_user_id IS NOT NULL THEN
    RAISE EXCEPTION 'cliente_id e user_id são mutuamente exclusivos';
  END IF;
  IF p_titulo IS NULL OR length(trim(p_titulo)) = 0 THEN RAISE EXCEPTION 'titulo obrigatório'; END IF;
  IF length(p_titulo) > 200 THEN RAISE EXCEPTION 'titulo excede 200'; END IF;
  IF p_mensagem IS NOT NULL AND length(p_mensagem) > 4000 THEN RAISE EXCEPTION 'mensagem excede 4000'; END IF;

  -- Serialização determinística por outbox_id via advisory lock transacional.
  -- hashtextextended(uuid_text, seed) produz bigint estável, sem SQL dinâmico
  -- e sem risco de injeção. Bloqueia concorrentes ANTES da leitura, evitando
  -- unique-violation por corrida no INSERT em comunicacao_inapp_dispatch.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_outbox_id::text, 0));

  SELECT notification_id, target_kind
    INTO v_existing_id, v_existing_kind
    FROM public.comunicacao_inapp_dispatch
   WHERE outbox_id = p_outbox_id;
  IF FOUND THEN
    RETURN jsonb_build_object('ok',true,'notification_id',v_existing_id,'target',v_existing_kind,'idempotent',true);
  END IF;


  IF p_cliente_id IS NOT NULL THEN
    v_tipo := 'informativo'::public.tipo_notificacao_portal;
    INSERT INTO public.portal_notificacoes(cliente_id, titulo, mensagem, tipo)
    VALUES (p_cliente_id, p_titulo, p_mensagem, v_tipo)
    RETURNING id INTO v_new_id;
    v_kind := 'portal';
  ELSE
    INSERT INTO public.notificacoes_operacionais(usuario_id, tipo, titulo, mensagem, link)
    VALUES (p_user_id, 'comunicacao', p_titulo, p_mensagem, NULL)
    RETURNING id INTO v_new_id;
    v_kind := 'operacional';
  END IF;

  INSERT INTO public.comunicacao_inapp_dispatch(outbox_id, notification_id, target_kind)
  VALUES (p_outbox_id, v_new_id, v_kind);

  RETURN jsonb_build_object('ok',true,'notification_id',v_new_id,'target',v_kind,'idempotent',false);
END$$;
REVOKE ALL ON FUNCTION public.rpc_dispatch_inapp_notification(uuid,uuid,uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_dispatch_inapp_notification(uuid,uuid,uuid,text,text) TO service_role;

-- Compat: mantidas para chamadas administrativas diretas (não usadas mais pelo
-- adapter in_app, que passou a usar rpc_dispatch_inapp_notification).
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
  BEGIN v_tipo := COALESCE(p_tipo,'informativo')::public.tipo_notificacao_portal;
  EXCEPTION WHEN others THEN RAISE EXCEPTION 'tipo inválido: %', p_tipo; END;
  INSERT INTO public.portal_notificacoes(cliente_id, titulo, mensagem, tipo)
  VALUES (p_cliente_id, p_titulo, p_mensagem, v_tipo) RETURNING id INTO v_id;
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
  IF p_tipo IS NULL OR length(p_tipo) > 60 THEN RAISE EXCEPTION 'tipo obrigatório (<=60)'; END IF;
  INSERT INTO public.notificacoes_operacionais(usuario_id, tipo, titulo, mensagem, link)
  VALUES (p_usuario_id, p_tipo, p_titulo, p_mensagem, p_link) RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok',true,'notification_id',v_id);
END$$;
REVOKE ALL ON FUNCTION public.rpc_create_operational_notification_secure(uuid,text,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_create_operational_notification_secure(uuid,text,text,text,text) TO service_role;

COMMIT;

-- =============================================================================
-- Fim da migration Fase 2 v2 corretiva (proposta) — NÃO APLICADA.
-- =============================================================================
