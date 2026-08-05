DO $guard$
DECLARE
  c_expected constant text := 'ikaauvsflpmamgxmkhoq';
  c_prod     constant text := 'navfzbwgwzruipouyfnk';
  v_rows integer; v_ref text;
BEGIN
  IF to_regclass('public._fiscal_staging_marker') IS NULL THEN
    RAISE EXCEPTION 'GUARD_ABORT: tabela public._fiscal_staging_marker inexistente';
  END IF;
  SELECT count(*) INTO v_rows FROM public._fiscal_staging_marker WHERE marker = 'STAGING';
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'GUARD_ABORT: esperada exatamente 1 linha marker=STAGING, encontradas %', v_rows;
  END IF;
  SELECT project_ref INTO v_ref FROM public._fiscal_staging_marker WHERE marker = 'STAGING';
  IF v_ref IS NULL THEN RAISE EXCEPTION 'GUARD_ABORT: project_ref nulo no marcador de staging'; END IF;
  IF v_ref = c_prod THEN RAISE EXCEPTION 'GUARD_ABORT: ambiente de producao recusado'; END IF;
  IF v_ref IS DISTINCT FROM c_expected THEN RAISE EXCEPTION 'GUARD_ABORT: ambiente % nao autorizado', v_ref; END IF;
END
$guard$;

-- Fail-closed em logica ternaria: comparacoes com colunas nulas nao podem
-- produzir NULL e escapar do IF NOT (...).
CREATE OR REPLACE FUNCTION public._assert_visita_editavel(p_registro_id uuid)
 RETURNS registros_consultor
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_reg public.registros_consultor;
  v_ok boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501'; END IF;

  SELECT * INTO v_reg FROM public.registros_consultor WHERE id = p_registro_id;
  IF v_reg.id IS NULL THEN RAISE EXCEPTION 'registro_nao_encontrado' USING ERRCODE = 'P0002'; END IF;

  v_ok := COALESCE(public.can_manage_technical_visit(v_uid, p_registro_id), false)
       OR COALESCE(v_reg.created_by = v_uid, false)
       OR COALESCE(v_reg.consultor_responsavel = v_uid, false)
       OR COALESCE(public.is_active_visit_participant(v_uid, p_registro_id), false);

  IF v_ok IS NOT TRUE THEN
    RAISE EXCEPTION 'sem_permissao' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_technical_visit_editable_status(v_reg.status::text) THEN
    RAISE EXCEPTION 'visita_nao_editavel' USING ERRCODE = '42501';
  END IF;

  RETURN v_reg;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_finalizar_visita_v2(p_registro_id uuid, p_expected_version integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_reg public.registros_consultor;
  v_ok boolean;
  v_diag_count integer;
  v_checkin_count integer;
  v_new_version integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501'; END IF;

  SELECT * INTO v_reg
    FROM public.registros_consultor
   WHERE id = p_registro_id
   FOR UPDATE;

  IF v_reg.id IS NULL THEN
    RAISE EXCEPTION 'registro_nao_encontrado' USING ERRCODE = 'P0002';
  END IF;

  v_ok := COALESCE(public.can_manage_technical_visit(v_uid, p_registro_id), false)
       OR COALESCE(v_reg.created_by = v_uid, false)
       OR COALESCE(v_reg.consultor_responsavel = v_uid, false)
       OR COALESCE(public.is_active_visit_participant(v_uid, p_registro_id), false);

  IF v_ok IS NOT TRUE THEN
    RAISE EXCEPTION 'sem_permissao' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_technical_visit_editable_status(v_reg.status::text) THEN
    RAISE EXCEPTION 'visita_nao_editavel' USING ERRCODE = '42501';
  END IF;

  IF COALESCE(p_expected_version, -1) <> v_reg.version THEN
    RAISE EXCEPTION 'version_conflict' USING ERRCODE = 'P0001';
  END IF;

  IF v_reg.cultura_id IS NULL THEN
    RAISE EXCEPTION 'cultura_obrigatoria' USING ERRCODE = '23514', DETAIL = 'invalid_request';
  END IF;

  SELECT count(*) INTO v_diag_count FROM public.visita_diagnosticos WHERE registro_id = p_registro_id;
  IF v_diag_count = 0 THEN RAISE EXCEPTION 'diagnostico_obrigatorio' USING ERRCODE = '23514'; END IF;

  SELECT count(*) INTO v_checkin_count FROM public.visitas_checkin WHERE registro_consultor_id = p_registro_id;
  IF v_checkin_count = 0 THEN RAISE EXCEPTION 'checkin_obrigatorio' USING ERRCODE = '23514'; END IF;

  v_new_version := v_reg.version + 1;

  UPDATE public.registros_consultor
     SET status = 'finalizado'::status_registro_consultor,
         finalized_at = now(),
         finalized_by = v_uid,
         version = v_new_version,
         pdf_status = COALESCE(pdf_status, 'pending'),
         updated_at = now()
   WHERE id = p_registro_id;

  INSERT INTO public.visitas_logs (registro_consultor_id, usuario_id, acao, descricao)
  VALUES (p_registro_id, v_uid, 'visita_finalizada', 'Visita finalizada via rpc_finalizar_visita_v2');

  RETURN jsonb_build_object(
    'id', p_registro_id,
    'status', 'finalizado',
    'version', v_new_version,
    'finalized_at', now()
  );
END;
$function$;

REVOKE ALL ON FUNCTION public._assert_visita_editavel(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_finalizar_visita_v2(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._assert_visita_editavel(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_finalizar_visita_v2(uuid, integer) TO authenticated, service_role;