CREATE OR REPLACE FUNCTION platform_private.b2b_own_obligations_owner(p_partner_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE u uuid:=auth.uid(); s record; owner uuid;
BEGIN
 IF u IS NULL OR NOT platform_private.platform_actor_access_ready(u)
  OR NOT public.has_role(u,'parceiro_b2b') THEN
  RAISE EXCEPTION 'own_finance_forbidden' USING ERRCODE='42501'; END IF;
 IF NOT public.is_valid_b2b_partner_user(u,p_partner_id) THEN
 RAISE EXCEPTION 'own_finance_forbidden' USING ERRCODE='42501'; END IF;
 SELECT pa.commercial_owner_organization_id INTO owner FROM public.partner_accounts pa
 JOIN public.partner_users pu ON pu.partner_id=pa.id
 JOIN public.profiles pf ON pf.user_id=pu.user_id
 JOIN public.organizations o ON o.id=pa.commercial_owner_organization_id
 WHERE pa.id=p_partner_id AND pu.user_id=u
 AND pu.revoked_at IS NULL AND pu.valid_from<=now()
 AND pf.ativo AND o.ativo AND o.status='ativa' AND pa.ativo AND pa.deleted_at IS NULL
 AND pf.organization_id=pu.tenant_id AND pu.tenant_id=o.id
 AND public.h15_actor_organization()=o.id;
 IF owner IS NULL OR NOT EXISTS(SELECT 1 FROM platform_private.entitlements_for_user(u) e WHERE e.feature_key='pedidos_b2b')
 OR NOT EXISTS(SELECT 1 FROM platform_private.entitlements_for_user(u) e WHERE e.feature_key='contas_receber') THEN
  RAISE EXCEPTION 'own_finance_forbidden' USING ERRCODE='42501'; END IF;
 RETURN owner;
END $function$
