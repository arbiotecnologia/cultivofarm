"""Disposable PostgreSQL: captured real STABLE bodies, target triggers and refresh views.
Auth UID/JWT transport is synthetic; not hosted JWT/RLS certification.
"""
from pathlib import Path
import json,subprocess,tempfile,os,shutil,re,time,hashlib,importlib.util
H=Path(__file__).resolve().parent
q=lambda n:"'00000000-0000-4000-8000-%012d'"%n
A,B,U,C,P,O,PP,V,F,M,PLAN,SUB=[q(n) for n in range(1,13)]
def setup():
 c=json.loads((H/'catalog.json').read_text());r=json.loads((H/'refresh-catalog.json').read_text());t=json.loads((H/'transitive-catalog.json').read_text());d=json.loads((H/'schema-catalog.json').read_text())
 for j in [c,r,t,d]:assert j['ref']=='swzpzcwiasxmjutrmvkm'
 sql="CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth; CREATE SCHEMA private; CREATE SCHEMA platform_private; CREATE TABLE auth.users(id uuid PRIMARY KEY); SET check_function_bodies=off;\n"
 sql+="CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;\n"
 for name,vals in c['enums'].items():sql+=f'CREATE TYPE public.{name} AS ENUM ('+','.join("'"+v+"'" for v in vals)+');\n'
 tables={}
 for col in d['columns']:tables.setdefault(col['table'],[]).append(col)
 for name,cols in tables.items():
  sql+='CREATE TABLE public."'+name+'" ('+','.join('"'+x['name']+'" '+x['type']+(' NOT NULL' if x['notnull'] else '') for x in cols)+');\n'
 # All captured PK/UNIQUE/FK/CHECK constraints (including target/FK phantom guarantees).
 for kind in ['PRIMARY KEY','UNIQUE','CHECK','FOREIGN KEY']:
  for x in t['constraints']:
   if x['definition'].startswith(kind) and (kind!='CHECK' or x['table'] in {'ordens_servico','programacao_producao','lotes','production_order_link','profiles','user_roles','organizations','clientes','produtos','fazendas','talhoes','saas_plans','saas_modules','saas_features','saas_plan_versions','saas_plan_version_features','organization_subscriptions','organization_feature_overrides','platform_org_admin_invites'}):sql+=f'ALTER TABLE public.{x["table"]} ADD CONSTRAINT "{x["name"]}" {x["definition"]};\n'
 # Real view chain in dependency order. No mocked/empty refresh function.
 for view in reversed(r['views']):sql+=f'CREATE {"MATERIALIZED " if view["kind"]=="m" else ""}VIEW public.{view["name"]} AS '+view['definition']+';\n'
 funcs={}
 for f in t['functions']+d['functions']+c['functions']: funcs[f['sig']]=f['definition']
 for trg in c['triggers']: funcs[trg['body'].split('\n')[0]]=trg['body']
 sql+='\n'.join(defn+';' for defn in funcs.values())+'\n'
 # Defaults used in execution/fixtures: exact captured expressions without unavailable legacy generators.
 for x in d['columns']:
  default=x['default']
  if default and not x['generated'] and not x['identity'] and not re.search(r'nextval|public\.|generate|gerar',default):
   sql+=f'ALTER TABLE public.{x["table"]} ALTER COLUMN "{x["name"]}" SET DEFAULT {default};\n'
 # Seed before installing target triggers; SQL-only disposable fixtures, never hosted.
 sql+=f"INSERT INTO auth.users VALUES({U}); INSERT INTO organizations(id,nome) VALUES({A},'local A'),({B},'local B'); INSERT INTO profiles(user_id,organization_id) VALUES({U},{A}); INSERT INTO user_roles(user_id,role) VALUES({U},'administrador');\n"
 sql+=f"INSERT INTO clientes(id,nome,codigo_cliente,organization_id) VALUES({C},'local','LOCAL',{A}); INSERT INTO produtos(id,nome,tipo,familia_catalogo) VALUES({P},'local bio','fungicida','biologico');\n"
 sql+=f"INSERT INTO fazendas(id,nome,cliente_id,organization_id) VALUES({q(21)},'local',{C},{A}); INSERT INTO talhoes(id,nome,fazenda_id,area_hectares,organization_id) VALUES({q(22)},'local',{q(21)},1,{A});\n"
 sql+=f"INSERT INTO saas_plans(id,name,key) VALUES({PLAN},'local','local'); INSERT INTO saas_modules(id,key,name) VALUES({M},'local','local'); INSERT INTO saas_features(id,module_id,key,name) VALUES({F},{M},'ordens_producao','local'); INSERT INTO saas_plan_versions(id,plan_id,version_number,name_snapshot,status,effective_from,price_amount,currency,billing_cycle,trial_days,published_at,features_snapshot) VALUES({V},{PLAN},1,'local','PUBLISHED',now()-interval '1 day',1,'BRL','monthly',14,now(),'[\"ordens_producao\"]'); INSERT INTO saas_plan_version_features(plan_version_id,feature_id,enabled) VALUES({V},{F},true); INSERT INTO organization_subscriptions(id,organization_id,plan_id,plan_version_id,status) VALUES({SUB},{A},{PLAN},{V},'ACTIVE');\n"
 sql+=f"INSERT INTO partner_accounts(id,razao_social) VALUES({q(81)},'local'); INSERT INTO partner_orders(id,numero,partner_id) VALUES({q(82)},'LOCAL-PB',{q(81)}); INSERT INTO partner_order_items(id,order_id,quantidade) VALUES({q(83)},{q(82)},1); INSERT INTO production_planning(id,partner_order_id,partner_id) VALUES({q(84)},{q(82)},{q(81)});\n"
 sql+=f"INSERT INTO ordens_servico(id,numero_os,cliente_id,fazenda_id,talhao_id,produto_id,organization_id,status,volume_total_ml) VALUES({O},'LOCAL-1',{C},{q(21)},{q(22)},{P},{A},'aprovada',100); INSERT INTO programacao_producao(id,organization_id,ordem_servico_id,produto_id,volume_necessario) VALUES({PP},{A},{O},{P},100);\n"
 for trg in c['triggers']:sql+=trg['definition']+';\n'
 sql+=(H/'rpc.sql.review').read_text()
 sql+="REVOKE ALL ON FUNCTION public.rpc_programar_os_v1(uuid,text,date) FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.rpc_programar_os_v1(uuid,text,date) TO service_role;\n"
 return sql

