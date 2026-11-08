CREATE OR REPLACE FUNCTION public.rpc_cc_publish_assignment(p_id uuid, p_motivo text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM 1 FROM public.commercial_payment_plan_assignments a WHERE a.id=p_id AND platform_private.c2p1_assignment_allowed(a.buyer_scope,a.partner_id,a.customer_id) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'C2P1_FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF NOT public.fn_cc_can_publish(auth.uid()) THEN RAISE EXCEPTION 'not_authorized_publish'; END IF;
  UPDATE public.commercial_payment_plan_assignments
     SET status='published', published_by=auth.uid(), published_at=now(), updated_by=auth.uid()
   WHERE id=p_id AND status IN ('draft','pending_approval');
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid_transition'; END IF;
  PERFORM public.fn_cc_audit('assignment',p_id,'publish',NULL,NULL,p_motivo);
END $function$
