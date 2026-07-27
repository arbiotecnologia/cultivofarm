-- Comunicação — Etapa 1 — Subfase 1B (hardening após auditoria)
-- Ambiente exclusivo: staging ikaauvsflpmamgxmkhoq (ar-bio-temp).
-- Nenhum canal habilitado. Nenhum template criado. Nenhuma regra criada.

-- =========================================================================
-- (1) Publisher — validação anti-spoof para eventos solicitacao_*.
--     Preserva integralmente o caminho produto_pronto_retirada e a allowlist
--     de event_key/payload já vigentes. Adiciona validação de coerência com
--     a linha em portal_solicitacoes (existência + tenant + consultor).
-- =========================================================================
CREATE OR REPLACE FUNCTION public._comunicacao_publish_system_event(
  _event_key text, _source_type text, _source_id uuid,
  _payload jsonb, _idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_event_id uuid;
  v_expand jsonb;
  v_row_cliente uuid;
  v_row_consultor uuid;
  v_p_sol uuid;
  v_p_cli uuid;
  v_p_cons uuid;
BEGIN
  IF _event_key NOT IN (
    'produto_pronto_retirada',
    'solicitacao_criada','solicitacao_atribuida','solicitacao_checkin_realizado',
    'solicitacao_em_visita','solicitacao_aguardando_os','solicitacao_concluida',
    'solicitacao_cancelada','solicitacao_urgencia_critica'
  ) THEN
    RAISE EXCEPTION 'evento não permitido: %', _event_key;
  END IF;

  IF _event_key = 'produto_pronto_retirada' THEN
    IF _source_type NOT IN ('ordens_servico','ordens_servico_onfarm') THEN
      RAISE EXCEPTION 'source inválido: %', _source_type;
    END IF;
  ELSE
    IF _source_type <> 'portal_solicitacoes' THEN
      RAISE EXCEPTION 'source inválido para %: %', _event_key, _source_type;
    END IF;
    IF _source_id IS NULL THEN
      RAISE EXCEPTION 'source_id obrigatório para %', _event_key;
    END IF;
    IF jsonb_typeof(COALESCE(_payload,'{}'::jsonb)) <> 'object' THEN
      RAISE EXCEPTION 'payload deve ser objeto';
    END IF;

    -- Allowlist §10.
    IF EXISTS (
      SELECT 1
        FROM jsonb_object_keys(COALESCE(_payload,'{}'::jsonb)) AS k
       WHERE k NOT IN (
         'solicitacao_id','numero','cliente_id','fazenda_id','tipo_demanda',
         'urgencia','status_anterior','status_novo','consultor_atribuido',
         'origem_solicitacao','ocorrido_em','transicao'
       )
    ) THEN
      RAISE EXCEPTION 'chave de payload não permitida para %', _event_key;
    END IF;

    -- Coerência com a linha real. Fail-fast e anti-spoof em chamada interna
    -- indevida: source_id precisa existir, cliente/consultor precisam bater.
    SELECT s.cliente_id, s.consultor_atribuido
      INTO v_row_cliente, v_row_consultor
      FROM public.portal_solicitacoes s WHERE s.id = _source_id;
    IF v_row_cliente IS NULL AND NOT FOUND THEN
      RAISE EXCEPTION 'source_id não encontrado em portal_solicitacoes: %', _source_id;
    END IF;

    -- Tipos mínimos (cast falha explicitamente se malformado).
    IF _payload ? 'solicitacao_id' THEN
      v_p_sol := (_payload->>'solicitacao_id')::uuid;
      IF v_p_sol <> _source_id THEN
        RAISE EXCEPTION 'payload.solicitacao_id divergente de source_id';
      END IF;
    END IF;
    IF _payload ? 'cliente_id' THEN
      v_p_cli := (_payload->>'cliente_id')::uuid;
      IF v_p_cli <> v_row_cliente THEN
        RAISE EXCEPTION 'payload.cliente_id divergente do tenant da solicitação';
      END IF;
    END IF;
    IF _payload ? 'consultor_atribuido' THEN
      v_p_cons := (_payload->>'consultor_atribuido')::uuid;
      IF v_row_consultor IS NULL OR v_p_cons <> v_row_consultor THEN
        RAISE EXCEPTION 'payload.consultor_atribuido divergente do valor atual';
      END IF;
    END IF;
  END IF;

  IF _idempotency_key IS NULL OR length(_idempotency_key) < 8 OR length(_idempotency_key) > 200 THEN
    RAISE EXCEPTION 'idem inválido';
  END IF;

  INSERT INTO public.comunicacao_eventos(event_key,source_type,source_id,payload,created_by,idempotency_key)
  VALUES (_event_key,_source_type,_source_id,COALESCE(_payload,'{}'::jsonb),NULL,_idempotency_key)
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_event_id;

  IF v_event_id IS NULL THEN
    SELECT id INTO v_event_id FROM public.comunicacao_eventos WHERE idempotency_key = _idempotency_key;
    RETURN jsonb_build_object('ok',true,'event_id',v_event_id,'duplicated',true);
  END IF;

  v_expand := public._comunicacao_expand_event(v_event_id,_event_key,_source_type,_source_id,COALESCE(_payload,'{}'::jsonb));
  PERFORM public._comunicacao_write_audit('event.publish.system','comunicacao_eventos', v_event_id, NULL,
    jsonb_build_object('event_key',_event_key,'source_type',_source_type,'expand',v_expand));
  RETURN jsonb_build_object('ok',true,'event_id',v_event_id,'duplicated',false,
    'enqueued', v_expand->'enqueued','skipped', v_expand->'skipped');
END $fn$;

REVOKE ALL ON FUNCTION public._comunicacao_publish_system_event(text,text,uuid,jsonb,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._comunicacao_publish_system_event(text,text,uuid,jsonb,text) FROM anon;
REVOKE ALL ON FUNCTION public._comunicacao_publish_system_event(text,text,uuid,jsonb,text) FROM authenticated;

-- =========================================================================
-- (2) Trigger — inclui primeira atribuição (consultor NULL→X) mesmo sem
--     mudança de status; deduplica quando status+consultor mudam juntos.
-- =========================================================================
CREATE OR REPLACE FUNCTION public._comunicacao_trg_portal_solicitacao()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $fn$
DECLARE
  v_ev text;
  v_transition text;
  v_idem text;
  v_status_ant text;
  v_status_novo text;
  v_first_assign boolean := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_ev := 'solicitacao_criada';
    v_transition := 'insert';
    v_status_ant := NULL;
    v_status_novo := NEW.status::text;
    v_first_assign := (NEW.consultor_atribuido IS NOT NULL AND NEW.status = 'atribuida');
    -- Se INSERT já com status=atribuida, o evento canônico é solicitacao_criada
    -- (linha nova). A primeira atribuição via UPDATE é que precisa emitir
    -- 'solicitacao_atribuida' adicional; em INSERT, criada já é suficiente.
    v_first_assign := false;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      v_ev := CASE NEW.status
        WHEN 'atribuida' THEN 'solicitacao_atribuida'
        WHEN 'checkin_realizado' THEN 'solicitacao_checkin_realizado'
        WHEN 'em_visita' THEN 'solicitacao_em_visita'
        WHEN 'aguardando_os' THEN 'solicitacao_aguardando_os'
        WHEN 'concluida' THEN 'solicitacao_concluida'
        WHEN 'cancelada' THEN 'solicitacao_cancelada'
        ELSE NULL
      END;
      v_transition := 'status:' || COALESCE(NEW.status::text,'null');
      v_status_ant := OLD.status::text;
      v_status_novo := NEW.status::text;
    END IF;
    -- Primeira atribuição: consultor NULL→X. Deduplicação: se status já
    -- transicionou para 'atribuida' neste mesmo comando, o evento canônico
    -- já será emitido; não emitir de novo.
    IF OLD.consultor_atribuido IS NULL AND NEW.consultor_atribuido IS NOT NULL
       AND (v_ev IS DISTINCT FROM 'solicitacao_atribuida') THEN
      v_first_assign := true;
    END IF;
  END IF;

  IF v_ev IS NOT NULL THEN
    v_idem := 'solicitacao:' || encode(
      extensions.digest(
        concat_ws('|', v_ev, NEW.id::text, v_transition, COALESCE(NEW.updated_at::text,'')),
        'sha256'
      ), 'hex'
    );
    PERFORM public._comunicacao_publish_system_event(
      v_ev, 'portal_solicitacoes', NEW.id,
      jsonb_strip_nulls(jsonb_build_object(
        'solicitacao_id', NEW.id,
        'numero', NEW.numero_solicitacao,
        'cliente_id', NEW.cliente_id,
        'fazenda_id', NEW.fazenda_id,
        'tipo_demanda', NEW.tipo_demanda,
        'urgencia', NEW.urgencia,
        'status_anterior', v_status_ant,
        'status_novo', v_status_novo,
        'consultor_atribuido', NEW.consultor_atribuido,
        'origem_solicitacao', NEW.origem_solicitacao,
        'ocorrido_em', COALESCE(NEW.updated_at, now()),
        'transicao', v_transition
      )),
      v_idem
    );
  END IF;

  IF v_first_assign THEN
    v_idem := 'solicitacao:' || encode(
      extensions.digest(
        concat_ws('|','solicitacao_atribuida', NEW.id::text,
                  'first_assign:'||NEW.consultor_atribuido::text,
                  COALESCE(NEW.updated_at::text,'')),
        'sha256'
      ), 'hex'
    );
    PERFORM public._comunicacao_publish_system_event(
      'solicitacao_atribuida', 'portal_solicitacoes', NEW.id,
      jsonb_strip_nulls(jsonb_build_object(
        'solicitacao_id', NEW.id,
        'numero', NEW.numero_solicitacao,
        'cliente_id', NEW.cliente_id,
        'fazenda_id', NEW.fazenda_id,
        'tipo_demanda', NEW.tipo_demanda,
        'urgencia', NEW.urgencia,
        'status_novo', NEW.status::text,
        'consultor_atribuido', NEW.consultor_atribuido,
        'origem_solicitacao', NEW.origem_solicitacao,
        'ocorrido_em', COALESCE(NEW.updated_at, now()),
        'transicao', 'first_assign'
      )),
      v_idem
    );
  END IF;

  IF (TG_OP = 'INSERT' AND NEW.urgencia = 'critica')
     OR (TG_OP = 'UPDATE' AND NEW.urgencia = 'critica' AND OLD.urgencia IS DISTINCT FROM 'critica') THEN
    v_idem := 'solicitacao:' || encode(
      extensions.digest(
        concat_ws('|', 'solicitacao_urgencia_critica', NEW.id::text, 'urgencia:critica',
                  COALESCE(NEW.updated_at::text,'')),
        'sha256'
      ), 'hex'
    );
    PERFORM public._comunicacao_publish_system_event(
      'solicitacao_urgencia_critica', 'portal_solicitacoes', NEW.id,
      jsonb_strip_nulls(jsonb_build_object(
        'solicitacao_id', NEW.id,
        'numero', NEW.numero_solicitacao,
        'cliente_id', NEW.cliente_id,
        'fazenda_id', NEW.fazenda_id,
        'tipo_demanda', NEW.tipo_demanda,
        'urgencia', NEW.urgencia,
        'status_novo', NEW.status::text,
        'consultor_atribuido', NEW.consultor_atribuido,
        'origem_solicitacao', NEW.origem_solicitacao,
        'ocorrido_em', COALESCE(NEW.updated_at, now()),
        'transicao', 'urgencia:critica'
      )),
      v_idem
    );
  END IF;

  RETURN NEW;
END $fn$;

REVOKE ALL ON FUNCTION public._comunicacao_trg_portal_solicitacao() FROM PUBLIC;
REVOKE ALL ON FUNCTION public._comunicacao_trg_portal_solicitacao() FROM anon;
REVOKE ALL ON FUNCTION public._comunicacao_trg_portal_solicitacao() FROM authenticated;

-- =========================================================================
-- (3) Resolver v2 — fail-closed by_role: apenas 'administrador' é global
--     nesta 1B (papel corporativo). Gestor/consultor/parceiro/qualquer outro
--     por by_role → retorna 0 até 1C definir vínculo tenant seguro.
--     source_participants inalterado (cliente_id + consultor_atribuido).
-- =========================================================================
CREATE OR REPLACE FUNCTION public._comunicacao_resolve_recipients_v2(
  _event_key text, _rule public.comunicacao_regras, _source_type text, _source_id uuid
) RETURNS TABLE(recipient_user_id uuid, recipient_cliente_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_os_cliente uuid;
  v_sol RECORD;
BEGIN
  IF _event_key = 'administrative_important_update' THEN
    IF _rule.estrategia <> 'broadcast_role' OR _rule.perfil IS NULL THEN RETURN; END IF;
    RETURN QUERY
      SELECT DISTINCT pr.user_id, NULL::uuid
        FROM public.user_roles ur JOIN public.profiles pr ON pr.user_id = ur.user_id
       WHERE ur.role = _rule.perfil AND COALESCE(pr.ativo, true) = true;
    RETURN;
  END IF;

  IF _event_key IN ('produto_pronto_retirada','produto_pronto_aplicacao') THEN
    IF _source_type NOT IN ('ordens_servico','ordens_servico_onfarm') THEN
      RAISE EXCEPTION 'source_type inválido: %', _source_type; END IF;
    CASE _source_type
      WHEN 'ordens_servico' THEN
        SELECT o.cliente_id INTO v_os_cliente FROM public.ordens_servico o WHERE o.id = _source_id;
      WHEN 'ordens_servico_onfarm' THEN
        SELECT o.cliente_id INTO v_os_cliente FROM public.ordens_servico_onfarm o WHERE o.id = _source_id;
    END CASE;
    IF v_os_cliente IS NULL THEN RETURN; END IF;
    IF _rule.estrategia = 'source_participants' THEN
      RETURN QUERY
        SELECT NULL::uuid, v_os_cliente
        UNION
        SELECT DISTINCT pr.user_id, NULL::uuid
          FROM public.profiles pr
         WHERE pr.cliente_id = v_os_cliente AND COALESCE(pr.ativo,true) = true;
      RETURN;
    ELSIF _rule.estrategia = 'by_role' THEN
      IF _rule.perfil IS NULL THEN RETURN; END IF;
      RETURN QUERY
        SELECT DISTINCT pr.user_id, NULL::uuid
          FROM public.user_roles ur JOIN public.profiles pr ON pr.user_id = ur.user_id
         WHERE ur.role = _rule.perfil AND pr.cliente_id = v_os_cliente
           AND COALESCE(pr.ativo,true) = true;
      RETURN;
    ELSE RETURN;
    END IF;
  END IF;

  IF _event_key IN (
    'solicitacao_criada','solicitacao_atribuida','solicitacao_checkin_realizado',
    'solicitacao_em_visita','solicitacao_aguardando_os','solicitacao_concluida',
    'solicitacao_cancelada','solicitacao_urgencia_critica'
  ) THEN
    IF _source_type <> 'portal_solicitacoes' THEN
      RAISE EXCEPTION 'source_type inválido: %', _source_type; END IF;
    SELECT s.cliente_id, s.consultor_atribuido INTO v_sol
      FROM public.portal_solicitacoes s WHERE s.id = _source_id;
    IF v_sol IS NULL THEN RETURN; END IF;

    IF _rule.estrategia = 'source_participants' THEN
      RETURN QUERY SELECT NULL::uuid, v_sol.cliente_id;
      IF v_sol.consultor_atribuido IS NOT NULL THEN
        RETURN QUERY SELECT v_sol.consultor_atribuido, NULL::uuid;
      END IF;
      RETURN;
    ELSIF _rule.estrategia = 'by_role' THEN
      -- Fail-closed: nesta 1B, apenas 'administrador' é broadcast global.
      -- Demais papéis (gestor, consultor_tecnico, parceiro_b2b, etc.) por
      -- by_role → 0 destinatários até 1C definir vínculo tenant seguro.
      IF _rule.perfil IS NULL THEN RETURN; END IF;
      IF _rule.perfil <> 'administrador'::public.app_role THEN RETURN; END IF;
      RETURN QUERY
        SELECT DISTINCT pr.user_id, NULL::uuid
          FROM public.user_roles ur
          JOIN public.profiles pr ON pr.user_id = ur.user_id
         WHERE ur.role = _rule.perfil
           AND COALESCE(pr.ativo,true) = true;
      RETURN;
    ELSE
      RETURN;
    END IF;
  END IF;
END $fn$;

REVOKE ALL ON FUNCTION public._comunicacao_resolve_recipients_v2(text, public.comunicacao_regras, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._comunicacao_resolve_recipients_v2(text, public.comunicacao_regras, text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public._comunicacao_resolve_recipients_v2(text, public.comunicacao_regras, text, uuid) FROM authenticated;