def main():
 tmp=Path(tempfile.mkdtemp(prefix='program-real-',dir='/tmp'));tmp.chmod(0o777)
 pre=['setpriv','--reuid=1000','--regid=1000','--clear-groups'] if os.getuid()==0 else []
 started=False;results=[]
 try:
  subprocess.run(pre+['initdb','-D',str(tmp/'data'),'-A','trust','-U','postgres'],check=True,capture_output=True)
  subprocess.run(pre+['pg_ctl','-D',str(tmp/'data'),'-l',str(tmp/'log'),'-o',f'-k {tmp} -h "" -p 55494','start','-w'],check=True,capture_output=True);started=True
  conn=['psql','-X','-h',str(tmp),'-p','55494','-U','postgres','-v','ON_ERROR_STOP=1','-At']
  def run(sql,ok=True):
   res=subprocess.run(conn,input=sql,capture_output=True,text=True)
   if ok and res.returncode:raise AssertionError(res.stdout[-1000:]+res.stderr[-3000:])
   return res
  s=setup();(tmp/'setup.sql').write_text(s);run(s)
  actor=f"SELECT set_config('request.jwt.claim.sub',{U},false),set_config('request.jwt.claims','{{\"iat\":2000000000}}',false);"
  call=f"public.rpc_programar_os_v1({O},'manual','2026-10-20')"
  def test(label,expr):
   run(actor+f"DO $$BEGIN IF ({expr}) IS NOT TRUE THEN RAISE EXCEPTION 'FAIL {label}'; END IF; END$$;");results.append(label)
  def deny(label,change,undo):
   run(change);test(label,f"(SELECT public.technical_actor_ready({U}) AND public._saas_user_has_feature({U},'ordens_producao') AND public.has_role({U},'administrador')) IS NOT TRUE")
   out=run(actor+'SELECT '+call+';',False);assert out.returncode and 'PROGRAMAR_SCOPE_DENIED' in out.stderr,out.stderr
   run(undo)
  deny('real STABLE profile revocation',f'UPDATE profiles SET ativo=false WHERE user_id={U};',f'UPDATE profiles SET ativo=true WHERE user_id={U};')
  deny('real STABLE role deletion',f'DELETE FROM user_roles WHERE user_id={U};',f"INSERT INTO user_roles(user_id,role) VALUES({U},'administrador');")
  deny('real SaaS revoked',f"UPDATE organization_subscriptions SET status='EXPIRED' WHERE id={SUB};",f"UPDATE organization_subscriptions SET status='ACTIVE' WHERE id={SUB};")
  test('onfarm closed',f"(public.rpc_programar_os_v1({O},'onfarm','2026-10-20')->>'success')='false'")
  test('explicit date required',f"(public.rpc_programar_os_v1({O},'manual',NULL)->>'success')='false'")
  for label,change,expr in [
   ('responsible NULL only',f"UPDATE programacao_producao SET responsavel_id=(SELECT id FROM profiles WHERE user_id={U}) WHERE id={PP};",None),
   ('wrong tenant denied',f"UPDATE profiles SET organization_id={B} WHERE user_id={U};",None),
   ('foreign caller missing row same denial','',None),
  ]:
   invocation=call if label!='foreign caller missing row same denial' else f"public.rpc_programar_os_v1({q(99)},'manual','2026-10-20')"
   code=f"IF ({expr}) IS NOT TRUE THEN RAISE EXCEPTION 'BAD'; END IF;" if expr else f"BEGIN PERFORM {invocation}; RAISE EXCEPTION 'BAD'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;"
   run(actor+'BEGIN;'+change+f'DO $$BEGIN {code} END$$;ROLLBACK;');results.append(label)
  # Local setup can install an already-open synthetic OS without forcing a runtime transition.
  # Concrete state tests performed in a fresh fixture with the installed real triggers.
  test('manual approved programs',f"({call}->>'success')='true'")
  test('actual downstream no lot or extra child',f"(SELECT count(*) FROM programacao_producao)=1 AND NOT EXISTS(SELECT 1 FROM lotes) AND (SELECT volume_total_ml FROM ordens_servico WHERE id={O})=100 AND (SELECT volume_necessario FROM programacao_producao WHERE id={PP})=100")
  test('actual MV refresh reflects programmed',f"EXISTS(SELECT 1 FROM mv_esteira_laboratorio WHERE os_id={O} AND status_os='programada' AND data_programada='2026-10-20')")
  test('same date replay exactly one event',f"({call}->>'replay')='true' AND (SELECT count(*) FROM laboratorio_esteira_eventos)=1")
  test('different date denied',f"(public.rpc_programar_os_v1({O},'manual','2026-10-21')->>'success')='false'")
  hash=run("SELECT md5(pg_get_functiondef('public.rpc_programar_os_v1(uuid,text,date)'::regprocedure));").stdout.strip()
  (H/'post-hashes.json').write_text(json.dumps({'public.rpc_programar_os_v1(uuid,text,date)':hash},indent=2)+'\n')
  # Supplied 15:28 baseline is the captured body, with only a SQL terminator added.
  # Verify canonical pg_get_functiondef BEFORE the assembler builds any rollback.
  run((H/'rollback/rpc.sql.review').read_text())
  assert run("SELECT md5(pg_get_functiondef('public.rpc_programar_os_v1(uuid,text,date)'::regprocedure));").stdout.strip()=='a42d6b07f51e6dacf41096f6cefb8163'
  results.append('supplied baseline pg_get_functiondef a42d6 verified before assembly')
  assert run("SELECT md5(pg_get_functiondef('platform_private.entitlements_for_user(uuid)'::regprocedure));").stdout.strip()=='7f4ec7facaebbdf35444dd490fdebe56'
  results.append('supplied real STABLE entitlements definition fingerprint matches capture')
  run((H/'rpc.sql.review').read_text())
  # Compile/evaluate every supplemental catalog SELECT against the real local schema.
  # Missing fingerprints are expected in this partial clone; SQL errors are not.
  spec=importlib.util.spec_from_file_location('program_assemble',H/'assemble.py')
  assembler=importlib.util.module_from_spec(spec);spec.loader.exec_module(assembler);assembler.main()
  checks=assembler.supplemental(True).splitlines()[2:-1]
  for line in checks:
   expression=line.removeprefix('IF ').split(' THEN RAISE EXCEPTION')[0]
   run('SELECT '+expression+';')
  results.append('every supplemental catalog predicate compiles and evaluates')
  for name in ['preflight-readonly.sql','candidate.sql.review','postflight-readonly.sql','rollback.sql.review']:
   before=run("SELECT md5(pg_get_functiondef('public.rpc_programar_os_v1(uuid,text,date)'::regprocedure)),proacl::text FROM pg_proc WHERE oid='public.rpc_programar_os_v1(uuid,text,date)'::regprocedure;").stdout
   rejected=run((H/name).read_text(),False)
   assert rejected.returncode and ('DRIFT' in rejected.stderr or 'WRONG_PROJECT' in rejected.stderr),rejected.stderr
   assert run("SELECT md5(pg_get_functiondef('public.rpc_programar_os_v1(uuid,text,date)'::regprocedure)),proacl::text FROM pg_proc WHERE oid='public.rpc_programar_os_v1(uuid,text,date)'::regprocedure;").stdout==before
   results.append('intact '+name+' rejects incomplete clone without definition/ACL changes')
  # Independent rollback connection, no TEMP table/capture.
  run((H/'rollback/rpc.sql.review').read_text()+"REVOKE ALL ON FUNCTION public.rpc_programar_os_v1(uuid,text,date) FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.rpc_programar_os_v1(uuid,text,date) TO service_role;")
  assert run("SELECT md5(pg_get_functiondef('public.rpc_programar_os_v1(uuid,text,date)'::regprocedure));").stdout.strip()=='a42d6b07f51e6dacf41096f6cefb8163'
  results.append('exact baseline restored separate connection')
  assert run("SELECT proacl::text FROM pg_proc WHERE oid='public.rpc_programar_os_v1(uuid,text,date)'::regprocedure;").stdout.strip()=='{postgres=X/postgres,service_role=X/postgres}'
  results.append('exact postgres/service_role ACL restored')
  run((H/'rpc.sql.review').read_text())
  # Reset in disposable local schema before fresh concurrent requests; triggers remain real.
  def reset():
   # Existing transition guard intentionally refuses backward status: replace fixture via clean DB rebuild.
   run('DROP SCHEMA public CASCADE; DROP SCHEMA auth CASCADE; DROP SCHEMA private CASCADE; DROP SCHEMA platform_private CASCADE; CREATE SCHEMA public; DROP ROLE anon; DROP ROLE authenticated; DROP ROLE service_role;'+setup())
  def spawn(sql):return subprocess.Popen(conn,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
  def start(sql):
   proc=spawn(sql);proc.stdin.write(sql);proc.stdin.close();proc.stdin=None;return proc
  def wait(name,event):
   end=time.monotonic()+5
   while time.monotonic()<end:
    if run(f"SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='{name}' AND {event});").stdout.strip()=='t':return
    time.sleep(.03)
   raise AssertionError('wait not reached '+name)
  reset()
  first=start(actor+'BEGIN; SELECT '+call+';SELECT pg_sleep(1);COMMIT;')
  second=start(actor+'SELECT '+call+';')
  outs=[first.communicate(timeout=15),second.communicate(timeout=15)]
  assert first.returncode==second.returncode==0,outs
  joined=''.join(o[0] for o in outs);assert joined.count('"replay": false')==1 and joined.count('"replay": true')==1,joined
  results.append('two connections real triggers one write one replay')
  for name,change in [('profile',f'UPDATE profiles SET ativo=false WHERE user_id={U};'),('role',f'DELETE FROM user_roles WHERE user_id={U};'),('subscription',f"UPDATE organization_subscriptions SET status='EXPIRED' WHERE id={SUB};")]:
   reset();holder=start(f"SET application_name='holder';BEGIN;SELECT id FROM ordens_servico WHERE id={O} FOR UPDATE;SELECT pg_sleep(2);COMMIT;")
   wait('holder',"wait_event='PgSleep'")
   waiting=start("SET application_name='waiting';"+actor+'SELECT '+call+';')
   wait('waiting',"wait_event_type='Lock'");run(change)
   a=holder.communicate(timeout=15);b=waiting.communicate(timeout=15)
   assert holder.returncode==0 and waiting.returncode!=0 and 'PROGRAMAR_SCOPE_DENIED' in b[1],(a,b)
   assert run(f"SELECT status FROM ordens_servico WHERE id={O};").stdout.strip()=='aprovada'
   results.append('wait then '+name+' revocation real STABLE no write')
  # B2B link present is rejected, without calling commercial recalculation.
  reset()
  run(f"INSERT INTO production_order_link(id,ordem_servico_id,partner_order_id,partner_order_item_id,planning_id) VALUES({q(91)},{O},{q(82)},{q(83)},{q(84)});")
  test('existing B2B production link denied',f"({call}->>'success')='false'")
  reset()
  # Four callers: current role table, not caller-supplied role flags.
  for role in ['administrativo','financeiro','consultor_tecnico','superadmin']:
   run(f"UPDATE user_roles SET role='{role}' WHERE user_id={U};")
   out=run(actor+'SELECT '+call+';',False);assert out.returncode and 'PROGRAMAR_SCOPE_DENIED' in out.stderr
   results.append('role '+role+' denied')
  reset()
  for role in ['gestor','producao']:
   run(f"UPDATE user_roles SET role='{role}' WHERE user_id={U};")
   test(role+' programs approved manual',f"({call}->>'success')='true'")
   reset()
  # Open fixture installed before triggers; no disabled runtime trigger or artificial transition.
  run('DROP SCHEMA public CASCADE; DROP SCHEMA auth CASCADE; DROP SCHEMA private CASCADE; DROP SCHEMA platform_private CASCADE; CREATE SCHEMA public; DROP ROLE anon; DROP ROLE authenticated; DROP ROLE service_role;'+setup().replace("'aprovada',100); INSERT INTO programacao", "'aberta',100); INSERT INTO programacao"))
  test('open OS no autoapproval',f"({call}->>'success')='false' AND (SELECT status FROM ordens_servico WHERE id={O})='aberta'")
  # Immediate FK insertion waits behind parent row UPDATE; no global link/lot SHARE.
  for table,insert in [('link',f"INSERT INTO production_order_link(id,ordem_servico_id,partner_order_id,partner_order_item_id,planning_id) VALUES({q(91)},{O},{q(82)},{q(83)},{q(84)});"),('lot',f"INSERT INTO lotes(id,codigo_lote,produto_id,programacao_id,status,volume_produzido,data_producao) VALUES({q(92)},'LOCAL-LOT',{P},{PP},'em_producao',100,current_date);")]:
   reset();parent='ordens_servico' if table=='link' else 'programacao_producao';id=O if table=='link' else PP
   holder=start(f"SET application_name='holder';BEGIN;SELECT id FROM {parent} WHERE id={id} FOR UPDATE;SELECT pg_sleep(1);ROLLBACK;");wait('holder',"wait_event='PgSleep'")
   writer=start("SET application_name='writer';"+insert);wait('writer',"wait_event_type='Lock'")
   holder.communicate(timeout=10);out=writer.communicate(timeout=10);assert writer.returncode==0,out
   results.append('real immediate FK '+table+' insertion fenced by parent')
  reset()
  holder=start("SET application_name='mvholder';BEGIN;REFRESH MATERIALIZED VIEW mv_esteira_laboratorio;SELECT pg_sleep(4);ROLLBACK;")
  wait('mvholder',"wait_event='PgSleep'")
  denied=run(actor+'SELECT '+call+';',False)
  holder.communicate(timeout=10)
  assert denied.returncode and 'lock timeout' in denied.stderr,denied.stderr
  assert run(f"SELECT status FROM ordens_servico WHERE id={O}; SELECT count(*) FROM laboratorio_esteira_eventos;").stdout.strip()=='aprovada\n0'
  results.append('real global MV contention timeout rolls back whole operation')
  reset()
  # Canonical RPC with SQL role authenticated; synthetic claims, NOT a hosted JWT.
  run("GRANT USAGE ON SCHEMA public TO authenticated; REVOKE ALL ON FUNCTION public.rpc_programar_os_v1(uuid,text,date) FROM PUBLIC,anon,service_role; GRANT EXECUTE ON FUNCTION public.rpc_programar_os_v1(uuid,text,date) TO authenticated;")
  assert run("SELECT proacl::text FROM pg_proc WHERE oid='public.rpc_programar_os_v1(uuid,text,date)'::regprocedure;").stdout.strip()=='{postgres=X/postgres,authenticated=X/postgres}'
  results.append('candidate exact postgres/authenticated ACL no service role grant')
  out=run(actor+'SET ROLE authenticated;SELECT '+call+';')
  assert '"success": true' in out.stdout,out
  results.append('local authenticated SQL role canonical RPC after minimal grant')
  out=run(actor+'SET ROLE anon;SELECT '+call+';',False);assert out.returncode
  results.append('local anon remains denied')
  report={'hosted_writes':False,'auth_transport':'synthetic UID/JWT; no authenticated hosted request','schema':'all public captured columns/types, all PK/UNIQUE/FKs and CHECKs of target/auth/SaaS/reference tables; all 23 target triggers; real refresh view chain; not every unrelated trigger/policy','passed':results,'candidate_md5':hash}
  (H/'real-test-results.json').write_text(json.dumps(report,indent=2)+'\n')
  print(json.dumps(report,indent=2))
 finally:
  if started:subprocess.run(pre+['pg_ctl','-D',str(tmp/'data'),'stop','-m','immediate'],capture_output=True)
  shutil.rmtree(tmp,ignore_errors=True)
if __name__=='__main__':main()
