"""Offline homolog continuation: additive closed catalog, never hosted access."""
import hashlib,json,re
import catalog_checks
from pathlib import Path
H=Path(__file__).resolve().parent
ROOT=H.parents[3]
C=ROOT/'scripts/b2b-cancellation-policy-20261112'
B4=ROOT/'scripts/b2b-downstream-audit-20261107/b4/review-d6cd95c0/b4-candidate.sql.review'
BR=ROOT/'scripts/b2b-downstream-audit-20261107/canonical-composition-feb815603/stages/04-bridge-install.sql.review'
def quote(s):return "'"+s.replace("'","''")+"'"
def cut(s,a,b):
 if s.count(a)!=1 or s.count(b)!=1:raise ValueError('ANCHOR_DRIFT')
 return s[s.index(a):s.index(b)]
def definition(s,name):
 m=re.search(r'CREATE (?:OR REPLACE )?FUNCTION '+re.escape(name)+r'\(',s)
 if not m:raise ValueError('FUNCTION_REQUIRED:'+name)
 opening=re.search(r'\bAS (\$\w*\$)',s[m.end():]);assert opening
 tag=opening[1];begin=m.end()+opening.end();end=s.index(tag,begin)
 return s[m.start():end+len(tag)]+';\n'
TARGET="""DO $target$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.fiscal_environment_marker WHERE project_ref='vrlcdwmlytukrjezrrnf' AND production_emission_allowed IS FALSE) OR EXISTS(SELECT 1 FROM public.fiscal_environment_marker WHERE project_ref IS DISTINCT FROM 'vrlcdwmlytukrjezrrnf' OR production_emission_allowed IS DISTINCT FROM FALSE) THEN RAISE EXCEPTION 'HOMOLOG_MARKER_REQUIRED'; END IF;
 IF EXISTS(SELECT 1 FROM cron.job WHERE active) THEN RAISE EXCEPTION 'HOMOLOG_CRON_ACTIVE'; END IF;
 IF to_regclass('platform_private.b2b_financial_forecasts') IS NULL THEN RAISE EXCEPTION 'STAGE_A_REQUIRED'; END IF;
 IF EXISTS(SELECT 1 FROM platform_private.b2b_forecast_creation_gate_v1 WHERE enabled) OR EXISTS(SELECT 1 FROM platform_private.b2b_forecast_lifecycle_gate_v1 WHERE enabled) THEN RAISE EXCEPTION 'FOUNDATION_MUST_REMAIN_CLOSED'; END IF;
END $target$;
"""
def catalog_guard(data):
 s='DO $catalog$ BEGIN\n'
 for r in data['schema']:
  name=r['name'];acl=sorted((r['raw_acl'] or '{}').strip('{}').split(','))
  acl=[a for a in acl if a]
  s+=f"IF (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid=to_regclass('{name}')) IS DISTINCT FROM '{r['owner']}' OR (SELECT relrowsecurity FROM pg_class WHERE oid=to_regclass('{name}')) IS DISTINCT FROM {str(r['relrowsecurity']).lower()} OR (SELECT relforcerowsecurity FROM pg_class WHERE oid=to_regclass('{name}')) IS DISTINCT FROM {str(r['relforcerowsecurity']).lower()} THEN RAISE EXCEPTION 'RELATION_OWNER_RLS_DRIFT:{name}'; END IF;\n"
  s+=f"IF (SELECT coalesce(jsonb_agg(a::text ORDER BY a::text),'[]'::jsonb) FROM pg_class c,unnest(c.relacl) a WHERE c.oid=to_regclass('{name}')) IS DISTINCT FROM {quote(json.dumps(acl))}::jsonb THEN RAISE EXCEPTION 'RELATION_ACL_DRIFT:{name}'; END IF;\n"
  for col in r['columns']:
   # Exact original fields: newly added fields do not invalidate unchanged baseline.
   expect=[col['type'],col['not_null'],col['default'],col['identity'],col['generated']]
   s+=f"IF (SELECT jsonb_build_array(format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid),a.attidentity,a.attgenerated) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=to_regclass('{name}') AND a.attname={quote(col['name'])} AND NOT a.attisdropped) IS DISTINCT FROM {quote(json.dumps(expect))}::jsonb THEN RAISE EXCEPTION 'COLUMN_DRIFT:{name}.{col['name']}'; END IF;\n"
  for con in r['constraints'] or []:
   s+=f"IF (SELECT pg_get_constraintdef(oid,true) FROM pg_constraint WHERE conrelid=to_regclass('{name}') AND conname={quote(con['name'])}) IS DISTINCT FROM {quote(con['definition'])} THEN RAISE EXCEPTION 'CONSTRAINT_DRIFT:{name}.{con['name']}'; END IF;\n"
  for ix in r['indexes'] or []:
   s+=f"IF NOT EXISTS(SELECT 1 FROM pg_index WHERE indrelid=to_regclass('{name}') AND pg_get_indexdef(indexrelid)={quote(ix)}) THEN RAISE EXCEPTION 'INDEX_DRIFT:{name}'; END IF;\n"
  for p in r['policies'] or []:
   expected=[p['command'],p['permissive'],p['roles'],p['using'],p['check']]
   s+=f"IF (SELECT jsonb_build_array(polcmd,polpermissive,polroles,pg_get_expr(polqual,polrelid),pg_get_expr(polwithcheck,polrelid)) FROM pg_policy WHERE polrelid=to_regclass('{name}') AND polname={quote(p['name'])}) IS DISTINCT FROM {quote(json.dumps(expected))}::jsonb THEN RAISE EXCEPTION 'POLICY_DRIFT:{name}.{p['name']}'; END IF;\n"
  for t in r['triggers'] or []:
   s+=f"IF (SELECT jsonb_build_array(tgenabled,md5(pg_get_functiondef(tgfoid)),tgfoid::regprocedure::text,pg_get_triggerdef(oid,true)) FROM pg_trigger WHERE tgrelid=to_regclass('{name}') AND tgname={quote(t['name'])}) IS DISTINCT FROM {quote(json.dumps([t['enabled'],t['body_md5'],t['function'],t['definition']]))}::jsonb THEN RAISE EXCEPTION 'TRIGGER_DRIFT:{name}.{t['name']}'; END IF;\n"
  s+=f"IF (SELECT count(*) FROM pg_trigger WHERE tgrelid=to_regclass('{name}') AND NOT tgisinternal)<>{len(r['triggers'] or [])} THEN RAISE EXCEPTION 'TRIGGER_SET_DRIFT:{name}'; END IF;\n"
 for d in data['definitions']:
  s+=f"IF md5(pg_get_functiondef(to_regprocedure({quote(d['signature'])}))) IS DISTINCT FROM '{d['current_md5']}' THEN RAISE EXCEPTION 'EXACT_DEFINITION_DRIFT:{d['signature']}'; END IF;\n"
 for t in data['triggers']:
  s+=f"IF (SELECT jsonb_build_array(evtevent,evtenabled,evttags,evtfoid::regprocedure::text,md5(pg_get_functiondef(evtfoid))) FROM pg_event_trigger WHERE evtname={quote(t['evtname'])}) IS DISTINCT FROM {quote(json.dumps([t['evtevent'],t['evtenabled'],t['evttags'],t['signature'],t['body_md5']]))}::jsonb THEN RAISE EXCEPTION 'EVENT_TRIGGER_DRIFT:{t['evtname']}'; END IF;\n"
 s+=f"IF (SELECT count(*) FROM pg_event_trigger)<>{len(data['triggers'])} THEN RAISE EXCEPTION 'EVENT_TRIGGER_SET_DRIFT'; END IF;\nEND $catalog$;\n"
 return s
