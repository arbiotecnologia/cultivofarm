CREATE OR REPLACE FUNCTION public._visita_lock_and_check(p_registro_id uuid, p_expected_version integer, p_require_approver boolean DEFAULT false)
 RETURNS registros_consultor
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_reg public.registros_consultor%ROWTYPE;
  v_scoped_gestor boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;
  -- Require current actor, role, active scope and tenant before locking or disclosing status.
  IF NOT COALESCE(public.can_view_technical_visit(v_uid, p_registro_id), false) THEN
    RAISE EXCEPTION 'forbidden_visita' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_reg
    FROM public.registros_consultor
   WHERE id = p_registro_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'registro_inexistente' USING ERRCODE = 'P0002';
  END IF;

  IF v_reg.cliente_id IS NOT NULL AND public.has_role(v_uid, 'gestor'::public.app_role) THEN
    v_scoped_gestor := public.has_active_user_cliente_access(
      v_uid, v_reg.cliente_id, ARRAY['manage']::text[]
    );
  END IF;

  IF p_require_approver THEN
    IF NOT (
      public.has_role(v_uid, 'administrador'::public.app_role)
      OR public.is_visit_org_manager(v_uid, p_registro_id)
      OR v_scoped_gestor
    ) THEN
      RAISE EXCEPTION 'forbidden_aprovacao' USING ERRCODE = '42501';
    END IF;
  ELSIF NOT public.can_manage_technical_visit(v_uid, p_registro_id) THEN
    RAISE EXCEPTION 'forbidden_visita' USING ERRCODE = '42501';
  END IF;

  IF p_expected_version IS NOT NULL
     AND COALESCE(v_reg.version, 1) <> p_expected_version THEN
    RAISE EXCEPTION 'version_conflict' USING ERRCODE = 'P0001';
  END IF;
  RETURN v_reg;
END
$function$