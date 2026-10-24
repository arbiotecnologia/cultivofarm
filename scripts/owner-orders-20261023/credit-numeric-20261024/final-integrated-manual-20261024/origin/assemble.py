"""Assemble inactive SQL from immutable read-only captures; never connects to hosted DB.

Reconciled variant: the manual initial-installments correction is ALREADY LIVE
(RPC 0778b876b300e08d53f1cf7790394fc5, AR fba70619b461c468a8c645ce1c3a8ed8,
AP f4b15f02171e321e5ca0370255ccbff1). PRE guards expect those LIVE bodies and the
private context table; the composed AR body is the reviewed future-composed reference
(LIVE manual branch + B2B contractual branch), never the historical pre-fix body.
"""
from pathlib import Path
import json, hashlib, re, sys
H = Path(__file__).resolve().parent
B = H / 'baseline'
OUT=H
ROOT = H.parents[4]
FIN = ROOT / 'scripts/financial-installments-initial-20261024'
numeric_expected={}
if '--credit-numeric' in sys.argv:
    N=H.parent/'credit-numeric-20261024'
    numeric_expected={'public.fn_b2b_credit_exposure':json.loads((N/'expected.json').read_text())['patched_md5']}
    OUT=N/'origin-rebase'
    OUT.mkdir(exist_ok=True)
functions = {}
for name in ['snapshot.json', 'pricing.json', 'dependencies.json','relations.json','policy-functions.json']:
    for f in json.loads((B/name).read_text())['functions']:
        f=dict(f)
        # captured signatures already canonical and include multiword types
        functions[f['sig'].split('(')[0]] = f

# LIVE manual correction (deployed by the auditor, commit e99d634): bodies and
# PG-normalized hashes cross-checked against the deployed package manifest.
live_hashes = json.loads((FIN/'post-hashes.json').read_text())
live_manual = {
    'public.fn_generate_receivable_installments': ('public.fn_generate_receivable_installments()', live_hashes['fn_generate_receivable_installments()'], FIN/'fn_generate_receivable_installments.sql.review', '{postgres=X/postgres,service_role=X/postgres}'),
    'public.fn_generate_payable_installments': ('public.fn_generate_payable_installments()', live_hashes['fn_generate_payable_installments()'], FIN/'fn_generate_payable_installments.sql.review', '{postgres=X/postgres,service_role=X/postgres}'),
    'public.rpc_create_financial_title': ('public.rpc_create_financial_title(text,jsonb)', live_hashes['rpc_create_financial_title(text,jsonb)'], FIN/'rpc_create_financial_title.sql.review', '{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}'),
}
assert live_hashes['fn_generate_receivable_installments()'] == 'fba70619b461c468a8c645ce1c3a8ed8'
assert live_hashes['fn_generate_payable_installments()'] == 'f4b15f02171e321e5ca0370255ccbff1'
assert live_hashes['rpc_create_financial_title(text,jsonb)'] == '0778b876b300e08d53f1cf7790394fc5'
for name, (sig, h, path, acl) in live_manual.items():
    # Byte-exact read: the deployed RPC source contains CRLF lines that pg_get_functiondef preserves.
    body = path.read_bytes().decode()
    f = functions.get(name, {})
    f.update({'sig': sig, 'sql': body, 'md5': h, 'owner': 'postgres', 'acl': acl})
    functions[name] = f

def swap(body, old, new):
    assert body.count(old) == 1, old[:100]
    return body.replace(old,new)
def guard(expected):
    checks=[]
    for name, f in functions.items():
        h=numeric_expected.get(name,expected.get(name,f['md5']))
        checks.append(f"IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid='{f['sig']}'::regprocedure AND md5(pg_get_functiondef(oid))='{h}' AND pg_get_userbyid(proowner)='{f['owner']}' AND proacl::text IS NOT DISTINCT FROM {quote(f['acl'])}) THEN RAISE EXCEPTION 'origin_dependency_drift:{name}'; END IF;")
    return 'DO $guard$ BEGIN\n'+'\n'.join(checks)+'\nEND $guard$;\n'
