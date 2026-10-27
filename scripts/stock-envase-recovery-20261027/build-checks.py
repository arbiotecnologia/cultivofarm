"""Generate read-only PRE/POST offline from captured metadata and local PG hashes."""
from pathlib import Path
import json
H=Path(__file__).resolve().parent
c=json.loads((H/'live/catalog.json').read_text())
post={f['name']:f['hash'] for f in json.loads((H/'local-post-hashes.json').read_text())}
for after in [False,True]:
 checks=[]
 for f in c['functions']:
  h=post.get(f['name'],f['hash']) if after else f['hash']
  sig=f['signature'].replace("'","''")
  config=f['config'] or []
  if after and f['name'] in post and f['name'].startswith('public.rpc_'):
   if f['name']=='public.rpc_cockpit_cancelar_reserva_v1':config=['search_path=""','lock_timeout=3s']
   else:config=config+['lock_timeout=3s']
  configs='ARRAY['+','.join("'"+x.replace("'","''")+"'" for x in config)+']::text[]'
  checks.append(f"SELECT '{f['name']}' check_name,coalesce((SELECT oid={f['oid']} AND md5(pg_get_functiondef(oid))='{h}' AND proacl::text IS NOT DISTINCT FROM '{f['acl']}' AND proconfig IS NOT DISTINCT FROM {configs} AND pg_get_userbyid(proowner)='{f['owner']}' AND prosecdef={'true' if f['security'] else 'false'} FROM pg_proc WHERE oid=to_regprocedure('{sig}')),false) ok")
 for t in c['tables']:
  # POST aggregate reflects altered volume/immutability bodies only, other guards pinned above.
  fingerprint=t['fingerprint']
  if after and t['name']=='envase':
   # PostgreSQL check exact unchanged trigger defs/enabled with candidate body hashes.
   terms=[]
   for tr in t['triggers']:
    f=next(x for x in c['functions'] if x['name']==tr['function']);hash_=post.get(f['name'],f['hash'])
    terms.append(f"EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.envase'::regclass AND tgname='{tr['name']}' AND tgenabled='{tr['enabled']}' AND pg_get_triggerdef(oid)='{tr['def'].replace(chr(39),chr(39)*2)}' AND md5(pg_get_functiondef(tgfoid))='{hash_}')")
   trig=' AND '.join(terms)+f" AND (SELECT count(*) FROM pg_trigger WHERE tgrelid=c.oid AND NOT tgisinternal)={len(terms)}"
  else:trig=f"(SELECT md5(coalesce(string_agg(t.tgname||':'||pg_get_triggerdef(t.oid)||':'||md5(pg_get_functiondef(t.tgfoid))||':'||t.tgenabled::text,E'\\n' ORDER BY t.tgname),'')) FROM pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal)='{fingerprint}'"
  checks.append(f"SELECT 'table {t['name']}' check_name,coalesce((SELECT relacl::text='{t['acl']}' AND relrowsecurity={'true' if t['rls'] else 'false'} AND {trig} AND (SELECT md5(coalesce(string_agg(row(pol.polname,pol.polcmd,pol.polpermissive,pol.polroles,pg_get_expr(pol.polqual,pol.polrelid),pg_get_expr(pol.polwithcheck,pol.polrelid))::text,E'\\n' ORDER BY pol.polname),'')) FROM pg_policy pol WHERE pol.polrelid=c.oid)='{t['policy_hash']}' FROM pg_class c WHERE c.oid=to_regclass('public.{t['name']}')),false) ok")
 checks.append("SELECT 'canonical gate singleton' check_name,(SELECT count(*)=1 FROM cf_user_guards_v1.state WHERE singleton) ok")
 (H/('postflight.sql' if after else 'preflight.sql')).write_text('-- READ ONLY; only canonical swzpzcwiasxmjutrmvkm. All results must be true; no release authorization.\nBEGIN TRANSACTION READ ONLY;\n'+'\nUNION ALL\n'.join(checks)+';\nROLLBACK;\n')
print('PRE/POST generated; not executed hosted')