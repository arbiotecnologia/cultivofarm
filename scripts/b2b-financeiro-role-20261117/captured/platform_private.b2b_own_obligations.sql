CREATE OR REPLACE FUNCTION platform_private.b2b_own_obligations(p_partner_id uuid, p_before timestamp with time zone, p_before_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE owner uuid; rows jsonb;
BEGIN
 owner:=platform_private.b2b_own_obligations_owner(p_partner_id);
 IF (p_before IS NULL) <> (p_before_id IS NULL) THEN RAISE EXCEPTION 'invalid_cursor' USING ERRCODE='22023'; END IF;
 SELECT COALESCE(jsonb_agg(q.value ORDER BY q.created_at DESC,q.id DESC),'[]'::jsonb) INTO rows FROM (
 SELECT ar.id,ar.created_at,jsonb_build_object('id',ar.id,'order_id',po.id,'numero',po.numero,
 'created_at',ar.created_at,'total',ar.total_amount,'status',ar.status,
 'installments',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',i.id,'numero',i.installment_number,
 'vencimento',i.due_date,'valor',i.original_amount,'recebido',i.received_amount,'status',i.status)
 ORDER BY i.installment_number,i.id) FROM public.accounts_receivable_installments i WHERE i.receivable_id=ar.id),'[]'::jsonb)) value
 FROM public.partner_orders po JOIN public.partner_order_financial_links l ON l.partner_order_id=po.id
 JOIN public.accounts_receivable ar ON ar.id=l.receivable_id
 WHERE po.partner_id=p_partner_id AND l.partner_id=p_partner_id AND ar.partner_id=p_partner_id
 AND ar.origin_type='B2B_ORDER' AND ar.origin_id=po.id AND ar.organization_id=owner
 -- A title with an ambiguous order/link or foreign/unowned installment is not projected.
 AND (SELECT count(*) FROM public.partner_order_financial_links x WHERE x.receivable_id=ar.id)=1
 AND (SELECT count(*) FROM public.partner_order_financial_links x WHERE x.partner_order_id=po.id)=1
 AND ar.total_amount>=0 AND ar.total_amount::text NOT IN ('NaN','Infinity','-Infinity')
 AND NOT EXISTS(SELECT 1 FROM public.accounts_receivable_installments i WHERE i.receivable_id=ar.id
  AND (i.organization_id IS DISTINCT FROM owner OR i.original_amount IS NULL OR i.received_amount IS NULL
   OR i.original_amount<0 OR i.received_amount<0 OR i.original_amount::text IN ('NaN','Infinity','-Infinity')
   OR i.received_amount::text IN ('NaN','Infinity','-Infinity')))
 AND (p_before IS NULL OR (ar.created_at,ar.id)<(p_before,p_before_id))
 ORDER BY ar.created_at DESC,ar.id DESC LIMIT 50
 ) q;
 RETURN jsonb_build_object('contract','C2_OWN_OBLIGATIONS_V1','partner_id',p_partner_id,
 'rows',rows,'limit',50,'documents_enabled',false);
END $function$