def quote(s): return 'NULL' if s is None else "'"+s.replace("'","''")+"'"
# Private context table is LIVE infrastructure deployed with the manual correction;
# the composed AR body depends on it. Guard existence, RLS and zero data privileges.
context_table_guard = "DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='platform_private' AND c.relname='financial_initial_installments' AND c.relrowsecurity AND NOT c.relforcerowsecurity) THEN RAISE EXCEPTION 'origin_private_context_table_drift'; END IF; IF has_table_privilege('anon','platform_private.financial_initial_installments','SELECT,INSERT,UPDATE,DELETE') OR has_table_privilege('authenticated','platform_private.financial_initial_installments','SELECT,INSERT,UPDATE,DELETE') OR has_table_privilege('service_role','platform_private.financial_initial_installments','SELECT,INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'origin_private_context_exposed'; END IF; END $$;\n"
pre = guard({})
chain=json.loads((B/'chain.json').read_text())
triggers='\n'.join(f"IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.{t['table']}'::regclass AND tgname={quote(t['name'])} AND tgenabled={quote(t['enabled'])} AND pg_get_triggerdef(oid)={quote(t['sql'])}) THEN RAISE EXCEPTION 'origin_trigger_drift:{t['table']}.{t['name']}'; END IF;" for t in chain['triggers'])
pre += 'DO $guard$ BEGIN\n'+triggers+'\nEND $guard$;\n'
trigger_relations=','.join(quote('public.'+t)+'::regclass' for t in sorted(set(t['table'] for t in chain['triggers'])))
def trigger_count_guard(extra=0):
    return f"DO $$ BEGIN IF (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN ({trigger_relations}))<>{len(chain['triggers'])+extra} THEN RAISE EXCEPTION 'origin_unexpected_trigger'; END IF; END $$;\n"
pre+=trigger_count_guard()
policies=json.loads((B/'policies.json').read_text())
tables=sorted(set(p['tablename'] for p in policies))
policy_literal=quote(json.dumps(policies))
table_literal=','.join(quote(t) for t in tables)
policy_guard=f"DO $guard$ BEGIN IF (SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY tablename,policyname),'[]') FROM pg_policies p WHERE schemaname='public' AND tablename IN ({table_literal})) IS DISTINCT FROM {policy_literal}::jsonb THEN RAISE EXCEPTION 'origin_policy_set_drift'; END IF;\n"
policy_guard+='\n'.join(f"IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='public.{t}'::regclass AND relrowsecurity AND NOT relforcerowsecurity) THEN RAISE EXCEPTION 'origin_RLS_drift:{t}'; END IF;" for t in tables)
policy_guard+='\nEND $guard$;\n'
pre+=policy_guard
pre+=context_table_guard
pre += "DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.partner_orders'::regclass AND attname='c2_external_origin_snapshot' AND NOT attisdropped) OR to_regprocedure('platform_private.c2_external_origin_assert(jsonb,uuid,uuid)') IS NOT NULL THEN RAISE EXCEPTION 'origin_already_installed_or_drift'; END IF; END $$;\n"
(OUT/'preflight.sql').write_text('-- READ ONLY. Operator must prove canonical ref swzpzcwiasxmjutrmvkm externally.\n-- MANDATORY HUMAN GATE: preflight-accounting.sql must also PASS; structural PASS alone is NO-GO.\n-- Owner A reported DRAFT/accounting_validated_at NULL; owner B has no configuration. Never fabricate validation.\n-- Reconciled base: manual initial-installments correction already LIVE (RPC 0778b876, AR fba70619, AP f4b15f02).\nBEGIN TRANSACTION READ ONLY;\n'+pre+'ROLLBACK;\n')
helper = '''CREATE FUNCTION platform_private.c2_external_origin_assert(s jsonb, partner uuid, client uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE uid uuid:=auth.uid(); org uuid; p public.partner_accounts;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE='42501'; END IF;
 SELECT * INTO p FROM public.partner_accounts WHERE id=partner FOR SHARE;
 org:=p.commercial_owner_organization_id;
 IF NOT FOUND OR p.ativo IS NOT TRUE OR p.deleted_at IS NOT NULL OR org IS NULL
 OR NOT EXISTS(SELECT 1 FROM public.organizations o WHERE o.id=org AND o.ativo AND o.status='ativa')
 OR EXISTS(SELECT 1 FROM public.organizations o WHERE o.partner_account_id=partner)
 OR s->>'contract' IS DISTINCT FROM 'C2_EXTERNAL_ORDER_ORIGIN_V1'
 OR NOT platform_private.b2b_internal_origin_valid(s)
 OR s->>'organization_id' IS DISTINCT FROM org::text OR s->>'partner_id' IS DISTINCT FROM partner::text
 THEN RAISE EXCEPTION 'C2_EXTERNAL_ORIGIN_DENIED' USING ERRCODE='42501'; END IF;
 IF client IS DISTINCT FROM p.client_id OR (client IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.clientes c WHERE c.id=client AND c.organization_id=org))
 THEN RAISE EXCEPTION 'C2_EXTERNAL_CLIENT_DENIED' USING ERRCODE='42501'; END IF;
 -- Initial writes are authorized only inside the existing canonical create transaction.
 -- Subsequent administration uses P1's active internal owner authority, never buyer roles.
 IF platform_private.has_ticket('c2_external_order_create',partner) THEN
  IF s->>'actor_user_id' IS DISTINCT FROM uid::text OR NOT platform_private.c2_owner_order_create_allowed(uid,partner)
  THEN RAISE EXCEPTION 'C2_EXTERNAL_CREATE_DENIED' USING ERRCODE='42501'; END IF;
  ELSE
  IF public.h15_actor_organization() IS DISTINCT FROM org OR NOT platform_private.c2p1_settings_allowed(partner,true)
  THEN RAISE EXCEPTION 'C2_EXTERNAL_OWNER_DENIED' USING ERRCODE='42501'; END IF;
 END IF;
END $function$;
REVOKE ALL ON FUNCTION platform_private.c2_external_origin_assert(jsonb,uuid,uuid) FROM PUBLIC,anon,authenticated;
'''
changed = ['public.create_partner_order_secure', 'platform_private.b2b_internal_order_snapshot_guard',
            'public.approve_partner_order', 'public.generate_b2b_receivable_secure_impl', 'public.fn_generate_receivable_installments']
