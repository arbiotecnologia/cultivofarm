CREATE OR REPLACE FUNCTION platform_private.c2_accounting_pending_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 -- While pending, only commercial review/quote, rejection or cancellation are possible: no approval,
 -- credit decision, economics seal, receivable, production, NF or delivery.
 -- INSERT: the canonical create may land in em_analise_comercial, aguardando_cotacao or (insufficient credit)
 -- aguardando_aprovacao_credito; nothing operational/financial may be set at creation.
 IF TG_OP='INSERT' THEN
  IF NEW.c2_external_origin_snapshot->>'contract'='C2_EXTERNAL_ORDER_REQUEST_PENDING_ACCOUNTING_V1' AND (
     NEW.status::text NOT IN ('em_analise_comercial','aguardando_cotacao','aguardando_aprovacao_credito')
     OR NEW.ready_for_production IS TRUE OR NEW.receivable_generated IS TRUE OR NEW.internal_economic_snapshot IS NOT NULL
     OR NEW.credit_approved_at IS NOT NULL OR NEW.approved_at IS NOT NULL) THEN
   RAISE EXCEPTION 'C2_ACCOUNTING_PENDING' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
 END IF;
 IF OLD.c2_external_origin_snapshot->>'contract'='C2_EXTERNAL_ORDER_REQUEST_PENDING_ACCOUNTING_V1'
    AND NEW.c2_external_origin_snapshot->>'contract'='C2_EXTERNAL_ORDER_REQUEST_PENDING_ACCOUNTING_V1' THEN
  -- aguardando_aprovacao_credito may only stay as is (no hidden credit decision) or leave to cancel/reject.
  IF NOT (NEW.status::text IN ('em_analise_comercial','aguardando_cotacao','cancelado','reprovado')
          OR (NEW.status=OLD.status AND OLD.status::text='aguardando_aprovacao_credito'))
     OR (OLD.status::text='aguardando_aprovacao_credito' AND NEW.status::text IN ('em_analise_comercial','aguardando_cotacao'))
     OR NEW.ready_for_production IS TRUE OR NEW.receivable_generated IS TRUE OR NEW.internal_economic_snapshot IS NOT NULL
     OR NEW.credit_approved_at IS DISTINCT FROM OLD.credit_approved_at OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
     -- review e1e9aa2f: no credit/financial decision field may advance by any privileged path while pending.
     OR NEW.credit_approved_by IS DISTINCT FROM OLD.credit_approved_by OR NEW.credit_approval_notes IS DISTINCT FROM OLD.credit_approval_notes
     OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
     -- review 61b28: the canonical create (same txn, private create ticket) initializes not_required -> pending/not_required;
     -- any other change (e.g. -> approved) is a financial decision and stays denied while pending.
     OR (NEW.financial_approval_status IS DISTINCT FROM OLD.financial_approval_status
         AND NOT (platform_private.has_ticket('c2_external_order_create',NEW.partner_id)
                  AND OLD.financial_approval_status='not_required' AND NEW.financial_approval_status IN ('pending','not_required'))) THEN
   RAISE EXCEPTION 'C2_ACCOUNTING_PENDING' USING ERRCODE='42501';
  END IF;
 END IF;
 RETURN NEW;
END $function$

