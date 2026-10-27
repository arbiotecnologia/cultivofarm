"""Disposable PG17, explicit synthetic Auth/schema/stubs; never hosted credentials.
Loads exact captured operation bodies, then the generated hardening candidate.
This is NOT stock/ledger integration or JWT/RLS homologation."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time

H=Path(__file__).resolve().parent
PG=Path('/nix/store/avg1rhq9w93k03qmdaklazcsapn45zpd-postgresql-17.9/bin')
U='00000000-0000-4000-8000-000000000001'
V='00000000-0000-4000-8000-000000000002'
A='00000000-0000-4000-8000-000000000003'
B='00000000-0000-4000-8000-000000000004'
C='00000000-0000-4000-8000-000000000005'
O='00000000-0000-4000-8000-000000000006'
S='00000000-0000-4000-8000-000000000007'
E='00000000-0000-4000-8000-000000000008'
checks=[]

def main():
 tmp=Path(tempfile.mkdtemp(prefix='stage5-pg-',dir='/tmp'));tmp.chmod(0o777)
 pre=['setpriv','--reuid=1000','--regid=1000','--clear-groups'] if os.getuid()==0 else []
 env={**os.environ,'PATH':str(PG)+':'+os.environ['PATH']}
 base=[str(PG/'psql'),'-X','-h',str(tmp),'-p','55538','-U','postgres','-At','-v','ON_ERROR_STOP=1']
 def sql(q,required=True):
  r=subprocess.run(base,input=q,text=True,capture_output=True,env=env)
  if required and r.returncode: raise AssertionError(r.stderr)
  return r
 def ok(q,label):
  r=sql(q).stdout.strip().splitlines()
  if not r or r[-1]!='t':raise AssertionError(label+':'+str(r))
  checks.append(label);print('PASS',label)
 def err(q,code,label):
  r=sql('\\set VERBOSITY verbose\n'+q,False)
  if not r.returncode or code not in r.stderr:raise AssertionError(label+':'+r.stderr+r.stdout)
  checks.append(label);print('PASS',label,code)
 def actor(u=U):return f"SET ROLE authenticated; SET request.jwt.claim.sub='{u}';"
 def session():
  p=subprocess.Popen(base,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,env=env)
  def send(q):p.stdin.write(q+'\n');p.stdin.flush()
  return p,send
 def waiting():
  deadline=time.time()+2
  while time.time()<deadline:
   if int(sql("SELECT count(*) FROM pg_stat_activity WHERE wait_event_type='Lock' AND pid<>pg_backend_pid()").stdout.strip())>0:return
   time.sleep(.02)
  raise AssertionError('lock wait not observed')
 started=False
 try:
  subprocess.run(pre+[str(PG/'initdb'),'-D',str(tmp/'d'),'-A','trust','-U','postgres'],check=True,capture_output=True,env=env)
  subprocess.run(pre+[str(PG/'pg_ctl'),'-D',str(tmp/'d'),'-l',str(tmp/'log'),'-o',f'-k {tmp} -h "" -p 55538','start'],check=True,capture_output=True,env=env);started=True
  schema="CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth; CREATE SCHEMA platform_private; CREATE SCHEMA cf_user_guards_v1; SET check_function_bodies=off;"
  schema+="CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;"
  catalog=json.loads((H.parent/'os-programming-recovery/catalog.json').read_text())
  for name,vals in catalog['enums'].items():schema+=f"CREATE TYPE public.{name} AS ENUM ("+','.join("'"+v+"'" for v in vals)+');'
  table_names={'organizations','profiles','user_roles','user_clientes','clientes','ordens_servico','ordens_servico_onfarm','estoque_produto','estoque_movimentacoes','entregas','laboratorio_esteira_eventos'}
  cols=json.loads((H.parent/'os-programming-recovery/schema-catalog.json').read_text())['columns']
  for name in table_names:
   columns=[c for c in cols if c['table']==name]
   schema+='CREATE TABLE public.'+name+'('+','.join('"'+c['name']+'" '+c['type'] for c in columns)+');'
  schema+="ALTER TABLE entregas ALTER COLUMN id SET DEFAULT gen_random_uuid(); ALTER TABLE entregas ALTER COLUMN created_at SET DEFAULT now(); CREATE TABLE cf_user_guards_v1.state(singleton boolean PRIMARY KEY,revision bigint); INSERT INTO cf_user_guards_v1.state VALUES(true,1);"
  # Stub seams explicitly excluded from integration claims.
  schema+="""CREATE FUNCTION public.has_role(u uuid,r app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$SELECT EXISTS(SELECT 1 FROM user_roles WHERE user_id=u AND role=r)$$;
CREATE FUNCTION public.technical_actor_ready(u uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$SELECT EXISTS(SELECT 1 FROM profiles WHERE user_id=u AND ativo IS TRUE)$$;
CREATE FUNCTION public._saas_user_has_feature(u uuid,k text) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT k='ordens_producao'$$;
CREATE FUNCTION public._rpc_avancar_esteira_laboratorio_internal(uuid,text,text,uuid) RETURNS jsonb LANGUAGE sql AS $$SELECT '{"success":true}'::jsonb$$;
CREATE FUNCTION public.fn_mark_entrega_not_billable(e uuid,m text) RETURNS void LANGUAGE plpgsql AS $$BEGIN PERFORM 1 FROM cf_user_guards_v1.state WHERE singleton FOR SHARE; PERFORM pg_advisory_xact_lock(hashtext('entrega_faturar:'||e)); PERFORM 1 FROM entregas WHERE id=e FOR UPDATE; END$$;
CREATE FUNCTION public.rpc_estoque_operar_v1(text,uuid,numeric,text,jsonb) RETURNS jsonb LANGUAGE sql AS $$SELECT '{"success":true}'::jsonb$$;
CREATE FUNCTION public.rpc_cockpit_cancelar_reserva_v1(uuid,uuid,text,text) RETURNS jsonb LANGUAGE sql AS $$SELECT '{"success":true}'::jsonb$$;
GRANT USAGE ON SCHEMA auth,public TO anon,authenticated;"""
  sql(schema)
  fs=json.loads((H/'live/definitions.json').read_text())['functions']
  for n in ['public.fn_cockpit_norm_origem','public.fn_cockpit_assert_operador_origem','public.fn_entrega_assert_confirmador','public.fn_estoque_ctx_open','public.rpc_cockpit_criar_entrega_v1','public.fn_entrega_confirmar_engine_v1','public.rpc_entrega_cancelar_v1','public.rpc_entrega_confirmar_v1']:
   sql(fs[n]['definition'])
   ok(f"SELECT md5(pg_get_functiondef(oid))='{fs[n]['md5']}' FROM pg_proc WHERE proname='{n.split('.')[-1]}'",'exact LIVE body '+n)
  def reset():
   sql(f"TRUNCATE organizations,profiles,user_roles,clientes,ordens_servico,estoque_produto,entregas,laboratorio_esteira_eventos; INSERT INTO organizations(id,ativo) VALUES('{A}',true),('{B}',true); INSERT INTO profiles(user_id,organization_id,ativo) VALUES('{U}','{A}',true),('{V}','{B}',true); INSERT INTO user_roles(user_id,role) VALUES('{U}','administrador'),('{V}','administrador'); INSERT INTO clientes(id,organization_id) VALUES('{C}','{A}'); INSERT INTO ordens_servico(id,organization_id,cliente_id) VALUES('{O}','{A}','{C}'); INSERT INTO estoque_produto(id,status,quantidade,volume_total,reservado_para_os_id,reservado_para_os_tipo,reservado_para_cliente_id) VALUES('{S}','reservado',10,10,'{O}','manual','{C}'); INSERT INTO entregas(id,organization_id,status,ordem_servico_id,cliente_id,quantidade_entregue) VALUES('{E}','{A}','separado','{O}','{C}',1);")
  reset()
  # Reproduce the vulnerability locally without pretending a production GRANT.
  sql('GRANT EXECUTE ON FUNCTION public.rpc_entrega_cancelar_v1(uuid,text) TO authenticated;')
  ok(actor(V)+f"SELECT (rpc_entrega_cancelar_v1('{E}','synthetic reproduction')->>'success')::boolean",'baseline cross-tenant cancellation reproduced locally')
  sql((H/'candidate-hardening.sql.review').read_text())
  hashes=sql("SELECT json_agg(json_build_object('name',n.nspname||'.'||p.proname,'md5',md5(pg_get_functiondef(p.oid)))) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.proname IN ('delivery_recovery_scope_v1','rpc_cockpit_criar_entrega_v1','fn_entrega_confirmar_engine_v1','rpc_entrega_cancelar_v1');").stdout.strip()
  (H/'local-candidate-hashes.json').write_text(hashes+'\n')
  sql('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;')
  sql('GRANT EXECUTE ON FUNCTION public.rpc_cockpit_criar_entrega_v1(uuid,text,uuid,numeric,jsonb),public.rpc_entrega_cancelar_v1(uuid,text),public.rpc_entrega_confirmar_v1(uuid,jsonb,jsonb) TO authenticated;')
  reset()
  cancel=f"SELECT rpc_entrega_cancelar_v1('{E}','test');"
  confirm=f"SELECT rpc_entrega_confirmar_v1('{E}','{{\"nome\":\"local\"}}','{{}}');"
  create=f"SELECT rpc_cockpit_criar_entrega_v1('{O}','manual','{S}',1,'{{}}');"
  err(actor(V)+cancel,'42501','cross cancel denied')
  err(actor(V)+confirm,'42501','cross confirm denied')
  err(actor(V)+create,'42501','cross create denied')
  err('SET ROLE anon;'+cancel,'42501','anon denied')
  ok(actor()+f"SELECT (rpc_entrega_cancelar_v1('{E}','test')->>'success')::boolean",'own cancel no stock branch')
  ok(actor()+f"SELECT (rpc_entrega_cancelar_v1('{E}','test')->>'replay')::boolean",'cancel replay')
  ok(f"SELECT count(*)=1 FROM laboratorio_esteira_eventos",'cancel replay one event')
  reset()
  ok(actor()+f"SELECT (rpc_entrega_confirmar_v1('{E}','{{\"nome\":\"local\"}}','{{}}')->>'success')::boolean",'own confirm no stock branch')
  ok(actor()+f"SELECT (rpc_entrega_confirmar_v1('{E}','{{}}','{{}}')->>'replay')::boolean",'confirm replay')
  reset()
  # Remove preexisting delivery so create emits a single new one.
  sql('TRUNCATE entregas;')
  ok(actor()+f"SELECT (rpc_cockpit_criar_entrega_v1('{O}','manual','{S}',1,'{{}}')->>'success')::boolean",'own create reduced schema')
  ok(actor()+f"SELECT (rpc_cockpit_criar_entrega_v1('{O}','manual','{S}',1,'{{}}')->>'replay')::boolean",'create replay')
  ok('SELECT count(*)=1 FROM entregas','create one delivery')
  err(actor()+create.replace(",1,'{}'",",'NaN'::numeric,'{}'"),'P0001','finite quantity NaN rejected')
  reset();sql(f"UPDATE entregas SET partner_order_id='{O}'")
  err(actor()+confirm,'42501','B2B remains contained')
  reset();err(actor()+f"SELECT rpc_entrega_confirmar_v1('{E}','{{}}','{{}}');",'P0001','missing physical receiver rejected')
  ok(f"SELECT status='separado' FROM entregas WHERE id='{E}'",'invalid receiver no write')
  # Fault after event insertion proves rollback of operation, not production trigger suite.
  sql("CREATE FUNCTION fail_event() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'local postcondition failure'; END$$; CREATE TRIGGER fail_event BEFORE INSERT ON laboratorio_esteira_eventos FOR EACH ROW EXECUTE FUNCTION fail_event();")
  err(actor()+cancel,'P0001','postcondition fault rolls transaction back')
  ok(f"SELECT status='separado' FROM entregas WHERE id='{E}'",'postcondition no persisted cancellation')
  sql('DROP TRIGGER fail_event ON laboratorio_esteira_eventos;')
  # Row waiter rechecks committed profile change. Direct profile change is LOCAL test only;
  # this deliberately models an alternate writer bypassing canonical gate.
  p,send=session();send(f"BEGIN; SELECT 1 FROM entregas WHERE id='{E}' FOR UPDATE;")
  time.sleep(.15);w,sw=session();sw(actor()+cancel);waiting()
  sql(f"UPDATE profiles SET ativo=false WHERE user_id='{U}';")
  send('COMMIT;');p.stdin.close();p.wait(4);w.stdin.close();w.wait(4)
  assert 'DELIVERY_SCOPE_DENIED' in w.stderr.read();checks.append('row waiter observes committed revocation');print('PASS',checks[-1])
  ok(f"SELECT status='separado' FROM entregas WHERE id='{E}'",'revoked waiter no write')
  reset();p,send=session();send(f"BEGIN; SELECT pg_advisory_xact_lock(hashtext('entrega_cancelar:'||'{E}'));");time.sleep(.15)
  w,sw=session();sw(actor()+cancel);waiting();sql(f"UPDATE profiles SET ativo=false WHERE user_id='{U}';")
  send('COMMIT;');p.stdin.close();p.wait(4);w.stdin.close();w.wait(4)
  assert 'DELIVERY_SCOPE_DENIED' in w.stderr.read();checks.append('advisory waiter observes committed revocation');print('PASS',checks[-1])
  ok(f"SELECT status='separado' FROM entregas WHERE id='{E}'",'advisory revoked waiter no write')
  reset()
  p,send=session();send('BEGIN; SELECT 1 FROM cf_user_guards_v1.state WHERE singleton FOR UPDATE;');time.sleep(.15)
  w,sw=session();sw(actor()+cancel);waiting();send(f"UPDATE profiles SET ativo=false WHERE user_id='{U}'; COMMIT;")
  p.stdin.close();p.wait(4);w.stdin.close();w.wait(4);assert 'DELIVERY_SCOPE_DENIED' in w.stderr.read();checks.append('gate revocation first denies waiter');print('PASS',checks[-1])
  reset();p,send=session();send(actor()+'BEGIN;'+cancel);time.sleep(.2)
  w,sw=session();sw(f"BEGIN; SELECT 1 FROM cf_user_guards_v1.state WHERE singleton FOR UPDATE; UPDATE profiles SET ativo=false WHERE user_id='{U}'; COMMIT;");waiting();send('COMMIT;')
  p.stdin.close();p.wait(4);w.stdin.close();w.wait(4)
  ok(f"SELECT status='cancelada' AND (SELECT ativo FROM profiles WHERE user_id='{U}')=false FROM entregas WHERE id='{E}'",'mutation commits first then revocation')
  reset();p,send=session();send('BEGIN; SELECT 1 FROM cf_user_guards_v1.state WHERE singleton FOR UPDATE;');time.sleep(.15)
  err(actor()+cancel,'55P03','3s gate timeout');send('ROLLBACK;');p.stdin.close();p.wait(4)
  ok(f"SELECT status='separado' FROM entregas WHERE id='{E}'",'timeout no write')
  reset();p,send=session();send(actor()+'BEGIN;'+cancel);time.sleep(.2)
  w,sw=session();sw(actor()+cancel);waiting();send('COMMIT;');p.stdin.close();p.wait(4);w.stdin.close();w.wait(4)
  assert '"replay": true' in w.stdout.read();checks.append('concurrent cancel serializes to replay');print('PASS',checks[-1])
  ok('SELECT count(*)=1 FROM laboratorio_esteira_eventos','concurrent cancel one event')
  err((H/'release.sql.review').read_text(),'42501','release barrier remains closed')
  sql((H/'containment.sql.review').read_text().replace(' public.rpc_cockpit_confirmar_entrega_v1(uuid,uuid,text,jsonb),',''))
  err(actor()+cancel,'42501','containment denies client execution')
 finally:
  if started:subprocess.run(pre+[str(PG/'pg_ctl'),'-D',str(tmp/'d'),'stop','-m','fast'],capture_output=True,env=env)
 (H/'results.txt').write_text(f'{len(checks)} local checks PASS. Auth/schema/stock/advancement stubs: SYNTHETIC, NOT JWT/RLS.\n'+'\n'.join(checks)+'\n')
 print('TOTAL',len(checks),'PASS')

if __name__=='__main__':main()