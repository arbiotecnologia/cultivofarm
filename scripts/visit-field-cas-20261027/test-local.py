"""SYNTHETIC ONLY: disposable PostgreSQL, synthetic Auth (auth.uid() reads a harness GUC; the
candidate never uses GUCs for authorization) and reduced schema/stub helpers. Never connects to
hosted Supabase. Not JWT/RLS homologation."""
from pathlib import Path
import tempfile, subprocess, os, time, re
HERE = Path(__file__).resolve().parent
PORT = '55521'
A = 'aaaaaaaa-0000-4000-8000-00000000000a'    # consultor tenant A, creator, linked to CA
G = 'aaaaaaaa-0000-4000-8000-00000000000b'    # gestor tenant A, no link, not creator
ADM = 'aaaaaaaa-0000-4000-8000-00000000000c'  # administrador tenant A
R = 'aaaaaaaa-0000-4000-8000-00000000000d'    # consultor tenant A, responsavel only, no link
X = 'bbbbbbbb-0000-4000-8000-00000000000a'    # consultor tenant B
CA = 'cccccccc-0000-4000-8000-00000000000a'; CB = 'cccccccc-0000-4000-8000-00000000000b'
FA = 'dddddddd-0000-4000-8000-00000000000a'; FB = 'dddddddd-0000-4000-8000-00000000000b'
TA = 'eeeeeeee-0000-4000-8000-00000000000a'; TB = 'eeeeeeee-0000-4000-8000-00000000000b'; TI = 'eeeeeeee-0000-4000-8000-00000000000c'
CU = 'ffffffff-0000-4000-8000-00000000000a'; CI = 'ffffffff-0000-4000-8000-00000000000b'
K1 = '99999999-0000-4000-8000-000000000001'; K2 = '99999999-0000-4000-8000-000000000002'
V = lambda n: f'11111111-0000-4000-8000-{n:012d}'
checks = 0

