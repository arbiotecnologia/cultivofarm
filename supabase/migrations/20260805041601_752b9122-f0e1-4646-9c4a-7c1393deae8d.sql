DO $guard$
DECLARE
  c_expected constant text := 'ikaauvsflpmamgxmkhoq';
  c_prod constant text := 'navfzbwgwzruipouyfnk';
  v_ref text;
  v_count integer;
BEGIN
  IF to_regclass('public._fiscal_staging_marker') IS NULL THEN
    RAISE EXCEPTION 'GUARD_ABORT: marcador de staging inexistente';
  END IF;
  SELECT count(*), min(project_ref) INTO v_count, v_ref
    FROM public._fiscal_staging_marker WHERE marker = 'STAGING';
  IF v_count <> 1 OR v_ref IS NULL THEN
    RAISE EXCEPTION 'GUARD_ABORT: marcador de staging ausente ou ambiguo';
  END IF;
  IF v_ref = c_prod OR v_ref IS DISTINCT FROM c_expected THEN
    RAISE EXCEPTION 'GUARD_ABORT: ambiente nao autorizado';
  END IF;
END
$guard$;

CREATE OR REPLACE FUNCTION public.rpc_finalizar_visita_v2(
  p_registro_id uuid,
  p_expected_version integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_reg public.registros_consultor;
  v_is_admin boolean;
  v_has_scope boolean;
  v_diag_count integer;
  v_checkin_count integer;
  v_new_version integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_reg
    FROM public.registros_consultor
   WHERE id = p_registro_id
   FOR UPDATE;

  IF v_reg.id IS NULL THEN
    RAISE EXCEPTION 'registro_nao_encontrado' USING ERRCODE = 'P0002';
  END IF;

  v_is_admin := public.has_role(v_uid, 'administrador'::app_role);
  v_has_scope := v_reg.cliente_id IS NOT NULL
    AND public.has_active_user_cliente_access(v_uid, v_reg.cliente_id, ARRAY['execute','manage']);

  IF NOT (
    v_is_admin
    OR v_reg.created_by = v_uid
    OR v_reg.consultor_responsavel = v_uid
    OR v_has_scope
  ) THEN
    RAISE EXCEPTION 'sem_permissao' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_technical_visit_editable_status(v_reg.status::text) THEN
    RAISE EXCEPTION 'visita_nao_editavel' USING ERRCODE = '42501';
  END IF;

  IF COALESCE(p_expected_version, -1) <> v_reg.version THEN
    RAISE EXCEPTION 'version_conflict' USING ERRCODE = '40001';
  END IF;

  IF v_reg.cultura_id IS NULL THEN
    RAISE EXCEPTION 'cultura_obrigatoria' USING ERRCODE = '23514', DETAIL = 'invalid_request';
  END IF;

  SELECT count(*) INTO v_diag_count
    FROM public.visita_diagnosticos
   WHERE registro_id = p_registro_id;
  IF v_diag_count = 0 THEN
    RAISE EXCEPTION 'diagnostico_obrigatorio' USING ERRCODE = '23514';
  END IF;

  SELECT count(*) INTO v_checkin_count
    FROM public.visitas_checkin
   WHERE registro_consultor_id = p_registro_id;
  IF v_checkin_count = 0 THEN
    RAISE EXCEPTION 'checkin_obrigatorio' USING ERRCODE = '23514';
  END IF;

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

ALTER FUNCTION public.rpc_finalizar_visita_v2(uuid, integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.rpc_finalizar_visita_v2(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_finalizar_visita_v2(uuid, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_finalizar_visita_v2(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_finalizar_visita_v2(uuid, integer) TO service_role;
COMMENT ON FUNCTION public.rpc_finalizar_visita_v2(uuid, integer)
IS 'Finaliza visita sob lock; exige autorizacao, status editavel, versao corrente, cultura, diagnostico e check-in.';

DO $post$
DECLARE
  v_oid oid := to_regprocedure('public.rpc_finalizar_visita_v2(uuid,integer)')::oid;
BEGIN
  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'POST_ABORT: rpc_finalizar_visita_v2 ausente';
  END IF;
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = v_oid) THEN
    RAISE EXCEPTION 'POST_ABORT: rpc_finalizar_visita_v2 sem SECURITY DEFINER';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = v_oid AND proconfig @> ARRAY['search_path=public']) THEN
    RAISE EXCEPTION 'POST_ABORT: search_path incorreto';
  END IF;
  IF has_function_privilege('anon', v_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'POST_ABORT: anon possui EXECUTE';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc p,
      aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    WHERE p.oid = v_oid AND a.grantee = 0 AND a.privilege_type = 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'POST_ABORT: PUBLIC possui EXECUTE';
  END IF;
  IF position('cultura_obrigatoria' in pg_get_functiondef(v_oid)) = 0 THEN
    RAISE EXCEPTION 'POST_ABORT: gate de cultura ausente';
  END IF;
END
$post$;