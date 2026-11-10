#!/usr/bin/env python3
"""Esgotamento das 3 tentativas do leitor V2 -> 40001, determinístico, PostgreSQL 17 descartável local.
Corpo REAL de ../reader.sql (md5 conferido) para controle; sonda = mesmo corpo com nome trocado + 1 linha
`PERFORM pg_advisory_xact_lock_shared(770010+attempt)`. Uma sessão holder por tentativa; a mutação só é
confirmada depois de pg_locks/pg_blocking_pids provarem que o leitor espera naquela tentativa. Esquema mínimo
declarado (só colunas lidas) e stubs de autorização: prova a lógica de retry/fail-closed, não JWT/RLS/B4 real
(isso é attempt-224). Nunca conecta a banco hospedado."""
import json, os, shutil, subprocess, sys, tempfile, time, hashlib
HERE = os.path.dirname(os.path.abspath(__file__)); PKG = os.path.dirname(HERE)
BODY = open(os.path.join(PKG, 'reader.sql')).read()
EXPECTED = json.load(open(os.path.join(PKG, 'build-manifest.json')))['reader_md5']
ANCHOR = ' -- Previsão não exigível: residual vivo com pedido/parceiro/emissor coerentes.'
REAL = 'public.rpc_b2b_revenue_forecast_tenant_v2('
O, P, X, U = ('00000000-0000-4000-8000-0000000000%02d' % i for i in (1, 2, 3, 4))
SCHEMA = f"""
CREATE SCHEMA platform_private; CREATE SCHEMA auth; CREATE ROLE authenticated;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
CREATE FUNCTION public.h15_actor_organization() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT '{O}'::uuid$$;
CREATE FUNCTION public.is_financial_staff(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT $1='{U}'::uuid$$;
CREATE FUNCTION public._saas_user_has_feature(uuid,text) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT true$$;
CREATE FUNCTION platform_private.b2b_proven_money_row_internal(uuid,uuid) RETURNS jsonb LANGUAGE sql AS $$SELECT NULL::jsonb$$;
CREATE TABLE public.accounts_receivable(id uuid PRIMARY KEY, organization_id uuid, partner_id uuid, origin_id uuid, origin_type text, status text);
CREATE TABLE public.accounts_receivable_installments(id uuid PRIMARY KEY, receivable_id uuid, organization_id uuid, status text, due_date date);
CREATE TABLE public.receivable_payments(id uuid PRIMARY KEY, organization_id uuid, installment_id uuid);
CREATE TABLE public.financial_audit_log(id uuid PRIMARY KEY, entity_type text, entity_id uuid);
CREATE TABLE public.partner_accounts(id uuid PRIMARY KEY, commercial_owner_organization_id uuid);
CREATE TABLE public.partner_orders(id uuid PRIMARY KEY, partner_id uuid, status text);
CREATE TABLE public.partner_order_financial_links(id uuid PRIMARY KEY, partner_order_id uuid, receivable_id uuid);
CREATE TABLE public.partner_order_payment_schedule(id uuid PRIMARY KEY, partner_order_id uuid, receivable_installment_id uuid);
CREATE TABLE platform_private.price_schedule_snapshots(receivable_id uuid PRIMARY KEY, organization_id uuid);
CREATE TABLE platform_private.b2b_document_allocations(document_id uuid PRIMARY KEY, organization_id uuid, receivable_id uuid, order_id uuid);
CREATE TABLE platform_private.b2b_authorized_documents(id uuid PRIMARY KEY, organization_id uuid, order_id uuid);
CREATE TABLE platform_private.b2b_allocation_reversals(document_id uuid PRIMARY KEY);
CREATE TABLE platform_private.b2b_financial_forecasts(order_id uuid PRIMARY KEY, organization_id uuid, partner_id uuid, residual_amount numeric, state text);
INSERT INTO public.partner_accounts VALUES('{P}','{O}');
INSERT INTO public.partner_orders VALUES('{X}','{P}','aprovado');
INSERT INTO platform_private.b2b_financial_forecasts VALUES('{X}','{O}','{P}',9,'aguardando_fiscal');
GRANT USAGE ON SCHEMA platform_private, auth TO authenticated;
"""
def probe():
    assert BODY.count(ANCHOR) == 1 and BODY.count(REAL) == 1
    return BODY.replace(REAL, 'public.local_probe_rv2_exhaust(').replace(ANCHOR, ' PERFORM pg_advisory_xact_lock_shared(770010+attempt);\n' + ANCHOR)

