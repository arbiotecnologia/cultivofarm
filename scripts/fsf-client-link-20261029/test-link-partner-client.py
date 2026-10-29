"""Disposable PostgreSQL ONLY — component test of link-partner-client.sql.review. NOT E2E, NOT JWT/RLS.
Auth/h15/roles are SYNTHETIC seams; the partner registration guard is the INSTALLED body copied verbatim
from supabase/migrations/20261008181641 (latest definition) and its trigger; clientes keeps the installed
tenant-document unique index. All ids/CNPJs below are SYNTHETIC (checksum-valid fabricated numbers);
no real AR Bio / FSF identifier or document is used.
"""
import hashlib, json, pathlib, re, subprocess, sys, threading, time
from concurrent.futures import ThreadPoolExecutor
sys.dont_write_bytecode = True
H = pathlib.Path(__file__).resolve().parent; ROOT = H.parents[1]
sys.path.insert(0, str(ROOT / 'scripts/contracts-c2-20261022/integral'))
import pg
assert pg.root.is_relative_to(pathlib.Path('/tmp'))
MIG = ROOT / 'supabase/migrations/20261008181641_e016ad2e-d9b8-47c0-b963-42a1c579ba44.sql'
A, B = 'aaaaaaaa-0000-4000-8000-00000000000a', 'bbbbbbbb-0000-4000-8000-00000000000b'
U, U2, UF, UB = ('11111111-0000-4000-8000-0000000000%02d' % k for k in (1, 2, 3, 4))
checks = []


def check(name, exp, act, mode):
    checks.append(dict(test=name, expected=str(exp), actual=str(act), mode=mode, status='PASS' if exp == act else 'FAIL'))
    print('PASS' if exp == act else 'FAIL', mode, name, '' if exp == act else (exp, act), flush=True)


def q(x): return "'" + str(x).replace("'", "''") + "'"


def cnpj(base12):
    d = [int(c) for c in base12]
    for w in ([5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]):
        r = sum(x * y for x, y in zip(d, w)) % 11; d.append(0 if r < 2 else 11 - r)
    return ''.join(map(str, d))


def P(k): return 'a0000000-0000-4000-8000-0000000002%02d' % k  # SYNTHETIC partner
DOC = {k: cnpj('9900%04d0001' % k) for k in range(1, 20)}       # SYNTHETIC documents


def scope(uid=U, org=A): return f"SELECT set_config('test.uid',{q(uid)},false);SELECT set_config('test.org',{q(org)},false);"
def call(p, key, uid=U, org=A): return scope(uid, org) + f"SET ROLE authenticated; SELECT public.rpc_link_partner_client_candidate({q(p)},{q(key)});"
def ok(s): return json.loads(pg.sql(s).splitlines()[-1])


def state():
    return pg.sql("SELECT jsonb_build_object('c',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.clientes x),'p',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.partner_accounts x),"
                  "'s',(SELECT jsonb_agg(to_jsonb(x) ORDER BY partner_id) FROM public.partner_financial_settings x),'r',(SELECT jsonb_agg(to_jsonb(x) ORDER BY idempotency_key) FROM platform_private.partner_client_link_receipts x))")


def deny(name, s, code, mode):
    before = state(); err = pg.sql(s, ok=False)
    check(name, (True, True), (code in err, state() == before), mode)
    if code not in err: print('   ERR:', err.strip().splitlines()[-1][:300])


def guard_sql():
    t = MIG.read_text()
    i = t.index('CREATE OR REPLACE FUNCTION public.guard_commercial_partner_registration()'); j = t.index('END $function$;', i) + len('END $function$;')
    return t[i:j]


