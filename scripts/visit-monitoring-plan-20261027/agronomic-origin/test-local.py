"""Disposable PostgreSQL + synthetic Auth/reduced schema. Never connects to hosted Supabase.
Proves candidate semantics and both commit orderings of revocation vs. operation on the gate."""
from pathlib import Path
import tempfile, subprocess, os, shutil, time, re
HERE=Path(__file__).resolve().parent; ROOT=HERE.parent
ORG_A='a0000000-0000-4000-8000-000000000001'; ORG_B='b0000000-0000-4000-8000-000000000001'
C='c0000000-0000-4000-8000-00000000000c'  # consultor A
G='90000000-0000-4000-8000-000000000009'  # gestor A
X='e0000000-0000-4000-8000-00000000000e'  # gestor B (foreign)
FA='fa000000-0000-4000-8000-000000000001'; TA='7a000000-0000-4000-8000-000000000001'; TA2='7a000000-0000-4000-8000-000000000002'
FB='fb000000-0000-4000-8000-000000000001'; TB='7b000000-0000-4000-8000-000000000001'
V='11111111-1111-4111-8111-111111111111'   # visit A with plan (rascunho)
VN='12121212-1212-4212-8212-121212121212'  # visit A without plan
VF='13131313-1313-4313-8313-131313131313'  # visit A finalized
AL='a1000000-0000-4000-8000-000000000001'; AL2='a1000000-0000-4000-8000-000000000002'; AL3='a1000000-0000-4000-8000-000000000003'
ALT='a1000000-0000-4000-8000-0000000000f2'; ALX='a1000000-0000-4000-8000-0000000000cc'; ALB='a1000000-0000-4000-8000-0000000000bb'; ALN='a1000000-0000-4000-8000-0000000000a0'
PORT=55497
PLAN='{"items":["Nutrição","Estande"],"frequency":"14","triggers":"Avaliar","next_date":"2026-11-05"}'
def k(n): return f'{n:08x}-0000-4000-8000-000000000000'
def main():
 tmp=Path(tempfile.mkdtemp(prefix='agro-origin-',dir='/tmp')); tmp.chmod(0o777)
 prefix=['setpriv','--reuid=1000','--regid=1000','--clear-groups'] if os.getuid()==0 else []; started=False; checks=0
 base=['psql','-X','-h',str(tmp),'-p',str(PORT),'-U','postgres','-v','ON_ERROR_STOP=1','-At']
 def sql(q,ok=True):
  r=subprocess.run(base,input='\\set VERBOSITY verbose\n'+q,text=True,capture_output=True)
  if ok and r.returncode: raise RuntimeError(r.stderr)
  return r
 def val(q): return sql(q).stdout.strip().splitlines()[-1]
 def ok(q,label):
  nonlocal checks
  if val(q)!='t': raise AssertionError(label)
  checks+=1; print('PASS',label)
 def err(q,code,label):
  nonlocal checks
  r=sql(q,False)
  if r.returncode==0 or code not in r.stderr: raise AssertionError(label+': '+r.stderr+r.stdout)
  checks+=1; print('PASS',label,code)
 def at(a): return f"(SELECT updated_at FROM alertas_agronomicos WHERE id='{a}')"
 def ver(v): return f"(SELECT version FROM registros_consultor WHERE id='{v}')"
 def link(actor=C,a=AL,v=V,alert_at=None,version=None,key=k(1)):
  return f"SET test.actor='{actor}'; SELECT public.rpc_vincular_origem_alerta_v1('{a}','{v}',{alert_at or at(a)},{version or ver(v)},'{key}');"
 def resched(actor=G,a=AL,d='2026-11-20',alert_at=None,version='AUTO',key=k(100)):
  vv=f"(SELECT r.version FROM registros_consultor r JOIN alertas_agronomicos x ON x.registro_origem_id=r.id WHERE x.id='{a}')" if version=='AUTO' else version
  return f"SET test.actor='{actor}'; SELECT public.rpc_reprogramar_monitoramento_v2('{a}','{d}',{alert_at or at(a)},{vv},'{key}');"
 def spawn():
  return subprocess.Popen(base,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
 def wait_lock(pattern,n=1):
  for _ in range(250):
   if int(val(f"SELECT count(*) FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE '%{pattern}%';"))==n: return
   time.sleep(.02)
  raise AssertionError('not waiting: '+pattern)
 try:
  subprocess.run(prefix+['initdb','-D',str(tmp/'data'),'-A','trust','-U','postgres'],check=True,capture_output=True)
  subprocess.run(prefix+['pg_ctl','-D',str(tmp/'data'),'-l',str(tmp/'log'),'-o',f'-k {tmp} -h "" -p {PORT}','start'],check=True,capture_output=True); started=True
  sql(f"""
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth; CREATE SCHEMA platform_private; CREATE SCHEMA cf_user_guards_v1;
GRANT USAGE ON SCHEMA public,platform_private,auth TO authenticated,anon;
CREATE TABLE platform_private.test_clock(today date); INSERT INTO platform_private.test_clock VALUES('2026-10-27');
CREATE FUNCTION platform_private.test_today() RETURNS date LANGUAGE sql AS $$SELECT today FROM platform_private.test_clock$$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('test.actor',true),'')::uuid$$;
CREATE TYPE public.app_role AS ENUM('gestor','administrador','consultor_tecnico');
CREATE TYPE public.status_alerta AS ENUM('ativo','monitoramento','encerrado');
CREATE TYPE public.nivel_risco AS ENUM('baixo','medio','alto','critico');
CREATE TYPE public.tipo_alerta AS ENUM('praga','doenca','daninha','nematoide','estresse_hidrico');
CREATE TABLE cf_user_guards_v1.state(singleton boolean,revision bigint); INSERT INTO cf_user_guards_v1.state VALUES(true,1);
CREATE TABLE actors(id uuid PRIMARY KEY,org uuid,ready boolean,roles app_role[]);
INSERT INTO actors VALUES('{C}','{ORG_A}',true,'{{consultor_tecnico}}'),('{G}','{ORG_A}',true,'{{gestor}}'),('{X}','{ORG_B}',true,'{{gestor}}');
-- Synthetic mirror of live user_roles/profiles a00_cf_user_gate: revocation takes the same gate.
CREATE FUNCTION actors_gate() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN PERFORM 1 FROM cf_user_guards_v1.state WHERE singleton FOR UPDATE; RETURN NEW; END$$;
CREATE TRIGGER a00_gate BEFORE UPDATE ON actors FOR EACH ROW EXECUTE FUNCTION actors_gate();
CREATE TABLE fazendas(id uuid PRIMARY KEY,org uuid); INSERT INTO fazendas VALUES('{FA}','{ORG_A}'),('{FB}','{ORG_B}');
CREATE TABLE talhoes(id uuid PRIMARY KEY,fazenda_id uuid); INSERT INTO talhoes VALUES('{TA}','{FA}'),('{TA2}','{FA}'),('{TB}','{FB}');
CREATE TABLE registros_consultor(id uuid PRIMARY KEY,actor_id uuid,cliente_id uuid,fazenda_id uuid,talhao_id uuid,status text,version integer,observacoes_tecnicas text,data_proxima_visita date,updated_at timestamptz DEFAULT now());
INSERT INTO registros_consultor VALUES
 ('{V}','{C}','{ORG_A}','{FA}','{TA}','rascunho',1,'Notas preservadas',null,now()),
 ('{VN}','{C}','{ORG_A}','{FA}','{TA}','em_andamento',4,'Sem plano ### Conduta {{}}',null,now()),
 ('{VF}','{C}','{ORG_A}','{FA}','{TA}','rascunho',1,'Final',null,now());
CREATE TABLE alertas_agronomicos(id uuid PRIMARY KEY,fazenda_id uuid NOT NULL,talhao_id uuid,tipo_alerta tipo_alerta NOT NULL,nivel_risco nivel_risco NOT NULL,descricao text,
 data_alerta timestamptz NOT NULL DEFAULT now(),status status_alerta NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL,data_vencimento date,registro_origem_id uuid);
INSERT INTO alertas_agronomicos(id,fazenda_id,talhao_id,tipo_alerta,nivel_risco,status,updated_at,data_vencimento) VALUES
 ('{AL}','{FA}','{TA}','praga','alto','monitoramento','2026-10-27 10:00:00.123456+00','2026-11-01'),
 ('{AL2}','{FA}','{TA}','doenca','alto','monitoramento','2026-10-27 10:00:00.000001+00','2026-11-01'),
 ('{AL3}','{FA}',null,'nematoide','baixo','monitoramento','2026-10-27 10:00:00+00','2026-11-01'),
 ('{ALT}','{FA}','{TA2}','praga','alto','monitoramento','2026-10-27 10:00:00+00','2026-11-01'),
 ('{ALB}','{FB}','{TB}','praga','alto','monitoramento','2026-10-27 10:00:00+00','2026-11-01'),
 ('{ALN}','{FA}','{TA}','daninha','medio','monitoramento','2026-10-27 10:00:00+00','2026-11-01'),
 ('{ALX}','{FA}','{TA}','doenca','baixo','monitoramento','2026-10-27 10:00:00+00','2026-11-20');
CREATE TABLE monitoramento_avisos(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),registro_consultor_id uuid,tipo text,data_referencia date,UNIQUE(registro_consultor_id,tipo,data_referencia));
CREATE TABLE visitas_logs(id uuid DEFAULT gen_random_uuid(),registro_consultor_id uuid,usuario_id uuid,acao text,descricao text,metadata jsonb);
CREATE FUNCTION technical_actor_ready(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT EXISTS(SELECT 1 FROM public.actors WHERE id=$1 AND id=auth.uid() AND ready)$$;
CREATE FUNCTION has_role(uuid,app_role) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT EXISTS(SELECT 1 FROM public.actors WHERE id=$1 AND $2=ANY(roles))$$;
CREATE FUNCTION can_manage_technical_visit(uuid,uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT public.technical_actor_ready($1) AND EXISTS(SELECT 1 FROM public.registros_consultor r JOIN public.actors a ON a.id=$1
  WHERE r.id=$2 AND r.cliente_id=a.org AND (r.actor_id=$1 OR 'gestor'=ANY(a.roles)))$$;
CREATE FUNCTION can_view_technical_visit(uuid,uuid) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT public.can_manage_technical_visit($1,$2)$$;
CREATE FUNCTION has_active_user_cliente_access(uuid,uuid,text[]) RETURNS boolean LANGUAGE sql AS $$SELECT true$$;
CREATE FUNCTION is_visit_org_manager(uuid,uuid) RETURNS boolean LANGUAGE sql AS $$SELECT false$$;
CREATE FUNCTION platform_private.monitoring_refs_in_actor_tenant(p_fazenda uuid,p_talhao uuid,p_origem uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT public.technical_actor_ready(auth.uid()) AND EXISTS(SELECT 1 FROM public.fazendas f JOIN public.actors a ON a.id=auth.uid() AND a.org=f.org
  WHERE f.id=p_fazenda AND (p_talhao IS NULL OR EXISTS(SELECT 1 FROM public.talhoes t WHERE t.id=p_talhao AND t.fazenda_id=f.id))
  AND (p_origem IS NULL OR EXISTS(SELECT 1 FROM public.registros_consultor r WHERE r.id=p_origem AND r.fazenda_id=f.id
   AND (p_talhao IS NULL OR r.talhao_id IS NOT DISTINCT FROM p_talhao))))$$;
CREATE FUNCTION enforce_visit_immutability() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF OLD.status NOT IN ('rascunho','em_andamento') THEN RAISE EXCEPTION 'locked' USING ERRCODE='42501'; END IF; RETURN NEW; END$$;
CREATE TRIGGER trg_enforce_visit_immutability BEFORE UPDATE ON registros_consultor FOR EACH ROW WHEN (OLD.status NOT IN ('rascunho','em_andamento') AND NEW.status=OLD.status) EXECUTE FUNCTION enforce_visit_immutability();
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
""")
  sql((ROOT/'_visita_lock_and_check.live.sql').read_text()+';')
  sql((ROOT/'rpc_reprogramar_monitoramento_v1.live.sql').read_text().replace("(now() AT TIME ZONE 'America/Sao_Paulo')::date","platform_private.test_today()")+';')
  # Mirror LIVE v1 ACL {postgres,authenticated,service_role}.
  sql('REVOKE ALL ON FUNCTION public.rpc_reprogramar_monitoramento_v1(uuid,date,timestamptz) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.rpc_reprogramar_monitoramento_v1(uuid,date,timestamptz) TO authenticated,service_role;')
  strip=lambda s: re.sub(r'DO \$pre\$.*?\$pre\$;','',s,flags=re.S).replace("(clock_timestamp() AT TIME ZONE 'America/Sao_Paulo')::date","platform_private.test_today()")
  sql(strip((ROOT/'candidate.sql.review').read_text()))
  sql(strip((ROOT/'preservation/candidate.sql.review').read_text()))
  sql(f"SET test.actor='{C}'; SELECT public.rpc_salvar_plano_monitoramento_visita_v1('{V}',1,'{PLAN}'::jsonb,'{k(900)}');")
  sql(f"SET test.actor='{C}'; SELECT public.rpc_salvar_plano_monitoramento_visita_v1('{VF}',1,'{PLAN}'::jsonb,'{k(901)}'); UPDATE registros_consultor SET status='finalizado' WHERE id='{VF}';")
  ok(f"SELECT version=2 AND observacoes_tecnicas LIKE 'Notas preservadas%Próxima Avaliação: 2026-11-05%' FROM registros_consultor WHERE id='{V}';",'fixture: canonical plan saved')
  # Synthetic guard text differs from LIVE; POST compares to its own installed md5 here only.
  gmd5=val("SELECT md5(pg_get_functiondef('platform_private.guard_visit_plan_preservation()'::regprocedure));")
  cand=strip((HERE/'candidate.sql.review').read_text()).replace("<>'618797b75f8c6b962dc70c0841c84de1' THEN\n    RAISE EXCEPTION 'agronomic_origin_postflight_failed'",f"<>'{gmd5}' THEN\n    RAISE EXCEPTION 'agronomic_origin_postflight_failed'"); sql(cand)
  # --- origin link ---
  err(link(actor=X),'PT404','foreign actor B cannot link A alert to A visit')
  err(link(a=ALB),'PT404','foreign alert B into visit A')
  err(link(a=ALT),'22023','incompatible talhão rejected')
  err(link(alert_at="'2026-10-27 10:00:00.123457+00'"),'PT409','alert CAS differs by one microsecond')
  err(link(alert_at='NULL'),'PT409','null alert CAS')
  err(link(version='1'),'PT409','stale visit version')
  err(link(version='NULL'),'PT409','null visit version')
  err(link(v=VF,a=AL2),'42501','finalized visit cannot gain origin')
  err(link(),'22023','link with alert date != plan date rejected (no divergence)')
  ok(f"SELECT registro_origem_id IS NULL FROM alertas_agronomicos WHERE id='{AL}';",'date mismatch link wrote nothing')
  sql(f"SET test.actor='{G}'; SELECT public.rpc_reprogramar_monitoramento_v1('{AL}','2026-11-05',{at(AL)});")
  alat0=val(f"SELECT updated_at FROM alertas_agronomicos WHERE id='{AL}';")
  r1=val(link()); r2=val(link(alert_at=f"'{alat0}'::timestamptz",version='2'))
  if r1!=r2: raise AssertionError('replay differs'); 
  checks+=1; print('PASS link replay returns identical receipt')
  ok(f"SELECT registro_origem_id='{V}' AND tipo_alerta='praga' FROM alertas_agronomicos WHERE id='{AL}';",'link sets origin, keeps real alert type')
  ok(f"SELECT count(*)=1 FROM visitas_logs WHERE acao='alerta_origem_vinculada';",'link log once')
  ok(f"SELECT version=2 FROM registros_consultor WHERE id='{V}';",'link does not bump visit content version')
  err(link(alert_at="'2026-10-27 10:00:00.1+00'",version='2'),'PT409','same key changed payload')
  err(link(v=VN,key=k(2)),'PT409','already linked alert cannot be re-pointed')
  err(link(a=ALX,key=k(4)),'PT409','second alert on same visit rejected')
  ok(f"SELECT registro_origem_id IS NULL FROM alertas_agronomicos WHERE id='{ALX}';",'second alert untouched')
  # --- link scope: only saved canonical plan + date + exactly 1 coherent notice; checked before alert write ---
  def link_vn(key): return link(a=AL3,v=VN,key=k(key))
  def untouched(lbl): ok(f"SELECT registro_origem_id IS NULL FROM alertas_agronomicos WHERE id='{AL3}';",lbl+': alert untouched')
  err(link_vn(10),'PT409','link visit without plan rejected'); untouched('no plan')
  sql(f"UPDATE registros_consultor SET data_proxima_visita='2026-11-01' WHERE id='{VN}';")
  err(link_vn(11),'PT409','link visit with date but no plan rejected'); untouched('date no plan')
  sql("ALTER TABLE registros_consultor DISABLE TRIGGER trg_visit_plan_preservation;")
  sql(f"UPDATE registros_consultor SET observacoes_tecnicas='x [PLANO DE MONITORAMENTO]\nItens: Pragas\nPróxima Avaliação: 2026-11-01' WHERE id='{VN}';")
  err(link_vn(12),'PT409','link malformed block (no end marker) rejected'); untouched('malformed')
  sql(f"UPDATE registros_consultor SET observacoes_tecnicas='[PLANO DE MONITORAMENTO]\nItens: Pragas\nPróxima Avaliação: 2026-11-01\n[FIM DO PLANO]', data_proxima_visita=NULL WHERE id='{VN}';")
  err(link_vn(13),'PT409','link plan with null visit date rejected'); untouched('null date')
  sql(f"UPDATE registros_consultor SET data_proxima_visita='2026-11-01' WHERE id='{VN}';")
  err(link_vn(14),'PT409','link plan with 0 notices rejected'); untouched('0 notices')
  sql(f"INSERT INTO monitoramento_avisos(registro_consultor_id,tipo,data_referencia) VALUES('{VN}','plano_monitoramento','2026-11-02');")
  err(link_vn(15),'PT409','link notice date divergent rejected'); untouched('divergent notice')
  sql(f"INSERT INTO monitoramento_avisos(registro_consultor_id,tipo,data_referencia) VALUES('{VN}','plano_monitoramento','2026-11-01');")
  err(link_vn(16),'PT409','link plan with 2 notices rejected'); untouched('2 notices')
  sql(f"DELETE FROM monitoramento_avisos WHERE registro_consultor_id='{VN}'; UPDATE registros_consultor SET observacoes_tecnicas='Sem plano ### Conduta {{}}', data_proxima_visita=NULL WHERE id='{VN}';")
  sql("ALTER TABLE registros_consultor ENABLE TRIGGER trg_visit_plan_preservation;")
  ok("SELECT count(*)=0 FROM platform_private.monitoring_alert_receipts WHERE request_id IN ("+",".join(f"'{k(n)}'" for n in range(10,17))+");",'rejected links left no receipts')
  lst=val(f"SET test.actor='{C}'; SELECT public.rpc_listar_alertas_vinculaveis_v1('{V}')::text;")
  if ALT in lst or ALB in lst or AL not in lst or AL3 not in lst: raise AssertionError('list scope '+lst)
  checks+=1; print('PASS linkable list excludes other talhão/tenant/foreign-linked')
  err(f"SET test.actor='{X}'; SELECT public.rpc_listar_alertas_vinculaveis_v1('{V}');",'PT404','foreign list denied')
  # --- legacy v1 ---
  err(f"SET test.actor='{G}'; SELECT public.rpc_reprogramar_monitoramento_v1('{AL}','2026-11-20',{at(AL)});",'PT428','old v1 caller with origin fails safely')
  ok(f"SELECT data_vencimento='2026-11-05' FROM alertas_agronomicos WHERE id='{AL}';",'v1 refusal wrote nothing')
  sql(f"SET test.actor='{G}'; SELECT public.rpc_reprogramar_monitoramento_v1('{ALN}','2026-11-09',{at(ALN)});")
  ok(f"SELECT data_vencimento='2026-11-09' FROM alertas_agronomicos WHERE id='{ALN}';",'v1 without origin unchanged')
  err(f"UPDATE registros_consultor SET data_proxima_visita='2026-11-20' WHERE id='{V}';",'PT409','guard still denies direct date write')
  # --- v2 reschedule with plan ---
  expected=val(f"SELECT md5(replace(observacoes_tecnicas,'Próxima Avaliação: 2026-11-05','Próxima Avaliação: 2026-11-20')) FROM registros_consultor WHERE id='{V}';")
  err(resched(actor=C),'42501','consultant without gestor role cannot reschedule')
  err(resched(actor=X),'PT404','foreign gestor B cannot reschedule A')
  err(resched(alert_at="'2026-10-27 10:00:00.000001+00'"),'PT409','reschedule stale alert microsecond')
  err(resched(version='1'),'PT409','reschedule stale visit version')
  err(resched(version='NULL'),'PT409','reschedule null visit version with origin')
  err(resched(d='2026-10-26'),'22023','past Sao Paulo date rejected')
  alat=val(f"SELECT updated_at FROM alertas_agronomicos WHERE id='{AL}';")
  # --- notice/alert ambiguity blocks atomically, nothing fabricated ---
  snap=f"SELECT md5(row(r.observacoes_tecnicas,r.data_proxima_visita,r.version,a.data_vencimento,a.updated_at,(SELECT string_agg(m.id::text||m.data_referencia,',' ORDER BY m.id) FROM monitoramento_avisos m WHERE m.registro_consultor_id=r.id))::text) FROM registros_consultor r, alertas_agronomicos a WHERE r.id='{V}' AND a.id='{AL}';"
  s0=val(snap)
  sql(f"INSERT INTO monitoramento_avisos(registro_consultor_id,tipo,data_referencia) VALUES('{V}','plano_monitoramento','2026-12-01');")
  err(resched(),'PT409','two plan notices rejected')
  sql(f"DELETE FROM monitoramento_avisos WHERE registro_consultor_id='{V}' AND data_referencia='2026-12-01';")
  nid=val(f"SELECT id FROM monitoramento_avisos WHERE registro_consultor_id='{V}';")
  sql(f"DELETE FROM monitoramento_avisos WHERE id='{nid}';")
  err(resched(),'PT409','zero plan notices rejected')
  ok(f"SELECT count(*)=0 FROM monitoramento_avisos WHERE registro_consultor_id='{V}';",'zero notices: none fabricated')
  sql(f"INSERT INTO monitoramento_avisos VALUES('{nid}','{V}','plano_monitoramento','2026-11-05');")
  sql(f"UPDATE monitoramento_avisos SET data_referencia='2026-11-06' WHERE id='{nid}';")
  err(resched(),'PT409','notice date incoherent with plan rejected')
  sql(f"UPDATE monitoramento_avisos SET data_referencia='2026-11-05' WHERE id='{nid}';")
  sql(f"ALTER TABLE alertas_agronomicos DISABLE TRIGGER trg_alert_origin_sync; UPDATE alertas_agronomicos SET registro_origem_id='{V}' WHERE id='{ALX}'; ALTER TABLE alertas_agronomicos ENABLE TRIGGER trg_alert_origin_sync;")  # legacy data: 2 alerts share visit
  err(resched(),'PT409','two alerts sharing visit block synchronization')
  ok(f"SELECT data_vencimento='2026-11-20' FROM alertas_agronomicos WHERE id='{ALX}';",'other alert not modified')
  sql(f"ALTER TABLE alertas_agronomicos DISABLE TRIGGER trg_alert_origin_sync; UPDATE alertas_agronomicos SET registro_origem_id=NULL WHERE id='{ALX}'; ALTER TABLE alertas_agronomicos ENABLE TRIGGER trg_alert_origin_sync;")
  ok(snap.replace('SELECT md5','SELECT '+repr(s0)[0]+s0+repr(s0)[0]+'=md5',1),'ambiguity rejections fully atomic')
  res=val(resched())
  ok(f"SELECT version=3 AND data_proxima_visita='2026-11-20' AND md5(observacoes_tecnicas)='{expected}' AND observacoes_tecnicas LIKE 'Notas preservadas%Itens: Nutrição, Estande%' FROM registros_consultor WHERE id='{V}';",'plan text byte-preserved except date line')
  ok(f"SELECT data_referencia='2026-11-20' FROM monitoramento_avisos WHERE registro_consultor_id='{V}' AND tipo='plano_monitoramento';",'generic notice date reconciled')
  ok(f"SELECT data_vencimento='2026-11-20' FROM alertas_agronomicos WHERE id='{AL}';",'alert date reconciled')
  ok("SELECT count(*)=0 FROM platform_private.visit_plan_write_tickets;",'ticket removed in transaction')
  if '"visita_atualizada": true' not in res or '"modo": "plano_visita_aviso_alerta"' not in res: raise AssertionError(res)
  checks+=1; print('PASS envelope visita_atualizada true')
  sql("UPDATE platform_private.test_clock SET today='2026-11-25';")
  res2=val(resched(alert_at=f"'{alat}'::timestamptz",version='2'))
  if res2!=res: raise AssertionError('replay '+res2)
  checks+=1; print('PASS confirmed replay survives past date')
  err(resched(d='2026-11-24',key=k(101)),'22023','new past reschedule after replay')
  sql("UPDATE platform_private.test_clock SET today='2026-10-27';")
  err(resched(d='2026-11-21'),'PT409','same reschedule key changed payload')
  # --- plan writer after link: different date blocked, same date content edit allowed ---
  p2=PLAN.replace('2026-11-05','2026-11-27')
  err(f"SET test.actor='{C}'; SELECT public.rpc_salvar_plano_monitoramento_visita_v1('{V}',3,'{p2}'::jsonb,'{k(902)}');",'PT409','plan date change after link blocked')
  ok(f"SELECT version=3 AND data_proxima_visita='2026-11-20' FROM registros_consultor WHERE id='{V}';",'blocked plan write no change')
  p3=PLAN.replace('2026-11-05','2026-11-20').replace('Avaliar','Avaliar vigor')
  sql(f"SET test.actor='{C}'; SELECT public.rpc_salvar_plano_monitoramento_visita_v1('{V}',3,'{p3}'::jsonb,'{k(903)}');")
  ok(f"SELECT r.version=4 AND r.observacoes_tecnicas LIKE '%Gatilhos: Avaliar vigor%Próxima Avaliação: 2026-11-20%' AND a.data_vencimento=r.data_proxima_visita FROM registros_consultor r, alertas_agronomicos a WHERE r.id='{V}' AND a.id='{AL}';",'same-date plan edit keeps alert synchronized')
  # --- visit without plan / finalized / no origin ---
  sql(f"ALTER TABLE alertas_agronomicos DISABLE TRIGGER trg_alert_origin_sync; UPDATE alertas_agronomicos SET registro_origem_id='{VN}' WHERE id='{AL3}'; ALTER TABLE alertas_agronomicos ENABLE TRIGGER trg_alert_origin_sync;")  # legacy origin without plan
  vn0=val(f"SELECT md5(row(r.*)::text)||(SELECT md5(row(a.*)::text) FROM alertas_agronomicos a WHERE a.id='{AL3}') FROM registros_consultor r WHERE r.id='{VN}';")
  err(resched(a=AL3,d='2026-11-12',key=k(102)),'PT409','legacy origin without plan: reschedule rejected')
  ok(f"SELECT md5(row(r.*)::text)||(SELECT md5(row(a.*)::text) FROM alertas_agronomicos a WHERE a.id='{AL3}')='{vn0}' FROM registros_consultor r WHERE r.id='{VN}';",'no-plan rejection atomic, no notice fabricated')
  sql(f"ALTER TABLE alertas_agronomicos DISABLE TRIGGER trg_alert_origin_sync; UPDATE alertas_agronomicos SET registro_origem_id='{VF}' WHERE id='{AL2}'; ALTER TABLE alertas_agronomicos ENABLE TRIGGER trg_alert_origin_sync;")
  fin=val(f"SELECT md5(row(observacoes_tecnicas,data_proxima_visita,version)::text) FROM registros_consultor WHERE id='{VF}';")
  res=val(resched(a=AL2,d='2026-11-15',key=k(103)))
  ok(f"SELECT md5(row(observacoes_tecnicas,data_proxima_visita,version)::text)='{fin}' FROM registros_consultor WHERE id='{VF}';",'finalized visit untouched')
  if '"visita_atualizada": false' not in res or '"modo": "somente_alerta"' not in res: raise AssertionError(res)
  checks+=1; print('PASS finalized: explicit alert-only mode, visit not synchronized')
  sql(resched(a=ALN,d='2026-11-16',version='NULL',key=k(104)))
  err(resched(a=ALN,d='2026-11-17',version='3',key=k(105)),'PT409','no-origin alert rejects visit version')
  # --- atomic rollback ---
  sql("CREATE FUNCTION fail_log() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'injected' USING ERRCODE='P9999'; END$$; CREATE TRIGGER fail_log BEFORE INSERT ON visitas_logs FOR EACH ROW EXECUTE FUNCTION fail_log();")
  err(resched(d='2026-11-22',key=k(106)),'P9999','log failure')
  ok(f"SELECT r.version=4 AND r.data_proxima_visita='2026-11-20' AND a.data_vencimento='2026-11-20' FROM registros_consultor r, alertas_agronomicos a WHERE r.id='{V}' AND a.id='{AL}';",'rollback visit+alert')
  ok(f"SELECT count(*)=0 FROM platform_private.monitoring_alert_receipts WHERE request_id='{k(106)}';",'rollback receipt')
  sql('DROP TRIGGER fail_log ON visitas_logs;')
  # --- ACL ---
  err(f"SET ROLE anon; SELECT public.rpc_reprogramar_monitoramento_v2('{AL}','2026-11-20',now(),1,'{k(1)}');",'42501','anon cannot execute v2')
  err("SET ROLE authenticated; SELECT * FROM platform_private.monitoring_alert_receipts;",'42501','authenticated cannot read receipts')
  err(f"SET ROLE anon; SELECT public.rpc_vincular_origem_alerta_v1('{AL}','{V}',now(),1,'{k(1)}');",'42501','anon cannot execute link')
  err(f"SET ROLE anon; SELECT public.rpc_listar_alertas_vinculaveis_v1('{V}');",'42501','anon cannot execute list')
  err(f"SET test.actor='{X}'; SELECT public.rpc_vincular_origem_alerta_v1('{ALB}','{V}',{at(ALB)},{ver(V)},'{k(5)}');",'PT404','B alert into A visit by B denied')
  err(f"SET test.actor='{X}'; SELECT public.rpc_salvar_plano_monitoramento_visita_v1('{V}',{ver(V)},'{p3}'::jsonb,'{k(904)}');",'PT404','B cannot write A plan')
  # --- concurrency: same key twice while gate held ---
  g=spawn(); g.stdin.write('BEGIN; SELECT * FROM cf_user_guards_v1.state FOR UPDATE;\n'); g.stdin.flush(); time.sleep(.2)
  q=resched(d='2026-11-23',key=k(107)); p1=spawn(); p1.stdin.write(q+'\n'); p1.stdin.close(); p2=spawn(); p2.stdin.write(q+'\n'); p2.stdin.close()
  wait_lock('rpc_reprogramar_monitoramento_v2',2)
  g.stdin.write('COMMIT;\n'); g.stdin.close(); g.wait(timeout=10)
  outs=[]
  for p in (p1,p2):
   p.wait(timeout=10); outs.append((p.returncode,p.stdout.read(),p.stderr.read()))
  # Both read CAS before the wait: the second either replays the receipt or fails CAS; never a second write.
  ok(f"SELECT version=5 FROM registros_consultor WHERE id='{V}';",'concurrent double submit one increment')
  ok(f"SELECT count(*)=1 FROM platform_private.monitoring_alert_receipts WHERE request_id='{k(107)}';",'concurrent one receipt')
  if not any(rc==0 for rc,_,_ in outs): raise AssertionError(outs)
  checks+=1; print('PASS concurrent: at least one confirmed, other replay or PT409')
  # --- ORDER 1: revocation acquires gate first and commits first -> operation denied ---
  rv=spawn(); rv.stdin.write(f"BEGIN; UPDATE actors SET ready=false WHERE id='{G}';\n"); rv.stdin.flush()
  time.sleep(.2)
  op=spawn(); op.stdin.write('\\set VERBOSITY verbose\n'+resched(d='2026-11-24',key=k(108))+'\n'); op.stdin.close()
  wait_lock('rpc_reprogramar_monitoramento_v2',1)
  rv.stdin.write('COMMIT;\n'); rv.stdin.close(); rv.wait(timeout=10); op.wait(timeout=10)
  e=op.stderr.read()
  if op.returncode==0 or '42501' not in e: raise AssertionError('order1 '+e)
  checks+=1; print('PASS order1 revocation committed before gate release: operation 42501')
  ok(f"SELECT version=5 FROM registros_consultor WHERE id='{V}';",'order1 no write')
  sql(f"UPDATE actors SET ready=true WHERE id='{G}';")
  # --- ORDER 2: operation holds gate (paused on alert row), revocation queues on gate -> operation commits first ---
  row=spawn(); row.stdin.write(f"BEGIN; SELECT id FROM alertas_agronomicos WHERE id='{AL}' FOR UPDATE;\n"); row.stdin.flush(); time.sleep(.2)
  op=spawn(); op.stdin.write(resched(d='2026-11-24',key=k(109))+'\n'); op.stdin.close()
  wait_lock('rpc_reprogramar_monitoramento_v2',1)
  rv=spawn(); rv.stdin.write(f"BEGIN; UPDATE actors SET ready=false WHERE id='{G}'; COMMIT;\n"); rv.stdin.close()
  wait_lock("UPDATE actors SET ready=false",1)
  row.stdin.write('COMMIT;\n'); row.stdin.close(); row.wait(timeout=10); op.wait(timeout=10); rv.wait(timeout=10)
  if op.returncode: raise AssertionError('order2 '+op.stderr.read())
  ok(f"SELECT version=6 AND data_proxima_visita='2026-11-24' FROM registros_consultor WHERE id='{V}';",'order2 operation serialized before revocation committed')
  ok(f"SELECT NOT ready FROM actors WHERE id='{G}';",'order2 revocation committed after operation')
  err(resched(d='2026-11-25',key=k(110)),'42501','order2 later request denied after revocation')
  sql(f"UPDATE actors SET ready=true WHERE id='{G}';")
  # --- bounded wait: gate held longer than lock_timeout ---
  g=spawn(); g.stdin.write('BEGIN; SELECT * FROM cf_user_guards_v1.state FOR UPDATE;\n'); g.stdin.flush(); time.sleep(.2)
  t0=time.time(); r=sql('\\set VERBOSITY verbose\n'+resched(d='2026-11-25',key=k(111)),False); el=time.time()-t0
  g.stdin.write('COMMIT;\n'); g.stdin.close(); g.wait(timeout=10)
  if r.returncode==0 or '55P03' not in r.stderr or el>6: raise AssertionError(f'bounded {el} {r.stderr}')
  checks+=1; print(f'PASS gate wait bounded by lock_timeout 55P03 ({el:.1f}s)')
  # --- direct-write closure (synthetic authenticated with table UPDATE/INSERT, as LIVE) ---
  sql("GRANT INSERT,UPDATE ON alertas_agronomicos TO authenticated,service_role; GRANT SELECT ON alertas_agronomicos TO service_role; GRANT USAGE ON SCHEMA public TO service_role;")
  au=lambda q: f"SET ROLE authenticated; SET test.actor='{G}'; {q}"
  err(au(f"UPDATE alertas_agronomicos SET data_vencimento='2026-12-30' WHERE id='{AL}';"),'PT409','direct date change on linked alert denied')
  err(au(f"UPDATE alertas_agronomicos SET registro_origem_id=NULL WHERE id='{AL}';"),'PT409','direct unlink denied')
  err(au(f"BEGIN; UPDATE alertas_agronomicos SET registro_origem_id=NULL WHERE id='{AL}'; UPDATE alertas_agronomicos SET data_vencimento='2026-12-30' WHERE id='{AL}'; COMMIT;"),'PT409','unlink-then-date denied')
  err(au(f"UPDATE alertas_agronomicos SET registro_origem_id='{VN}' WHERE id='{AL}';"),'PT409','direct relink denied')
  err(au(f"UPDATE alertas_agronomicos SET registro_origem_id='{V}' WHERE id='{ALN}';"),'PT409','direct link of unlinked alert denied')
  err(au(f"UPDATE alertas_agronomicos SET talhao_id='{TA2}' WHERE id='{AL}';"),'PT409','direct plot change on linked alert denied')
  err(au(f"INSERT INTO alertas_agronomicos(id,fazenda_id,talhao_id,tipo_alerta,nivel_risco,status,updated_at,registro_origem_id) VALUES(gen_random_uuid(),'{FA}','{TA}','praga','alto','monitoramento',now(),'{V}');"),'PT409','direct INSERT with origin denied')
  err(au(f"INSERT INTO platform_private.alert_origin_write_tickets VALUES(txid_current(),'{AL}');"),'42501','ticket forge denied')
  err(f"SET ROLE service_role; UPDATE alertas_agronomicos SET data_vencimento='2026-12-30' WHERE id='{AL}';",'PT409','no role escape (service_role) for linked date')
  ok(f"SELECT data_vencimento='2026-11-24' AND registro_origem_id='{V}' FROM alertas_agronomicos WHERE id='{AL}';",'linked alert unchanged after direct attempts')
  sql(au(f"UPDATE alertas_agronomicos SET nivel_risco='alto' WHERE id='{AL}';"))
  ok(f"SELECT nivel_risco='alto' FROM alertas_agronomicos WHERE id='{AL}';",'regression: risk update on linked alert allowed (edge function path)')
  sql(au(f"UPDATE alertas_agronomicos SET data_vencimento='2026-12-02' WHERE id='{ALT}';"))
  ok(f"SELECT data_vencimento='2026-12-02' FROM alertas_agronomicos WHERE id='{ALT}';",'regression: date change on unlinked alert allowed')
  sql(au(f"INSERT INTO alertas_agronomicos(id,fazenda_id,talhao_id,tipo_alerta,nivel_risco,status,updated_at) VALUES(gen_random_uuid(),'{FA}','{TA}','praga','alto','monitoramento',now());"))
  checks+=1; print('PASS regression: INSERT without origin allowed (climatic creation shape)')
  sql(au(f"UPDATE alertas_agronomicos SET status='encerrado' WHERE id='{AL2}';"))
  ok(f"SELECT status='encerrado' FROM alertas_agronomicos WHERE id='{AL2}';",'regression: closing linked alert allowed (status RPC shape)')
  err(au(f"UPDATE alertas_agronomicos SET status='monitoramento' WHERE id='{AL2}';"),'PT409','reopening closed linked alert denied')
  ok("SELECT count(*)=0 FROM platform_private.alert_origin_write_tickets;",'no alert tickets left after canonical writers')
  print('TOTAL',checks)
 finally:
  if started: subprocess.run(prefix+['pg_ctl','-D',str(tmp/'data'),'stop','-m','immediate'],capture_output=True)
  shutil.rmtree(tmp,ignore_errors=True)
if __name__=='__main__': main()