order=functions[changed[1]]['sql']
external_approval=order[order.index(" IF NEW.status='aprovado'")+1:] if " IF NEW.status='aprovado'" in order else ''
# Preserve all finite-value/terms/items/schedule validation from the captured guard.
seal=order[order.index("IF NEW.status='aprovado' AND OLD.status IS DISTINCT FROM NEW.status THEN"):order.index(" ELSIF NEW.status IS DISTINCT FROM OLD.status AND public.fn_b2b_status_is_operational")]
seal=seal.replace('OLD.internal_origin_snapshot','OLD.c2_external_origin_snapshot')
branch='''
 -- Explicit external proof; NULL internal origin alone never authorizes a legacy order.
 IF TG_OP='INSERT' AND platform_private.has_ticket('c2_external_order_create',NEW.partner_id) THEN
  IF NEW.c2_external_origin_snapshot IS NOT NULL OR NEW.internal_origin_snapshot IS NOT NULL OR NEW.internal_economic_snapshot IS NOT NULL
  THEN RAISE EXCEPTION 'B2B_INTERNAL_SNAPSHOT_SERVER_ONLY' USING ERRCODE='42501'; END IF;
  IF NOT platform_private.c2_owner_order_create_allowed(uid,NEW.partner_id) OR NEW.created_by IS DISTINCT FROM uid
  THEN RAISE EXCEPTION 'C2_EXTERNAL_CREATE_DENIED' USING ERRCODE='42501'; END IF;
  SELECT p.commercial_owner_organization_id,p.client_id INTO org,NEW.cliente_id FROM public.partner_accounts p WHERE p.id=NEW.partner_id FOR SHARE;
  SELECT count(*) INTO candidate_count FROM public.company_fiscal_settings c WHERE c.organization_id=org AND c.is_active;
  IF candidate_count<>1 THEN RAISE EXCEPTION 'B2B_INTERNAL_ISSUER_AMBIGUOUS' USING ERRCODE='42501'; END IF;
  SELECT * INTO cs FROM public.company_fiscal_settings c WHERE c.organization_id=org AND c.is_active FOR SHARE;
  IF cs.configuration_status IS DISTINCT FROM 'VALIDATED' OR cs.accounting_validated_at IS NULL OR nullif(btrim(cs.legal_name),'') IS NULL OR nullif(btrim(cs.cnpj),'') IS NULL
  THEN RAISE EXCEPTION 'B2B_INTERNAL_ISSUER_NOT_VALIDATED' USING ERRCODE='42501'; END IF;
  NEW.c2_external_origin_snapshot:=jsonb_build_object('contract','C2_EXTERNAL_ORDER_ORIGIN_V1','schema_version','1','organization_id',org,'creditor_organization_id',org,'issuer_organization_id',org,'company_settings_id',cs.id,'company_configuration_version',cs.configuration_version,'issuer_legal_name',cs.legal_name,'issuer_cnpj',cs.cnpj,'actor_user_id',uid,'partner_id',NEW.partner_id);
  PERFORM platform_private.c2_external_origin_assert(NEW.c2_external_origin_snapshot,NEW.partner_id,NEW.cliente_id);
  IF NEW.ready_for_production OR NEW.status NOT IN ('em_analise_comercial','aguardando_cotacao','aguardando_aprovacao_credito') THEN RAISE EXCEPTION 'C2_EXTERNAL_INITIAL_STATE_DENIED' USING ERRCODE='42501'; END IF;
  RETURN NEW;
 END IF;
 IF TG_OP='INSERT' AND NEW.c2_external_origin_snapshot IS NOT NULL THEN RAISE EXCEPTION 'B2B_INTERNAL_SNAPSHOT_SERVER_ONLY' USING ERRCODE='42501'; END IF;
 IF TG_OP='UPDATE' AND (OLD.c2_external_origin_snapshot IS NOT NULL OR NEW.c2_external_origin_snapshot IS NOT NULL) THEN
  IF NEW.c2_external_origin_snapshot IS DISTINCT FROM OLD.c2_external_origin_snapshot OR NEW.internal_origin_snapshot IS DISTINCT FROM OLD.internal_origin_snapshot OR NEW.internal_economic_snapshot IS DISTINCT FROM OLD.internal_economic_snapshot
  THEN RAISE EXCEPTION 'B2B_INTERNAL_SNAPSHOT_IMMUTABLE' USING ERRCODE='42501'; END IF;
  PERFORM platform_private.c2_external_origin_assert(OLD.c2_external_origin_snapshot,OLD.partner_id,OLD.cliente_id);
  IF NEW.partner_id IS DISTINCT FROM OLD.partner_id OR NEW.cliente_id IS DISTINCT FROM OLD.cliente_id OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN RAISE EXCEPTION 'B2B_INTERNAL_IDENTITY_IMMUTABLE' USING ERRCODE='42501'; END IF;
  IF NEW.ready_for_production OR public.fn_b2b_status_is_operational(NEW.status) THEN RAISE EXCEPTION 'B2B_INTERNAL_DOWNSTREAM_UNVERIFIED' USING ERRCODE='42501'; END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND OLD.status IN ('cancelado','reprovado') THEN RAISE EXCEPTION 'B2B_INTERNAL_TERMINAL_STATUS' USING ERRCODE='42501'; END IF;
  IF OLD.internal_economic_snapshot IS NOT NULL AND (to_jsonb(NEW)-ARRAY['status','updated_at','approval_notes','estimated_delivery_date','financial_status','receivable_generated','receivable_generated_at','receivable_generated_by','future_financial_link','commercial_notes','payment_due_date','payment_method']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','updated_at','approval_notes','estimated_delivery_date','financial_status','receivable_generated','receivable_generated_at','receivable_generated_by','future_financial_link','commercial_notes','payment_due_date','payment_method']) THEN RAISE EXCEPTION 'B2B_INTERNAL_ECONOMICS_IMMUTABLE' USING ERRCODE='42501'; END IF;
 '''+seal+'''
 END IF;
 RETURN NEW;
 END IF;
'''
order=swap(order,"BEGIN\n IF TG_OP='INSERT' THEN","BEGIN\n"+branch+" IF TG_OP='INSERT' THEN")
child=functions['platform_private.b2b_internal_child_snapshot_guard']['sql']
child=swap(child,'  IF o.internal_origin_snapshot IS NOT NULL THEN',"  IF o.c2_external_origin_snapshot IS NOT NULL THEN PERFORM platform_private.c2_external_origin_assert(o.c2_external_origin_snapshot,o.partner_id,o.cliente_id); END IF;\n  IF o.internal_origin_snapshot IS NOT NULL OR o.c2_external_origin_snapshot IS NOT NULL THEN")
child=swap(child,'   PERFORM platform_private.b2b_internal_assert_origin(o.internal_origin_snapshot,o.partner_id,o.cliente_id);',"   IF o.internal_origin_snapshot IS NOT NULL THEN PERFORM platform_private.b2b_internal_assert_origin(o.internal_origin_snapshot,o.partner_id,o.cliente_id); END IF;")
final_guard='''CREATE FUNCTION platform_private.c2_external_final_state_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
BEGIN
  IF NEW.c2_external_origin_snapshot IS NOT NULL AND OLD.internal_economic_snapshot IS NULL AND NEW.internal_economic_snapshot IS NOT NULL AND NEW.status IS DISTINCT FROM 'aprovado' THEN
  RAISE EXCEPTION 'C2_EXTERNAL_UNFINALIZED_APPROVAL' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $function$;
REVOKE ALL ON FUNCTION platform_private.c2_external_final_state_guard() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER zz_c2_external_final_state BEFORE UPDATE ON public.partner_orders FOR EACH ROW EXECUTE FUNCTION platform_private.c2_external_final_state_guard();
'''
changed.append('platform_private.b2b_internal_child_snapshot_guard')
create=functions[changed[0]]['sql']
create=swap(create,'  INSERT INTO public.partner_orders(',"  -- Issue only after canonical role/partner/plan/cart/hash/credit checks and idempotent replay.\n  IF NOT v_is_internal AND platform_private.c2_owner_order_create_allowed(v_uid,p_partner_id) THEN\n    PERFORM platform_private.issue_ticket('c2_external_order_create',p_partner_id);\n  END IF;\n  INSERT INTO public.partner_orders(")
create=swap(create,'  RETURN v_result;',"  DELETE FROM platform_private.authz_tickets WHERE txid=txid_current() AND scope='c2_external_order_create' AND target=p_partner_id;\n  RETURN v_result;")
approve=swap(functions['public.approve_partner_order']['sql'],'ready_for_production = true, updated_at = now()',"ready_for_production = CASE WHEN c2_external_origin_snapshot IS NOT NULL THEN false ELSE true END, updated_at = now()")
approve=swap(approve,"IF v_final_status <> 'aprovado' OR v_final_ready IS NOT TRUE THEN","IF v_final_status <> 'aprovado' OR (v_final_ready IS NOT TRUE AND NOT EXISTS(SELECT 1 FROM public.partner_orders WHERE id=p_order_id AND c2_external_origin_snapshot IS NOT NULL AND internal_economic_snapshot IS NOT NULL)) THEN")
approve=swap(approve,"'Seu pedido foi aprovado e seguirá para planejamento de produção.',", "CASE WHEN EXISTS(SELECT 1 FROM public.partner_orders WHERE id=p_order_id AND c2_external_origin_snapshot IS NOT NULL)\n            THEN 'Seu pedido recebeu aprovação comercial. Planejamento de produção ainda não liberado.'\n            ELSE 'Seu pedido foi aprovado e seguirá para planejamento de produção.' END,")
impl=functions['public.generate_b2b_receivable_secure_impl']['sql']
impl=swap(impl,'  -- GATE Fase C: elegibilidade server-side',"  IF v_order.c2_external_origin_snapshot IS NOT NULL THEN\n    PERFORM platform_private.c2_external_origin_assert(v_order.c2_external_origin_snapshot,v_order.partner_id,v_order.cliente_id);\n    IF v_org::text IS DISTINCT FROM v_order.c2_external_origin_snapshot->>'creditor_organization_id' THEN RAISE EXCEPTION 'C2_EXTERNAL_CREDITOR_DRIFT' USING ERRCODE='42501'; END IF;\n  END IF;\n\n  -- GATE Fase C: elegibilidade server-side")
impl=swap(impl,"  v_uf := to_jsonb(v_partner) ->> 'uf';", "  -- External manual billing must honor configured delivery prerequisite too.\n  IF v_order.c2_external_origin_snapshot IS NOT NULL AND v_settings.billing_trigger='na_entrega' AND v_order.status IS DISTINCT FROM 'entregue' THEN\n    RAISE EXCEPTION 'C2_EXTERNAL_DELIVERY_REQUIRED' USING ERRCODE='42501';\n  END IF;\n\n  v_uf := to_jsonb(v_partner) ->> 'uf';")
# H6 installment immutability: the composed AR body is the reviewed future-composed
# reference = LIVE manual private-context branch + B2B contractual schedule branch.
# Never rebuild it from the historical pre-fix captured body.
future=(FIN/'future-composed-function.sql.review').read_bytes().decode()
b2b_branch="  IF NEW.origin_type='B2B_ORDER' AND EXISTS(SELECT 1 FROM public.partner_orders o WHERE o.id=NEW.origin_id AND o.c2_external_origin_snapshot IS NOT NULL) THEN\n    INSERT INTO public.accounts_receivable_installments(receivable_id,installment_number,due_date,original_amount,net_amount,status,organization_id,interest_amount)\n    SELECT NEW.id,s.installment_number,s.due_date,s.amount,s.amount,'OPEN',NEW.organization_id,s.interest_amount\n    FROM public.partner_order_payment_schedule s JOIN public.partner_orders o ON o.id=s.partner_order_id AND o.payment_terms_id=s.payment_terms_id\n    WHERE o.id=NEW.origin_id ORDER BY s.installment_number;\n    IF (SELECT count(*) FROM public.accounts_receivable_installments WHERE receivable_id=NEW.id)<>v_qtd THEN RAISE EXCEPTION 'B2B_INSTALLMENT_CARDINALITY_INVALID' USING ERRCODE='23514'; END IF;\n    RETURN NEW;\n  END IF;\n"
rebuilt=swap(functions['public.fn_generate_receivable_installments']['sql'],'  FOR i IN 1..v_qtd LOOP',b2b_branch+'  FOR i IN 1..v_qtd LOOP')
assert rebuilt.rstrip()==future.rstrip(), 'future-composed reference is not LIVE manual body + B2B branch'
assert 'FIN_INITIAL_CONTEXT_DENIED' in future and 'B2B_INSTALLMENT_CARDINALITY_INVALID' in future
installments=future
wrapper=(H/'wrapper.sql.review').read_text()
assert hashlib.md5(wrapper.encode()).hexdigest()=='31eeb54e4b69d97c311629a37e553faf'
bodies={'public.generate_b2b_receivable_secure':wrapper,changed[0]:create,changed[1]:order,'platform_private.b2b_internal_child_snapshot_guard':child,'public.approve_partner_order':approve,'public.generate_b2b_receivable_secure_impl':impl,'public.fn_generate_receivable_installments':installments}
(OUT/'expected-source.json').write_text(json.dumps({n:hashlib.md5(s.encode()).hexdigest() for n,s in bodies.items()},indent=2)+'\n')
# In-transaction accounting gate for owner A, BEFORE any guard/DDL. Locks only owner A's
# fiscal-settings rows FOR SHARE until COMMIT (blocks UPDATE/DELETE/deactivation of the attested
# row); the active-organization partial unique index makes any new/second active row for A
# conflict. Other companies are not locked. Never validates or writes settings.
OWNER_A='007bb519-cba0-4704-be2c-cb93ad010048'
accounting_gate=f"""DO $accounting_gate$
DECLARE n integer; ready boolean;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid WHERE i.indrelid='public.company_fiscal_settings'::regclass AND c.relname='ux_company_fiscal_settings_active_organization' AND i.indisunique AND i.indisvalid AND pg_get_indexdef(i.indexrelid)='CREATE UNIQUE INDEX ux_company_fiscal_settings_active_organization ON public.company_fiscal_settings USING btree (organization_id) WHERE (is_active IS TRUE)') THEN
   RAISE EXCEPTION 'C2_ACCOUNTING_GATE_INDEX_DRIFT' USING ERRCODE='42501';
 END IF;
 PERFORM 1 FROM public.company_fiscal_settings c WHERE c.organization_id='{OWNER_A}' ORDER BY c.id FOR SHARE;
 SELECT count(*),coalesce(bool_and(c.configuration_status='VALIDATED'
   AND c.accounting_validated_at IS NOT NULL
   AND nullif(btrim(c.legal_name),'') IS NOT NULL
   AND nullif(btrim(c.cnpj),'') IS NOT NULL),false)
 INTO n,ready FROM public.company_fiscal_settings c
 WHERE c.organization_id='{OWNER_A}' AND c.is_active IS TRUE;
 IF n<>1 OR NOT ready THEN
   RAISE EXCEPTION 'C2_ACCOUNTING_PREREQUISITE_BLOCKED: owner A requires one genuinely accounting-validated active fiscal configuration; human review required, writer must stay false'
   USING ERRCODE='42501';
 END IF;
END $accounting_gate$;
"""
(OUT/'candidate.sql.review').write_text('-- INACTIVE REVIEW ONLY. Does not reopen writer; no internal-origin bypass or RLS change.\n-- Reconciled: preserves LIVE manual initial-installments correction (private context, exact .34/.33/.33 split,\n-- custom dates inserted first) and adds the B2B contractual schedule branch on top of it.\n-- Owner A accounting gate runs FIRST in this same transaction, locking only A settings rows FOR SHARE until COMMIT;\n-- preflight-accounting.sql remains a separate READ ONLY diagnostic. Never validates/fabricates attestation.\nBEGIN;\nSET LOCAL lock_timeout=\'5s\'; SET LOCAL statement_timeout=\'60s\';\n'+accounting_gate+pre+"ALTER TABLE public.partner_orders ADD COLUMN c2_external_origin_snapshot jsonb;\n"+helper+'\n'.join(s.rstrip()+';\n' for s in bodies.values())+final_guard+'\nCOMMIT;\n')
# Rollback is containment only: preserve immutable snapshots/history and all composed financial guards.
contain=functions['platform_private.c2_owner_order_create_allowed']['sql']
contained_approve=swap(approve,"  IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found'; END IF;", "  IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found'; END IF;\n  IF EXISTS(SELECT 1 FROM public.partner_orders WHERE id=p_order_id AND c2_external_origin_snapshot IS NOT NULL) THEN\n    RAISE EXCEPTION 'C2_EXTERNAL_OPERATIONS_CONTAINED' USING ERRCODE='42501';\n  END IF;")
contained_impl=swap(impl,"  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado'; END IF;", "  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado'; END IF;\n  IF v_order.c2_external_origin_snapshot IS NOT NULL THEN\n    RAISE EXCEPTION 'C2_EXTERNAL_OPERATIONS_CONTAINED' USING ERRCODE='42501';\n  END IF;")
# Exact normalized PG hashes are captured by disposable tests; no guessed source hashes.
if (H/'postflight-hashes.json').exists() and (H/'postflight-new-functions.json').exists():
    composed=json.loads((H/'postflight-hashes.json').read_text())
    rollback_pre=guard(composed)+policy_guard+'DO $guard$ BEGIN\n'+triggers+'\nEND $guard$;\n'+trigger_count_guard(1)+context_table_guard
    closed=functions['platform_private.c2_owner_order_create_allowed']['md5']
    rollback_pre=rollback_pre.replace("md5(pg_get_functiondef(oid))='"+closed+"'", "md5(pg_get_functiondef(oid)) IN ('"+closed+"','5f0a08d1d4f8d8c5a7ae58e24c71071e')")
    for sig,h in json.loads((H/'postflight-new-functions.json').read_text()).items():
        rollback_pre+=f"DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid='{sig}'::regprocedure AND md5(pg_get_functiondef(oid))='{h}' AND pg_get_userbyid(proowner)='postgres' AND proacl::text='{{postgres=X/postgres}}') THEN RAISE EXCEPTION 'containment_helper_drift:{sig}'; END IF; END $$;\n"
    rollback_pre+="DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.partner_orders'::regclass AND tgname='zz_c2_external_final_state' AND tgenabled='O' AND pg_get_triggerdef(oid)='CREATE TRIGGER zz_c2_external_final_state BEFORE UPDATE ON public.partner_orders FOR EACH ROW EXECUTE FUNCTION platform_private.c2_external_final_state_guard()') THEN RAISE EXCEPTION 'containment_final_trigger_drift'; END IF; END $$;\n"
    # Embedded transactional POST checks normalized bodies plus original metadata.
    endpoint_post=''
    for name,source in [('public.approve_partner_order',contained_approve),('public.generate_b2b_receivable_secure_impl',contained_impl),('platform_private.c2_owner_order_create_allowed',contain)]:
        f=functions[name]
        endpoint_post+=f"DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid='{f['sig']}'::regprocedure AND md5(pg_get_functiondef(oid))=md5({quote(source)}) AND pg_get_userbyid(proowner)='{f['owner']}' AND proacl::text IS NOT DISTINCT FROM {quote(f['acl'])}) THEN RAISE EXCEPTION 'containment_post_drift:{name}'; END IF; END $$;\n"
    rollback_post=guard({**composed,'public.approve_partner_order':hashlib.md5(contained_approve.encode()).hexdigest(),'public.generate_b2b_receivable_secure_impl':hashlib.md5(contained_impl.encode()).hexdigest()})+policy_guard+'DO $guard$ BEGIN\n'+triggers+'\nEND $guard$;\n'+trigger_count_guard(1)+context_table_guard
    (OUT/'rollback.sql.review').write_text('-- CONTAINMENT ONLY, NOT CODE REVERSAL. Canonical ref must be proven externally.\n-- Owner must quiesce/drain affected writers BEFORE running; this does not cancel in-flight invocations.\n-- Expected composed release or reviewed reopened helper ONLY; unexpected/partially contained states abort.\n-- Preserves the LIVE manual initial-installments correction and the private context table.\nBEGIN;\nSET LOCAL lock_timeout=\'5s\'; SET LOCAL statement_timeout=\'60s\';\nLOCK TABLE public.partner_orders IN SHARE ROW EXCLUSIVE MODE;\n'+rollback_pre+'\n'+contain.rstrip()+';\n'+contained_approve.rstrip()+';\n'+contained_impl.rstrip()+';\n'+endpoint_post+rollback_post+'COMMIT;\n')
