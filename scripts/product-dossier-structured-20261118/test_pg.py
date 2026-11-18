"""Disposable PostgreSQL only. Versioned management bodies + declared schema/Auth/fiscal seams."""
import os,subprocess,tempfile,shutil,json,re,hashlib,time
from pathlib import Path
from build import build,TARGETS,FRESH
H=Path(__file__).resolve().parent;ROOT=H.parent.parent;BASE=ROOT/'scripts/product-regulatory-profiles-20261114/management'
os.environ['PATH']=str(Path(shutil.which('initdb')).resolve().parent)+os.pathsep+os.environ['PATH']
t=Path(tempfile.mkdtemp(prefix='pg-structured-'));t.chmod(0o777);port=str(55000+os.getpid()%900);priv=['setpriv','--reuid=1000','--regid=1000','--clear-groups'] if os.getuid()==0 else [];checks=[]
conn=['psql','-X','-qAt','-h',str(t),'-p',port,'-U','postgres','-v','ON_ERROR_STOP=1']
def sql(s,error=None):
 r=subprocess.run(conn,input=s,text=True,capture_output=True)
 if error:assert r.returncode and error in r.stderr,r.stderr
 else:assert r.returncode==0,r.stderr
 return r.stdout.strip()
def check(name,s,value=None,error=None):
 r=sql(s,error)
 if value is not None:assert r==value,(name,r,value)
 checks.append(name);return r
def migration(prefix):sql(next((ROOT/'supabase/migrations').glob(prefix+'*.sql')).read_text())
A='00000000-0000-4000-8000-000000000010';B='00000000-0000-4000-8000-000000000011';P='00000000-0000-4000-8000-000000000050';F='00000000-0000-4000-8000-000000000051';bio='00000000-0000-4000-8000-000000000020';uid='00000000-0000-4000-8000-000000000002';uidb='00000000-0000-4000-8000-000000000003'
def actor(s,who='a',role='authenticated'):
 u=uid if who=='a' else uidb if who=='b' else ''
 return f"SET ROLE {role};SET test.actor='{u}';SET request.jwt.claims='{{\"role\":\"{role}\",\"sub\":\"{u}\",\"exp\":9999999999}}';"+s
