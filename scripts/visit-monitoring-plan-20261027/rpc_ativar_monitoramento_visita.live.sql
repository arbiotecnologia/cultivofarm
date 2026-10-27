CREATE OR REPLACE FUNCTION public.rpc_ativar_monitoramento_visita(p_registro_id uuid, p_expected_version integer, p_tipo text, p_data_referencia date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_reg public.registros_consultor%ROWTYPE;
  v_id uuid;
  v_new_version integer;
BEGIN
  v_reg := public._visita_lock_and_check(p_registro_id, p_expected_version, false);

  IF p_tipo IS NULL OR btrim(p_tipo) = '' THEN
    RAISE EXCEPTION 'tipo_obrigatorio' USING ERRCODE = 'P0001';
  END IF;

  SELECT id INTO v_id FROM public.monitoramento_avisos
   WHERE registro_consultor_id = p_registro_id AND tipo = p_tipo
     AND data_referencia IS NOT DISTINCT FROM p_data_referencia
   LIMIT 1;

  IF v_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'id', v_id, 'version', v_reg.version, 'idempotent', true);
  END IF;

  INSERT INTO public.monitoramento_avisos (registro_consultor_id, tipo, data_referencia)
  VALUES (p_registro_id, p_tipo, p_data_referencia)
  RETURNING id INTO v_id;

  UPDATE public.registros_consultor
     SET version = COALESCE(version,1)+1, updated_at = now()
   WHERE id = p_registro_id
   RETURNING version INTO v_new_version;

  INSERT INTO public.visitas_logs (registro_consultor_id, usuario_id, acao, descricao, metadata)
  VALUES (p_registro_id, auth.uid(), 'monitoramento_ativado', 'Plano de monitoramento: ' || p_tipo,
          jsonb_build_object('tipo', p_tipo, 'data_referencia', p_data_referencia, 'version', v_new_version));

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'version', v_new_version);
END;
$function$
