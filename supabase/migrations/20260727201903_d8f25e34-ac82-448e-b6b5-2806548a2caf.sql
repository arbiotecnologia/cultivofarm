-- =============================================================================
-- Comunicação Etapa 1 — Subfase 1B
-- Integração canônica das solicitações do produtor.
-- Alvo: staging ar-bio-temp (ikaauvsflpmamgxmkhoq). Produção proibida.
-- Idempotente/aditiva. Rollback documentado em restoration/comunicacao-etapa1-1b.
-- =============================================================================

-- 1) Publisher interno: aceitar eventos solicitacao_* com origem portal_solicitacoes.
CREATE OR REPLACE FUNCTION public._comunicacao_publish_system_event(
  _event_key text, _source_type text, _source_id uuid, _payload jsonb, _idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_event_id uuid; v_expand jsonb;
BEGIN
  IF _event_key NOT IN (
    'produto_pronto_retirada',
    'solicitacao_criada',
    'solicitacao_atribuida',
    'solicitacao_checkin_realizado',
    'solicitacao_em_visita',
    'solicitacao_aguardando_os',
    'solicitacao_concluida',
    'solicitacao_cancelada',
    'solicitacao_urgencia_critica'
  ) THEN
    RAISE EXCEPTION 'evento não permitido: %', _event_key;
  END IF;

  IF _event_key = 'produto_pronto_retirada' THEN
    IF _source_type NOT IN ('ordens_servico','ordens_servico_onfarm') THEN
      RAISE EXCEPTION 'source inválido: %', _source_type;
    END IF;
  ELSE
    -- Eventos solicitacao_* exigem origem portal_solicitacoes + source_id válido.
    IF _source_type <> 'portal_solicitacoes' THEN
      RAISE EXCEPTION 'source inválido para %: %', _event_key, _source_type;
    END IF;
    IF _source_id IS NULL THEN
      RAISE EXCEPTION 'source_id obrigatório para %', _event_key;
    END IF;
    IF jsonb_typeof(COALESCE(_payload,'{}'::jsonb)) <> 'object' THEN
      RAISE EXCEPTION 'payload deve ser objeto';
    END IF;
    -- Allowlist de chaves do payload — mantém contrato §10 do plano 1A.
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

  v_expand := public._comunicacao_expand_event(v_event_id, _event_key, _source_type, _source_id, COALESCE(_payload,'{}'::jsonb));
  PERFORM public._comunicacao_write_audit('event.publish.system','comunicacao_eventos', v_event_id, NULL,
    jsonb_build_object('event_key',_event_key,'source_type',_source_type,'expand',v_expand));
  RETURN jsonb_build_object('ok',true,'event_id',v_event_id,'duplicated',false,
    'enqueued', v_expand->'enqueued','skipped', v_expand->'skipped');
END$function$;

-- 2) Resolver de destinatários — ramo solicitacao_*.
CREATE OR REPLACE FUNCTION public._comunicacao_resolve_recipients_v2(
  _event_key text, _rule public.comunicacao_regras, _source_type text, _source_id uuid
) RETURNS TABLE(recipient_user_id uuid, recipient_cliente_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
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

  -- Novo ramo: solicitacao_*  (portal_solicitacoes)
  IF _event_key IN (
    'solicitacao_criada','solicitacao_atribuida','solicitacao_checkin_realizado',
    'solicitacao_em_visita','solicitacao_aguardando_os','solicitacao_concluida',
    'solicitacao_cancelada','solicitacao_urgencia_critica'
  ) THEN
    IF _source_type <> 'portal_solicitacoes' THEN
      RAISE EXCEPTION 'source_type inválido: %', _source_type; END IF;

    SELECT s.cliente_id, s.consultor_atribuido
      INTO v_sol
      FROM public.portal_solicitacoes s
     WHERE s.id = _source_id;
    IF v_sol IS NULL THEN RETURN; END IF;

    IF _rule.estrategia = 'source_participants' THEN
      -- Produtor exato + consultor atribuído (se houver).
      RETURN QUERY SELECT NULL::uuid, v_sol.cliente_id;
      IF v_sol.consultor_atribuido IS NOT NULL THEN
        RETURN QUERY SELECT v_sol.consultor_atribuido, NULL::uuid;
      END IF;
      RETURN;
    ELSIF _rule.estrategia = 'by_role' THEN
      -- Papel corporativo (gestor/administrador) OU papel técnico ligado ao cliente.
      IF _rule.perfil IS NULL THEN RETURN; END IF;
      IF _rule.perfil IN ('administrador'::public.app_role, 'gestor'::public.app_role) THEN
        RETURN QUERY
          SELECT DISTINCT pr.user_id, NULL::uuid
            FROM public.user_roles ur
            JOIN public.profiles pr ON pr.user_id = ur.user_id
           WHERE ur.role = _rule.perfil
             AND COALESCE(pr.ativo,true) = true;
        RETURN;
      ELSE
        -- Papéis técnicos: restringe ao consultor atribuído para não vazar entre clientes.
        IF v_sol.consultor_atribuido IS NULL THEN RETURN; END IF;
        RETURN QUERY
          SELECT DISTINCT pr.user_id, NULL::uuid
            FROM public.user_roles ur
            JOIN public.profiles pr ON pr.user_id = ur.user_id
           WHERE ur.role = _rule.perfil
             AND pr.user_id = v_sol.consultor_atribuido
             AND COALESCE(pr.ativo,true) = true;
        RETURN;
      END IF;
    ELSE
      RETURN;
    END IF;
  END IF;
END$function$;

-- 3) Trigger canônico único em portal_solicitacoes.
CREATE OR REPLACE FUNCTION public._comunicacao_trg_portal_solicitacao()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_events text[] := ARRAY[]::text[];
  v_ev text;
  v_payload jsonb;
  v_idem text;
  v_status_old text;
  v_status_new text;
  v_transition text;
