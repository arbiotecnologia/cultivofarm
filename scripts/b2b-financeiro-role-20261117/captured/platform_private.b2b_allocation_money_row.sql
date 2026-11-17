CREATE OR REPLACE FUNCTION platform_private.b2b_allocation_money_row(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE i public.accounts_receivable_installments; a public.accounts_receivable; x platform_private.b2b_document_allocations; row jsonb;
BEGIN
 SELECT * INTO i FROM public.accounts_receivable_installments WHERE id=p_id;
 SELECT * INTO a FROM public.accounts_receivable WHERE id=i.receivable_id AND organization_id=i.organization_id;
 SELECT * INTO x FROM platform_private.b2b_document_allocations WHERE receivable_id=a.id AND organization_id=a.organization_id;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF a.origin_type IS DISTINCT FROM 'B2B_ORDER' OR a.origin_id IS DISTINCT FROM x.order_id OR a.partner_id IS DISTINCT FROM x.partner_id OR a.b2b_document_id IS DISTINCT FROM x.document_id
 OR (SELECT count(*) FROM public.accounts_receivable_installments s WHERE s.receivable_id=a.id)<>jsonb_array_length(x.rows)
 OR (SELECT count(DISTINCT s.installment_number) FROM public.accounts_receivable_installments s WHERE s.receivable_id=a.id)<>jsonb_array_length(x.rows)
 OR (SELECT sum((r->>'principal_amount')::numeric) FROM jsonb_array_elements(x.rows) r) IS DISTINCT FROM x.principal
 OR (SELECT sum((r->>'interest_amount')::numeric) FROM jsonb_array_elements(x.rows) r) IS DISTINCT FROM x.financed_interest
 OR NOT EXISTS(SELECT 1 FROM platform_private.b2b_authorized_documents d WHERE d.id=x.document_id AND d.organization_id=x.organization_id AND d.order_id=x.order_id AND d.partner_id=x.partner_id AND d.source_digest=x.source_digest AND d.state='AUTHORIZED')
 OR EXISTS(SELECT 1 FROM platform_private.price_schedule_snapshots s WHERE s.receivable_id=a.id)
 OR (SELECT count(*) FROM jsonb_array_elements(x.rows) r WHERE (r->>'installment_number')::int=i.installment_number)<>1
 THEN RAISE EXCEPTION 'B2B_ALLOCATION_ORIGIN_INVALID' USING ERRCODE='23514'; END IF;
 SELECT r INTO row FROM jsonb_array_elements(x.rows) r WHERE (r->>'installment_number')::int=i.installment_number;
 IF i.original_amount IS DISTINCT FROM (row->>'amount')::numeric OR i.due_date IS DISTINCT FROM (row->>'due_date')::date
 OR i.original_amount IS DISTINCT FROM (row->>'principal_amount')::numeric+(row->>'interest_amount')::numeric
 OR a.total_amount IS DISTINCT FROM x.principal+x.financed_interest
 THEN RAISE EXCEPTION 'B2B_ALLOCATION_ORIGIN_INVALID' USING ERRCODE='23514'; END IF;
 RETURN to_jsonb(i)||jsonb_build_object('monetary_semantics','financed_total_v1','interest_amount',i.interest_amount+(row->>'interest_amount')::numeric,'financed_interest_amount',(row->>'interest_amount')::numeric,
 'monetary_origin',jsonb_build_object('contract','RECEIVABLE_MONEY_V1','source','b2b_document_allocation_v1','installment_id',i.id,'receivable_id',a.id,'organization_id',a.organization_id,'order_id',x.order_id,'document_id',x.document_id,'snapshot_principal',(row->>'principal_amount')::numeric,'snapshot_interest',(row->>'interest_amount')::numeric));
END $function$
