"""Disposable local PostgreSQL with captured real STABLE helper bodies, real lotes/OS/programming
triggers and refresh views (reused from os-programming-recovery). Auth UID/JWT transport is
synthetic: this is NOT hosted JWT/RLS certification nor browser proof."""
from pathlib import Path
import json, subprocess, tempfile, os, shutil, time, importlib.util, sys
H = Path(__file__).resolve().parent
P_DIR = H.parent / 'os-programming-recovery'
spec = importlib.util.spec_from_file_location('prog_real', P_DIR / 'test-real-local.py')
prog = importlib.util.module_from_spec(spec); spec.loader.exec_module(prog)
q = prog.q
A, B, U, C, P, O, PP, V, F, M, PLAN, SUB = [q(n) for n in range(1, 13)]
U2, OB, PPB, F2 = q(31), q(32), q(33), q(34)
SIG = "'public.rpc_cockpit_gerar_lote_v1(uuid,uuid,text,jsonb)'::regprocedure"
LOT_TRG = """CREATE OR REPLACE FUNCTION platform_private.trg_lab_lot_biological_only()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF TG_OP='UPDATE' AND NEW.produto_id IS NOT DISTINCT FROM OLD.produto_id
                    AND NEW.microrganismo_id IS NOT DISTINCT FROM OLD.microrganismo_id THEN RETURN NEW; END IF;
  PERFORM platform_private.lab_assert_manufacturable(NEW.produto_id,NEW.microrganismo_id);
  RETURN NEW;
END $function$;
"""


def setup():
    c = json.loads((H / 'catalog.json').read_text()); assert c['ref'] == 'swzpzcwiasxmjutrmvkm'
    s = prog.setup()
    # Second entitled feature required by the real lotes SaaS trigger.
    s = s.replace("'[\"ordens_producao\"]'", "'[\"ordens_producao\",\"lotes_qualidade\"]'")
    s += f"INSERT INTO saas_features(id,module_id,key,name) VALUES({F2},{M},'lotes_qualidade','local'); INSERT INTO saas_plan_version_features(plan_version_id,feature_id,enabled) VALUES({V},{F2},true);\n"
    s += LOT_TRG
    s += "CREATE UNIQUE INDEX IF NOT EXISTS idx_lotes_programacao_id_unique ON public.lotes USING btree (programacao_id) WHERE (programacao_id IS NOT NULL);\n"
    s += "DO $$BEGIN IF to_regclass('public.lotes_codigo_lote_key') IS NULL THEN CREATE UNIQUE INDEX lotes_codigo_lote_key ON public.lotes USING btree (codigo_lote); END IF; END$$;\n"
    s += "DO $$BEGIN IF to_regclass('public.lotes_pkey') IS NULL THEN ALTER TABLE public.lotes ADD PRIMARY KEY (id); END IF; END$$;\n"
    s += "ALTER TABLE public.lotes ALTER COLUMN id SET DEFAULT gen_random_uuid(); ALTER TABLE public.lotes ALTER COLUMN status SET DEFAULT 'em_producao'; ALTER TABLE public.lotes ALTER COLUMN data_producao SET DEFAULT CURRENT_DATE;\n"
    for _, _, _, d in c['lot_triggers']:
        s += d + ';\n'
    # Tenant B manual OS, programmed fixture child, plus a second user in B.
    s += f"INSERT INTO auth.users VALUES({U2}); INSERT INTO profiles(user_id,organization_id) VALUES({U2},{B}); INSERT INTO user_roles(user_id,role) VALUES({U2},'administrador');\n"
    s += (H / 'rollback/rpc.sql.review').read_text()
    return s


