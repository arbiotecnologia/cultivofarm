"""Gera artefatos INATIVOS a partir de live-functions.json (captura read-only LIVE). Não executa SQL."""
from pathlib import Path
import json,hashlib,difflib
H=Path(__file__).resolve().parent
F={r['signature']:r for r in json.loads((H/'live-functions.json').read_text())}
TG=['platform_update_catalog_label(uuid,timestamp with time zone,text,text,uuid)','platform_set_catalog_label_active(uuid,timestamp with time zone,boolean,text,uuid)']
PIN={TG[0]:'75eaa1d0307e9033a6f3ba8e208ee488',TG[1]:'561d3175812dba477a538992d5d02a01'}
MSGS=['catalog_label_conflict','catalog_label_confirmation_failed']
def cand(d):
  for m in MSGS:
    old=f"ERRCODE = '40001', MESSAGE = '{m}'";assert d.count(old)==1,m;d=d.replace(old,old.replace('40001','PT409'))
  assert "'40001'" not in d;return d
T=[]
for s in TG:
  r=F[s];assert hashlib.md5(r['definition'].encode()).hexdigest()==r['md5']==PIN[s]
  c=cand(r['definition']);T.append({**r,'candidate':c,'candidate_md5':hashlib.md5(c.encode()).hexdigest()})
DEPS=[r for s,r in F.items() if s not in TG]
EXTRA=json.loads((H/'live-extra.json').read_text())
def q(v):return 'NULL' if v is None else "'"+str(v).replace("'","''")+"'"
def fq(s):return s if s.startswith('platform_private.') else 'public.'+s
def fn_check(r,md,label):
  return f"IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure({q(fq(r['signature']))}) AND oid={r['oid']} AND md5(pg_get_functiondef(oid))={q(md)} AND pg_get_userbyid(proowner)={q(r['owner'])} AND proacl::text IS NOT DISTINCT FROM {q(r['acl'] or None)} AND to_jsonb(proconfig) IS NOT DISTINCT FROM {q(json.dumps(r['config']))}::jsonb AND prosecdef={str(r['security_definer']).lower()}) THEN RAISE EXCEPTION '{label}: %',{q(r['signature'])}; END IF;"
def guard(post):
  L=["IF (SELECT project_ref FROM public.fiscal_environment_marker LIMIT 1) IS DISTINCT FROM 'swzpzcwiasxmjutrmvkm' THEN RAISE EXCEPTION 'WRONG_PROJECT'; END IF;"]
  # Guardas compactas: md5 do corpo inteiro (sem repetir corpo) + OID/ACL/owner/config/definer.
  L+=[fn_check(r,r['candidate_md5'] if post else r['md5'],'TARGET_DRIFT') for r in T]
  L+=[fn_check(r,r['md5'],'DEPENDENCY_DRIFT') for r in DEPS+EXTRA['functions']]
  for t in EXTRA['tables']:
    L.append(f"IF NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=to_regclass({q('public.'+t['table'])}) AND c.relacl::text IS NOT DISTINCT FROM {q(t['acl'])} AND c.relrowsecurity={str(t['rls']).lower()} AND c.relforcerowsecurity={str(t['force_rls']).lower()} AND (SELECT md5(coalesce(string_agg(t.tgname||':'||pg_get_triggerdef(t.oid)||':'||md5(pg_get_functiondef(t.tgfoid)),E'\\n' ORDER BY t.tgname),'')) FROM pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal)={q(t['triggers'])} AND (SELECT md5(coalesce(string_agg(row(pol.polname,pol.polcmd,pol.polpermissive,pol.polroles,pg_get_expr(pol.polqual,pol.polrelid),pg_get_expr(pol.polwithcheck,pol.polrelid))::text,E'\\n' ORDER BY pol.polname),'')) FROM pg_policy pol WHERE pol.polrelid=c.oid)={q(t['policies'])}) THEN RAISE EXCEPTION 'TABLE_DRIFT: %',{q(t['table'])}; END IF;")
  return 'DO $guard$ BEGIN\n'+'\n'.join(L)+'\nEND $guard$;\n'
hdr='-- INATIVO / REVIEW ONLY. Não aplicar pelo agente. Ref swzpzcwiasxmjutrmvkm.\n'
base='\n'.join(r['definition'].rstrip('\n')+';' for r in T)+'\n';new='\n'.join(r['candidate'].rstrip('\n')+';' for r in T)+'\n'
(H/'baseline.sql.review').write_text(base);(H/'functions.sql.review').write_text(new)
(H/'delta-sql.diff').write_text(''.join(difflib.unified_diff(base.splitlines(True),new.splitlines(True),'LIVE','candidato')))
(H/'preflight-readonly.sql').write_text(hdr+'BEGIN READ ONLY;\n'+guard(False)+'ROLLBACK;\n')
(H/'postflight-readonly.sql').write_text(hdr+'BEGIN READ ONLY;\n'+guard(True)+'ROLLBACK;\n')
# CREATE OR REPLACE preserva OID/ACL/owner/config; guard pós confirma isso dentro da transação.
(H/'candidate.sql.review').write_text(hdr+"BEGIN;\nSET LOCAL lock_timeout='3s';\n"+guard(False)+new+guard(True)+'COMMIT;\n')
(H/'rollback-conditioned.sql.review').write_text(hdr+'-- Só reverte candidato exato -> baseline LIVE exata; restaura os 40001 negociais conhecidos, sem DML nem mudança de autoridade.\n'+"BEGIN;\nSET LOCAL lock_timeout='3s';\n"+guard(True)+base+guard(False)+'COMMIT;\n')
(H/'manifest.json').write_text(json.dumps({'ref':'swzpzcwiasxmjutrmvkm','inactive':True,'targets':[{k:v for k,v in r.items() if k not in('definition','candidate')} for r in T],'residual_40001':'platform_private.catalog_entity_replay bc194d354de83bb0a362bddd0ceb66e6 catalog_entity_conflict (inalterado)'},indent=2)+'\n')
print([(r['md5'],r['candidate_md5']) for r in T])