print('assembled',len(functions),'dependency guards;',len(bodies),'changed bodies; writer remains false')
if (H/'postflight-hashes.json').exists():
    expected=json.loads((H/'postflight-hashes.json').read_text())
    post=guard(expected)+policy_guard
    post+='DO $guard$ BEGIN\n'+triggers+'\nEND $guard$;\n'+trigger_count_guard(1)
    post+=context_table_guard
    post+="DO $$ BEGIN IF has_function_privilege('authenticated','platform_private.c2_external_origin_assert(jsonb,uuid,uuid)','EXECUTE') OR has_function_privilege('anon','platform_private.c2_external_origin_assert(jsonb,uuid,uuid)','EXECUTE') THEN RAISE EXCEPTION 'origin_private_helper_exposed'; END IF; IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.partner_orders'::regclass AND tgname='zz_c2_external_final_state' AND tgenabled='O') THEN RAISE EXCEPTION 'origin_final_guard_missing'; END IF; END $$;\n"
    if (H/'postflight-new-functions.json').exists():
        for sig,h in json.loads((H/'postflight-new-functions.json').read_text()).items():
            post+=f"DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid='{sig}'::regprocedure AND md5(pg_get_functiondef(oid))='{h}' AND pg_get_userbyid(proowner)='postgres') OR has_function_privilege('authenticated','{sig}','EXECUTE') OR has_function_privilege('anon','{sig}','EXECUTE') THEN RAISE EXCEPTION 'origin_new_helper_drift'; END IF; END $$;\n"
    (OUT/'postflight.sql').write_text('-- READ ONLY; validates composed containment, NOT writer reopening.\nBEGIN TRANSACTION READ ONLY;\n'+post+'ROLLBACK;\n')
    candidate=H/'candidate.sql.review'
    candidate.write_text(candidate.read_text().removesuffix('COMMIT;\n')+post+'COMMIT;\n')
    # Repeat exact immutable helper and final-trigger checks after containment writes.
    rollback=H/'rollback.sql.review'
    helper_post=''.join(rollback_pre[rollback_pre.index('DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid='):])
    rollback.write_text(rollback.read_text().removesuffix('COMMIT;\n')+helper_post+'COMMIT;\n')
import importlib.util
spec=importlib.util.spec_from_file_location('normalize_review', H.parent.parent/'receipt-lock-order-review/assemble.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
for n in ('preflight.sql','candidate.sql.review','postflight.sql','rollback.sql.review'):
 p=H/n
 if not p.exists(): continue  # phase 1: postflight/rollback only exist after disposable hash capture
 p.write_text(m.normalize(p.read_text(),n in ('preflight.sql','postflight.sql')))

if (H/'rollback.sql.review').exists():
 (H/'containment.sql.review').write_text((H/'rollback.sql.review').read_text())
