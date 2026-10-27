"""SYNTHETIC ONLY: disposable PostgreSQL, synthetic Auth (auth.uid() from GUC test.actor),
reduced schema and stub helpers (h15_user_organization/is_financial_staff semantics copied
from LIVE; valor/guard stubs). Loads candidate.sql.review verbatim. Never connects to hosted
Supabase. Not JWT/RLS homologation."""
from pathlib import Path
import tempfile, subprocess, os, time, json
HERE = Path(__file__).resolve().parent
PORT = '55531'
FA = 'aaaaaaaa-0000-4000-8000-00000000000a'  # financeiro A
FB = 'bbbbbbbb-0000-4000-8000-00000000000a'  # financeiro B
CA = 'aaaaaaaa-0000-4000-8000-00000000000c'  # consultor A (not financial)
OA = '0a000000-0000-4000-8000-00000000000a'; OB = '0b000000-0000-4000-8000-00000000000b'
CLA = 'c1000000-0000-4000-8000-00000000000a'
REC = 'cafe0000-0000-4000-8000-000000000001'; DESP = 'cafe0000-0000-4000-8000-000000000002'; RECOFF = 'cafe0000-0000-4000-8000-000000000003'
PM = 'feed0000-0000-4000-8000-000000000001'; PMOFF = 'feed0000-0000-4000-8000-000000000002'
E = lambda n: f'e0000000-0000-4000-8000-{n:012d}'
checks = []

