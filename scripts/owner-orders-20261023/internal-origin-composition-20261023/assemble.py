"""Assemble inactive SQL from immutable read-only captures; never connects to hosted DB."""
from pathlib import Path
import json, hashlib
H = Path(__file__).resolve().parent
B = H / 'baseline'
functions = {}
for name in ['snapshot.json', 'pricing.json', 'dependencies.json']:
    for f in json.loads((B/name).read_text())['functions']: functions[f['sig'].split('(')[0]] = f
changed = ['public.create_partner_order_secure', 'platform_private.b2b_internal_order_snapshot_guard',
           'public.approve_partner_order', 'public.generate_b2b_receivable_secure_impl', 'public.fn_generate_receivable_installments']
def swap(body, old, new):
    assert body.count(old) == 1, old[:100]
    return body.replace(old,new)
def guard(expected):
    checks=[]
    for name, f in functions.items():
        h=expected.get(name,f['md5'])
        checks.append(f"IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid='{f['sig']}'::regprocedure AND md5(pg_get_functiondef(oid))='{h}' AND pg_get_userbyid(proowner)='{f['owner']}' AND proacl::text IS NOT DISTINCT FROM {quote(f['acl'])}) THEN RAISE EXCEPTION 'origin_dependency_drift:{name}'; END IF;")
    return 'DO $guard$ BEGIN\n'+'\n'.join(checks)+'\nEND $guard$;\n'
def quote(s): return 'NULL' if s is None else "'"+s.replace("'","''")+"'"
pre = guard({})
chain=json.loads((B/'chain.json').read_text())
triggers='\n'.join(f"IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.{t['table']}'::regclass AND tgname={quote(t['name'])} AND tgenabled={quote(t['enabled'])} AND pg_get_triggerdef(oid)={quote(t['sql'])}) THEN RAISE EXCEPTION 'origin_trigger_drift:{t['table']}.{t['name']}'; END IF;" for t in chain['triggers'])
pre += 'DO $guard$ BEGIN\n'+triggers+'\nEND $guard$;\n'
pre += "DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.partner_orders'::regclass AND attname='c2_external_origin_snapshot' AND NOT attisdropped) OR to_regprocedure('platform_private.c2_external_origin_assert(jsonb,uuid,uuid)') IS NOT NULL THEN RAISE EXCEPTION 'origin_already_installed_or_drift'; END IF; END $$;\n"
(H/'preflight.sql').write_text('-- READ ONLY. Operator must prove canonical ref swzpzcwiasxmjutrmvkm externally.\nBEGIN TRANSACTION READ ONLY;\n'+pre+'ROLLBACK;\n')
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
changed.append('platform_private.b2b_internal_child_snapshot_guard')
create=functions[changed[0]]['sql']
create=swap(create,'  INSERT INTO public.partner_orders(',"  -- Issue only after canonical role/partner/plan/cart/hash/credit checks and idempotent replay.\n  IF NOT v_is_internal AND platform_private.c2_owner_order_create_allowed(v_uid,p_partner_id) THEN\n    PERFORM platform_private.issue_ticket('c2_external_order_create',p_partner_id);\n  END IF;\n  INSERT INTO public.partner_orders(")
create=swap(create,'  RETURN v_result;',"  DELETE FROM platform_private.authz_tickets WHERE txid=txid_current() AND scope='c2_external_order_create' AND target=p_partner_id;\n  RETURN v_result;")
approve=swap(functions['public.approve_partner_order']['sql'],'ready_for_production = true, updated_at = now()',"ready_for_production = CASE WHEN c2_external_origin_snapshot IS NOT NULL THEN false ELSE true END, updated_at = now()")
impl=functions['public.generate_b2b_receivable_secure_impl']['sql']
impl=swap(impl,'  -- GATE Fase C: elegibilidade server-side',"  IF v_order.c2_external_origin_snapshot IS NOT NULL THEN\n    PERFORM platform_private.c2_external_origin_assert(v_order.c2_external_origin_snapshot,v_order.partner_id,v_order.cliente_id);\n    IF v_org::text IS DISTINCT FROM v_order.c2_external_origin_snapshot->>'creditor_organization_id' THEN RAISE EXCEPTION 'C2_EXTERNAL_CREDITOR_DRIFT' USING ERRCODE='42501'; END IF;\n  END IF;\n\n  -- GATE Fase C: elegibilidade server-side")
# H6 installment immutability: seed exact contractual schedule on INSERT, never update immutable due/amount afterwards.
installments=functions['public.fn_generate_receivable_installments']['sql']
installments=swap(installments,'  FOR i IN 1..v_qtd LOOP',"  IF NEW.origin_type='B2B_ORDER' AND EXISTS(SELECT 1 FROM public.partner_orders o WHERE o.id=NEW.origin_id AND o.c2_external_origin_snapshot IS NOT NULL) THEN\n    INSERT INTO public.accounts_receivable_installments(receivable_id,installment_number,due_date,original_amount,net_amount,status,organization_id,interest_amount)\n    SELECT NEW.id,s.installment_number,s.due_date,s.amount,s.amount,'OPEN',NEW.organization_id,s.interest_amount\n    FROM public.partner_order_payment_schedule s JOIN public.partner_orders o ON o.id=s.partner_order_id AND o.payment_terms_id=s.payment_terms_id\n    WHERE o.id=NEW.origin_id ORDER BY s.installment_number;\n    IF (SELECT count(*) FROM public.accounts_receivable_installments WHERE receivable_id=NEW.id)<>v_qtd THEN RAISE EXCEPTION 'B2B_INSTALLMENT_CARDINALITY_INVALID' USING ERRCODE='23514'; END IF;\n    RETURN NEW;\n  END IF;\n  FOR i IN 1..v_qtd LOOP")
bodies={changed[0]:create,changed[1]:order,'platform_private.b2b_internal_child_snapshot_guard':child,'public.approve_partner_order':approve,'public.generate_b2b_receivable_secure_impl':impl,'public.fn_generate_receivable_installments':installments}
(H/'expected-source.json').write_text(json.dumps({n:hashlib.md5(s.encode()).hexdigest() for n,s in bodies.items()},indent=2)+'\n')
(H/'candidate.sql.review').write_text('-- INACTIVE REVIEW ONLY. Does not reopen writer; no internal-origin bypass or RLS change.\nBEGIN;\nSET LOCAL lock_timeout=\'5s\'; SET LOCAL statement_timeout=\'60s\';\n'+pre+"ALTER TABLE public.partner_orders ADD COLUMN c2_external_origin_snapshot jsonb;\n"+helper+'\n'.join(bodies.values())+'\nCOMMIT;\n')
# Rollback is containment only: preserve immutable snapshots/history and all composed financial guards.
contain=functions['platform_private.c2_owner_order_create_allowed']['sql']
(H/'rollback.sql.review').write_text('-- Deny-only containment, preserves all snapshots/data/financial guards.\nBEGIN;\n'+contain+'\nCOMMIT;\n')
print('assembled',len(functions),'dependency guards;',len(bodies),'changed bodies; writer remains false')