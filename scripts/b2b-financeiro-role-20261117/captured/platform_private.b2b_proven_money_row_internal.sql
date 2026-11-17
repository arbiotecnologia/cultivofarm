CREATE OR REPLACE FUNCTION platform_private.b2b_proven_money_row_internal(p_id uuid, p_org uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE org uuid:=p_org; i public.accounts_receivable_installments; row jsonb; r jsonb;
BEGIN
 IF org IS NULL THEN RAISE EXCEPTION 'MONEY_ORIGIN_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 SELECT s.* INTO i FROM public.accounts_receivable_installments s JOIN public.accounts_receivable a ON a.id=s.receivable_id WHERE s.id=p_id AND s.organization_id=org AND a.organization_id=org;
 IF NOT FOUND THEN RAISE EXCEPTION 'MONEY_ORIGIN_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 row:=NULL;
  IF EXISTS(SELECT 1 FROM platform_private.price_schedule_snapshots s WHERE s.receivable_id=i.receivable_id AND s.organization_id=org) THEN
   IF EXISTS(SELECT 1 FROM public.accounts_receivable a WHERE a.id=i.receivable_id AND a.origin_type='B2B_ORDER') THEN RAISE EXCEPTION 'MONEY_ORIGIN_MIXED' USING ERRCODE='23514'; END IF;
   IF (SELECT count(*) FROM platform_private.price_schedule_snapshots s CROSS JOIN LATERAL jsonb_array_elements(s.rows) x WHERE s.receivable_id=i.receivable_id AND s.organization_id=org AND (x->>'installment_number')::int=i.installment_number)<>1 THEN RAISE EXCEPTION 'MONEY_ORIGIN_INVALID' USING ERRCODE='23514'; END IF;
   SELECT x INTO r FROM platform_private.price_schedule_snapshots s CROSS JOIN LATERAL jsonb_array_elements(s.rows) x WHERE s.receivable_id=i.receivable_id AND s.organization_id=org AND (x->>'installment_number')::int=i.installment_number;
   IF i.original_amount IS DISTINCT FROM (r->>'amount')::numeric OR i.original_amount IS DISTINCT FROM (r->>'principal')::numeric+(r->>'interest')::numeric THEN RAISE EXCEPTION 'MONEY_ORIGIN_INVALID' USING ERRCODE='23514'; END IF;
   row:=to_jsonb(i)||jsonb_build_object('monetary_semantics','financed_total_v1','interest_amount',i.interest_amount+(r->>'interest')::numeric,'financed_interest_amount',(r->>'interest')::numeric,'monetary_origin',jsonb_build_object('contract','RECEIVABLE_MONEY_V1','source','price_snapshot_v1','installment_id',i.id,'receivable_id',i.receivable_id,'organization_id',org,'snapshot_principal',(r->>'principal')::numeric,'snapshot_interest',(r->>'interest')::numeric));
  ELSE
   row:=platform_private.b2b_allocation_money_row(i.id);
   IF row IS NULL THEN row:=platform_private.b2b_legacy_money_row(i.id); END IF;
  END IF;
  IF row IS NULL THEN RAISE EXCEPTION 'MONEY_ORIGIN_UNPROVEN' USING ERRCODE='23514'; END IF;
 RETURN row;
END $function$