def closed_post(tables,functions):
 s='DO $closed$ BEGIN\n'
 for n in tables:
  s+=f"IF to_regclass('{n}') IS NULL OR (SELECT relrowsecurity FROM pg_class WHERE oid=to_regclass('{n}')) IS NOT TRUE OR EXISTS(SELECT 1 FROM aclexplode(coalesce((SELECT relacl FROM pg_class WHERE oid=to_regclass('{n}')),acldefault('r',(SELECT relowner FROM pg_class WHERE oid=to_regclass('{n}'))))) WHERE grantee=0 OR grantee IN(SELECT oid FROM pg_roles WHERE rolname IN('anon','authenticated','service_role'))) THEN RAISE EXCEPTION 'NEW_RELATION_NOT_CLOSED:{n}'; END IF;\n"
 for n in functions:
  s+=f"IF to_regprocedure('{n}') IS NULL OR EXISTS(SELECT 1 FROM aclexplode(coalesce((SELECT proacl FROM pg_proc WHERE oid=to_regprocedure('{n}')),acldefault('f',(SELECT proowner FROM pg_proc WHERE oid=to_regprocedure('{n}'))))) WHERE grantee=0 OR grantee IN(SELECT oid FROM pg_roles WHERE rolname IN('anon','authenticated','service_role'))) THEN RAISE EXCEPTION 'NEW_FUNCTION_NOT_CLOSED:{n}'; END IF;\n"
 return s+'END $closed$;\n'
