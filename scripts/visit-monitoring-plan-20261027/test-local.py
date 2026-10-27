"""Disposable PostgreSQL, synthetic Auth/reduced schema; never hosted."""
from pathlib import Path
import tempfile, subprocess, os, shutil, time
ROOT=Path(__file__).resolve().parent
V='11111111-1111-4111-8111-111111111111'; B='44444444-4444-4444-8444-444444444444'; A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'; U='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
PLAN='{"items":["Nutrição","Estande"],"frequency":"14","triggers":"Avaliar","next_date":"2026-11-01"}'
def main():
 tmp=Path(tempfile.mkdtemp(prefix='visit-plan-',dir='/tmp')); tmp.chmod(0o777)
 prefix=['setpriv','--reuid=1000','--regid=1000','--clear-groups'] if os.getuid()==0 else []; started=False; checks=0
 def sql(q,ok=True):
  r=subprocess.run(['psql','-X','-h',str(tmp),'-p','55493','-U','postgres','-v','ON_ERROR_STOP=1','-At'],input='\\set VERBOSITY verbose\n'+q,text=True,capture_output=True)
  if ok and r.returncode: raise RuntimeError(r.stderr)
  return r
 def assert_sql(q,label):
  nonlocal checks
  if sql(q).stdout.strip()!='t': raise AssertionError(label)
  checks+=1; print('PASS',label)
 def call(actor=A,visit=V,ver='1',key='22222222-2222-4222-8222-222222222222',plan=PLAN):
  return f"SET test.actor='{actor}'; SELECT public.rpc_salvar_plano_monitoramento_visita_v1('{visit}',{ver},'{plan}'::jsonb,'{key}');"
 def error(q,code,label):
  nonlocal checks
  r=sql(q,False)
  if r.returncode==0 or code not in r.stderr: raise AssertionError(label+': '+r.stderr)
  checks+=1; print('PASS',label,code)
 try:
  subprocess.run(prefix+['initdb','-D',str(tmp/'data'),'-A','trust','-U','postgres'],check=True,capture_output=True)
  subprocess.run(prefix+['pg_ctl','-D',str(tmp/'data'),'-l',str(tmp/'log'),'-o',f'-k {tmp} -h "" -p 55493','start'],check=True,capture_output=True); started=True
  sql(f"""
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth; CREATE SCHEMA platform_private; CREATE SCHEMA cf_user_guards_v1;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('test.actor',true),'')::uuid$$;
CREATE TYPE public.app_role AS ENUM('gestor','administrador','consultor_tecnico');
CREATE TABLE actors(id uuid PRIMARY KEY,ready boolean,role app_role);
INSERT INTO actors VALUES('{A}',true,'consultor_tecnico'),('{U}',true,'consultor_tecnico');
CREATE TABLE cf_user_guards_v1.state(singleton boolean,revision bigint); INSERT INTO cf_user_guards_v1.state VALUES(true,1);
CREATE TABLE registros_consultor(id uuid PRIMARY KEY,actor_id uuid,cliente_id uuid,fazenda_id uuid,talhao_id uuid,status text,version integer,observacoes_tecnicas text,data_proxima_visita date,updated_at timestamptz DEFAULT now());
INSERT INTO registros_consultor VALUES('{V}','{A}','{A}','{A}','{A}','rascunho',1,'Notas preservadas',null,now()),('{B}','{U}','{U}','{U}','{U}','rascunho',1,'Notas B',null,now());
CREATE TABLE monitoramento_avisos(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),registro_consultor_id uuid,tipo text,data_referencia date, UNIQUE(registro_consultor_id,tipo,data_referencia));
CREATE TABLE visitas_logs(id uuid DEFAULT gen_random_uuid(),registro_consultor_id uuid,usuario_id uuid,acao text,descricao text,metadata jsonb);
CREATE FUNCTION technical_actor_ready(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT EXISTS(SELECT 1 FROM actors WHERE id=$1 AND id=auth.uid() AND ready AND role='consultor_tecnico')$$;
CREATE FUNCTION can_manage_technical_visit(uuid,uuid) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT technical_actor_ready($1) AND EXISTS(SELECT 1 FROM registros_consultor WHERE id=$2 AND actor_id=$1)$$;
CREATE FUNCTION can_view_technical_visit(uuid,uuid) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT can_manage_technical_visit($1,$2)$$;
CREATE FUNCTION has_role(uuid,app_role) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT EXISTS(SELECT 1 FROM actors WHERE id=$1 AND role=$2)$$;
CREATE FUNCTION has_active_user_cliente_access(uuid,uuid,text[]) RETURNS boolean LANGUAGE sql AS $$SELECT false$$;
CREATE FUNCTION is_visit_org_manager(uuid,uuid) RETURNS boolean LANGUAGE sql AS $$SELECT false$$;
CREATE FUNCTION platform_private.monitoring_refs_in_actor_tenant(uuid,uuid,uuid) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT technical_actor_ready(auth.uid()) AND EXISTS(SELECT 1 FROM registros_consultor WHERE id=$3 AND fazenda_id=$1 AND talhao_id=$2 AND actor_id=auth.uid())$$;
CREATE FUNCTION enforce_visit_immutability() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF OLD.status NOT IN ('rascunho','em_andamento') THEN RAISE EXCEPTION 'locked'; END IF; NEW.version:=coalesce(OLD.version,1)+1; RETURN NEW; END$$;
CREATE TRIGGER trg_enforce_visit_immutability BEFORE UPDATE ON registros_consultor FOR EACH ROW EXECUTE FUNCTION enforce_visit_immutability();
""")
  sql((ROOT/'_visita_lock_and_check.live.sql').read_text()+';')
  sql((ROOT/'candidate.sql.review').read_text())
  for ver in ['NULL','0','-1','2']: error(call(ver=ver),'PT409','mandatory/stale version '+ver)
  error(call(visit=B),'PT404','foreign origin A to B'); error(call(actor=U),'PT404','foreign origin B to A')
  sql(call()); assert_sql(f"SELECT version=2 AND observacoes_tecnicas LIKE '%Nutrição, Estande%' AND observacoes_tecnicas LIKE 'Notas preservadas%' FROM registros_consultor WHERE id='{V}';",'plan preserves semantics, exact +1')
  sql(call()); assert_sql('SELECT (SELECT count(*) FROM monitoramento_avisos)=1 AND (SELECT count(*) FROM visitas_logs)=1;','replay once')
  error(call(plan=PLAN.replace('Avaliar','Alterado')),'PT409','same key changed payload')
  sql(call(actor=U,visit=B,key='55555555-5555-4555-8555-555555555555'))
  assert_sql(f"SELECT count(*)=1 FROM monitoramento_avisos WHERE registro_consultor_id='{B}';",'own B origin')
  sql("CREATE FUNCTION fail_log() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'injected' USING ERRCODE='P9999'; END$$; CREATE TRIGGER fail_log BEFORE INSERT ON visitas_logs FOR EACH ROW EXECUTE FUNCTION fail_log();")
  error(call(ver='2',key='66666666-6666-4666-8666-666666666666',plan=PLAN.replace('11-01','11-02')),'P9999','log failure atomic rollback')
  assert_sql(f"SELECT version=2 AND data_proxima_visita='2026-11-01' FROM registros_consultor WHERE id='{V}';",'rollback visit and version')
  assert_sql(f"SELECT data_referencia='2026-11-01' FROM monitoramento_avisos WHERE registro_consultor_id='{V}';",'rollback notice')
  assert_sql("SELECT count(*)=2 FROM platform_private.visit_monitoring_plan_receipts;",'rollback receipt')
  sql('DROP TRIGGER fail_log ON visitas_logs;')
  # Concurrent sessions wait on canonical gate, not a sleep-based race guess.
  def spawn(q):
   return subprocess.Popen(['psql','-X','-h',str(tmp),'-p','55493','-U','postgres','-v','ON_ERROR_STOP=1','-At'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
  gate=spawn(''); gate.stdin.write('BEGIN; SELECT * FROM cf_user_guards_v1.state FOR UPDATE;\n'); gate.stdin.flush()
  time.sleep(.2)
  p1=spawn(''); p1.stdin.write(call(ver='2',key='77777777-7777-4777-8777-777777777777')+'\n'); p1.stdin.close()
  p2=spawn(''); p2.stdin.write(call(ver='2',key='77777777-7777-4777-8777-777777777777')+'\n'); p2.stdin.close()
  for _ in range(100):
   if int(sql("SELECT count(*) FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE '%rpc_salvar_plano%';").stdout.strip())==2: break
   time.sleep(.02)
  else: raise AssertionError('both sessions not waiting')
  gate.stdin.write('COMMIT;\n'); gate.stdin.close(); gate.wait(timeout=10)
  for p in [p1,p2]:
   p.wait(timeout=10)
   if p.returncode: raise AssertionError(p.stderr.read())
  assert_sql(f"SELECT version=3 FROM registros_consultor WHERE id='{V}';",'concurrent double submit one increment')
  assert_sql(f"SELECT count(*)=2 FROM visitas_logs WHERE registro_consultor_id='{V}';",'concurrent receipt/log once')
  # Revoke role while save waits on gate: mutable Auth is synthetic, re-read after lock.
  gate=spawn(''); gate.stdin.write('BEGIN; SELECT * FROM cf_user_guards_v1.state FOR UPDATE;\n'); gate.stdin.flush(); time.sleep(.2)
  p=spawn(''); p.stdin.write('\\set VERBOSITY verbose\n'+call(ver='3',key='88888888-8888-4888-8888-888888888888')+'\n'); p.stdin.close()
  for _ in range(100):
   if int(sql("SELECT count(*) FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE '%rpc_salvar_plano%';").stdout.strip())==1: break
   time.sleep(.02)
  else: raise AssertionError('revocation session not waiting')
  sql(f"UPDATE actors SET ready=false WHERE id='{A}';")
  gate.stdin.write('COMMIT;\n'); gate.stdin.close(); gate.wait(timeout=10); p.wait(timeout=10)
  if p.returncode==0 or 'PT404' not in p.stderr.read(): raise AssertionError('revocation accepted')
  checks+=1; print('PASS revoke during gate wait PT404')
  assert_sql(f"SELECT version=3 FROM registros_consultor WHERE id='{V}';",'revocation no write')
  error(call(),'42501','revoked replay denied')
  print('TOTAL',checks)
 finally:
  if started: subprocess.run(prefix+['pg_ctl','-D',str(tmp/'data'),'stop','-m','immediate'],capture_output=True)
  shutil.rmtree(tmp)
if __name__=='__main__': main()
