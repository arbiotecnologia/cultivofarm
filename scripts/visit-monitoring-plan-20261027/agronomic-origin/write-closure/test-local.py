"""Synthetic Auth + disposable PostgreSQL only; reuses the installed-predecessor harness.
No network/hosted connections. Candidate PRE hashes are audited LIVE, not spoofed here.
"""
from pathlib import Path
import re
HERE=Path(__file__).resolve().parent
parent=HERE.parent
source=(parent/'test-local.py').read_text()
source=source.replace('HERE=Path(__file__).resolve().parent; ROOT=HERE.parent',f'HERE=Path({str(parent)!r}); ROOT=HERE.parent')
source=source.replace('PORT=55497','PORT=55498')
start=source.index('  # --- direct-write closure')
end=source.index("  print('TOTAL',checks)",start)
extra=r'''
  # NEW delta; predecessor semantics above run unchanged (as postgres).
  sql("ALTER TABLE alertas_agronomicos ALTER COLUMN id SET DEFAULT gen_random_uuid(); ALTER TABLE alertas_agronomicos ALTER COLUMN status SET DEFAULT 'ativo'; ALTER TABLE alertas_agronomicos ALTER COLUMN updated_at SET DEFAULT now();")
  for name in ('rpc_criar_alerta_climatico_v1','rpc_atualizar_status_alerta_agronomico_v1'):
   sql((CLOSURE/(name+'.baseline.sql')).read_text())
  sql("CREATE OR REPLACE FUNCTION public.test_scope(f uuid,t uuid,o uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT platform_private.monitoring_refs_in_actor_tenant(f,t,o) $$;")
  sql("ALTER ROLE service_role BYPASSRLS; GRANT USAGE ON SCHEMA public TO service_role; GRANT SELECT,INSERT,UPDATE,DELETE ON alertas_agronomicos TO authenticated,anon,service_role; ALTER TABLE alertas_agronomicos ENABLE ROW LEVEL SECURITY;")
  sql("CREATE POLICY test_read ON alertas_agronomicos FOR SELECT TO authenticated USING(public.test_scope(fazenda_id,talhao_id,registro_origem_id)); CREATE POLICY test_write ON alertas_agronomicos FOR ALL TO authenticated USING(true) WITH CHECK(true); CREATE POLICY test_tenant ON alertas_agronomicos AS RESTRICTIVE FOR ALL TO authenticated USING(public.test_scope(fazenda_id,talhao_id,registro_origem_id)) WITH CHECK(public.test_scope(fazenda_id,talhao_id,registro_origem_id));")
  for sig in ('rpc_criar_alerta_climatico_v1(uuid,uuid,tipo_alerta,nivel_risco,text)','rpc_atualizar_status_alerta_agronomico_v1(uuid,status_alerta,timestamptz)'):
   sql(f'REVOKE ALL ON FUNCTION public.{sig} FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.{sig} TO authenticated,service_role;')
  # Reproduce the escape before closure, proving negatives below can fail.
  au=lambda q,actor=G:f"SET ROLE authenticated; SET test.actor='{actor}'; {q}"
  sql(au(f"UPDATE alertas_agronomicos SET nivel_risco='critico' WHERE id='{AL}';"))
  ok(f"SELECT nivel_risco='critico' FROM alertas_agronomicos WHERE id='{AL}';",'PRE direct risk really writes')
  delta=(CLOSURE/'candidate.sql.review').read_text()
  delta=re.sub(r'DO \$pre\$.*?\$pre\$;','',delta,flags=re.S)
  delta=re.sub(r'DO \$post\$.*?\$post\$;','',delta,flags=re.S)
  sql(delta)
  ok("SELECT count(*)=3 FROM pg_policy WHERE polrelid='alertas_agronomicos'::regclass AND NOT polpermissive AND polroles=ARRAY['authenticated'::regrole::oid] AND polname LIKE 'monitoring_authenticated_%_closed';",'three command-specific restrictive policies installed')
  snap=val(f"SELECT md5(row(a.*)::text) FROM alertas_agronomicos a WHERE id='{AL}';")
  for actor in (G,X):
   own=AL if actor==G else ALB
   for field,value in [('nivel_risco',"'baixo'"),('status',"'encerrado'"),('data_vencimento',"'2026-12-30'"),('registro_origem_id','NULL')]:
    ok(au(f"WITH w AS (UPDATE alertas_agronomicos SET {field}={value} WHERE id='{own}' RETURNING id) SELECT count(*)=0 FROM w;",actor),f'direct {field} actor {actor}: zero rows')
   ok(au(f"WITH w AS (DELETE FROM alertas_agronomicos WHERE id='{own}' RETURNING id) SELECT count(*)=0 FROM w;",actor),'direct DELETE own zero rows')
   farm,plot=(FA,TA) if actor==G else (FB,TB)
   err(au(f"INSERT INTO alertas_agronomicos(fazenda_id,talhao_id,tipo_alerta,nivel_risco) VALUES('{farm}','{plot}','praga','baixo');",actor),'42501','direct INSERT without origin denied')
   err(au(f"INSERT INTO alertas_agronomicos(fazenda_id,talhao_id,tipo_alerta,nivel_risco,registro_origem_id) VALUES('{farm}','{plot}','praga','baixo','{V}');",actor),'PT409','direct INSERT origin remains trigger denied')
  ok(au(f"WITH w AS (UPDATE alertas_agronomicos SET registro_origem_id=NULL WHERE id='{AL}' RETURNING id) , w2 AS (UPDATE alertas_agronomicos SET data_vencimento='2026-12-30' WHERE id='{AL}' RETURNING id) SELECT (SELECT count(*)=0 FROM w) AND (SELECT count(*)=0 FROM w2);"),'unlink then date zero rows')
  ok(f"SELECT md5(row(a.*)::text)='{snap}' FROM alertas_agronomicos a WHERE id='{AL}';",'all direct negatives atomic')
  ok(au(f"SELECT count(*)=1 FROM alertas_agronomicos WHERE id='{AL}';"),'SELECT own unchanged')
  ok(au(f"SELECT count(*)=0 FROM alertas_agronomicos WHERE id='{ALB}';"),'SELECT A to B zero rows')
  ok(au(f"SELECT count(*)=0 FROM alertas_agronomicos WHERE id='{AL}';",X),'SELECT B to A zero rows')
  for q in (f"UPDATE alertas_agronomicos SET status='encerrado' WHERE id='{AL}';",f"DELETE FROM alertas_agronomicos WHERE id='{AL}';"):
   ok('SET ROLE anon; WITH w AS ('+q.rstrip(';')+' RETURNING id) SELECT count(*)=0 FROM w;','anon mutation zero rows')
  err(f"SET ROLE anon; INSERT INTO alertas_agronomicos(fazenda_id,talhao_id,tipo_alerta,nivel_risco) VALUES('{FA}','{TA}','praga','baixo');",'42501','anon INSERT denied')
  ok('SET ROLE anon; SELECT count(*)=0 FROM alertas_agronomicos;','anon SELECT remains denied')
  create=lambda farm=FA,plot=TA:f"SELECT * FROM public.rpc_criar_alerta_climatico_v1('{farm}','{plot}','estresse_hidrico','baixo','Teste sintético');"
  status=lambda a=AL:f"SELECT (public.rpc_atualizar_status_alerta_agronomico_v1('{a}','monitoramento',{at(a)})).id;"
  old=lambda a=ALN:f"SELECT public.rpc_reprogramar_monitoramento_v1('{a}','2026-11-26',{at(a)});"
  sql(au(create())); sql(au(create(FB,TB),X))
  ok("SELECT count(*)=2 FROM alertas_agronomicos WHERE tipo_alerta='estresse_hidrico';",'creation RPC postgres owner A/B positive')
  sql(au(status())); sql(au(status(ALB),X))
  ok(f"SELECT status='monitoramento' FROM alertas_agronomicos WHERE id='{ALB}';",'status RPC B own positive')
  sql(au(old())); sql(au(old(ALB),X))
  ok(f"SELECT data_vencimento='2026-11-26' FROM alertas_agronomicos WHERE id='{ALN}';",'v1 without origin positive')
  sql(au(resched(d='2026-11-27',key=k(120))))
  ok(f"SELECT a.data_vencimento=r.data_proxima_visita AND r.version=7 FROM alertas_agronomicos a JOIN registros_consultor r ON r.id=a.registro_origem_id WHERE a.id='{AL}';",'v2 sync still positive with restrictive policies')
  for q in (create(),status(),old(),resched(actor=X,d='2026-11-28',key=k(121))):
   observed=val(f"SELECT updated_at FROM alertas_agronomicos WHERE id='{AL}';")
   observed_n=val(f"SELECT updated_at FROM alertas_agronomicos WHERE id='{ALN}';")
   q=q.replace(at(AL),f"'{observed}'::timestamptz").replace(at(ALN),f"'{observed_n}'::timestamptz")
   err(au(q,X),'PT404','cross B to A RPC denied')
  for q in (create(),status(),old()):
   err('SET ROLE anon; '+q,'42501','anon legacy RPC ACL denied')
  sql(f"SET ROLE service_role; UPDATE alertas_agronomicos SET nivel_risco='alto' WHERE id='{AL}';")
  ok(f"SELECT nivel_risco='alto' FROM alertas_agronomicos WHERE id='{AL}';",'service_role job risk UPDATE preserved')
  err(f"SET ROLE service_role; UPDATE alertas_agronomicos SET data_vencimento='2026-12-30' WHERE id='{AL}';",'PT409','service_role cannot bypass linked date guard')
  # Legacy RPC waits: deterministic lock observation, synthetic revocation-first, bounded gate and row/advisory waits.
  for name,q in [('creation',create()),('status',status()),('v1',old())]:
   rv=spawn(); rv.stdin.write(f"BEGIN; UPDATE actors SET ready=false WHERE id='{G}';\n"); rv.stdin.flush(); time.sleep(.15)
   op=spawn(); op.stdin.write('\\set VERBOSITY verbose\n'+au(q)+'\n'); op.stdin.close()
   pattern={'creation':'rpc_criar_alerta_climatico_v1','status':'rpc_atualizar_status_alerta_agronomico_v1','v1':'rpc_reprogramar_monitoramento_v1'}[name]
   wait_lock(pattern)
   rv.stdin.write('COMMIT;\n'); rv.stdin.close(); rv.wait(timeout=5); op.wait(timeout=5)
   error=op.stderr.read()
   if op.returncode==0 or '42501' not in error: raise AssertionError(name+error)
   checks+=1; print('PASS',name,'synthetic revocation-first actual gate wait denies')
   sql(f"UPDATE actors SET ready=true WHERE id='{G}';")
   g=spawn(); g.stdin.write('BEGIN; SELECT * FROM cf_user_guards_v1.state FOR UPDATE;\n'); g.stdin.flush(); time.sleep(.15)
   t=time.monotonic(); r=sql(au(q),False); elapsed=time.monotonic()-t
   g.stdin.write('COMMIT;\n'); g.stdin.close(); g.wait(timeout=5)
   if r.returncode==0 or '55P03' not in r.stderr or not 2.5<elapsed<5: raise AssertionError(name+str(elapsed)+r.stderr)
   checks+=1; print('PASS',name,'gate timeout',round(elapsed,2))
  for q,lock in [(status(),f"SELECT id FROM alertas_agronomicos WHERE id='{AL}' FOR UPDATE"),(old(),f"SELECT id FROM alertas_agronomicos WHERE id='{ALN}' FOR UPDATE"),(create(),f"SELECT pg_advisory_xact_lock(hashtextextended('{FA}:{TA}:estresse_hidrico',0))")]:
   row=spawn(); row.stdin.write('BEGIN; '+lock+';\n'); row.stdin.flush(); time.sleep(.15)
   t=time.monotonic(); r=sql(au(q),False); elapsed=time.monotonic()-t
   row.stdin.write('COMMIT;\n'); row.stdin.close(); row.wait(timeout=5)
   if r.returncode==0 or '55P03' not in r.stderr or not 2.5<elapsed<5: raise AssertionError(str(elapsed)+r.stderr)
   checks+=1; print('PASS legacy row/advisory timeout',round(elapsed,2))
  # Hash the exact LIVE v1 body (earlier semantic tests replace only its clock for deterministic dates).
  sql((CLOSURE/'rpc_reprogramar_monitoramento_v1.baseline.sql').read_text())
  sql("ALTER FUNCTION public.rpc_reprogramar_monitoramento_v1(uuid,date,timestamptz) SET lock_timeout='3s';")
  for name in ('rpc_criar_alerta_climatico_v1','rpc_atualizar_status_alerta_agronomico_v1','rpc_reprogramar_monitoramento_v1'):
   print('EXPECTED_FUNCTION',val(f"SELECT oid::regprocedure::text||E'\\t'||md5(pg_get_functiondef(oid)) FROM pg_proc WHERE proname='{name}';"))
  err((CLOSURE/'preflight.sql').read_text(),'55000','PRE rejects non-LIVE synthetic baseline')
  # Exercise complete POST logic: substitute only fingerprints of reduced synthetic dependencies.
  post=(CLOSURE/'postflight.sql').read_text()
  fingerprint=val("SELECT md5(string_agg(polname||':'||polcmd::text||':'||polpermissive::text||':'||polroles::text||':'||coalesce(pg_get_expr(polqual,polrelid),'')||':'||coalesce(pg_get_expr(polwithcheck,polrelid),''),E'\\n' ORDER BY polname)) FROM pg_policy WHERE polrelid='alertas_agronomicos'::regclass AND polname NOT LIKE 'monitoring_authenticated_%_closed';")
  post=post.replace('826292c397fd1dea1f07a23e37b56a04',fingerprint)
  for sig,h in [('platform_private.link_alert_origin_core(uuid,uuid,timestamptz,integer,uuid)','c0da2db32df6d5161c5c1d4dee84b495'),('platform_private.reschedule_monitoring_core(uuid,date,timestamptz,integer,uuid)','3c31ce9dbf3ee2e23d82b43b07a70a5c'),('platform_private.guard_alert_origin_sync()','c7e11bafbdf60e08495c68dfc9f9b12f'),('platform_private.guard_visit_plan_preservation()','618797b75f8c6b962dc70c0841c84de1')]:
   post=post.replace(h,val(f"SELECT md5(pg_get_functiondef('{sig}'::regprocedure));"))
  sql(post); checks+=1; print('PASS POST full assertions with explicitly synthetic dependency fingerprints')
  sql('ALTER POLICY monitoring_authenticated_update_closed ON alertas_agronomicos USING(true);')
  err(post,'55000','POST rejects widened restrictive policy')
  sql('ALTER POLICY monitoring_authenticated_update_closed ON alertas_agronomicos USING(false);')
  sql((CLOSURE/'rollback-containment.sql.review').read_text())
  err(au(status()),'42501','containment closes user RPC')
  err(au(f"UPDATE alertas_agronomicos SET nivel_risco='baixo' WHERE id='{AL}';"),'42501','containment does not restore direct write')
  ok(au(f"SELECT count(*)=1 FROM alertas_agronomicos WHERE id='{AL}';"),'containment preserves SELECT')
  sql(f"SET ROLE service_role; UPDATE alertas_agronomicos SET nivel_risco='alto' WHERE id='{AL}';")
  checks+=1; print('PASS containment preserves service_role job')
'''
source=source[:start]+extra+source[end:]
namespace={'__name__':'closure_harness','CLOSURE':HERE}
exec(compile(source,str(HERE/'test-local.py'),'exec'),namespace)
namespace['main']()
