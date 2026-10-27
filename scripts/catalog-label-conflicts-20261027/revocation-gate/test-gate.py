"""PG descartável: corpos LIVE exatos vs candidato-gate exato dos 2 RPCs de rótulo, com helpers/autoridade LIVE exatos
(require_actor, replay, audit, has_role público/privado, is_platform_superadmin, platform_actor_access_ready, acquire_gate,
acquire_invitation_gate) sobre schema REDUZIDO de user_roles/profiles/convites com os triggers de gate.
Auth SINTÉTICA (auth.uid/auth.jwt por GUC). Prova ordenação de locks em duas/três conexões. NÃO é homologação JWT/RLS real."""
from pathlib import Path
import json, subprocess, tempfile, os, time, hashlib
H = Path(__file__).resolve().parent; P = H.parent
F = {r['signature']: r for r in json.loads((P / 'live-functions.json').read_text())}
GD = {r['signature']: r for r in json.loads((H / 'live-gate-deps.json').read_text())}
M = json.loads((H / 'manifest-gate.json').read_text())
GATE_BODIES = (H / 'functions-gate.sql.review').read_text()
UPD = 'platform_update_catalog_label(uuid,timestamp with time zone,text,text,uuid)'
ACT = 'platform_set_catalog_label_active(uuid,timestamp with time zone,boolean,text,uuid)'
tmp = Path(tempfile.mkdtemp(prefix='label-gate-', dir='/tmp')); tmp.chmod(0o777)
pre = ['setpriv', '--reuid=1000', '--regid=1000', '--clear-groups'] if os.getuid() == 0 else []
cmd = ['psql', '-X', '-h', str(tmp), '-p', '55542', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-At', '-d', 'postgres']
R = []
def run(s, ok=True):
    r = subprocess.run(cmd, input=s, text=True, capture_output=True)
    if ok and r.returncode: raise AssertionError(r.stderr[-2500:])
    return r
def val(s): return run(s).stdout.strip().splitlines()[-1]
def check(l, e): assert val('SELECT (' + e + ') IS TRUE;') == 't', l; R.append(l)
def deny(l, s, code, msg):
    r = run(s, False); assert r.returncode and code in r.stderr and msg in r.stderr, (l, r.stderr[-800:]); R.append(l)
def bg(name, sql):
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    p.stdin.write(f"SET application_name='{name}';" + sql); p.stdin.close(); return p
def until(sql, label, t=6):
    t0 = time.time()
    while val(sql) in ('0', 'f', ''):
        assert time.time() - t0 < t, label; time.sleep(.03)
def waiting(n): until(f"SELECT count(*) FROM pg_stat_activity WHERE application_name='{n}' AND wait_event_type='Lock';", f'{n} lock')
def sleeping(n): until(f"SELECT count(*) FROM pg_stat_activity WHERE application_name='{n}' AND query LIKE '%pg_sleep%' AND state='active';", f'{n} sleep')
def blocked_by(a, b):
    check(f'{a} bloqueada por {b} (pg_blocking_pids)', f"(SELECT (SELECT pid FROM pg_stat_activity WHERE application_name='{b}') = ANY(pg_blocking_pids(pid)) FROM pg_stat_activity WHERE application_name='{a}')")
def done(p, t=12): o = p.communicate(timeout=t); return p.returncode, o[1]
SA = '00000000-0000-4000-8000-0000000000a1'; TA = '00000000-0000-4000-8000-0000000000b1'; TB = '00000000-0000-4000-8000-0000000000b2'
LID = '00000000-0000-4000-8000-000000000101'
def act(u): return f"SELECT set_config('test.sub','{u}',false),set_config('test.iat',(extract(epoch from now())::bigint-5)::text,false);SET ROLE authenticated;"
REASON = "'motivo sintetico valido'"
def key(n): return f"00000000-0000-4000-8000-{n:012d}"
def ver(): return val(f"SELECT updated_at::text FROM public.catalog_family_labels WHERE id='{LID}';")
def upd(v, ex, k): return f"SELECT public.platform_update_catalog_label('{LID}','{v}','{ex}',{REASON},'{key(k)}');"
def setact(v, a, k): return f"SELECT public.platform_set_catalog_label_active('{LID}','{v}',{a},{REASON},'{key(k)}');"
def audits(): return val("SELECT count(*) FROM public.catalog_platform_admin_audit;")
REVOKE_ROLE = f"DELETE FROM public.user_roles WHERE user_id='{SA}' AND role='superadmin';"
DEACTIVATE = f"UPDATE public.profiles SET ativo=false WHERE user_id='{SA}';"
SETUP = r"""
CREATE ROLE anon NOLOGIN;CREATE ROLE authenticated NOLOGIN;CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA auth;CREATE SCHEMA platform_private;CREATE SCHEMA cf_user_guards_v1;GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('test.sub',true),'')::uuid$$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT CASE WHEN nullif(current_setting('test.sub',true),'') IS NULL THEN NULL ELSE jsonb_build_object('sub',current_setting('test.sub'),'iat',current_setting('test.iat')::bigint,'exp',current_setting('test.iat')::bigint+3600) END$$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon,authenticated;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE TYPE public.app_role AS ENUM('superadmin','administrador');
CREATE TABLE public.user_roles(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL,role public.app_role NOT NULL,UNIQUE(user_id,role));
CREATE TABLE public.profiles(user_id uuid PRIMARY KEY,ativo boolean NOT NULL DEFAULT true,senha_provisoria boolean NOT NULL DEFAULT false,updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.platform_org_admin_invites(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,access_operation_status text,access_valid_after timestamptz);
CREATE TABLE public.user_clientes(user_id uuid);CREATE TABLE public.partner_users(user_id uuid);
CREATE TABLE cf_user_guards_v1.state(singleton boolean PRIMARY KEY CHECK(singleton),revision bigint NOT NULL DEFAULT 0);
INSERT INTO cf_user_guards_v1.state VALUES(true,0);
CREATE TABLE public.catalog_family_labels(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),familia text NOT NULL,rotulo text NOT NULL,rotulo_exibicao text NOT NULL,ativo boolean NOT NULL DEFAULT true,created_by uuid,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(familia,rotulo));
CREATE TABLE public.catalog_platform_admin_audit(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),operation text NOT NULL,actor_id uuid NOT NULL,reason text NOT NULL,correlation_id uuid NOT NULL UNIQUE,status text NOT NULL CHECK(status='completed'),counts_before jsonb NOT NULL DEFAULT '{}',counts_after jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now(),completed_at timestamptz);
ALTER TABLE public.catalog_family_labels ENABLE ROW LEVEL SECURITY;ALTER TABLE public.catalog_platform_admin_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.catalog_family_labels,public.catalog_platform_admin_audit FROM PUBLIC,anon,authenticated;
"""
TRIGGERS = """
CREATE TRIGGER a00_cf_user_gate BEFORE INSERT OR UPDATE OR DELETE ON public.user_roles FOR EACH STATEMENT EXECUTE FUNCTION cf_user_guards_v1.acquire_gate();
CREATE TRIGGER a00_cf_user_gate BEFORE INSERT OR UPDATE OR DELETE ON public.profiles FOR EACH STATEMENT EXECUTE FUNCTION cf_user_guards_v1.acquire_gate();
CREATE TRIGGER a00_cf_invitation_gate BEFORE INSERT OR UPDATE OR DELETE ON public.platform_org_admin_invites FOR EACH STATEMENT EXECUTE FUNCTION cf_user_guards_v1.acquire_invitation_gate();
CREATE FUNCTION platform_private.catalog_family_labels_touch() RETURNS trigger LANGUAGE plpgsql SET search_path TO '' AS $function$
BEGIN
  NEW.updated_at := pg_catalog.now();
  RETURN NEW;
END $function$;
CREATE TRIGGER catalog_family_labels_touch BEFORE UPDATE ON public.catalog_family_labels FOR EACH ROW EXECUTE FUNCTION platform_private.catalog_family_labels_touch();
"""
def install(gate):
    if gate:
        run(GATE_BODIES)
        for t in M['targets']:
            check(f"candidato-gate hash exato {t['signature'].split('(')[0]}", f"md5(pg_get_functiondef('public.{t['signature']}'::regprocedure))='{t['gate_md5']}'")
            check(f"candidato-gate config search_path+lock_timeout {t['signature'].split('(')[0]}", f"(SELECT to_jsonb(proconfig)='{json.dumps(M['config_after'])}'::jsonb FROM pg_proc WHERE oid='public.{t['signature']}'::regprocedure)")
    else:
        for s in (UPD, ACT): run(F[s]['definition'] + ';'); check('LIVE hash exato ' + s.split('(')[0], f"md5(pg_get_functiondef('public.{s}'::regprocedure))='{F[s]['md5']}'")
    for s in (UPD, ACT): run(f"REVOKE ALL ON FUNCTION public.{s} FROM PUBLIC;GRANT EXECUTE ON FUNCTION public.{s} TO authenticated,service_role;")
def reset():
    run("DELETE FROM public.catalog_platform_admin_audit;DELETE FROM public.catalog_family_labels;DELETE FROM public.platform_org_admin_invites;"
        f"INSERT INTO public.catalog_family_labels(id,familia,rotulo,rotulo_exibicao,updated_at) VALUES('{LID}','quimico','fungicida','Fungicida','2026-10-21T10:00:00Z');"
        f"INSERT INTO public.user_roles(user_id,role) VALUES('{SA}','superadmin') ON CONFLICT DO NOTHING;UPDATE public.profiles SET ativo=true;")
def unchanged(tag, v):
    check(f'{tag} sem escrita/auditoria', f"(SELECT updated_at::text='{v}' AND rotulo_exibicao='Fungicida' AND ativo FROM public.catalog_family_labels) AND {audits()}=0")

def wait_scenarios(gate):
    tag = 'GATE' if gate else 'LIVE'
    # 1) Revogação (DELETE superadmin) enquanto a chamada aguarda LOCK DE LINHA mantido por escritor não-gated.
    reset(); v = ver()
    h = bg('h1', f"BEGIN;SELECT 1 FROM public.catalog_family_labels WHERE id='{LID}' FOR UPDATE;SELECT pg_sleep(2);COMMIT;"); sleeping('h1')
    c = bg('c1', act(SA) + upd(v, 'Durante espera', 21)); waiting('c1'); blocked_by('c1', 'h1')
    r = bg('r1', REVOKE_ROLE)
    if gate:
        waiting('r1'); blocked_by('r1', 'c1'); R.append(f'{tag} linha: revogação NÃO commita durante a espera (aguarda gate da operação)')
        rc, er = done(c); assert rc == 0, er; rr, er2 = done(r); assert rr == 0, er2
        R.append(f'{tag} linha: operação conclui com autoridade vigente no gate; revogação serializada DEPOIS (não "venceu")')
        deny(f'{tag} linha: chamada seguinte após revogação -> 42501', act(SA) + upd(ver(), 'Depois', 22), '42501', 'catalog_metadata_forbidden')
    else:
        rr, er2 = done(r, 1.8); assert rr == 0, er2
        check(f'{tag} linha: revogação commitada enquanto a chamada ainda aguarda', "NOT EXISTS(SELECT 1 FROM public.user_roles WHERE role='superadmin')")
        rc, er = done(c); assert rc == 0, er
        check(f'{tag} linha: VULNERÁVEL — gravou após revogação commitada', f"(SELECT rotulo_exibicao='Durante espera' FROM public.catalog_family_labels) AND {audits()}=1")
    done(h)
    # 2) Desativação de perfil enquanto aguarda ADVISORY LOCK da mesma chave de idempotência (set_active).
    reset(); v = ver()
    h = bg('h2', f"BEGIN;SELECT pg_advisory_xact_lock(hashtextextended('catalog-metadata:{key(23)}',0));SELECT pg_sleep(2);COMMIT;"); sleeping('h2')
    c = bg('c2', act(SA) + setact(v, 'false', 23)); waiting('c2'); blocked_by('c2', 'h2')
    check(f'{tag} advisory: chamada aguarda advisory lock', "(SELECT wait_event='advisory' FROM pg_stat_activity WHERE application_name='c2')")
    r = bg('r2', DEACTIVATE)
    if gate:
        waiting('r2'); blocked_by('r2', 'c2'); R.append(f'{tag} advisory: desativação aguarda gate da operação')
        rc, er = done(c); assert rc == 0, er; rr, er2 = done(r); assert rr == 0, er2
        deny(f'{tag} advisory: chamada seguinte após desativação -> 42501', act(SA) + setact(ver(), 'true', 24), '42501', 'catalog_metadata_forbidden')
    else:
        rr, er2 = done(r, 1.8); assert rr == 0, er2
        rc, er = done(c); assert rc == 0, er
        check(f'{tag} advisory: VULNERÁVEL — gravou após desativação commitada', f"(SELECT NOT ativo FROM public.catalog_family_labels) AND {audits()}=1")
    done(h)
    # 3) Revogação PRIMEIRO segurando o gate (writer real de user_roles), operação depois.
    reset(); v = ver()
    r = bg('r3', "BEGIN;" + REVOKE_ROLE + "SELECT pg_sleep(1.5);COMMIT;"); sleeping('r3')
    c = bg('c3', act(SA) + upd(v, 'Pos revogacao', 25))
    if gate:
        waiting('c3'); blocked_by('c3', 'r3'); rc, er = done(c)
        assert rc and '42501' in er and 'catalog_metadata_forbidden' in er, er; R.append(f'{tag} revogação-primeiro: operação espera gate e é negada 42501 após commit')
        done(r); unchanged(tag + ' revogação-primeiro', v)
    else:
        rc, er = done(c); assert rc == 0, er; done(r)
        R.append(f'{tag} revogação-primeiro: sem gate, operação não espera e grava com revogação ainda não commitada')
    # 4) Operação PRIMEIRO segurando o gate, revogação depois (ordem inversa).
    if gate:
        reset(); v = ver()
        c = bg('c4', "BEGIN;" + act(SA) + upd(v, 'Op primeiro', 26) + "SELECT pg_sleep(1.5);COMMIT;"); sleeping('c4')
        r = bg('r4', REVOKE_ROLE); waiting('r4'); blocked_by('r4', 'c4')
        rc, er = done(c); assert rc == 0, er; rr, _ = done(r); assert rr == 0
        check(f'{tag} op-primeiro: operação commitada antes; revogação aplicada depois', f"(SELECT rotulo_exibicao='Op primeiro' FROM public.catalog_family_labels) AND NOT EXISTS(SELECT 1 FROM public.user_roles WHERE role='superadmin')")
        deny(f'{tag} op-primeiro: replay da mesma chave após revogação -> 42501 (sem recibo)', act(SA) + upd(v, 'Op primeiro', 26), '42501', 'catalog_metadata_forbidden')

def gate_only():
    tag = 'GATE'
    # lock_timeout 3s: gate preso por writer de autoridade por 4.5s.
    reset(); v = ver()
    r = bg('r5', "BEGIN;" + DEACTIVATE.replace('ativo=false', 'ativo=true') + "SELECT pg_sleep(4.5);COMMIT;"); sleeping('r5')
    t0 = time.time(); deny(f'{tag} lock_timeout: 55P03 ao aguardar gate', act(SA) + upd(v, 'Timeout', 27), '55P03', 'lock timeout'); el = time.time() - t0
    assert 2.5 < el < 4.4, el; R.append(f'{tag} lock_timeout efetivo ~3s ({el:.1f}s)'); done(r); unchanged(tag + ' lock_timeout', v)
    # convites usam NOWAIT: falham imediatamente se a operação de rótulo segura o gate (risco residual documentado).
    reset(); v = ver()
    c = bg('c6', "BEGIN;" + act(SA) + upd(v, 'Segura gate', 28) + "SELECT pg_sleep(1.5);COMMIT;"); sleeping('c6')
    deny(f'{tag} residual: writer de convite NOWAIT falha 55P03 enquanto rótulo segura gate', f"INSERT INTO public.platform_org_admin_invites(user_id,access_operation_status) VALUES('{SA}','processing');", '55P03', 'could not obtain lock')
    done(c)
    # duas mutações de rótulo gated: segunda espera no GATE (não na linha) e recebe PT409.
    reset(); v = ver()
    c = bg('c7', "BEGIN;" + act(SA) + setact(v, 'false', 29) + "SELECT pg_sleep(1.5);COMMIT;"); sleeping('c7')
    d = bg('d7', act(SA) + upd(v, 'Concorrente', 30)); waiting('d7'); blocked_by('d7', 'c7')
    rc, _ = done(c); assert rc == 0; rd, er = done(d); assert rd and 'PT409' in er and 'catalog_label_conflict' in er, er
    R.append(f'{tag} concorrência: 1 vence, 1 PT409 (espera no gate)')
    check(f'{tag} concorrência sem sobrescrever vencedor', f"(SELECT NOT ativo AND rotulo_exibicao='Fungicida' FROM public.catalog_family_labels) AND {audits()}=1")
    # stale / no-op / replay / chave reutilizada / pós-condição / A/B / anon
    reset(); v = ver()
    deny(f'{tag} stale -> PT409', act(SA) + upd('2026-01-01T00:00:00Z', 'Novo', 31), 'PT409', 'catalog_label_conflict')
    deny(f'{tag} active stale -> PT409', act(SA) + setact('2026-01-01T00:00:00Z', 'false', 32), 'PT409', 'catalog_label_conflict')
    deny(f'{tag} no-op 22023', act(SA) + upd(v, 'Fungicida', 33), '22023', 'catalog_label_no_change'); unchanged(tag + ' stale/no-op', v)
    run(act(SA) + upd(v, 'Fungicida X', 34)); v1 = ver()
    assert val(act(SA) + f"SELECT (public.platform_update_catalog_label('{LID}','{v}','Fungicida X',{REASON},'{key(34)}')->>'idempotent');") == 'true'
    R.append(f'{tag} replay idempotente retorna recibo'); check(f'{tag} replay sem nova auditoria', f"{audits()}=1")
    deny(f'{tag} chave reutilizada -> 40001 residual helper', act(SA) + upd(v1, 'Outro', 34), '40001', 'catalog_entity_conflict')
    run("CREATE FUNCTION public.zz_fault() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN NEW.rotulo:='fungicida_x';RETURN NEW;END$$;CREATE TRIGGER zz_fault BEFORE UPDATE ON public.catalog_family_labels FOR EACH ROW EXECUTE FUNCTION public.zz_fault();")
    deny(f'{tag} pós-condição -> PT409', act(SA) + setact(v1, 'false', 35), 'PT409', 'catalog_label_confirmation_failed')
    run("DROP TRIGGER zz_fault ON public.catalog_family_labels;DROP FUNCTION public.zz_fault();")
    check(f'{tag} pós-condição rollback integral', f"(SELECT updated_at::text='{v1}' AND ativo FROM public.catalog_family_labels) AND {audits()}=1")
    for u, nm in [(TA, 'admin tenant A'), (TB, 'admin tenant B')]:
        deny(f'{tag} {nm} negado 42501', act(u) + upd(v1, 'Invasor', 36), '42501', 'catalog_metadata_forbidden')
        deny(f'{tag} {nm} active negado 42501', act(u) + setact(v1, 'false', 37), '42501', 'catalog_metadata_forbidden')
    deny(f'{tag} anon sem EXECUTE', "SET ROLE anon;" + upd(v1, 'Anon', 38), '42501', 'permission denied')
    check(f'{tag} negações sem escrita', f"(SELECT updated_at::text='{v1}' FROM public.catalog_family_labels) AND {audits()}=1")
    run(REVOKE_ROLE); deny(f'{tag} revogação commitada antes -> 42501', act(SA) + upd(v1, 'X', 39), '42501', 'catalog_metadata_forbidden')
    deny(f'{tag} replay após revogação -> 42501 (sem recibo)', act(SA) + upd(v, 'Fungicida X', 34), '42501', 'catalog_metadata_forbidden')
    # contenção deny-only
    reset()
    for t in M['targets']: run(f"REVOKE EXECUTE ON FUNCTION public.{t['signature']} FROM authenticated;")
    check(f'{tag} contenção: ACL deny-only', f"(SELECT bool_and(proacl::text='{M['containment_acl']}') FROM pg_proc WHERE oid IN ('public.{UPD}'::regprocedure,'public.{ACT}'::regprocedure))")
    deny(f'{tag} contenção: superadmin via authenticated negado', act(SA) + upd(ver(), 'Contido', 40), '42501', 'permission denied')
    check(f'{tag} contenção mantém corpo gate (não restaura LIVE vulnerável)', f"md5(pg_get_functiondef('public.{UPD}'::regprocedure))='{M['targets'][0]['gate_md5']}'")

try:
    subprocess.run(pre + ['initdb', '-D', str(tmp / 'd'), '-A', 'trust', '-U', 'postgres'], check=True, capture_output=True)
    subprocess.run(pre + ['pg_ctl', '-D', str(tmp / 'd'), '-l', str(tmp / 'log'), '-o', f'-k {tmp} -h "" -p 55542', 'start', '-w'], check=True, capture_output=True)
    run(SETUP)
    order = ['platform_private.platform_actor_access_ready(uuid)', 'platform_private.has_role(uuid,app_role)', 'has_role(uuid,app_role)', 'is_platform_superadmin(uuid)',
             'cf_user_guards_v1.acquire_gate()', 'cf_user_guards_v1.acquire_invitation_gate()']
    for s in order:
        run(GD[s]['definition'] + ';'); check('dep LIVE exata ' + s.split('(')[0], f"md5(pg_get_functiondef('{s if '.' in s.split('(')[0] else 'public.'+s}'::regprocedure))='{GD[s]['md5']}'")
    for s in ['platform_private.catalog_metadata_require_actor()', 'platform_private.catalog_entity_audit(uuid,text,text,uuid,jsonb,jsonb,jsonb,jsonb)', 'platform_private.catalog_entity_replay(uuid,text,jsonb,text,uuid)']:
        run(F[s]['definition'] + ';'); check('helper LIVE exato ' + s.split('(')[0], f"md5(pg_get_functiondef('{s}'::regprocedure))='{F[s]['md5']}'")
    run(TRIGGERS)
    run(f"INSERT INTO public.profiles(user_id) VALUES('{SA}'),('{TA}'),('{TB}');INSERT INTO public.user_roles(user_id,role) VALUES('{SA}','superadmin'),('{TA}','administrador'),('{TB}','administrador');")
    install(False); wait_scenarios(False)
    install(True); wait_scenarios(True); gate_only()
finally:
    subprocess.run(pre + ['pg_ctl', '-D', str(tmp / 'd'), 'stop', '-m', 'immediate'], capture_output=True)
(H / 'results-gate-local.json').write_text(json.dumps({'kind': 'PostgreSQL descartável, Auth sintética, schema reduzido, writers de autoridade simulados por DML direto com triggers de gate LIVE — NÃO homologação real',
    'pg': subprocess.run(['postgres', '--version'], capture_output=True, text=True).stdout.strip(), 'passed': len(R), 'checks': R}, indent=2, ensure_ascii=False) + '\n')
print(len(R), 'checks OK')
