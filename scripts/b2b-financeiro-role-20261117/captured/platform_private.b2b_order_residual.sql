CREATE OR REPLACE FUNCTION platform_private.b2b_order_residual(p_order uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE po public.partner_orders; s platform_private.b4_order_condition_snapshots; allocated numeric; total numeric; org uuid;
BEGIN
 SELECT * INTO po FROM public.partner_orders WHERE id=p_order;
 SELECT pa.commercial_owner_organization_id INTO org FROM public.partner_accounts pa WHERE pa.id=po.partner_id;
 IF org IS NULL THEN RAISE EXCEPTION 'CREDIT_ORDER_AMOUNT_UNPROVEN' USING ERRCODE='23514'; END IF;
 SELECT * INTO s FROM platform_private.b4_order_condition_snapshots WHERE order_id=p_order;
 total:=coalesce(s.financed_total,po.final_amount_with_interest);
 IF total IS NULL OR total<0 OR total::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'CREDIT_ORDER_AMOUNT_UNPROVEN' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM public.partner_order_financial_links l WHERE l.partner_order_id=p_order) THEN
  -- Legacy 1:1 can be netted only when the complete title is proven by the same projection.
  IF s.order_id IS NOT NULL OR (SELECT count(*) FROM public.partner_order_financial_links l WHERE l.partner_order_id=p_order)<>1 THEN RAISE EXCEPTION 'CREDIT_LEGACY_ALLOCATION_UNPROVEN' USING ERRCODE='23514'; END IF;
  PERFORM platform_private.b2b_proven_money_row_internal(i.id,org) FROM public.partner_order_financial_links l JOIN public.accounts_receivable a ON a.id=l.receivable_id JOIN public.accounts_receivable_installments i ON i.receivable_id=a.id WHERE l.partner_order_id=p_order;
  IF NOT EXISTS(SELECT 1 FROM public.partner_order_financial_links l JOIN public.accounts_receivable a ON a.id=l.receivable_id WHERE l.partner_order_id=p_order AND a.total_amount=total AND a.status<>'CANCELED') THEN RAISE EXCEPTION 'CREDIT_LEGACY_ALLOCATION_UNPROVEN' USING ERRCODE='23514'; END IF;
  RETURN 0;
 END IF;
 IF po.receivable_generated AND s.order_id IS NULL THEN RAISE EXCEPTION 'CREDIT_LEGACY_ALLOCATION_UNPROVEN' USING ERRCODE='23514'; END IF;
 SELECT coalesce(sum(x.principal+x.financed_interest),0) INTO allocated FROM platform_private.b2b_document_allocations x WHERE x.order_id=p_order AND NOT EXISTS(SELECT 1 FROM platform_private.b2b_allocation_reversals r WHERE r.document_id=x.document_id);
 IF allocated>total THEN RAISE EXCEPTION 'CREDIT_OVERALLOCATED' USING ERRCODE='23514'; END IF;
 RETURN total-allocated;
END $function$
