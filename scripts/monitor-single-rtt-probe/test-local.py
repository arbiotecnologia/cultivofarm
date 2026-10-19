#!/usr/bin/env python3
"""Disposable local PostgreSQL 17 test for internal_actor_context_v1.

NOT hosted, NOT homologation: auth.uid()/auth.jwt() are synthetic GUC readers,
tables are minimal copies of the columns the real dependency bodies use. The
dependency functions are recreated byte-identically from the hosted
pg_get_functiondef() captured read-only on 2026-10-19 (md5 checked by the
preflight). Runs preflight -> candidate -> postflight -> behaviour -> rollback ->
preflight. Usage: python3 test-local.py [--md5-only]
"""
import json, os, subprocess, sys, tempfile
from pathlib import Path

H = Path(__file__).parent
U1, U2, U3 = ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000a3')
A, B = '00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000000b'

SETUP = r"""
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth; CREATE SCHEMA platform_private;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
REVOKE ALL ON SCHEMA platform_private FROM PUBLIC; GRANT USAGE ON SCHEMA platform_private TO authenticated;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
CREATE TYPE public.app_role AS ENUM ('administrador','tecnico_agronomo','producao','administrativo','gestor','cliente_produtor','consultor_tecnico','aplicador','operador_onfarm','financeiro','gestor_comercial','parceiro_b2b','parceiro_b2b_tecnico','superadmin');
CREATE TABLE public.fiscal_environment_marker(project_ref text);
INSERT INTO public.fiscal_environment_marker VALUES ('swzpzcwiasxmjutrmvkm');
CREATE TABLE public.organizations(id uuid PRIMARY KEY, ativo boolean NOT NULL);
CREATE TABLE public.profiles(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL CONSTRAINT profiles_user_id_key UNIQUE, organization_id uuid, ativo boolean NOT NULL DEFAULT true, senha_provisoria boolean NOT NULL DEFAULT false);
CREATE TABLE public.user_roles(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, role public.app_role NOT NULL, CONSTRAINT user_roles_user_id_role_key UNIQUE(user_id, role));
CREATE TABLE public.platform_org_admin_invites(user_id uuid, access_operation_status text, access_valid_after timestamptz);
GRANT SELECT ON public.profiles, public.user_roles TO authenticated;
GRANT SELECT ON public.fiscal_environment_marker TO authenticated;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY; ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE OR REPLACE FUNCTION platform_private.platform_actor_access_ready(p_user uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT EXISTS(SELECT 1 FROM public.profiles p WHERE p.user_id=p_user AND p.ativo IS TRUE AND p.senha_provisoria IS FALSE)
 AND NOT EXISTS(SELECT 1 FROM public.platform_org_admin_invites i WHERE i.user_id=p_user AND (i.access_operation_status='processing' OR (i.access_valid_after IS NOT NULL AND auth.uid()=p_user AND to_timestamp(COALESCE((auth.jwt()->>'iat')::bigint,0))<=i.access_valid_after)));
$function$
;
CREATE OR REPLACE FUNCTION platform_private.h15_actor_organization()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT p.organization_id FROM public.profiles p JOIN public.organizations o ON o.id=p.organization_id AND o.ativo IS TRUE WHERE p.user_id=auth.uid() AND p.ativo IS TRUE AND platform_private.platform_actor_access_ready(p.user_id);
$function$
;
CREATE OR REPLACE FUNCTION platform_private.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT EXISTS(SELECT 1 FROM public.user_roles r JOIN public.profiles p ON p.user_id=r.user_id WHERE r.user_id=_user_id AND r.role=_role AND p.ativo IS TRUE AND platform_private.platform_actor_access_ready(p.user_id));
$function$
;
CREATE OR REPLACE FUNCTION public.h15_actor_organization()
 RETURNS uuid
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$ SELECT platform_private.h15_actor_organization(); $function$
;
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$ SELECT platform_private.has_role(_user_id,_role); $function$
;
"""
# Hosted ACL order differs per function; reproduce the exact strings.
ACLS = r"""
REVOKE ALL ON FUNCTION platform_private.platform_actor_access_ready(uuid), platform_private.h15_actor_organization(), public.h15_actor_organization(), public.has_role(uuid,public.app_role), platform_private.has_role(uuid,public.app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform_private.platform_actor_access_ready(uuid), platform_private.h15_actor_organization(), public.h15_actor_organization(), public.has_role(uuid,public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION platform_private.platform_actor_access_ready(uuid), platform_private.h15_actor_organization(), public.h15_actor_organization(), public.has_role(uuid,public.app_role) TO service_role;
GRANT EXECUTE ON FUNCTION platform_private.has_role(uuid,public.app_role) TO service_role;
GRANT EXECUTE ON FUNCTION platform_private.has_role(uuid,public.app_role) TO authenticated;
"""
FIXTURES = f"""
INSERT INTO public.organizations VALUES ('{A}', true), ('{B}', true);
INSERT INTO public.profiles(user_id, organization_id) VALUES ('{U1}', '{B}'), ('{U2}', '{A}'), ('{U3}', '{B}');
INSERT INTO public.user_roles(user_id, role) VALUES ('{U1}','gestor'), ('{U1}','consultor_tecnico'), ('{U2}','financeiro'), ('{U3}','administrador');
"""


