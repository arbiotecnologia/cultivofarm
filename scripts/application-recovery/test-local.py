"""Disposable PostgreSQL: real SQL bodies, reduced tables/resolvers, emulated claims, NOT JWT/hosted."""
from pathlib import Path
import tempfile, subprocess, os, json, uuid, concurrent.futures, re
HERE=Path(__file__).resolve().parent
BASE=HERE.parent/'application-access-integrity'
def main():
 t=Path(tempfile.mkdtemp(prefix='application-recovery-',dir='/tmp'));t.chmod(0o777)
 prefix=['setpriv','--reuid=1000','--regid=1000','--clear-groups'] if os.getuid()==0 else []
 cmd=['psql','-X','-h',str(t),'-p','55521','-U','postgres','-v','ON_ERROR_STOP=1','-At']
 passed=[]
 def run(sql=None,file=None,ok=True):
  r=subprocess.run(cmd+(['-f',str(file)] if file else []),input=sql,text=True,capture_output=True)
  if (r.returncode==0)!=ok: raise RuntimeError(r.stdout[-1500:]+r.stderr[-3500:])
  return r.stdout.strip()
 def check(label,expression):
  assert run(sql='SELECT ('+expression+') IS TRUE;')=='t',label
  passed.append(label)
 A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
 U='11111111-1111-4111-8111-111111111111';V='22222222-2222-4222-8222-222222222222'
 C='33333333-3333-4333-8333-333333333333';D='44444444-4444-4444-8444-444444444444'
 P='55555555-5555-4555-8555-555555555555';O='66666666-6666-4666-8666-666666666666';OB='77777777-7777-4777-8777-777777777777'
 def actor(uid=U):return f"SELECT set_config('request.jwt.claims',jsonb_build_object('sub','{uid}','iat',floor(extract(epoch FROM clock_timestamp())))::text,false); SET ROLE authenticated;"
 def payload(**extra):return dict(ordem_servico_id=O,produto_usado_id=P,created_by=U,responsavel_id=U,data_aplicacao='2026-10-19',dose_unidade='mL/ha',dose_aplicada=2,area_aplicada_ha=3,volume_total_aplicado_ml=6,**extra)
 def rpc(id,p,phase='prepare',ev=None,rect=None,keep=None,uid=U,ok=True):
  return run(sql=actor(uid)+f"SELECT public.rpc_salvar_aplicacao_v1('{id}',{repr(json.dumps(dict(p,_phase=phase)))}::jsonb,{repr(rect) if rect else 'NULL'},{repr(json.dumps(ev or []))}::jsonb,ARRAY[{','.join(repr(k)+'::uuid' for k in (keep or []))}]::uuid[]);",ok=ok)
 def denied(label,p=None,**kw):
  rpc(str(uuid.uuid4()),p or payload(),ok=False,**kw);passed.append(label)
 try:
  subprocess.run(prefix+['initdb','-D',str(t/'data'),'-A','trust','-U','postgres'],check=True,capture_output=True)
  subprocess.run(prefix+['pg_ctl','-D',str(t/'data'),'-l',str(t/'server.log'),'-o',f'-k {t} -h "" -p 55521','start'],check=True,capture_output=True)
  run(file=BASE/'local-setup.sql');run(file=BASE/'dependencies.sql.review');run(file=HERE/'local-setup.sql');run(file=BASE/'function.sql.review')
  run(file=HERE/'setup.sql.review');run(file=HERE/'function.sql.review');run(file=HERE/'storage.sql.review')
  run(sql="DO $$DECLARE r record; BEGIN FOR r IN SELECT oid::regprocedure f FROM pg_proc WHERE pronamespace IN ('public'::regnamespace,'platform_private'::regnamespace) LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon',r.f); EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated,service_role',r.f); END LOOP; END$$; CREATE FUNCTION public.aplicacao_storage_path_permitido(n text,a text) RETURNS boolean LANGUAGE sql SET search_path='' AS $$ SELECT platform_private.storage1_application_allowed(n,a); $$; GRANT EXECUTE ON FUNCTION public.aplicacao_storage_path_permitido(text,text) TO authenticated; CREATE POLICY application_select ON public.aplicacoes FOR SELECT TO authenticated USING(public.can_user_access_aplicacao(id)); CREATE POLICY evidence_select ON public.aplicacao_evidencias FOR SELECT TO authenticated USING(public.can_user_access_aplicacao(aplicacao_id)); CREATE POLICY links_select ON public.aplicacao_evidencias_vinculos FOR SELECT TO authenticated USING(public.can_user_access_aplicacao(aplicacao_id)); CREATE POLICY storage_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='aplicacao-evidencias' AND public.aplicacao_storage_path_permitido(name,'insert')); CREATE POLICY storage_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id='aplicacao-evidencias' AND public.aplicacao_storage_path_permitido(name,'select')); CREATE POLICY storage1_insert ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(platform_private.storage1_application_allowed(name,'insert')); CREATE POLICY storage1_read ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated USING(platform_private.storage1_application_allowed(name,'select'));")
  run(sql=f"INSERT INTO organizations VALUES('{A}',true),('{B}',true); INSERT INTO profiles(user_id,organization_id) VALUES('{U}','{A}'),('{V}','{B}'); INSERT INTO user_roles VALUES('{U}','administrador'),('{V}','administrador'); INSERT INTO clientes VALUES('{C}','{A}'),('{D}','{B}'); INSERT INTO produtos VALUES('{P}',true); INSERT INTO ordens_servico(id,organization_id,cliente_id,produto_id) VALUES('{O}','{A}','{C}','{P}'),('{OB}','{B}','{D}','{P}'); INSERT INTO user_clientes(user_id,cliente_id) VALUES('{U}','{C}');")
  hashes=run(sql="SELECT json_object_agg(oid::regprocedure::text,md5(pg_get_functiondef(oid))) FROM pg_proc WHERE oid IN ('public.rpc_salvar_aplicacao_v1(uuid,jsonb,uuid,jsonb,uuid[])'::regprocedure,'platform_private.storage1_application_allowed(text,text)'::regprocedure,'public.can_user_access_aplicacao(uuid)'::regprocedure);")
  (HERE/'post-hashes.local.json').write_text(hashes+'\n')
  id=str(uuid.uuid4());p=payload();path=f'{C}/{id}/{uuid.uuid4()}.png';ev=[dict(tipo='foto',storage_path=path,mime='image/png',tamanho_bytes=3,legenda=None)]
  # Storage before preparation: RLS denies even a same-tenant actor.
  def obj(path=path,size=3,mime='image/png',uid=U,ok=True):
   run(sql=actor(uid)+f"INSERT INTO storage.objects(bucket_id,name,owner_id,metadata,version) VALUES('aplicacao-evidencias','{path}','{uid}',{repr(json.dumps(dict(size=size,mimetype=mime)))}::jsonb,'local-version');",ok=ok)
  obj(ok=False);passed.append('unprepared Storage denied')
  rpc(id,p,ev=ev);check('prepare creates no application','(SELECT count(*) FROM aplicacoes)=0')
  obj(path=f'{C}/{id}/{uuid.uuid4()}.png',ok=False);passed.append('undeclared locator denied')
  obj(uid=V,ok=False);passed.append('foreign actor Storage denied')
  rpc(id,p,'finalize',ev,ok=False);check('missing object atomic','(SELECT count(*) FROM aplicacoes)=0')
  obj(size=4);rpc(id,p,'finalize',ev,ok=False);check('wrong size atomic','(SELECT count(*) FROM aplicacoes)=0')
  run(sql=f"UPDATE storage.objects SET metadata='{{\"size\":3,\"mimetype\":\"image/png\"}}' WHERE name='{path}';")
  rpc(id,p,'finalize',ev);check('valid app/evidence/link',(f"(SELECT count(*) FROM aplicacoes)=1 AND (SELECT count(*) FROM aplicacao_evidencias)=1 AND (SELECT count(*) FROM aplicacao_evidencias_vinculos)=1"))
  rpc(id,p,'finalize',ev);check('replay exactly once','(SELECT count(*) FROM aplicacoes)=1')
  out=run(sql=actor(V)+"SELECT count(*) FROM aplicacoes;");assert out.endswith('0');passed.append('B RLS read empty')
  for label,patch in [('cross tenant OS',dict(ordem_servico_id=OB)),('author spoof',dict(created_by=V)),('responsible foreign',dict(responsavel_id=V)),('wrong product',dict(produto_usado_id=str(uuid.uuid4()))),('two origins',dict(ordem_servico_onfarm_id=str(uuid.uuid4()))),('unknown field',dict(organization_id=A)),('wrong unit',dict(dose_unidade='L/ha')),('numeric string',dict(dose_aplicada='2')),('zero',dict(dose_aplicada=0)),('negative',dict(area_aplicada_ha=-1)),('NaN string',dict(dose_aplicada='NaN')),('bad total',dict(volume_total_aplicado_ml=5)),('temperature bounds',dict(temperatura_c=71)),('humidity bounds',dict(umidade_pct=101)),('wind bounds',dict(vento_kmh=251)),('latitude bounds',dict(latitude=91)),('infinite date',dict(data_aplicacao='infinity'))]:
   denied(label,dict(p,**patch))
  for label,patch in [('wrong client path',dict(storage_path=path.replace(C,D))),('traversal',dict(storage_path=f'{C}/{id}/../x.png')),('bad MIME',dict(mime='text/html')),('zero bytes',dict(tamanho_bytes=0)),('over 10MiB',dict(tamanho_bytes=10485761)),('type mismatch',dict(tipo='audio'))]:denied(label,ev=[dict(ev[0],**patch)])
  denied('over 20 files',ev=ev*21)
  for role in ['financeiro','producao','parceiro_b2b']:
   run(sql=f"UPDATE user_roles SET role='{role}' WHERE user_id='{U}';");denied('role denied '+role)
  for role in ['administrador','gestor','administrativo','aplicador','operador_onfarm','consultor_tecnico','tecnico_agronomo','cliente_produtor']:
   run(sql=f"UPDATE user_roles SET role='{role}' WHERE user_id='{U}';");rpc(str(uuid.uuid4()),p);passed.append('prepare positive '+role)
  run(sql=f"UPDATE user_roles SET role='cliente_produtor' WHERE user_id='{U}'; UPDATE user_clientes SET revoked_at=clock_timestamp();")
  rpc(id,p,'finalize',ev,ok=False);passed.append('replay after revoke denied')
  run(sql="UPDATE user_clientes SET revoked_at=NULL;");rpc(id,p,'finalize',ev);passed.append('restored replay allowed')
  run(sql=f"UPDATE profiles SET ativo=false WHERE user_id='{U}';");rpc(id,p,'prepare',ev,ok=False);passed.append('inactive replay denied')
  run(sql=f"UPDATE profiles SET ativo=true WHERE user_id='{U}'; UPDATE user_roles SET role='administrador' WHERE user_id='{U}';")
  # Exact RPC/Storage parity against a broad mixed role. No hosted writes.
  for primary in ['consultor_tecnico','tecnico_agronomo','cliente_produtor']:
   for broad in ['operador_onfarm','aplicador']:
    run(sql=f"DELETE FROM user_roles WHERE user_id='{U}'; INSERT INTO user_roles VALUES('{U}','{primary}'),('{U}','{broad}');")
    mixed=str(uuid.uuid4());mpath=f'{C}/{mixed}/{uuid.uuid4()}.png';me=[dict(ev[0],storage_path=mpath)]
    rpc(mixed,p,ev=me);obj(path=mpath);passed.append('mixed active upload '+primary+'+'+broad)
    pending=str(uuid.uuid4());ppath=f'{C}/{pending}/{uuid.uuid4()}.png';pe=[dict(ev[0],storage_path=ppath)]
    rpc(pending,p,ev=pe)
    run(sql="UPDATE user_clientes SET revoked_at=clock_timestamp();")
    obj(path=ppath,ok=False);passed.append('mixed revoked upload denied '+primary+'+'+broad)
    rpc(mixed,p,'finalize',me,ok=False);passed.append('mixed revoked finalize denied '+primary+'+'+broad)
    rpc(pending,p,ev=pe,ok=False);passed.append('mixed revoked prepare replay denied '+primary+'+'+broad)
    run(sql="UPDATE user_clientes SET revoked_at=NULL;")
  run(sql=f"DELETE FROM user_roles WHERE user_id='{U}'; INSERT INTO user_roles VALUES('{U}','administrador');")
  R='99999999-9999-4999-8999-999999999999'
  run(sql=f"INSERT INTO profiles(user_id,organization_id) VALUES('{R}','{A}'); INSERT INTO user_roles VALUES('{R}','aplicador');")
  resp=str(uuid.uuid4());resp_path=f'{C}/{resp}/{uuid.uuid4()}.png';resp_ev=[dict(ev[0],storage_path=resp_path)];resp_p=dict(p,responsavel_id=R)
  rpc(resp,resp_p,ev=resp_ev)
  run(sql=f"UPDATE profiles SET ativo=false WHERE user_id='{R}';")
  obj(path=resp_path,ok=False);rpc(resp,resp_p,'finalize',resp_ev,ok=False);passed.append('responsible revoked between prepare upload finalize denied')
  run(sql=f"UPDATE profiles SET ativo=true WHERE user_id='{R}'; DELETE FROM user_roles WHERE user_id='{R}';")
  obj(path=resp_path,ok=False);rpc(resp,resp_p,'finalize',resp_ev,ok=False);passed.append('responsible role removed upload finalize denied')
  for status in ['aberta','aprovada','programada','em_producao','em_cq','aguardando_reserva','finalizada','cancelada']:
   run(sql=f"UPDATE ordens_servico SET status='{status}' WHERE id='{O}';")
   denied('new OS status denied '+status)
  for status in ['entregue','pronto_entrega','envase']:
   run(sql=f"UPDATE ordens_servico SET status='{status}' WHERE id='{O}';")
   rpc(str(uuid.uuid4()),p);passed.append('new OS status positive '+status)
  pending_status=str(uuid.uuid4());spath=f'{C}/{pending_status}/{uuid.uuid4()}.png';se=[dict(ev[0],storage_path=spath)]
  rpc(pending_status,p,ev=se);run(sql=f"UPDATE ordens_servico SET status='aberta' WHERE id='{O}';")
  obj(path=spath,ok=False);rpc(pending_status,p,'finalize',se,ok=False);passed.append('OS status regressed upload finalize denied')
  run(sql=f"UPDATE ordens_servico SET status='finalizada' WHERE id='{O}';")
  eid=run(sql='SELECT id FROM aplicacao_evidencias;');rect=str(uuid.uuid4());rp=dict(p,motivo_retificacao='Correção sintética')
  rpc(rect,rp,rect=id,keep=[eid]);rpc(rect,rp,'finalize',rect=id,keep=[eid]);check('inheritance keeps original locator',f"(SELECT count(*) FROM aplicacao_evidencias)=1 AND (SELECT count(*) FROM aplicacao_evidencias_vinculos)=2 AND (SELECT storage_path FROM aplicacao_evidencias)='{path}' AND (SELECT is_latest FROM aplicacoes WHERE id='{id}')=false")
  rpc(rect,rp,'finalize',rect=id,keep=[eid]);passed.append('rectification replay allowed after predecessor closed')
  denied('stale rectification denied',rp,rect=id,keep=[eid])
  run(sql=f"UPDATE ordens_servico SET status='entregue' WHERE id='{O}';")
  shared=str(uuid.uuid4());rpc(shared,p)
  with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool: list(pool.map(lambda _:rpc(shared,p,'finalize'),range(2)))
  check('concurrent replay exactly once',f"(SELECT count(*) FROM aplicacoes WHERE id='{shared}')=1")
  left=str(uuid.uuid4());right=str(uuid.uuid4());rpc(left,rp,rect=shared);rpc(right,rp,rect=shared)
  def competing(x):
   try:rpc(x,rp,'finalize',rect=shared);return True
   except RuntimeError:return False
  with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:results=list(pool.map(competing,[left,right]))
  assert sorted(results)==[False,True];passed.append('competing rectification one winner')
  expired=str(uuid.uuid4());rpc(expired,p);run(sql=f"UPDATE platform_private.application_save_preparations SET expires_at=clock_timestamp()-interval '1 second' WHERE application_id='{expired}';");rpc(expired,p,'finalize',ok=False);passed.append('expired preparation denied')
  # Whole review files run unchanged and refuse this reduced schema before any write.
  def snapshot():return run(sql="SELECT oid::regprocedure,md5(pg_get_functiondef(oid)),proacl::text,proconfig FROM pg_proc WHERE oid IN ('public.rpc_salvar_aplicacao_v1(uuid,jsonb,uuid,jsonb,uuid[])'::regprocedure,'platform_private.storage1_application_allowed(text,text)'::regprocedure,'public.can_user_access_aplicacao(uuid)'::regprocedure) ORDER BY oid;")
  installed=snapshot();run(file=HERE/'candidate.sql.review',ok=False);assert snapshot()==installed;passed.append('full hosted candidate refuses reduced catalog atomically')
  run(file=HERE/'rollback.sql.review',ok=False);assert snapshot()==installed;passed.append('full hosted rollback refuses reduced catalog atomically')
  # Local-only guard substitutions are explicit: production hashes never auto-blessed.
  def localize(text,pre,post):
   guards=list(re.finditer(r'DO \$guard\$.*?END \$guard\$;',text,re.S));assert len(guards)==2
   expected=[pre,post];out='';cursor=0
   for i,m in enumerate(guards):
    hashes=expected[i]
    assertions=' OR '.join("md5(pg_get_functiondef('"+sig+"'::regprocedure)) IS DISTINCT FROM '"+h+"'" for sig,h in hashes.items())
    out+=text[cursor:m.start()]+"DO $$BEGIN IF "+assertions+" THEN RAISE EXCEPTION 'LOCAL_REDUCED_GUARD_DRIFT'; END IF; END$$;";cursor=m.end()
   return out+text[cursor:]
  post=json.loads(hashes);baseline=dict(post)
  run(file=HERE/'baseline-rpc.sql.review');run(file=HERE/'baseline-storage.sql.review')
  baseline=json.loads(run(sql="SELECT json_object_agg(oid::regprocedure::text,md5(pg_get_functiondef(oid))) FROM pg_proc WHERE oid IN ('public.rpc_salvar_aplicacao_v1(uuid,jsonb,uuid,jsonb,uuid[])'::regprocedure,'platform_private.storage1_application_allowed(text,text)'::regprocedure,'public.can_user_access_aplicacao(uuid)'::regprocedure);"))
  assert baseline['rpc_salvar_aplicacao_v1(uuid,jsonb,uuid,jsonb,uuid[])']=='46d342a71f4712056782cf3d976154a5'
  assert baseline['platform_private.storage1_application_allowed(text,text)']=='fa4f590bec955e4a254a906fbda82e20'
  passed.append('exact baseline hashes verified locally')
  # Existing receipts stay preserved; local candidate starts with a clean private receipt table.
  run(sql='ALTER TABLE platform_private.application_save_preparations RENAME TO local_preserved_receipts;')
  before=snapshot();temp=t/'candidate.sql';text=localize((HERE/'candidate.sql.review').read_text(),baseline,post)
  temp.write_text(text.replace('-- POSTCHECK',"DO $$BEGIN RAISE EXCEPTION 'forced_post_failure'; END$$;\n-- POSTCHECK"));run(file=temp,ok=False);assert snapshot()==before;check('candidate post failure rolls back private table',"to_regclass('platform_private.application_save_preparations') IS NULL")
  temp.write_text(text);run(file=temp);assert snapshot()==installed;passed.append('full localized candidate installs exact hashes')
  temp.write_text(localize((HERE/'rollback.sql.review').read_text(),post,baseline).replace('-- POSTCHECK',"DO $$BEGIN RAISE EXCEPTION 'forced_rollback_failure'; END$$;\n-- POSTCHECK"));run(file=temp,ok=False);assert snapshot()==installed;passed.append('rollback post failure atomic')
  temp.write_text(localize((HERE/'rollback.sql.review').read_text(),post,baseline));run(file=temp);assert snapshot()==before;passed.append('rollback exact closed baseline')
  check('rollback preserves receipt/history',"to_regclass('platform_private.application_save_preparations') IS NOT NULL AND (SELECT count(*) FROM aplicacoes)>0")
  run(sql="SELECT set_config('request.jwt.claims','{}',false); SET ROLE authenticated; SELECT public.rpc_salvar_aplicacao_v1(NULL,'{}');",ok=False);passed.append('rollback remains closed')
  report=dict(passed=len(passed),failed=0,cases=passed,hashes=json.loads(hashes),limitations='Reduced schema/RLS/auth emulation. Storage.objects synthetic, not real SDK upload/bytes/JWT/browser. Full hosted guard refuses reduced catalog; full install/rollback use explicit local-only guard substitutions. No hosted writes.')
  (HERE/'results.local.json').write_text(json.dumps(report,indent=2,ensure_ascii=False)+'\n');print(json.dumps(report,indent=2,ensure_ascii=False))
 finally:subprocess.run(prefix+['pg_ctl','-D',str(t/'data'),'stop','-m','immediate'],capture_output=True)
if __name__=='__main__':main()