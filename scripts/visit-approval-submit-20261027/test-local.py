"""SYNTHETIC ONLY: disposable PostgreSQL, synthetic Auth (auth.uid() from a GUC set by the
harness, never used by the candidate for authorization) and reduced schema/stub
authorization helpers. Never connects to hosted Supabase. Not JWT/RLS homologation."""
from pathlib import Path
import tempfile, subprocess, os, shutil, time, re
HERE = Path(__file__).resolve().parent
PORT = '55511'
A = 'aaaaaaaa-0000-4000-8000-00000000000a'   # consultor responsável tenant A
G = 'aaaaaaaa-0000-4000-8000-00000000000b'   # gestor tenant A (not creator/resp, no client link)
ADM = 'aaaaaaaa-0000-4000-8000-00000000000c' # administrador tenant A
X = 'bbbbbbbb-0000-4000-8000-00000000000a'   # consultor tenant B
CA = 'cccccccc-0000-4000-8000-00000000000a'; CB = 'cccccccc-0000-4000-8000-00000000000b'
V = lambda n: f'11111111-0000-4000-8000-{n:012d}'
checks = 0

def main():
    global checks
    tmp = Path(tempfile.mkdtemp(prefix='visit-approval-', dir='/tmp')); tmp.chmod(0o777)
    prefix = ['setpriv', '--reuid=1000', '--regid=1000', '--clear-groups'] if os.getuid() == 0 else []
    base = ['psql', '-X', '-h', str(tmp), '-p', PORT, '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At']
    def sql(q, must=True):
        r = subprocess.run(base, input='\\set VERBOSITY verbose\n' + q, text=True, capture_output=True)
        if must and r.returncode: raise RuntimeError(r.stderr)
        return r
    def ok(q, label):
        global checks
        out = sql(q).stdout.strip().splitlines()
        if not out or out[-1] != 't': raise AssertionError(label + ' got ' + repr(out))
        checks += 1; print('PASS', label)
    def err(q, code, label):
        global checks
        r = sql(q, False)
        if r.returncode == 0 or code not in r.stderr: raise AssertionError(label + ': ' + r.stderr)
        checks += 1; print('PASS', label, code)
    def rpc(actor, vid, ver):
        return f"SET ROLE authenticated; SET test.actor='{actor}'; SELECT public.rpc_enviar_visita_aprovacao('{vid}',{ver})::text;"
    def session():
        p = subprocess.Popen(base, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        def send(q): p.stdin.write(q + '\n'); p.stdin.flush()
        return p, send
    def wait_lock(n=1, timeout=10):
        t = time.time()
        while time.time() - t < timeout:
            c = sql("SELECT count(*) FROM pg_stat_activity WHERE wait_event_type='Lock';").stdout.strip()
            if int(c) >= n: return
            time.sleep(0.05)
        raise AssertionError('expected waiting backend not observed')
    started = False
    try:
        subprocess.run(prefix + ['initdb', '-D', str(tmp / 'data'), '-A', 'trust', '-U', 'postgres'], check=True, capture_output=True)
        subprocess.run(prefix + ['pg_ctl', '-D', str(tmp / 'data'), '-l', str(tmp / 'log'), '-o', f'-k {tmp} -h "" -p {PORT}', 'start'], check=True, capture_output=True); started = True
        sql(f"""
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth; CREATE SCHEMA cf_user_guards_v1;
GRANT USAGE ON SCHEMA auth, cf_user_guards_v1 TO authenticated, anon;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('test.actor',true),'')::uuid$$;
CREATE TYPE app_role AS ENUM('administrador','gestor','consultor_tecnico','tecnico_agronomo');
CREATE TYPE status_registro_consultor AS ENUM('rascunho','em_andamento','finalizado','enviado_aprovacao','aprovado');
CREATE TABLE cf_user_guards_v1.state(singleton boolean PRIMARY KEY, revision bigint); INSERT INTO cf_user_guards_v1.state VALUES(true,1);
CREATE TABLE actors(id uuid PRIMARY KEY, tenant text, ready boolean);
INSERT INTO actors VALUES('{A}','A',true),('{G}','A',true),('{ADM}','A',true),('{X}','B',true);
CREATE TABLE user_roles(user_id uuid, role app_role);
INSERT INTO user_roles VALUES('{A}','consultor_tecnico'),('{G}','gestor'),('{ADM}','administrador'),('{X}','consultor_tecnico');
CREATE TABLE clientes(id uuid PRIMARY KEY, tenant text); INSERT INTO clientes VALUES('{CA}','A'),('{CB}','B');
CREATE TABLE client_links(user_id uuid, cliente_id uuid, active boolean);
INSERT INTO client_links VALUES('{A}','{CA}',true),('{X}','{CB}',true);
CREATE TABLE registros_consultor(id uuid PRIMARY KEY, created_by uuid, consultor_responsavel uuid, cliente_id uuid,
  status status_registro_consultor, version integer, updated_at timestamptz DEFAULT now());
CREATE TABLE visitas_logs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), registro_consultor_id uuid, usuario_id uuid,
  acao text NOT NULL, descricao text, data_hora timestamptz NOT NULL DEFAULT now());
CREATE FUNCTION has_role(u uuid, r app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS
 $$SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=u AND role=r)$$;
CREATE FUNCTION technical_actor_ready(u uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS
 $$SELECT coalesce((SELECT ready FROM public.actors WHERE id=u),false)$$;
CREATE FUNCTION has_active_user_cliente_access(u uuid, c uuid, caps text[]) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS
 $$SELECT EXISTS(SELECT 1 FROM public.client_links WHERE user_id=u AND cliente_id=c AND active)$$;
CREATE FUNCTION can_manage_technical_visit(u uuid, rid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS
 $$SELECT public.technical_actor_ready(u) AND EXISTS(SELECT 1 FROM public.registros_consultor r JOIN public.clientes c ON c.id=r.cliente_id
   JOIN public.actors a ON a.id=u AND a.tenant=c.tenant WHERE r.id=rid AND (public.has_role(u,'administrador') OR public.has_role(u,'gestor')
   OR (public.has_role(u,'consultor_tecnico') AND public.has_active_user_cliente_access(u,r.cliente_id,ARRAY['execute','manage']) AND r.consultor_responsavel=u)))$$;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
""")
        def reset():
            rows = ",".join(f"('{V(i)}','{A}','{A}','{CA}','finalizado',3)" for i in range(1, 20))
            sql(f"TRUNCATE registros_consultor, visitas_logs; UPDATE actors SET ready=true; UPDATE client_links SET active=true;"
                f"INSERT INTO registros_consultor(id,created_by,consultor_responsavel,cliente_id,status,version) VALUES {rows},"
                f"('{V(90)}','{X}','{X}','{CB}','finalizado',3),('{V(91)}','{A}','{A}','{CA}','rascunho',3);")
        # ---- PRE: reproduce the live baseline defects so negatives can fail.
        sql((HERE / 'baseline.sql').read_text())
        sql("REVOKE ALL ON FUNCTION public.rpc_enviar_visita_aprovacao(uuid,integer) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.rpc_enviar_visita_aprovacao(uuid,integer) TO service_role; GRANT EXECUTE ON FUNCTION public.rpc_enviar_visita_aprovacao(uuid,integer) TO authenticated;")
        reset()
        err(rpc(A, V(1), 2), '40001', 'PRE baseline stale CAS raises 40001 (defect reproduced)')
        ok(f"SELECT public.has_role('{A}','consultor_tecnico');", 'PRE harness ready')
        # PRE revocation-during-row-wait: baseline caches auth before lock and succeeds after revocation.
        p, send = session(); send(f"BEGIN; SELECT 1 FROM registros_consultor WHERE id='{V(2)}' FOR UPDATE;")
        time.sleep(0.3)
        q = subprocess.Popen(base, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        q.stdin.write('\\set VERBOSITY verbose\n'+rpc(A, V(2), 3)); q.stdin.close()
        wait_lock(1)
        send(f"UPDATE actors SET ready=false WHERE id='{A}'; COMMIT;"); p.stdin.close(); p.wait()
        q.wait()
        if q.returncode != 0: raise AssertionError('PRE expected baseline to succeed after revocation: ' + q.stderr.read())
        global checks; checks += 1; print('PASS PRE baseline approves despite revocation during row wait (defect reproduced)')
        # ---- Candidate (pre/post DO blocks pin LIVE hashes; stripped for synthetic schema, post checked separately).
        cand = (HERE / 'candidate.sql.review').read_text()
        cand_body = re.sub(r'DO \$pre\$.*?\$pre\$;', '', cand, flags=re.S)
        post = re.search(r'DO \$post\$.*?\$post\$;', cand, flags=re.S).group(0)
        cand_body = cand_body.replace(post, '')
        sql(cand_body)
        sql(post)
        checks += 1; print('PASS POST block accepts candidate (config/ACL/body markers)')
        ok("SELECT proconfig::text='{search_path=public,lock_timeout=3s}' AND prosecdef FROM pg_proc WHERE oid='public.rpc_enviar_visita_aprovacao(uuid,integer)'::regprocedure;", 'definer + search_path + lock_timeout 3s')
        ok("SELECT NOT has_function_privilege('anon','public.rpc_enviar_visita_aprovacao(uuid,integer)','EXECUTE');", 'anon cannot execute')
        reset()
        # ---- Positives
        ok(rpc(A, V(1), 3) + f"RESET ROLE; SELECT status='enviado_aprovacao' AND version=4 FROM registros_consultor WHERE id='{V(1)}';", 'responsible consultor positive v3->v4')
        ok(f"SELECT count(*)=1 FROM visitas_logs WHERE registro_consultor_id='{V(1)}' AND acao='enviado_aprovacao' AND usuario_id='{A}';", 'exactly one log')
        ok(rpc(ADM, V(3), 3) + "RESET ROLE; SELECT true;", 'admin tenant A positive')
        ok(rpc(X, V(90), 3) + "RESET ROLE; SELECT true;", 'tenant B own positive')
        # ---- Negatives (each must leave row unchanged)
        snap = lambda vid: sql(f"SELECT md5(row(r.*)::text) FROM registros_consultor r WHERE id='{vid}';").stdout.strip()
        s4 = snap(V(4))
        for ver, label in (('NULL', 'null CAS'), ('0', 'zero CAS'), ('2', 'old CAS'), ('4', 'future CAS')):
            err(rpc(A, V(4), ver), 'PT409', label + ' PT409')
        err(rpc(A, V(1), 4), 'PT409', 'already sent -> transicao_invalida PT409')
        err(rpc(A, V(91), 3), 'PT409', 'rascunho not finalizado PT409')
        err(rpc(X, V(4), 3), '42501', 'cross-tenant B->A denied')
        err(rpc(A, V(90), 3), '42501', 'cross-tenant A->B denied')
        err(rpc(A, V(99), 3), '42501', 'nonexistent same generic error')
        err(rpc(G, V(4), 3), '42501', 'gestor without creator/resp/client link keeps original restriction')
        err(f"SET ROLE authenticated; RESET test.actor; SELECT public.rpc_enviar_visita_aprovacao('{V(4)}',3);", '42501', 'unauthenticated')
        err(f"SET ROLE anon; SET test.actor='{A}'; SELECT public.rpc_enviar_visita_aprovacao('{V(4)}',3);", '42501', 'anon EXECUTE denied')
        sql(f"UPDATE client_links SET active=false WHERE user_id='{A}';")
        err(rpc(A, V(4), 3), '42501', 'revoked client link denied')
        sql(f"UPDATE client_links SET active=true; UPDATE actors SET ready=false WHERE id='{A}';")
        err(rpc(A, V(4), 3), '42501', 'inactive actor denied'); sql("UPDATE actors SET ready=true;")
        ok(f"SELECT md5(row(r.*)::text)='{s4}' FROM registros_consultor r WHERE id='{V(4)}';", 'negatives atomic (row unchanged)')
        ok(f"SELECT count(*)=0 FROM visitas_logs WHERE registro_consultor_id IN ('{V(4)}','{V(90)}','{V(91)}') AND usuario_id<>'{X}';", 'no log on negatives')
        # ---- Concurrency (two+ real connections, deterministic via pg_stat_activity Lock waits)
        # C1 revocation commits FIRST while holding gate -> operation waiting at gate is denied.
        p, send = session(); send(f"BEGIN; SELECT 1 FROM cf_user_guards_v1.state WHERE singleton FOR UPDATE; UPDATE actors SET ready=false WHERE id='{A}';")
        time.sleep(0.3)
        q = subprocess.Popen(base, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        q.stdin.write('\\set VERBOSITY verbose\n'+rpc(A, V(5), 3)); q.stdin.close(); wait_lock(1)
        send('COMMIT;'); p.stdin.close(); p.wait(); q.wait()
        e = q.stderr.read()
        if q.returncode == 0 or '42501' not in e: raise AssertionError('C1 ' + e)
        checks += 1; print('PASS C1 revocation committed first at gate -> operation denied after gate wait 42501')
        sql("UPDATE actors SET ready=true;")
        # C2 revocation while operation waits on ROW lock (revocation does not take gate here: synthetic direct write).
        p, send = session(); send(f"BEGIN; SELECT 1 FROM registros_consultor WHERE id='{V(6)}' FOR UPDATE;"); time.sleep(0.3)
        q = subprocess.Popen(base, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        q.stdin.write('\\set VERBOSITY verbose\n'+rpc(A, V(6), 3)); q.stdin.close(); wait_lock(1)
        sql(f"UPDATE actors SET ready=false WHERE id='{A}';")  # commits while op waits on row
        send('COMMIT;'); p.stdin.close(); p.wait(); q.wait(); e = q.stderr.read()
        if q.returncode == 0 or '42501' not in e: raise AssertionError('C2 ' + e)
        checks += 1; print('PASS C2 revocation committed during row wait -> post-lock re-authorization denies 42501')
        ok(f"SELECT status='finalizado' FROM registros_consultor WHERE id='{V(6)}';", 'C2 row unchanged'); sql("UPDATE actors SET ready=true;")
        # C3 operation already holds gate and waits on row; gate-taking revocation queues BEHIND it -> operation commits first.
        p, send = session(); send(f"BEGIN; SELECT 1 FROM registros_consultor WHERE id='{V(7)}' FOR UPDATE;"); time.sleep(0.3)
        q = subprocess.Popen(base, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        q.stdin.write('\\set VERBOSITY verbose\n'+rpc(A, V(7), 3)); q.stdin.close(); wait_lock(1)
        r_, rsend = session(); rsend(f"BEGIN; SELECT 1 FROM cf_user_guards_v1.state WHERE singleton FOR UPDATE; UPDATE actors SET ready=false WHERE id='{A}'; COMMIT;")
        wait_lock(2)
        send('COMMIT;'); p.stdin.close(); p.wait(); q.wait(); r_.stdin.close(); r_.wait()
        if q.returncode != 0: raise AssertionError('C3 ' + q.stderr.read())
        checks += 1; print('PASS C3 operation holding gate commits before queued revocation (revocation did NOT win; documented)')
        ok(f"SELECT status='enviado_aprovacao' FROM registros_consultor WHERE id='{V(7)}' AND NOT (SELECT ready FROM actors WHERE id='{A}');", 'C3 commit order: op then revocation')
        err(rpc(A, V(8), 3), '42501', 'C3 after revocation subsequent call denied'); sql("UPDATE actors SET ready=true;")
        # C4 double submit same version -> exactly one success, one PT409, one log.
        p, send = session(); send("BEGIN; SELECT 1 FROM cf_user_guards_v1.state WHERE singleton FOR UPDATE;"); time.sleep(0.3)
        qs = []
        for _ in range(2):
            q = subprocess.Popen(base, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            q.stdin.write('\\set VERBOSITY verbose\n'+rpc(A, V(9), 3)); q.stdin.close(); qs.append(q)
        wait_lock(2); send('COMMIT;'); p.stdin.close(); p.wait()
        for q in qs: q.wait()
        codes = sorted(q.returncode for q in qs); errs = ''.join(q.stderr.read() for q in qs)
        if codes != [0, 3] or 'PT409' not in errs: raise AssertionError(f'C4 {codes} {errs}')
        checks += 1; print('PASS C4 double submit: one success, one PT409')
        ok(f"SELECT count(*)=1 FROM visitas_logs WHERE registro_consultor_id='{V(9)}';", 'C4 exactly one log')
        # C5 gate held > 3s -> bounded lock_timeout 55P03, no row change.
        p, send = session(); send("BEGIN; SELECT 1 FROM cf_user_guards_v1.state WHERE singleton FOR UPDATE;"); time.sleep(0.3)
        t0 = time.time(); r = sql(rpc(A, V(10), 3), False); dt = time.time() - t0
        send('ROLLBACK;'); p.stdin.close(); p.wait()
        if r.returncode == 0 or '55P03' not in r.stderr or not (2.5 < dt < 6): raise AssertionError(f'C5 {dt} {r.stderr}')
        checks += 1; print(f'PASS C5 gate wait bounded by lock_timeout 3s ({dt:.1f}s) 55P03')
        ok(f"SELECT status='finalizado' AND version=3 FROM registros_consultor WHERE id='{V(10)}';", 'C5 row unchanged')
        # Containment is deny-only and never restores 40001 baseline.
        sql((HERE / 'rollback-containment.sql.review').read_text())
        ok("SELECT NOT has_function_privilege('authenticated','public.rpc_enviar_visita_aprovacao(uuid,integer)','EXECUTE') AND position('40001' in pg_get_functiondef('public.rpc_enviar_visita_aprovacao(uuid,integer)'::regprocedure))=0;", 'containment deny-only, no 40001 restored')
        ok("SELECT has_function_privilege('service_role','public.rpc_enviar_visita_aprovacao(uuid,integer)','EXECUTE');", 'containment keeps service_role')
        print('TOTAL', checks, 'SYNTHETIC checks (not hosted JWT/RLS)')
    finally:
        if started: subprocess.run(prefix + ['pg_ctl', '-D', str(tmp / 'data'), 'stop', '-m', 'fast'], capture_output=True)
        shutil.rmtree(tmp, ignore_errors=True)

if __name__ == '__main__':
    main()
