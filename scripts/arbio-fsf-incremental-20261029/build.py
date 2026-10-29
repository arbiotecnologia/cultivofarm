"""Generate review artifacts ONLY; no connection, execution, secrets or hosted writes."""
import hashlib
import json
from pathlib import Path

H = Path(__file__).resolve().parent
ROOT = H.parents[1]
REF = 'swzpzcwiasxmjutrmvkm'


def quote(value):
    return "'" + value.replace("'", "''") + "'"


def assemble():
    live = json.loads((H / 'capture/production-metadata.json').read_text())
    deps = json.loads((H / 'capture/production-dependencies.json').read_text())
    functions = {f['signature']: f for f in live['functions'] + deps['functions']}
    expected = {'tg_partner_orders_credit_guard()': 'b24a3c30910832e8b14456d912a67589',
                'fn_b2b_credit_exposure(uuid,numeric,uuid)': '213ac31f3a30816ead75365b0d1fed18',
                'approve_b2b_credit(uuid,text)': '8127c7b697871fa1eecafa845a551eea'}
    for sig, digest in expected.items():
        assert functions[sig]['md5'] == digest, (sig, 'BASELINE_DRIFT')
    pins = []
    for sig, f in sorted(functions.items()):
        pins.append(f"IF md5(pg_get_functiondef({quote(sig)}::regprocedure)) IS DISTINCT FROM {quote(f['md5'])} OR (SELECT coalesce(proacl::text,'NULL') FROM pg_proc WHERE oid={quote(sig)}::regprocedure) IS DISTINCT FROM {quote('{' + ','.join(f['acl']) + '}' if f['acl'] is not None else 'NULL')} THEN RAISE EXCEPTION 'FUNCTION_OR_ACL_DRIFT: %', {quote(sig)}; END IF;")
        pins.append(f"IF (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid={quote(sig)}::regprocedure) IS DISTINCT FROM {quote(f['owner'])} THEN RAISE EXCEPTION 'FUNCTION_OWNER_DRIFT: %', {quote(sig)}; END IF;")
    for t in live['triggers']:
        pins.append(f"IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid={quote('public.'+t['table'])}::regclass AND tgname={quote(t['name'])} AND pg_get_triggerdef(oid)={quote(t['definition'])} AND tgenabled={quote(t['enabled'])}) THEN RAISE EXCEPTION 'TRIGGER_DRIFT: %', {quote(t['name'])}; END IF;")
    for p in live['policies']:
        pins.append(f"IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname={quote(p['schemaname'])} AND tablename={quote(p['tablename'])} AND policyname={quote(p['policyname'])} AND coalesce(qual,'')={quote(p['qual'] or '')} AND coalesce(with_check,'')={quote(p['with_check'] or '')} AND permissive={quote(p['permissive'])} AND cmd={quote(p['cmd'])} AND roles::text={quote('{' + ','.join(p['roles']) + '}')}) THEN RAISE EXCEPTION 'POLICY_DRIFT: %', {quote(p['policyname'])}; END IF;")
    for c in live['constraints']:
        pins.append(f"IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid={quote('public.'+c['table'])}::regclass AND conname={quote(c['name'])} AND pg_get_constraintdef(oid)={quote(c['definition'])} AND convalidated={'true' if c['validated'] else 'false'}) THEN RAISE EXCEPTION 'CONSTRAINT_DRIFT: %', {quote(c['name'])}; END IF;")
    for r in live['relations']:
        pins.append(f"IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid={quote('public.'+r['name'])}::regclass AND relrowsecurity={'true' if r['rls'] else 'false'} AND relforcerowsecurity={'true' if r['force_rls'] else 'false'} AND pg_get_userbyid(relowner)={quote(r['owner'])} AND coalesce(relacl::text,'NULL')={quote('{' + ','.join(r['acl']) + '}' if r['acl'] is not None else 'NULL')}) THEN RAISE EXCEPTION 'RELATION_DRIFT: %', {quote(r['name'])}; END IF;")
        for key, view, predicate in [('triggers','pg_trigger',f"tgrelid={quote('public.'+r['name'])}::regclass AND NOT tgisinternal"),('constraints','pg_constraint',f"conrelid={quote('public.'+r['name'])}::regclass"),('policies','pg_policies',f"schemaname='public' AND tablename={quote(r['name'])}")]:
            source_key = 'tablename' if key=='policies' else 'table'
            if key=='constraints' and r['name']=='organizations': continue
            if key=='triggers' and r['name']=='organizations': continue
            count=sum(x[source_key]==r['name'] for x in live[key])
            pins.append(f"IF (SELECT count(*) FROM {view} WHERE {predicate}) <> {count} THEN RAISE EXCEPTION 'CATALOG_ADDITION_DRIFT: %', {quote(r['name']+':'+key)}; END IF;")
    for c in deps['columns']:
        pins.append(f"IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name={quote(c['table'])} AND column_name={quote(c['name'])} AND udt_name={quote(c['type'])} AND is_nullable={quote(c['nullable'])} AND coalesce(column_default,'')={quote(c['default'] or '')} AND numeric_precision IS NOT DISTINCT FROM {c['precision'] if c['precision'] is not None else 'NULL'} AND numeric_scale IS NOT DISTINCT FROM {c['scale'] if c['scale'] is not None else 'NULL'}) THEN RAISE EXCEPTION 'COLUMN_DRIFT: %', {quote(c['table']+'.'+c['name'])}; END IF;")
    for table in sorted({c['table'] for c in deps['columns']}):
        count=sum(c['table']==table for c in deps['columns'])
        pins.append(f"IF (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name={quote(table)}) <> {count} THEN RAISE EXCEPTION 'COLUMN_ADDITION_DRIFT: %', {quote(table)}; END IF;")
    (H / 'preflight.sql.readonly').write_text('-- Metadata only; no business writes. Inspect the complete capture and rerun before execution.\nDO $pins$ BEGIN\n' + '\n'.join(pins) + '\nEND $pins$;\n')
    shared = (ROOT / 'scripts/financial-price-generator-20261029/shared-credit-guard.sql.review').read_text()
    # Subset 01 deliberately excludes the receivable insert guard: its integration is NOT proven.
    guard = shared[:shared.index('CREATE FUNCTION platform_private.b2b_debtor_partner')]
    guard = guard[guard.index('CREATE FUNCTION platform_private.b2b_credit_config_block'):]
    guard = guard.replace('s.credit_limit > 0', "s.credit_limit > 0 AND s.credit_limit::text NOT IN ('NaN','Infinity','-Infinity')")
    # Approval shortcuts must not authorize an isolated amount increase.
    guard = guard.replace('AND NEW.total IS NOT DISTINCT FROM OLD.total THEN', 'AND NEW.total IS NOT DISTINCT FROM OLD.total\n       AND NEW.final_amount_with_interest IS NOT DISTINCT FROM OLD.final_amount_with_interest THEN')
    guard = guard.replace('IF NEW.credit_approved_by IS NOT NULL AND OLD.credit_approved_by IS NULL THEN', 'IF NEW.credit_approved_by IS NOT NULL AND OLD.credit_approved_by IS NULL\n       AND NEW.total IS NOT DISTINCT FROM OLD.total\n       AND NEW.final_amount_with_interest IS NOT DISTINCT FROM OLD.final_amount_with_interest THEN')
    transition = """IF NOT EXISTS (SELECT 1 FROM platform_private.credit_approval_tickets_20261029
        WHERE transaction_id=txid_current() AND actor_id=auth.uid() AND order_id=OLD.id) THEN
       RAISE EXCEPTION 'CREDIT_APPROVAL_TICKET_REQUIRED' USING ERRCODE='42501';
     END IF;
     DELETE FROM platform_private.credit_approval_tickets_20261029
       WHERE transaction_id=txid_current() AND actor_id=auth.uid() AND order_id=OLD.id;
     NEW.credit_block_reason := NULL;"""
    guard = guard.replace('NEW.credit_block_reason := NULL;', transition, 2)
    guard = guard.replace("  IF TG_OP = 'INSERT' THEN", """  IF TG_OP='UPDATE' AND OLD.credit_approved_by IS NOT NULL
     AND (NEW.total IS DISTINCT FROM OLD.total OR NEW.final_amount_with_interest IS DISTINCT FROM OLD.final_amount_with_interest) THEN
    RAISE EXCEPTION 'CREDIT_APPROVED_AMOUNT_IMMUTABLE' USING ERRCODE='42501';
  END IF;
  IF TG_OP = 'INSERT' THEN""",1)
    guard = guard.replace("  IF TG_OP = 'INSERT' THEN", "  IF current_setting('transaction_isolation') <> 'read committed' THEN\n    RAISE EXCEPTION 'CREDIT_ISOLATION_UNSUPPORTED' USING ERRCODE='0A000';\n  END IF;\n  IF coalesce(NEW.final_amount_with_interest,NEW.total,0)::text IN ('NaN','Infinity','-Infinity')\n     OR coalesce(NEW.final_amount_with_interest,NEW.total,0) < 0 THEN\n    RAISE EXCEPTION 'CREDIT_AMOUNT_INVALID' USING ERRCODE='23514';\n  END IF;\n  IF TG_OP = 'INSERT' THEN")
    guard = guard.replace("IF v_cfg = 'configuracao_financeira_inativa' THEN", 'IF v_cfg IS NOT NULL THEN')
    ticket = """CREATE TABLE platform_private.credit_approval_tickets_20261029 (
 transaction_id bigint NOT NULL, actor_id uuid NOT NULL, order_id uuid NOT NULL,
 PRIMARY KEY(transaction_id, actor_id, order_id));
REVOKE ALL ON platform_private.credit_approval_tickets_20261029 FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE platform_private.credit_approval_tickets_20261029 ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.fn_b2b_guard_credit_approval_fields() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $approval$
BEGIN
 IF NEW.credit_approved_at IS DISTINCT FROM OLD.credit_approved_at OR NEW.credit_approved_by IS DISTINCT FROM OLD.credit_approved_by THEN
   IF NOT EXISTS (SELECT 1 FROM platform_private.credit_approval_tickets_20261029 t
      WHERE t.transaction_id=txid_current() AND t.actor_id=auth.uid() AND t.order_id=OLD.id)
      OR NEW.id IS DISTINCT FROM OLD.id OR NEW.partner_id IS DISTINCT FROM OLD.partner_id
      OR OLD.status::text <> 'aguardando_aprovacao_credito' OR NEW.status::text <> 'em_analise_comercial'
      OR NEW.credit_approved_by IS DISTINCT FROM auth.uid() OR NEW.credit_approved_at IS NULL
      OR NEW.total IS DISTINCT FROM OLD.total OR NEW.final_amount_with_interest IS DISTINCT FROM OLD.final_amount_with_interest THEN
      RAISE EXCEPTION 'credit_approval_fields_immutable: use approve_b2b_credit' USING ERRCODE='42501';
   END IF;
 END IF;
 RETURN NEW;
END $approval$;
"""
    approve = functions['approve_b2b_credit(uuid,text)']['body']
    assert approve.count("PERFORM set_config('arbio.b2b_credit_approval', 'on', true);") == 1
    approve = approve.replace('  v_final_reason text;', '  v_final_reason text;\n  v_updated integer;\n  v_config text;')
    approve = approve.replace("  -- H4-003: autoriza gravacao dos campos credit_approved_by/at nesta transacao.\n  PERFORM set_config('arbio.b2b_credit_approval', 'on', true);", """  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'CREDIT_ISOLATION_UNSUPPORTED' USING ERRCODE='0A000';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('b2b_credit:' || v_order.partner_id::text,0));
  IF public.b2b_phase1_order_visible(p_partner_order_id) IS NOT TRUE OR auth.uid() IS DISTINCT FROM v_uid
     OR (public.has_role(v_uid,'administrador') IS NOT TRUE AND public.has_role(v_uid,'gestor') IS NOT TRUE
         AND public.has_role(v_uid,'financeiro') IS NOT TRUE) THEN
    RAISE EXCEPTION 'b2b_phase1_scope_denied' USING ERRCODE='42501';
  END IF;
  v_config := platform_private.b2b_credit_config_block(v_order.partner_id);
  IF v_config IS NOT NULL THEN RAISE EXCEPTION 'credit_release_failed: %',v_config USING ERRCODE='23514'; END IF;
  INSERT INTO platform_private.credit_approval_tickets_20261029 VALUES(txid_current(),v_uid,p_partner_order_id);""")
    approve = approve.replace("  PERFORM set_config('arbio.b2b_credit_approval', 'off', true);\n\n  IF NOT FOUND THEN", "  GET DIAGNOSTICS v_updated = ROW_COUNT;\n  IF EXISTS(SELECT 1 FROM platform_private.credit_approval_tickets_20261029 WHERE transaction_id=txid_current() AND actor_id=v_uid AND order_id=p_partner_order_id) THEN RAISE EXCEPTION 'CREDIT_APPROVAL_TICKET_UNCONSUMED' USING ERRCODE='42501'; END IF;\n\n  IF v_updated <> 1 THEN")
    approve = approve.replace('IF NOT public.b2b_phase1_order_visible(p_partner_order_id) THEN', 'IF public.b2b_phase1_order_visible(p_partner_order_id) IS NOT TRUE THEN')
    approve = approve.replace("IF NOT (public.has_role(v_uid,'administrador') OR public.has_role(v_uid,'gestor')\n          OR public.has_role(v_uid,'financeiro')) THEN", "IF (public.has_role(v_uid,'administrador') IS NOT TRUE AND public.has_role(v_uid,'gestor') IS NOT TRUE\n          AND public.has_role(v_uid,'financeiro') IS NOT TRUE) THEN")
    assert 'arbio.b2b_credit_approval' not in approve
    ddl = (ROOT / 'scripts/financial-price-generator-20261029/credit-guard-trigger-columns.sql.review').read_text()
    ddl = ddl[ddl.index('DROP TRIGGER'):].replace('DROP TRIGGER IF EXISTS', 'DROP TRIGGER')
    body = guard + '\n' + ticket + '\n' + approve + ';\n' + ddl
    body += '\nREVOKE ALL ON FUNCTION platform_private.b2b_credit_config_block(uuid) FROM PUBLIC,anon,authenticated,service_role;\n'
    body += '\n'.join(f'ALTER FUNCTION {s} OWNER TO postgres;' for s in ['platform_private.b2b_credit_config_block(uuid)','public.fn_b2b_guard_credit_approval_fields()','public.tg_partner_orders_credit_guard()','public.approve_b2b_credit(uuid,text)']) + '\n'
    (H / '01-credit-approval.body.sql.review').write_text(body)
    prefix = '-- REVIEW ONLY. No execution this turn. Operator must verify canonical project in dashboard and exact approved artifact.\nBEGIN;\nSET LOCAL search_path=public,pg_catalog;\nSET LOCAL lock_timeout=\'3s\';\nSET LOCAL statement_timeout=\'60s\';\nLOCK TABLE public.partner_orders IN SHARE ROW EXCLUSIVE MODE;\n'
    pre = (H / 'preflight.sql.readonly').read_text()
    absent = "DO $$ BEGIN IF to_regclass('platform_private.credit_approval_tickets_20261029') IS NOT NULL OR to_regprocedure('platform_private.b2b_credit_config_block(uuid)') IS NOT NULL THEN RAISE EXCEPTION 'CANDIDATE_ALREADY_PRESENT'; END IF; END $$;\n"
    (H / '01-credit-approval.install.sql.review').write_text(prefix + pre + absent + body + '\nCOMMIT;\n')
    # Containment only: retain hardened functions/tickets and trigger columns; never restore GUC bodies.
    (H / '01-credit-approval.rollback.sql.review').write_text("-- DENY-ONLY containment; no history deletion or unsafe restoration. Inspect before execution.\nBEGIN;\nSET LOCAL lock_timeout='3s';\nREVOKE EXECUTE ON FUNCTION public.approve_b2b_credit(uuid,text) FROM PUBLIC,anon,authenticated,service_role;\nCOMMIT;\n")
    inventory = {'ref':REF,'level':'METADATA_CAPTURE_NOT_JWT_E2E','counts':{k:len(v) for k,v in live.items()},
      'functions':[{k:f[k] for k in ('signature','md5','owner','acl','definer','volatility','config')} for f in functions.values()],
      'subsets':[
        {'id':'UI','status':'REVIEWABLE_NO_FINANCIAL_WRITE','files':['src/components/comercial/creditBlockReason.ts','src/components/comercial/ResponderCotacaoDialog.tsx'],'requires':'focused Vitest, harness build/typecheck, production version, real read-only login'},
        {'id':'01','status':'CANDIDATE_PENDING_LOCAL_TEST_AND_INDEPENDENT_REVIEW','changes':['private approval tickets','post-wait reauthorization','finite settings gate','expanded trigger columns'],'preserves':['C2_ACCOUNTING_PENDING','B2B_INTERNAL_DOWNSTREAM_UNVERIFIED','ACL of existing functions','organizations policies']},
        {'id':'02-shared-receivable','status':'BLOCKED_TRANSITIVE_WRITERS','requires':'exact d51_5/origin/FK/ledger composition; common ordering across every writer/importer; no synthetic authority'},
        {'id':'03-client-link','status':'BLOCKED_FULL_TRIGGER_COMPOSITION','requires':'real clientes audit/code/tenant triggers, partner audit, h15 readiness chain and existing receipt-name absence; no automatic real link execution'},
        {'id':'04-Price','status':'BLOCKED_FISCAL_SETTINGS_PAYMENT_ORIGIN','requires':'boleto production reported registered by owner 20:28; complete settings/exposure, validated NF/accounting/origin still pending; no stubs; no activation'}],
      'dynamic_dependencies':'pg_depend is not a complete PL/pgSQL call graph; captured lexical and dynamic closure must be independently proven before subsets 02–04',
      'organizations':'UNTOUCHED; production has scoped SELECT + restrictive b2b containment, not homolog USING true',
      'approval_baseline':'GUC is caller-settable in SQL; direct table RLS/ACL still applies, so this is not a claim of hosted exploit'}
    (H / 'inventory.json').write_text(json.dumps(inventory,ensure_ascii=False,indent=2)+'\n')
    (H / 'postflight.sql.readonly').write_text("-- Read-only: compare exact new body/ACL/DDL with the reviewed build; no business RPC calls.\nSELECT oid::regprocedure::text,md5(pg_get_functiondef(oid)),proacl,prosecdef,proconfig FROM pg_proc WHERE oid IN ('public.approve_b2b_credit(uuid,text)'::regprocedure,'public.fn_b2b_guard_credit_approval_fields()'::regprocedure,'public.tg_partner_orders_credit_guard()'::regprocedure,'platform_private.b2b_credit_config_block(uuid)'::regprocedure);\nSELECT pg_get_triggerdef(oid),tgenabled FROM pg_trigger WHERE tgrelid='public.partner_orders'::regclass AND tgname IN ('trg_partner_orders_credit_guard','trg_b2b_guard_credit_approval_fields');\nSELECT count(*) AS tickets_must_be_zero FROM platform_private.credit_approval_tickets_20261029;\nSELECT policyname,permissive,qual,with_check FROM pg_policies WHERE schemaname='public' AND tablename='organizations';\n")