def main():
    tmp = Path(tempfile.mkdtemp(prefix='billing-', dir='/tmp')); tmp.chmod(0o777)
    prefix = ['setpriv', '--reuid=1000', '--regid=1000', '--clear-groups'] if os.getuid() == 0 else []
    base = ['psql', '-X', '-h', str(tmp), '-p', PORT, '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At']
    def sql(q, must=True):
        r = subprocess.run(base, input=q, text=True, capture_output=True)
        if must and r.returncode: raise RuntimeError(r.stderr)
        return r
    def ok(q, label):
        out = sql(q).stdout.strip().splitlines()
        if not out or out[-1] != 't': raise AssertionError(label + ' got ' + repr(out))
        checks.append(label); print('PASS', label)
    def err(q, code, label):
        r = sql('\\set VERBOSITY verbose\n' + q, False)
        if r.returncode == 0 or code not in r.stderr: raise AssertionError(label + ': ' + r.stderr + r.stdout)
        checks.append(label); print('PASS', label, code)
    def as_(u): return f"SET ROLE authenticated; SET test.actor='{u}';"
    def bill(u, e, **kw):
        p = {'total_amount': 100, 'category_id': REC, 'payment_method_id': PM, 'installment_count': 1,
             'issue_date': '2026-10-27', 'first_due_date': '2026-11-27'}
        p.update(kw); p = {k: v for k, v in p.items() if v is not ...}
        return as_(u) + f"SELECT public.fn_generate_receivable_from_entrega('{e}','{json.dumps(p)}'::jsonb);"
    def mark(u, e): return as_(u) + f"SELECT public.fn_mark_entrega_not_billable('{e}','motivo teste');"
    def session():
        p = subprocess.Popen(base, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        def send(q): p.stdin.write(q + '\n'); p.stdin.flush()
        return p, send
    def wait_lock(n=1, timeout=10):
        t = time.time()
        while time.time() - t < timeout:
            if int(sql("SELECT count(*) FROM pg_stat_activity WHERE wait_event_type IN ('Lock','Advisory');").stdout.strip()) >= n: return
            time.sleep(0.05)
        raise AssertionError('waiting backend not observed')
    started = False
    try:
        subprocess.run(prefix + ['initdb', '-D', str(tmp / 'd'), '-A', 'trust', '-U', 'postgres'], check=True, capture_output=True)
        subprocess.run(prefix + ['pg_ctl', '-D', str(tmp / 'd'), '-l', str(tmp / 'log'), '-o', f'-k {tmp} -h "" -p {PORT}', 'start'], check=True, capture_output=True); started = True
        sql(f"""
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth; CREATE SCHEMA cf_user_guards_v1;
GRANT USAGE ON SCHEMA auth TO authenticated, anon;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('test.actor',true),'')::uuid$$;
CREATE TYPE app_role AS ENUM('administrador','gestor','financeiro','consultor_tecnico');
CREATE TYPE status_entrega AS ENUM('separado','em_rota','entregue','cancelada');
CREATE TABLE cf_user_guards_v1.state(singleton boolean PRIMARY KEY, revision bigint); INSERT INTO cf_user_guards_v1.state VALUES(true,1);
CREATE TABLE organizations(id uuid PRIMARY KEY, ativo boolean); INSERT INTO organizations VALUES('{OA}',true),('{OB}',true);
CREATE TABLE profiles(user_id uuid PRIMARY KEY, organization_id uuid, ativo boolean);
INSERT INTO profiles VALUES('{FA}','{OA}',true),('{FB}','{OB}',true),('{CA}','{OA}',true);
CREATE TABLE user_roles(user_id uuid, role app_role);
INSERT INTO user_roles VALUES('{FA}','financeiro'),('{FB}','financeiro'),('{CA}','consultor_tecnico');
CREATE FUNCTION has_role(u uuid, r app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS
 $$SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=u AND role=r)$$;
CREATE FUNCTION fn_authz_uid_scope_ok(_uid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS
 $$SELECT auth.uid() IS NULL OR (_uid IS NOT NULL AND _uid=auth.uid()) OR public.has_role(auth.uid(),'administrador')$$;
CREATE FUNCTION is_financial_staff(_uid uuid) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS
 $$BEGIN IF NOT public.fn_authz_uid_scope_ok(_uid) THEN RETURN false; END IF;
   RETURN has_role(_uid,'administrador') OR has_role(_uid,'gestor') OR has_role(_uid,'financeiro'); END$$;
CREATE FUNCTION h15_user_organization(p_user uuid) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS
 $$SELECT p.organization_id FROM public.profiles p JOIN public.organizations o ON o.id=p.organization_id AND o.ativo IS TRUE
   WHERE p.user_id=p_user AND p.ativo IS TRUE$$;
CREATE TABLE financial_categories(id uuid PRIMARY KEY, type text, active boolean);
INSERT INTO financial_categories VALUES('{REC}','RECEITA',true),('{DESP}','DESPESA',true),('{RECOFF}','RECEITA',false);
CREATE TABLE payment_methods(id uuid PRIMARY KEY, active boolean); INSERT INTO payment_methods VALUES('{PM}',true),('{PMOFF}',false);
CREATE TABLE entregas(id uuid PRIMARY KEY, organization_id uuid, cliente_id uuid, status status_entrega, financial_status text,
  receivable_id uuid, not_billable_reason text, billing_generated_at timestamptz, billing_generated_by uuid, canon numeric);
CREATE TABLE entrega_reconciliacoes(entrega_id uuid, status text, valor_faturavel_max numeric);
CREATE TABLE accounts_receivable(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid, origin_type text, origin_id uuid,
  customer_id uuid, description text, category_id uuid, cost_center_id uuid, total_amount numeric, issue_date date, first_due_date date,
  installment_count int, payment_method_id uuid, fiscal_invoice_required boolean, fiscal_invoice_status text, notes text, created_by uuid,
  status text DEFAULT 'OPEN');
CREATE UNIQUE INDEX ar_origin_active ON accounts_receivable(origin_type, origin_id) WHERE status <> 'CANCELED';
CREATE FUNCTION ar_org() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN NEW.organization_id := (SELECT organization_id FROM entregas WHERE id=NEW.origin_id); RETURN NEW; END$$;
CREATE TRIGGER ar_org BEFORE INSERT ON accounts_receivable FOR EACH ROW EXECUTE FUNCTION ar_org();
CREATE TABLE accounts_receivable_installments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), receivable_id uuid, installment_number int,
  due_date date, original_amount numeric, net_amount numeric, status text);
CREATE TABLE financial_audit_log(id bigserial, entity_type text, entity_id uuid, action text, old_data jsonb, new_data jsonb, performed_by uuid);
CREATE FUNCTION fn_entrega_valor_faturavel_v1(p uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS
 $$SELECT jsonb_build_object('origem','snapshot','valor',(SELECT canon FROM public.entregas WHERE id=p))$$;
CREATE FUNCTION fn_entrega_guard_faturamento_v1(p uuid, t numeric) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS
 $$SELECT jsonb_build_object('modo','integral_canonico')$$;
GRANT USAGE ON SCHEMA public TO authenticated;
""")
        sql((HERE / 'candidate.sql.review').read_text())
        sql("REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC; GRANT EXECUTE ON FUNCTION fn_generate_receivable_from_entrega(uuid,jsonb), fn_mark_entrega_not_billable(uuid,text) TO authenticated;")
        def reset():
            rows = ",".join(f"('{E(i)}','{OA}','{CLA}','entregue','PENDING_BILLING',100)" for i in range(1, 40))
            sql(f"TRUNCATE entregas, accounts_receivable, accounts_receivable_installments, financial_audit_log, entrega_reconciliacoes;"
                f"DELETE FROM user_roles; INSERT INTO user_roles VALUES('{FA}','financeiro'),('{FB}','financeiro'),('{CA}','consultor_tecnico');"
                f"UPDATE profiles SET ativo=true; INSERT INTO entregas(id,organization_id,cliente_id,status,financial_status,canon) VALUES {rows},"
                f"('{E(90)}','{OB}','{CLA}','entregue','PENDING_BILLING',100),('{E(91)}',NULL,'{CLA}','entregue','PENDING_BILLING',100);"
                f"UPDATE entregas SET status='cancelada' WHERE id='{E(30)}'; UPDATE entregas SET status='em_rota' WHERE id='{E(31)}';"
                f"UPDATE entregas SET financial_status='NOT_BILLABLE' WHERE id='{E(32)}';")
        reset()
        nothing = lambda e: f"RESET ROLE; SELECT (SELECT count(*) FROM accounts_receivable WHERE origin_id='{e}')=0 AND (SELECT receivable_id IS NULL FROM entregas WHERE id='{e}') AND (SELECT count(*) FROM financial_audit_log)=0;"
        # positive + replay
        ok(bill(FA, E(1)) + "RESET ROLE; SELECT (SELECT count(*) FROM accounts_receivable WHERE origin_id='%s')=1 AND (SELECT financial_status FROM entregas WHERE id='%s')='BILLED' AND (SELECT count(*) FROM financial_audit_log)=1;" % (E(1), E(1)), 'A fatura própria: 1 título, BILLED, 1 auditoria')
        ok(f"SELECT (SELECT receivable_id FROM entregas WHERE id='{E(1)}') = (SELECT x FROM (SELECT 1) s, LATERAL (SELECT NULL::uuid) t(y), LATERAL (SELECT receivable_id x FROM entregas WHERE id='{E(1)}') z);", 'id persistido')
        rid = sql(f"SELECT receivable_id FROM entregas WHERE id='{E(1)}';").stdout.strip()
        ok(bill(FA, E(1)) .replace("SELECT public.", "SELECT public.") + f"RESET ROLE; SELECT true;", 'replay executa sem erro')
        r = sql(bill(FA, E(1))).stdout.strip().splitlines()[-1]
        assert r == rid, (r, rid); checks.append('replay devolve mesmo id'); print('PASS replay devolve mesmo id')
        ok(f"SELECT (SELECT count(*) FROM accounts_receivable)=1 AND (SELECT count(*) FROM financial_audit_log)=1;", 'replay sem novo título nem auditoria')
        # cross tenant: no leak
        err(bill(FB, E(1)), '42501', 'B não reaproveita/obtém id de entrega faturada de A')
        err(bill(FB, E(2)), '42501', 'B não fatura entrega de A'); ok(nothing(E(2)), 'B→A sem escrita')
        err(mark(FB, E(2)), '42501', 'B não marca sem cobrança entrega de A')
        err(bill(FA, E(91)), '42501', 'entrega sem empresa negada')
        err(bill(CA, E(2)), '42501', 'consultor sem papel financeiro negado')
        err("SET ROLE authenticated; RESET test.actor; SELECT public.fn_generate_receivable_from_entrega('%s','{}'::jsonb);" % E(2), '42501', 'sem sessão negado (faturar)')
        err("SET ROLE authenticated; RESET test.actor; SELECT public.fn_mark_entrega_not_billable('%s','x');" % E(2), '42501', 'sem sessão negado (marcar)')
        err("SET ROLE anon; SELECT public.fn_generate_receivable_from_entrega('%s','{}'::jsonb);" % E(2), '42501', 'anon sem EXECUTE')
        sql(f"UPDATE profiles SET ativo=false WHERE user_id='{FA}';")
        err(bill(FA, E(2)), '42501', 'perfil inativo negado'); sql(f"UPDATE profiles SET ativo=true WHERE user_id='{FA}';")
        # category / method
        err(bill(FA, E(3), category_id=DESP), '23514', 'categoria DESPESA recusada')
        err(bill(FA, E(3), category_id=RECOFF), '23514', 'categoria RECEITA inativa recusada')
        err(bill(FA, E(3), payment_method_id=...), '23514', 'sem forma de pagamento recusado')
        err(bill(FA, E(3), payment_method_id=PMOFF), '23514', 'forma de pagamento inativa recusada')
        ok(nothing(E(3)), 'recusas de categoria/forma sem escrita')
        # installments
        err(bill(FA, E(4), installment_count=2, installments=[{'installment_number': 1, 'due_date': '2026-11-27', 'amount': 50}, {'installment_number': 1, 'due_date': '2026-12-27', 'amount': 50}]), '23514', 'parcela repetida recusada')
        err(bill(FA, E(4), installment_count=2, installments=[{'installment_number': 1, 'due_date': '2026-11-27', 'amount': 50}, {'installment_number': 3, 'due_date': '2026-12-27', 'amount': 50}]), '23514', 'número fora de 1..n recusado')
        err(bill(FA, E(4), installment_count=1, installments=[{'installment_number': 1, 'amount': 100}]), '23514', 'vencimento nulo recusado')
        err(bill(FA, E(4), installment_count=1, installments=[{'installment_number': 1, 'due_date': '2026-01-01', 'amount': 100}]), '23514', 'vencimento antes da emissão recusado')
        err(bill(FA, E(4), installment_count=2, installments=[{'installment_number': 1, 'due_date': '2026-11-27', 'amount': 120}, {'installment_number': 2, 'due_date': '2026-12-27', 'amount': -20}]), '23514', 'parcela negativa recusada')
        err(bill(FA, E(4), installment_count=1, installments={'x': 1}), '23514', 'parcelas não-array recusadas')
        err(bill(FA, E(4), total_amount='NaN'), '23514', 'total NaN recusado')
        err(bill(FA, E(4), first_due_date='2026-01-01'), '23514', 'primeiro vencimento antes da emissão recusado')
        ok(nothing(E(4)), 'recusas de parcelas sem escrita')
        ok(bill(FA, E(5), installment_count=2, installments=[{'installment_number': 2, 'due_date': '2026-12-27', 'amount': 40}, {'installment_number': 1, 'due_date': '2026-11-27', 'amount': 60}]) +
           f"RESET ROLE; SELECT (SELECT count(*) FROM accounts_receivable_installments)=2;", 'parcelas válidas fora de ordem aceitas')
        # conflicts PT409
        err(bill(FA, E(30)), 'PT409', 'entrega cancelada → PT409')
        err(bill(FA, E(31)), 'PT409', 'entrega não entregue → PT409')
        err(bill(FA, E(32)), 'PT409', 'entrega NOT_BILLABLE → PT409')
        err(mark(FA, E(1)), 'PT409', 'marcar já faturada → PT409')
        ok(mark(FA, E(6)) + f"RESET ROLE; SELECT (SELECT financial_status FROM entregas WHERE id='{E(6)}')='NOT_BILLABLE';", 'marcar própria sem cobrança')
        err(bill(FA, E(6)), 'PT409', 'faturar após marcar → PT409')
        # atomic rollback: audit failure leaves nothing
        reset()
        sql("CREATE FUNCTION boom() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'injected'; END$$; CREATE TRIGGER boom BEFORE INSERT ON financial_audit_log FOR EACH ROW EXECUTE FUNCTION boom();")
        err(bill(FA, E(7), installment_count=1, installments=[{'installment_number': 1, 'due_date': '2026-11-27', 'amount': 100}]), 'injected', 'falha injetada na auditoria')
        ok(nothing(E(7)) + "", 'rollback: nenhum título/parcela/estado')
        ok("SELECT (SELECT count(*) FROM accounts_receivable_installments)=0;", 'rollback: nenhuma parcela')
        sql("DROP TRIGGER boom ON financial_audit_log;")
        # concurrency: double billing -> 1 title
        reset()
        p1, s1 = session(); s1("BEGIN; " + bill(FA, E(8)))
        time.sleep(0.3)
        p2, s2 = session(); s2(bill(FA, E(8)))
        wait_lock(1)
        s1("COMMIT;"); p1.stdin.close(); p1.wait(10); p2.stdin.close(); o2 = p2.communicate(timeout=10)[0]
        ok(f"SELECT (SELECT count(*) FROM accounts_receivable WHERE origin_id='{E(8)}')=1 AND (SELECT count(*) FROM financial_audit_log)=1;", 'duas chamadas simultâneas: 1 título, 1 auditoria')
        assert sql(f"SELECT receivable_id FROM entregas WHERE id='{E(8)}';").stdout.strip() in o2; checks.append('segunda chamada recebe mesmo id'); print('PASS segunda chamada recebe mesmo id')
        # revocation committed while caller waits on gate -> denied, no write
        reset()
        pr, sr = session(); sr(f"BEGIN; SELECT 1 FROM cf_user_guards_v1.state WHERE singleton FOR UPDATE; DELETE FROM user_roles WHERE user_id='{FA}';")
        time.sleep(0.3)
        pc = subprocess.Popen(base, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        pc.stdin.write('\\set VERBOSITY verbose\n' + bill(FA, E(9)) + '\n'); pc.stdin.flush()
        wait_lock(1)
        sr("COMMIT;"); pr.stdin.close(); pr.wait(10); pc.stdin.close(); _, e9 = pc.communicate(timeout=10)
        assert '42501' in e9, e9; checks.append('revogação commitada durante espera no gate → 42501'); print('PASS revogação durante espera → 42501')
        ok(nothing(E(9)), 'revogação: nenhuma escrita')
        # reverse ordering: billing holds gate, revocation waits, billing commits first -> billed, then revoked
        reset()
        pb, sb = session(); sb("BEGIN; " + bill(FA, E(10)))
        time.sleep(0.3)
        pv, sv = session(); sv(f"BEGIN; SELECT 1 FROM cf_user_guards_v1.state WHERE singleton FOR UPDATE; DELETE FROM user_roles WHERE user_id='{FA}'; COMMIT;")
        wait_lock(1)
        ok(f"SELECT (SELECT count(*) FROM user_roles WHERE user_id='{FA}')=1;", 'ordem inversa: revogação aguarda o faturamento')
        sb("COMMIT;"); pb.stdin.close(); pb.wait(10); pv.stdin.close(); pv.wait(10)
        ok(f"SELECT (SELECT count(*) FROM accounts_receivable WHERE origin_id='{E(10)}')=1 AND (SELECT count(*) FROM user_roles WHERE user_id='{FA}')=0;", 'ordem inversa: faturamento comprometido antes, revogação depois')
        err(bill(FA, E(11)), '42501', 'após revogação, nova chamada negada')
        # lock_timeout configured
        ok("SELECT bool_and(array_to_string(proconfig,',')='search_path=public,lock_timeout=3s') FROM pg_proc WHERE proname IN ('fn_generate_receivable_from_entrega','fn_mark_entrega_not_billable');", 'lock_timeout=3s configurado')
        reset()
        pg, sg = session(); sg("BEGIN; SELECT 1 FROM cf_user_guards_v1.state WHERE singleton FOR UPDATE;")
        time.sleep(0.3)
        t0 = time.time(); err(bill(FA, E(12)), '55P03', 'gate preso >3s → 55P03 sem escrita'); dt = time.time() - t0
        assert dt < 6, dt
        sg("ROLLBACK;"); pg.stdin.close(); pg.wait(10)
        ok(nothing(E(12)), 'timeout sem escrita')
    finally:
        if started: subprocess.run(prefix + ['pg_ctl', '-D', str(tmp / 'd'), 'stop', '-m', 'fast'], capture_output=True)
    (HERE / 'results.txt').write_text(f'SYNTHETIC disposable PostgreSQL; {len(checks)} checks passed\n' + '\n'.join(checks) + '\n')
    print(len(checks), 'checks passed')

main()
