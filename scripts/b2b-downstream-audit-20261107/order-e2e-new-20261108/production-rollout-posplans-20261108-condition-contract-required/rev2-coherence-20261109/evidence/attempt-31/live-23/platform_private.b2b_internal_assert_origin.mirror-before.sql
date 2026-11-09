CREATE OR REPLACE FUNCTION platform_private.b2b_internal_assert_origin(s jsonb, partner uuid, client uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE org uuid; uid uuid:=auth.uid();
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE='42501'; END IF;
 org:=public.h15_actor_organization();
 IF org IS NULL OR NOT public.fn_cc_can_prepare(uid) OR NOT public._saas_user_has_feature(uid,'pedidos_b2b') THEN RAISE EXCEPTION 'B2B_INTERNAL_ACTOR_DENIED' USING ERRCODE='42501'; END IF;
 IF NOT platform_private.b2b_internal_origin_valid(s) OR s->>'organization_id' IS DISTINCT FROM org::text OR s->>'partner_id' IS DISTINCT FROM partner::text THEN RAISE EXCEPTION 'B2B_INTERNAL_ORIGIN_DENIED' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.partner_accounts p WHERE p.id=partner AND p.commercial_owner_organization_id=org AND p.ativo IS TRUE AND p.deleted_at IS NULL
 AND (p.client_id IS NULL OR EXISTS(SELECT 1 FROM public.clientes c WHERE c.id=p.client_id AND c.organization_id=org))) THEN RAISE EXCEPTION 'B2B_INTERNAL_PARTNER_DENIED' USING ERRCODE='42501'; END IF;
 IF client IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.clientes c WHERE c.id=client AND c.organization_id=org) THEN RAISE EXCEPTION 'B2B_INTERNAL_CLIENT_DENIED' USING ERRCODE='42501'; END IF;
END $function$