def stage(label,body,tables,functions,extra_post=''):
 pre=TARGET+CHECKER_PIN+"SELECT platform_private.cancel_homolog_catalog_check_v1();\n"+'DO $absent$ BEGIN\n'
 for n in tables:pre+=f"IF to_regclass('{n}') IS NOT NULL THEN RAISE EXCEPTION 'STAGE_ALREADY_PRESENT:{n}'; END IF;\n"
 for n in functions:pre+=f"IF to_regprocedure('{n}') IS NOT NULL THEN RAISE EXCEPTION 'STAGE_ALREADY_PRESENT:{n}'; END IF;\n"
 pre+='END $absent$;\n'
 post=closed_post(tables,functions)+extra_post
 # Catalog delta is bounded to the supplied stage; roles, RLS/policies, existing bodies unchanged.
 invariant="SELECT md5(jsonb_build_object('roles',(SELECT jsonb_agg(to_jsonb(m) ORDER BY roleid,member) FROM pg_auth_members m),'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY oid) FROM pg_policy p),'triggers',(SELECT jsonb_agg(jsonb_build_array(oid,tgenabled,pg_get_triggerdef(oid)) ORDER BY oid) FROM pg_trigger WHERE NOT tgisinternal),'functions',(SELECT jsonb_agg(jsonb_build_array(oid,md5(pg_get_functiondef(oid)),proacl,proconfig) ORDER BY oid) FROM pg_proc WHERE prokind='f' AND pronamespace='public'::regnamespace))::text)"
 before='CREATE TEMP TABLE continuation_before ON COMMIT DROP AS '+invariant+' AS pin;\n'
 after='DO $invariant$ DECLARE p text;BEGIN '+invariant+' INTO p;IF p IS DISTINCT FROM (SELECT pin FROM continuation_before) THEN RAISE EXCEPTION \'EXISTING_AUTHORITY_CHANGED\'; END IF;END $invariant$;\n'
 head="-- HOMOLOG ONLY vrlcdwmlytukrjezrrnf; CLOSED additive preparation; no operational hooks.\nBEGIN;SET LOCAL lock_timeout='3s';SET LOCAL statement_timeout='30s';SET LOCAL search_path=public,pg_catalog;\n"
 (H/(label+'-pre.sql.readonly')).write_text(head+pre+'ROLLBACK;\n')
 (H/(label+'-install.sql.review')).write_text(head+pre+before+body+post+after+'COMMIT;\n')
 (H/(label+'-post.sql.readonly')).write_text(head+TARGET+CHECKER_PIN+post+"SELECT platform_private.cancel_homolog_catalog_check_v1();\n"+'ROLLBACK;\n')
 rollback=head+TARGET
 for n in functions:rollback+=f'REVOKE ALL ON FUNCTION {n} FROM PUBLIC,anon,authenticated,service_role;\n'
 for n in tables:rollback+=f'REVOKE ALL ON {n} FROM PUBLIC,anon,authenticated,service_role;\n'
 rollback+=post+'COMMIT;\n'
 (H/(label+'-rollback-deny.sql.review')).write_text(rollback)
 return dict(stage=label,tables=tables,functions=functions,status='REVIEW_CLOSED_ADDITIVE_FULL_CATALOG_ROUNDTRIP_NOT_PROVEN')
