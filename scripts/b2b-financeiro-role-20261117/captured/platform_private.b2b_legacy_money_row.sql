CREATE OR REPLACE FUNCTION platform_private.b2b_legacy_money_row(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE i public.accounts_receivable_installments; a public.accounts_receivable; po public.partner_orders;
 org uuid; sealed jsonb; sch jsonb; terms jsonb; audit jsonb;
 financing numeric; principal numeric; late_interest numeric; received numeric; disc numeric; penalty numeric;
BEGIN
 SELECT * INTO i FROM public.accounts_receivable_installments WHERE id=p_id;
 org:=i.organization_id;
 SELECT * INTO a FROM public.accounts_receivable WHERE id=i.receivable_id AND organization_id=org;
 IF a.origin_type IS DISTINCT FROM 'B2B_ORDER' THEN RETURN NULL; END IF;
 SELECT * INTO po FROM public.partner_orders WHERE id=a.origin_id AND partner_id=a.partner_id;
 sealed:=po.internal_economic_snapshot; terms:=sealed->'terms';
 IF sealed IS NULL OR sealed->>'schema_version' IS DISTINCT FROM '1' OR sealed->>'sealed_by' IS NULL
 OR coalesce(sealed->'origin'->>'organization_id',sealed->'origin'->>'creditor_organization_id') IS DISTINCT FROM org::text
 OR sealed->'origin'->>'partner_id' IS DISTINCT FROM a.partner_id::text
 OR NOT EXISTS(SELECT 1 FROM public.partner_accounts pa WHERE pa.id=a.partner_id AND pa.commercial_owner_organization_id=org)
 OR terms->>'id' IS DISTINCT FROM po.payment_terms_id::text OR terms->>'partner_order_id' IS DISTINCT FROM po.id::text
 OR (SELECT count(*) FROM public.partner_order_financial_links l WHERE l.partner_order_id=po.id AND l.receivable_id=a.id AND l.partner_id=a.partner_id)<>1
 OR (SELECT count(*) FROM public.partner_order_financial_links l WHERE l.receivable_id=a.id)<>1
 OR EXISTS(SELECT 1 FROM platform_private.price_schedule_snapshots s WHERE s.receivable_id=a.id)
 OR EXISTS(SELECT 1 FROM platform_private.b2b_document_allocations x WHERE x.receivable_id=a.id)
 THEN RAISE EXCEPTION 'B2B_LEGACY_ORIGIN_UNPROVEN' USING ERRCODE='23514'; END IF;
 IF jsonb_typeof(sealed->'schedule') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'B2B_LEGACY_ORIGIN_UNPROVEN' USING ERRCODE='23514'; END IF;
 IF (SELECT count(*) FROM jsonb_array_elements(sealed->'schedule') s WHERE (s->>'installment_number')::int=i.installment_number)<>1 THEN RAISE EXCEPTION 'B2B_LEGACY_SCHEDULE_AMBIGUOUS' USING ERRCODE='23514'; END IF;
 SELECT s INTO sch FROM jsonb_array_elements(sealed->'schedule') s WHERE (s->>'installment_number')::int=i.installment_number;
 IF (SELECT count(*) FROM public.partner_order_payment_schedule s WHERE s.partner_order_id=po.id AND s.payment_terms_id=po.payment_terms_id AND s.installment_number=i.installment_number AND s.receivable_installment_id=i.id)<>1
 OR NOT EXISTS(SELECT 1 FROM public.partner_order_payment_schedule s WHERE s.id=(sch->>'id')::uuid AND s.receivable_installment_id=i.id AND (to_jsonb(s)-ARRAY['created_at','status','receivable_installment_id'])=sch)
 OR (SELECT count(*) FROM public.accounts_receivable_installments s WHERE s.receivable_id=a.id)<>(terms->>'installment_count')::int
 THEN RAISE EXCEPTION 'B2B_LEGACY_LINK_MISMATCH' USING ERRCODE='23514'; END IF;
 -- Captured writer's immutable INSERT audit is required, not merely a current schedule match.
 IF (SELECT count(*) FROM public.financial_audit_log f WHERE f.entity_type='accounts_receivable_installments' AND f.entity_id=i.id AND f.action='INSERT')<>1 THEN RAISE EXCEPTION 'B2B_LEGACY_WRITER_UNPROVEN' USING ERRCODE='23514'; END IF;
 SELECT f.new_data INTO audit FROM public.financial_audit_log f WHERE f.entity_type='accounts_receivable_installments' AND f.entity_id=i.id AND f.action='INSERT';
 financing:=(sch->>'interest_amount')::numeric; principal:=(sch->>'principal_amount')::numeric;
 IF principal IS NULL OR financing IS NULL OR principal<0 OR financing<0 OR principal+financing IS DISTINCT FROM i.original_amount
 OR i.original_amount IS DISTINCT FROM (sch->>'amount')::numeric OR i.due_date IS DISTINCT FROM (sch->>'due_date')::date
 OR audit->>'receivable_id' IS DISTINCT FROM a.id::text OR audit->>'organization_id' IS DISTINCT FROM org::text
 OR (audit->>'original_amount')::numeric IS DISTINCT FROM i.original_amount OR (audit->>'interest_amount')::numeric IS DISTINCT FROM financing
 OR (terms->>'final_amount')::numeric IS DISTINCT FROM a.total_amount
 OR (SELECT sum((s->>'amount')::numeric) FROM jsonb_array_elements(sealed->'schedule') s) IS DISTINCT FROM a.total_amount
 THEN RAISE EXCEPTION 'B2B_LEGACY_WRITER_INCOMPATIBLE' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM public.receivable_payments p WHERE p.installment_id=i.id AND p.organization_id IS DISTINCT FROM org)
 OR EXISTS(SELECT 1 FROM public.receivable_payments p WHERE p.installment_id=i.id AND p.is_reversal AND NOT EXISTS(SELECT 1 FROM public.receivable_payments r WHERE r.id=p.reversed_payment_id AND r.installment_id=i.id AND r.organization_id=org AND NOT r.is_reversal))
 THEN RAISE EXCEPTION 'B2B_LEGACY_LEDGER_INCOMPATIBLE' USING ERRCODE='23514'; END IF;
 SELECT coalesce(sum(p.interest_amount),0),coalesce(sum(p.amount_received),0),coalesce(sum(p.discount_amount),0),coalesce(sum(p.penalty_amount),0)
 INTO late_interest,received,disc,penalty FROM public.receivable_payments p WHERE p.installment_id=i.id;
 IF received IS DISTINCT FROM i.received_amount OR disc IS DISTINCT FROM i.discount_amount OR penalty IS DISTINCT FROM i.penalty_amount
 OR (EXISTS(SELECT 1 FROM public.receivable_payments p WHERE p.installment_id=i.id) AND i.interest_amount IS DISTINCT FROM late_interest)
 OR (NOT EXISTS(SELECT 1 FROM public.receivable_payments p WHERE p.installment_id=i.id) AND i.interest_amount IS DISTINCT FROM financing)
 THEN RAISE EXCEPTION 'B2B_LEGACY_LEDGER_MISMATCH' USING ERRCODE='23514'; END IF;
 RETURN to_jsonb(i)||jsonb_build_object('monetary_semantics','financed_total_v1','interest_amount',financing+late_interest,'financed_interest_amount',financing,
 'monetary_origin',jsonb_build_object('contract','RECEIVABLE_MONEY_V1','source','b2b_immutable_schedule_v1','installment_id',i.id,'receivable_id',a.id,'organization_id',org,'order_id',po.id,'schedule_id',sch->>'id','snapshot_principal',principal,'snapshot_interest',financing));
END $function$
