"""Offline PRE/POST and transaction-contained delivery-only delta. Never connects."""
import json, re
from pathlib import Path
H = Path(__file__).resolve().parent
live = json.loads((H/'current-functions-20261028.json').read_text())
assert live['ref'] == 'swzpzcwiasxmjutrmvkm'
post = {f['name']: f for f in json.loads((H/'local-post-hashes.json').read_text())}
targets = {'public.rpc_cockpit_criar_entrega_v1', 'public.fn_entrega_confirmar_engine_v1', 'public.rpc_entrega_cancelar_v1'}
quote = lambda v: "'"+v.replace("'", "''")+"'"
config = lambda v: 'ARRAY['+','.join(quote(x) for x in v)+']::text[]'
def expression(f, after=False, oid=True):
    p = post.get(f['name']) if after else None
    return "coalesce((SELECT "+(f"oid={f['oid']} AND " if oid else '')+f"md5(pg_get_functiondef(oid))={quote(p['hash'] if p else f['hash'])} AND proacl::text IS NOT DISTINCT FROM {quote(f['acl'])} AND proconfig IS NOT DISTINCT FROM {config(p['config'] if p else f['config'])} AND pg_get_userbyid(proowner)={quote(f['owner'])} AND prosecdef={'true' if f['definer'] else 'false'} FROM pg_proc WHERE oid=to_regprocedure({quote('public.'+f['signature'])})),false)"
for after in [False, True]:
    checks = [f"SELECT {quote(f['name'])} check_name,{expression(f, after)} ok" for f in live['functions']]
    for f in json.loads((H.parent/'stock-envase-recovery-20261027/live/current-20261028.json').read_text())['functions']:
        # These are immutable LIVE pins here, not assertions that stock recovery is installed.
        checks.append(f"SELECT {quote(f['name'])} check_name,{expression(f)} ok".replace("'public.platform_private.", "'platform_private."))
    for t in json.loads((H/'current-tables-20261028.json').read_text())['tables']:
        checks.append(f"SELECT {quote('table '+t['name'])} check_name,coalesce((SELECT oid={t['oid']} AND relacl::text={quote(t['acl'])} AND relrowsecurity={'true' if t['rls'] else 'false'} AND relforcerowsecurity={'true' if t['force_rls'] else 'false'} AND (SELECT md5(coalesce(string_agg(t.tgname||':'||pg_get_triggerdef(t.oid)||':'||md5(pg_get_functiondef(t.tgfoid))||':'||t.tgenabled::text,E'\\n' ORDER BY t.tgname),'')) FROM pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal)={quote(t['fingerprint'])} AND (SELECT md5(coalesce(string_agg(row(pol.polname,pol.polcmd,pol.polpermissive,pol.polroles,pg_get_expr(pol.polqual,pol.polrelid),pg_get_expr(pol.polwithcheck,pol.polrelid))::text,E'\\n' ORDER BY pol.polname),'')) FROM pg_policy pol WHERE pol.polrelid=c.oid)={quote(t['policy_hash'])} FROM pg_class c WHERE oid=to_regclass({quote('public.'+t['name'])})),false) ok")
    (H/('current-postflight.sql' if after else 'current-preflight.sql')).write_text('-- READ ONLY; capture-specific delivery-only metadata pins. NOT release.\nBEGIN TRANSACTION READ ONLY;\n'+'\nUNION ALL\n'.join(checks)+';\nROLLBACK;\n')
body = (H/'composed-delivery.sql.review').read_text()
functions = re.findall(r'CREATE OR REPLACE FUNCTION public\..*?\$function\$;', body, re.S)
assert len(functions) == 3
pins = [f for f in live['functions'] if f['name'] in targets]
assert len(pins) == 3
def guard(after):
    return "DO $pins$ BEGIN IF NOT ("+' AND '.join(expression(f,after) for f in pins)+") THEN RAISE EXCEPTION 'DELIVERY_DELTA_METADATA_DRIFT' USING ERRCODE='42501'; END IF; END $pins$;"
# Independent delivery hardening delta; no billing replay, stock replacement, helper creation or grants.
# Dependency hashes intentionally fail closed until the reviewed recovery bodies exist.
deps = [f for f in json.loads((H.parent/'stock-envase-recovery-20261027/local-post-hashes.json').read_text()) if f['name'] in {'public.rpc_estoque_operar_v1','public.rpc_cockpit_cancelar_reserva_v1'}]
depguard = "DO $deps$ BEGIN IF NOT ("+' AND '.join(f"coalesce((SELECT md5(pg_get_functiondef(oid))={quote(f['hash'])} FROM pg_proc WHERE oid=to_regprocedure({quote('public.rpc_estoque_operar_v1(text,uuid,numeric,text,jsonb)' if f['name'].endswith('operar_v1') else 'public.rpc_cockpit_cancelar_reserva_v1(uuid,uuid,text,text)')})),false)" for f in deps)+f" AND coalesce((SELECT md5(pg_get_functiondef(oid))={quote(post['platform_private.delivery_recovery_scope_v1']['hash'])} FROM pg_proc WHERE oid=to_regprocedure('platform_private.delivery_recovery_scope_v1(uuid,text,uuid,text)')),false)) THEN RAISE EXCEPTION 'DELIVERY_DELTA_DEPENDENCIES_NOT_INSTALLED' USING ERRCODE='42501'; END IF; END $deps$;"
(H/'delivery-only-delta.sql.review').write_text('-- INACTIVE. Hardening only; dependencies and release remain blocked.\nBEGIN;\nSET LOCAL lock_timeout=\'3s\';\nSET LOCAL statement_timeout=\'15s\';\n'+guard(False)+'\n'+depguard+'\n'+'\n'.join(functions)+'\n'+guard(True)+'\nCOMMIT;\n')
print('Current PRE/POST + pinned delivery-only delta generated; no hosted execution')