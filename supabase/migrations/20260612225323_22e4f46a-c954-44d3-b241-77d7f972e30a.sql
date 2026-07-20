
CREATE OR REPLACE FUNCTION public.rpc_resolver_alerta_operacional(p_alerta_id uuid, p_observacao text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_alerta record;
  v_dentro_sla boolean;
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('success',false,'error','unauthorized'); END IF;
  IF NOT public.can_user_access_alerta(p_alerta_id) THEN
    RETURN jsonb_build_object('success',false,'error','forbidden');
  END IF;

  SELECT * INTO v_alerta FROM public.alertas_operacionais WHERE id = p_alerta_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','alerta_nao_encontrado'); END IF;

  UPDATE public.alertas_operacionais
    SET status='resolvido', resolvido_por=auth.uid(), resolvido_em=now(), updated_at=now()
    WHERE id = p_alerta_id;

  INSERT INTO public.alertas_acoes(alerta_id, user_id, acao, observacao)
    VALUES (p_alerta_id, auth.uid(), 'resolver', p_observacao);

  IF v_alerta.sla_config_id IS NOT NULL THEN
    v_dentro_sla := v_alerta.sla_resolucao_em IS NULL OR now() <= v_alerta.sla_resolucao_em;
    INSERT INTO public.alertas_sla_eventos(alerta_id, config_id, evento, criado_por, responsavel_id)
      VALUES (p_alerta_id, v_alerta.sla_config_id,
        CASE WHEN v_dentro_sla THEN 'resolvido_dentro_sla' ELSE 'resolvido_fora_sla' END,
        auth.uid(), auth.uid());
  END IF;

  PERFORM public.rpc_recalcular_prioridade_alerta(p_alerta_id);
  RETURN jsonb_build_object('success',true);
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_ignorar_alerta_operacional(p_alerta_id uuid, p_observacao text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_alerta record;
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('success',false,'error','unauthorized'); END IF;
  IF NOT public.can_user_access_alerta(p_alerta_id) THEN
    RETURN jsonb_build_object('success',false,'error','forbidden');
  END IF;

  SELECT * INTO v_alerta FROM public.alertas_operacionais WHERE id = p_alerta_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','alerta_nao_encontrado'); END IF;

  UPDATE public.alertas_operacionais
    SET status='ignorado', ignorado_por=auth.uid(), ignorado_em=now(), updated_at=now()
    WHERE id = p_alerta_id;

  INSERT INTO public.alertas_acoes(alerta_id, user_id, acao, observacao)
    VALUES (p_alerta_id, auth.uid(), 'ignorar', p_observacao);

  IF v_alerta.sla_config_id IS NOT NULL THEN
    INSERT INTO public.alertas_sla_eventos(alerta_id, config_id, evento, criado_por)
      VALUES (p_alerta_id, v_alerta.sla_config_id, 'sla_cancelado', auth.uid());
  END IF;

  PERFORM public.rpc_recalcular_prioridade_alerta(p_alerta_id);
  RETURN jsonb_build_object('success',true);
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_reabrir_alerta_operacional(p_alerta_id uuid, p_observacao text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_alerta record;
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('success',false,'error','unauthorized'); END IF;
  IF NOT public.can_user_access_alerta(p_alerta_id) THEN
    RETURN jsonb_build_object('success',false,'error','forbidden');
  END IF;

  SELECT * INTO v_alerta FROM public.alertas_operacionais WHERE id = p_alerta_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','alerta_nao_encontrado'); END IF;

  UPDATE public.alertas_operacionais
    SET status='reaberto', resolvido_por=NULL, resolvido_em=NULL,
        ignorado_por=NULL, ignorado_em=NULL, updated_at=now()
    WHERE id = p_alerta_id;

  INSERT INTO public.alertas_acoes(alerta_id, user_id, acao, observacao)
    VALUES (p_alerta_id, auth.uid(), 'reabrir', p_observacao);

  IF v_alerta.sla_config_id IS NOT NULL THEN
    INSERT INTO public.alertas_sla_eventos(alerta_id, config_id, evento, criado_por)
      VALUES (p_alerta_id, v_alerta.sla_config_id, 'sla_reaberto', auth.uid());
  END IF;

  PERFORM public.rpc_recalcular_prioridade_alerta(p_alerta_id);
  RETURN jsonb_build_object('success',true);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_resolver_alerta_operacional(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_ignorar_alerta_operacional(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_reabrir_alerta_operacional(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_resolver_alerta_operacional(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_ignorar_alerta_operacional(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_reabrir_alerta_operacional(uuid, text) TO authenticated, service_role;