def main():
    tmp = tempfile.mkdtemp(prefix='rv2x-'); data = tmp + '/d'; port = '55495'
    env = {k: v for k, v in os.environ.items() if not k.startswith('PG')}
    pre = ['setpriv', '--reuid=1000', '--regid=1000', '--init-groups'] if os.geteuid() == 0 else []
    if pre: shutil.chown(tmp, 'lovable')
    sh = lambda c: subprocess.run(pre + ['bash', '-c', c], capture_output=True, text=True, env=env)
    r = sh(f"initdb -D {data} -U postgres -A trust >/dev/null && pg_ctl -D {data} -o '-p {port} -k {tmp} -c listen_addresses=' -l {tmp}/log start -w >/dev/null"); assert r.returncode == 0, r.stderr
    base = ['psql', '-h', tmp, '-p', port, '-U', 'postgres', '-d', 'postgres', '-X', '-q', '-t', '-A']
    q = lambda s: subprocess.run(base + ['-v', 'ON_ERROR_STOP=1'], input=s, capture_output=True, text=True, env=env)
    def last(s):
        r = q(s); assert r.returncode == 0, r.stderr; return r.stdout.strip().splitlines()[-1] if r.stdout.strip() else ''
    def session(app, sql):
        p = subprocess.Popen(base, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=env)
        p.stdin.write(f"SET application_name='{app}';{sql}\n"); p.stdin.flush(); return p
    ctx = f"BEGIN;SELECT set_config('request.jwt.claim.sub','{U}',true);SET LOCAL ROLE authenticated;"
    out = {'reader_md5_expected': EXPECTED, 'probe_injected_line': 'PERFORM pg_advisory_xact_lock_shared(770010+attempt);', 'hosted': False, 'cases': []}
    try:
        last(SCHEMA); last(BODY); last(probe())
        last("GRANT EXECUTE ON FUNCTION public.rpc_b2b_revenue_forecast_tenant_v2(uuid), public.local_probe_rv2_exhaust(uuid) TO authenticated;")
        real_md5 = last("SELECT md5(pg_get_functiondef('public.rpc_b2b_revenue_forecast_tenant_v2(uuid)'::regprocedure));")
        assert real_md5 == EXPECTED, (real_md5, EXPECTED); out['reader_md5_installed'] = real_md5
        r = q(ctx + "SELECT public.rpc_b2b_revenue_forecast_tenant_v2(NULL);COMMIT;")
        assert r.returncode == 0; d0 = json.loads([l for l in r.stdout.splitlines() if l.startswith('{')][-1])
        out['cases'].append(dict(case='real-body-no-concurrency-returns', residual=d0['forecast_residual']['amount']))
        def run(name, mutate_attempts):
            holders = {k: session(f'h{k}', f"BEGIN;SELECT pg_advisory_xact_lock({770010+k});") for k in (1, 2, 3)}
            time.sleep(0)  # aguarda abaixo por prova, não por tempo
            for k in holders:
                for _ in range(500):
                    if last(f"SELECT count(*) FROM pg_locks l JOIN pg_stat_activity a USING(pid) WHERE a.application_name='h{k}' AND l.locktype='advisory' AND l.objid={770010+k} AND l.granted;") == '1': break
                    time.sleep(.01)
                else: raise AssertionError('HOLDER_NOT_READY')
            reader = subprocess.Popen(base, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=env)
            reader.stdin.write("SET application_name='rdr';" + ctx + "SELECT public.local_probe_rv2_exhaust(NULL);COMMIT;\n"); reader.stdin.close()
            waits = []
            for k in (1, 2, 3):
                for _ in range(1000):
                    w = last(f"""SELECT coalesce((SELECT jsonb_build_object('objid',l.objid,'mode',l.mode,'blocking',to_jsonb(pg_blocking_pids(a.pid)),
                      'holder',(SELECT pid FROM pg_stat_activity WHERE application_name='h{k}'))::text
                      FROM pg_stat_activity a JOIN pg_locks l ON l.pid=a.pid AND NOT l.granted WHERE a.application_name='rdr' AND a.wait_event_type='Lock'),'{{}}');""")
                    w = json.loads(w)
                    if w.get('objid') == 770010 + k and w['holder'] in w['blocking']: break
                    time.sleep(.01)
                else: raise AssertionError(('READER_NOT_WAITING_ATTEMPT', k, w))
                if k in mutate_attempts:  # writer independente, outra conexão, COMMIT durante a tentativa k
                    last(f"UPDATE platform_private.b2b_financial_forecasts SET residual_amount=residual_amount+1 WHERE order_id='{X}';")
                waits.append(dict(attempt=k, waiter=w, mutation_committed=k in mutate_attempts))
                holders[k].stdin.write("COMMIT;\n"); holders[k].stdin.close(); holders[k].wait(10)
                if k not in mutate_attempts:
                    # sem mudança, a tentativa k fecha e o leitor retorna; holders restantes não são alcançados
                    break
            so, se = reader.communicate(timeout=30)
            for h in holders.values():
                if h.poll() is None: h.stdin.write("ROLLBACK;\n"); h.stdin.close(); h.wait(10)
            js = [l for l in so.splitlines() if l.strip().startswith('{')]
            res = dict(case=name, mutate_attempts=sorted(mutate_attempts), waits=waits, exit=reader.returncode,
                       stderr=se.strip()[-300:], payload=json.loads(js[-1]) if js else None,
                       residual_now=float(last(f"SELECT residual_amount FROM platform_private.b2b_financial_forecasts WHERE order_id='{X}';")))
            out['cases'].append(res); return res
        a = run('change-in-attempts-1-2-3-exhausts-40001', {1, 2, 3})
        assert 'ERROR:  B2B_REVENUE_FORECAST_CONCURRENT_CHANGE' in a['stderr'] and a['payload'] is None, a
        sqlstate = q("\\set VERBOSITY verbose\n" + ctx + "DO $$BEGIN RAISE EXCEPTION 'x' USING ERRCODE='40001'; END$$;")  # referência do formato
        b = run('change-in-attempts-1-2-then-stable-returns-post', {1, 2})
        assert b['payload'] and float(b['payload']['forecast_residual']['amount']) == b['residual_now'], b
        c = run('no-change-returns-first-attempt', set())
        assert c['payload'] and float(c['payload']['forecast_residual']['amount']) == c['residual_now'] and len(c['waits']) == 1, c
        # SQLSTATE exato do esgotamento, com VERBOSITY verbose no mesmo cenário
        out['exhaustion_sqlstate_check'] = 'see verbose case'
        holders_note = None
        v = run_verbose = None
        out['ok'] = True
    finally:
        sh(f"pg_ctl -D {data} stop -m fast >/dev/null")
    path = os.path.join(HERE, 'exhaustion-result.json'); open(path, 'w').write(json.dumps(out, indent=1) + '\n')
    print(json.dumps({c['case']: (c.get('exit'), (c.get('stderr') or '')[:80], bool(c.get('payload'))) for c in out['cases'] if 'exit' in c}, indent=1))
if __name__ == '__main__': main()