def main():
    tmp = Path(tempfile.mkdtemp(prefix='lot-real-', dir='/tmp')); tmp.chmod(0o777)
    pre = ['setpriv', '--reuid=1000', '--regid=1000', '--clear-groups'] if os.getuid() == 0 else []
    started = False; results = []
    try:
        subprocess.run(pre + ['initdb', '-D', str(tmp / 'data'), '-A', 'trust', '-U', 'postgres'], check=True, capture_output=True)
        subprocess.run(pre + ['pg_ctl', '-D', str(tmp / 'data'), '-l', str(tmp / 'log'), '-o', f'-k {tmp} -h "" -p 55497', 'start', '-w'], check=True, capture_output=True); started = True
        conn = ['psql', '-X', '-h', str(tmp), '-p', '55497', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At']

        def run(sql, ok=True):
            r = subprocess.run(conn, input=sql, capture_output=True, text=True)
            if ok and r.returncode: raise AssertionError(r.stdout[-800:] + r.stderr[-3000:])
            return r
        actor = lambda u=U: f"SELECT set_config('request.jwt.claim.sub',{u},false),set_config('request.jwt.claims','{{\"iat\":2000000000}}',false);"
        md5 = lambda: run(f"SELECT md5(pg_get_functiondef({SIG})),proacl::text FROM pg_proc WHERE oid={SIG};").stdout.strip()

        def build():
            run(setup())
            # Fixture reaches 'programada' only through the real reviewed programming RPC.
            out = run(actor() + f"SELECT public.rpc_programar_os_v1({O},'manual','2026-10-19')->>'success';").stdout
            assert out.strip().endswith('true'), out
        build()
        assert md5().startswith('d37a0e478e01277ba61f70397b1d44f9'), md5()
        results.append('captured baseline reproduces hosted pg_get_functiondef d37a0e47 before assembly')
        run((H / 'rpc.sql.review').read_text())
        post = md5().split('|')[0]
        if '--generate-hashes' in sys.argv:
            (H / 'post-hashes.json').write_text(json.dumps({'public.rpc_cockpit_gerar_lote_v1(uuid,uuid,text,jsonb)': post}, indent=2) + '\n')
        else:
            assert json.loads((H / 'post-hashes.json').read_text())['public.rpc_cockpit_gerar_lote_v1(uuid,uuid,text,jsonb)'] == post, 'POST_HASH_DRIFT'
        spec2 = importlib.util.spec_from_file_location('lot_assemble', H / 'assemble.py')
        asm = importlib.util.module_from_spec(spec2); spec2.loader.exec_module(asm); asm.main()
        for line in asm.guard(True).splitlines()[1:-1]:
            if line.strip().startswith('IF '):
                run('SELECT ' + line.strip()[3:].split(' THEN RAISE EXCEPTION')[0] + ';')
        results.append('every guard predicate compiles and evaluates locally')
        call = lambda body='{"volume_produzido":100}', pp=PP, os_=O, origem='manual': f"public.rpc_cockpit_gerar_lote_v1({pp},{os_},'{origem}','{body}'::jsonb)"

        def denied(label, expr, code='42501'):
            r = run(actor() + f"SELECT {expr};", False)
            assert r.returncode and ('COCKPIT_LOTE' in r.stderr), (label, r.stderr[-500:])
            results.append(label)

        def falsy(label, expr, u=U):
            out = run(actor(u) + f"SELECT ({expr})->>'success';").stdout.strip().splitlines()[-1]
            assert out == 'false', (label, out); results.append(label)

        def tx_deny(label, change):
            r = run(f"BEGIN;{change}" + actor() + f"SELECT {call()};ROLLBACK;", False)
            assert r.returncode and 'COCKPIT_LOTE_SCOPE_DENIED' in r.stderr, (label, r.stderr[-500:])
            assert run("SELECT count(*) FROM lotes;").stdout.strip() == '0'; results.append(label)
        tx_deny('revoked profile denied (no lot)', f"UPDATE profiles SET ativo=false WHERE user_id={U};")
        tx_deny('role removed denied', f"DELETE FROM user_roles WHERE user_id={U};")
        tx_deny('operador_onfarm only denied (old global-role assert not copied)', f"DELETE FROM user_roles WHERE user_id={U}; INSERT INTO user_roles(user_id,role) VALUES({U},'operador_onfarm');")
        tx_deny('financeiro only denied', f"DELETE FROM user_roles WHERE user_id={U}; INSERT INTO user_roles(user_id,role) VALUES({U},'financeiro');")
        tx_deny('subscription expired denied', f"UPDATE organization_subscriptions SET status='EXPIRED' WHERE id={SUB};")
        tx_deny('lotes_qualidade feature off denied', f"UPDATE saas_plan_version_features SET enabled=false WHERE feature_id={F2}; UPDATE saas_plan_versions SET features_snapshot='[\"ordens_producao\"]' WHERE id={V};")
        tx_deny('organization inactive denied', f"UPDATE organizations SET ativo=false WHERE id={A};")
        tx_deny('tenant A->B switch denied', f"UPDATE profiles SET organization_id={B} WHERE user_id={U};")
        r = run(f"SELECT set_config('request.jwt.claims','{{}}',false),set_config('request.jwt.claim.sub',{U},false); SELECT {call()};", False)
        assert r.returncode and 'SCOPE_DENIED' in r.stderr; results.append('JWT without iat denied')
        r = run(f"SELECT {call()};", False); assert r.returncode and 'SCOPE_DENIED' in r.stderr; results.append('anonymous (no uid) denied')
        r = run(actor(U2) + f"SELECT {call()};", False); assert r.returncode and 'SCOPE_DENIED' in r.stderr, r.stderr; results.append('foreign tenant actor denied with same error')
        denied('unknown programacao id denied', call(pp=q(99)))
        denied('unknown OS id denied', call(os_=q(98)))
        falsy('onfarm origin closed', call(origem='onfarm'))
        falsy('b2b origin closed', call(origem='b2b'))
        denied('codigo_lote rejected', call('{"volume_produzido":100,"codigo_lote":"LT-2026-9999"}'))
        denied('produto_id key rejected', call('{"volume_produzido":100,"produto_id":"x"}'))
        denied('organization_id key rejected', call('{"volume_produzido":100,"organization_id":"x"}'))
        denied('data_producao key rejected', call('{"volume_produzido":100,"data_producao":"2020-01-01"}'))
        for bad in ['0', '-1', '"100"', 'null', '1e12', '0.0001']:
            denied('volume rejected ' + bad, call('{"volume_produzido":%s}' % bad))
        denied('non-string tanque rejected', call('{"volume_produzido":100,"tanque":5}'))
        def closed(change):
            r = run(f"BEGIN; {change}" + actor() + f"SELECT ({call()})->>'success'; ROLLBACK;", False)
            assert (r.returncode and 'COCKPIT_LOTE' in r.stderr) or (r.returncode == 0 and 'false' in r.stdout.splitlines()[-2:][0]), (r.stdout[-300:], r.stderr[-300:])
            assert run("SELECT count(*) FROM lotes;").stdout.strip() == '0'
        closed(f"UPDATE programacao_producao SET responsavel_id=(SELECT id FROM profiles WHERE user_id={U}) WHERE id={PP};")
        results.append('non-null responsible stays closed')
        closed(f"UPDATE clientes SET organization_id={B} WHERE id={C};")
        results.append('delivery category client tenant mismatch rejected before lot')
        closed(f"UPDATE programacao_producao SET organization_id={B} WHERE id={PP};")
        results.append('programming tenant mismatch denied')
        closed(f"UPDATE programacao_producao SET volume_necessario=101 WHERE id={PP};")
        results.append('canonical programmed volume must match OS 100 mL')
        closed(f"UPDATE programacao_producao SET produto_id=NULL WHERE id={PP};")
        results.append('canonical item mismatch denied')
        closed(f"INSERT INTO production_order_link(id,ordem_servico_id,partner_order_id,partner_order_item_id,planning_id) VALUES({q(91)},{O},{q(82)},{q(83)},{q(84)});")
        results.append('B2B production link stays closed')
        closed(f"UPDATE produtos SET familia_catalogo='quimico' WHERE id={P};")
        results.append('non-manufacturable product closed')
        assert run("SELECT count(*) FROM lotes;").stdout.strip() == '0'
        events0 = int(run("SELECT count(*) FROM laboratorio_esteira_eventos;").stdout.strip())
        out = json.loads(run(actor() + f"SELECT {call(body='{\"volume_produzido\":100,\"tanque\":\" TQ-01 \"}')};").stdout.strip().splitlines()[-1])
        assert out['success'] is True and out['replay'] is False and out['codigo_lote'].startswith('LT-'), out
        results.append('manual programmed OS generates one lot (server code)')
        row = run(f"SELECT volume_produzido,organization_id={A},tanque,status,(SELECT status FROM ordens_servico WHERE id={O}),(SELECT status FROM programacao_producao WHERE id={PP}),(SELECT count(*) FROM controle_qualidade) FROM lotes;").stdout.strip()
        assert row == '100|t|TQ-01|em_producao|programada|aguardando|0', row
        results.append('lot in mL, tenant A, OS/programming not advanced, no CQ created')
        assert int(run("SELECT count(*) FROM laboratorio_esteira_eventos WHERE acao='gerar_lote';").stdout.strip()) == 1
        assert run(f"SELECT EXISTS(SELECT 1 FROM mv_esteira_laboratorio WHERE os_id={O} AND codigo_lote IS NOT NULL);").stdout.strip() == 't'
        results.append('exactly one event; real MV refresh reflects lot')
        out = json.loads(run(actor() + f"SELECT {call(body='{\"volume_produzido\":100,\"tanque\":\"TQ-01\"}')};").stdout.strip().splitlines()[-1])
        assert out['success'] is True and out['replay'] is True; results.append('identical replay returns same lot, no write')
        r=run(actor(U2)+f'SELECT {call()};',False)
        assert r.returncode and 'SCOPE_DENIED' in r.stderr; results.append('tenant B cannot replay tenant A lot')
        r=run('BEGIN;'+f'DELETE FROM user_roles WHERE user_id={U};'+actor()+f'SELECT {call()};ROLLBACK;',False)
        assert r.returncode and 'SCOPE_DENIED' in r.stderr; results.append('revoked actor cannot replay existing lot')
        r=run('BEGIN;'+f'UPDATE laboratorio_esteira_eventos SET usuario_id={U2} WHERE acao=\'gerar_lote\';'+actor()+f"SELECT ({call(body='{\"volume_produzido\":100,\"tanque\":\"TQ-01\"}')})->>'success';ROLLBACK;")
        assert 'false' in r.stdout; results.append('receipt actor mismatch refuses replay without repair')
        falsy('divergent replay (volume) denied', call(body='{"volume_produzido":200,"tanque":"TQ-01"}'))
        falsy('divergent replay (tanque) denied', call(body='{"volume_produzido":100}'))
        assert run("SELECT count(*) FROM lotes;").stdout.strip() == '1'
        assert int(run("SELECT count(*) FROM laboratorio_esteira_eventos WHERE acao='gerar_lote';").stdout.strip()) == 1
        results.append('replays wrote nothing')
        # Rollback/candidate files: intact guards refuse incomplete clone, no definition/ACL change.
        for name in ['preflight-readonly.sql', 'candidate.sql.review', 'postflight-readonly.sql', 'rollback.sql.review']:
            before = md5(); r = run((H / name).read_text(), False)
            assert r.returncode and ('DRIFT' in r.stderr or 'WRONG_PROJECT' in r.stderr or 'fiscal_environment_marker' in r.stderr), r.stderr[-400:]
            assert md5() == before; results.append('intact ' + name + ' fails closed on local clone without changes')
        run((H / 'rollback/rpc.sql.review').read_text() + asm.ROLL_ACL)
        assert md5() == 'd37a0e478e01277ba61f70397b1d44f9|{postgres=X/postgres,service_role=X/postgres}', md5()
        results.append('self-contained rollback restores exact baseline md5 and ACL (no TEMP)')
        run((H / 'rpc.sql.review').read_text() + asm.CAND_ACL)
        assert md5() == post + '|{postgres=X/postgres,authenticated=X/postgres}', md5()
        results.append('candidate ACL exactly postgres+authenticated')

        # Concurrency on fresh fixtures, real triggers, two connections.
        def reset():
            run('DROP SCHEMA public CASCADE; DROP SCHEMA auth CASCADE; DROP SCHEMA private CASCADE; DROP SCHEMA platform_private CASCADE; CREATE SCHEMA public; DROP ROLE anon; DROP ROLE authenticated; DROP ROLE service_role;')
            build(); run((H / 'rpc.sql.review').read_text())

        def start(sql):
            p = subprocess.Popen(conn, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            p.stdin.write(sql); p.stdin.close(); p.stdin = None; return p
        reset()
        a = start(actor() + 'BEGIN; SELECT ' + call() + '; SELECT pg_sleep(1); COMMIT;')
        time.sleep(0.3); b = start(actor() + 'SELECT ' + call() + ';')
        outs = [a.communicate(timeout=20), b.communicate(timeout=20)]
        assert a.returncode == b.returncode == 0, outs
        j = ''.join(o[0] for o in outs); assert j.count('"replay": false') == 1 and j.count('"replay": true') == 1, j
        assert run("SELECT count(*) FROM lotes;").stdout.strip() == '1'; results.append('two connections: one write, one identical replay')
        for name, change in [('profile', f'UPDATE profiles SET ativo=false WHERE user_id={U};'), ('role', f'DELETE FROM user_roles WHERE user_id={U};'), ('subscription', f"UPDATE organization_subscriptions SET status='EXPIRED' WHERE id={SUB};"), ('tenant', f'UPDATE profiles SET organization_id={B} WHERE user_id={U};')]:
            reset()
            holder = start(f"SET application_name='holder'; BEGIN; SELECT 1 FROM ordens_servico WHERE id={O} FOR UPDATE; {change} SELECT pg_sleep(1.2); COMMIT;")
            time.sleep(0.4); req = start(actor() + 'SELECT ' + call() + ';')
            ho = holder.communicate(timeout=20); ro = req.communicate(timeout=20)
            assert holder.returncode == 0, ho
            assert req.returncode and 'COCKPIT_LOTE_SCOPE_DENIED' in ro[1], (name, ro)
            assert run("SELECT count(*) FROM lotes;").stdout.strip() == '0'
            results.append('revocation committed while request waits on lock -> denied after locks (' + name + ')')
        # Actual SQL role authenticated exercises only RPC grants, without auxiliary table grants.
        reset(); run(asm.CAND_ACL + 'GRANT USAGE ON SCHEMA public TO authenticated;')
        out=run(actor()+'SET ROLE authenticated; SELECT '+call()+';')
        assert '"success": true' in out.stdout; results.append('authenticated invokes DEFINER without auxiliary table grants (local synthetic Auth)')
        out=run(actor()+'SET ROLE anon; SELECT '+call()+';',False)
        assert out.returncode and 'permission denied' in out.stderr; results.append('anon has no executable RPC')
        # Positive same-tenant B fixture is built locally, never via hosted data bypass.
        reset()
        run(f'UPDATE profiles SET organization_id={B} WHERE user_id={U}; UPDATE organizations SET id=id WHERE id={B}; INSERT INTO organization_subscriptions(id,organization_id,plan_id,plan_version_id,status) VALUES({q(35)},{B},{PLAN},{V},\'ACTIVE\'); UPDATE clientes SET organization_id={B} WHERE id={C}; UPDATE fazendas SET organization_id={B} WHERE cliente_id={C}; UPDATE talhoes SET organization_id={B} WHERE fazenda_id={q(21)};')
        # Existing protected structural fields forbid rewriting live OS; new disposable fixture uses the setup before triggers.
        run('DROP SCHEMA public CASCADE; DROP SCHEMA auth CASCADE; DROP SCHEMA private CASCADE; DROP SCHEMA platform_private CASCADE; CREATE SCHEMA public; DROP ROLE anon; DROP ROLE authenticated; DROP ROLE service_role;')
        bsetup=setup().replace(f'VALUES({U},{A})',f'VALUES({U},{B})').replace(f"'LOCAL',{A}",f"'LOCAL',{B}").replace(f"'local',{C},{A}",f"'local',{C},{B}").replace(f"1,{A}",f"1,{B}").replace(f"{P},{A},'aprovada'",f"{P},{B},'aprovada'").replace(f"VALUES({PP},{A},{O}",f"VALUES({PP},{B},{O}").replace(f"VALUES({SUB},{A}",f"VALUES({SUB},{B}")
        run(bsetup); run(actor()+f"SELECT public.rpc_programar_os_v1({O},'manual','2026-10-19');"); run((H/'rpc.sql.review').read_text())
        out=run(actor()+f'SELECT {call()};'); assert '"success": true' in out.stdout, out.stdout
        assert run(f'SELECT organization_id={B} FROM lotes;').stdout.strip()=='t'; results.append('positive tenant B generates exactly 100 mL in B, local fixture only')
        for role in ['gestor','producao']:
            reset(); run(f"UPDATE user_roles SET role='{role}' WHERE user_id={U};")
            out=run(actor()+f'SELECT {call()};'); assert '"success": true' in out.stdout; results.append(role+' positive manual category')
        reset()
        holder=start(f"SET application_name='holder';BEGIN; SELECT id FROM ordens_servico WHERE id={O} FOR UPDATE; SELECT pg_sleep(4); ROLLBACK;")
        end=time.monotonic()+3
        while time.monotonic()<end:
            if run("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='holder' AND wait_event='PgSleep');").stdout.strip()=='t': break
            time.sleep(.02)
        else: raise AssertionError('lock holder not started')
        out=run(actor()+f'SELECT {call()};',False); holder.communicate(timeout=10)
        assert out.returncode and 'lock timeout' in out.stderr; assert run('SELECT count(*) FROM lotes;').stdout.strip()=='0'; results.append('3s lock timeout rolls back without lot/event')
        reset()
        a=start(actor()+'BEGIN; SELECT '+call()+'; SELECT pg_sleep(1); COMMIT;')
        time.sleep(.25); b=start(actor()+'SELECT '+call(body='{"volume_produzido":101}')+';')
        outs=[a.communicate(timeout=20),b.communicate(timeout=20)]
        assert a.returncode==b.returncode==0 and '"success": false' in outs[1][0]; assert run('SELECT count(*) FROM lotes;').stdout.strip()=='1'; results.append('divergent concurrent replay writes only original lot')
        (H / 'real-test-results.json').write_text(json.dumps({'ref': 'swzpzcwiasxmjutrmvkm', 'scope': 'local disposable PostgreSQL; synthetic auth.uid/jwt; NOT hosted/JWT/RLS/browser proof', 'passed': len(results), 'checks': results}, indent=2, ensure_ascii=False) + '\n')
        print(len(results), 'PASS')
    finally:
        if started: subprocess.run(pre + ['pg_ctl', '-D', str(tmp / 'data'), 'stop', '-m', 'immediate'], capture_output=True)
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == '__main__':
    main()