BEGIN
  v_status_new := NEW.status;
  IF TG_OP = 'UPDATE' THEN v_status_old := OLD.status; ELSE v_status_old := NULL; END IF;

  IF TG_OP = 'INSERT' THEN
    v_events := array_append(v_events, 'solicitacao_criada');
    IF NEW.urgencia = 'critica' THEN
      v_events := array_append(v_events, 'solicitacao_urgencia_critica');
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Atribuição: transição para 'atribuida' OU primeira alocação de consultor.
    -- Uma única emissão por row change.
    IF (v_status_old IS DISTINCT FROM v_status_new AND v_status_new = 'atribuida')
       OR (OLD.consultor_atribuido IS NULL AND NEW.consultor_atribuido IS NOT NULL) THEN
      v_events := array_append(v_events, 'solicitacao_atribuida');
    END IF;
    IF v_status_old IS DISTINCT FROM v_status_new THEN
      IF v_status_new = 'checkin_realizado' THEN v_events := array_append(v_events, 'solicitacao_checkin_realizado'); END IF;
      IF v_status_new = 'em_visita'          THEN v_events := array_append(v_events, 'solicitacao_em_visita'); END IF;
      IF v_status_new = 'aguardando_os'      THEN v_events := array_append(v_events, 'solicitacao_aguardando_os'); END IF;
      IF v_status_new = 'concluida'          THEN v_events := array_append(v_events, 'solicitacao_concluida'); END IF;
      IF v_status_new = 'cancelada'          THEN v_events := array_append(v_events, 'solicitacao_cancelada'); END IF;
    END IF;
    -- Urgência: escalada para crítica.
    IF OLD.urgencia IS DISTINCT FROM NEW.urgencia
       AND NEW.urgencia = 'critica' AND COALESCE(OLD.urgencia,'') <> 'critica' THEN
      v_events := array_append(v_events, 'solicitacao_urgencia_critica');
    END IF;
  END IF;

  IF array_length(v_events,1) IS NULL THEN
    RETURN NEW;
  END IF;

  FOREACH v_ev IN ARRAY v_events LOOP
    v_transition := COALESCE(v_status_old,'') || '->' || COALESCE(v_status_new,'');
    v_payload := jsonb_build_object(
      'solicitacao_id',       NEW.id,
      'numero',               NEW.numero_solicitacao,
      'cliente_id',           NEW.cliente_id,
      'fazenda_id',           NEW.fazenda_id,
      'tipo_demanda',         NEW.tipo_demanda,
      'urgencia',             NEW.urgencia,
      'status_anterior',      v_status_old,
      'status_novo',          v_status_new,
      'consultor_atribuido',  NEW.consultor_atribuido,
      'origem_solicitacao',   NEW.origem_solicitacao,
      'ocorrido_em',          COALESCE(NEW.updated_at, now()),
      'transicao',            v_transition
    );
    v_idem := 'solicitacao:' || encode(
      digest(
        concat_ws('|',
          v_ev,
          NEW.id::text,
          v_transition,
          COALESCE(NEW.updated_at::text, '')
        ),
        'sha256'
      ),
      'hex'
    );
    -- Fail-fast: qualquer exceção propaga e reverte a mudança de status.
    PERFORM public._comunicacao_publish_system_event(
      v_ev, 'portal_solicitacoes', NEW.id, v_payload, v_idem
    );
  END LOOP;

  RETURN NEW;
END$function$;

-- Bloqueia execução direta por usuários finais (segue padrão dos helpers internos).
REVOKE ALL ON FUNCTION public._comunicacao_trg_portal_solicitacao() FROM PUBLIC;

-- 4) Instala trigger canônico e desanexa o legado no mesmo ato.
DROP TRIGGER IF EXISTS trg_comunicacao_solicitacao ON public.portal_solicitacoes;
CREATE TRIGGER trg_comunicacao_solicitacao
AFTER INSERT OR UPDATE ON public.portal_solicitacoes
FOR EACH ROW EXECUTE FUNCTION public._comunicacao_trg_portal_solicitacao();

DROP TRIGGER IF EXISTS trg_notify_solicitacao ON public.portal_solicitacoes;
-- Função pública `notify_solicitacao_atribuida()` é mantida para permitir rollback rápido.

COMMENT ON FUNCTION public._comunicacao_trg_portal_solicitacao() IS
  'Comunicação 1B: publica eventos solicitacao_* via _comunicacao_publish_system_event. Fail-fast.';
COMMENT ON TRIGGER trg_comunicacao_solicitacao ON public.portal_solicitacoes IS
  'Comunicação 1B: substitui trg_notify_solicitacao (desanexado no mesmo migration).';