def main():
    tmp = Path(tempfile.mkdtemp(prefix='rtt-probe-', dir='/tmp')); tmp.chmod(0o777)
    pre = ['setpriv', '--reuid=1000', '--regid=1000', '--clear-groups'] if os.getuid() == 0 else []
    started = False; results = []
    try:
        subprocess.run(pre + ['initdb', '-D', str(tmp / 'data'), '-A', 'trust', '-U', 'postgres'], check=True, capture_output=True)
        subprocess.run(pre + ['pg_ctl', '-D', str(tmp / 'data'), '-l', str(tmp / 'log'), '-o', f'-k {tmp} -h "" -p 55511', 'start', '-w'], check=True, capture_output=True); started = True
        conn = ['psql', '-X', '-h', str(tmp), '-p', '55511', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At', '-q']

        def run(sql, ok=True):
            r = subprocess.run(conn, input=sql, capture_output=True, text=True)
            if ok and r.returncode: raise AssertionError(r.stdout[-800:] + r.stderr[-2000:])
            return r

        def check(name, cond):
            results.append((name, bool(cond)))
            print(('PASS ' if cond else 'FAIL ') + name)

        run(SETUP + ACLS)
        for sig, md5 in [('public.h15_actor_organization()', '55edafec08bcc84a00f1526c14334a2c'), ('public.has_role(uuid,public.app_role)', '4d90e93d521a4819d9085f28d742030f'),
                         ('platform_private.h15_actor_organization()', '64e10608403238a41a9baf92857ca881'), ('platform_private.has_role(uuid,public.app_role)', 'c5af5b55de6d79da9b73a33948746ae2'),
                         ('platform_private.platform_actor_access_ready(uuid)', '048249c0c2106c3761e26eacb8d0de84')]:
            got = run(f"SELECT md5(pg_get_functiondef('{sig}'::regprocedure));").stdout.strip()
            check(f'local dependency byte-identical to hosted md5 {sig}', got == md5)
        if '--md5-only' in sys.argv:
            run((H / 'function.sql.review').read_text() + ';')
            print(run("SELECT md5(pg_get_functiondef('public.internal_actor_context_v1()'::regprocedure));").stdout.strip())
            return 0
        run(FIXTURES)
        check('preflight PASS before apply', 'PRE_OK' in run((H / 'preflight-readonly.sql').read_text()).stdout)
        check('postflight FAILS before apply', run((H / 'postflight-readonly.sql').read_text(), ok=False).returncode != 0)
        check('rollback refuses before apply (no POST)', run((H / 'rollback.sql.review').read_text(), ok=False).returncode != 0)
        run((H / 'candidate.sql.review').read_text())
        check('candidate applied; postflight PASS', 'POST_OK' in run((H / 'postflight-readonly.sql').read_text()).stdout)
        check('candidate is not re-appliable (PRE refuses)', run((H / 'candidate.sql.review').read_text(), ok=False).returncode != 0)

        def ctx(uid, role='authenticated', iat='2000000000'):
            claims = json.dumps({'sub': uid, 'iat': int(iat)}) if uid else ''
            r = run(f"BEGIN; SET LOCAL ROLE {role}; SELECT set_config('request.jwt.claim.sub', '{uid or ''}', true); SELECT set_config('request.jwt.claims', '{claims}', true);"
                    f" SELECT coalesce(public.internal_actor_context_v1()::text, 'NULL'); ROLLBACK;", ok=False)
            if r.returncode: return ('ERR', r.stderr)
            return json.loads(r.stdout.strip().splitlines()[-1]) if r.stdout.strip().splitlines()[-1] != 'NULL' else None

        c = ctx(U1)
        check('pair B: own uid, h15 org B, sorted roles, confirmed', c == {'v': 1, 'user_id': U1, 'organization_id': B, 'profile': {'user_id': U1, 'organization_id': B, 'ativo': True, 'senha_provisoria': False}, 'roles': ['consultor_tecnico', 'gestor'], 'roles_confirmed': True})
        check('financeiro A sees only own context', ctx(U2)['roles'] == ['financeiro'] and ctx(U2)['organization_id'] == A)
        check('no auth.uid() -> NULL', ctx(None) is None)
        r = ctx(U1, role='anon'); check('anon has no EXECUTE', r[0] == 'ERR' and 'permission denied' in r[1])
        run(f"DELETE FROM public.user_roles WHERE user_id='{U1}' AND role='gestor';")
        check('partial revoke gestor -> residual consultor only', ctx(U1)['roles'] == ['consultor_tecnico'])
        run(f"INSERT INTO public.user_roles(user_id, role) VALUES ('{U1}','gestor'); DELETE FROM public.user_roles WHERE user_id='{U1}' AND role='consultor_tecnico';")
        check('partial revoke consultor -> residual gestor only', ctx(U1)['roles'] == ['gestor'])
        run(f"INSERT INTO public.user_roles(user_id, role) VALUES ('{U1}','consultor_tecnico'), ('{U1}','administrador');")
        check('superset visible as superset (client denies)', ctx(U1)['roles'] == ['administrador', 'consultor_tecnico', 'gestor'])
        run(f"DELETE FROM public.user_roles WHERE user_id='{U1}';")
        c = ctx(U1); check('zero roles -> [] and roles_confirmed false', c['roles'] == [] and c['roles_confirmed'] is False)
        run(f"INSERT INTO public.user_roles(user_id, role) VALUES ('{U1}','gestor'), ('{U1}','consultor_tecnico');")
        run(f"UPDATE public.profiles SET ativo=false WHERE user_id='{U1}';")
        c = ctx(U1); check('inactive profile -> org null, confirmed false', c['organization_id'] is None and c['roles_confirmed'] is False and c['profile']['ativo'] is False)
        run(f"UPDATE public.profiles SET ativo=true, senha_provisoria=true WHERE user_id='{U1}';")
        c = ctx(U1); check('provisional password -> org null, confirmed false', c['organization_id'] is None and c['roles_confirmed'] is False)
        run(f"UPDATE public.profiles SET senha_provisoria=false WHERE user_id='{U1}'; UPDATE public.organizations SET ativo=false WHERE id='{B}';")
        c = ctx(U1); check('inactive organization -> org null', c['organization_id'] is None)
        run(f"UPDATE public.organizations SET ativo=true WHERE id='{B}'; UPDATE public.profiles SET organization_id='{A}' WHERE user_id='{U1}';")
        c = ctx(U1); check('tenant change B->A reported as A (client expecting B denies)', c['organization_id'] == A and c['profile']['organization_id'] == A)
        run(f"UPDATE public.profiles SET organization_id='{B}' WHERE user_id='{U1}'; INSERT INTO public.platform_org_admin_invites VALUES ('{U1}', null, to_timestamp(2000000100));")
        c = ctx(U1, iat='2000000000'); check('stale JWT iat before access_valid_after -> org null, confirmed false', c['organization_id'] is None and c['roles_confirmed'] is False)
        c = ctx(U1, iat='2000000200'); check('fresh JWT iat after access_valid_after -> confirmed', c['organization_id'] == B and c['roles_confirmed'] is True)
        run(f"DELETE FROM public.platform_org_admin_invites; INSERT INTO public.platform_org_admin_invites VALUES ('{U1}', 'processing', null);")
        c = ctx(U1); check('invite processing -> confirmed false', c['organization_id'] is None and c['roles_confirmed'] is False)
        run("DELETE FROM public.platform_org_admin_invites;")
        c = ctx(U3); check('other tenant user cannot see U1 rows (only own)', c['user_id'] == U3 and c['roles'] == ['administrador'])
        # Single statement = single snapshot: a concurrent committed change is never half-observed.
        r = run(f"BEGIN ISOLATION LEVEL READ COMMITTED; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','{U1}',true); SELECT set_config('request.jwt.claims','{{\"sub\":\"{U1}\",\"iat\":2000000000}}',true);"
                f" SELECT provolatile FROM pg_proc WHERE oid='public.internal_actor_context_v1()'::regprocedure; ROLLBACK;")
        check('function is STABLE (one snapshot per statement)', r.stdout.strip().splitlines()[-1] == 's')
        r = run("SELECT prosecdef, proacl::text FROM pg_proc WHERE oid='public.internal_actor_context_v1()'::regprocedure;").stdout.strip()
        check('SECURITY INVOKER and ACL postgres+authenticated only', r == 'f|{postgres=X/postgres,authenticated=X/postgres}')
        run((H / 'rollback.sql.review').read_text())
        check('rollback applied; preflight PASS again (exact pre-state)', 'PRE_OK' in run((H / 'preflight-readonly.sql').read_text()).stdout)
        check('dependencies untouched after rollback', run("SELECT count(*) FROM pg_proc WHERE oid IN ('public.h15_actor_organization()'::regprocedure,'public.has_role(uuid,public.app_role)'::regprocedure);").stdout.strip() == '2')
    finally:
        if started: subprocess.run(pre + ['pg_ctl', '-D', str(tmp / 'data'), 'stop', '-m', 'immediate'], capture_output=True)
    failed = [n for n, ok in results if not ok]
    (H / 'local-test-results.json').write_text(json.dumps({'engine': 'PostgreSQL local 17 disposable, synthetic auth GUC, NOT hosted', 'passed': len(results) - len(failed), 'total': len(results), 'failed': failed}, indent=1) + '\n')
    print(f'{len(results) - len(failed)}/{len(results)}')
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
