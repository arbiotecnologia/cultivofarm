"""Generate review-only guards. No database connection."""
import json,re
from pathlib import Path
P=Path(__file__).resolve().parent
live=json.loads((P/'live-functions.json').read_text()); tables=json.loads((P/'live-tables-pins.json').read_text());post=json.loads((P/'proposed-pg-metadata.json').read_text())
def sig(x):
 raw=x['signature'];name=raw[:raw.index('(')]
 args=raw[raw.index('(')+1:-1]
 if args:
  args=','.join(re.sub(r'^\w+ ','',a.split(' DEFAULT ')[0].strip()) for a in args.split(','))
 return name+'('+args+')'
q=lambda v:"'"+v.replace("'","''")+"'"
functions=[]
for x in live:
 functions.append((sig(x),str(x['oid']),x['md5'],x['acl'],','.join(x['config'] or []),x['owner']))
values=lambda rows: ',\n'.join(' ('+','.join(q(str(v)) for v in row)+')' for row in rows)
fingerprint="""md5(jsonb_build_object('acl',c.relacl::text,'rls',c.relrowsecurity,'force',c.relforcerowsecurity,
'columns',(SELECT jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attacl::text) ORDER BY a.attnum) FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),
'triggers',(SELECT jsonb_agg(jsonb_build_array(t.tgname,t.tgenabled,pg_get_triggerdef(t.oid),md5(pg_get_functiondef(t.tgfoid))) ORDER BY t.tgname) FROM pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal),
'policies',(SELECT jsonb_agg(jsonb_build_array(pol.polname,pol.polcmd,pol.polpermissive,pol.polroles::text,pg_get_expr(pol.polqual,c.oid),pg_get_expr(pol.polwithcheck,c.oid)) ORDER BY pol.polname) FROM pg_policy pol WHERE pol.polrelid=c.oid),
'indexes',(SELECT jsonb_agg(pg_get_indexdef(i.indexrelid) ORDER BY i.indexrelid::regclass::text) FROM pg_index i WHERE i.indrelid=c.oid))::text)"""
def checks(stage):
 rows=[]
 for sig_,oid,h,acl,cfg,owner in functions:
  target=next((x for x in post if sig_.startswith('public.'+x['name']+'(')),None)
  if target and stage=='post':h=target['hash'];cfg=','.join(target['config'])
  rows.append((sig_,oid,h,acl,cfg,owner))
 return f"""WITH f(sig,oid,h,acl,cfg,owner) AS (VALUES
{values(rows)})
SELECT 'function '||f.sig AS check_name, COALESCE(p.oid::text=f.oid AND md5(pg_get_functiondef(p.oid))=f.h
 AND p.proacl::text IS NOT DISTINCT FROM f.acl AND array_to_string(p.proconfig,',') IS NOT DISTINCT FROM f.cfg
 AND pg_get_userbyid(p.proowner)=f.owner,false) AS ok FROM f LEFT JOIN pg_proc p ON p.oid=to_regprocedure(f.sig)
UNION ALL
SELECT 'table '||v.sig, COALESCE(c.oid::text=v.oid AND {fingerprint}=v.h,false)
FROM (VALUES {values([(t['signature'],t['oid'],t['fingerprint']) for t in tables])}) v(sig,oid,h)
LEFT JOIN pg_class c ON c.oid=to_regclass(v.sig)
UNION ALL SELECT 'gate singleton',count(*)=1 FROM cf_user_guards_v1.state WHERE singleton
UNION ALL SELECT 'operational scopes absent',count(*)=0 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='platform_private' AND p.proname IN ('stock_envase_scope_v1','delivery_recovery_scope_v1')
UNION ALL SELECT 'delivery wrapper stays closed',NOT has_function_privilege('authenticated','public.rpc_entrega_confirmar_v1(uuid,jsonb,jsonb)','EXECUTE')"""
for stage in ['pre','post']:
 sql=checks(stage)
 (P/(stage+'flight.sql')).write_text('-- READ ONLY. Canonical ref must be independently attested: swzpzcwiasxmjutrmvkm.\nBEGIN TRANSACTION READ ONLY;\n'+sql+';\nROLLBACK;\n')
 (P/(stage+'assert.fragment.sql.review')).write_text("DO $a2$ DECLARE failures text; BEGIN SELECT string_agg(check_name,', ') INTO failures FROM ("+sql+") c WHERE ok IS NOT TRUE; IF failures IS NOT NULL THEN RAISE EXCEPTION 'A2_PIN_MISMATCH: %',failures USING ERRCODE='55000'; END IF; END $a2$;\n")
(P/'candidate.sql.review').write_text('-- INACTIVE / NO-GO pending independent review and UI integration. NEVER auto-apply.\n-- Requires explicit external ref proof swzpzcwiasxmjutrmvkm; no self-declared SELECT literal proves it.\nBEGIN;\nSET LOCAL lock_timeout=\'3s\';\nSET LOCAL statement_timeout=\'15s\';\n'+(P/'preassert.fragment.sql.review').read_text()+(P/'proposed-functions.sql.review').read_text()+(P/'postassert.fragment.sql.review').read_text()+'COMMIT;\n')
# Deny-only rollback preserves signature, owner and ACL and never restores unsafe LIVE.
body=''
for x in post:
 d=next(l['definition'] for l in live if l['signature'].startswith('public.'+x['name']+'('))
 head=d[:d.index('AS $function$')]
 head=head.replace("SET search_path TO 'public'", "SET search_path TO 'pg_catalog', 'public', 'pg_temp'\n SET lock_timeout TO '3s'")
 body+=head+"AS $function$ BEGIN RAISE EXCEPTION 'DELIVERY_FINANCE_CONTAINED' USING ERRCODE='42501'; END $function$;\n"
(P/'rollback-containment.sql.review').write_text('-- INACTIVE deny-only rollback; preserves ACL, no GRANT/REVOKE, never restores BOLA.\nBEGIN; SET LOCAL lock_timeout=\'3s\'; SET LOCAL statement_timeout=\'15s\';\n'+(P/'postassert.fragment.sql.review').read_text()+body+'COMMIT;\n')
print('built exact PRE/POST function and table fingerprints; transaction guarded; deny-only rollback')
