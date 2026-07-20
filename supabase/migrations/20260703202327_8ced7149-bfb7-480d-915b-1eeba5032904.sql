CREATE OR REPLACE FUNCTION public.refresh_esteira_laboratorio()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  REFRESH MATERIALIZED VIEW public.mv_esteira_laboratorio;
END;
$function$;

REVOKE ALL ON FUNCTION public.refresh_esteira_laboratorio() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.refresh_esteira_laboratorio() TO authenticated, service_role;

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

REVOKE ALL ON FUNCTION public.publish_planning_to_lab(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.publish_planning_to_lab(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.lab_request_replanning(p_os_id uuid, p_motivo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_partner_order_id uuid;
  v_planning_id uuid;
  v_partner_id uuid;
  v_uid uuid := auth.uid();
BEGIN
  IF p_motivo IS NULL OR length(trim(p_motivo)) < 3 THEN RAISE EXCEPTION 'reason_required'; END IF;
  IF NOT (public.has_role(v_uid,'administrador') OR public.has_role(v_uid,'producao')
          OR public.has_role(v_uid,'gestor') OR public.has_role(v_uid,'laboratorio')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT partner_order_id INTO v_partner_order_id FROM public.ordens_servico WHERE id = p_os_id FOR UPDATE;
  IF v_partner_order_id IS NULL THEN RAISE EXCEPTION 'order_not_found'; END IF;

  SELECT id, partner_id INTO v_planning_id, v_partner_id
  FROM public.production_planning WHERE partner_order_id = v_partner_order_id FOR UPDATE;
  IF v_planning_id IS NULL THEN RAISE EXCEPTION 'planning_not_found'; END IF;

  INSERT INTO public.laboratorio_esteira_eventos (os_id, acao, etapa_nova, usuario_id, observacao)
  VALUES (p_os_id, 'replanejamento_solicitado', 'replanejar', v_uid, p_motivo);

  UPDATE public.production_planning
     SET status = 'replanejar', updated_at = now(),
         production_notes = COALESCE(production_notes || E'\n', '') ||
                            '[' || to_char(now(),'DD/MM/YYYY HH24:MI') || '] Replanejamento: ' || p_motivo
   WHERE id = v_planning_id;

  INSERT INTO public.production_timeline_events (partner_order_id, event_type, actor_id, meta)
  VALUES (v_partner_order_id, 'replanejamento_solicitado', v_uid,
          jsonb_build_object('planning_id', v_planning_id, 'os_id', p_os_id, 'motivo', p_motivo));

  INSERT INTO public.partner_order_audit_logs (order_id, partner_id, usuario_id, acao, dados_novos)
  VALUES (v_partner_order_id, v_partner_id, v_uid, 'replanejamento_solicitado',
          jsonb_build_object('planning_id', v_planning_id, 'os_id', p_os_id, 'motivo', p_motivo));

  PERFORM public.refresh_esteira_laboratorio();

  RETURN jsonb_build_object('ok', true, 'planning_id', v_planning_id);
END
$function$;

REVOKE ALL ON FUNCTION public.lab_request_replanning(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lab_request_replanning(uuid, text) TO authenticated, service_role;

SELECT public.refresh_esteira_laboratorio();