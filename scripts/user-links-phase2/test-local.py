"""Disposable PostgreSQL only: actual candidate bodies; reduced Auth/schema/RLS stubs."""
from pathlib import Path
import subprocess, tempfile, shutil, os, json, uuid, time
ROOT=Path(__file__).resolve().parents[2]
def main():
 tmp=Path(tempfile.mkdtemp(prefix='user-edit-f2-',dir='/tmp'));tmp.chmod(0o777)
 prefix=['setpriv','--reuid=1000','--regid=1000','--clear-groups'] if os.getuid()==0 else []
 base=['psql','-X','-h',str(tmp),'-p','55497','-U','postgres','-v','ON_ERROR_STOP=1','-qAt']
 checks=0
 def run(sql):
  r=subprocess.run(base,input=sql,text=True,capture_output=True)
  if r.returncode: raise AssertionError(r.stderr)
  return r.stdout.strip()
 def check(sql,expected):
  nonlocal checks
  actual=run(sql);assert actual==expected,(sql,actual,expected);checks+=1
 A='00000000-0000-4000-8000-000000000001'; B='00000000-0000-4000-8000-000000000002'
 T='00000000-0000-4000-8000-000000000003'; P='00000000-0000-4000-8000-000000000004'
 C='00000000-0000-4000-8000-000000000005'; ORG='00000000-0000-4000-8000-000000000011'; OTHER='00000000-0000-4000-8000-000000000012'
 def as_actor(sql,actor=A):return f"BEGIN;SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub='{actor}';{sql};ROLLBACK;"
 try:
  subprocess.run(prefix+['initdb','-D',str(tmp/'data'),'-A','trust','-U','postgres'],check=True,capture_output=True)
  subprocess.run(prefix+['pg_ctl','-D',str(tmp/'data'),'-l',str(tmp/'log'),'-o',f'-k {tmp} -h "" -p 55497','start'],check=True,capture_output=True)
  setup="""
CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;
CREATE SCHEMA auth;CREATE SCHEMA extensions;CREATE EXTENSION pgcrypto SCHEMA extensions;
CREATE SCHEMA platform_private;CREATE SCHEMA cf_user_guards_v1;
GRANT USAGE ON SCHEMA public,auth,platform_private TO authenticated;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE TYPE public.app_role AS ENUM('administrador','financeiro','cliente_produtor','parceiro_b2b','parceiro_b2b_tecnico','superadmin');
CREATE TABLE public.organizations(id uuid PRIMARY KEY,ativo boolean DEFAULT true,status text DEFAULT 'ativa');
CREATE TABLE public.profiles(id uuid DEFAULT gen_random_uuid(),user_id uuid PRIMARY KEY,nome text,telefone text,cargo text,cpf_cnpj text,crea text,especialidade text,email text,ativo boolean DEFAULT true,cliente_id uuid,organization_id uuid,senha_provisoria boolean DEFAULT false,updated_at timestamptz DEFAULT clock_timestamp());
CREATE TABLE public.user_roles(id uuid DEFAULT gen_random_uuid(),user_id uuid,role public.app_role);
CREATE TABLE public.clientes(id uuid PRIMARY KEY,nome text,organization_id uuid,status_cliente text DEFAULT 'ativo');
CREATE TABLE public.partner_accounts(id uuid PRIMARY KEY,razao_social text,commercial_owner_organization_id uuid,ativo boolean DEFAULT true,deleted_at timestamptz,updated_at timestamptz DEFAULT clock_timestamp());
CREATE TABLE public.user_clientes(id uuid DEFAULT gen_random_uuid(),user_id uuid,cliente_id uuid,principal boolean DEFAULT true,is_active boolean DEFAULT true,revoked_at timestamptz,revoked_by uuid,assigned_by uuid,valid_from timestamptz DEFAULT now(),valid_until timestamptz,access_level text DEFAULT 'read');
CREATE TABLE public.partner_users(id uuid DEFAULT gen_random_uuid(),user_id uuid UNIQUE,partner_id uuid,papel text DEFAULT 'gestor',created_at timestamptz DEFAULT now());
CREATE TABLE cf_user_guards_v1.state(singleton boolean PRIMARY KEY,revision bigint DEFAULT 0);INSERT INTO cf_user_guards_v1.state VALUES(true,0);
CREATE FUNCTION public.has_role(u uuid,r public.app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=u AND role=r) $$;
CREATE FUNCTION public.is_platform_superadmin(u uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT public.has_role(u,'superadmin') $$;
CREATE FUNCTION platform_private.platform_actor_access_ready(u uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT EXISTS(SELECT 1 FROM public.profiles WHERE user_id=u AND ativo AND NOT senha_provisoria) $$;
CREATE FUNCTION platform_private.is_tenant_admin_for_user(u uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT public.has_role(auth.uid(),'administrador') AND NOT public.is_platform_superadmin(auth.uid()) AND NOT public.is_platform_superadmin(u) AND EXISTS(SELECT 1 FROM public.profiles a JOIN public.profiles t ON t.organization_id=a.organization_id WHERE a.user_id=auth.uid() AND t.user_id=u) $$;
GRANT SELECT,UPDATE ON public.profiles TO authenticated;
GRANT SELECT,INSERT,DELETE ON public.user_roles TO authenticated;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY; CREATE POLICY scoped ON public.profiles TO authenticated USING(platform_private.is_tenant_admin_for_user(user_id));
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY; CREATE POLICY scoped ON public.user_roles TO authenticated USING(platform_private.is_tenant_admin_for_user(user_id));
CREATE FUNCTION cf_user_guards_v1.acquire_gate() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN UPDATE cf_user_guards_v1.state SET revision=revision+1 WHERE singleton;RETURN NULL;END $$;
CREATE FUNCTION cf_user_guards_v1.advance_stamp() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at:=greatest(clock_timestamp(),OLD.updated_at+interval '1 microsecond'); RETURN NEW;END $$;
CREATE TRIGGER a00 BEFORE INSERT OR UPDATE OR DELETE ON public.profiles FOR EACH STATEMENT EXECUTE FUNCTION cf_user_guards_v1.acquire_gate();
CREATE TRIGGER z99 BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION cf_user_guards_v1.advance_stamp();
"""
  setup+=f"INSERT INTO public.organizations(id) VALUES('{ORG}'),('{OTHER}');INSERT INTO public.profiles(user_id,nome,organization_id) VALUES('{A}','Admin A','{ORG}'),('{B}','Admin B','{OTHER}'),('{T}','Producer','{ORG}'),('{P}','Partner','{ORG}');INSERT INTO public.user_roles(user_id,role) VALUES('{A}','administrador'),('{B}','administrador'),('{T}','cliente_produtor'),('{P}','parceiro_b2b');INSERT INTO public.clientes(id,nome,organization_id) VALUES('{C}','Client A','{ORG}'),('{OTHER}','Client B','{OTHER}');INSERT INTO public.user_clientes(user_id,cliente_id) VALUES('{T}','{C}');INSERT INTO public.partner_accounts(id,razao_social,commercial_owner_organization_id) VALUES('{C}','Partner A','{ORG}'),('{OTHER}','Partner B','{OTHER}');INSERT INTO public.partner_users(user_id,partner_id) VALUES('{P}','{C}');"
  setup+=(ROOT/'scripts/user-links-phase2/baseline-admin-edit.sql.review').read_text()
  setup+="REVOKE ALL ON FUNCTION public.admin_edit_user_profile_v1(uuid,timestamptz,jsonb,public.app_role[],uuid[],uuid,uuid) FROM PUBLIC;GRANT EXECUTE ON FUNCTION public.admin_edit_user_profile_v1(uuid,timestamptz,jsonb,public.app_role[],uuid[],uuid,uuid) TO authenticated;"
  run(setup)
  # Baseline uses reduced enum/schema but the function text matches hosted.
  candidate=(ROOT/'scripts/user-links-phase2/candidate.sql.review').read_text()
  run(candidate)
  run((ROOT/'scripts/user-links-phase2/eligible.sql.review').read_text())
  def payload(target=T):
   stamp=run(f"SELECT updated_at FROM public.profiles WHERE user_id='{target}'")
   version=run(f"SELECT platform_private.user_edit_f2_version('{target}')")
   profile=dict(nome='Nome Novo',telefone=None,cargo=None,cpf_cnpj=None,crea=None,especialidade=None,_external_edit=dict(mode='common_preserve_links',expected_version=version,idempotency_key=str(uuid.uuid4()),reason='Correção contato'))
   role='cliente_produtor' if target==T else 'parceiro_b2b'
   return stamp,profile,role
  def call(target=T,delta=None):
   stamp,profile,role=payload(target)
   if delta:profile.update(delta)
   return f"public.admin_edit_user_profile_v1('{target}','{stamp}','{json.dumps(profile)}','{{{role}}}','{{}}',NULL,NULL)"
  def deny(sql,token,actor=A):
   nonlocal checks
   r=subprocess.run(base,input=as_actor(sql,actor),text=True,capture_output=True)
   assert r.returncode!=0 and token in r.stderr,r.stderr;checks+=1
  deny('SELECT '+call(),'user_edit_phase_closed')
  run('UPDATE platform_private.user_edit_f2_gate SET reviewed=true') # isolated DB ONLY
  before=run(f"SELECT md5(row_to_json(p)::text) FROM public.partner_users p WHERE user_id='{P}'")
  check(as_actor('SELECT ('+call(P)+")->>'links_preserved'"),'true')
  check(f"SELECT md5(row_to_json(p)::text) FROM public.partner_users p WHERE user_id='{P}'",before)
  saved_call=call()
  check(as_actor('SELECT ('+saved_call+")->>'success'"),'true') # rollback probe
  # Commit local only to prove real replay and immutable receipt, no hosted writes.
  run(f"BEGIN;SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub='{A}';SELECT {saved_call};COMMIT;")
  check(as_actor('SELECT ('+saved_call+")->>'replayed'"),'true')
  deny('SELECT '+saved_call.replace('Nome Novo','Outro Nome'),'user_edit_idempotency_conflict')
  deny('SELECT '+saved_call,'user_edit_forbidden',B)
  deny('SELECT '+saved_call,'user_edit_forbidden',T)
  deny('SELECT '+call(delta={'organization_id':OTHER}),'user_edit_invalid_fields')
  deny('SELECT '+call(delta={'email':'change@example.invalid'}),'user_edit_invalid_fields')
  stale=call();run(f"UPDATE public.user_clientes SET revoked_at=now(),is_active=false WHERE user_id='{T}'")
  deny('SELECT '+stale,'user_edit_conflict')
  check(as_actor('SELECT ('+call()+")->>'links_preserved'"),'true')
  stale=call();run(f"UPDATE public.clientes SET status_cliente='inativo' WHERE id='{C}'")
  deny('SELECT '+stale,'user_edit_conflict')
  stale=call();run(f"UPDATE public.profiles SET ativo=false WHERE user_id='{T}'")
  deny('SELECT '+stale,'user_edit_conflict')
  run(f"UPDATE public.user_roles SET role='parceiro_b2b_tecnico' WHERE user_id='{P}'")
  deny('SELECT '+call(P),'user_edit_linked_role_unavailable')
  run(f"UPDATE public.user_roles SET role='parceiro_b2b' WHERE user_id='{P}'")
  run(f"UPDATE public.partner_accounts SET commercial_owner_organization_id='{OTHER}' WHERE id='{C}'")
  deny('SELECT '+call(P),'user_edit_forbidden')
  run(f"UPDATE public.partner_accounts SET commercial_owner_organization_id='{ORG}' WHERE id='{C}'")
  # Replay cannot bypass revoked admin, tenant or readiness.
  run(f"UPDATE public.user_roles SET role='financeiro' WHERE user_id='{A}'")
  deny('SELECT '+saved_call,'user_edit_forbidden')
  run(f"UPDATE public.user_roles SET role='administrador' WHERE user_id='{A}';UPDATE public.profiles SET senha_provisoria=true WHERE user_id='{A}'")
  deny('SELECT '+saved_call,'user_edit_forbidden')
  run(f"UPDATE public.profiles SET senha_provisoria=false WHERE user_id='{A}'")
  # Replay refuses a changed result even when caller remains authorized.
  deny('SELECT '+saved_call,'user_edit_conflict')
  stale=call();run(f"UPDATE public.partner_users SET papel='gestor' WHERE user_id='{P}'")
  stale_partner=call(P);run(f"UPDATE public.partner_users SET papel='comercial' WHERE user_id='{P}'")
  deny('SELECT '+stale_partner,'user_edit_conflict')
  # Passage of time alone changes effective client-link state, not its columns.
  run(f"UPDATE public.user_clientes SET is_active=true,revoked_at=NULL,valid_until=clock_timestamp()+interval '500 milliseconds' WHERE user_id='{T}'")
  expiring=call();time.sleep(.6)
  deny('SELECT '+expiring,'user_edit_conflict')
  check(as_actor("SELECT (public.tenant_admin_user_link_eligible('b2b',NULL,0,20))->>'total'"),'1')
  check(as_actor("SELECT jsonb_array_length(public.tenant_admin_user_link_eligible('b2b',NULL,1,1)->'items')"),'0')
  check(as_actor("SELECT jsonb_array_length(public.tenant_admin_user_link_eligible('b2b',NULL,0,1)->'items')"),'1')
  check(as_actor("SELECT (public.tenant_admin_user_link_eligible('producer',NULL,0,20))->>'total'"),'0')
  deny("SELECT public.tenant_admin_user_link_eligible('b2b',NULL,0,101)",'user_edit_invalid_input')
  deny("SELECT public.tenant_admin_user_link_eligible('b2b',NULL,0,20)",'user_edit_forbidden',T)
  check("SELECT has_function_privilege('anon','public.admin_edit_user_profile_v1(uuid,timestamptz,jsonb,public.app_role[],uuid[],uuid,uuid)','EXECUTE')",'f')
  deny('SELECT platform_private.user_edit_f2_version(\''+T+'\')','permission denied')
  r=subprocess.run(base,input='UPDATE platform_private.user_edit_f2_audit SET reason=\'Changed\';',text=True,capture_output=True)
  assert r.returncode and 'user_edit_audit_immutable' in r.stderr;checks+=1
  for sql in ('DELETE FROM platform_private.user_edit_f2_audit','TRUNCATE platform_private.user_edit_f2_audit'):
   r=subprocess.run(base,input=sql,text=True,capture_output=True)
   assert r.returncode and 'user_edit_audit_immutable' in r.stderr;checks+=1
  # Internal branch still accepts seven args and original guards (no envelope).
  stamp=run(f"SELECT updated_at FROM public.profiles WHERE user_id='{A}'")
  check(as_actor(f"SELECT (public.admin_edit_user_profile_v1('{A}','{stamp}','{{\"nome\":\"Admin Novo\"}}','{{administrador}}','{{}}',NULL,NULL))->>'success'"),'true')
  # Candidate NOWAIT shares the canonical statement gate; second session must not wait.
  holder=subprocess.Popen(base,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
  holder.stdin.write("SET application_name='f2_lock_holder';BEGIN;SELECT 1 FROM cf_user_guards_v1.state WHERE singleton FOR UPDATE;SELECT pg_sleep(5);ROLLBACK;\n")
  holder.stdin.close()
  observed=False
  for _ in range(100):
   if run("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE wait_event='PgSleep' AND application_name='f2_lock_holder')")=='t':observed=True;break
   time.sleep(.02)
  assert observed,'lock holder not observed'
  deny('SELECT '+call(),'could not obtain lock')
  holder.wait(timeout=10)
  # Two distinct edits share initial CAS; at most one succeeds after first commit.
  first=call(); second=call().replace('Nome Novo','Outro Contato')
  run(f"BEGIN;SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub='{A}';SELECT {first};COMMIT;")
  deny('SELECT '+second,'user_edit_conflict')
  print(f'PASS {checks} SQL checks; disposable PostgreSQL, reduced Auth/schema; no hosted writes')
 finally:
  subprocess.run(prefix+['pg_ctl','-D',str(tmp/'data'),'-m','immediate','stop'],capture_output=True);shutil.rmtree(tmp)
if __name__=='__main__':main()
