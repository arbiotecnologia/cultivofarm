"""Restore original synthetic r12, pin security, execute exact closed bytes."""
import json
import subprocess
import sys
from pathlib import Path
import db

H = Path(__file__).resolve().parent
ROOT = H.parents[2]
OUT = H / 'evidence'
OUT.mkdir(exist_ok=True)
PG = db.PG
priv = ['setpriv', '--reuid=1000', '--regid=1000', '--clear-groups']
socket = Path('/tmp/felig')
socket.mkdir(exist_ok=True)
subprocess.run(['chown', '1000:1000', str(socket)], check=True)
if not (socket / 'data/PG_VERSION').exists():
    subprocess.run(priv + [str(PG / 'initdb'), '-D', str(socket / 'data'), '-A', 'trust', '--no-locale'], check=True, stdout=subprocess.DEVNULL)
if not (socket / '.s.PGSQL.55901').exists():
    subprocess.run(priv + [str(PG / 'pg_ctl'), '-D', str(socket / 'data'), '-l', str(socket / 'postgres.log'), '-o', '-k /tmp/felig -h "" -p 55901', '-w', 'start'], check=True)
# Synthetic restoration only; historical original dump is not distributed.
globals_sql = Path('/tmp/r12/globals.sql').read_text()
result = db.DB('postgres').raw(globals_sql)
(OUT / 'globals-restore.txt').write_text(result.stderr)
restore = ROOT / 'scripts/c2-pilot-economic-approval-20261111/billing-delivery-20261111/fiscal-final-20261111/prep_restore.sh'
with (OUT / 'restore-output.txt').open('w') as log:
    subprocess.run(['bash', str(restore), str(OUT)], cwd=ROOT, stdout=log, stderr=subprocess.STDOUT, check=True)
d = db.DB()
state = (H / 'security-state.sql').read_text()
(H / 'capture').mkdir(exist_ok=True)
pins = json.loads(d.last(state))
(H / 'capture/security-pins.json').write_text(json.dumps(pins, indent=2) + '\n')
subprocess.run([sys.executable, str(H / 'generate.py')], check=True)
marker = "SET b2b_cancel_final.review_project_ref='swzpzcwiasxmjutrmvkm';"
d.sql(marker + (H / '01-pre.sql.readonly').read_text())
pre = (H / '01-pre.sql.readonly').read_text().replace('BEGIN READ ONLY;', 'BEGIN;').replace('ROLLBACK;', '')
d.sql(marker + pre + (H / 'candidate.sql').read_text() + 'COMMIT;')
signatures = list(json.loads((H.parent / 'capture/post-pins.json').read_text()))
post = {}
for sig in signatures:
    post[sig] = json.loads(d.last(f"SELECT jsonb_build_object('md5',md5(pg_get_functiondef(oid)),'owner',pg_get_userbyid(proowner),'acl',(SELECT coalesce(jsonb_agg(x::text ORDER BY x::text),'[]'::jsonb) FROM unnest(proacl)x),'config',to_jsonb(proconfig)) FROM pg_proc WHERE oid='{sig}'::regprocedure"))
(H / 'capture/post-pins.json').write_text(json.dumps(post, indent=2) + '\n')
subprocess.run([sys.executable, str(H / 'generate.py')], check=True)
# Restore clean AGAIN: no tested partial installation, final installer includes both PRE and POST atomically.
with (OUT / 'restore-exact-output.txt').open('w') as log:
    subprocess.run(['bash', str(restore), str(OUT)], cwd=ROOT, stdout=log, stderr=subprocess.STDOUT, check=True)
for file in ['01-pre.sql.readonly', '02-install-closed.sql.review', '03-post.sql.readonly']:
    result = d.raw(marker + (H / file).read_text())
    (OUT / (file + '.result.json')).write_text(json.dumps({'exit': result.returncode, 'stderr': result.stderr}) + '\n')
    if result.returncode:
        raise RuntimeError(result.stderr)
# Keep exact closed clone for roundtrip; enabling synthetic scope happens only below in c2.
db.DB('postgres').sql('CREATE DATABASE final_closed TEMPLATE c2')
d.sql("GRANT EXECUTE ON FUNCTION public.rpc_b2b_forecast_cancel_residual_v1(uuid,integer,text),public.rpc_b2b_cancel_residual_capability_v1(uuid) TO authenticated;")
d.sql("INSERT INTO saas_features(module_id,key,name) SELECT id,'emissao_nfe_nfse','LOCAL FISCAL FEATURE' FROM saas_modules LIMIT 1; INSERT INTO organization_feature_overrides(organization_id,feature_id,mode,reason,created_by) SELECT '00000000-0000-0000-0000-000000000001',id,'GRANT','LOCAL ONLY INPUT','00000000-0000-0000-0000-000000000024' FROM saas_features WHERE key='emissao_nfe_nfse'")
d.sql('UPDATE platform_private.b2b_cancel_policy_gate_v1 SET enabled=true')
d.sql("INSERT INTO platform_private.b2b_cancel_policy_allowlist_v1(actor_id,organization_id,invoice_id,order_id,valid_until) SELECT '00000000-0000-0000-0000-000000000029',organization_id,id,partner_order_id,now()+interval '4 hours' FROM fiscal_invoices WHERE id='00000000-0000-0000-0000-000000000900'")
print('EXACT_FINAL_PRE_INSTALL_POST_PASS; synthetic scope only in disposable c2')