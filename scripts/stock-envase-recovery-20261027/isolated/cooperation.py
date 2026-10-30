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
 # This first case tests release of a business prelock only, not inverse-order DML.
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
 # Real inverse-order DML: one transaction owns a lote row; envase owns the
 # singleton and waits for that row; the holder UPDATE then waits for singleton.
 # Either participant must abort with the actual concurrency SQLSTATE. No replica,
 # fabricated authority, generic error acceptance or automatic retry is permitted.
 o,p,l=[T.u(2910+i) for i in range(3)]
 X.sql('SET session_replication_role=replica;'+T.manufactured(o,p,l))
 before=X.snapshot()
 holder=T.T.session(f"\\set VERBOSITY verbose\nBEGIN;SET LOCAL lock_timeout='3s';SELECT 1 FROM public.lotes WHERE id='{l}' FOR UPDATE;")
 w=subprocess.Popen(X.pg.psql(),stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
 w.stdin.write("\\set VERBOSITY verbose\nSET application_name='inverse_envase';"+T.actor(T.W)+T.envase(o,p,l,[{'tipo_embalagem':'frasco_1L','quantidade':2}],'inverse-test01')+'\n');w.stdin.flush()
 for _ in range(100):
  if X.last("SELECT count(*) FROM pg_stat_activity WHERE application_name='inverse_envase' AND wait_event_type='Lock';")=='1':break
  time.sleep(.02)
 else:raise AssertionError('INVERSE_ENVASE_WAIT_NOT_OBSERVED')
 out_h,err_h=T.T.finish(holder,f"UPDATE public.lotes SET codigo_lote=codigo_lote WHERE id='{l}';ROLLBACK;")
 w.stdin.close();w.stdin=None;out_w,err_w=w.communicate(timeout=20)
 X.raw.append({'test':'inverse prelock actual DML','holder_stdout':out_h,'holder_stderr':err_h,'worker_stdout':out_w,'worker_stderr':err_w,'worker_returncode':w.returncode})
 assert re.search(r'ERROR:\s+(40P01|55P03):',err_h+err_w),(out_h,err_h,out_w,err_w)
 assert 'CQ_MANUAL' not in err_h+err_w, 'BUSINESS_ERROR_MASKED_LOCK_TEST'
 if w.returncode==0:
  assert '"success": true' in out_w and X.last(f"SELECT count(*) FROM public.envase WHERE lote_id='{l}';")=='1'
 else:
  assert re.search(r'ERROR:\s+(40P01|55P03):',err_w) and X.snapshot()==before
 X.ok('real inverse-prelock DML deadlock/timeout rejects exact concurrency state without partial envase')