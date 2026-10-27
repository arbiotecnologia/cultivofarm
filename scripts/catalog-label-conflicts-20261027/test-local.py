"""PG descartável com corpos EXATOS LIVE/candidato dos 2 alvos + helpers LIVE exatos (replay/audit/require_actor/touch).
Auth SINTÉTICA (auth.uid/auth.jwt por GUC de sessão) e schema reduzido; papéis stubados. NÃO é homologação JWT/RLS real."""
from pathlib import Path
import json,subprocess,tempfile,os,time,hashlib
H=Path(__file__).resolve().parent
F={r['signature']:r for r in json.loads((H/'live-functions.json').read_text())}
M=json.loads((H/'manifest.json').read_text())
UPD='platform_update_catalog_label(uuid,timestamp with time zone,text,text,uuid)';ACT='platform_set_catalog_label_active(uuid,timestamp with time zone,boolean,text,uuid)'
tmp=Path(tempfile.mkdtemp(prefix='label-conf-',dir='/tmp'));tmp.chmod(0o777)
pre=['setpriv','--reuid=1000','--regid=1000','--clear-groups'] if os.getuid()==0 else []
cmd=['psql','-X','-h',str(tmp),'-p','55541','-U','postgres','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-At','-d','postgres']
R=[]
def run(s,ok=True):
  r=subprocess.run(cmd,input=s,text=True,capture_output=True)
  if ok and r.returncode:raise AssertionError(r.stderr[-2500:])
  return r
def val(s):return run(s).stdout.strip().splitlines()[-1]
def check(l,e):assert val('SELECT ('+e+') IS TRUE;')=='t',l;R.append(l)
def deny(l,s,code,msg):
  r=run(s,False);assert r.returncode and code in r.stderr and msg in r.stderr,(l,r.stderr[-800:]);R.append(l)
SA='00000000-0000-4000-8000-0000000000a1';TA='00000000-0000-4000-8000-0000000000b1';TB='00000000-0000-4000-8000-0000000000b2'
LID='00000000-0000-4000-8000-000000000101'
def act(u):return f"SELECT set_config('test.sub','{u}',false),set_config('test.iat',(extract(epoch from now())::bigint-5)::text,false);SET ROLE authenticated;"
REASON="'motivo sintetico valido'"
def key(n):return f"'00000000-0000-4000-8000-{n:012d}'"
def ver():return val(f"SELECT updated_at::text FROM public.catalog_family_labels WHERE id='{LID}';")
def upd(v,ex,k):return f"SELECT public.platform_update_catalog_label('{LID}','{v}','{ex}',{REASON},{key(k)});"
def setact(v,a,k):return f"SELECT public.platform_set_catalog_label_active('{LID}','{v}',{a},{REASON},{key(k)});"
SETUP=r"""
CREATE ROLE anon NOLOGIN;CREATE ROLE authenticated NOLOGIN;CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA auth;CREATE SCHEMA platform_private;GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('test.sub',true),'')::uuid$$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT CASE WHEN nullif(current_setting('test.sub',true),'') IS NULL THEN NULL ELSE jsonb_build_object('sub',current_setting('test.sub'),'iat',current_setting('test.iat')::bigint,'exp',current_setting('test.iat')::bigint+3600) END$$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon,authenticated;
CREATE TYPE public.app_role AS ENUM('superadmin','admin');
CREATE TABLE public.test_roles(user_id uuid,role public.app_role,active boolean DEFAULT true);
CREATE FUNCTION public.has_role(u uuid,r public.app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$SELECT EXISTS(SELECT 1 FROM public.test_roles WHERE user_id=u AND role=r AND active)$$;
CREATE FUNCTION public.is_platform_superadmin(u uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$SELECT public.has_role(u,'superadmin')$$;
CREATE FUNCTION platform_private.platform_actor_access_ready(u uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$SELECT EXISTS(SELECT 1 FROM public.test_roles WHERE user_id=u AND active)$$;
CREATE TABLE public.catalog_family_labels(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),familia text NOT NULL CHECK(familia=ANY(ARRAY['biologico','quimico','fertilizante_adubo'])),rotulo text NOT NULL CHECK(rotulo ~ '^[a-z0-9][a-z0-9_]{1,39}$'),rotulo_exibicao text NOT NULL CHECK(char_length(btrim(rotulo_exibicao)) BETWEEN 2 AND 80),ativo boolean NOT NULL DEFAULT true,created_by uuid,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(familia,rotulo));
CREATE TABLE public.catalog_platform_admin_audit(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),operation text NOT NULL,actor_id uuid NOT NULL,reason text NOT NULL,correlation_id uuid NOT NULL UNIQUE,status text NOT NULL CHECK(status='completed'),counts_before jsonb NOT NULL DEFAULT '{}',counts_after jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now(),completed_at timestamptz);
ALTER TABLE public.catalog_family_labels ENABLE ROW LEVEL SECURITY;ALTER TABLE public.catalog_platform_admin_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.catalog_family_labels,public.catalog_platform_admin_audit FROM PUBLIC,anon,authenticated;
"""
def install(sig,candidate):
  r=F[sig];src=r['definition']
  if candidate:
    for m in ['catalog_label_conflict','catalog_label_confirmation_failed']:src=src.replace(f"ERRCODE = '40001', MESSAGE = '{m}'",f"ERRCODE = 'PT409', MESSAGE = '{m}'")
  run(src+';');s='public.'+sig
  run(f"REVOKE ALL ON FUNCTION {s} FROM PUBLIC;GRANT EXECUTE ON FUNCTION {s} TO authenticated,service_role;")
  want=next(t['candidate_md5'] for t in M['targets'] if t['signature']==sig) if candidate else r['md5']
  check(('candidato' if candidate else 'LIVE')+' hash exato '+sig.split('(')[0],f"md5(pg_get_functiondef('{s}'::regprocedure))='{want}'")
