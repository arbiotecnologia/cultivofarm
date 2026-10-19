"""Offline, fixed-baseline assembler. Never connects to hosted services."""
from pathlib import Path
import importlib.util,json,hashlib,re,subprocess
H=Path(__file__).resolve().parent
ROOT=H.parents[1]
BASELINE='c30af10c472255c919d167bc555c4f757eedaff0'
APPROVAL='e6a67a2d4c0146760c17e6c5bf6003027dedf87f'
UI='src/components/ordens-servico/OSDetalhesDialog.tsx'
UI_PRE='d181e5b904cb8b4b5ad8a42a0f398173909d73da9b63e54cb06479c0a7b8a73f'
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def verify_protected():
 for path,expected in json.loads((H/'protected.json').read_text()).items():
  if sha(ROOT/path)!=expected: raise ValueError('protected_drift:'+path)
 for commit in [BASELINE,APPROVAL]:
  data=subprocess.check_output(['git','show',commit+':'+UI],cwd=ROOT)
  if hashlib.sha256(data).hexdigest()!=UI_PRE or (H/'rollback/OSDetalhesDialog.tsx').read_bytes()!=data: raise ValueError('fixed_baseline_drift')
def guard(post=False):
 # Reuse immutable observed catalog predicates, not a moving HEAD or altered approval package.
 spec=importlib.util.spec_from_file_location('approval_catalog',ROOT/'scripts/os-approval-recovery/assemble.py')
 m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
 posts=json.loads((ROOT/'scripts/os-approval-recovery/post-hashes.json').read_text())
 rewritten=[]
 new_hash=json.loads((H/'post-hashes.json').read_text())['public.rpc_programar_os_v1(uuid,text,date)']
 for sig,digest,vol,sec,config,roles in m.CONTRACTS:
  if sig in posts: digest=posts[sig]
  if sig=='public.rpc_aprovar_os_v1(uuid,text)': roles=['authenticated','postgres']
  if sig=='public.rpc_programar_os_v1(uuid,text,date)' and post:
   digest=new_hash;config='search_path=""';roles=['authenticated','postgres','service_role']
  rewritten.append((sig,digest,vol,sec,config,roles))
 m.CONTRACTS=rewritten
 result=m.guard(False).replace('OS_APPROVAL_','OS_PROGRAMMING_')
 # The reader already installed by the auditor stays unchanged; operations stay closed.
 result=result.replace('END $guard$;',"""IF (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.rpc_cockpit_listar_esteira_v1(text,text[],text[],text[],boolean,date,date,boolean,integer,integer)'::regprocedure) IS DISTINCT FROM '36ef75405315a11e47fee042d6a575cb' THEN RAISE EXCEPTION 'READER_DRIFT'; END IF;
END $guard$;""")
 cockpit=(ROOT/'scripts/cockpit-status-renewal/postflight-readonly.sql').read_text()
 return result+cockpit[cockpit.index('DO $guard$'):cockpit.index("SELECT '36ef")]+supplemental(post)
