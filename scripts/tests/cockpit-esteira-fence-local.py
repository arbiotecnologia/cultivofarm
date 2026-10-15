"""Isolated PostgreSQL. Executes candidate h7n body; Auth/RBAC/tenant/entitlement STUBBED. No remote access."""
from pathlib import Path
import os, re, subprocess, tempfile, shutil
ROOT=Path(__file__).resolve().parents[2]
STUB=r"""
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth; CREATE SCHEMA private; CREATE SCHEMA platform_private;
GRANT USAGE ON SCHEMA public, private, platform_private, auth TO authenticated, anon;
CREATE TYPE public.app_role AS ENUM('administrador','gestor','administrativo','producao','financeiro','consultor_tecnico','tecnico_agronomo','operador_onfarm','superadmin');
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('t.uid',true),'')::uuid$$;
CREATE TABLE public.clientes(id uuid PRIMARY KEY, organization_id uuid);
CREATE TABLE public.profiles(user_id uuid, nome text);
CREATE TABLE public.programacao_producao(id uuid, responsavel_id uuid, responsavel text);
CREATE TABLE public.mv_esteira_laboratorio(os_id uuid, origem_os text, numero_os text, cliente_id uuid, cliente_nome text, fazenda_id uuid, fazenda_nome text, talhao_id uuid, talhao_nome text, produto_id uuid, produto_nome text, microrganismo_id uuid, microrganismo_nome text, partner_id uuid, partner_numero text, partner_nome text, titular_nome text, titular_tipo text, prioridade text, volume_solicitado_l float8, status_os text, status_esteira_oficial text, programacao_id uuid, data_programada date, lote_id uuid, codigo_lote text, status_lote text, cq_resultado text, envase_id uuid, estoque_id uuid, estoque_reservado_id uuid, entrega_id uuid, entrega_status text, atrasado boolean, bloqueios text[], pode_finalizar boolean, proxima_acao text, created_at timestamptz);
CREATE FUNCTION platform_private.h15_actor_organization() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('t.org',true),'')::uuid$$;
CREATE FUNCTION public.technical_actor_ready(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT CASE WHEN current_setting('t.ready',true)='null' THEN NULL ELSE $1=auth.uid() AND coalesce(current_setting('t.ready',true),'true')='true' AND platform_private.h15_actor_organization() IS NOT NULL END$$;
CREATE FUNCTION public.has_role(uuid,public.app_role) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT $1=auth.uid() AND $2::text=current_setting('t.role',true)$$;
CREATE FUNCTION public.get_cliente_ids_for_user(uuid) RETURNS uuid[] LANGUAGE sql STABLE AS $$SELECT coalesce(nullif(current_setting('t.carteira',true),'')::uuid[],'{}')$$;
CREATE FUNCTION public.technical_client_link(uuid,uuid,text[]) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT CASE WHEN current_setting('t.link',true)='null' THEN NULL ELSE coalesce(current_setting('t.link',true),'active')='active' AND $2=ANY(public.get_cliente_ids_for_user($1)) END$$;
CREATE FUNCTION public._saas_user_has_feature(uuid,text) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT coalesce(current_setting('t.feature',true),'true')='true'$$;
CREATE FUNCTION public.fn_cockpit_stage(text) RETURNS text LANGUAGE sql IMMUTABLE AS $$SELECT coalesce($1,'aguardando')$$;
INSERT INTO public.clientes VALUES('a0000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000000'),('b0000000-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000000'),('c0000000-0000-0000-0000-000000000001',NULL);
INSERT INTO public.mv_esteira_laboratorio(os_id,numero_os,cliente_id,status_os,atrasado,created_at) VALUES
 (gen_random_uuid(),'OS-AR','a0000000-0000-0000-0000-000000000001','aberta',false,now()),
 (gen_random_uuid(),'OS-FSF','b0000000-0000-0000-0000-000000000001','aberta',false,now()),
 (gen_random_uuid(),'OS-ORFA',NULL,'aberta',false,now()),
 (gen_random_uuid(),'OS-SEM-TENANT','c0000000-0000-0000-0000-000000000001','aberta',false,now()),
 (gen_random_uuid(),'OS-SEM-CLIENTE','d0000000-0000-0000-0000-000000000001','aberta',false,now());
"""
TESTS=r"""
CREATE VIEW public.vw_esteira_laboratorio WITH (security_invoker=true) AS SELECT * FROM private.h7n_esteira_laboratorio();
GRANT SELECT ON public.vw_esteira_laboratorio TO authenticated, anon;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
REVOKE ALL ON FUNCTION private.h7n_esteira_laboratorio() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.h7n_esteira_laboratorio() TO authenticated;
SET ROLE authenticated;
DO $t$
DECLARE n int; j jsonb; ar text:='aaaaaaaa-0000-0000-0000-000000000000'; u text:='11111111-0000-0000-0000-000000000000';
PROCEDURE_ok boolean;
BEGIN
 PERFORM set_config('t.uid',u,true); PERFORM set_config('t.org',ar,true); PERFORM set_config('t.role','administrador',true);
 SELECT count(*) INTO n FROM private.h7n_esteira_laboratorio(); IF n<>1 THEN RAISE EXCEPTION 'AR admin expected 1 got %',n; END IF; RAISE NOTICE 'PASS AR admin own tenant only';
 PERFORM set_config('t.org','bbbbbbbb-0000-0000-0000-000000000000',true);
 SELECT count(*) INTO n FROM private.h7n_esteira_laboratorio() WHERE numero_os='OS-AR'; IF n<>0 THEN RAISE EXCEPTION 'FSF saw AR'; END IF; RAISE NOTICE 'PASS FSF cannot see AR';
 PERFORM set_config('t.org',ar,true); PERFORM set_config('t.ready','false',true);
 SELECT count(*) INTO n FROM private.h7n_esteira_laboratorio(); IF n<>0 THEN RAISE EXCEPTION 'inactive saw'; END IF; RAISE NOTICE 'PASS inactive/no-iat zero';
 PERFORM set_config('t.ready','true',true); PERFORM set_config('t.org','',true);
 SELECT count(*) INTO n FROM private.h7n_esteira_laboratorio(); IF n<>0 THEN RAISE EXCEPTION 'no tenant saw'; END IF; RAISE NOTICE 'PASS SA/no tenant zero';
 PERFORM set_config('t.org',ar,true); PERFORM set_config('t.role','consultor_tecnico',true); PERFORM set_config('t.carteira','{}',true);
 SELECT count(*) INTO n FROM private.h7n_esteira_laboratorio(); IF n<>0 THEN RAISE EXCEPTION 'consultor sem carteira'; END IF; RAISE NOTICE 'PASS consultor sem carteira zero';
 PERFORM set_config('t.carteira','{b0000000-0000-0000-0000-000000000001}',true);
 SELECT count(*) INTO n FROM private.h7n_esteira_laboratorio(); IF n<>0 THEN RAISE EXCEPTION 'consultor carteira alheia'; END IF; RAISE NOTICE 'PASS carteira cross-tenant zero';
 PERFORM set_config('t.role','operador_onfarm',true);
 SELECT count(*) INTO n FROM private.h7n_esteira_laboratorio(); IF n<>0 THEN RAISE EXCEPTION 'onfarm widened'; END IF; RAISE NOTICE 'PASS onfarm not widened';
 -- Run view/helper as actual SQL authenticated (not owner). Stub identity remains local only.
 PERFORM set_config('t.role','consultor_tecnico',true); PERFORM set_config('t.carteira','{a0000000-0000-0000-0000-000000000001}',true);
 SELECT count(*) INTO n FROM public.vw_esteira_laboratorio; IF n<>1 THEN RAISE EXCEPTION 'active link denied'; END IF; RAISE NOTICE 'PASS active link own tenant';
 PERFORM set_config('t.link','revoked',true);
 SELECT count(*) INTO n FROM public.vw_esteira_laboratorio; IF n<>0 THEN RAISE EXCEPTION 'revoked allowed'; END IF; RAISE NOTICE 'PASS revoked link zero';
 PERFORM set_config('t.link','null',true);
 SELECT count(*) INTO n FROM public.vw_esteira_laboratorio; IF n<>0 THEN RAISE EXCEPTION 'null link allowed'; END IF; RAISE NOTICE 'PASS SQL NULL link zero';
 PERFORM set_config('t.role','administrador',true); PERFORM set_config('t.ready','null',true);
 SELECT count(*) INTO n FROM public.vw_esteira_laboratorio; IF n<>0 THEN RAISE EXCEPTION 'null readiness allowed'; END IF; RAISE NOTICE 'PASS SQL NULL readiness zero';
 PERFORM set_config('t.ready','true',true); PERFORM set_config('t.role','superadmin',true);
 SELECT count(*) INTO n FROM public.vw_esteira_laboratorio; IF n<>0 THEN RAISE EXCEPTION 'SA widened'; END IF; RAISE NOTICE 'PASS SA role not widened';
 PERFORM set_config('t.uid','',true);
 SELECT count(*) INTO n FROM public.vw_esteira_laboratorio; IF n<>0 THEN RAISE EXCEPTION 'no uid allowed'; END IF; RAISE NOTICE 'PASS no UID zero';
END $t$;
"""
def main():
    cand=(ROOT/'scripts/rbac-audit/proposed-cockpit-esteira-read-tenant-fence.sql').read_text()
    h7n=re.search(r'CREATE OR REPLACE FUNCTION private\.h7n_esteira_laboratorio\(\).*?\$function\$;',cand,re.S)[0]
    archive=(ROOT/'scripts/rbac-audit/applied-20261015173622_h_cockpit_contain_cross_tenant_read.sql').read_text()
    # Reproduce the observed vulnerable predicate in reduced schema, not hosted Auth.
    old=h7n[:h7n.index('  select m.*')]+r"""
  select m.* from public.mv_esteira_laboratorio m
  where public.has_role(auth.uid(), 'administrador'::public.app_role)
     or public.has_role(auth.uid(), 'gestor'::public.app_role)
     or public.has_role(auth.uid(), 'administrativo'::public.app_role)
     or public.has_role(auth.uid(), 'producao'::public.app_role)
     or public.has_role(auth.uid(), 'financeiro'::public.app_role)
     or ((public.has_role(auth.uid(), 'consultor_tecnico'::public.app_role)
        or public.has_role(auth.uid(), 'tecnico_agronomo'::public.app_role))
        and m.cliente_id = any(public.get_cliente_ids_for_user(auth.uid())));
$function$;
"""
    before=r"""
CREATE VIEW public.vw_esteira_laboratorio WITH (security_invoker=true) AS SELECT * FROM private.h7n_esteira_laboratorio();
GRANT SELECT ON public.vw_esteira_laboratorio TO authenticated;
GRANT EXECUTE ON FUNCTION private.h7n_esteira_laboratorio() TO authenticated;
SET ROLE authenticated;
DO $before$ BEGIN
 PERFORM set_config('t.uid','11111111-0000-0000-0000-000000000000',true);
 PERFORM set_config('t.org','bbbbbbbb-0000-0000-0000-000000000000',true);
 PERFORM set_config('t.role','administrador',true);
 IF (SELECT count(*) FROM public.vw_esteira_laboratorio)<>5 OR NOT EXISTS(SELECT 1 FROM public.vw_esteira_laboratorio WHERE numero_os='OS-AR') THEN RAISE EXCEPTION 'before reproduction missing'; END IF;
 RAISE NOTICE 'PASS before FSF leaks AR and unresolved rows';
END $before$;
RESET ROLE;
"""
    # Execute exact archived statements, substituting ONLY preflight definition hash
    # for the reduced local schema; this is explicitly NOT hosted preflight proof.
    archive=archive.replace("'6a3e2b6e2d594af67cf6727c5b03c2b1'", "current_setting('t.before_hash')")
    baseline=r"""
SELECT set_config('t.before_hash',md5(pg_get_functiondef('private.h7n_esteira_laboratorio()'::regprocedure)),false);
"""
    closed=r"""
SET ROLE authenticated;
DO $closed$ BEGIN
 BEGIN PERFORM count(*) FROM public.vw_esteira_laboratorio; RAISE EXCEPTION 'view reopened'; EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS containment FSF view 42501'; END;
 BEGIN PERFORM count(*) FROM private.h7n_esteira_laboratorio(); RAISE EXCEPTION 'helper reopened'; EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS containment helper 42501'; END;
END $closed$;
RESET ROLE;
CREATE TEMP TABLE acl_saved AS SELECT proacl,proowner FROM pg_proc WHERE oid='private.h7n_esteira_laboratorio()'::regprocedure;
CREATE TEMP TABLE view_acl_saved AS SELECT relacl FROM pg_class WHERE oid='public.vw_esteira_laboratorio'::regclass;
"""
    after=r"""
DO $after$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN acl_saved b WHERE p.oid='private.h7n_esteira_laboratorio()'::regprocedure AND (p.proacl IS DISTINCT FROM b.proacl OR p.proowner IS DISTINCT FROM b.proowner)) OR EXISTS(SELECT 1 FROM pg_class c CROSS JOIN view_acl_saved b WHERE c.oid='public.vw_esteira_laboratorio'::regclass AND c.relacl IS DISTINCT FROM b.relacl) THEN RAISE EXCEPTION 'candidate changed ACL'; END IF;
 RAISE NOTICE 'PASS after candidate ACL owner preserved';
END $after$;
SET ROLE authenticated;
DO $denied$ BEGIN BEGIN PERFORM count(*) FROM public.vw_esteira_laboratorio; RAISE EXCEPTION 'after view reopened'; EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS after candidate view stays 42501'; END; END $denied$;
RESET ROLE;
DROP VIEW public.vw_esteira_laboratorio;
"""
    tmp=Path(tempfile.mkdtemp(prefix='cockpit-',dir='/tmp'));tmp.chmod(0o777)
    pre=['setpriv','--reuid=1000','--regid=1000','--clear-groups'] if os.getuid()==0 else []
    started=False
    try:
        subprocess.run(pre+['initdb','-D',str(tmp/'d'),'-A','trust','-U','postgres'],check=True,capture_output=True)
        subprocess.run(pre+['pg_ctl','-D',str(tmp/'d'),'-l',str(tmp/'log'),'-o',f'-k {tmp} -h "" -p 55491','start','-w'],check=True,capture_output=True);started=True
        # Test-only grants below occur EXCLUSIVELY in disposable PostgreSQL, never remote.
        f=tmp/'t.sql';f.write_text(STUB+old+before+baseline+archive+closed+h7n+after+'\n'+TESTS.replace('PROCEDURE_ok boolean;','')+'\n');f.chmod(0o644)
        f.write_text(f.read_text()+'''RESET ROLE; SET ROLE anon; DO $anon$ BEGIN BEGIN PERFORM count(*) FROM public.vw_esteira_laboratorio; RAISE EXCEPTION 'anon allowed'; EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS anon SQL role denied'; END; END $anon$;''')
        r=subprocess.run(['psql','-h',str(tmp),'-p','55491','-U','postgres','-v','ON_ERROR_STOP=1','-f',str(f)],capture_output=True,text=True)
        if r.returncode: raise SystemExit(r.stderr[-4000:])
        print(r.stderr)
    finally:
        if started: subprocess.run(pre+['pg_ctl','-D',str(tmp/'d'),'stop','-m','immediate'],capture_output=True)
        shutil.rmtree(tmp,ignore_errors=True)
if __name__=='__main__':main()