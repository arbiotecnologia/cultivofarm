DO $canonical$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.fiscal_environment_marker WHERE project_ref='swzpzcwiasxmjutrmvkm') THEN
  RAISE EXCEPTION 'CANONICAL_REF_REQUIRED';
 END IF;
END $canonical$;
-- P1A: audited DEFINER readers lack deterministic A/P/creditor authorization.
-- Preserve function definitions, signatures, snapshots, rows and technical ACL.
-- Close each reviewed caller entry individually; no generic grants or role bypass.
REVOKE ALL ON FUNCTION public.rpc_b2b_financial_kpis(date,date,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.rpc_b2b_governance_kpis() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.rpc_b2b_aging(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.rpc_b2b_aging_detalhado(date,date,uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.rpc_b2b_partner_profitability(date,date,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.rpc_b2b_executive_alerts() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.rpc_portal_partner_financial() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.rpc_portal_partner_financial(uuid) FROM PUBLIC,anon,authenticated;
-- Already-closed forecast/carteira/dashboard and guarded credit endpoints untouched.
-- Rollback only through a reviewed successor with proven per-action ownership,
-- active actor/tenant/role/feature and target/replay checks. Never undo by GRANT.