def reset():
  run(f"DELETE FROM public.catalog_platform_admin_audit;DELETE FROM public.catalog_family_labels;INSERT INTO public.catalog_family_labels(id,familia,rotulo,rotulo_exibicao,updated_at) VALUES('{LID}','quimico','fungicida','Fungicida','2026-10-21T10:00:00Z');")
def audits():return val("SELECT count(*) FROM public.catalog_platform_admin_audit;")
def suite(cand):
  code='PT409' if cand else '40001';tag='cand' if cand else 'LIVE';reset();v0=ver()
  # stale
  deny(f'{tag} update stale -> {code}',act(SA)+upd('2026-01-01T00:00:00Z','Novo',1),code,'catalog_label_conflict')
  deny(f'{tag} active stale -> {code}',act(SA)+setact('2026-01-01T00:00:00Z','false',2),code,'catalog_label_conflict')
  check(f'{tag} stale sem escrita/auditoria',f"(SELECT updated_at::text='{v0}' AND rotulo_exibicao='Fungicida' AND ativo FROM public.catalog_family_labels) AND {audits()}=0")
  # no-op
  deny(f'{tag} update no-op 22023',act(SA)+upd(v0,'Fungicida',3),'22023','catalog_label_no_change')
  deny(f'{tag} active no-op 22023',act(SA)+setact(v0,'true',4),'22023','catalog_label_no_change')
  # sucesso + replay idempotente
  run(act(SA)+upd(v0,'Fungicida X',5));v1=ver()
  out=val(act(SA)+f"SELECT (public.platform_update_catalog_label('{LID}','{v0}','Fungicida X',{REASON},{key(5)})->>'idempotent');")
  assert out=='true',out;R.append(f'{tag} replay idempotente retorna recibo')
  check(f'{tag} replay sem nova auditoria',f"{audits()}=1 AND (SELECT updated_at::text='{v1}' FROM public.catalog_family_labels)")
  deny(f'{tag} replay chave reutilizada outro pedido -> 40001 residual helper',act(SA)+upd(v1,'Outro',5),'40001','catalog_entity_conflict')
  # duas conexões
  run(act(SA)+setact(v1,'false',6));v2=ver()
  p=subprocess.Popen(cmd,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
  p.stdin.write("SET application_name='c1';BEGIN;"+act(SA)+setact(v2,'true',7)+"SELECT pg_sleep(1.5);COMMIT;");p.stdin.close()
  t=time.time()
  while val("SELECT count(*) FROM pg_stat_activity WHERE application_name='c1' AND query LIKE '%pg_sleep%';")=='0':
    assert time.time()-t<5;time.sleep(.05)
  q=subprocess.Popen(cmd,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
  q.stdin.write("SET application_name='c2';"+act(SA)+upd(v2,'Concorrente',8));q.stdin.close()
  t=time.time()
  while val("SELECT count(*) FROM pg_stat_activity WHERE application_name='c2' AND wait_event_type='Lock';")=='0':
    assert time.time()-t<5;time.sleep(.05)
  R.append(f'{tag} c2 observada aguardando lock de linha')
  o1=p.communicate(timeout=10);o2=q.communicate(timeout=10)
  assert p.returncode==0,o1;assert q.returncode and code in o2[1] and 'catalog_label_conflict' in o2[1],o2;R.append(f'{tag} duas conexões: 1 vence, 1 {code}')
  check(f'{tag} concorrente sem sobrescrever vencedor',f"(SELECT ativo AND rotulo_exibicao='Fungicida X' FROM public.catalog_family_labels) AND {audits()}=3")
  # rollback de pós-condição (injeção local: trigger altera rotulo)
  v3=ver();n=audits()
  run("CREATE FUNCTION public.zz_fault() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN NEW.rotulo:='fungicida_x';RETURN NEW;END$$;CREATE TRIGGER zz_fault BEFORE UPDATE ON public.catalog_family_labels FOR EACH ROW EXECUTE FUNCTION public.zz_fault();")
  deny(f'{tag} pós-condição update -> {code}',act(SA)+upd(v3,'Falha',9),code,'catalog_label_confirmation_failed')
  deny(f'{tag} pós-condição active -> {code}',act(SA)+setact(v3,'false',10),code,'catalog_label_confirmation_failed')
  run("DROP TRIGGER zz_fault ON public.catalog_family_labels;DROP FUNCTION public.zz_fault();")
  check(f'{tag} pós-condição rollback integral',f"(SELECT updated_at::text='{v3}' AND rotulo='fungicida' AND ativo AND rotulo_exibicao='Fungicida X' FROM public.catalog_family_labels) AND {audits()}={n}")
  # negações
  for u,nm in [(TA,'tenant A admin'),(TB,'tenant B admin')]:
    deny(f'{tag} {nm} negado 42501',act(u)+upd(v3,'Invasor',11),'42501','catalog_metadata_forbidden')
    deny(f'{tag} {nm} active negado 42501',act(u)+setact(v3,'false',12),'42501','catalog_metadata_forbidden')
  deny(f'{tag} anon sem EXECUTE',"SET ROLE anon;"+upd(v3,'Anon',13),'42501','permission denied')
  deny(f'{tag} anon active sem EXECUTE',"SET ROLE anon;"+setact(v3,'false',14),'42501','permission denied')
  check(f'{tag} negações sem escrita',f"(SELECT updated_at::text='{v3}' FROM public.catalog_family_labels) AND {audits()}={n}")
try:
  subprocess.run(pre+['initdb','-D',str(tmp/'d'),'-A','trust','-U','postgres'],check=True,capture_output=True)
  subprocess.run(pre+['pg_ctl','-D',str(tmp/'d'),'-l',str(tmp/'log'),'-o',f'-k {tmp} -h "" -p 55541','start','-w'],check=True,capture_output=True)
  run(SETUP)
  for s in ['platform_private.catalog_metadata_require_actor()','platform_private.catalog_entity_audit(uuid,text,text,uuid,jsonb,jsonb,jsonb,jsonb)','platform_private.catalog_entity_replay(uuid,text,jsonb,text,uuid)']:
    run(F[s]['definition']+';');check('helper LIVE exato '+s.split('(')[0],f"md5(pg_get_functiondef('{s}'::regprocedure))='{F[s]['md5']}'")
  run("CREATE FUNCTION platform_private.catalog_family_labels_touch() RETURNS trigger LANGUAGE plpgsql SET search_path TO '' AS $function$\nBEGIN\n  NEW.updated_at := pg_catalog.now();\n  RETURN NEW;\nEND $function$;CREATE TRIGGER catalog_family_labels_touch BEFORE UPDATE ON public.catalog_family_labels FOR EACH ROW EXECUTE FUNCTION platform_private.catalog_family_labels_touch();")
  run(f"INSERT INTO public.test_roles VALUES('{SA}','superadmin'),('{TA}','admin'),('{TB}','admin');")
  for c in (False,True):
    install(UPD,c);install(ACT,c);suite(c)
  # rollback condicionado: reinstala baseline exata e verifica volta aos hashes LIVE
  install(UPD,False);install(ACT,False);R.append('rollback para baseline LIVE exata reinstalável')
finally:
  subprocess.run(pre+['pg_ctl','-D',str(tmp/'d'),'stop','-m','immediate'],capture_output=True)
(H/'results-local.json').write_text(json.dumps({'kind':'PostgreSQL descartável, Auth sintética, schema reduzido — NÃO homologação real','pg':subprocess.run(['postgres','--version'],capture_output=True,text=True).stdout.strip(),'passed':len(R),'checks':R},indent=2,ensure_ascii=False)+'\n')
print(len(R),'checks OK')
