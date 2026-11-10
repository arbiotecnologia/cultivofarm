#!/usr/bin/env python3
"""Gera 01–04 do leitor V2 a partir de reader.sql + pins versionados (projection-reader-pins.json).
O MD5 do corpo é derivado em PostgreSQL 17 descartável (pg_get_functiondef não depende de objetos referenciados)
e conferido de novo pela cadeia composta real via POST. Nunca conecta a banco hospedado."""
import hashlib, json, os, re, shutil, subprocess, tempfile, sys
HERE = os.path.dirname(os.path.abspath(__file__))
PKG = os.path.join(HERE, '../../b2b-downstream-audit-20261107/b4/fiscal-decision-20261108/service-bridge-current-20261109/forecast-pre-nf-20261109')
REF = 'swzpzcwiasxmjutrmvkm'
SIG = 'public.rpc_b2b_revenue_forecast_tenant_v2(uuid)'
V1 = 'public.rpc_b2b_revenue_forecast_tenant_v1(uuid)'
LEGACY = 'public.rpc_b2b_revenue_forecast(uuid)'
DEPS = ['public.is_financial_staff(uuid)', 'public.h15_actor_organization()', 'public._saas_user_has_feature(uuid,text)',
        'platform_private.b2b_proven_money_row_internal(uuid,uuid)', 'platform_private.b2b_allocation_money_row(uuid)',
        'platform_private.b2b_legacy_money_row(uuid)']
TABLES = ['platform_private.b2b_financial_forecasts', 'platform_private.b2b_document_allocations',
          'platform_private.b2b_allocation_reversals', 'platform_private.b2b_authorized_documents',
          'public.accounts_receivable', 'public.accounts_receivable_installments', 'public.partner_orders', 'public.partner_accounts']
# Expressão ACL normalizada (grantee:priv:grantor:grantoption) copiada byte a byte do estágio 14 instalado.
SRC14 = open(os.path.join(PKG, '14-install-projection-reader.sql.review')).read()
ACL_TMPL = re.search(r"\(\(SELECT coalesce\(string_agg\(.*?WHERE pp\.oid='public\.rpc_receivable_money_projection_v1\(uuid,integer,integer\)'::regprocedure\)\)", SRC14).group(0)
def acl(sig): return ACL_TMPL.replace('public.rpc_receivable_money_projection_v1(uuid,integer,integer)', sig)
def meta_check(sig, m, err):
    return (f" IF to_regprocedure('{sig}') IS NULL OR md5(pg_get_functiondef('{sig}'::regprocedure))<>'{m['md5']}' OR (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid='{sig}'::regprocedure)<>'{m['owner']}' OR {acl(sig)}<>'{m['acl']}' THEN RAISE EXCEPTION '{err}: {sig}'; END IF;")
def guards(pins):
    g = [meta_check(s, pins[s], 'REVENUE_V2_DEP_DRIFT') for s in DEPS]
    g += [f" IF to_regclass('{t}') IS NULL THEN RAISE EXCEPTION 'REVENUE_V2_TABLE_ABSENT: {t}'; END IF;" for t in TABLES]
    g += [f" IF to_regprocedure('{SIG}') IS NOT NULL THEN RAISE EXCEPTION 'REVENUE_V2_TARGET_PREEXISTS'; END IF;",
          f" IF to_regprocedure('{V1}') IS NOT NULL THEN RAISE EXCEPTION 'REVENUE_V2_V1_PRESENT_UNREVIEWED'; END IF;"]
    return g
