
CREATE OR REPLACE FUNCTION public.rpc_get_my_visit_by_client_uuid(p_client_uuid uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.registros_consultor%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;
  IF p_client_uuid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_request');
  END IF;

  SELECT * INTO v_row
    FROM public.registros_consultor
    WHERE client_uuid = p_client_uuid
    LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_row.consultor_responsavel <> v_uid
     AND NOT (public.has_role(v_uid,'administrador') OR public.has_role(v_uid,'gestor')) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'registro_id', v_row.id,
    'status', v_row.status::text,
    'version', v_row.version,
    'pdf_status', v_row.pdf_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_get_my_visit_by_client_uuid(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_get_my_visit_by_client_uuid(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_get_my_visit_by_client_uuid(uuid) TO authenticated;
