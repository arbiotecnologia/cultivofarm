"""Local, metadata-only inventory generator; no database connection or credentials."""
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HOME = Path(__file__).resolve().parent
CANDIDATE = ROOT / 'scripts/b2b-cancellation-policy-20261112'
FORECAST = ROOT / 'scripts/b2b-downstream-audit-20261107/b4/fiscal-decision-20261108/service-bridge-current-20261109/forecast-pre-nf-20261109'
TARGET = 'vrlcdwmlytukrjezrrnf'
REPORTED = {
 'public.rpc_b2b_forecast_cancel_residual_v1(uuid,integer,text)': None,
 'public.rpc_fiscal_sefaz_transmit_record_v1(uuid,text,jsonb)': 'e340a643e46c6cc0dea0fcebd207f612',
 'public.rpc_register_receivable_payment(uuid,jsonb)': 'f59c6c09309dfa8bb5fedfa53f0873d0',
 'public.rpc_fiscal_event_sefaz_prepare_v1(uuid,text,text,text,uuid)': 'a518f355f035d485f720419e05e89906',
 'public.rpc_fiscal_event_sefaz_reconcile_v1(uuid,uuid,text,text,text,timestamptz)': '474c1e8cb40a15bc9fcb2544fef1c4b6',
 'platform_private.b2b_financial_forecast_cancel_residual_v1(uuid,integer,text)': None,
 'platform_private.c2p1_internal_actor(public.app_role[])': '97bab97591a9f662bad7b1ccf837bfcd',
 'platform_private.b2b_forecast_lifecycle_scope_v1(text,uuid,uuid,uuid,uuid)': None,
 'platform_private.b2b_forecast_lifecycle_allowed_v1(text,uuid,uuid,uuid,uuid)': None,
 'public.rpc_fiscal_invoice_apply_authorization_v1(uuid,text,text,timestamptz,text,text,uuid)': '9c94985d80502c8aea8bfb5da3abdecd',
 'platform_private.b2b_fiscal_invoice_bridge_v1(uuid)': None,
}

def quoted(value):
 return "'" + value.replace("'", "''") + "'"