def supplemental(post=False):
 catalogs=[json.loads((H/name).read_text()) for name in ['catalog.json','transitive-catalog.json','schema-catalog.json']]
 functions={}
 for j in catalogs:
  for f in j['functions']:functions[f['sig']]=f
 lines=["DO $supplement$ BEGIN", "IF (SELECT project_ref FROM public.fiscal_environment_marker LIMIT 1) IS DISTINCT FROM 'swzpzcwiasxmjutrmvkm' THEN RAISE EXCEPTION 'CANONICAL_REF_DENIED'; END IF;"]
 for sig,f in sorted(functions.items()):
  digest=f['hash'];acl=f['acl']
  if sig=='rpc_programar_os_v1(uuid,text,date)' and post:
   digest=json.loads((H/'post-hashes.json').read_text())['public.rpc_programar_os_v1(uuid,text,date)']
   acl='{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}'
  sig=sig if '.' in sig.split('(')[0] else 'public.'+sig
  sig=sig.replace("'","''");acl=acl.replace("'","''") if acl else None
  acl_expr="NULL" if acl is None else "'"+acl+"'"
  lines.append(f"IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('{sig}') AND md5(pg_get_functiondef(oid))='{digest}' AND proowner='postgres'::regrole AND proacl::text IS NOT DISTINCT FROM {acl_expr}) THEN RAISE EXCEPTION 'TRANSITIVE_FUNCTION_DRIFT: {sig}'; END IF;")
 c=catalogs[0];t=catalogs[1]
 for table in ['ordens_servico','programacao_producao']:
  expected=sorted(x['name'] for x in c['triggers'] if x['table']==table)
  array='ARRAY['+','.join("'"+v+"'" for v in expected)+']::text[]'
  lines.append(f"IF (SELECT array_agg(tgname::text ORDER BY tgname) FROM pg_trigger WHERE tgrelid='public.{table}'::regclass AND NOT tgisinternal) IS DISTINCT FROM {array} THEN RAISE EXCEPTION 'TRIGGER_SET_DRIFT'; END IF;")
 for trg in c['triggers']:
  digest=hashlib.md5(trg['definition'].encode()).hexdigest()
  lines.append(f"IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.{trg['table']}'::regclass AND tgname='{trg['name']}' AND tgenabled='O' AND md5(pg_get_triggerdef(oid))='{digest}' AND md5(pg_get_functiondef(tgfoid))='{trg['hash']}') THEN RAISE EXCEPTION 'TRIGGER_DRIFT'; END IF;")
 for x in t['constraints']:
  if x['table'] not in ['ordens_servico','programacao_producao','production_order_link','lotes','profiles','user_roles','organizations','platform_org_admin_invites','organization_subscriptions','organization_feature_overrides','saas_plan_versions','saas_plan_version_features','saas_features','saas_modules']:continue
  digest=hashlib.md5(x['definition'].encode()).hexdigest()
  lines.append(f"IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.{x['table']}'::regclass AND conname='{x['name']}' AND convalidated AND NOT condeferrable AND md5(pg_get_constraintdef(oid))='{digest}') THEN RAISE EXCEPTION 'CONSTRAINT_DRIFT'; END IF;")
 for x in t['indexes']:
  digest=hashlib.md5(x['definition'].encode()).hexdigest()
  lines.append(f"IF NOT EXISTS(SELECT 1 FROM pg_index WHERE indexrelid=to_regclass('public.{x['name']}') AND indisvalid AND indisready AND md5(pg_get_indexdef(indexrelid))='{digest}') THEN RAISE EXCEPTION 'INDEX_DRIFT'; END IF;")
 r=json.loads((H/'refresh-catalog.json').read_text())
 for v in r['views']:
  lines.append(f"IF (SELECT md5(pg_get_viewdef(to_regclass('public.{v['name']}'),true))) IS DISTINCT FROM '{v['hash']}' THEN RAISE EXCEPTION 'REFRESH_VIEW_DRIFT'; END IF;")
 d=catalogs[2]
 watched={'ordens_servico','ordens_servico_onfarm','programacao_producao','lotes','production_order_link','profiles','user_roles','organizations','platform_org_admin_invites','organization_subscriptions','organization_feature_overrides','saas_plan_versions','saas_plan_version_features','saas_features','saas_modules'}
 for table in sorted(watched):
  cols=[x for x in d['columns'] if x['table']==table]
  data='\n'.join(x['name']+':'+x['type']+':'+str(x['notnull']).lower()+':'+(x['default'] or '')+':'+x['identity']+':'+x['generated'] for x in cols)
  digest=hashlib.md5(data.encode()).hexdigest()
  lines.append(f"IF (SELECT md5(string_agg(a.attname||':'||format_type(a.atttypid,a.atttypmod)||':'||a.attnotnull||':'||coalesce(pg_get_expr(d.adbin,d.adrelid),'')||':'||a.attidentity||':'||a.attgenerated,E'\\n' ORDER BY a.attnum)) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid='public.{table}'::regclass AND a.attnum>0 AND NOT a.attisdropped) IS DISTINCT FROM '{digest}' THEN RAISE EXCEPTION 'SUPPLEMENTAL_SCHEMA_DRIFT'; END IF;")
 # Captured target policy expressions, with OID-free role labels in original baseline guard.
 for x in t['policies']:
  digest=hashlib.md5(x['definition'].encode()).hexdigest()
  lines.append(f"IF NOT EXISTS(SELECT 1 FROM pg_policy WHERE polrelid='{x['table']}'::regclass AND polname='{x['name']}' AND md5(concat(polcmd,':',polpermissive,':',polroles,':',pg_get_expr(polqual,polrelid),':',pg_get_expr(polwithcheck,polrelid)))='{digest}') THEN RAISE EXCEPTION 'POLICY_DRIFT'; END IF;")
 lines.append('END $supplement$;')
 return '\n'.join(lines)+'\n'
def main():
 verify_protected()
 pre=guard();post=guard(True)
 header="-- REVIEW ONLY, NOT APPLIED. Canonical external Supabase only; no fixture writes.\nBEGIN;\nSET LOCAL lock_timeout='3s';\nSET LOCAL statement_timeout='15s';\n"
 (H/'preflight-readonly.sql').write_text('BEGIN READ ONLY;\n'+pre+"SELECT 'PRE PASS' result;\nROLLBACK;\n")
 (H/'postflight-readonly.sql').write_text('BEGIN READ ONLY;\n'+post+"SELECT 'POST PASS' result;\nROLLBACK;\n")
 # Grants occur only after exact PRE and post-definition validation in one transaction.
 acl="REVOKE ALL ON FUNCTION public.rpc_programar_os_v1(uuid,text,date) FROM PUBLIC,anon,authenticated;\nGRANT EXECUTE ON FUNCTION public.rpc_programar_os_v1(uuid,text,date) TO service_role;\n"
 (H/'candidate.sql.review').write_text(header+pre+(H/'rpc.sql.review').read_text()+acl+"GRANT EXECUTE ON FUNCTION public.rpc_programar_os_v1(uuid,text,date) TO authenticated;\n"+post+'COMMIT;\n')
 (H/'rollback.sql.review').write_text(header+post+(H/'rollback/rpc.sql.review').read_text()+acl+pre+'COMMIT;\n')
 artifact_paths=[p for p in H.rglob('*') if p.is_file() and '__pycache__' not in p.parts and 'snapshot' not in p.parts and p.name not in ['manifest.json','SHA256SUMS']]
 manifest={'canonical_ref':'swzpzcwiasxmjutrmvkm','baseline_commit':BASELINE,'approval_commit':APPROVAL,'hosted_executed':False,'release_gate':'AUDITOR REVIEW REQUIRED: executable reviewed delta; hosted PRE/POST, full unrelated schema and authenticated browser UNVERIFIED; retained global catalog/invite/MV locks','runtime':{'path':UI,'pre':UI_PRE,'post':sha(ROOT/UI),'rollback':'rollback/OSDetalhesDialog.tsx'},'protected':json.loads((H/'protected.json').read_text()),'artifacts':{p.relative_to(H).as_posix():sha(p) for p in sorted(artifact_paths)}}
 (H/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
 (H/'SHA256SUMS').write_text(''.join(sha(p)+'  '+p.relative_to(H).as_posix()+'\n' for p in sorted(artifact_paths))+sha(H/'manifest.json')+'  manifest.json\n')
if __name__=='__main__':main()