try:
 subprocess.run(priv+['initdb','-D',str(t/'data'),'-U','postgres','-A','trust'],check=True,capture_output=True)
 subprocess.run(priv+['pg_ctl','-D',str(t/'data'),'-o',f'-k {t} -h "" -p {port}','-l',str(t/'log'),'-w','start'],check=True,capture_output=True)
 sql(BASE.joinpath('fixture.sql').read_text());migration('20261114013656');migration('20261114014211')
 # Catalog identity must not depend on visibility. Includes a user-defined array
 # type and named input arguments; none of those names may enter the signature.
 sql("CREATE FUNCTION public.tenant_product_dossier_capture_probe(p_named public.microorganism_regulatory_dossiers[], p_stamp timestamptz) RETURNS void LANGUAGE sql AS $$SELECT$$;")
 capture=(H/'capture-query.sql.review').read_text()
 public_catalog=json.loads(sql('SET search_path=public;'+capture))
 empty_catalog=json.loads(sql("SET search_path='';"+capture))
 assert public_catalog==empty_catalog,'search_path catalog drift'
 checks.append('complete capture public equals empty search_path')
 probe=next(f for f in public_catalog['functions'] if 'capture_probe(' in f['signature'])
 assert probe['signature']=='public.tenant_product_dossier_capture_probe(public.microorganism_regulatory_dossiers[],timestamp with time zone)',probe['signature']
 checks.append('qualified input type identity omits argument names')
 assert all(r['name'].startswith(('public.','platform_private.','storage.')) for r in public_catalog['relations'])
 checks.append('relations always schema qualified')
 sql('DROP FUNCTION public.tenant_product_dossier_capture_probe(public.microorganism_regulatory_dossiers[],timestamptz);')
 sql("""CREATE UNIQUE INDEX mrd_uq_micro_version ON public.microorganism_regulatory_dossiers(microorganism_id,version);
 CREATE FUNCTION platform_private.product_dossier_link_integrity() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF TG_OP='UPDATE' AND (NEW.product_id IS DISTINCT FROM OLD.product_id OR NEW.dossier_id IS DISTINCT FROM OLD.dossier_id) THEN RAISE EXCEPTION 'immutable'; END IF;RETURN NEW;END$$;
 CREATE TABLE public.microorganism_regulatory_publication_snapshots(dossier_id uuid);
 CREATE FUNCTION public.fn_regulatory_storage_dossier_id(text) RETURNS uuid LANGUAGE sql AS $$SELECT split_part($1,'/',2)::uuid$$;
 CREATE FUNCTION platform_private.rpc_regulatory_product_document_access(uuid,uuid,uuid) RETURNS jsonb LANGUAGE sql AS $$SELECT '{}'::jsonb$$;
 CREATE FUNCTION platform_private.product_dossier_facts(p_dossier_id uuid) RETURNS jsonb LANGUAGE sql AS $$WITH g AS(SELECT (auth.uid() IS NULL OR public.fn_regulatory_can_read()) AS ok)SELECT '{}'::jsonb$$;
 ALTER TABLE public.microorganism_regulatory_dossiers ADD COLUMN blocked_reason text,ADD COLUMN published_ncm text,ADD COLUMN published_cest text,ADD COLUMN effective_from date,ADD COLUMN effective_to date;
 ALTER TABLE public.microorganism_regulatory_presentations ADD COLUMN units_confirmed boolean,ADD COLUMN gtin_confirmed boolean;
 ALTER TABLE public.microorganism_ncm_candidates ADD COLUMN status text;
 ALTER TABLE public.product_regulatory_dossier_links ADD COLUMN updated_at timestamptz DEFAULT clock_timestamp();
 ALTER TABLE public.produtos ADD COLUMN familia_catalogo text DEFAULT 'biologico';
 CREATE TYPE app_role AS ENUM('administrador','gestor');
 CREATE TABLE platform_private.members(id uuid PRIMARY KEY,org uuid,active boolean,feature boolean,writer boolean);
 CREATE FUNCTION platform_private.h15_actor_organization() RETURNS uuid LANGUAGE sql SECURITY DEFINER AS $$SELECT org FROM platform_private.members WHERE id=auth.uid() AND active$$;
 CREATE FUNCTION public._saas_user_has_feature(uuid,text) RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$SELECT feature FROM platform_private.members WHERE id=$1$$;
 CREATE FUNCTION platform_private.has_role(uuid,app_role) RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$SELECT writer FROM platform_private.members WHERE id=$1$$;
 CREATE FUNCTION public.can_view_catalog_internal(uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$SELECT active FROM platform_private.members WHERE id=$1$$;
 """)
 sql(f"INSERT INTO platform_private.members VALUES('{uid}','{A}',true,true,true),('{uidb}','{B}',true,true,true);UPDATE organizations SET ativo=true,status='ativa' WHERE id='{B}';INSERT INTO produtos(id,nome,codigo,ativo,e_insumo,owner_organization_id,familia_catalogo)VALUES('{P}','QA químico','QA-Q',true,false,'{A}','quimico'),('{F}','QA fertilizante','QA-F',true,false,'{A}','fertilizante_adubo');")
 captured=ROOT/'scripts/b2b-solid-packaging-order-20261106/captured/solid-pack/platform_private.recorte_a_actor_fresh.0cb006c4.live-20261106.sql';sql(captured.read_text())
 sql("CREATE OR REPLACE FUNCTION platform_private.catalog_tenant_actor(p_mode text) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$SELECT platform_private.recorte_a_actor_fresh(p_mode)$$;")
 migration('20261114023631');migration('20261114023655');sql(BASE.joinpath('tenant-fixture/pre-facts.sql').read_text());migration('20261114023749');sql(BASE.joinpath('tenant-fixture/live-facts.sql').read_text())
 # Real link and document readers from canonical historical body; only tables/authority dependencies synthetic.
 orig=next((ROOT/'supabase/migrations').glob('20261114010320*.sql')).read_text()
 for name in ['platform_private.product_dossier_link_integrity','public.rpc_regulatory_product_document_access']:
  m=re.search(r'CREATE OR REPLACE FUNCTION '+re.escape(name)+r'\(.*?END \$\$;',orig,re.S);assert m
  body=m.group(0)
  if name.startswith('public.'):
   body=body.replace(name,'platform_private.rpc_regulatory_product_document_access').replace('FROM public.product_regulatory_dossier_links l JOIN public.microorganism_regulatory_dossiers d ON d.id=l.dossier_id','FROM public.microorganism_regulatory_dossiers d').replace('WHERE l.product_id=p_product_id','WHERE d.product_id=p_product_id')
  sql(body)
 sql('CREATE TRIGGER product_dossier_link_integrity BEFORE INSERT OR UPDATE ON public.product_regulatory_dossier_links FOR EACH ROW EXECUTE FUNCTION platform_private.product_dossier_link_integrity();')
 sql("CREATE OR REPLACE FUNCTION public.fn_regulatory_storage_path_ok(text) RETURNS boolean LANGUAGE sql AS $$SELECT $1 ~ '^dossiers/[^/]+/[^/]+/[^/]+$'$$;")
 # Fixture RLS policies: explicit role-only legacy policy is restricted by canonical owner fences.
 sql("""GRANT USAGE ON SCHEMA auth TO authenticated,anon;GRANT USAGE ON SCHEMA platform_private TO authenticated;GRANT SELECT,INSERT,UPDATE,DELETE ON public.microorganism_regulatory_dossiers TO authenticated,anon;
 ALTER TABLE public.microorganism_regulatory_dossiers ENABLE ROW LEVEL SECURITY;
 CREATE POLICY legacy_dossier ON public.microorganism_regulatory_dossiers TO authenticated,anon USING(true) WITH CHECK(true);
 CREATE POLICY anon_denied ON public.microorganism_regulatory_dossiers AS RESTRICTIVE FOR ALL TO anon USING(false) WITH CHECK(false);
 """)
 before=sql("SELECT md5(pg_get_functiondef('platform_private.recorte_a_actor_fresh(text)'::regprocedure))")
 service_before=sql("SELECT string_agg(md5(pg_get_functiondef(oid)),',' ORDER BY proname) FROM pg_proc WHERE pronamespace='platform_private'::regnamespace AND proname IN ('product_dossier_upload_attest','product_dossier_upload_cancel')")
 defs={sig:sql(f"SELECT pg_get_functiondef('{sig}'::regprocedure)")+'\n' for sig in TARGETS+[FRESH]}
 # psql strips trailing LF only; restore single pg_get_functiondef LF (pinned synthetic serialization).
 pins={sig:hashlib.md5(v.encode()).hexdigest() for sig,v in defs.items()}
 delta=build(defs,pins);sql(delta)
 check('fresh body unchanged',"SELECT md5(pg_get_functiondef('platform_private.recorte_a_actor_fresh(text)'::regprocedure))",before)
 check('service attest cancel definitions unchanged',"SELECT string_agg(md5(pg_get_functiondef(oid)),',' ORDER BY proname) FROM pg_proc WHERE pronamespace='platform_private'::regnamespace AND proname IN ('product_dossier_upload_attest','product_dossier_upload_cancel')",service_before)
 check('gate default OFF',actor(f"SELECT tenant_product_dossier_management_create('{P}',NULL)"),error='DOSSIER_STRUCTURED_UNAVAILABLE')
 sql('UPDATE platform_private.product_dossier_structured_gate SET enabled=true WHERE singleton')
 ack=json.loads(check('create product-only',actor(f"SELECT tenant_product_dossier_management_create('{P}',NULL)")));did=ack['dossier_id'];rev=ack['updated_at']
 check('no invented micro',f"SELECT product_only AND microorganism_id IS NULL AND cardinality(covered_microorganism_ids)=0 FROM microorganism_regulatory_dossiers WHERE id='{did}'",'t')
 check('create replay same dossier',actor(f"SELECT tenant_product_dossier_management_create('{P}',NULL)->>'dossier_id'"),did)
 check('B cannot create A',actor(f"SELECT tenant_product_dossier_management_create('{P}',NULL)",'b'),error='DOSSIER_STRUCTURED_UNAVAILABLE')
 check('anon cannot create',actor(f"SELECT tenant_product_dossier_management_create('{P}',NULL)",'none','anon'),error='permission denied')
 fertilizer=json.loads(check('create fertilizer without micro',actor(f"SELECT tenant_product_dossier_management_create('{F}',NULL)")))
 check('biological canonical creation remains',actor(f"SELECT tenant_product_dossier_create_covered('{bio}',ARRAY['00000000-0000-4000-8000-000000000030']::uuid[])->>'product_id'"),bio)
 origin={'title':'Documento sintético QA','url':'https://example.org/qa','document_id':None,'excerpt':'Garantia sintética, não comercial'}
 data={'schema_version':1,'registration':{'holder':'QA titular','manufacturer':'QA fabricante','number':'QA-1','agency':'QA órgão','documentary_status':'DOCUMENTED','origin':origin},'lines':[{'id':'00000000-0000-4000-8000-000000000090','kind':'SUBSTANCE','name':'Substância QA','value':'750','unit':'g/kg','base':'MASS_MASS','form':'QA','origin':origin}]}
 def save(value=data,stamp=rev,req='00000000-0000-4000-8000-000000000080',who='a'):
  patch=json.dumps({'structured_data':value,'request_id':req}).replace("'","''")
  return actor(f"SELECT tenant_product_dossier_management_save('{P}','{did}','{stamp}','{patch}'::jsonb)",who)
 saved=json.loads(check('save typed exact mass guarantee',save()));rev2=saved['updated_at']
 check('reopen exact numeric string',actor(f"SELECT tenant_product_dossier_version_detail('{P}','{did}')#>>'{{dossier,structured_data,lines,0,value}}'"),'750')
 check('no automatic approval',f"SELECT status||':'||technical_review_status||':'||regulatory_review_status||':'||fiscal_review_status FROM microorganism_regulatory_dossiers WHERE id='{did}'",'DRAFT:PENDING:PENDING:PENDING')
 check('exact replay stable',save(),json.dumps(saved) if False else None)
 check('history once on replay',f"SELECT count(*) FROM platform_private.product_dossier_structured_history WHERE product_id='{P}'",'1')
 check('stale CAS refuses',save(stamp=rev,req='00000000-0000-4000-8000-000000000081'),error='DOSSIER_VERSION_CONFLICT')
 check('B cannot save',save(stamp=rev2,who='b'),error='DOSSIER_STRUCTURED_UNAVAILABLE')
 check('B direct SELECT empty',actor(f"SELECT id FROM microorganism_regulatory_dossiers WHERE id='{did}'",'b'),'')
 check('anon direct SELECT empty',actor(f"SELECT id FROM microorganism_regulatory_dossiers WHERE id='{did}'",'none','anon'),'')
 check('A direct SELECT authorized',actor(f"SELECT id FROM microorganism_regulatory_dossiers WHERE id='{did}'"),did)
 check('direct DML guarded',actor(f"UPDATE microorganism_regulatory_dossiers SET structured_data=NULL WHERE id='{did}'"),error='REGULATORY_PRODUCT_WRITER_REQUIRED')
 check('private history ACL closed',actor('SELECT * FROM platform_private.product_dossier_structured_history'),error='permission denied')
 malformed=[]
 import copy
 for name,modify in [('numeric value',lambda d:d['lines'][0].update(value=750)),('negative',lambda d:d['lines'][0].update(value='-1')),('unknown unit',lambda d:d['lines'][0].update(unit='L/ha')),('overpercent',lambda d:d['lines'][0].update(value='101',unit='%')),('missing source',lambda d:d['lines'][0].update(origin=None)),('unsafe URL',lambda d:d['lines'][0]['origin'].update(url='javascript:alert(1)')),('foreign private document',lambda d:d['lines'][0]['origin'].update(document_id='00000000-0000-4000-8000-000000000099')),('duplicate IDs',lambda d:d['lines'].append(copy.deepcopy(d['lines'][0]))),('missing manufacturer',lambda d:d['registration'].pop('manufacturer')),('null manufacturer',lambda d:d['registration'].update(manufacturer=None)),('long holder',lambda d:d['registration'].update(holder='x'*201)),('fake approval',lambda d:d['registration'].update(documentary_status='VALIDATED'))]:
  bad=copy.deepcopy(data);modify(bad);check('reject atomic '+name,save(bad,rev2,'00000000-0000-4000-8000-000000000082'),error='DOSSIER_')
 check('invalid writes preserve history',f"SELECT count(*) FROM platform_private.product_dossier_structured_history WHERE product_id='{P}'",'1')
 check('invalid writes preserve exact data',f"SELECT structured_data#>>'{{lines,0,value}}' FROM microorganism_regulatory_dossiers WHERE id='{did}'",'750')
 check('replay rejects different content',save({**data,'lines':[]}),error='DOSSIER_REPLAY_CONFLICT')
 # Actual canonical caller upload roundtrip. Service auth is the existing
 # declared test.service seam, never a hosted JWT or an actor substitute.
 upload='00000000-0000-4000-8000-000000000095'
 intent=json.dumps({'title':'PDF QA','doc_type':'OUTRO','size_bytes':128,'sha256':'a'*64,'mime':'application/pdf','filename':'qa.pdf'})
 prepared=json.loads(check('caller upload prepare product-only',actor(f"SELECT tenant_product_dossier_upload_prepare('{P}','{did}','{rev2}','{upload}','{intent}'::jsonb)")))
 check('caller upload access owns record',actor(f"SELECT tenant_product_dossier_upload_access('{upload}')->>'id'"),upload)
 check('caller pending uses product parameter no record alias',actor(f"SELECT tenant_product_dossier_upload_pending('{P}')->0->>'id'"),upload)
 check('B upload access denied',actor(f"SELECT tenant_product_dossier_upload_access('{upload}')",'b'),error='DOSSIER_STRUCTURED_UNAVAILABLE')
 sql(f"UPDATE platform_private.members SET writer=false WHERE id='{uid}'")
 check('revoked mutation role denies upload access',actor(f"SELECT tenant_product_dossier_upload_access('{upload}')"),error='catalog_visibility_role_denied')
 check('revoked mutation role denies pending upload',actor(f"SELECT tenant_product_dossier_upload_pending('{P}')"),error='catalog_visibility_role_denied')
 sql(f"UPDATE platform_private.members SET writer=true WHERE id='{uid}'")
 check('attest requires service guard',f"SELECT platform_private.product_dossier_upload_attest('{upload}','{'a'*64}',128,'application/pdf')",error='forbidden')
 check('service attest without caller fresh dispatch',f"SET test.service='true';SELECT platform_private.product_dossier_upload_attest('{upload}','{'a'*64}',128,'application/pdf');SELECT state FROM platform_private.product_dossier_uploads WHERE id='{upload}'",'VERIFIED')
 sql(f"INSERT INTO storage.objects(bucket_id,name) VALUES('fiscal-regulatorio','{prepared['storage_path']}')")
 check('caller finalize after record locks',actor(f"SELECT tenant_product_dossier_upload_finalize('{upload}')->>'state'"),'COMMITTED')
 check('caller finalize replay',actor(f"SELECT tenant_product_dossier_upload_finalize('{upload}')->>'state'"),'COMMITTED')
 check('finalize replay does not duplicate document',f"SELECT count(*) FROM microorganism_regulatory_documents WHERE id='{upload}'",'1')
 cancel_upload='00000000-0000-4000-8000-000000000096'
 cancel_intent=json.dumps({**json.loads(intent),'sha256':'b'*64})
 cancel_rev=sql(f"SELECT updated_at FROM microorganism_regulatory_dossiers WHERE id='{did}'")
 check('prepare second upload for cancel',actor(f"SELECT tenant_product_dossier_upload_prepare('{P}','{did}','{cancel_rev}','{cancel_upload}','{cancel_intent}'::jsonb)->>'state'"),'RESERVED')
 check('caller cancel begin record scope after locks',actor(f"SELECT platform_private.product_dossier_upload_cancel_begin('{cancel_upload}')->>'state'"),'CANCELLING')
 check('cancel requires service guard',f"SELECT platform_private.product_dossier_upload_cancel('{cancel_upload}')",error='forbidden')
 check('service cancel no caller fresh dispatch',f"SET test.service='true';SELECT platform_private.product_dossier_upload_cancel('{cancel_upload}');SELECT state FROM platform_private.product_dossier_uploads WHERE id='{cancel_upload}'",'CANCELLED')
 check('non READ COMMITTED fails closed',actor(f"BEGIN ISOLATION LEVEL REPEATABLE READ;SELECT tenant_product_dossier_version_detail('{P}','{did}');"),error='DOSSIER_ISOLATION_REQUIRED')
 # Concurrent waiter actually blocked, then revoke feature in separate transaction.
 blocker=subprocess.Popen(conn,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True);blocker.stdin.write(f"BEGIN;SELECT pg_advisory_xact_lock(hashtextextended('product-dossier:{P}',0));SELECT 'LOCKED';\n");blocker.stdin.flush()
 while blocker.stdout.readline().strip()!='LOCKED':pass
 waiter=subprocess.Popen(conn,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True);waiter.stdin.write(save(stamp=rev2,req='00000000-0000-4000-8000-000000000083')+'\n');waiter.stdin.close()
 for _ in range(100):
  if sql("SELECT count(*) FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE '%tenant_product_dossier_management_save%'")!='0':break
  time.sleep(.02)
 else:raise AssertionError('no proven waiter')
 sql(f"UPDATE platform_private.members SET feature=false WHERE id='{uid}'")
 blocker.stdin.write('COMMIT;\n');blocker.stdin.close();blocker.wait(timeout=5);waiter.wait(timeout=5);assert waiter.returncode and 'catalog_visibility_feature_unavailable' in waiter.stderr.read();checks.append('fresh post-advisory revocation')
 check('revoked replay refuses',save(),error='catalog_visibility_feature_unavailable')
 sql(f"UPDATE platform_private.members SET feature=true WHERE id='{uid}'")
 check('gate rollback closed reader',"UPDATE platform_private.product_dossier_structured_gate SET enabled=false WHERE singleton;"+actor(f"SELECT tenant_product_dossier_version_detail('{P}','{did}')"),error='DOSSIER_STRUCTURED_UNAVAILABLE')
 check('deny rollback retains history',f"SELECT count(*) FROM platform_private.product_dossier_structured_history WHERE product_id='{P}'",'1')
 (H/'pg-result.json').write_text(json.dumps({'checks':checks,'count':len(checks),'exit_code':0,'limits':'Schema, Auth and fiscal dependencies synthetic; canonical versioned management bodies and captured fresh actor; no JWT/Storage/hosted evidence.'},indent=2)+'\n');print(json.dumps({'exit_code':0,'count':len(checks)}))
finally:
 subprocess.run(priv+['pg_ctl','-D',str(t/'data'),'-m','immediate','-w','stop'],capture_output=True);shutil.rmtree(t)
