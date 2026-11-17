CREATE OR REPLACE FUNCTION platform_private.b2b_integration_actor(p_partner uuid, p_internal boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE u uuid:=auth.uid(); org uuid:=public.h15_actor_organization(); owner_org uuid;
BEGIN
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'B2B_READ_COMMITTED_REQUIRED' USING ERRCODE='0A000'; END IF;
 IF u IS NULL AND org IS NULL AND p_internal THEN
  SELECT p.organization_id INTO owner_org FROM platform_private.b2b_fiscal_service_permits p
  WHERE p.transaction_id=txid_current() AND p.partner_id=p_partner;
  IF owner_org IS NOT NULL AND EXISTS(SELECT 1 FROM public.partner_accounts pa
    WHERE pa.id=p_partner AND pa.commercial_owner_organization_id=owner_org AND pa.ativo IS TRUE AND pa.deleted_at IS NULL) THEN
   RETURN owner_org;
  END IF;
 END IF;
 IF u IS NULL OR org IS NULL THEN RAISE EXCEPTION 'B2B_ACTOR_DENIED' USING ERRCODE='42501'; END IF;
 PERFORM platform_private.c2_order_actor_scope(u,p_partner);
 SELECT commercial_owner_organization_id INTO owner_org FROM public.partner_accounts WHERE id=p_partner AND ativo IS TRUE AND deleted_at IS NULL;
 IF owner_org IS DISTINCT FROM org THEN RAISE EXCEPTION 'B2B_TENANT_DENIED' USING ERRCODE='42501'; END IF;
 IF p_internal AND (public.is_financial_staff(u) IS NOT TRUE
  OR public.has_role(u,'parceiro_b2b'::public.app_role) OR public.has_role(u,'parceiro_b2b_tecnico'::public.app_role)
  OR public.has_role(u,'cliente_produtor'::public.app_role)) THEN RAISE EXCEPTION 'B2B_INTERNAL_ONLY' USING ERRCODE='42501'; END IF;
 RETURN org;
END $function$