def build(pins, md5):
    hdr = f"-- REVIEW_ONLY_INACTIVE_NOT_APPROVED. project_ref {REF}. Ordem: B4 composição + estágio 13–15 (pins LOCAL_INTERMEDIATE/LIVE em projection-reader-pins.json) -> 01 -> 02 -> 03; rollback 04.\n"
    pre = hdr + "BEGIN READ ONLY;\nDO $$ BEGIN\n" + "\n".join(guards(pins)) + "\n RAISE NOTICE 'REVENUE_V2_PRE_OK';\nEND $$;\nROLLBACK;\n"
    body = open(os.path.join(HERE, 'reader.sql')).read()
    inst = (hdr + f"-- {LEGACY} intocado (sem regrant).\nBEGIN;\nDO $$ BEGIN\n" + "\n".join(guards(pins)) + "\nEND $$;\n" + body +
            f"\nREVOKE ALL ON FUNCTION {SIG} FROM PUBLIC,anon,authenticated,service_role;\nGRANT EXECUTE ON FUNCTION {SIG} TO authenticated;\n"
            f"DO $$ BEGIN IF md5(pg_get_functiondef('{SIG}'::regprocedure))<>'{md5}' THEN RAISE EXCEPTION 'REVENUE_V2_INSTALL_BODY_DRIFT'; END IF; END $$;\nCOMMIT;\n")
    post = (hdr + "BEGIN READ ONLY;\nDO $$ BEGIN\n" + meta_check(SIG, {'md5': md5, 'owner': 'postgres', 'acl': 'authenticated:EXECUTE:postgres:-,postgres:EXECUTE:postgres:-'}, 'REVENUE_V2_POST_DRIFT') + "\n"
            + "\n".join(meta_check(s, pins[s], 'REVENUE_V2_POST_DEP_DRIFT') for s in DEPS) + "\n"
            f" IF (SELECT NOT prosecdef OR NOT (proconfig @> ARRAY['search_path=\"\"']) FROM pg_proc WHERE oid='{SIG}'::regprocedure) THEN RAISE EXCEPTION 'REVENUE_V2_POST_DEFINER'; END IF;\n"
            " RAISE NOTICE 'REVENUE_V2_POST_OK';\nEND $$;\nROLLBACK;\n")
    rb = (hdr + "-- Deny-only: mantém corpo, revoga EXECUTE de clientes; não restaura legado nem v1.\nBEGIN;\n"
          f"DO $$ BEGIN IF to_regprocedure('{SIG}') IS NULL OR md5(pg_get_functiondef('{SIG}'::regprocedure))<>'{md5}' OR {acl(SIG)}<>'authenticated:EXECUTE:postgres:-,postgres:EXECUTE:postgres:-' THEN RAISE EXCEPTION 'REVENUE_V2_ROLLBACK_TARGET_DRIFT'; END IF; END $$;\n"
          f"REVOKE ALL ON FUNCTION {SIG} FROM PUBLIC,anon,authenticated,service_role;\nCOMMIT;\n")
    return {'01-pre.sql.readonly': pre, '02-install.sql.review': inst, '03-post.sql.readonly': post, '04-rollback-deny.sql.review': rb}
def derive_md5():
    tmp = tempfile.mkdtemp(prefix='rfv2-'); data = tmp + '/d'; port = '55494'
    env = {k: v for k, v in os.environ.items() if not k.startswith('PG')}
    pre = ['setpriv', '--reuid=1000', '--regid=1000', '--init-groups'] if os.geteuid() == 0 else []
    if pre: shutil.chown(tmp, 'lovable')
    sh = lambda c: subprocess.run(pre + ['bash', '-c', c], capture_output=True, text=True, env=env)
    r = sh(f"initdb -D {data} -U postgres -A trust >/dev/null && pg_ctl -D {data} -o '-p {port} -k {tmp} -c listen_addresses=' -l {tmp}/log start -w >/dev/null"); assert r.returncode == 0, r.stderr
    try:
        sql = "CREATE SCHEMA platform_private; CREATE SCHEMA auth;\n" + open(os.path.join(HERE, 'reader.sql')).read() + f"\nSELECT md5(pg_get_functiondef('{SIG}'::regprocedure)), version();"
        r = subprocess.run(['psql', '-h', tmp, '-p', port, '-U', 'postgres', '-d', 'postgres', '-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1'], input=sql, capture_output=True, text=True, env=env)
        assert r.returncode == 0, r.stderr
        md5, ver = r.stdout.strip().splitlines()[-1].split('|', 1); return md5, ver
    finally: sh(f"pg_ctl -D {data} stop -m fast >/dev/null")
if __name__ == '__main__':
    pins = json.load(open(os.path.join(PKG, 'projection-reader-pins.json')))['deps']
    md5, ver = derive_md5()
    files = build(pins, md5)
    for k, v in files.items(): open(os.path.join(HERE, k), 'w').write(v)
    sums = {k: hashlib.sha256(open(os.path.join(HERE, k), 'rb').read()).hexdigest() for k in sorted(files) + ['reader.sql', 'build.py']}
    json.dump({'reader_md5': md5, 'pg': ver, 'pins_source': 'forecast-pre-nf-20261109/projection-reader-pins.json', 'deps': {s: pins[s] for s in DEPS}, 'sha256': sums}, open(os.path.join(HERE, 'build-manifest.json'), 'w'), indent=1)
    open(os.path.join(HERE, 'SHA256SUMS'), 'w').write(''.join(f"{h}  {k}\n" for k, h in sums.items()))
    print(md5, ver[:30]); print(json.dumps(sums, indent=1))
