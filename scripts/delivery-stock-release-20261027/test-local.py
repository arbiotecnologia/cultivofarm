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
 tmp=Path(tempfile.mkdtemp(prefix='release-pg-',dir='/tmp'));tmp.chmod(0o777)
 pre=['setpriv','--reuid=1000','--regid=1000','--clear-groups'] if os.getuid()==0 else []
 env={**os.environ,'PATH':str(PG)+':'+os.environ['PATH']}
 base=[str(PG/'psql'),'-X','-h',str(tmp),'-p','55547','-U','postgres','-At','-v','ON_ERROR_STOP=1']
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
  subprocess.run(pre+[str(PG/'pg_ctl'),'-D',str(tmp/'d'),'-l',str(tmp/'log'),'-o',f'-k {tmp} -h "" -p 55547','start'],check=True,capture_output=True,env=env);started=True
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
CREATE TABLE public.motor_calls(acao text,item uuid,qtd numeric,k text);
CREATE FUNCTION public.fn_mark_entrega_not_billable(e uuid,m text) RETURNS void LANGUAGE plpgsql AS $$BEGIN PERFORM 1 FROM cf_user_guards_v1.state WHERE singleton FOR UPDATE; PERFORM pg_advisory_xact_lock(hashtextextended('entrega_faturar:'||e::text,0)); PERFORM 1 FROM entregas WHERE id=e FOR UPDATE; END$$;
CREATE FUNCTION public.rpc_estoque_operar_v1(a text,i uuid,q numeric,k text,p jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$BEGIN PERFORM 1 FROM cf_user_guards_v1.state WHERE singleton FOR UPDATE; PERFORM pg_advisory_xact_lock(hashtext('estoque_mov:'||k)); IF EXISTS(SELECT 1 FROM motor_calls WHERE motor_calls.k=rpc_estoque_operar_v1.k) THEN RETURN '{"ok":true,"replay":true}'; END IF; PERFORM 1 FROM estoque_produto WHERE id=i FOR UPDATE; INSERT INTO motor_calls VALUES(a,i,q,k); IF a='expedicao' THEN UPDATE estoque_produto SET status='expedido' WHERE id=i; ELSIF a='estorno_expedicao' THEN UPDATE estoque_produto SET status='reservado' WHERE id=i; END IF; RETURN '{"ok":true}'; END$$;
CREATE FUNCTION public.rpc_cockpit_cancelar_reserva_v1(i uuid,o uuid,t text,m text) RETURNS jsonb LANGUAGE plpgsql AS $$BEGIN PERFORM 1 FROM cf_user_guards_v1.state WHERE singleton FOR UPDATE; PERFORM 1 FROM estoque_produto WHERE id=i FOR UPDATE; INSERT INTO motor_calls VALUES('cancelamento_reserva',i,NULL,'cancel:'||i); UPDATE estoque_produto SET status='disponivel' WHERE id=i; RETURN '{"success":true}'; END$$;
GRANT USAGE ON SCHEMA auth,public TO anon,authenticated;"""
  sql(schema)
  fs=json.loads((H.parent/'os-delivery-reopening-20261027/live/definitions.json').read_text())['functions']
  for n in ['public.fn_cockpit_norm_origem','public.fn_cockpit_assert_operador_origem','public.fn_entrega_assert_confirmador','public.fn_estoque_ctx_open','public.rpc_cockpit_criar_entrega_v1','public.fn_entrega_confirmar_engine_v1','public.rpc_entrega_cancelar_v1','public.rpc_entrega_confirmar_v1']:
   sql(fs[n]['definition'])
   ok(f"SELECT md5(pg_get_functiondef(oid))='{fs[n]['md5']}' FROM pg_proc WHERE proname='{n.split('.')[-1]}'",'exact LIVE body '+n)
