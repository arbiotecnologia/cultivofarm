CREATE OR REPLACE FUNCTION platform_private.c2_external_origin_assert(s jsonb, partner uuid, client uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE uid uuid:=auth.uid(); org uuid; p public.partner_accounts;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE='42501'; END IF;
 SELECT * INTO p FROM public.partner_accounts WHERE id=partner FOR SHARE;
 org:=p.commercial_owner_organization_id;
 IF NOT FOUND OR p.ativo IS NOT TRUE OR p.deleted_at IS NOT NULL OR org IS NULL
 OR NOT EXISTS(SELECT 1 FROM public.organizations o WHERE o.id=org AND o.ativo AND o.status='ativa')
 OR EXISTS(SELECT 1 FROM public.organizations o WHERE o.partner_account_id=partner)
 OR NOT platform_private.c2_external_origin_contract_valid(s)
 OR s->>'organization_id' IS DISTINCT FROM org::text OR s->>'partner_id' IS DISTINCT FROM partner::text
 THEN RAISE EXCEPTION 'C2_EXTERNAL_ORIGIN_DENIED' USING ERRCODE='42501'; END IF;
 IF client IS DISTINCT FROM p.client_id OR (client IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.clientes c WHERE c.id=client AND c.organization_id=org))
 THEN RAISE EXCEPTION 'C2_EXTERNAL_CLIENT_DENIED' USING ERRCODE='42501'; END IF;
 -- Initial writes are authorized only inside the existing canonical create transaction.
 -- Subsequent administration uses P1's active internal owner authority, never buyer roles.
 IF platform_private.has_ticket('c2_external_order_create',partner) THEN
  IF s->>'actor_user_id' IS DISTINCT FROM uid::text OR NOT platform_private.c2_owner_order_create_allowed(uid,partner)
  THEN RAISE EXCEPTION 'C2_EXTERNAL_CREATE_DENIED' USING ERRCODE='42501'; END IF;
  ELSE
  IF public.h15_actor_organization() IS DISTINCT FROM org OR NOT platform_private.c2p1_settings_allowed(partner,true)
  THEN RAISE EXCEPTION 'C2_EXTERNAL_OWNER_DENIED' USING ERRCODE='42501'; END IF;
 END IF;
END $function$
