"""Isolated PostgreSQL. Executes candidate h7n/RPC bodies; Auth/RBAC/tenant/entitlement STUBBED. No remote access."""
from pathlib import Path
import os, re, subprocess, tempfile, shutil
ROOT=Path(__file__).resolve().parents[2]
STUB=r"""
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth; CREATE SCHEMA private; CREATE SCHEMA platform_private;
GRANT USAGE ON SCHEMA public, private, platform_private, auth TO authenticated, anon;
CREATE TYPE public.app_role AS ENUM('administrador','gestor','administrativo','producao','financeiro','consultor_tecnico','tecnico_agronomo','operador_onfarm');
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('t.uid',true),'')::uuid$$;
CREATE TABLE public.clientes(id uuid PRIMARY KEY, organization_id uuid);
CREATE TABLE public.profiles(user_id uuid, nome text);
CREATE TABLE public.programacao_producao(id uuid, responsavel_id uuid, responsavel text);
CREATE TABLE public.mv_esteira_laboratorio(os_id uuid, origem_os text, numero_os text, cliente_id uuid, cliente_nome text, fazenda_id uuid, fazenda_nome text, talhao_id uuid, talhao_nome text, produto_id uuid, produto_nome text, microrganismo_id uuid, microrganismo_nome text, partner_id uuid, partner_numero text, partner_nome text, titular_nome text, titular_tipo text, prioridade text, volume_solicitado_l float8, status_os text, status_esteira_oficial text, programacao_id uuid, data_programada date, lote_id uuid, codigo_lote text, status_lote text, cq_resultado text, envase_id uuid, estoque_id uuid, estoque_reservado_id uuid, entrega_id uuid, entrega_status text, atrasado boolean, bloqueios text[], pode_finalizar boolean, proxima_acao text, created_at timestamptz);
CREATE FUNCTION platform_private.h15_actor_organization() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('t.org',true),'')::uuid$$;
CREATE FUNCTION public.technical_actor_ready(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT $1=auth.uid() AND coalesce(current_setting('t.ready',true),'true')='true' AND platform_private.h15_actor_organization() IS NOT NULL$$;
CREATE FUNCTION public.has_role(uuid,public.app_role) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT $1=auth.uid() AND $2::text=current_setting('t.role',true)$$;
CREATE FUNCTION public.get_cliente_ids_for_user(uuid) RETURNS uuid[] LANGUAGE sql STABLE AS $$SELECT coalesce(nullif(current_setting('t.carteira',true),'')::uuid[],'{}')$$;
CREATE FUNCTION public._saas_user_has_feature(uuid,text) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT coalesce(current_setting('t.feature',true),'true')='true'$$;
CREATE FUNCTION public.fn_cockpit_stage(text) RETURNS text LANGUAGE sql IMMUTABLE AS $$SELECT coalesce($1,'aguardando')$$;
INSERT INTO public.clientes VALUES('a0000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000000'),('b0000000-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000000');
INSERT INTO public.mv_esteira_laboratorio(os_id,numero_os,cliente_id,status_os,atrasado,created_at) VALUES
 (gen_random_uuid(),'OS-AR','a0000000-0000-0000-0000-000000000001','aberta',false,now()),
 (gen_random_uuid(),'OS-FSF','b0000000-0000-0000-0000-000000000001','aberta',false,now()),
 (gen_random_uuid(),'OS-ORFA',NULL,'aberta',false,now());
"""
TESTS=r"""
CREATE VIEW public.vw_esteira_laboratorio WITH (security_invoker=true) AS SELECT * FROM private.h7n_esteira_laboratorio();
GRANT SELECT ON public.vw_esteira_laboratorio TO authenticated, anon;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
CREATE TABLE public.fiscal_environment_marker(project_ref text);
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
 -- RPC gates
 PERFORM set_config('t.role','producao',true);
 j:=public.rpc_cockpit_listar_esteira_v1(p_limit=>999,p_offset=>-5);
 IF (j->>'total_count')::int<>1 OR (j->>'limit')::int<>200 OR (j->>'offset')::int<>0 THEN RAISE EXCEPTION 'rpc producao %',j; END IF; RAISE NOTICE 'PASS RPC producao own tenant + clamp';
 j:=public.rpc_cockpit_listar_esteira_v1(p_busca=>$$%' OR 1=1 --$$); IF (j->>'total_count')::int<>0 THEN RAISE EXCEPTION 'inj'; END IF; RAISE NOTICE 'PASS busca literal';
 FOREACH u IN ARRAY ARRAY['financeiro','consultor_tecnico','operador_onfarm'] LOOP
   PERFORM set_config('t.role',u,true);
   BEGIN PERFORM public.rpc_cockpit_listar_esteira_v1(); RAISE EXCEPTION 'role % allowed',u; EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS RPC denies %',u; END;
 END LOOP;
 PERFORM set_config('t.role','administrador',true); PERFORM set_config('t.feature','false',true);
 BEGIN PERFORM public.rpc_cockpit_listar_esteira_v1(); RAISE EXCEPTION 'no entitlement allowed'; EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS RPC denies without plan feature'; END;
 PERFORM set_config('t.feature','true',true); PERFORM set_config('t.uid','',true);
 BEGIN PERFORM public.rpc_cockpit_listar_esteira_v1(); RAISE EXCEPTION 'anon allowed'; EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS RPC denies no uid'; END;
END $t$;
"""
def main():
    cand=(ROOT/'scripts/rbac-audit/proposed-cockpit-esteira-read-tenant-fence.sql').read_text()
    h7n=re.search(r'CREATE OR REPLACE FUNCTION private\.h7n_esteira_laboratorio\(\).*?\$function\$;',cand,re.S)[0]
    rpc=re.search(r'CREATE OR REPLACE FUNCTION public\.rpc_cockpit_listar_esteira_v1.*?\$function\$;',cand,re.S)[0]
    tmp=Path(tempfile.mkdtemp(prefix='cockpit-',dir='/tmp'));tmp.chmod(0o777)
    pre=['setpriv','--reuid=1000','--regid=1000','--clear-groups'] if os.getuid()==0 else []
    started=False
    try:
        subprocess.run(pre+['initdb','-D',str(tmp/'d'),'-A','trust','-U','postgres'],check=True,capture_output=True)
        subprocess.run(pre+['pg_ctl','-D',str(tmp/'d'),'-l',str(tmp/'log'),'-o',f'-k {tmp} -h "" -p 55491','start','-w'],check=True,capture_output=True);started=True
        f=tmp/'t.sql';f.write_text(STUB+h7n+'\n'+TESTS.replace('PROCEDURE_ok boolean;','')+'\n');f.chmod(0o644)
        sql=f.read_text().replace('DO $t$',rpc+'\nDO $t$',1)
        f.write_text(sql)
        r=subprocess.run(['psql','-h',str(tmp),'-p','55491','-U','postgres','-v','ON_ERROR_STOP=1','-f',str(f)],capture_output=True,text=True)
        if r.returncode: raise SystemExit(r.stderr[-4000:])
        print(r.stderr)
    finally:
        if started: subprocess.run(pre+['pg_ctl','-D',str(tmp/'d'),'stop','-m','immediate'],capture_output=True)
        shutil.rmtree(tmp,ignore_errors=True)
if __name__=='__main__':main()