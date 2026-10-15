-- CANDIDATE ONLY. Canonical swzpzcwiasxmjutrmvkm. No execution/grants/fixtures.
-- Existing coherent context + existing restrictive tenant guard; no new helper.
BEGIN;
DO $baseline$
DECLARE t text; expected text; actual text;
BEGIN
 FOR t,expected IN SELECT * FROM (VALUES
 ('accounts_receivable','dd0570ef9de3819bd7b165dda783aec2'),
 ('accounts_receivable_installments','b57b4d9b7549325c20f77bd829afdae0'),
 ('partner_users','f48a220014054b74eda8f90326bf09d1')) b(t,h) LOOP
  SELECT md5(string_agg(policyname||'|'||permissive||'|'||roles::text||'|'||cmd||'|'||coalesce(qual,'')||'|'||coalesce(with_check,''),E'\n' ORDER BY policyname)) INTO actual FROM pg_policies WHERE schemaname='public' AND tablename=t;
  IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'B2B_AR_BASELINE_DRIFT %',t; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=t AND c.relrowsecurity AND NOT c.relforcerowsecurity AND pg_get_userbyid(c.relowner)='postgres') THEN RAISE EXCEPTION 'B2B_AR_RLS_OWNER_DRIFT %',t; END IF;
 END LOOP;
 IF md5(pg_get_functiondef('platform_private.b2b_commercial_context()'::regprocedure)) IS DISTINCT FROM '02158d4204dea67308558f649113ba6d'
 OR md5(pg_get_functiondef('platform_private.h15_actor_organization()'::regprocedure)) IS DISTINCT FROM '64e10608403238a41a9baf92857ca881'
 OR md5(pg_get_functiondef('platform_private.is_tenant_admin_for_user(uuid)'::regprocedure)) IS DISTINCT FROM '6f548278ad7a8fc39e83cad7c0101de2'
 OR NOT has_function_privilege('authenticated','platform_private.b2b_commercial_context()','EXECUTE')
 OR has_function_privilege('anon','platform_private.b2b_commercial_context()','EXECUTE') THEN RAISE EXCEPTION 'B2B_AR_CONTEXT_DRIFT'; END IF;
END $baseline$;
ALTER POLICY ar_partner_select_own_b2b ON public.accounts_receivable USING (
 origin_type='B2B_ORDER' AND platform_private.has_role((SELECT auth.uid()),'parceiro_b2b'::public.app_role)
 AND partner_id=(SELECT (platform_private.b2b_commercial_context()->>'partner_id')::uuid)
);
ALTER POLICY ari_partner_select_own_b2b ON public.accounts_receivable_installments USING (
 platform_private.has_role((SELECT auth.uid()),'parceiro_b2b'::public.app_role)
 AND EXISTS(SELECT 1 FROM public.accounts_receivable ar WHERE ar.id=accounts_receivable_installments.receivable_id
 AND ar.origin_type='B2B_ORDER'
 AND ar.partner_id=(SELECT (platform_private.b2b_commercial_context()->>'partner_id')::uuid))
);
-- Producer/internal policies, restrictive guards, all writes/ACLs remain unchanged.
-- Related financial-link/schedule/terms policies are NOT reopened by this candidate.
COMMIT;