from pathlib import Path
import json
p=Path(__file__).resolve().parent
items=json.loads((p/'baseline.json').read_text())
values=',\n'.join("('%s','%s','%s','%s')"%(i['signature'].replace("'","''"),i['md5'],i['owner'],i['acl']) for i in items)
guard="""-- CANDIDATE ONLY. External canonical swzpzcwiasxmjutrmvkm required; never auto-apply.
BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s';
DO $guard$
DECLARE r record; p record;
BEGIN
 FOR r IN SELECT * FROM (VALUES
"""+values+"""
 ) v(signature,hash,owner,acl) LOOP
  SELECT * INTO p FROM pg_proc WHERE oid=to_regprocedure(r.signature);
  IF NOT FOUND OR md5(pg_get_functiondef(p.oid)) IS DISTINCT FROM r.hash
   OR pg_get_userbyid(p.proowner) IS DISTINCT FROM r.owner OR p.proacl::text IS DISTINCT FROM r.acl THEN
   RAISE EXCEPTION 'own_finance_baseline_drift: %',r.signature USING ERRCODE='55000'; END IF;
 END LOOP;
 IF to_regprocedure('platform_private.b2b_own_obligations_owner(uuid)') IS NOT NULL
  OR to_regprocedure('platform_private.b2b_own_obligations(uuid,timestamptz,uuid)') IS NOT NULL
  OR to_regprocedure('public.rpc_portal_partner_financial(uuid,boolean,timestamptz,uuid)') IS NOT NULL THEN
  RAISE EXCEPTION 'own_finance_already_present' USING ERRCODE='55000'; END IF;
 IF EXISTS(SELECT 1 FROM public.organizations WHERE partner_account_id IS NOT NULL) THEN
  RAISE EXCEPTION 'explicit_partner_model_unreviewed' USING ERRCODE='55000'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.saas_features WHERE key='contas_receber' AND active)
 OR NOT EXISTS(SELECT 1 FROM public.saas_features WHERE key='pedidos_b2b' AND active) THEN
  RAISE EXCEPTION 'own_finance_feature_missing' USING ERRCODE='55000'; END IF;
END $guard$;
"""
projection = next(i['definition'] for i in items if i['signature']=='platform_private.b2b_commercial_partner_projection()')
projection = projection.replace('sheets boolean:=false;', 'sheets boolean:=false; finance boolean:=false;')
needle=" RETURN result||jsonb_build_object('capabilities'"
assert projection.count(needle)==1
projection = projection.replace(needle, """ -- Shared server authority/entitlement proof, no title read or extra client probe.
 BEGIN
  finance:=platform_private.b2b_own_obligations_owner((result->>'id')::uuid) IS NOT NULL;
 EXCEPTION WHEN insufficient_privilege THEN finance:=false;
 END;
 RETURN result||jsonb_build_object('finance_capabilities',jsonb_build_object(
  'contract','C2_OWN_OBLIGATIONS_V1','obligations_read',finance))||jsonb_build_object('capabilities'""")
(p/'projection.sql.review').write_text(projection+';\n')
(p/'candidate.sql.review').write_text(guard+(p/'core.sql.review').read_text()+'\n'+projection+';\nCOMMIT;\n')
(p/'preflight.sql').write_text("""-- READ ONLY; validate external ref swzpzcwiasxmjutrmvkm before execution.
SELECT p.oid::regprocedure::text signature,pg_get_userbyid(p.proowner) owner,p.proacl::text acl,md5(pg_get_functiondef(p.oid)) md5,pg_get_functiondef(p.oid) definition FROM pg_proc p WHERE p.oid IN (
"""+','.join("'%s'::regprocedure"%i['signature'] for i in items)+""");
SELECT count(*) explicit_partner_organizations FROM public.organizations WHERE partner_account_id IS NOT NULL;
SELECT schemaname,tablename,policyname,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname='public' AND tablename IN ('partner_orders','partner_order_financial_links','accounts_receivable','accounts_receivable_installments','financial_documents');
SELECT c.relname,con.conname,pg_get_constraintdef(con.oid) FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('partner_order_financial_links','accounts_receivable','accounts_receivable_installments','financial_documents');
""")