def build():
 pins = json.loads((CANDIDATE/'capture/pins.json').read_text())
 comparison = [dict(signature=s,reported_md5=m,candidate_pre_md5=pins[s]['md5'],
                     status='ABSENT' if m is None else 'MATCH_BODY_ONLY' if m==pins[s]['md5'] else 'DRIFT') for s,m in REPORTED.items()]
 (HOME/'reported-comparison.json').write_text(json.dumps(comparison,indent=2)+'\n')
 # Historical sources are references only, never an executable homolog chain.
 historic = json.loads((FORECAST/'final-manifest-20261110.json').read_text())
 sources = [CANDIDATE/'candidate.sql', *sorted((CANDIDATE/'capture').glob('*.sql'))]
 stages=[]
 for stage in historic['executable_order']:
  paths=[]
  for f in stage['files']:
   p=ROOT/f['path']
   if p.exists():
    paths.append(dict(path=f['path'],sha256=hashlib.sha256(p.read_bytes()).hexdigest(),historical_sha256=f['sha256']))
    if p.suffix in ('.review','.readonly') and ('install' in p.name or 'pre' in p.name): sources.append(p)
  stages.append(dict(stage=stage['stage'],kind='REFERENCE_ONLY_NOT_FOR_HOMOLOG_INSTALL',files=paths))
 sources=list(dict.fromkeys(sources))
 text='\n'.join(p.read_text() for p in sources)
 names=set(re.findall(r'\b((?:public|platform_private|auth|extensions)\.[a-z_][a-z_0-9]*)\s*\(',text,re.I))
 relations=set(re.findall(r'\b(?:FROM|JOIN|INTO|UPDATE|TABLE|REFERENCES|ON)\s+((?:public|platform_private)\.[a-z_][a-z_0-9]*)\b',text,re.I))
 names.update(s.split('(')[0] for s in REPORTED)
 names.update(['public.rpc_fiscal_event_sefaz_mark_signed_v1','public.rpc_receivable_money_projection_v1',
 'public.simulate_b2b_payment_condition_secure','public.recover_partner_order_attempt_v1',
 'public.create_partner_order_condition_secure','public.get_partner_order_secure',
 'public.get_partner_order_items_secure','public.is_financial_staff','public.fn_fiscal_can_operate',
 'public.fn_entrega_confirmar_engine_v1','public.delivery_no_downstream'])
 relations.update('public.'+s for s in ['profiles','user_roles','organizations','partner_accounts','partner_orders',
 'partner_order_items','partner_order_payment_terms','partner_order_payment_schedule','partner_order_financial_links',
 'accounts_receivable','accounts_receivable_installments','receivable_payments','financial_settings',
 'financial_categories','payment_methods','bank_accounts','fiscal_invoices','fiscal_invoice_items',
 'fiscal_events','fiscal_sefaz_transmissions','fiscal_xml_runs','company_fiscal_settings','financial_audit_log',
 'fiscal_audit_log','cf_user_guards_v1','organization_feature_overrides','saas_features',
 'v_fiscal_document_reconciliation_pending','entregas','estoque_produto'])
 relations.update('platform_private.'+s for s in ['b2b_authorized_documents','b2b_document_allocations',
 'b2b_allocation_reversals','b2b_fiscal_invoice_snapshots','b2b_fiscal_service_permits','fiscal_close_pending',
 'b2b_financial_forecasts','b2b_financial_forecast_events','b2b_forecast_creation_gate_v1',
 'b2b_forecast_creation_allowlist_v1','b2b_forecast_lifecycle_gate_v1','b2b_forecast_lifecycle_allowlist_v1',
 'b2b_forecast_consultation_links_v1','b2b_cancel_policy_gate_v1','b2b_cancel_policy_allowlist_v1'])
 header='-- Somente catálogo; executar manualmente APENAS no projeto '+TARGET+'.\n-- Não comprova ref pelo SQL: operador deve conferir URL/ref no painel antes de executar.\n'
 values=',\n'.join('('+quoted(s)+','+(quoted(m) if m else 'NULL')+')' for s,m in REPORTED.items())
 (HOME/'01-pre-functions.sql.readonly').write_text(header+"WITH expected(signature,reported_md5) AS (VALUES\n"+values+"\n) SELECT e.signature,e.reported_md5,p.oid IS NOT NULL AS present,md5(pg_get_functiondef(p.oid)) AS current_md5, pg_get_userbyid(p.proowner) AS owner,p.proacl::text AS raw_acl,p.proconfig,p.prosecdef,CASE WHEN e.reported_md5 IS NULL THEN p.oid IS NULL ELSE md5(pg_get_functiondef(p.oid))=e.reported_md5 END AS matches_report FROM expected e LEFT JOIN pg_proc p ON p.oid=to_regprocedure(e.signature) ORDER BY e.signature;\n")
 (HOME/'02-pre-runtime.sql.readonly').write_text(header+"SELECT version() AS postgres_version,current_setting('server_version_num') AS server_version_num;\nSELECT extname,extversion FROM pg_extension WHERE extname IN ('pg_cron','pgcrypto','uuid-ossp','pg_net') ORDER BY extname;\nSELECT nspname,pg_get_userbyid(nspowner) AS owner,nspacl::text AS acl FROM pg_namespace WHERE nspname IN ('public','platform_private','auth','extensions');\n-- Executar o SELECT abaixo só se pg_cron/cron.job existir; apenas contador, nunca command.\nSELECT count(*) FILTER (WHERE active) AS active_jobs FROM cron.job;\n")
 nv=',\n'.join('('+quoted(n)+')' for n in sorted(names))
 rv=',\n'.join('('+quoted(n)+')' for n in sorted(relations))
 # Catalog dependency closure plus name-based overload inventory; PL/pgSQL/dynamic SQL not fully tracked by pg_depend.
 function_sql="""WITH RECURSIVE wanted(name) AS (VALUES
{names}
), seed AS (SELECT p.oid FROM wanted w JOIN pg_namespace n ON n.nspname=split_part(w.name,'.',1) JOIN pg_proc p ON p.pronamespace=n.oid AND p.proname=split_part(w.name,'.',2)), closure(oid) AS (
 SELECT oid FROM seed UNION SELECT d.refobjid FROM closure c JOIN pg_depend d ON d.classid='pg_proc'::regclass AND d.objid=c.oid AND d.refclassid='pg_proc'::regclass
), objects AS (SELECT w.name,p.oid FROM wanted w LEFT JOIN pg_namespace n ON n.nspname=split_part(w.name,'.',1) LEFT JOIN pg_proc p ON p.pronamespace=n.oid AND p.proname=split_part(w.name,'.',2) UNION SELECT NULL::text,oid FROM closure WHERE oid NOT IN (SELECT oid FROM seed))
SELECT o.name AS requested,p.oid IS NOT NULL AS present,p.oid::regprocedure::text AS signature,pg_get_function_identity_arguments(p.oid) AS arguments,pg_get_function_result(p.oid) AS result, md5(pg_get_functiondef(p.oid)) AS md5,pg_get_userbyid(p.proowner) AS owner,p.proacl::text AS raw_acl,p.proconfig,p.prosecdef,p.provolatile,l.lanname,
(SELECT jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY a.grantee,a.privilege_type) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) AS effective_acl
FROM objects o LEFT JOIN pg_proc p ON p.oid=o.oid LEFT JOIN pg_language l ON l.oid=p.prolang WHERE p.oid IS NULL OR p.prokind='f' ORDER BY requested,signature;
""".replace('{names}',nv)
 (HOME/'03-inventory-functions.sql.readonly').write_text(header+function_sql)
 table_sql="""WITH wanted(name) AS (VALUES
{relations}
) SELECT w.name,c.oid IS NOT NULL AS present,c.relkind,pg_get_userbyid(c.relowner) AS owner,c.relacl::text AS raw_acl,c.relrowsecurity,c.relforcerowsecurity,
(SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'identity',a.attidentity,'generated',a.attgenerated,'default',pg_get_expr(d.adbin,d.adrelid),'collation',a.attcollation::regcollation::text) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped) AS columns,
(SELECT jsonb_agg(jsonb_build_object('name',x.conname,'type',x.contype,'validated',x.convalidated,'definition',pg_get_constraintdef(x.oid,true),'target',x.confrelid::regclass::text) ORDER BY x.conname) FROM pg_constraint x WHERE x.conrelid=c.oid) AS constraints,
(SELECT jsonb_agg(pg_get_indexdef(x.indexrelid) ORDER BY x.indexrelid::regclass::text) FROM pg_index x WHERE x.indrelid=c.oid) AS indexes,
(SELECT jsonb_agg(jsonb_build_object('name',t.tgname,'enabled',t.tgenabled,'definition',pg_get_triggerdef(t.oid,true),'function',t.tgfoid::regprocedure::text,'body_md5',md5(pg_get_functiondef(t.tgfoid))) ORDER BY t.tgname) FROM pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal) AS triggers,
(SELECT jsonb_agg(jsonb_build_object('name',p.polname,'command',p.polcmd,'permissive',p.polpermissive,'roles',p.polroles,'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid)) ORDER BY p.polname) FROM pg_policy p WHERE p.polrelid=c.oid) AS policies,
(SELECT jsonb_agg(jsonb_build_object('grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY a.grantee,a.privilege_type) FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a) AS effective_acl,
CASE WHEN c.relkind IN ('v','m') THEN pg_get_viewdef(c.oid,true) END AS view_definition
FROM wanted w LEFT JOIN pg_class c ON c.oid=to_regclass(w.name) ORDER BY w.name;
""".replace('{relations}',rv)
 (HOME/'04-inventory-relations.sql.readonly').write_text(header+table_sql)
 (HOME/'05-inventory-types-guards.sql.readonly').write_text(header+"SELECT n.nspname,t.typname,t.typtype,e.enumlabel,e.enumsortorder FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace LEFT JOIN pg_enum e ON e.enumtypid=t.oid WHERE n.nspname IN ('public','platform_private') AND t.typtype IN ('e','d') ORDER BY n.nspname,t.typname,e.enumsortorder;\nSELECT evtname,evtevent,evtenabled,evttags,evtfoid::regprocedure::text AS signature,md5(pg_get_functiondef(evtfoid)) AS body_md5 FROM pg_event_trigger ORDER BY evtname;\nSELECT r.rolname AS member,g.rolname AS inherited_role,m.admin_option FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member JOIN pg_roles g ON g.oid=m.roleid WHERE r.rolname IN ('anon','authenticated','service_role') ORDER BY 1,2;\n")
 manifest=dict(target_ref=TARGET,candidate_revision_reported='8cf02e2b',status='BLOCKED_EXACT_HOMOLOG_CATALOG_REQUIRED',
   remote_executed=False,installable=False,comparison_counts={s:sum(r['status']==s for r in comparison) for s in ['ABSENT','DRIFT','MATCH_BODY_ONLY']},
   function_names=sorted(names),relations=sorted(relations),source_files=[dict(path=str(p.relative_to(ROOT)),sha256=hashlib.sha256(p.read_bytes()).hexdigest()) for p in sources],canonical_stages=stages,
   limits=['pg_depend does not close dynamic or PL/pgSQL runtime dependencies','no hosted bodies/ACL/columns/guards captured','no business rows copied','historical /tmp/r12 and /tmp/c2neg absent; candidate roundtrip not rerun','service-only fiscal callbacks cannot be granted to authenticated'])
 (HOME/'source-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
 sums=[]
 for p in sorted(HOME.rglob('*')):
  if p.is_file() and p.name!='SHA256SUMS' and '__pycache__' not in p.parts and 'evidence' not in p.parts:
   sums.append(hashlib.sha256(p.read_bytes()).hexdigest()+'  '+str(p.relative_to(HOME)))
 (HOME/'SHA256SUMS').write_text('\n'.join(sums)+'\n')
 print(json.dumps(dict(status=manifest['status'],functions=len(names),relations=len(relations),comparison=manifest['comparison_counts'])))

if __name__=='__main__': build()