if __name__ == '__main__':
    assemble()
    results = ROOT / 'docs/auditorias/evidencias-cadeia-financeira-20261029/incremental-prep-2015/approval-results.json'
    if results.exists():
        hashes = json.loads(results.read_text())['candidate_function_md5']
        post = 'DO $post$ BEGIN\n' + '\n'.join(f"IF md5(pg_get_functiondef({quote(sig)}::regprocedure)) IS DISTINCT FROM {quote(md5)} THEN RAISE EXCEPTION 'POST_BODY_DRIFT'; END IF;" for sig, md5 in sorted(hashes.items())) + "\nIF EXISTS(SELECT 1 FROM platform_private.credit_approval_tickets_20261029) THEN RAISE EXCEPTION 'POST_TICKET_RESIDUE'; END IF;\nEND $post$;\n"
        for name in ['01-credit-approval.install.sql.review']:
            p = H / name
            s = p.read_text()
            p.write_text(s.replace('\nCOMMIT;\n', '\n' + post + 'COMMIT;\n') if 'install' in name else s.replace('REVOKE EXECUTE', post + 'REVOKE EXECUTE'))
        p = H / 'postflight.sql.readonly'
        p.write_text(p.read_text() + post)
        (H / 'expected-postflight.json').write_text(json.dumps({'candidate_function_md5': hashes, 'level':'LOCAL_COMPONENT_EXPECTATIONS_NOT_HOSTED_PROOF'}, indent=2) + '\n')