def generate():
 global DATA,CHECKER_PIN
 DATA=json.loads((H/'capture/catalog.json').read_text())
 # Supplied regprocedure display strings are not namespace identities. The
 # bootstrap stores compact pins once and resolves unqualified names by unique
 # OID + exact MD5; every stage calls the same pinned checker, never skips it.
 checkparts=catalog_checks.segmented_sources(DATA)
 CHECKER_PIN='DO $checker_pin$ BEGIN\n'
 initdir=H/'checks';initdir.mkdir(exist_ok=True)
 for i,(sig,body) in enumerate(checkparts):
  m=re.search(r'AS (\$\w*\$)',body);assert m
  prosrc=body[m.end():body.index(m[1],m.end())]
  src_md5=hashlib.md5(prosrc.encode()).hexdigest()
  config=['search_path=public, pg_catalog'] if sig=='platform_private.cancel_homolog_catalog_check_v1()' else ['search_path=""']
  CHECKER_PIN+=f"IF (SELECT jsonb_build_array(md5(prosrc),pg_get_userbyid(proowner),prosecdef,proconfig,(SELECT coalesce(jsonb_agg(a::text ORDER BY a::text),'[]'::jsonb) FROM unnest(proacl) a)) FROM pg_proc WHERE oid=to_regprocedure('{sig}')) IS DISTINCT FROM jsonb_build_array('{src_md5}','postgres',true,{quote(json.dumps(config))}::jsonb,'[\"postgres=X/postgres\"]'::jsonb) THEN RAISE EXCEPTION 'CHECKER_PIN_DRIFT:{sig}'; END IF;\n"
  absence=f"DO $absence$ BEGIN IF to_regprocedure('{sig}') IS NOT NULL THEN RAISE EXCEPTION 'CHECKER_ALREADY_PRESENT:{sig}'; END IF;END $absence$;\n"
  (initdir/f'{i:02d}-install-checker.sql.review').write_text("-- HOMOLOG ONLY; catalog validation infrastructure, no business grants.\nBEGIN;SET LOCAL lock_timeout='3s';SET LOCAL statement_timeout='30s';\n"+TARGET+absence+body+"COMMIT;\n")
 CHECKER_PIN+='END $checker_pin$;\n'
 (initdir/'99-verify-checker.sql.readonly').write_text('BEGIN READ ONLY;\n'+TARGET+CHECKER_PIN+'SELECT platform_private.cancel_homolog_catalog_check_v1();\nROLLBACK;\n')
 b4=B4.read_text();bridge=BR.read_text();candidate=(C/'candidate.sql').read_text()
 # Independent provenance relations only, not the B4 motor/conditions/view/hooks.
 tables=['platform_private.b2b_authorized_documents','platform_private.b2b_document_allocations','platform_private.b2b_allocation_reversals','platform_private.b2b_title_permits','platform_private.b2b_cancellation_attestations']
 body=cut(b4,'CREATE TABLE platform_private.b2b_authorized_documents (','ALTER TABLE public.accounts_receivable ADD COLUMN')
 for n in tables:body+=f'ALTER TABLE {n} ENABLE ROW LEVEL SECURITY;REVOKE ALL ON {n} FROM PUBLIC,anon,authenticated,service_role;\n'
 stages=[stage('B',body,tables,[])]
 tables=['platform_private.b2b_fiscal_service_permits','platform_private.fiscal_close_pending','platform_private.b2b_fiscal_invoice_snapshots']
 body=cut(bridge,'CREATE TABLE platform_private.b2b_fiscal_service_permits(','ALTER TABLE platform_private.b2b_title_permits')
 body+="ALTER TABLE public.receivable_payments ADD COLUMN idempotency_key text;\nCREATE UNIQUE INDEX cancel_homolog_payment_idem_v1 ON public.receivable_payments(installment_id,idempotency_key) WHERE idempotency_key IS NOT NULL;\nALTER TABLE public.fiscal_sefaz_transmissions ADD COLUMN protocol_c_stat text;\nALTER TABLE public.accounts_receivable ADD COLUMN b2b_document_id uuid REFERENCES platform_private.b2b_authorized_documents(id);\nCREATE UNIQUE INDEX cancel_homolog_one_title_document_v1 ON public.accounts_receivable(b2b_document_id) WHERE b2b_document_id IS NOT NULL;\n"
 # No NOT NULL relaxation, index drop, hook, legacy body replacement or backfill.
 stages.append(stage('C',body,tables,[],"DO $shape$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.receivable_payments'::regclass AND attname='idempotency_key' AND atttypid='text'::regtype) OR NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.fiscal_sefaz_transmissions'::regclass AND attname='protocol_c_stat' AND atttypid='text'::regtype) THEN RAISE EXCEPTION 'ADDITIVE_COLUMN_MISSING'; END IF;END $shape$;\n"))
 # State mismatch fixed explicitly; no invented synonym or state migration.
 capability=definition(candidate,'public.rpc_b2b_cancel_residual_capability_v1').replace('public.rpc_b2b_cancel_residual_capability_v1','platform_private.cancel_homolog_residual_capability_v1').replace("'aprovado_previsto','faturado_parcial'","'aguardando_fiscal','faturado_parcial'")
 residual=definition(candidate,'public.rpc_b2b_forecast_cancel_residual_v1').replace('public.rpc_b2b_forecast_cancel_residual_v1','platform_private.cancel_homolog_residual_command_v1')
 fiscal=definition(candidate,'platform_private.b2b_cancel_confirmed_fiscal_v1')
 body=cut(candidate,'CREATE TABLE platform_private.b2b_cancel_policy_gate_v1','CREATE OR REPLACE FUNCTION public.rpc_b2b_forecast_cancel_residual_v1')
 tables=['platform_private.b2b_cancel_policy_gate_v1','platform_private.b2b_cancel_policy_allowlist_v1']
 for n in tables:body+=f'ALTER TABLE {n} ENABLE ROW LEVEL SECURITY;\n'
 body+=capability+residual+fiscal
 functions=['platform_private.cancel_homolog_residual_capability_v1(uuid)','platform_private.cancel_homolog_residual_command_v1(uuid,integer,text)','platform_private.b2b_cancel_confirmed_fiscal_v1(uuid)']
 for n in functions:body+=f'REVOKE ALL ON FUNCTION {n} FROM PUBLIC,anon,authenticated,service_role;\n'
 stages.append(stage('D',body,tables,functions,"DO $off$ BEGIN IF EXISTS(SELECT 1 FROM platform_private.b2b_cancel_policy_gate_v1 WHERE enabled) OR EXISTS(SELECT 1 FROM platform_private.b2b_cancel_policy_allowlist_v1) THEN RAISE EXCEPTION 'CANCEL_POLICY_MUST_BE_CLOSED'; END IF;END $off$;\n"))
 statement=json.loads((H/'capture/statement-guard.json').read_text())
 (H/'capture/statement-guard.sql').write_text(statement['exact_definition']+';\n')
 pre=TARGET+CHECKER_PIN+'SELECT platform_private.cancel_homolog_catalog_check_v1();\n'
 pre+=f"DO $statement_pin$ BEGIN IF (SELECT jsonb_build_array(md5(pg_get_functiondef(oid)),pg_get_userbyid(proowner),proacl::text,proconfig) FROM pg_proc WHERE oid=to_regprocedure('{statement['signature']}')) IS DISTINCT FROM {quote(json.dumps([statement['current_md5'],statement['owner'],statement['acl'],statement['proconfig']]))}::jsonb THEN RAISE EXCEPTION 'E_STATEMENT_PIN_DRIFT'; END IF;END $statement_pin$;\n"
 ebody=(H/'fixture_barrier.sql.source').read_text()
 etables=['platform_private.cancel_homolog_fixture_'+n+'_v1' for n in ['gate','grants','permits']]
 efunctions=['platform_private.cancel_homolog_fixture_scope_v1(text,uuid,jsonb,boolean)','platform_private.cancel_homolog_fixture_row_guard_v1()']
 post=closed_post(etables,efunctions)+"DO $Eoff$ BEGIN IF EXISTS(SELECT 1 FROM platform_private.cancel_homolog_fixture_gate_v1 WHERE enabled) OR EXISTS(SELECT 1 FROM platform_private.cancel_homolog_fixture_grants_v1) OR EXISTS(SELECT 1 FROM platform_private.cancel_homolog_fixture_permits_v1) THEN RAISE EXCEPTION 'E_FIXTURE_NOT_CLOSED_EMPTY'; END IF;IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='a00_homolog_validation_no_receivable' AND tgrelid='public.accounts_receivable'::regclass AND tgenabled='O' AND tgfoid='platform_private.homolog_validation_block_receivable_insert()'::regprocedure) OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='zz_cancel_homolog_fixture_row_guard_v1' AND tgrelid='public.accounts_receivable'::regclass AND tgenabled='O') OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='zz_cancel_homolog_fixture_payment_guard_v1' AND tgrelid='public.receivable_payments'::regclass AND tgenabled='O') THEN RAISE EXCEPTION 'E_ROW_OR_STATEMENT_GUARD_MISSING'; END IF;END $Eoff$;\n"
 # Body/config/owner pins for every new E helper and replaced statement guard.
 epins='DO $Epin$ BEGIN\n'
 for sig in efunctions+[statement['signature']]:
  name=sig.split('(')[0];body=definition(ebody,name);m=re.search(r'AS (\$\w*\$)',body);assert m
  src=body[m.end():body.index(m[1],m.end())]
  epins+=f"IF (SELECT jsonb_build_array(md5(prosrc),pg_get_userbyid(proowner),proconfig,prosecdef) FROM pg_proc WHERE oid=to_regprocedure('{sig}')) IS DISTINCT FROM jsonb_build_array('{hashlib.md5(src.encode()).hexdigest()}','postgres','[\"search_path=\\\"\\\"\"]'::jsonb,true) THEN RAISE EXCEPTION 'E_FUNCTION_PIN_DRIFT:{sig}'; END IF;\n"
 epins+='END $Epin$;\n'
 post+=epins
 for n in etables:pre+=f"DO $absence$ BEGIN IF to_regclass('{n}') IS NOT NULL THEN RAISE EXCEPTION 'E_ALREADY_PRESENT:{n}'; END IF;END $absence$;\n"
 head="-- HOMOLOG ONLY; reviewed exception infrastructure, gate OFF/no issuer/no client grant.\nBEGIN;SET LOCAL lock_timeout='3s';SET LOCAL statement_timeout='30s';\n"
 (H/'E-pre.sql.readonly').write_text(head+pre+'ROLLBACK;\n')
 (H/'E-install-closed.sql.review').write_text(head+pre+ebody+post+'COMMIT;\n')
 (H/'E-post.sql.readonly').write_text(head+TARGET+post+'ROLLBACK;\n')
 rollback=TARGET+"UPDATE platform_private.cancel_homolog_fixture_gate_v1 SET enabled=false;\n"
 for sig in efunctions:rollback+=f'REVOKE ALL ON FUNCTION {sig} FROM PUBLIC,anon,authenticated,service_role;\n'
 (H/'E-rollback-deny.sql.review').write_text(head+epins+rollback+closed_post(etables,efunctions)+'COMMIT;\n')
 (H/'E-required-statement-guard.sql.readonly').write_text('-- SUPERSEDED: exact body received 01:49; no further inventory requested.\nSELECT \'STATEMENT_GUARD_CAPTURE_RECEIVED\' AS status;\n')
 (H/'manifest.json').write_text(json.dumps(dict(target_ref='vrlcdwmlytukrjezrrnf',stage_A='INSTALLED_POST_PASS_OWNER_REPORTED_NOT_RERUN_HOSTED',capture_sha256=hashlib.sha256((H/'capture/catalog.json').read_bytes()).hexdigest(),stages=stages,E='CLOSED_BARRIER_INFRASTRUCTURE_NO_ISSUER',checker_segments=len(checkparts),operational_installable=False,decision='AUTHORIZE_AND_REVIEW_EXACT_SYNTHETIC_INTENT_ISSUER_BEFORE_ANY_ENABLEMENT',hosted_executed=False,source_sha256={str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in [B4,BR,C/'candidate.sql',H/'fixture_barrier.sql.source']}),indent=2)+'\n')
 sums=[]
 for p in sorted(H.rglob('*')):
  if p.is_file() and p.name!='SHA256SUMS' and '__pycache__' not in p.parts and 'evidence' not in p.parts:sums.append(hashlib.sha256(p.read_bytes()).hexdigest()+'  '+str(p.relative_to(H)))
 (H/'SHA256SUMS').write_text('\n'.join(sums)+'\n')
 print('B/C/D closed; OID checker segmented; E row+statement infrastructure closed, no fixture issuer or grants.')
if __name__=='__main__':generate()