def main():
    global checks
    tmp = Path(tempfile.mkdtemp(prefix='visit-field-', dir='/tmp')); tmp.chmod(0o777)
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
        if r.returncode == 0 or code not in r.stderr: raise AssertionError(label + ': ' + r.stdout + r.stderr)
        checks += 1; print('PASS', label, code)
    def pl(**kw):
        import json; return "'" + json.dumps(kw).replace("'", "''") + "'::jsonb"
    def rpc(actor, vid, ver, payload=None, key=K1):
        payload = payload or pl(fase_fenologica='V4')
        k = 'NULL' if key is None else f"'{key}'"
        return f"SET ROLE authenticated; SET test.actor='{actor}'; SELECT public.rpc_salvar_campo_visita('{vid}',{k},{payload},{ver})::text;"
    def bg(q):
        p = subprocess.Popen(base, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        p.stdin.write('\\set VERBOSITY verbose\n' + q); p.stdin.close(); return p
    def session():
        p = subprocess.Popen(base, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        def send(q): p.stdin.write(q + '\n'); p.stdin.flush()
        return p, send
    def wait_lock(n=1, timeout=10):
        t = time.time()
        while time.time() - t < timeout:
            if int(sql("SELECT count(*) FROM pg_stat_activity WHERE wait_event_type='Lock';").stdout.strip()) >= n: return
            time.sleep(0.05)
        raise AssertionError('expected waiting backend not observed')
    def mark(label):
        global checks; checks += 1; print('PASS', label)
    started = False
    try:
        subprocess.run(prefix + ['initdb', '-D', str(tmp / 'data'), '-A', 'trust', '-U', 'postgres'], check=True, capture_output=True)
        subprocess.run(prefix + ['pg_ctl', '-D', str(tmp / 'data'), '-l', str(tmp / 'log'), '-o', f'-k {tmp} -h "" -p {PORT}', 'start'], check=True, capture_output=True); started = True
        sql(f"""
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth; CREATE SCHEMA cf_user_guards_v1;
GRANT USAGE ON SCHEMA auth, cf_user_guards_v1 TO authenticated, anon;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('test.actor',true),'')::uuid$$;
CREATE TYPE app_role AS ENUM('administrador','gestor','consultor_tecnico');
CREATE TYPE status_registro_consultor AS ENUM('rascunho','em_andamento','finalizado','enviado_aprovacao');
CREATE TABLE cf_user_guards_v1.state(singleton boolean PRIMARY KEY, revision bigint); INSERT INTO cf_user_guards_v1.state VALUES(true,1);
CREATE TABLE actors(id uuid PRIMARY KEY, tenant text, ready boolean);
INSERT INTO actors VALUES('{A}','A',true),('{G}','A',true),('{ADM}','A',true),('{R}','A',true),('{X}','B',true);
CREATE TABLE user_roles(user_id uuid, role app_role);
INSERT INTO user_roles VALUES('{A}','consultor_tecnico'),('{G}','gestor'),('{ADM}','administrador'),('{R}','consultor_tecnico'),('{X}','consultor_tecnico');
CREATE TABLE clientes(id uuid PRIMARY KEY, tenant text); INSERT INTO clientes VALUES('{CA}','A'),('{CB}','B');
CREATE TABLE client_links(user_id uuid, cliente_id uuid, active boolean);
INSERT INTO client_links VALUES('{A}','{CA}',true),('{X}','{CB}',true);
CREATE TABLE fazendas(id uuid PRIMARY KEY, cliente_id uuid); INSERT INTO fazendas VALUES('{FA}','{CA}'),('{FB}','{CB}');
CREATE TABLE talhoes(id uuid PRIMARY KEY, fazenda_id uuid, ativo boolean); INSERT INTO talhoes VALUES('{TA}','{FA}',true),('{TB}','{FB}',true),('{TI}','{FA}',false);
CREATE TABLE culturas(id uuid PRIMARY KEY, ativo boolean); INSERT INTO culturas VALUES('{CU}',true),('{CI}',false);
CREATE TABLE registros_consultor(id uuid PRIMARY KEY, created_by uuid, consultor_responsavel uuid, cliente_id uuid,
  status status_registro_consultor);
CREATE TABLE visitas_campo(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), registro_consultor_id uuid NOT NULL UNIQUE REFERENCES registros_consultor(id) ON DELETE CASCADE,
  cliente_id uuid NOT NULL REFERENCES clientes(id), talhao_id uuid REFERENCES talhoes(id), cultura_id uuid REFERENCES culturas(id),
  area_avaliada_ha numeric, fase_fenologica text, estande_plantas_ha integer,
  uniformidade text CHECK (uniformidade IS NULL OR uniformidade IN ('baixa','media','alta')),
  observacoes_campo text, dados_extras jsonb NOT NULL DEFAULT '{{}}', client_uuid uuid, versao integer NOT NULL DEFAULT 1,
  created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE FUNCTION has_role(u uuid, r app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS
 $$SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=u AND role=r)$$;
CREATE FUNCTION has_active_user_cliente_access(u uuid, c uuid, caps text[]) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS
 $$SELECT EXISTS(SELECT 1 FROM public.client_links WHERE user_id=u AND cliente_id=c AND active)$$;
CREATE FUNCTION is_technical_visit_editable_status(s text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$SELECT s IN ('rascunho','em_andamento')$$;
-- Tenant-scoped canonical stub: actor ready AND same tenant AND (admin|gestor|linked consultor).
CREATE FUNCTION can_manage_technical_visit(u uuid, rid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS
 $$SELECT coalesce((SELECT ready FROM public.actors WHERE id=u),false) AND EXISTS(SELECT 1 FROM public.registros_consultor r JOIN public.clientes c ON c.id=r.cliente_id
   JOIN public.actors a ON a.id=u AND a.tenant=c.tenant WHERE r.id=rid AND (public.has_role(u,'administrador') OR public.has_role(u,'gestor')
   OR (public.has_role(u,'consultor_tecnico') AND (public.has_active_user_cliente_access(u,r.cliente_id,ARRAY['execute','manage']) OR r.consultor_responsavel=u))))$$;
CREATE FUNCTION update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN NEW.updated_at=now(); RETURN NEW; END$$;
CREATE TRIGGER trg_visitas_campo_updated_at BEFORE UPDATE ON visitas_campo FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
""")
        def reset():
            sql(f"TRUNCATE registros_consultor CASCADE; UPDATE actors SET ready=true; UPDATE client_links SET active=true; UPDATE talhoes SET ativo=(id<>'{TI}'); UPDATE culturas SET ativo=(id<>'{CI}');"
                + "INSERT INTO registros_consultor VALUES " + ",".join(f"('{V(i)}','{A}','{R}','{CA}','em_andamento')" for i in range(1, 30))
                + f",('{V(80)}','{A}','{R}','{CA}','finalizado'),('{V(90)}','{X}','{X}','{CB}','rascunho');")
        # ---------- PRE: live baseline body + live trigger shape reproduce the defects.
        sql((HERE / 'baseline.sql').read_text())
        sql("CREATE TRIGGER trg_visitas_campo_guard BEFORE UPDATE ON visitas_campo FOR EACH ROW EXECUTE FUNCTION visitas_campo_guard();")
        sql("REVOKE ALL ON FUNCTION public.rpc_salvar_campo_visita(uuid,uuid,jsonb,integer) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.rpc_salvar_campo_visita(uuid,uuid,jsonb,integer) TO service_role; GRANT EXECUTE ON FUNCTION public.rpc_salvar_campo_visita(uuid,uuid,jsonb,integer) TO authenticated;")
        reset()
        sql(f"INSERT INTO user_roles VALUES('{X}','administrador');")  # tenant-B global admin role
        ok(rpc(X, V(1), 0) + f"RESET ROLE; SELECT count(*)=1 FROM visitas_campo WHERE registro_consultor_id='{V(1)}';", 'PRE baseline: tenant-B admin writes tenant-A visit (defect reproduced)')
        ok(rpc(A, V(1), 99) + f"RESET ROLE; SELECT versao=2 FROM visitas_campo WHERE registro_consultor_id='{V(1)}';", 'PRE baseline: future CAS 99 accepted (defect reproduced)')
        ok(rpc(A, V(1), None if False else 'NULL') + "RESET ROLE; SELECT true;", 'PRE baseline: NULL CAS on update not rejected? (see next)') if False else None
        sql(f"DELETE FROM user_roles WHERE user_id='{X}' AND role='administrador';")
        # ---------- Candidate (DO $pre$ pins LIVE hashes -> stripped on synthetic schema; preflight covers hosted).
        cand = (HERE / 'candidate.sql.review').read_text()
        sql(re.sub(r'DO \$pre\$.*?\$pre\$;', '', cand, flags=re.S))
        mark('candidate installs; in-migration DO $post$ ACL/owner assertion passed')
        ok("SELECT proconfig::text='{search_path=public,lock_timeout=3s}' AND prosecdef FROM pg_proc WHERE oid='public.rpc_salvar_campo_visita(uuid,uuid,jsonb,integer)'::regprocedure;", 'definer + search_path + lock_timeout 3s')
        ok("SELECT NOT has_function_privilege('anon','public.rpc_salvar_campo_visita(uuid,uuid,jsonb,integer)','EXECUTE');", 'anon cannot execute')
        ok("SELECT tgtype & 4 = 4 AND tgtype & 16 = 16 FROM pg_trigger WHERE tgname='trg_visitas_campo_guard';", 'guard trigger is BEFORE INSERT OR UPDATE')
        print('HASH rpc', sql("SELECT md5(pg_get_functiondef('public.rpc_salvar_campo_visita(uuid,uuid,jsonb,integer)'::regprocedure));").stdout.strip())
        print('HASH guard', sql("SELECT md5(pg_get_functiondef('public.visitas_campo_guard()'::regprocedure));").stdout.strip())
        reset()
        row = lambda vid: f"RESET ROLE; SELECT versao FROM visitas_campo WHERE registro_consultor_id='{vid}';"
        snap = lambda vid: sql(f"SELECT coalesce(md5(row(v.*)::text),'none') FROM visitas_campo v WHERE registro_consultor_id='{vid}' UNION ALL SELECT 'none' LIMIT 1;").stdout.strip()
        # ---------- Positives / initial contract
        ok(rpc(A, V(1), 0, pl(talhao_id=TA, cultura_id=CU, area_avaliada_ha='12.5', estande_plantas_ha='60000', uniformidade='alta')) + f"RESET ROLE; SELECT versao=1 AND created_by='{A}' AND cliente_id='{CA}' FROM visitas_campo WHERE registro_consultor_id='{V(1)}';", 'insert v0->1, cliente derived from visit')
        ok(rpc(A, V(1), 1, pl(talhao_id=TA, fase_fenologica='V5')) + row(V(1)).replace('SELECT versao', 'SELECT versao=2'), 'update CAS 1->2')
        ok(rpc(A, V(1), 2) + row(V(1)).replace('SELECT versao', 'SELECT versao=3'), 'update CAS 2->3 (N, N+1, N+2)')
        ok(rpc(ADM, V(2), 0) + "RESET ROLE; SELECT true;", 'tenant-A admin positive (original scope)')
        ok(rpc(X, V(90), 0) + "RESET ROLE; SELECT true;", 'tenant B own positive')
        out = sql(rpc(A, V(1), 3)).stdout
        if '"replayed": false' not in out or '"registro_consultor_id"' not in out: raise AssertionError(out)
        mark('envelope has id/registro/versao/client_uuid/replayed')
        # ---------- Idempotent initial replay
        ok(rpc(A, V(3), 0, pl(fase_fenologica='R1'), K2) + "RESET ROLE; SELECT true;", 'insert for replay')
        out = sql(rpc(A, V(3), 0, pl(fase_fenologica='R1'), K2)).stdout
        if '"replayed": true' not in out or '"versao": 1' not in out: raise AssertionError(out)
        mark('lost-response replay same actor/key/content returns v1 replayed=true, no write')
        ok(f"SELECT versao=1 FROM visitas_campo WHERE registro_consultor_id='{V(3)}';", 'replay did not bump version')
        err(rpc(A, V(3), 0, pl(fase_fenologica='R2'), K2), 'PT409', 'replay with different content PT409')
        err(rpc(A, V(3), 0, pl(fase_fenologica='R1'), K1), 'PT409', 'replay with other client_uuid PT409')
        err(rpc(A, V(3), 0, pl(fase_fenologica='R1'), None), 'PT409', 'replay without client_uuid PT409')
        err(rpc(ADM, V(3), 0, pl(fase_fenologica='R1'), K2), 'PT409', 'replay by other actor PT409 (no adoption)')
        err(rpc(X, V(3), 0, pl(fase_fenologica='R1'), K2), '42501', 'replay across tenant denied before any data')
        # ---------- CAS negatives (row unchanged)
        s1 = snap(V(1))
        for ver, label in (('NULL', 'NULL CAS'), ('-1', 'negative CAS'), ('3', 'stale CAS'), ('5', 'future CAS'), ('0', 'zero CAS on existing row')):
            err(rpc(A, V(1), ver), 'PT409', label + ' PT409')
        err(rpc(A, V(4), 1), 'PT409', 'positive CAS without row PT409 (no invented insert)')
        ok(f"SELECT count(*)=0 FROM visitas_campo WHERE registro_consultor_id='{V(4)}';", 'no row created')
        # ---------- Authorization / tenant
        err(rpc(X, V(1), 4), '42501', 'cross-tenant B->A denied')
        err(rpc(A, V(90), 0), '42501', 'cross-tenant A->B denied')
        err(rpc(A, V(99), 0), '42501', 'nonexistent visit same generic 42501')
        sql(f"INSERT INTO user_roles VALUES('{X}','administrador');")
        err(rpc(X, V(1), 4), '42501', 'tenant-B global admin denied on tenant A (critical defect closed)')
        sql(f"DELETE FROM user_roles WHERE user_id='{X}' AND role='administrador';")
        err(rpc(G, V(1), 4), '42501', 'gestor without creator/link keeps original restriction (no widening)')
        err(rpc(R, V(1), 4), '42501', 'responsavel-only consultor without link not added (original scope)')
        sql(f"INSERT INTO registros_consultor VALUES('{V(95)}',NULL,NULL,'{CA}','em_andamento');")
        err(rpc(G, V(95), 0), '42501', 'NULL created_by + gestor no link denied (NULL never authorizes)')
        err(f"SET ROLE authenticated; RESET test.actor; SELECT public.rpc_salvar_campo_visita('{V(1)}','{K1}','{{}}'::jsonb,4);", '42501', 'unauthenticated')
        err(f"SET ROLE anon; SET test.actor='{A}'; SELECT public.rpc_salvar_campo_visita('{V(1)}','{K1}','{{}}'::jsonb,4);", '42501', 'anon EXECUTE denied')
        sql(f"UPDATE client_links SET active=false WHERE user_id='{A}';"); err(rpc(A, V(1), 4), '42501', 'revoked client link denied'); sql("UPDATE client_links SET active=true;")
        sql(f"UPDATE actors SET ready=false WHERE id='{A}';"); err(rpc(A, V(1), 4), '42501', 'inactive actor denied'); sql("UPDATE actors SET ready=true;")
        err(rpc(A, V(80), 0), 'PT409', 'finalized visit visita_locked PT409')
        # ---------- References / payload
        err(rpc(A, V(1), 4, pl(talhao_id=TB)), '22023', 'talhão of other cliente rejected')
        err(rpc(A, V(1), 4, pl(talhao_id=TI)), '22023', 'new inactive talhão rejected')
        err(rpc(A, V(1), 4, pl(cultura_id=CI)), '22023', 'new inactive cultura rejected')
        err(rpc(A, V(1), 4, pl(talhao_id='not-a-uuid')), '22023', 'malformed uuid rejected')
        err(rpc(A, V(1), 4, pl(estande_plantas_ha='1.5')), '22023', 'fractional estande rejected')
        err(rpc(A, V(1), 4, pl(area_avaliada_ha='-1')), '22023', 'negative area rejected')
        err(rpc(A, V(1), 4, pl(uniformidade='x')), '22023', 'invalid uniformidade rejected')
        err(rpc(A, V(1), 4, "'[]'::jsonb"), '22023', 'non-object payload rejected')
        ok(f"SELECT coalesce(md5(row(v.*)::text),'none')='{s1}' FROM visitas_campo v WHERE registro_consultor_id='{V(1)}';", 'all negatives atomic (row unchanged)')
        ok(rpc(A, V(5), 0, pl(talhao_id=TA, cultura_id=CU)) + "RESET ROLE; SELECT true;", 'save with active refs')
        sql(f"UPDATE talhoes SET ativo=false WHERE id='{TA}'; UPDATE culturas SET ativo=false WHERE id='{CU}';")
        ok(rpc(A, V(5), 1, pl(talhao_id=TA, cultura_id=CU, fase_fenologica='V6')) + row(V(5)).replace('SELECT versao', 'SELECT versao=2'), 'already-saved inactive refs may be kept unchanged')
        sql("UPDATE talhoes SET ativo=true; UPDATE culturas SET ativo=true;")
        # ---------- Guard direct writers
        err(f"UPDATE visitas_campo SET versao=versao+2 WHERE registro_consultor_id='{V(1)}';", 'PT409', 'guard: version jump PT409')
        err(f"UPDATE visitas_campo SET versao=versao WHERE registro_consultor_id='{V(1)}';", 'PT409', 'guard: same version PT409')
        err(f"UPDATE visitas_campo SET versao=versao-1 WHERE registro_consultor_id='{V(1)}';", 'PT409', 'guard: regression PT409')
        err(f"UPDATE visitas_campo SET versao=NULL WHERE registro_consultor_id='{V(1)}';", '23502', 'guard/NOT NULL: null version rejected')
        err(f"INSERT INTO visitas_campo(registro_consultor_id,cliente_id,created_by,versao) VALUES('{V(6)}','{CA}','{A}',5);", 'PT409', 'guard: insert with versao<>1 PT409')
        err(f"UPDATE visitas_campo SET cliente_id='{CB}', versao=versao+1 WHERE registro_consultor_id='{V(1)}';", '42501', 'guard: immutable cliente_id preserved')
        err(f"UPDATE visitas_campo SET client_uuid='{K2}', versao=versao+1 WHERE registro_consultor_id='{V(1)}';", '42501', 'guard: immutable client_uuid preserved')
        # ---------- Concurrency (real connections; waits observed via pg_stat_activity)
        # C1 two writers with same version: second waits on parent, then PT409 (no lost update).
        p, send = session(); send(f"BEGIN; SET ROLE authenticated; SET test.actor='{A}'; SELECT public.rpc_salvar_campo_visita('{V(7)}','{K1}',{pl(fase_fenologica='W1')},0);")
        time.sleep(0.4)
        q = bg(rpc(A, V(7), 0, pl(fase_fenologica='W2'))); wait_lock(1)
        send('COMMIT;'); p.stdin.close(); p.wait(); q.wait(); e = q.stderr.read()
        if q.returncode == 0 or 'PT409' not in e: raise AssertionError('C1 ' + e)
        mark('C1 concurrent initial insert, different content: loser waits then PT409')
        ok(f"SELECT fase_fenologica='W1' AND versao=1 FROM visitas_campo WHERE registro_consultor_id='{V(7)}';", 'C1 winner preserved')
        p, send = session(); send(f"BEGIN; SET ROLE authenticated; SET test.actor='{A}'; SELECT public.rpc_salvar_campo_visita('{V(7)}','{K1}',{pl(fase_fenologica='U1')},1);")
        time.sleep(0.4)
        q = bg(rpc(A, V(7), 1, pl(fase_fenologica='U2'))); wait_lock(1)
        send('COMMIT;'); p.stdin.close(); p.wait(); q.wait(); e = q.stderr.read()
        if q.returncode == 0 or 'PT409' not in e: raise AssertionError('C1b ' + e)
        mark('C1b concurrent updates same CAS: second PT409, no lost update')
        ok(f"SELECT fase_fenologica='U1' AND versao=2 FROM visitas_campo WHERE registro_consultor_id='{V(7)}';", 'C1b winner preserved')
        # C2 revocation commits FIRST holding gate -> operation waiting at gate denied.
        p, send = session(); send(f"BEGIN; SELECT 1 FROM cf_user_guards_v1.state WHERE singleton FOR UPDATE; UPDATE client_links SET active=false WHERE user_id='{A}';")
        time.sleep(0.3); q = bg(rpc(A, V(8), 0)); wait_lock(1)
        send('COMMIT;'); p.stdin.close(); p.wait(); q.wait(); e = q.stderr.read()
        if q.returncode == 0 or '42501' not in e: raise AssertionError('C2 ' + e)
        mark('C2 revocation committed first at gate -> operation denied after gate wait 42501')
        sql("UPDATE client_links SET active=true;")
        ok(f"SELECT count(*)=0 FROM visitas_campo WHERE registro_consultor_id='{V(8)}';", 'C2 nothing written')
        # C3 revocation commits while operation waits on PARENT row lock -> post-lock re-auth denies.
        p, send = session(); send(f"BEGIN; SELECT 1 FROM registros_consultor WHERE id='{V(9)}' FOR UPDATE;"); time.sleep(0.3)
        q = bg(rpc(A, V(9), 0)); wait_lock(1)
        sql(f"UPDATE client_links SET active=false WHERE user_id='{A}';")
        send('COMMIT;'); p.stdin.close(); p.wait(); q.wait(); e = q.stderr.read()
        if q.returncode == 0 or '42501' not in e: raise AssertionError('C3 ' + e)
        mark('C3 revocation committed during parent-row wait -> re-authorization denies 42501')
        sql("UPDATE client_links SET active=true;")
        # C4 operation holds gate (waiting on row); gate-taking revocation queues BEHIND -> operation commits first.
        p, send = session(); send(f"BEGIN; SELECT 1 FROM registros_consultor WHERE id='{V(10)}' FOR UPDATE;"); time.sleep(0.3)
        q = bg(rpc(A, V(10), 0)); wait_lock(1)
        r_, rsend = session(); rsend(f"BEGIN; SELECT 1 FROM cf_user_guards_v1.state WHERE singleton FOR UPDATE; UPDATE client_links SET active=false WHERE user_id='{A}'; COMMIT;")
        wait_lock(2)
        send('COMMIT;'); p.stdin.close(); p.wait(); q.wait(); r_.stdin.close(); r_.wait()
        if q.returncode != 0: raise AssertionError('C4 ' + q.stderr.read())
        mark('C4 operation already past gate commits BEFORE queued revocation (NOT a revocation win)')
        err(rpc(A, V(10), 1), '42501', 'C4 after revocation commit: next call denied')
        sql("UPDATE client_links SET active=true;")
        # C5 bounded wait: foreign lock on parent > 3s -> lock_timeout 55P03, nothing written.
        p, send = session(); send(f"BEGIN; SELECT 1 FROM registros_consultor WHERE id='{V(11)}' FOR UPDATE;"); time.sleep(0.3)
        t0 = time.time(); r = sql(rpc(A, V(11), 0), False); dt = time.time() - t0
        send('ROLLBACK;'); p.stdin.close(); p.wait()
        if r.returncode == 0 or '55P03' not in r.stderr or not (2.5 < dt < 6): raise AssertionError(f'C5 {dt} {r.stderr}')
        mark(f'C5 lock_timeout bounded at ~3s ({dt:.2f}s) 55P03')
        # C6 out-of-scope actor never waits on the parent row.
        p, send = session(); send(f"BEGIN; SELECT 1 FROM registros_consultor WHERE id='{V(12)}' FOR UPDATE;"); time.sleep(0.3)
        t0 = time.time(); r = sql(rpc(X, V(12), 0), False); dt = time.time() - t0
        send('ROLLBACK;'); p.stdin.close(); p.wait()
        if r.returncode == 0 or '42501' not in r.stderr or dt > 1.5: raise AssertionError(f'C6 {dt} {r.stderr}')
        mark(f'C6 cross-tenant actor denied without waiting on row ({dt:.2f}s)')
        # ---------- Containment
        sql((HERE / 'rollback-containment.sql.review').read_text())
        err(rpc(A, V(1), 4), '42501', 'containment: authenticated EXECUTE revoked')
        ok("SELECT tgtype & 4 = 4 FROM pg_trigger WHERE tgname='trg_visitas_campo_guard';", 'containment keeps strict guard')
        print(f'TOTAL {checks} synthetic checks PASS')
    finally:
        if started: subprocess.run(prefix + ['pg_ctl', '-D', str(tmp / 'data'), 'stop', '-m', 'fast'], capture_output=True)

if __name__ == '__main__':
    main()
