CREATE OR REPLACE FUNCTION platform_private.c2p1_assignment_fence()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'C2P1_ASSIGNMENT_DELETE_CLOSED' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.profiles WHERE user_id=auth.uid() FOR SHARE NOWAIT;
 PERFORM 1 FROM public.user_roles WHERE user_id=auth.uid() ORDER BY role FOR SHARE NOWAIT;
 PERFORM 1 FROM public.organizations WHERE id IN (public.h15_actor_organization(),
 (SELECT commercial_owner_organization_id FROM public.partner_accounts WHERE id=NEW.partner_id),
 (SELECT organization_id FROM public.clientes WHERE id=NEW.customer_id)) ORDER BY id FOR SHARE NOWAIT;
 PERFORM 1 FROM public.partner_accounts WHERE id IN (NEW.partner_id,CASE WHEN TG_OP='UPDATE' THEN OLD.partner_id ELSE NULL END) ORDER BY id FOR SHARE NOWAIT;
 PERFORM 1 FROM public.clientes WHERE id IN (NEW.customer_id,CASE WHEN TG_OP='UPDATE' THEN OLD.customer_id ELSE NULL END) ORDER BY id FOR SHARE NOWAIT;
 IF TG_OP='UPDATE' AND NOT platform_private.c2p1_assignment_allowed(OLD.buyer_scope,OLD.partner_id,OLD.customer_id)
 THEN RAISE EXCEPTION 'C2P1_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF NOT platform_private.c2p1_assignment_allowed(NEW.buyer_scope,NEW.partner_id,NEW.customer_id)
 THEN RAISE EXCEPTION 'C2P1_FORBIDDEN' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $function$
