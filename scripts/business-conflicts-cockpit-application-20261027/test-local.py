"""Exact LIVE/candidate RPCs on disposable PG. Synthetic Auth/reduced schema, NOT hosted homologation.
Reuse historical setup-only fixtures; never run their assemblers or overwrite their evidence.
"""
from pathlib import Path
import json, tempfile, subprocess, os, shutil, importlib.util, concurrent.futures, time, re
H=Path(__file__).resolve().parent
ROOT=H.parent.parent
results=[]
def load(path,name):
 s=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m

def main():
 tmp=Path(tempfile.mkdtemp(prefix='two-business-conflicts-',dir='/tmp'));tmp.chmod(0o777)
 pre=['setpriv','--reuid=1000','--regid=1000','--clear-groups'] if os.getuid()==0 else []
 cmd=['psql','-X','-h',str(tmp),'-p','55539','-U','postgres','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-At'];db='postgres';started=False
 targets=json.loads((H/'live-targets.json').read_text());manifest=json.loads((H/'manifest.json').read_text())
 def run(sql,ok=True):
  r=subprocess.run(cmd+['-d',db],input=sql,text=True,capture_output=True)
  if ok and r.returncode:raise AssertionError(r.stdout[-500:]+r.stderr[-3500:])
  return r
 def check(label,expr):
  assert run('SELECT ('+expr+') IS TRUE;').stdout.strip()=='t',label
  results.append(label)
 def denied(label,sql,code,msg):
  r=run(sql,False);assert r.returncode and code in r.stderr and msg in r.stderr,(label,r.stderr)
  results.append(label)
 def actor(u,lot=False):
  return (f"SELECT set_config('request.jwt.claim.sub','{u}',false),set_config('request.jwt.claims','{{\"iat\":2000000000}}',false);" if lot else f"SELECT set_config('request.jwt.claims','{{\"sub\":\"{u}\",\"iat\":2000000000}}',false);")+ 'SET ROLE authenticated;'
 def install(idx,candidate=False):
  source=targets[idx]['definition'];msg=['COCKPIT_LOTE_CONCORRENTE','application_version_conflict'][idx]
  if candidate:source=source.replace(f"RAISE EXCEPTION '{msg}' USING ERRCODE='40001'",f"RAISE EXCEPTION '{msg}' USING ERRCODE='PT409'")
  run(source+';');sig='public.'+targets[idx]['signature']
  run(f'REVOKE ALL ON FUNCTION {sig} FROM PUBLIC,anon,authenticated,service_role; GRANT EXECUTE ON FUNCTION {sig} TO '+('postgres,authenticated' if idx==0 else 'postgres,service_role,authenticated')+';')
  check(('candidate' if candidate else 'LIVE')+' exact definition hash '+str(idx),f"md5(pg_get_functiondef('{sig}'::regprocedure))='{manifest['targets'][idx]['candidate_md5'] if candidate else targets[idx]['md5']}'")
 def start(sql,name):
  p=subprocess.Popen(cmd+['-d',db],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
  p.stdin.write(f"SET application_name='{name}';"+sql);p.stdin.close();p.stdin=None;return p
 def wait(name,event):
  deadline=time.monotonic()+4
  while time.monotonic()<deadline:
   if run(f"SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='{name}' AND {event});").stdout.strip()=='t':return
   time.sleep(.025)
  raise AssertionError('No observed wait '+name)
 try:
  subprocess.run(pre+['initdb','-D',str(tmp/'data'),'-A','trust','-U','postgres'],check=True,capture_output=True)
  subprocess.run(pre+['pg_ctl','-D',str(tmp/'data'),'-l',str(tmp/'log'),'-o',f'-k {tmp} -h "" -p 55539','start','-w'],check=True,capture_output=True);started=True
  # Exact lot body, real historical triggers/STABLE helpers, reduced catalog.
  lot=load(H.parent/'lot-generation-canonical-20261020/test-real-local.py','lot_fixture');q=lot.q
  run(lot.setup());run((H.parent/'lot-generation-canonical-20261020/manual-write-guard.sql.review').read_text())
  u=q(3).strip("'");b=q(31).strip("'")
  call=f"SELECT public.rpc_cockpit_gerar_lote_v1({lot.PP},{lot.O},'manual','{{\"volume_produzido\":100}}'::jsonb);"
  run(f"SELECT set_config('request.jwt.claim.sub',{lot.U},false),set_config('request.jwt.claims','{{\"iat\":2000000000}}',false);SELECT public.rpc_programar_os_v1({lot.O},'manual','2026-10-19');")
  install(0)
  # Real unique violation, local fault-injection trigger only. It exercises the unchanged EXCEPTION branch.
  run("CREATE TABLE public.local_unique_probe(id uuid PRIMARY KEY); INSERT INTO public.local_unique_probe VALUES("+lot.PP+"); CREATE FUNCTION public.local_unique_fault() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN INSERT INTO public.local_unique_probe VALUES(NEW.programacao_id);RETURN NEW;END$$;CREATE TRIGGER zz_local_unique_fault BEFORE INSERT ON lotes FOR EACH ROW EXECUTE FUNCTION public.local_unique_fault();")
  denied('LIVE lot business conflict reproduced',actor(u,True)+call,'40001','COCKPIT_LOTE_CONCORRENTE')
  install(0,True)
  denied('candidate lot business conflict PT409',actor(u,True)+call,'PT409','COCKPIT_LOTE_CONCORRENTE')
  check('lot conflict rolls back lot/event/ticket',"(SELECT count(*) FROM lotes)=0 AND (SELECT count(*) FROM laboratorio_esteira_eventos WHERE acao='gerar_lote')=0 AND (SELECT count(*) FROM platform_private.authz_tickets)=0")
  denied('lot cross tenant B denied',actor(b,True)+call,'42501','COCKPIT_LOTE_SCOPE_DENIED')
  denied('lot anon ACL denied','SET ROLE anon;'+call,'42501','permission denied')
  denied('lot missing actor denied','SET ROLE authenticated;'+call,'42501','COCKPIT_LOTE_SCOPE_DENIED')
  run('DROP TRIGGER zz_local_unique_fault ON lotes;')
  r=run(actor(u,True)+'BEGIN;'+call+'ROLLBACK;');assert '"success": true' in r.stdout
  check('lot success transaction rollback no write','(SELECT count(*) FROM lotes)=0')
  with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:out=list(pool.map(lambda _:run(actor(u,True)+call).stdout,range(2)))
  assert sum('"replay": false' in o for o in out)==1 and sum('"replay": true' in o for o in out)==1
  results.append('lot two connections one create one replay')
  check('lot replay one lot one audit','(SELECT count(*) FROM lotes)=1 AND (SELECT count(*) FROM laboratorio_esteira_eventos WHERE acao=\'gerar_lote\')=1')
  # Separate database; shared cluster roles already exist.
  run('CREATE DATABASE app_local;');db='app_local';BASE=H.parent/'application-access-integrity';APP=H.parent/'application-recovery'
  run((BASE/'local-setup.sql').read_text().replace('CREATE ROLE authenticated; CREATE ROLE service_role; CREATE ROLE anon;',''))
  run((BASE/'dependencies.sql.review').read_text());run((APP/'local-setup.sql').read_text());run((BASE/'function.sql.review').read_text());run((APP/'setup.sql.review').read_text())
  A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';U='11111111-1111-4111-8111-111111111111';V='22222222-2222-4222-8222-222222222222';C='33333333-3333-4333-8333-333333333333';D='44444444-4444-4444-8444-444444444444';P='55555555-5555-4555-8555-555555555555';O='66666666-6666-4666-8666-666666666666';OB='77777777-7777-4777-8777-777777777777'
  run(f"INSERT INTO organizations VALUES('{A}',true),('{B}',true);INSERT INTO profiles(user_id,organization_id) VALUES('{U}','{A}'),('{V}','{B}');INSERT INTO user_roles VALUES('{U}','administrador'),('{V}','administrador');INSERT INTO clientes VALUES('{C}','{A}'),('{D}','{B}');INSERT INTO produtos VALUES('{P}',true);INSERT INTO ordens_servico(id,organization_id,cliente_id,produto_id) VALUES('{O}','{A}','{C}','{P}'),('{OB}','{B}','{D}','{P}');")
  payload=dict(ordem_servico_id=O,produto_usado_id=P,created_by=U,responsavel_id=U,data_aplicacao='2026-10-27',dose_unidade='mL/ha',dose_aplicada=2,area_aplicada_ha=3,volume_total_aplicado_ml=6)
  def appcall(id,phase='prepare',rect=None,uid=U,patch=None):
   p=dict(payload,**(patch or {}),_phase=phase)
   if rect:p['motivo_retificacao']='Correção sintética'
   return actor(uid)+f"SELECT public.rpc_salvar_aplicacao_v1('{id}',{repr(json.dumps(p))}::jsonb,{repr(rect) if rect else 'NULL'},'[]'::jsonb,ARRAY[]::uuid[]);"
  def ident(n):return f'eeeeeeee-eeee-4eee-8eee-{n:012d}'
  install(1);original=ident(1)
  run(appcall(original));run(appcall(original,'finalize'))
  run(appcall(ident(2),rect=original));run(appcall(ident(2),'finalize',rect=original))
  denied('LIVE app business conflict reproduced',appcall(ident(3),rect=original),'40001','application_version_conflict')
  install(1,True)
  denied('candidate app business conflict PT409',appcall(ident(3),rect=original),'PT409','application_version_conflict')
  check('app stale atomic no receipt/application','NOT EXISTS(SELECT 1 FROM aplicacoes WHERE id=\''+ident(3)+'\') AND NOT EXISTS(SELECT 1 FROM platform_private.application_save_preparations WHERE application_id=\''+ident(3)+'\')')
  assert '"created": false' in run(appcall(ident(2),'finalize',rect=original)).stdout;results.append('app finalized rectification replay allowed after predecessor not latest')
  denied('app B cannot replay A',appcall(ident(2),'finalize',rect=original,uid=V),'42501','application_')
  denied('app A foreign OS denied',appcall(ident(4),patch={'ordem_servico_id':OB}),'42501','application_')
  denied('app anon ACL denied','SET ROLE anon;SELECT public.rpc_salvar_aplicacao_v1(NULL,\'{}\');','42501','permission denied')
  for uid,osid,n in [(U,O,5),(V,OB,6)]:
   p={'ordem_servico_id':osid,'created_by':uid,'responsavel_id':uid}
   run(appcall(ident(n),uid=uid,patch=p));run(appcall(ident(n),'finalize',uid=uid,patch=p));results.append('app own tenant positive '+uid[:1])
  shared=ident(7);run(appcall(shared))
  with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:out=list(pool.map(lambda _:run(appcall(shared,'finalize')).stdout,range(2)))
  assert sum('"created": true' in o for o in out)==1 and sum('"created": false' in o for o in out)==1;results.append('app concurrent finalize one write one replay')
  run(appcall(ident(8),rect=shared));run(appcall(ident(9),rect=shared))
  with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:out=list(pool.map(lambda n:run(appcall(ident(n),'finalize',rect=shared),False),[8,9]))
  assert sorted(r.returncode==0 for r in out)==[False,True] and any('PT409' in r.stderr for r in out);results.append('app competing rectifications one winner one PT409')
  check('app competing rectification exactly one successor',f"(SELECT count(*) FROM aplicacoes WHERE parent_id='{shared}')=1")
  denied('app inactive before operation denied',f"BEGIN;UPDATE profiles SET ativo=false WHERE user_id='{U}';"+appcall(ident(10))+'ROLLBACK;','42501','application_actor_denied')
  check('app denied transaction no write',f"NOT EXISTS(SELECT 1 FROM platform_private.application_save_preparations WHERE application_id='{ident(10)}')")
  r=run('BEGIN;'+appcall(ident(11))+'ROLLBACK;');assert '"success": true' in r.stdout
  check('app success rollback preserves no receipt',f"NOT EXISTS(SELECT 1 FROM platform_private.application_save_preparations WHERE application_id='{ident(11)}')")
  # Genuine PostgreSQL SERIALIZABLE write skew conflict must remain 40001 outside RPC business branch.
  run('CREATE TABLE local_serialization(id integer PRIMARY KEY,n integer);INSERT INTO local_serialization VALUES(1,0);')
  first=start('BEGIN ISOLATION LEVEL SERIALIZABLE;SELECT n FROM local_serialization;SELECT pg_sleep(0.5);UPDATE local_serialization SET n=n+1;COMMIT;','serial_first')
  wait('serial_first',"wait_event='PgSleep'")
  second=run('BEGIN ISOLATION LEVEL SERIALIZABLE;UPDATE local_serialization SET n=n+1;COMMIT;')
  out=first.communicate(timeout=10);assert first.returncode and '40001' in out[1];results.append('genuine PostgreSQL serialization failure remains 40001')
  # Exact whole production files compile and refuse reduced catalogs/OIDs before any write.
  run("CREATE TABLE public.fiscal_environment_marker(project_ref text);INSERT INTO fiscal_environment_marker VALUES('swzpzcwiasxmjutrmvkm');")
  for name in ['preflight-readonly.sql','candidate.sql.review','rollback-conditioned.sql.review','postflight-readonly.sql']:
   before=run("SELECT md5(pg_get_functiondef('public.rpc_salvar_aplicacao_v1(uuid,jsonb,uuid,jsonb,uuid[])'::regprocedure));").stdout
   denied('unmodified '+name+' fail-closed on reduced catalog',(H/name).read_text(),'P0001','TARGET_DRIFT')
   assert run("SELECT md5(pg_get_functiondef('public.rpc_salvar_aplicacao_v1(uuid,jsonb,uuid,jsonb,uuid[])'::regprocedure));").stdout==before
  # Rollback exact body on local clone preserves data/ACL; invalid post transaction cannot persist replacement.
  count=run('SELECT count(*) FROM aplicacoes;').stdout
  run('BEGIN;'+targets[1]['definition']+';DO $$BEGIN RAISE EXCEPTION \'forced_post_failure\';END$$;COMMIT;',False)
  check('forced post failure rolls back definition',"md5(pg_get_functiondef('public.rpc_salvar_aplicacao_v1(uuid,jsonb,uuid,jsonb,uuid[])'::regprocedure))='"+manifest['targets'][1]['candidate_md5']+"'")
  install(1);assert run('SELECT count(*) FROM aplicacoes;').stdout==count;results.append('conditioned baseline rollback preserves all applications')
  report={'passed':len(results),'failed':0,'cases':results,'limitations':['Exact target bodies; synthetic Auth and reduced schema/helper resolvers. No hosted SQL writes/JWT/RLS homologation.','Lot conflict uses a LOCAL unique-constraint fault-injection trigger; not a production competing-writer proof.','Whole hosted PRE/POST guards deliberately reject local OIDs/catalog; full successful hosted migration not tested.','No real revocation-overlap claim; lock order risks documented separately.'],'postgres':run('SHOW server_version;').stdout.strip()}
  (H/'results-local.json').write_text(json.dumps(report,indent=2,ensure_ascii=False)+'\n');print(json.dumps(report,indent=2,ensure_ascii=False))
 finally:
  if started:subprocess.run(pre+['pg_ctl','-D',str(tmp/'data'),'stop','-m','immediate'],capture_output=True)
  shutil.rmtree(tmp,ignore_errors=True)
if __name__=='__main__':main()
