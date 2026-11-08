CREATE OR REPLACE FUNCTION platform_private.c2p1_rule_fence()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE r public.commercial_price_rules;
BEGIN
 IF TG_OP='DELETE' THEN r=OLD; ELSE r=NEW; END IF;
 PERFORM 1 FROM public.profiles WHERE user_id=auth.uid() FOR SHARE NOWAIT;
 PERFORM 1 FROM public.user_roles WHERE user_id=auth.uid() ORDER BY role FOR SHARE NOWAIT;
 PERFORM 1 FROM public.organizations WHERE id IN (public.h15_actor_organization(),(SELECT commercial_owner_organization_id FROM public.partner_accounts WHERE id=r.partner_id),(SELECT organization_id FROM public.clientes WHERE id=r.customer_id)) ORDER BY id FOR SHARE NOWAIT;
 PERFORM 1 FROM public.partner_accounts WHERE id IN(r.partner_id,CASE WHEN TG_OP='UPDATE' THEN OLD.partner_id ELSE NULL END) ORDER BY id FOR SHARE NOWAIT;
 PERFORM 1 FROM public.clientes WHERE id IN(r.customer_id,CASE WHEN TG_OP='UPDATE' THEN OLD.customer_id ELSE NULL END) ORDER BY id FOR SHARE NOWAIT;
 IF NOT platform_private.c2p1_assignment_allowed(r.buyer_scope,r.partner_id,r.customer_id)
 OR (TG_OP='UPDATE' AND NOT platform_private.c2p1_assignment_allowed(OLD.buyer_scope,OLD.partner_id,OLD.customer_id)) THEN RAISE EXCEPTION 'C2P1_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF TG_OP='UPDATE' AND EXISTS(SELECT 1 FROM public.commercial_condition_item_prices i WHERE i.published_rule_id=OLD.id AND (NEW.id IS DISTINCT FROM OLD.id OR i.plan_id IS DISTINCT FROM NEW.plan_id OR i.buyer_scope IS DISTINCT FROM NEW.buyer_scope OR i.partner_id IS DISTINCT FROM NEW.partner_id OR i.customer_id IS DISTINCT FROM NEW.customer_id OR i.product_id IS DISTINCT FROM NEW.product_id OR i.microrganismo_id IS DISTINCT FROM NEW.microrganismo_id OR i.unit_type IS DISTINCT FROM NEW.unit_type OR i.volume_ml IS DISTINCT FROM NEW.volume_ml)) THEN RAISE EXCEPTION 'C2P1_RULE_LINK_IMMUTABLE' USING ERRCODE='42501'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $function$
