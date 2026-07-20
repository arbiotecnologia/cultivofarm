-- B0.4 · Reforço multi-tenant no fallback: gestor precisa ter vínculo ativo com o cliente da visita
CREATE OR REPLACE FUNCTION public.rpc_get_my_visit_by_client_uuid(p_client_uuid uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.registros_consultor%ROWTYPE;
  v_is_admin boolean;
  v_is_gestor boolean;
  v_has_scope boolean;
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

  v_is_admin  := public.has_role(v_uid, 'administrador');
  v_is_gestor := public.has_role(v_uid, 'gestor');

  IF v_row.consultor_responsavel <> v_uid AND NOT v_is_admin THEN
    -- Gestor só acessa se tiver vínculo ativo com o cliente da visita (multi-tenant)
    IF v_is_gestor THEN
      v_has_scope := public.has_active_user_cliente_access(
        v_uid, v_row.cliente_id, ARRAY['view','execute','manage']
      );
      IF NOT v_has_scope THEN
        RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
      END IF;
    ELSE
      RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'registro_id', v_row.id,
    'status', v_row.status::text,
    'version', v_row.version,
    'pdf_status', v_row.pdf_status
  );
END;
$function$;