def main(out):
    pg.start()
    g = guard_sql()
    pg.sql("""CREATE SCHEMA auth; CREATE SCHEMA platform_private; CREATE SCHEMA extensions; CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
      CREATE ROLE anon; CREATE ROLE authenticated; GRANT USAGE ON SCHEMA public TO authenticated, anon;
      CREATE TYPE public.app_role AS ENUM ('administrador','gestor_comercial','financeiro','parceiro_b2b');
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('test.uid',true),'')::uuid$$;  -- SYNTHETIC
      CREATE TABLE public.test_user_roles(uid uuid, role public.app_role, org uuid);  -- SYNTHETIC
      CREATE FUNCTION public.h15_actor_organization() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('test.org',true),'')::uuid$$;  -- SYNTHETIC
      CREATE FUNCTION public.has_role(uuid, public.app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$SELECT EXISTS(SELECT 1 FROM public.test_user_roles r WHERE r.uid=$1 AND r.role=$2 AND r.org=public.h15_actor_organization())$$;
      GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated; GRANT USAGE ON SCHEMA auth TO authenticated;
      CREATE TABLE public.profiles(id uuid PRIMARY KEY, ativo boolean, organization_id uuid);
      CREATE TABLE public.clientes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid, tipo_pessoa text, cpf_cnpj text, razao_social text, nome_fantasia text, nome text NOT NULL,
        inscricao_estadual text, inscricao_municipal text, email text, contato_financeiro_email text, telefone text, endereco_cep text, endereco_logradouro text, endereco_numero text,
        endereco_complemento text, endereco_bairro text, endereco_municipio text, endereco_estado text, limite_credito numeric);
      CREATE UNIQUE INDEX IF NOT EXISTS clientes_tenant_document_unique ON public.clientes(organization_id,upper(regexp_replace(cpf_cnpj,'[[:space:]./-]','','g'))) WHERE organization_id IS NOT NULL AND nullif(trim(cpf_cnpj),'') IS NOT NULL;
      CREATE TABLE public.partner_accounts(id uuid PRIMARY KEY, codigo text, created_by uuid, client_id uuid, consultor_responsavel uuid, commercial_owner_organization_id uuid, ativo boolean, deleted_at timestamptz,
        razao_social text, nome_fantasia text, cnpj text, inscricao_estadual text, inscricao_municipal text, email_comercial text, email_financeiro text, telefone_comercial text, cep text,
        endereco_logradouro text, endereco_numero text, endereco_complemento text, endereco_bairro text, commercial_city text, commercial_state text,
        desconto_padrao numeric DEFAULT 0, comissao_percentual numeric, limite_credito_brl numeric, meta_mensal_brl numeric, prazo_pagamento_padrao_dias int DEFAULT 0);
      CREATE TABLE public.partner_financial_settings(partner_id uuid PRIMARY KEY, credit_limit numeric, active boolean);""")
    pg.sql(g + "\nCREATE TRIGGER commercial_partner_registration_guard BEFORE INSERT OR UPDATE ON public.partner_accounts FOR EACH ROW EXECUTE FUNCTION public.guard_commercial_partner_registration();")
    check('installed registration guard copied verbatim from latest migration', True, g in MIG.read_text() and 'cadastro_owner_denied' in g, 'INSTALL')
    pg.sql(f"INSERT INTO public.test_user_roles VALUES('{U}','administrador','{A}'),('{U2}','gestor_comercial','{A}'),('{UF}','financeiro','{A}'),('{UB}','administrador','{B}');")

    def partner(k, owner=A, doc='DEFAULT', ativo=True, client=None, rs=None):
        d = DOC[k] if doc == 'DEFAULT' else doc
        pg.sql("ALTER TABLE public.partner_accounts DISABLE TRIGGER commercial_partner_registration_guard;"  # owner fixture seeding only
               f"INSERT INTO public.partner_accounts(id,codigo,client_id,commercial_owner_organization_id,ativo,razao_social,nome_fantasia,cnpj,inscricao_estadual,email_comercial,email_financeiro,telefone_comercial,cep,endereco_logradouro,endereco_numero,endereco_bairro,commercial_city,commercial_state,limite_credito_brl)"
               f" VALUES('{P(k)}','PARC-{P(k)}',{q(client) if client else 'NULL'},{q(owner) if owner else 'NULL'},{str(ativo).lower()},{q(rs or 'SINTETICO PARCEIRO %d LTDA' % k)},'SINT %d',{q(d) if d else 'NULL'},'ISENTO','c%d@sintetico.invalid','f%d@sintetico.invalid','3800000000%d','38600000','Rua Sintetica','%d','Centro','Paracatu','MG',500000);" % (k, k, k, k, k)
               + "ALTER TABLE public.partner_accounts ENABLE TRIGGER commercial_partner_registration_guard;"
               f"INSERT INTO public.partner_financial_settings VALUES('{P(k)}',NULL,false);")  # finance blocked (deferred decision)

    for k in (1, 2, 4, 7, 9, 10, 11, 12, 13, 14, 15): pass
    partner(1); partner(2); partner(4, doc=None); partner(5, doc='12345678000100'); partner(6, owner=None); partner(7, ativo=False); partner(8, owner=B)
    partner(9, doc=DOC[9]); partner(10, doc=DOC[9]); partner(13); partner(14); partner(15)
    pg.sql(f"INSERT INTO public.clientes(id,organization_id,tipo_pessoa,cpf_cnpj,nome,razao_social) VALUES('c0000000-0000-4000-8000-000000000202','{A}','juridica','{DOC[2][:2]}.{DOC[2][2:5]}.{DOC[2][5:8]}/{DOC[2][8:12]}-{DOC[2][12:]}','CLIENTE SINTETICO 2','CLIENTE SINTETICO 2'),"
           f"('c0000000-0000-4000-8000-000000000203','{A}','juridica','{DOC[3]}','OUTRO DOC','OUTRO DOC'),('c0000000-0000-4000-8000-000000000211','{A}','juridica','{DOC[11]}','LINKED','LINKED');")
    partner(3, client='c0000000-0000-4000-8000-000000000203', doc=DOC[16])
    partner(11); partner(12, client='c0000000-0000-4000-8000-000000000211', doc=DOC[12])
    pg.sql((H / 'link-partner-client.sql.review').read_text())
    check('anon cannot execute', 'f', pg.sql("SELECT has_function_privilege('anon','public.rpc_link_partner_client_candidate(uuid,text)','EXECUTE')"), 'ACL')
    check('authenticated cannot read receipts', 'f', pg.sql("SELECT has_table_privilege('authenticated','platform_private.partner_client_link_receipts','SELECT')"), 'ACL')
    settings0 = pg.sql("SELECT jsonb_agg(to_jsonb(x) ORDER BY partner_id) FROM public.partner_financial_settings x")

    # 1. create + link from partner's own stored data.
    r = ok(call(P(1), 'link-fsf-0001'))
    c = json.loads(pg.sql(f"SELECT to_jsonb(c) FROM public.clientes c WHERE id='{r['client_id']}'"))
    check('creates client from partner data, links partner', (True, False, P(1), r['client_id']), (r['client_created'], r['replayed'], r['partner_id'], pg.sql(f"SELECT client_id FROM public.partner_accounts WHERE id='{P(1)}'")), 'LINK')
    check('field mapping uses stored partner data only', (A, 'juridica', DOC[1], 'SINTETICO PARCEIRO 1 LTDA', 'SINT 1', 'SINT 1', 'ISENTO', 'c1@sintetico.invalid', 'f1@sintetico.invalid', '38000000001', '38600000', 'Paracatu', 'MG', None),
          (c['organization_id'], c['tipo_pessoa'], c['cpf_cnpj'], c['razao_social'], c['nome_fantasia'], c['nome'], c['inscricao_estadual'], c['email'], c['contato_financeiro_email'], c['telefone'], c['endereco_cep'], c['endereco_municipio'], c['endereco_estado'], c['limite_credito']), 'MAPPING')
    before = state()
    r2 = ok(call(P(1), 'link-fsf-0001'))
    check('replay same key: same ids, no write', (r['client_id'], True, True), (r2['client_id'], r2['replayed'], state() == before), 'IDEMPOTENCY')
    r3 = ok(call(P(1), 'link-fsf-0002'))
    check('new key, already linked: same client, no duplicate', (r['client_id'], False, '1'), (r3['client_id'], r3['client_created'], pg.sql(f"SELECT count(*) FROM public.clientes WHERE cpf_cnpj='{DOC[1]}'")), 'IDEMPOTENCY')
    deny('same key different partner', call(P(2), 'link-fsf-0001'), 'IDEMPOTENCY_KEY_REUSED', 'IDEMPOTENCY')
    # 2. reuse existing client (formatted document) instead of duplicating.
    r = ok(call(P(2), 'link-p2-0001', uid=U2))
    check('existing client with same document reused (gestor_comercial)', ('c0000000-0000-4000-8000-000000000202', False), (r['client_id'], r['client_created']), 'REUSE')
    # 3. conflicts / invalid data (state unchanged).
    deny('existing different client_id never overwritten', call(P(3), 'link-p3-0001'), 'PARTNER_CLIENT_CONFLICT', 'CONFLICT')
    deny('partner without CNPJ: nothing invented', call(P(4), 'link-p4-0001'), 'PARTNER_CNPJ_REQUIRED', 'DATA')
    deny('partner with invalid CNPJ', call(P(5), 'link-p5-0001'), 'PARTNER_CNPJ_INVALID', 'DATA')
    deny('owner NULL: no ownership backfill', call(P(6), 'link-p6-0001'), 'PARTNER_OWNER_UNPROVEN', 'OWNER')
    deny('inactive partner', call(P(7), 'link-p7-0001'), 'PARTNER_NOT_AVAILABLE', 'SCOPE')
    deny('partner of other tenant (uniform)', call(P(8), 'link-p8-0001'), 'PARTNER_NOT_AVAILABLE', 'SCOPE')
    deny('nonexistent partner (uniform)', call('a0000000-0000-4000-8000-000000000299', 'link-px-0001'), 'PARTNER_NOT_AVAILABLE', 'SCOPE')
    deny('two active partners with same CNPJ', call(P(9), 'link-p9-0001'), 'PARTNER_CNPJ_AMBIGUOUS', 'UNIQUE_PARTNER')
    deny('client already linked to another active partner', call(P(11), 'link-p11-0001'), 'CLIENT_LINKED_TO_OTHER_PARTNER', 'CONFLICT')
    deny('financeiro role denied', call(P(13), 'link-p13-0001', uid=UF), 'cadastro_context_required', 'AUTH')
    deny('no session denied', call(P(13), 'link-p13-0002', uid=''), 'cadastro_context_required', 'AUTH')
    deny('anon role denied', scope() + f"SET ROLE anon; SELECT public.rpc_link_partner_client_candidate('{P(13)}','link-p13-0003');", 'permission denied', 'AUTH')
    deny('tenant B admin cannot link A partner', call(P(13), 'link-p13-0004', uid=UB, org=B), 'PARTNER_NOT_AVAILABLE', 'TENANT')
    deny('REPEATABLE READ refused', scope() + f"BEGIN ISOLATION LEVEL REPEATABLE READ; SET LOCAL ROLE authenticated; SELECT public.rpc_link_partner_client_candidate('{P(13)}','link-p13-0005'); COMMIT;", 'LINK_ISOLATION_UNSUPPORTED', 'ISOLATION')
    deny('invalid key', call(P(13), 'x'), 'LINK_REQUEST_INVALID', 'DATA')
    # 4. tenant B may register the same document independently; A untouched.
    pg.sql("ALTER TABLE public.partner_accounts DISABLE TRIGGER commercial_partner_registration_guard;"
           f"UPDATE public.partner_accounts SET cnpj='{DOC[1]}' WHERE id='{P(8)}';" "ALTER TABLE public.partner_accounts ENABLE TRIGGER commercial_partner_registration_guard;")
    a_before = pg.sql(f"SELECT jsonb_agg(to_jsonb(c) ORDER BY id) FROM public.clientes c WHERE organization_id='{A}'")
    rb = ok(call(P(8), 'link-b-0001', uid=UB, org=B))
    check('tenant B creates its own client for same document; A unchanged', (True, B, a_before), (rb['client_created'], pg.sql(f"SELECT organization_id FROM public.clientes WHERE id='{rb['client_id']}'"), pg.sql(f"SELECT jsonb_agg(to_jsonb(c) ORDER BY id) FROM public.clientes c WHERE organization_id='{A}'")), 'TENANT')
    # 5. concurrency: different keys/actors, same partner -> one client.
    def go(i):
        return subprocess.run(pg.psql(), input=call(P(13), 'race-%d-0001' % i, uid=(U, U2)[i]).encode(), capture_output=True)
    with ThreadPoolExecutor(2) as ex: rs = list(ex.map(go, range(2)))
    ids = {json.loads(x.stdout.decode().strip().splitlines()[-1])['client_id'] for x in rs if x.returncode == 0}
    check('concurrent different keys: both ACK, one client, one link', (2, 1, '1', 1), (sum(x.returncode == 0 for x in rs), len(ids), pg.sql(f"SELECT count(*) FROM public.clientes WHERE cpf_cnpj='{DOC[13]}'"),
          sum(json.loads(x.stdout.decode().strip().splitlines()[-1])['client_created'] for x in rs if x.returncode == 0)), 'RACE')
    # 6. revocation committed while waiting on the same key -> denied after wait.
    p = subprocess.Popen(pg.psql(), stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    p.stdin.write("SELECT pg_backend_pid(); BEGIN; " + call(P(14), 'hold-key-0001') + " SELECT 'HELD';\n"); p.stdin.flush()
    lines = []
    while True:
        ln = p.stdout.readline()
        if ln.strip() == 'HELD' or not ln: break
        lines.append(ln.strip())
    box = {}
    th = threading.Thread(target=lambda: box.setdefault('r', subprocess.run(pg.psql(), input=("SET application_name='w-rev';" + call(P(14), 'hold-key-0001', uid=U2)).encode(), capture_output=True))); th.start()
    blocked = ''
    for _ in range(100):
        blocked = pg.sql("SELECT coalesce((SELECT pg_blocking_pids(pid)::text FROM pg_stat_activity WHERE application_name='w-rev' AND wait_event_type='Lock'),'')")
        if blocked: break
        time.sleep(0.05)
    check('second actor waits on same key', '{%s}' % lines[0], blocked, 'REVOCATION_WAIT')
    pg.sql(f"DELETE FROM public.test_user_roles WHERE uid='{U2}';")  # committed revocation
    p.stdin.write("COMMIT;\n"); p.stdin.close(); p.wait(10); th.join(15)
    check('revoked during wait: replay denied, result not exposed', (True, ''), ('cadastro_context_required' in box['r'].stderr.decode(), box['r'].stdout.decode().strip().replace('set_config', '').strip()), 'REVOCATION_WAIT')
    # 7. immutability + finance stays blocked.
    deny('receipt UPDATE immutable', "UPDATE platform_private.partner_client_link_receipts SET client_created=false;", 'LINK_RECEIPT_IMMUTABLE', 'IMMUTABLE')
    deny('receipt DELETE immutable', "DELETE FROM platform_private.partner_client_link_receipts;", 'LINK_RECEIPT_IMMUTABLE', 'IMMUTABLE')
    deny('receipt TRUNCATE immutable', "TRUNCATE platform_private.partner_client_link_receipts;", 'LINK_RECEIPT_IMMUTABLE', 'IMMUTABLE')
    check('financial settings untouched by every link (still blocked)', settings0, pg.sql("SELECT jsonb_agg(to_jsonb(x) ORDER BY partner_id) FROM public.partner_financial_settings x"), 'FINANCE_BLOCKED')
    check('partner limite_credito_brl never copied to client', '0', pg.sql("SELECT count(*) FROM public.clientes WHERE limite_credito IS NOT NULL"), 'FINANCE_BLOCKED')
    summary = {}
    for x in checks: summary.setdefault(x['mode'], {}).setdefault(x['status'], 0); summary[x['mode']][x['status']] += 1
    res = dict(level='DISPOSABLE_PG_COMPONENT_NOT_E2E', synthetic=['auth.uid/h15/has_role', 'all ids and CNPJs', 'partner/client rows'],
               candidate_sha256=hashlib.sha256((H / 'link-partner-client.sql.review').read_bytes()).hexdigest(), checks=checks, summary=summary, fail=sum(x['status'] == 'FAIL' for x in checks))
    if out: pathlib.Path(out).write_text(json.dumps(res, indent=1, ensure_ascii=False))
    print(json.dumps(dict(total=len(checks), fail=res['fail'], summary=summary)))
    return res['fail']


if __name__ == '__main__':
    raise SystemExit(1 if main(sys.argv[1] if len(sys.argv) > 1 else None) else 0)
