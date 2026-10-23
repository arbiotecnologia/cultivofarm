CREATE OR REPLACE FUNCTION platform_private.assert_b2b_partner_scope(_uid uuid, _partner uuid)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE s record;
BEGIN
  IF _uid IS NULL OR auth.uid() IS NULL OR _uid <> auth.uid() THEN
    RAISE EXCEPTION 'auth_required' USING ERRCODE='42501';
  END IF;
  IF _partner IS NULL OR NOT EXISTS (SELECT 1 FROM public.partner_accounts pa
       WHERE pa.id = _partner AND pa.ativo = true AND pa.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'partner_not_found' USING ERRCODE='42501';
  END IF;
  IF public.is_platform_superadmin(_uid) THEN RETURN; END IF;
  IF public.has_role(_uid,'parceiro_b2b_tecnico'::app_role) THEN
    RAISE EXCEPTION 'forbidden_financial_terms' USING ERRCODE='42501';
  END IF;
  SELECT * INTO s FROM platform_private.b2b_actor_scope(_uid);
  IF NOT s.profile_ok THEN RAISE EXCEPTION 'inactive_scope' USING ERRCODE='42501'; END IF;
  IF s.org_partner IS DISTINCT FROM _partner OR NOT s.partner_valid THEN
    RAISE EXCEPTION 'forbidden_partner' USING ERRCODE='42501';
  END IF;
  IF public.has_role(_uid,'parceiro_b2b'::app_role) THEN
    IF s.user_partner_count <> 1 OR s.user_partner IS DISTINCT FROM _partner THEN
      RAISE EXCEPTION 'forbidden_partner' USING ERRCODE='42501';
    END IF;
    RETURN;
  END IF;
  IF NOT (public.has_role(_uid,'administrador'::app_role) OR public.has_role(_uid,'financeiro'::app_role)
          OR public.has_role(_uid,'gestor_comercial'::app_role)) THEN
    RAISE EXCEPTION 'forbidden_role' USING ERRCODE='42501';
  END IF;
END $function$
