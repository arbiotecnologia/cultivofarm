CREATE OR REPLACE FUNCTION platform_private.c2_internal_order_target_reason(_uid uuid, _partner uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE s record; org uuid;
BEGIN
  -- Mirrors LIVE guards; NULL means allowed. Never authorizes by itself: callers must RAISE.
  IF _uid IS NULL OR auth.uid() IS DISTINCT FROM _uid THEN RETURN 'auth_required'; END IF;
  IF NOT platform_private.b2b_internal_commercial_actor() THEN RETURN 'actor_not_allowed'; END IF;
  SELECT * INTO s FROM platform_private.b2b_actor_scope(_uid);
  IF s.profile_ok IS NOT TRUE THEN RETURN 'inactive_scope'; END IF;
  IF NOT public._saas_user_has_feature(_uid,'pedidos_b2b') THEN RETURN 'feature_disabled'; END IF;
  org := public.h15_actor_organization();
  IF org IS NULL THEN RETURN 'actor_not_allowed'; END IF;
  IF _partner IS NULL THEN RETURN NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.partner_accounts p
       WHERE p.id=_partner AND p.ativo IS TRUE AND p.deleted_at IS NULL AND p.commercial_owner_organization_id=org
         AND (p.client_id IS NULL OR EXISTS (SELECT 1 FROM public.clientes c WHERE c.id=p.client_id AND c.organization_id=org))) THEN
    RETURN 'target_outside_portfolio';
  END IF;
  RETURN NULL;
END $function$