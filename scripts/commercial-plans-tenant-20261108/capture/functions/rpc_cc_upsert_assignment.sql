CREATE OR REPLACE FUNCTION public.rpc_cc_upsert_assignment(p_id uuid, p_plan_id uuid, p_buyer_scope text, p_partner_id uuid, p_customer_id uuid, p_valid_from date, p_valid_until date, p_motivo text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_id uuid; v_before jsonb;
BEGIN
  IF NOT public.fn_cc_can_prepare(auth.uid()) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF NOT platform_private.c2p1_assignment_allowed(p_buyer_scope,p_partner_id,p_customer_id) THEN RAISE EXCEPTION 'C2P1_FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF p_id IS NULL THEN
    INSERT INTO public.commercial_payment_plan_assignments
      (plan_id,buyer_scope,partner_id,customer_id,valid_from,valid_until,motivo,created_by,updated_by)
    VALUES (p_plan_id,p_buyer_scope,p_partner_id,p_customer_id,
            COALESCE(p_valid_from,CURRENT_DATE),p_valid_until,p_motivo,auth.uid(),auth.uid())
    RETURNING id INTO v_id;
    PERFORM public.fn_cc_audit('assignment',v_id,'create',NULL,
      to_jsonb((SELECT a FROM public.commercial_payment_plan_assignments a WHERE a.id=v_id)),p_motivo);
  ELSE
    SELECT to_jsonb(a) INTO v_before FROM public.commercial_payment_plan_assignments a WHERE a.id=p_id AND platform_private.c2p1_assignment_allowed(a.buyer_scope,a.partner_id,a.customer_id) FOR UPDATE;
    IF v_before IS NULL THEN RAISE EXCEPTION 'C2P1_FORBIDDEN' USING ERRCODE='42501'; END IF;
    IF (v_before->>'status') <> 'draft' THEN RAISE EXCEPTION 'assignment_not_editable'; END IF;
    UPDATE public.commercial_payment_plan_assignments
       SET plan_id=p_plan_id, buyer_scope=p_buyer_scope, partner_id=p_partner_id, customer_id=p_customer_id,
           valid_from=COALESCE(p_valid_from,valid_from), valid_until=p_valid_until,
           motivo=p_motivo, updated_by=auth.uid()
     WHERE id=p_id RETURNING id INTO v_id;
    PERFORM public.fn_cc_audit('assignment',v_id,'update',v_before,
      to_jsonb((SELECT a FROM public.commercial_payment_plan_assignments a WHERE a.id=v_id)),p_motivo);
  END IF;
  RETURN v_id;
END $function$
