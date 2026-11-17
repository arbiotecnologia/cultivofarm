CREATE OR REPLACE FUNCTION public.tenant_admin_user_access_exec_v1(p_actor uuid, p_actor_iat bigint, p_op text, p_args jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE a jsonb := COALESCE(p_args, '{}'::jsonb);
  roles_of constant text := 'SELECT ARRAY(SELECT jsonb_array_elements_text(COALESCE($1, ''[]''::jsonb))::public.app_role)';
  v_roles public.app_role[]; v_rm public.app_role[];
BEGIN
  IF auth.uid() IS NOT NULL THEN RAISE EXCEPTION 'service_context_required' USING ERRCODE='42501'; END IF;
  IF jsonb_typeof(a) <> 'object' THEN RAISE EXCEPTION 'invalid_args' USING ERRCODE='22023'; END IF;
  IF p_op = 'change_access_type' THEN
    IF EXISTS (SELECT 1 FROM jsonb_object_keys(a) k WHERE k NOT IN ('user_id','target','roles','remove_roles','cliente_id','idempotency_key','reason')) THEN
      RAISE EXCEPTION 'invalid_args' USING ERRCODE='22023'; END IF;
    EXECUTE roles_of INTO v_roles USING a->'roles'; EXECUTE roles_of INTO v_rm USING a->'remove_roles';
    RETURN platform_private.user_admin_change_access_type_core(p_actor, p_actor_iat, (a->>'user_id')::uuid, a->>'target', v_roles, v_rm,
      NULLIF(a->>'cliente_id','')::uuid, (a->>'idempotency_key')::uuid, a->>'reason');
  ELSIF p_op = 'consultor_link' THEN
    IF EXISTS (SELECT 1 FROM jsonb_object_keys(a) k WHERE k NOT IN ('user_id','action','cliente_id','replace_cliente_id','access_level','valid_from','valid_until','idempotency_key','reason')) THEN
      RAISE EXCEPTION 'invalid_args' USING ERRCODE='22023'; END IF;
    RETURN platform_private.user_admin_consultor_link_core(p_actor, p_actor_iat, (a->>'user_id')::uuid, a->>'action', (a->>'cliente_id')::uuid,
      NULLIF(a->>'replace_cliente_id','')::uuid, NULLIF(a->>'access_level','')::public.access_level_tecnico,
      NULLIF(a->>'valid_from','')::timestamptz, NULLIF(a->>'valid_until','')::timestamptz, (a->>'idempotency_key')::uuid, a->>'reason');
  END IF;
  RAISE EXCEPTION 'invalid_op' USING ERRCODE='22023';
END $function$
