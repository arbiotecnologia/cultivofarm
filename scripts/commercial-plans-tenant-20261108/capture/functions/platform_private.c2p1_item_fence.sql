CREATE OR REPLACE FUNCTION platform_private.c2p1_item_fence()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE r public.commercial_condition_item_prices;
BEGIN
 IF TG_OP='DELETE' THEN r=OLD; ELSE r=NEW; END IF;
 PERFORM 1 FROM public.profiles WHERE user_id=auth.uid() FOR SHARE NOWAIT;
 PERFORM 1 FROM public.user_roles WHERE user_id=auth.uid() ORDER BY role FOR SHARE NOWAIT;
 PERFORM 1 FROM public.organizations WHERE id IN (public.h15_actor_organization(),(SELECT commercial_owner_organization_id FROM public.partner_accounts WHERE id=r.partner_id),(SELECT organization_id FROM public.clientes WHERE id=r.customer_id)) ORDER BY id FOR SHARE NOWAIT;
 PERFORM 1 FROM public.partner_accounts WHERE id IN(r.partner_id,CASE WHEN TG_OP='UPDATE' THEN OLD.partner_id ELSE NULL END) ORDER BY id FOR SHARE NOWAIT;
 PERFORM 1 FROM public.clientes WHERE id IN(r.customer_id,CASE WHEN TG_OP='UPDATE' THEN OLD.customer_id ELSE NULL END) ORDER BY id FOR SHARE NOWAIT;
 PERFORM 1 FROM public.commercial_payment_plan_assignments WHERE id IN(r.assignment_id,CASE WHEN TG_OP='UPDATE' THEN OLD.assignment_id ELSE NULL END) ORDER BY id FOR SHARE NOWAIT;
 IF NOT platform_private.c2p1_item_allowed(r.assignment_id,r.plan_id,r.buyer_scope,r.partner_id,r.customer_id)
 OR (TG_OP='UPDATE' AND NOT platform_private.c2p1_item_allowed(OLD.assignment_id,OLD.plan_id,OLD.buyer_scope,OLD.partner_id,OLD.customer_id)) THEN
 RAISE EXCEPTION 'C2P1_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF TG_OP='UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id OR NEW.created_at IS DISTINCT FROM OLD.created_at) THEN RAISE EXCEPTION 'C2P1_IDENTITY_IMMUTABLE' USING ERRCODE='42501'; END IF;
 IF TG_OP<>'DELETE' AND r.published_rule_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.commercial_price_rules pr WHERE pr.id=r.published_rule_id AND pr.plan_id=r.plan_id AND pr.buyer_scope=r.buyer_scope
 AND pr.partner_id IS NOT DISTINCT FROM r.partner_id AND pr.customer_id IS NOT DISTINCT FROM r.customer_id
 AND pr.product_id IS NOT DISTINCT FROM r.product_id AND pr.microrganismo_id IS NOT DISTINCT FROM r.microrganismo_id
 AND pr.unit_type=r.unit_type AND pr.volume_ml IS NOT DISTINCT FROM r.volume_ml) THEN RAISE EXCEPTION 'C2P1_RULE_LINK_INVALID' USING ERRCODE='42501'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $function$
