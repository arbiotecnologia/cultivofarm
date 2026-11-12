"""Disposable component mirror, not the missing historical full r12 dump. No network."""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
OUT = HERE / 'evidence'
TMP = Path(tempfile.mkdtemp(prefix='fiscal-save-'))
os.chmod(TMP, 0o777)
PRIV = ['setpriv', '--reuid=1000', '--regid=1000', '--clear-groups'] if os.getuid() == 0 else []
def run(args, **kwargs):
    return subprocess.run(args, text=True, capture_output=True, **kwargs)
def pg(sql, ok=True):
    result = run(['psql', '-X', '-h', str(TMP), '-p', '55931', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At'], input=sql)
    if ok and result.returncode:
        raise AssertionError(result.stderr)
    return result
checks = []
def check(name, yes):
    checks.append({'name': name, 'pass': bool(yes)})
    assert yes, name
foundation = ROOT / 'supabase/migrations/20260721000000_fiscal_fase2_fundacao.sql'
central = ROOT / 'supabase/migrations/20260723000000_fiscal_fase3_15_central_config.sql'
h15 = ROOT / 'supabase/migrations/20260919015635_h15_fiscal_company_isolation.sql'
f3 = ROOT / 'supabase/migrations/20260816000000_fase_f3_prontidao_calculo_nfe.sql'
f3text = f3.read_text()
f3columns = f3text[f3text.index('ALTER TABLE public.company_fiscal_settings'):f3text.index('DO $$ BEGIN', f3text.index('ALTER TABLE public.company_fiscal_settings'))]
scanner = re.search(r'CREATE OR REPLACE FUNCTION public.fiscal_json_has_sensitive_key\(.*?\$\$;', central.read_text(), re.S).group(0)
f3checks = []
for name in ['cfs_pis_cofins_regime_domain', 'cfs_uf_accreditations_shape']:
    f3checks.append(re.search(r'ALTER TABLE public.company_fiscal_settings\s+ADD CONSTRAINT '+name+r'.*?;', f3text, re.S).group(0))
src = foundation.read_text()
table = re.search(r'CREATE TABLE IF NOT EXISTS public.company_fiscal_settings \(.*?\n\);', src, re.S).group(0)
additive = central.read_text().split('-- 4. Helper:')[0].split('-- 1. NOVAS COLUNAS')[1]
identity = h15.read_text()
actor = identity[identity.index('CREATE OR REPLACE FUNCTION public.h15_actor_organization()'):identity.index('CREATE OR REPLACE FUNCTION public.h15_company_access')]
integrity = identity[identity.index('CREATE OR REPLACE FUNCTION public.h15_company_integrity()'):identity.index('-- Cross-links')]
# Exact H15 policy expressions, re-create only because baseline fixture has no predecessor policies.
policy_lines = [line for line in identity.splitlines() if line.startswith('ALTER POLICY "company_fiscal_settings_')]
policies = []
for line in policy_lines:
    name = re.search(r'"([^"]+)"', line).group(1)
    command = name.rsplit('_', 1)[1].upper()
    if command == 'READ':
        command = 'SELECT'
    tail = line.split(' ON public.company_fiscal_settings ', 1)[1]
    policies.append(f'CREATE POLICY "{name}" ON public.company_fiscal_settings FOR {command} TO authenticated {tail}')
A = '11111111-1111-4111-8111-111111111111'
B = '22222222-2222-4222-8222-222222222222'
U = '33333333-3333-4333-8333-333333333333'
ID = '44444444-4444-4444-8444-444444444444'
try:
    result = run(PRIV + ['initdb', '-D', str(TMP / 'data'), '-U', 'postgres', '-A', 'trust', '--no-locale'])
    assert result.returncode == 0, result.stderr
    result = run(PRIV + ['pg_ctl', '-D', str(TMP / 'data'), '-l', str(TMP / 'server.log'), '-o', f'-k {TMP} -h "" -p 55931', '-w', 'start'])
    assert result.returncode == 0, result.stderr
    # Synthetic identity seam: no auth users/exported rows/secrets. The canonical guard reads these local-only records.
    pg("""CREATE ROLE authenticated; CREATE ROLE anon; CREATE SCHEMA auth;
CREATE TYPE public.app_role AS ENUM ('administrador','gestor','financeiro','consultor_tecnico');
CREATE TABLE public.organizations(id uuid PRIMARY KEY,ativo boolean);
GRANT SELECT ON public.organizations TO authenticated;
CREATE TABLE public.profiles(user_id uuid PRIMARY KEY,organization_id uuid,ativo boolean);
GRANT SELECT ON public.profiles TO authenticated;
CREATE TABLE public.user_roles(user_id uuid,role public.app_role);
GRANT SELECT ON public.user_roles TO authenticated;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE FUNCTION public.has_role(uuid,public.app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$ SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=$1 AND role=$2) $$;
REVOKE ALL ON FUNCTION public.has_role(uuid,public.app_role) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid,public.app_role) TO authenticated;
GRANT USAGE ON SCHEMA auth TO authenticated;
""" + table + "\nGRANT SELECT,INSERT,UPDATE ON public.company_fiscal_settings TO authenticated;\n" + additive + """
ALTER TABLE public.company_fiscal_settings ADD COLUMN organization_id uuid NOT NULL;
ALTER TABLE public.company_fiscal_settings ENABLE ROW LEVEL SECURITY;
""" + scanner + f3columns + '\n'.join(f3checks) + actor + "\nREVOKE ALL ON FUNCTION public.h15_actor_organization() FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.h15_actor_organization() TO authenticated;\n" + integrity + '\n'.join(policies))
    pg(f"INSERT INTO organizations VALUES('{A}',true),('{B}',true); INSERT INTO profiles VALUES('{U}','{A}',true); INSERT INTO user_roles VALUES('{U}','administrador');")
    # INSERT fixture through canonical H15 guard; only accounting baseline is synthetic test setup, never a save approval.
    session = f"BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub='{U}';"
    pg(session + f"INSERT INTO company_fiscal_settings(id,organization_id,legal_name,configuration_version) VALUES('{ID}','{A}','AR Bio FICTICIA',7); COMMIT;")
    before = pg("SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='company_fiscal_settings_configuration_status_check'").stdout.strip()
    check('canonical CHECK contains exactly four states', all(s in before for s in ['DRAFT','PENDING_ACCOUNTING','VALIDATED','BLOCKED']) and 'READY_FOR_HOMOLOGATION' not in before)
    for status in ['DRAFT','PENDING_ACCOUNTING','VALIDATED','BLOCKED']:
        pg(session + f"UPDATE company_fiscal_settings SET configuration_status='{status}',configuration_version=7,accounting_validated_at={'now()' if status == 'VALIDATED' else 'NULL'} WHERE id='{ID}';COMMIT;")
        old = pg(session + f"UPDATE company_fiscal_settings SET configuration_status='READY_FOR_HOMOLOGATION' WHERE id='{ID}'; COMMIT;", False)
        check(f'{status}: original invalid status reproduces constraint failure', old.returncode != 0 and 'company_fiscal_settings_configuration_status_check' in old.stderr)
        payload = json.loads((OUT / 'payloads' / f'{status}.json').read_text())
        check(f'{status}: exact SDK payload omits accounting fields', 'configuration_status' not in payload and 'accounting_validated_at' not in payload)
        quoted = json.dumps(payload, ensure_ascii=False).replace("'", "''")
        keys = list(payload)
        assert all(re.fullmatch('[a-z_]+', k) for k in keys)
        assignment = ','.join(f'"{k}"=p."{k}"' for k in keys)
        sql = f"UPDATE public.company_fiscal_settings c SET {assignment} FROM jsonb_populate_record(NULL::public.company_fiscal_settings,'{quoted}'::jsonb) p WHERE c.id='{ID}' AND c.organization_id='{A}' AND c.configuration_version=7 RETURNING jsonb_build_object('status',c.configuration_status,'version',c.configuration_version,'name',c.legal_name,'accounting',c.accounting_validated_at IS NOT NULL,'nfe',c.nfe_enabled,'nfse',c.nfse_enabled,'production',c.production_enabled);"
        result = pg(session + sql + 'COMMIT;')
        saved = json.loads(next(line for line in result.stdout.splitlines() if line.startswith('{')))
        check(f'{status}: real UPDATE returns saved fields and unchanged accounting state', saved == {'status': status,'version':8,'name':'AR Bio FICTÍCIA revisada','accounting':status == 'VALIDATED','nfe':False,'nfse':False,'production':False})
        reopened = pg(session + f"SELECT legal_name||':'||configuration_status FROM company_fiscal_settings WHERE id='{ID}'; COMMIT;").stdout
        check(f'{status}: reopen reads persisted fields/state', f'AR Bio FICTÍCIA revisada:{status}' in reopened)
        stale = pg(session + sql + 'COMMIT;').stdout
        check(f'{status}: stale CAS returns zero rows', '{' not in stale)
    pg(f"UPDATE profiles SET organization_id='{B}' WHERE user_id='{U}';")
    check('foreign tenant sees zero rows', pg(session + 'SELECT count(*) FROM company_fiscal_settings;COMMIT;').stdout.splitlines()[-2] == '0')
    denied = pg(session + f"UPDATE company_fiscal_settings SET legal_name='forged' WHERE id='{ID}' RETURNING id; COMMIT;").stdout
    check('foreign tenant changes zero rows', ID not in denied)
    pg(f"UPDATE profiles SET organization_id='{A}' WHERE user_id='{U}'; UPDATE user_roles SET role='financeiro' WHERE user_id='{U}';")
    check('Financeiro reads existing row', '1' in pg(session + 'SELECT count(*) FROM company_fiscal_settings;COMMIT;').stdout.splitlines())
    check('Financeiro cannot update', ID not in pg(session + f"UPDATE company_fiscal_settings SET legal_name='forged' WHERE id='{ID}' RETURNING id;COMMIT;").stdout)
    after = pg("SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='company_fiscal_settings_configuration_status_check'").stdout.strip()
    check('CHECK unchanged after entire flow', before == after)
    if os.environ.get('TEST_ACCREDITATIONS') == '1':
        pg(f"UPDATE user_roles SET role='administrador' WHERE user_id='{U}';")
        pg(session + f"UPDATE company_fiscal_settings SET configuration_version=7,configuration_status='PENDING_ACCOUNTING',accounting_validated_at=NULL,tax_regime='LUCRO_PRESUMIDO',crt='3',pis_cofins_regime=NULL,uf_accreditations='[{{\"uf\":\"SP\",\"accredited\":true,\"note\":\"preservar\"}},{{\"uf\":\"MG\",\"accredited\":false,\"evidence_ref\":\"original\"}}]' WHERE id='{ID}';COMMIT;")
        payload = json.loads((OUT/'accreditations/payload.json').read_text())
        quoted = json.dumps(payload, ensure_ascii=False).replace("'", "''")
        assignment = ','.join(f'"{k}"=p."{k}"' for k in payload)
        sql = f"UPDATE company_fiscal_settings c SET {assignment} FROM jsonb_populate_record(NULL::company_fiscal_settings,'{quoted}'::jsonb) p WHERE c.id='{ID}' AND c.organization_id='{A}' AND c.configuration_version=7 RETURNING c.id;"
        check('declaration only exact SDK PATCH commits', ID in pg(session+sql+'COMMIT;').stdout)
        result = pg(session+f"SELECT jsonb_build_object('records',uf_accreditations,'regime',pis_cofins_regime,'status',configuration_status,'accounting',accounting_validated_at,'crt',crt,'tax',tax_regime) FROM company_fiscal_settings WHERE id='{ID}';COMMIT;").stdout
        reopened = json.loads(next(line for line in result.splitlines() if line.startswith('{')))
        check('MG merge/SP/metadata reopen intact', reopened['records'] == payload['uf_accreditations'])
        check('null/regime/status/accounting preserved', reopened['regime'] is None and reopened['status']=='PENDING_ACCOUNTING' and reopened['accounting'] is None and reopened['crt']=='3' and reopened['tax']=='LUCRO_PRESUMIDO')
        check('stale accreditation patch cannot replace concurrent JSON', ID not in pg(session+sql+'COMMIT;').stdout)
        invalid = pg(session+f"UPDATE company_fiscal_settings SET pis_cofins_regime='LUCRO_PRESUMIDO' WHERE id='{ID}';COMMIT;",False)
        check('canonical PIS domain rejects invented inference', 'cfs_pis_cofins_regime_domain' in invalid.stderr)
        invalid = pg(session+f"UPDATE company_fiscal_settings SET uf_accreditations='{{}}' WHERE id='{ID}';COMMIT;",False)
        check('canonical accreditation shape rejects object', 'cfs_uf_accreditations_shape' in invalid.stderr)
        pg(f"UPDATE profiles SET organization_id='{B}' WHERE user_id='{U}';")
        check('foreign tenant cannot overwrite declarations', ID not in pg(session+f"UPDATE company_fiscal_settings SET uf_accreditations='[]' WHERE id='{ID}' RETURNING id;COMMIT;").stdout)
        OUT = OUT / 'accreditations'
    if os.environ.get('TEST_PIS_EFFECTIVE') == '1':
        mig = HERE / 'pis-cofins-effective' / '20261112150000_pis_cofins_effective_from_history.sql'
        pg(f"UPDATE profiles SET organization_id='{A}' WHERE user_id='{U}'; UPDATE user_roles SET role='administrador' WHERE user_id='{U}'; UPDATE company_fiscal_settings SET pis_cofins_regime=NULL WHERE id='{ID}';")
        pg(mig.read_text()); pg(mig.read_text())  # idempotente
        check('legacy row keeps NULL date, no backfill/history', pg(f"SELECT coalesce(pis_cofins_regime_effective_from::text,'NULL')||':'||(SELECT count(*) FROM company_fiscal_pis_cofins_history) FROM company_fiscal_settings WHERE id='{ID}'").stdout.strip() == 'NULL:0')
        v = int(pg(f"SELECT configuration_version FROM company_fiscal_settings WHERE id='{ID}'").stdout.strip())
        upd = lambda ver, reg, d: pg(session+f"UPDATE company_fiscal_settings SET pis_cofins_regime={reg},pis_cofins_regime_effective_from={d},configuration_version={ver+1} WHERE id='{ID}' AND organization_id='{A}' AND configuration_version={ver} RETURNING id;COMMIT;").stdout
        check('CAS save with regime+date commits', ID in upd(v, "'CUMULATIVO'", "'2026-01-01'"))
        check('stale CAS writes nothing', ID not in upd(v, "'MISTO'", "'2026-02-01'"))
        check('equal save does not duplicate history', ID in upd(v+1, "'CUMULATIVO'", "'2026-01-01'"))
        h = pg(session+"SELECT count(*)||'|'||string_agg(coalesce(old_regime,'-')||'>'||new_regime||'|'||coalesce(old_effective_from::text,'-')||'>'||new_effective_from||'|'||(changed_by::text)||'|'||configuration_version,',') FROM company_fiscal_pis_cofins_history;COMMIT;").stdout
        check('one history row with old/new/author/version', f"1|->CUMULATIVO|->2026-01-01|{U}|{v+1}" in h)
        check('date-only change recorded', ID in upd(v+2, "'CUMULATIVO'", "'2026-03-01'") and '2' in pg("SELECT count(*) FROM company_fiscal_pis_cofins_history").stdout)
        rb = pg(session+"SELECT 1; ROLLBACK;")
        pg(session+f"UPDATE company_fiscal_settings SET pis_cofins_regime='MISTO',configuration_version={v+4} WHERE id='{ID}'; ROLLBACK;")
        check('rollback of save leaves no history (transactional)', pg("SELECT count(*) FROM company_fiscal_pis_cofins_history").stdout.strip() == '2')
        bad = pg(session+f"UPDATE company_fiscal_settings SET pis_cofins_regime_effective_from='1900-01-01' WHERE id='{ID}';COMMIT;", False)
        check('date range constraint rejects', 'cfs_pis_cofins_effective_from_range' in bad.stderr)
        for stmt in ["INSERT INTO company_fiscal_pis_cofins_history(company_settings_id,organization_id) VALUES('%s','%s')" % (ID, A), "UPDATE company_fiscal_pis_cofins_history SET new_regime='X'", "DELETE FROM company_fiscal_pis_cofins_history"]:
            check('client direct write denied: '+stmt.split()[0], pg(session+stmt+';COMMIT;', False).returncode != 0)
        check('owner UPDATE/DELETE blocked by immutability trigger', 'PIS_COFINS_HISTORY_IMMUTABLE' in pg("DELETE FROM company_fiscal_pis_cofins_history", False).stderr and 'PIS_COFINS_HISTORY_IMMUTABLE' in pg("TRUNCATE company_fiscal_pis_cofins_history", False).stderr)
        pg(f"UPDATE user_roles SET role='financeiro' WHERE user_id='{U}';")
        check('Financeiro reads own-tenant history', pg(session+"SELECT count(*) FROM company_fiscal_pis_cofins_history;COMMIT;").stdout.splitlines()[-2] == '2')
        pg(f"UPDATE profiles SET organization_id='{B}' WHERE user_id='{U}';")
        check('foreign tenant reads zero history', pg(session+"SELECT count(*) FROM company_fiscal_pis_cofins_history;COMMIT;").stdout.splitlines()[-2] == '0')
        OUT = HERE / 'pis-cofins-effective' / 'evidence'; OUT.mkdir(exist_ok=True)
    (OUT / 'pg.json').write_text(json.dumps({'scope':'disposable canonical component mirror, not full r12/JWT/PostgREST','checks':checks,'constraint':before,'sources':{str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in [foundation,central,h15,f3]}}, ensure_ascii=False, indent=2)+'\n')
    print(f'{len(checks)} PostgreSQL checks PASS (component mirror)')
finally:
    run(PRIV + ['pg_ctl','-D',str(TMP/'data'),'-m','immediate','-w','stop'])