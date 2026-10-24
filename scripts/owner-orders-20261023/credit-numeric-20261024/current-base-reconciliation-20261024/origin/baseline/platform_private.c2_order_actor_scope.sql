CREATE OR REPLACE FUNCTION platform_private.c2_order_actor_scope(_uid uuid, _partner uuid)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE s record;
BEGIN
  IF public.has_role(_uid,'parceiro_b2b_tecnico'::public.app_role) AND public.has_role(_uid,'parceiro_b2b'::public.app_role)
     AND NOT public.is_platform_superadmin(_uid) THEN
    IF _uid IS NULL OR auth.uid() IS DISTINCT FROM _uid THEN RAISE EXCEPTION 'auth_required' USING ERRCODE='42501'; END IF;
    IF NOT platform_private.c2_owner_order_create_allowed(_uid,_partner) THEN
      RAISE EXCEPTION 'forbidden_financial_terms' USING ERRCODE='42501';
    END IF;
    SELECT * INTO s FROM platform_private.b2b_actor_scope(_uid);
    IF NOT s.profile_ok THEN RAISE EXCEPTION 'inactive_scope' USING ERRCODE='42501'; END IF;
    IF s.org_partner IS DISTINCT FROM _partner OR NOT s.partner_valid
       OR s.user_partner_count <> 1 OR s.user_partner IS DISTINCT FROM _partner THEN
      RAISE EXCEPTION 'forbidden_partner' USING ERRCODE='42501';
    END IF;
    RETURN;
  END IF;
  PERFORM platform_private.assert_b2b_partner_scope(_uid,_partner);
END $function$
