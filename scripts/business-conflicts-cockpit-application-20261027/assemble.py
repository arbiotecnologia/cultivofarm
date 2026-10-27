from pathlib import Path
import json,hashlib,difflib
H=Path(__file__).resolve().parent
a=json.loads((H/'live-targets.json').read_text()); deps=json.loads((H/'live-dependencies.json').read_text());auth=json.loads((H/'live-auth-readonly.json').read_text())
for r in auth:
 if not any(d['signature']==r['signature'] for d in deps['dependencies']):deps['dependencies'].append({k:v for k,v in r.items() if k!='definition'})
(H/'live-targets.json').write_text(json.dumps(a,indent=2)+'\n');(H/'live-dependencies.json').write_text(json.dumps(deps,indent=2)+'\n');(H/'live-auth-readonly.json').write_text(json.dumps(auth,indent=2)+'\n')
for r,msg in zip(a,['COCKPIT_LOTE_CONCORRENTE','application_version_conflict']):
 old=f"RAISE EXCEPTION '{msg}' USING ERRCODE='40001'";new=old.replace("'40001'","'PT409'");assert r['definition'].count(old)==1
 r['candidate']=r['definition'].replace(old,new);r['candidate_md5']=hashlib.md5(r['candidate'].encode()).hexdigest()
(H/'baseline.sql.review').write_text('\n'.join(r['definition']+';' for r in a));(H/'functions.sql.review').write_text('\n'.join(r['candidate']+';' for r in a));(H/'delta-sql.diff').write_text(''.join(difflib.unified_diff((H/'baseline.sql.review').read_text().splitlines(True),(H/'functions.sql.review').read_text().splitlines(True),fromfile='LIVE',tofile='candidato')))
def q(v):return 'NULL' if v is None else "'"+str(v).replace("'","''")+"'"
def sig(s):return s if s.startswith(('public.','private.','platform_private.')) else 'public.'+s
checks=[]
for r in deps['dependencies']:
 checks.append(f"IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure({q(sig(r['signature']))}) AND oid={r['oid']} AND md5(pg_get_functiondef(oid))={q(r['md5'])} AND pg_get_userbyid(proowner)={q(r['owner'])} AND proacl::text IS NOT DISTINCT FROM {q(r['acl'])} AND to_jsonb(proconfig) IS NOT DISTINCT FROM {q(json.dumps(r['config']))}::jsonb AND prosecdef={str(r['security_definer']).lower()}) THEN RAISE EXCEPTION 'DEPENDENCY_DRIFT: %',{q(r['signature'])}; END IF;")
for r in deps['tables']:
 t=sig(r['table']);checks.append(f"IF NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=to_regclass({q(t)}) AND c.relacl::text IS NOT DISTINCT FROM {q(r['acl'])} AND c.relrowsecurity={str(r['rls']).lower()} AND c.relforcerowsecurity={str(r['force_rls']).lower()} AND (SELECT md5(coalesce(string_agg(t.tgname||':'||pg_get_triggerdef(t.oid)||':'||md5(pg_get_functiondef(t.tgfoid)),E'\\n' ORDER BY t.tgname),'')) FROM pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal)={q(r['triggers'])} AND (SELECT md5(coalesce(string_agg(row(pol.polname,pol.polcmd,pol.polpermissive,pol.polroles,pg_get_expr(pol.polqual,pol.polrelid),pg_get_expr(pol.polwithcheck,pol.polrelid))::text,E'\\n' ORDER BY pol.polname),'')) FROM pg_policy pol WHERE pol.polrelid=c.oid)={q(r['policies'])}) THEN RAISE EXCEPTION 'TABLE_DRIFT: %',{q(t)}; END IF;")
def guard(post=False):
 lines=["IF (SELECT project_ref FROM public.fiscal_environment_marker LIMIT 1) IS DISTINCT FROM 'swzpzcwiasxmjutrmvkm' THEN RAISE EXCEPTION 'WRONG_PROJECT'; END IF;"]
 for r in a:
  body=r['candidate'] if post else r['definition'];md=r['candidate_md5'] if post else r['md5'];assert hashlib.md5(r['definition'].encode()).hexdigest()==r['md5']
  lines.append(f"IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure({q(sig(r['signature']))}) AND oid={r['oid']} AND md5(pg_get_functiondef(oid))={q(md)} AND pg_get_functiondef(oid)={q(body)} AND proacl::text={q(r['acl'])} AND pg_get_userbyid(proowner)='postgres' AND prosecdef AND to_jsonb(proconfig)={q(json.dumps(r['config']))}::jsonb) THEN RAISE EXCEPTION 'TARGET_DRIFT: %',{q(r['signature'])}; END IF;")
 return 'DO $guard$ BEGIN\n'+'\n'.join(lines+checks)+'\nEND $guard$;\n'
header='-- INATIVO / REVIEW ONLY. Não aplicar pelo agente. Ref swzpzcwiasxmjutrmvkm.\n'
(H/'preflight-readonly.sql').write_text(header+'BEGIN READ ONLY;\n'+guard()+'ROLLBACK;\n');(H/'postflight-readonly.sql').write_text(header+'BEGIN READ ONLY;\n'+guard(True)+'ROLLBACK;\n')
(H/'candidate.sql.review').write_text(header+"BEGIN;\nSET LOCAL lock_timeout='3s';\n"+guard()+(H/'functions.sql.review').read_text()+'\n'+guard(True)+'COMMIT;\n')
# Rollback only exact candidate -> exact LIVE baseline; restores known business 40001 deliberately, not authorization regression.
(H/'rollback-conditioned.sql.review').write_text(header+'-- Reversão sem DML; somente baseline LIVE pinada, contém 40001 negocial conhecido.\n'+"BEGIN;\nSET LOCAL lock_timeout='3s';\n"+guard(True)+(H/'baseline.sql.review').read_text()+'\n'+guard()+'COMMIT;\n')
(H/'manifest.json').write_text(json.dumps({'ref':deps['ref'],'base_commit':'e2b04a8149e49dd9fcf26d4120b0a46a7d6512ef','targets':[{k:v for k,v in r.items() if k not in ('definition','candidate')} for r in a],'inactive':True},indent=2)+'\n')
print([(r['md5'],r['candidate_md5']) for r in a])
