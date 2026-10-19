"""Disposable PostgreSQL; actual reader body, reduced RLS/Auth, NOT hosted JWT."""
from pathlib import Path
import os,re,shutil,subprocess,tempfile
R=Path(__file__).resolve().parent
archive=(R.parent/'tests/cockpit-esteira-fence-local.py').read_text()
stub=re.search(r'STUB=r"""(.*?)"""',archive,re.S)[1]
stub=stub.replace('CREATE TABLE public.profiles(user_id uuid, nome text);','CREATE TABLE public.profiles(user_id uuid, nome text, organization_id uuid, ativo boolean);').replace('responsavel_id uuid, responsavel text);','responsavel_id uuid, responsavel text, organization_id uuid);')
stub+='''
CREATE TABLE public.fiscal_environment_marker(project_ref text);
INSERT INTO public.fiscal_environment_marker VALUES('swzpzcwiasxmjutrmvkm');
CREATE VIEW public.vw_esteira_laboratorio WITH (security_invoker=true) AS SELECT * FROM public.mv_esteira_laboratorio;
ALTER TABLE public.mv_esteira_laboratorio ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.mv_esteira_laboratorio,public.vw_esteira_laboratorio,public.profiles,public.programacao_producao,public.clientes TO authenticated;
CREATE POLICY tenant_read ON public.mv_esteira_laboratorio TO authenticated USING (EXISTS(SELECT 1 FROM public.clientes c WHERE c.id=cliente_id AND c.organization_id=platform_private.h15_actor_organization()));
UPDATE public.mv_esteira_laboratorio SET status_esteira_oficial='programada',programacao_id=gen_random_uuid();
'''
sig='public.rpc_cockpit_listar_esteira_v1(text,text[],text[],text[],boolean,date,date,boolean,integer,integer)'
tests=f'''
REVOKE ALL ON FUNCTION {sig} FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION {sig} TO authenticated;
SET ROLE authenticated;
SELECT set_config('t.org','aaaaaaaa-0000-0000-0000-000000000000',false);
DO $t$ DECLARE j jsonb; BEGIN
 j:=public.rpc_cockpit_listar_esteira_v1();
 IF j->>'total_count'<>'1' OR j->'items'->0->>'numero_os'<>'OS-AR' OR j->'items'->0->>'status_esteira_oficial'<>'aberta' THEN RAISE EXCEPTION 'OPEN_PARENT_OR_TENANT_LEAK'; END IF;
 IF public.rpc_cockpit_listar_esteira_v1(p_stages=>ARRAY['aberta'])->>'total_count'<>'1' OR public.rpc_cockpit_listar_esteira_v1(p_stages=>ARRAY['programada'])->>'total_count'<>'0' THEN RAISE EXCEPTION 'FILTER_MISMATCH'; END IF;
 RAISE NOTICE 'PASS open parent, waiting child, matching filters';
END $t$;
RESET ROLE;
UPDATE public.mv_esteira_laboratorio SET status_os='aprovada' WHERE numero_os='OS-AR';
SET ROLE authenticated;
DO $t$ BEGIN IF public.rpc_cockpit_listar_esteira_v1()->'items'->0->>'status_esteira_oficial'<>'aprovada' THEN RAISE EXCEPTION 'APPROVED_PARENT'; END IF; RAISE NOTICE 'PASS approved parent'; END $t$;
SELECT set_config('t.org','bbbbbbbb-0000-0000-0000-000000000000',false);
DO $t$ BEGIN IF public.rpc_cockpit_listar_esteira_v1()->'items'->0->>'numero_os'<>'OS-FSF' OR public.rpc_cockpit_listar_esteira_v1()->>'total_count'<>'1' THEN RAISE EXCEPTION 'CROSS_TENANT_LEAK'; END IF; RAISE NOTICE 'PASS other tenant'; END $t$;
SELECT set_config('t.org','',false);
DO $t$ BEGIN IF public.rpc_cockpit_listar_esteira_v1()->>'total_count'<>'0' THEN RAISE EXCEPTION 'NULL_TENANT_LEAK'; END IF; RAISE NOTICE 'PASS null tenant'; END $t$;
RESET ROLE;
UPDATE public.mv_esteira_laboratorio SET status_os='em_producao',status_esteira_oficial='em_producao' WHERE numero_os='OS-AR';
SET ROLE authenticated;
SELECT set_config('t.org','aaaaaaaa-0000-0000-0000-000000000000',false);
DO $t$ BEGIN IF public.rpc_cockpit_listar_esteira_v1()->'items'->0->>'status_esteira_oficial'<>'em_producao' THEN RAISE EXCEPTION 'DOWNSTREAM_CHANGED'; END IF; RAISE NOTICE 'PASS downstream unchanged'; END $t$;
RESET ROLE;
'''
tmp=Path(tempfile.mkdtemp(prefix='cockpit-status-',dir='/tmp'));tmp.chmod(0o777)
pre=['setpriv','--reuid=1000','--regid=1000','--clear-groups'] if os.getuid()==0 else []
started=False
try:
 subprocess.run(pre+['initdb','-D',str(tmp/'d'),'-A','trust','-U','postgres'],check=True,capture_output=True)
 subprocess.run(pre+['pg_ctl','-D',str(tmp/'d'),'-l',str(tmp/'log'),'-o',f'-k {tmp} -h "" -p 55492','start','-w'],check=True,capture_output=True);started=True
 def run(sql,ok=True):
  f=tmp/'t.sql';f.write_text(sql);f.chmod(0o644)
  out=subprocess.run(['psql','-h',str(tmp),'-p','55492','-U','postgres','-v','ON_ERROR_STOP=1','-f',str(f)],capture_output=True,text=True)
  if (out.returncode==0)!=ok:raise RuntimeError(out.stderr[-3500:])
  return out
 run(stub+(R/'rollback/reader.sql.review').read_text())
 out=run((R/'candidate.sql.review').read_text(),False)
 assert 'READER_SECURITY_DRIFT' in out.stderr or 'CHAIN_BODY_DRIFT' in out.stderr, out.stderr
 print('PASS complete candidate rejects reduced catalog; NOT full preflight PASS')
 out=run((R/'reader.sql.review').read_text()+tests);print(out.stderr)
 run((R/'rollback/reader.sql.review').read_text())
 run("SET ROLE authenticated; SELECT set_config('t.org','aaaaaaaa-0000-0000-0000-000000000000',false); DO $t$ BEGIN IF public.rpc_cockpit_listar_esteira_v1()->>'total_count'<>'1' THEN RAISE EXCEPTION 'ROLLBACK_LEAK'; END IF; END $t$;")
 print('PASS rollback reader isolation (reduced schema)')
finally:
 if started:subprocess.run(pre+['pg_ctl','-D',str(tmp/'d'),'stop','-m','immediate'],capture_output=True)
 shutil.rmtree(tmp,ignore_errors=True)