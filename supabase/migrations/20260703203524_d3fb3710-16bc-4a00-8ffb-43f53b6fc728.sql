
-- Fix status transition: publish should move OS aprovada -> programada,
-- and assumir_producao should ensure OS is 'programada' before moving to em_producao.

CREATE OR REPLACE FUNCTION public.publish_planning_to_lab(p_planning_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_pl public.production_planning%ROWTYPE;
  v_result jsonb;
  v_count int;
  v_uid uuid := auth.uid();
BEGIN
  IF NOT (public.has_role(v_uid,'administrador') OR public.has_role(v_uid,'producao') OR public.has_role(v_uid,'gestor')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO v_pl FROM public.production_planning WHERE id = p_planning_id FOR UPDATE;
  IF v_pl.id IS NULL THEN RAISE EXCEPTION 'planning_not_found'; END IF;

  IF v_pl.status IN ('em_producao','produzido','entregue') THEN
    RAISE EXCEPTION 'already_published';
  END IF;

  IF v_pl.planned_start_date IS NOT NULL AND v_pl.planned_finish_date IS NOT NULL
     AND v_pl.planned_finish_date < v_pl.planned_start_date THEN
    RAISE EXCEPTION 'invalid_dates';
  END IF;

  PERFORM public._validate_planning_integrity(v_pl.partner_order_id);

  v_result := public.generate_production_orders_from_partner(v_pl.partner_order_id);
  v_count := COALESCE((v_result->>'os_created')::int, 0);

  IF v_count = 0 AND NOT EXISTS (
    SELECT 1 FROM public.production_order_link WHERE planning_id = v_pl.id
  ) THEN
    RAISE EXCEPTION 'no_items';
  END IF;

  INSERT INTO public.laboratorio_esteira_eventos (os_id, origem_os, acao, etapa_nova, usuario_id, observacao)
  SELECT os.id, COALESCE(os.origem,'b2b'), 'demanda_publicada', 'recebido_no_lab', v_uid,
         'Planejamento publicado no Cockpit'
  FROM public.ordens_servico os
  WHERE os.partner_order_id = v_pl.partner_order_id
    AND NOT EXISTS (
      SELECT 1 FROM public.laboratorio_esteira_eventos e
      WHERE e.os_id = os.id AND e.acao = 'demanda_publicada'
    );

  -- Advance OS status aprovada -> programada so the treadmill transitions are valid.
  UPDATE public.ordens_servico
     SET status = 'programada'
   WHERE partner_order_id = v_pl.partner_order_id
     AND status::text = 'aprovada';

  UPDATE public.production_planning
     SET status = 'planejado', updated_at = now()
   WHERE id = v_pl.id AND status IN ('aguardando_planejamento','replanejar');

  INSERT INTO public.production_timeline_events (partner_order_id, event_type, actor_id, meta)
  VALUES (v_pl.partner_order_id, 'planejamento_publicado', v_uid,
          jsonb_build_object('planning_id', v_pl.id, 'os_created', v_count));

  INSERT INTO public.partner_order_audit_logs (order_id, partner_id, usuario_id, acao, dados_novos)
  VALUES (v_pl.partner_order_id, v_pl.partner_id, v_uid, 'planejamento_publicado',
          jsonb_build_object('planning_id', v_pl.id, 'os_created', v_count));

  PERFORM public.refresh_esteira_laboratorio();

  RETURN jsonb_build_object('ok', true, 'planning_id', v_pl.id, 'os_created', v_count);
END
$function$;

-- Backfill: existing OS with programação published but still marked 'aprovada'
UPDATE public.ordens_servico os
   SET status = 'programada'
 WHERE status::text = 'aprovada'
   AND EXISTS (
     SELECT 1 FROM public.programacao_producao pp WHERE pp.ordem_servico_id = os.id
   );

UPDATE public.ordens_servico_onfarm os
   SET status = 'programada'
 WHERE status::text = 'aprovada'
   AND EXISTS (
     SELECT 1 FROM public.programacao_producao pp WHERE pp.ordem_servico_onfarm_id = os.id
   );

-- Harden RPC: ensure OS is at 'programada' before advancing to 'em_producao'
CREATE OR REPLACE FUNCTION public.rpc_avancar_esteira_laboratorio(p_os_id uuid, p_origem text, p_etapa_destino text, p_programacao_id uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_user_id uuid;
    v_profile_id uuid;
    v_role text;
    v_status_os text;
    v_etapa_anterior text;
    v_result jsonb;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Não autenticado');
    END IF;

    SELECT role::text INTO v_role
    FROM public.user_roles
    WHERE user_id = v_user_id
      AND role IN ('administrador', 'gestor', 'producao', 'administrativo')
    LIMIT 1;

    IF v_role IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Seu perfil não possui permissão para avançar a esteira laboratorial.');
    END IF;

    SELECT id INTO v_profile_id FROM public.profiles WHERE user_id = v_user_id LIMIT 1;

    IF p_origem IN ('manual','b2b') THEN
        SELECT status::text INTO v_status_os FROM public.ordens_servico WHERE id = p_os_id;
        IF NOT FOUND OR v_status_os IS NULL THEN RETURN jsonb_build_object('success', false, 'message', 'Ordem de serviço não encontrada.'); END IF;
    ELSIF p_origem = 'onfarm' THEN
        SELECT status::text INTO v_status_os FROM public.ordens_servico_onfarm WHERE id = p_os_id;
        IF NOT FOUND OR v_status_os IS NULL THEN RETURN jsonb_build_object('success', false, 'message', 'Ordem de serviço On-Farm não encontrada.'); END IF;
    ELSE
        RETURN jsonb_build_object('success', false, 'message', 'Origem de OS inválida: ' || p_origem);
    END IF;

    v_etapa_anterior := v_status_os;

    IF v_status_os IN ('finalizada', 'cancelada') THEN
        RETURN jsonb_build_object('success', false, 'message', 'Operação não permitida: OS já está ' || v_status_os);
    END IF;

    CASE p_etapa_destino
        WHEN 'assumir_producao' THEN
            IF p_programacao_id IS NULL THEN
                RETURN jsonb_build_object('success', false, 'message', 'ID da programação é obrigatório para assumir produção.');
            END IF;
            IF v_profile_id IS NULL THEN
                RETURN jsonb_build_object('success', false, 'message', 'Perfil do usuário não encontrado.');
            END IF;

            -- Ensure OS is at 'programada' before advancing to 'em_producao' (the trigger only allows +1 step transitions)
            IF v_status_os = 'aprovada' THEN
                IF p_origem = 'onfarm' THEN
                    UPDATE public.ordens_servico_onfarm SET status = 'programada' WHERE id = p_os_id;
                ELSE
                    UPDATE public.ordens_servico SET status = 'programada' WHERE id = p_os_id;
                END IF;
                v_status_os := 'programada';
            END IF;

            IF v_status_os <> 'programada' THEN
                RETURN jsonb_build_object('success', false, 'message', 'OS precisa estar em status "programada" para assumir produção. Status atual: ' || v_status_os);
            END IF;

            UPDATE public.programacao_producao
            SET status = 'em_producao', responsavel_id = v_profile_id
            WHERE id = p_programacao_id;

            IF p_origem = 'onfarm' THEN
                UPDATE public.ordens_servico_onfarm SET status = 'em_producao' WHERE id = p_os_id;
            ELSE
                UPDATE public.ordens_servico SET status = 'em_producao' WHERE id = p_os_id;
            END IF;

            INSERT INTO public.laboratorio_esteira_eventos (os_id, origem_os, programacao_id, etapa_anterior, etapa_nova, acao, usuario_id)
            VALUES (p_os_id, p_origem, p_programacao_id, v_etapa_anterior, p_etapa_destino, p_etapa_destino, v_user_id);

            PERFORM public.refresh_esteira_laboratorio();
            RETURN jsonb_build_object('success', true, 'message', 'Produção assumida com sucesso');
        ELSE
            v_result := public._rpc_avancar_esteira_laboratorio_internal(p_os_id, p_origem, p_etapa_destino, p_programacao_id);
            IF COALESCE((v_result->>'success')::boolean, false) THEN
              PERFORM public.refresh_esteira_laboratorio();
            END IF;
            RETURN v_result;
    END CASE;
END;
$function$;
