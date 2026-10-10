-- Direct financial state writes must use the audited RPCs, not REST table updates.
CREATE POLICY financial_rpc_only_insert ON public.accounts_receivable AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY financial_rpc_only_update ON public.accounts_receivable AS RESTRICTIVE FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY financial_rpc_only_delete ON public.accounts_receivable AS RESTRICTIVE FOR DELETE TO authenticated USING (false);
CREATE POLICY financial_rpc_only_insert ON public.accounts_payable AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY financial_rpc_only_update ON public.accounts_payable AS RESTRICTIVE FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY financial_rpc_only_delete ON public.accounts_payable AS RESTRICTIVE FOR DELETE TO authenticated USING (false);
CREATE POLICY financial_rpc_only_insert ON public.accounts_receivable_installments AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY financial_rpc_only_update ON public.accounts_receivable_installments AS RESTRICTIVE FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY financial_rpc_only_delete ON public.accounts_receivable_installments AS RESTRICTIVE FOR DELETE TO authenticated USING (false);
CREATE POLICY financial_rpc_only_insert ON public.accounts_payable_installments AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY financial_rpc_only_update ON public.accounts_payable_installments AS RESTRICTIVE FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY financial_rpc_only_delete ON public.accounts_payable_installments AS RESTRICTIVE FOR DELETE TO authenticated USING (false);

-- This scheduled transition needs definer privileges after the direct-write fence.
-- Every read/write is explicitly scoped to the authenticated financial tenant.
CREATE OR REPLACE FUNCTION public.fn_mark_financial_overdue()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_org uuid := platform_private.h15_actor_organization();
BEGIN
 IF auth.uid() IS NULL OR v_org IS NULL OR NOT COALESCE(public.is_financial_staff(auth.uid()),false) THEN
  RAISE EXCEPTION 'FINANCIAL_SCOPE_DENIED' USING ERRCODE='42501';
 END IF;
 UPDATE public.accounts_receivable_installments i SET status='OVERDUE'
 WHERE i.organization_id=v_org AND i.status='OPEN' AND i.due_date<CURRENT_DATE
 AND EXISTS (SELECT 1 FROM public.accounts_receivable p WHERE p.id=i.receivable_id AND p.organization_id=v_org);
 UPDATE public.accounts_payable_installments i SET status='OVERDUE'
 WHERE i.organization_id=v_org AND i.status='OPEN' AND i.due_date<CURRENT_DATE
 AND EXISTS (SELECT 1 FROM public.accounts_payable p WHERE p.id=i.payable_id AND p.organization_id=v_org);
 UPDATE public.accounts_receivable p SET status='OVERDUE'
 WHERE p.organization_id=v_org AND p.status IN ('OPEN','PARTIAL')
 AND EXISTS (SELECT 1 FROM public.accounts_receivable_installments i WHERE i.receivable_id=p.id AND i.organization_id=v_org AND i.status='OVERDUE');
 UPDATE public.accounts_payable p SET status='OVERDUE'
 WHERE p.organization_id=v_org AND p.status IN ('OPEN','PARTIAL')
 AND EXISTS (SELECT 1 FROM public.accounts_payable_installments i WHERE i.payable_id=p.id AND i.organization_id=v_org AND i.status='OVERDUE');
END $function$;