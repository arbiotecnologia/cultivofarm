"""Real enabled trigger serialization, including zero-row DML and existing gates."""
import subprocess,re,time
def run(X):
 T=X.T
 # No replica mode: even a denied/zero-row writer must acquire the mutation gate
 # before touching authority or CQ. It is not a test of permission to change CQ.
 statements={
  'role':f"UPDATE public.user_roles SET role=role WHERE user_id='{T.W}';",
  'tenant':f"UPDATE public.profiles SET nome=nome WHERE user_id='{T.W}';",
  'SaaS':f"UPDATE public.organization_subscriptions SET updated_at=updated_at WHERE organization_id='{T.A}';",
  'CQ':f"UPDATE public.controle_qualidade SET seq=seq WHERE false;",
  'new CQ':'INSERT INTO public.controle_qualidade(lote_id) SELECT NULL::uuid WHERE false;',
  'root':f"UPDATE public.lotes SET codigo_lote=codigo_lote WHERE false;",
 }
 for label,stmt in statements.items():
  holder=T.T.session('BEGIN;SELECT 1 FROM cf_user_guards_v1.state WHERE singleton FOR UPDATE;')
  w=subprocess.Popen(X.pg.psql(),stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
  w.stdin.write("\\set VERBOSITY verbose\nSET application_name='coop_envase';BEGIN;"+stmt+'ROLLBACK;\n'); w.stdin.flush()
  for _ in range(100):
   if X.last("SELECT count(*) FROM pg_stat_activity WHERE application_name='coop_envase' AND wait_event_type='Lock';")=='1':break
   time.sleep(.02)
  else: raise AssertionError('COOPERATION_WAIT_NOT_OBSERVED '+label)
  T.T.finish(holder,'COMMIT;');w.stdin.close();w.stdin=None;out,err=w.communicate(timeout=20)
  X.raw.append({'test':'cooperation '+label,'stdout':out,'stderr':err,'returncode':w.returncode})
  assert w.returncode==0,(label,out,err)
  X.ok('enabled '+label+' writer waits on envase gate without replica bypass')
 # Inverse prelock order is bounded, fail-atomic rather than silently committing
 # through the gate. Caller must retry manually, never automatic writes.
 o,p,l=[T.u(2900+i) for i in range(3)]
 X.sql('SET session_replication_role=replica;'+T.manufactured(o,p,l))
 holder=T.T.session(f"BEGIN;SELECT 1 FROM public.lotes WHERE id='{l}' FOR UPDATE;")
 w=subprocess.Popen(X.pg.psql(),stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
 w.stdin.write("\\set VERBOSITY verbose\nSET application_name='prelock_envase';"+T.actor(T.W)+T.envase(o,p,l,[{'tipo_embalagem':'frasco_1L','quantidade':2}],'prelock-test01')+'\n');w.stdin.flush()
 for _ in range(100):
  if X.last("SELECT count(*) FROM pg_stat_activity WHERE application_name='prelock_envase' AND wait_event_type='Lock';")=='1':break
  time.sleep(.02)
 else:raise AssertionError('PRELOCK_WAIT_NOT_OBSERVED')
 # Release prelock without DML; the competing canonical write completes truthfully.
 T.T.finish(holder,'ROLLBACK;');w.stdin.close();w.stdin=None;out,err=w.communicate(timeout=20)
 assert w.returncode==0,(out,err)
 X.ok('business prelock released then envase completes under enabled gate')