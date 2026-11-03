CREATE OR REPLACE FUNCTION platform_private.c1b_catalog_visibility_scope(p_partner uuid)
 RETURNS uuid[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_actor uuid; v_owner uuid;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE='42501'; END IF;
 v_actor := platform_private.h15_actor_organization();
 IF v_actor IS NULL AND NOT public.is_platform_superadmin(auth.uid()) THEN
  RAISE EXCEPTION 'catalog_actor_unavailable' USING ERRCODE='42501'; END IF;
 IF p_partner IS NULL THEN
  SELECT o.partner_account_id INTO p_partner FROM public.organizations o WHERE o.id=v_actor;
 END IF;
 IF p_partner IS NOT NULL THEN
  SELECT pa.commercial_owner_organization_id INTO v_owner FROM public.partner_accounts pa
   JOIN public.organizations o ON o.id=pa.commercial_owner_organization_id AND o.ativo IS TRUE AND o.status='ativa'
   WHERE pa.id=p_partner AND pa.ativo IS TRUE AND pa.deleted_at IS NULL;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'catalog_commercial_owner_unavailable' USING ERRCODE='42501'; END IF;
 END IF;
 IF v_actor IS NULL AND v_owner IS NULL THEN RAISE EXCEPTION 'catalog_scope_unavailable' USING ERRCODE='42501'; END IF;
 RETURN array_remove(ARRAY[v_actor,v_owner],NULL);
END $function$
