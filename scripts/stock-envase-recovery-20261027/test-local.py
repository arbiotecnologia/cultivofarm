"""PG17 disposable: real captured motor, ledger/P1/volume/CQ guards.
Synthetic Auth/SaaS/hash transport only. No hosted connection or credentials."""
import json,os,subprocess,tempfile,time
from pathlib import Path
H=Path(__file__).resolve().parent
PG=Path('/nix/store/avg1rhq9w93k03qmdaklazcsapn45zpd-postgresql-17.9/bin')
uid=lambda n:f'00000000-0000-4000-8000-{n:012d}'
U,V,A,B,C,O,P,L,S,E,PROD=[uid(n) for n in range(1,12)]
checks=[]

def main():
 tmp=Path(tempfile.mkdtemp(prefix='stock-envase-',dir='/tmp'));tmp.chmod(0o777)
 env={**os.environ,'PATH':str(PG)+':'+os.environ['PATH']}
 pre=['setpriv','--reuid=1000','--regid=1000','--clear-groups'] if os.getuid()==0 else []
 conn=[str(PG/'psql'),'-X','-h',str(tmp),'-p','55539','-U','postgres','-At','-v','ON_ERROR_STOP=1']
 def sql(q,required=True):
  r=subprocess.run(conn,input=q,capture_output=True,text=True,env=env)
  if required and r.returncode:raise AssertionError(r.stderr)
  return r
 def ok(q,label):
  out=sql(q).stdout.strip().splitlines()
  if not out or out[-1]!='t':raise AssertionError(label+':'+str(out))
  checks.append(label);print('PASS',label)
 def err(q,code,label):
  r=sql('\\set VERBOSITY verbose\n'+q,False)
  if not r.returncode or code not in r.stderr:raise AssertionError(label+':'+r.stderr+r.stdout)
  checks.append(label);print('PASS',label,code)
 def actor(u=U):return f"SET ROLE authenticated; SET request.jwt.claim.sub='{u}';"
 def session():
  p=subprocess.Popen(conn,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,env=env)
  def send(q):p.stdin.write(q+'\n');p.stdin.flush()
  return p,send
 def waitlock():
  deadline=time.time()+2
  while time.time()<deadline:
   if int(sql("SELECT count(*) FROM pg_stat_activity WHERE wait_event_type='Lock' AND pid<>pg_backend_pid()").stdout.strip())>0:return
   time.sleep(.02)
  raise AssertionError('wait not observed')
 started=False
 try:
  subprocess.run(pre+[str(PG/'initdb'),'-D',str(tmp/'d'),'-A','trust','-U','postgres'],check=True,capture_output=True,env=env)
  subprocess.run(pre+[str(PG/'pg_ctl'),'-D',str(tmp/'d'),'-l',str(tmp/'log'),'-o',f'-k {tmp} -h "" -p 55539','start'],check=True,capture_output=True,env=env);started=True
  source=json.loads((H/'live/functions.json').read_text())['functions'];catalog=json.loads((H/'live/catalog.json').read_text())
  schema="CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE SCHEMA platform_private;CREATE SCHEMA extensions;CREATE SCHEMA cf_user_guards_v1;SET check_function_bodies=off;"
  schema+="CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;"
  enums=json.loads((H.parent/'os-programming-recovery/catalog.json').read_text())['enums']
  for n,vals in enums.items():schema+=f'CREATE TYPE {n} AS ENUM ('+','.join("'"+v+"'" for v in vals)+');'
  tables={'profiles','organizations','user_roles','clientes','ordens_servico','ordens_servico_onfarm','programacao_producao','lotes','controle_qualidade','envase','estoque_produto','estoque_movimentacoes','laboratorio_esteira_eventos','entregas','partner_orders','notificacoes_operacionais','estoque_politicas','cockpit_operacao_idempotencia'}
  cols=json.loads((H.parent/'os-programming-recovery/schema-catalog.json').read_text())['columns']
  for n in tables:
   columns=[c for c in cols if c['table']==n]
   schema+=f'CREATE TABLE public.{n}('+','.join('"'+c['name']+'" '+c['type'] for c in columns)+');'
  for n in ['envase','estoque_produto','estoque_movimentacoes']:
   schema+=f'ALTER TABLE {n} ALTER COLUMN id SET DEFAULT gen_random_uuid();ALTER TABLE {n} ALTER COLUMN created_at SET DEFAULT now();'
  schema+="CREATE TABLE cf_user_guards_v1.state(singleton boolean PRIMARY KEY,revision bigint);INSERT INTO cf_user_guards_v1.state VALUES(true,1); CREATE TABLE platform_private.stock_motor_context(txid bigint PRIMARY KEY,actor uuid,item uuid,ctx jsonb); CREATE TABLE platform_private.stock_batch_requests(request_key text PRIMARY KEY,actor uuid,organization_id uuid,fingerprint text,result jsonb);"
  schema+="""CREATE FUNCTION has_role(u uuid,r app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$SELECT EXISTS(SELECT 1 FROM user_roles WHERE user_id=u AND role=r)$$;
CREATE FUNCTION h15_actor_organization() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$SELECT p.organization_id FROM profiles p JOIN organizations o ON o.id=p.organization_id AND o.ativo IS TRUE WHERE p.user_id=auth.uid() AND p.ativo IS TRUE$$;
CREATE FUNCTION platform_private.h15_actor_organization() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$SELECT public.h15_actor_organization()$$;
CREATE FUNCTION technical_actor_ready(u uuid) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT u=auth.uid() AND public.h15_actor_organization() IS NOT NULL$$;
CREATE FUNCTION saas_has_feature(k text) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT k IN ('estoque_embalagens','envase','ordens_producao')$$;
CREATE FUNCTION _saas_user_has_feature(u uuid,k text) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT u=auth.uid() AND public.saas_has_feature(k)$$;
CREATE FUNCTION b2b_phase1_partner_visible(uuid,boolean) RETURNS boolean LANGUAGE sql AS $$SELECT false$$;
CREATE FUNCTION b2b_phase1_order_visible(uuid) RETURNS boolean LANGUAGE sql AS $$SELECT false$$;
CREATE FUNCTION extensions.digest(t text,k text) RETURNS bytea LANGUAGE sql IMMUTABLE AS $$SELECT sha256(convert_to(t,'UTF8'))$$;
GRANT USAGE ON SCHEMA public,auth TO authenticated,anon;
"""
  sql(schema)
  # Target bodies and dependencies captured LIVE. No mocked stock motor/ledger.
  load=['public.fn_estoque_ctx_read','public.fn_estoque_ctx_open','public.fn_estoque_ctx_force','public.fn_estoque_ctx_close','public.fn_estoque_pode_operar','public.fn_estoque_fingerprint','platform_private.stock_motor_actor','platform_private.stock_motor_item','platform_private.stock_motor_refs','platform_private.stock_motor_context_set','platform_private.stock_p1_lote_owned','public.stock_p1_movement_owned','platform_private.stock_p1_guard','platform_private.stock_p1_movement_guard','public.fn_estoque_produto_guard','public.log_estoque_movimentacao','public.fn_ledger_append_only','public.guard_tenant_organization_id','public.lote_volume_envasado','public.fn_validate_envase_volume','public.fn_validate_envase_cq','public.fn_envase_material_imutavel','public.fn_cockpit_ctx_programacao','public.fn_cockpit_is_gestor','public.rpc_estoque_operar_v1','public.rpc_estoque_reservar_v1','public.rpc_cockpit_registrar_envase_v1']
  sql(source['platform_private.stock_p1_lote_owned']['definition'])
  sql(source['platform_private.stock_p1_movement_owned']['definition'])
  for n in load:sql(source[n]['definition'])
  for n in ['public.rpc_estoque_operar_v1','public.rpc_estoque_reservar_v1','public.rpc_cockpit_registrar_envase_v1','public.fn_envase_material_imutavel','platform_private.stock_p1_guard','platform_private.stock_p1_movement_guard']:
   ok(f"SELECT md5(pg_get_functiondef(p.oid))='{source[n]['hash']}' FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE s.nspname||'.'||p.proname='{n}'",'exact LIVE '+n)
  for n in ['public.fn_cockpit_norm_origem','public.fn_cockpit_assert_operador_origem','public.fn_cockpit_assert_b2b_liberado']:
   sql((H.parent/'os-delivery-reopening-20261027/live'/f'{n}.sql.review').read_text())
  # Exact selected trigger definitions; refresh views/OS transitions are excluded.
  enabled={'envase':{'tenant_organization_guard','trg_validate_envase_cq','trg_validate_envase_volume','trg_envase_material_imutavel'},'estoque_produto':{'a00_stock_p1_tenant_guard','trg_estoque_produto_guard','trg_log_estoque_insert','trg_log_estoque_update'},'estoque_movimentacoes':{'a00_stock_p1_movement_guard','trg_estoque_mov_append_only'}}
  for t in catalog['tables']:
   for tr in t.get('triggers') or []:
    if tr['name'] in enabled.get(t['name'],set()):sql(tr['def']+';')
  def reset():
   sql(f"TRUNCATE profiles,organizations,user_roles,clientes,ordens_servico,programacao_producao,lotes,controle_qualidade,envase,estoque_produto,estoque_movimentacoes,laboratorio_esteira_eventos,cockpit_operacao_idempotencia;TRUNCATE platform_private.stock_motor_context,platform_private.stock_batch_requests;INSERT INTO organizations(id,ativo) VALUES('{A}',true),('{B}',true);INSERT INTO profiles(user_id,organization_id,ativo) VALUES('{U}','{A}',true),('{V}','{B}',true);INSERT INTO user_roles(user_id,role) VALUES('{U}','administrador'),('{V}','administrador');INSERT INTO clientes(id,organization_id) VALUES('{C}','{A}');INSERT INTO ordens_servico(id,organization_id,cliente_id,produto_id,status,origem) VALUES('{O}','{A}','{C}','{PROD}','envase','manual');INSERT INTO programacao_producao(id,organization_id,ordem_servico_id,produto_id,volume_necessario) VALUES('{P}','{A}','{O}','{PROD}',2000);INSERT INTO lotes(id,organization_id,programacao_id,produto_id,status,volume_produzido,codigo_lote) VALUES('{L}','{A}','{P}','{PROD}','aprovado',3000,'LOCAL');INSERT INTO controle_qualidade(lote_id,resultado,created_at,seq) VALUES('{L}','aprovado',now(),1);")
  reset()
  # Reproduce DEFINER purge bypass in a disposable table, not production grants.
  sql(f"INSERT INTO envase(id,lote_id,organization_id,quantidade,volume_por_unidade) VALUES('{E}','{L}','{A}',1,1000); GRANT UPDATE,SELECT ON envase TO authenticated;")
  ok(actor()+f"SET app.estoque_purge_fixture='on';UPDATE envase SET quantidade=2 WHERE id='{E}';SELECT quantidade=2 FROM envase WHERE id='{E}';",'LIVE definer purge bypass reproduced locally')
  sql((H/'candidate.sql.review').read_text())
  sql("REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;GRANT EXECUTE ON FUNCTION rpc_cockpit_registrar_envase_v1(uuid,uuid,text,uuid,jsonb,date,text,text,boolean,text),rpc_estoque_operar_v1(text,uuid,numeric,text,jsonb),rpc_cockpit_cancelar_reserva_v1(uuid,uuid,text,text) TO authenticated;")
  # Inner invoker CQ/tenant guards need exposed helper execute as in LIVE.
  sql('GRANT EXECUTE ON FUNCTION h15_actor_organization(),auth.uid() TO authenticated;')
  hashes=sql("SELECT json_agg(json_build_object('name',n.nspname||'.'||p.proname,'hash',md5(pg_get_functiondef(p.oid)))) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.proname IN ('stock_envase_scope_v1','rpc_cockpit_registrar_envase_v1','rpc_estoque_operar_v1','rpc_estoque_reservar_v1','fn_envase_material_imutavel','fn_validate_envase_volume','rpc_cockpit_cancelar_reserva_v1');").stdout.strip();(H/'local-post-hashes.json').write_text(hashes+'\n')
  err(actor()+f"SET app.estoque_purge_fixture='on';UPDATE envase SET quantidade=3 WHERE id='{E}';",'23514','purge forgery now denied')
  reset()
  envase=lambda key,qty=2:f"SELECT rpc_cockpit_registrar_envase_v1('{L}','{O}','manual','{P}','[{{\"tipo_embalagem\":\"frasco_1L\",\"quantidade\":{qty}}}]',current_date+30,'local','{key}',false,NULL);"
  err(actor(V)+envase('cross-001'),'42501','cross tenant envase denied')
  err('SET ROLE anon;'+envase('anon-001'),'42501','anon envase denied')
  err(actor()+envase('over-001',4),'P0001','produced volume exceeded rejected')
  ok('SELECT count(*)=0 FROM envase','over volume no writes')
  ok(actor()+f"SELECT (rpc_cockpit_registrar_envase_v1('{L}','{O}','manual','{P}','[{{\"tipo_embalagem\":\"frasco_1L\",\"quantidade\":2}}]',current_date+30,'local','envase-001',false,NULL)->>'success')::boolean",'envase creates stock with real ledger/P1 guards')
  ok('SELECT (SELECT count(*) FROM envase)=1 AND (SELECT count(*) FROM estoque_produto)=1 AND (SELECT count(*) FROM estoque_movimentacoes)=1','one envase stock ledger')
  ok('SELECT quantidade=2 AND volume_total=2 AND quantidade_reservada=2 FROM estoque_produto','ml to liters and units conserved')
  ok(actor()+f"SELECT (rpc_cockpit_registrar_envase_v1('{L}','{O}','manual','{P}','[{{\"tipo_embalagem\":\"frasco_1L\",\"quantidade\":2}}]',current_date+30,'local','envase-001',false,NULL)->>'replay')::boolean",'envase replay exact no duplicate')
  ok('SELECT (SELECT count(*) FROM estoque_movimentacoes)=1 AND (SELECT count(*) FROM envase)=1','replay preserves ledger')
  ok(f"SELECT status='envase' FROM ordens_servico WHERE id='{O}'",'manual OS transition not forged')
  err(actor()+envase('envase-001',1),'P0001','changed idempotency payload denied')
  stock=sql('SELECT id FROM estoque_produto LIMIT 1').stdout.strip()
  motor=lambda action,key,qty=1:f"SELECT rpc_estoque_operar_v1('{action}','{stock}',{qty},'{key}','{{}}');"
  err(actor(V)+motor('expedicao','cross-stock'),'42501','cross stock denied before replay')
  err(actor()+motor('expedicao','bad-numeric',"'NaN'::numeric"),'23514','NaN quantity denied')
  ok(actor()+f"SELECT (rpc_estoque_operar_v1('expedicao','{stock}',2,'expedition-001','{{}}')->>'ok')::boolean",'full expedition real motor and ledger')
  ok(actor()+f"SELECT (rpc_estoque_operar_v1('expedicao','{stock}',2,'expedition-001','{{}}')->>'replay')::boolean",'expedition replay')
  movement=sql("SELECT id FROM estoque_movimentacoes WHERE idempotency_key='expedition-001'").stdout.strip()
  ok(actor()+f"SELECT (rpc_estoque_operar_v1('estorno_expedicao','{stock}',NULL,'reverse-001','{{\"movimentacao_origem_id\":\"{movement}\"}}')->>'ok')::boolean",'expedition reversal restores real ledger balances')
  ok("SELECT status='reservado' AND quantidade=2 AND quantidade_reservada=2 FROM estoque_produto",'reversal balance preserved')
  ok(actor()+f"SELECT (rpc_cockpit_cancelar_reserva_v1('{stock}','{O}','manual','local cancel')->>'success')::boolean",'cancel wrapper uses real motor')
  ok(actor()+f"SELECT (rpc_cockpit_cancelar_reserva_v1('{stock}','{O}','manual','local cancel')->>'replay')::boolean",'cancel wrapper replay')
  err(actor()+"UPDATE estoque_movimentacoes SET quantidade=99;",'42501','ledger direct update denied')
  # Authenticated direct table privileges remain unavailable. Trigger-only test
  # temporarily grants rights locally to prove append-only independently.
  sql('GRANT UPDATE,SELECT ON estoque_movimentacoes TO authenticated;')
  err(actor()+"UPDATE estoque_movimentacoes SET quantidade=99;",'42501','real append-only trigger blocks privileged local test')
  reset();sql(f"UPDATE controle_qualidade SET resultado='reprovado';")
  err(actor()+envase('cq-001'),'P0001','latest CQ rejected denies envase')
  ok('SELECT count(*)=0 FROM estoque_produto','CQ denial leaves no stock')
  reset();sql("CREATE FUNCTION fail_ledger() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'local injected ledger failure';END$$;CREATE TRIGGER zz_fail BEFORE INSERT ON estoque_movimentacoes FOR EACH ROW EXECUTE FUNCTION fail_ledger();")
  err(actor()+envase('fault-001'),'P0001','ledger failure rolls whole envase back')
  ok('SELECT (SELECT count(*) FROM envase)=0 AND (SELECT count(*) FROM estoque_produto)=0 AND (SELECT count(*) FROM cockpit_operacao_idempotencia)=0','fault atomic envase stock receipt rollback')
  sql('DROP TRIGGER zz_fail ON estoque_movimentacoes;')
  reset();sql(f"UPDATE lotes SET volume_produzido='NaN'::numeric;")
  err(actor()+envase('nan-produced'),'P0001','nonfinite produced volume denied')
  reset();err(actor()+envase('missing-qty').replace('"quantidade":2','"other":2'),'P0001','missing line quantity denied')
  reset()
  # Two concurrent actual envase bodies; gate serializes, receipt absorbs replay.
  p,send=session();send(actor()+'BEGIN;'+envase('concurrent-envase'));time.sleep(.3)
  w,sw=session();sw(actor()+envase('concurrent-envase'));waitlock();send('COMMIT;');p.stdin.close();p.wait(4);w.stdin.close();w.wait(4)
  assert '"replay": true' in w.stdout.read();checks.append('two connections one envase one replay');print('PASS',checks[-1])
  ok('SELECT (SELECT count(*) FROM envase)=1 AND (SELECT count(*) FROM estoque_movimentacoes)=1','concurrent envase single ledger')
  reset();p,send=session();send(f"BEGIN;SELECT 1 FROM lotes WHERE id='{L}' FOR UPDATE;");time.sleep(.1)
  w,sw=session();sw(actor()+envase('row-revoke'));waitlock();sql(f"UPDATE profiles SET ativo=false WHERE user_id='{U}';");send('COMMIT;');p.stdin.close();p.wait(4);w.stdin.close();w.wait(4)
  assert 'ESTQ_IDENTIDADE_INATIVA' in w.stderr.read();checks.append('row waiter rechecks committed local revocation');print('PASS',checks[-1])
  ok('SELECT count(*)=0 FROM estoque_produto','revoked row waiter no stock')
  # Forged stock metadata cannot trick a reviewed motor. The real motor clears it.
  reset();sql(actor()+envase('context-envase'));stock=sql('SELECT id FROM estoque_produto LIMIT 1').stdout.strip()
  ok(actor()+f"SET app.estoque_mov_ctx='{{\"origem\":\"forged\",\"idempotency_key\":\"forged-key\"}}';SELECT (rpc_estoque_operar_v1('expedicao','{stock}',2,'real-context-key','{{}}')->>'ok')::boolean;",'motor replaces forged GUC with private context')
  ok("SELECT count(*)=1 FROM estoque_movimentacoes WHERE idempotency_key='real-context-key' AND origem<>'forged'",'ledger uses real operation key not forged GUC')
  # Revocation while waiting on the gate (two connections, local synthetic Auth).
  reset();p,send=session();send('BEGIN;SELECT 1 FROM cf_user_guards_v1.state WHERE singleton FOR UPDATE;');time.sleep(.1)
  w,sw=session();sw(actor()+envase('revoke-001'));waitlock();send(f"UPDATE profiles SET ativo=false WHERE user_id='{U}';COMMIT;");p.stdin.close();p.wait(4);w.stdin.close();w.wait(4)
  assert 'ESTQ_IDENTIDADE_INATIVA' in w.stderr.read();checks.append('gate revocation committed first denies waiter');print('PASS',checks[-1])
  ok('SELECT count(*)=0 FROM envase','revoked waiter zero writes')
  reset();p,send=session();send(actor()+'BEGIN;'+envase('first-001'));time.sleep(.3)
  w,sw=session();sw(f"BEGIN;SELECT 1 FROM cf_user_guards_v1.state WHERE singleton FOR UPDATE;UPDATE profiles SET ativo=false WHERE user_id='{U}';COMMIT;");waitlock();send('COMMIT;');p.stdin.close();p.wait(4);w.stdin.close();w.wait(4)
  ok('SELECT count(*)=1 FROM envase','mutation first commits before queued revocation')
  reset();p,send=session();send('BEGIN;SELECT 1 FROM cf_user_guards_v1.state WHERE singleton FOR UPDATE;');time.sleep(.1)
  err(actor()+envase('timeout-001'),'55P03','3s timeout no mutation');send('ROLLBACK;');p.stdin.close();p.wait(4)
  ok('SELECT count(*)=0 FROM envase','timeout no envase')
  # Item N failure after item 1 executed with captured motor + real ledger guards.
  # Multi-line envase is one RPC transaction, unlike the current delivery UI group.
  reset();sql("CREATE FUNCTION fail_second_ledger() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF (SELECT count(*) FROM estoque_movimentacoes)>=1 THEN RAISE EXCEPTION 'item N ledger failure'; END IF; RETURN NEW; END$$; CREATE TRIGGER zz_item_n BEFORE INSERT ON estoque_movimentacoes FOR EACH ROW EXECUTE FUNCTION fail_second_ledger();")
  multi=envase('item-n-envase').replace('[{"tipo_embalagem":"frasco_1L","quantidade":2}]','[{"tipo_embalagem":"frasco_1L","quantidade":1},{"tipo_embalagem":"bombona_5L","quantidade":1}]')
  sql(f"UPDATE lotes SET volume_produzido=10000 WHERE id='{L}';")
  err(actor()+multi,'P0001','item N ledger failure aborts multi-line envase')
  ok('SELECT (SELECT count(*) FROM envase)=0 AND (SELECT count(*) FROM estoque_produto)=0 AND (SELECT count(*) FROM estoque_movimentacoes)=0 AND (SELECT count(*) FROM cockpit_operacao_idempotencia)=0','item N rolls all stock envase ledger receipts back')
  sql('DROP TRIGGER zz_item_n ON estoque_movimentacoes;')
  reset();sql(actor()+envase('two-stock-envase'));stock=sql('SELECT id FROM estoque_produto LIMIT 1').stdout.strip()
  err(actor()+f"BEGIN; SELECT rpc_estoque_operar_v1('expedicao','{stock}',2,'item-one-expedition','{{}}'); SELECT rpc_estoque_operar_v1('expedicao','{stock}',2,'item-two-invalid-status','{{}}'); COMMIT;",'23514','second expedition invalid status aborts whole explicit transaction')
  ok("SELECT count(*)=0 FROM estoque_movimentacoes WHERE idempotency_key IN ('item-one-expedition','item-two-invalid-status')",'item N no first-item committed receipt')
  ok("SELECT status='reservado' AND quantidade_reservada=2 FROM estoque_produto",'item N restores first-item balance')
  # Same item, different keys: row/status guard is not an observed-version CAS.
  p,send=session();send(actor()+'BEGIN;'+f"SELECT rpc_estoque_operar_v1('expedicao','{stock}',2,'same-item-first','{{}}');");time.sleep(.2)
  w,sw=session();sw(actor()+f"SELECT rpc_estoque_operar_v1('expedicao','{stock}',2,'same-item-second','{{}}');");waitlock();send('COMMIT;');p.stdin.close();p.wait(4);w.stdin.close();w.wait(4)
  assert 'ESTQ_STATUS_INVALIDO' in w.stderr.read();checks.append('same item competing generation fails status after real wait');print('PASS',checks[-1])
  ok("SELECT count(*)=1 FROM estoque_movimentacoes WHERE idempotency_key IN ('same-item-first','same-item-second')",'competing keys one expedition ledger')
  # Load exact currently captured inner reservation, not a replacement motor stub.
  extra=json.loads((H.parent/'delivery-stock-release-20261027/current-extra-20261028.json').read_text())
  reserve=next(f for f in extra['functions'] if f['name']=='public.reservar_estoque_item')
  sql(reserve['definition'])
  ok(f"SELECT md5(pg_get_functiondef('public.reservar_estoque_item(uuid,numeric,uuid,text,uuid,uuid,uuid,text)'::regprocedure))='{reserve['hash']}'",'exact current inner reservation body')
  sql('GRANT EXECUTE ON FUNCTION rpc_estoque_reservar_v1(uuid,text,jsonb,text,jsonb) TO authenticated;')
  reset();sql(actor()+envase('batch-setup'));stock=sql('SELECT id FROM estoque_produto LIMIT 1').stdout.strip()
  sql(actor()+f"SELECT rpc_cockpit_cancelar_reserva_v1('{stock}','{O}','manual','prepare batch');")
  batch=f"SELECT rpc_estoque_reservar_v1('{O}','manual','[{{\"item_id\":\"{stock}\",\"quantidade\":2}}]','batch-current-one','{{\"cliente_id\":\"{C}\"}}');"
  ok(actor()+f"SELECT ({batch[7:-1]}->>'ok')::boolean",'captured inner reservation + canonical batch real ledger')
  ok(actor()+f"SELECT ({batch[7:-1]}->>'replay')::boolean",'batch same payload replay')
  ok('SELECT count(*)=1 FROM platform_private.stock_batch_requests','batch one immutable receipt')
  err(actor()+batch.replace('quantidade":2','quantidade":1'),'23505','batch changed quantity same key rejects')
 finally:
  if started:subprocess.run(pre+[str(PG/'pg_ctl'),'-D',str(tmp/'d'),'stop','-m','fast'],capture_output=True,env=env)
 (H/'results.txt').write_text(f'{len(checks)} PASS PostgreSQL17 local; Auth/SaaS/hash seams synthetic, no hosted JWT/RLS.\n'+'\n'.join(checks)+'\n');print('TOTAL',len(checks),'PASS')

if __name__=='__main__':main()