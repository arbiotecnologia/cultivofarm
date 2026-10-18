"""Isolated SQL BEGIN/ROLLBACK, captured guards/policies, reduced base tables.
No hosted DML, Auth users, HTTP, or production connection.
"""
from pathlib import Path
import os,subprocess,tempfile,json
HERE=Path(__file__).resolve().parent
root=Path(tempfile.mkdtemp(prefix='b2b-p1-',dir='/tmp'));root.chmod(0o777)
prefix=['setpriv','--reuid=1000','--regid=1000','--clear-groups'] if os.getuid()==0 else []
base=['psql','-X','-h',str(root),'-p','55496','-U','postgres','-qAt','-v','ON_ERROR_STOP=1']
results=[]
def run(sql,fail=None):
 r=subprocess.run(base,input=sql,text=True,capture_output=True)
 if fail: assert r.returncode!=0 and fail in r.stderr,r.stderr
 else: assert r.returncode==0,r.stderr
 return r.stdout.strip()
def check(label,sql,expected):
 value=run(sql);assert value==expected,(label,value,expected);results.append(label)
def uid(n):return f'00000000-0000-4000-8000-{n:012d}'
A,B,UA,UB,P,T,OA,OB,PA,PB,MA,MB,AA,AB=[uid(i) for i in range(1,15)]
def actor(u,sql):return f"BEGIN;SET LOCAL ROLE authenticated;SET LOCAL fixture.actor='{u}';{sql};ROLLBACK;"
try:
 subprocess.run(prefix+['initdb','-D',str(root/'data'),'-A','trust','-U','postgres'],check=True,capture_output=True)
 subprocess.run(prefix+['pg_ctl','-D',str(root/'data'),'-l',str(root/'log'),'-o',f'-k {root} -h "" -p 55496','start'],check=True,capture_output=True)
 run('''CREATE ROLE authenticated;CREATE ROLE anon;CREATE ROLE service_role BYPASSRLS;
 CREATE SCHEMA auth;CREATE SCHEMA platform_private;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('fixture.actor',true),'')::uuid$$;
 CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT '{"iat":2000000000}'::jsonb$$;
 CREATE TYPE app_role AS ENUM('administrador','gestor_comercial','parceiro_b2b','parceiro_b2b_tecnico','superadmin','financeiro','cliente_produtor');
 CREATE TYPE order_message_author AS ENUM('parceiro','comercial','admin');
 CREATE TABLE profiles(user_id uuid PRIMARY KEY,organization_id uuid,ativo boolean,senha_provisoria boolean,created_at timestamptz DEFAULT now());
 CREATE TABLE organizations(id uuid PRIMARY KEY,partner_account_id uuid,ativo boolean,status text);
 CREATE TABLE user_roles(user_id uuid,role app_role);
 CREATE TABLE partner_users(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),partner_id uuid,user_id uuid UNIQUE,papel text,created_at timestamptz DEFAULT now(),revoked_at timestamptz,revoked_by uuid,revocation_reason text,version int DEFAULT 1);
 CREATE TABLE platform_org_admin_invites(user_id uuid,access_operation_status text,access_valid_after timestamptz);
 CREATE TABLE clientes(id uuid PRIMARY KEY,organization_id uuid);
 CREATE TABLE partner_accounts(id uuid PRIMARY KEY,commercial_owner_organization_id uuid,client_id uuid,ativo boolean,deleted_at timestamptz);
 CREATE TABLE partner_orders(id uuid PRIMARY KEY,partner_id uuid NOT NULL REFERENCES partner_accounts ON DELETE RESTRICT);
 CREATE TABLE partner_order_messages(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),order_id uuid NOT NULL REFERENCES partner_orders ON DELETE CASCADE,autor_id uuid,autor_tipo order_message_author NOT NULL,mensagem text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),status text NOT NULL DEFAULT 'nao_lida',status_updated_at timestamptz,CONSTRAINT partner_order_messages_status_check CHECK(status IN ('nao_lida','lida','respondida','encerrada')));
 CREATE TABLE partner_order_message_attachments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),message_id uuid NOT NULL REFERENCES partner_order_messages ON DELETE CASCADE,file_name text NOT NULL,file_path text NOT NULL,mime_type text,size_bytes bigint,uploaded_by uuid,created_at timestamptz NOT NULL DEFAULT now());
 CREATE INDEX idx_partner_order_messages_order ON partner_order_messages(order_id,created_at);
 CREATE INDEX idx_poma_message ON partner_order_message_attachments(message_id);
 CREATE TABLE commercial_audit_log(id uuid DEFAULT gen_random_uuid(),usuario_id uuid,partner_id uuid,order_id uuid,acao text NOT NULL,dados_anteriores jsonb,dados_novos jsonb,created_at timestamptz DEFAULT now());
 CREATE TABLE organization_subscriptions(id uuid,organization_id uuid,plan_version_id uuid,status text,started_at timestamptz,trial_ends_at timestamptz,cancel_at timestamptz);
 CREATE TABLE saas_plan_versions(id uuid,status text,effective_from timestamptz,effective_to timestamptz);
 CREATE TABLE saas_plan_version_features(plan_version_id uuid,feature_id uuid,enabled boolean,limit_value numeric,config jsonb);
 CREATE TABLE saas_features(id uuid,module_id uuid,key text,active boolean);
 CREATE TABLE saas_modules(id uuid,key text,active boolean);
 CREATE TABLE organization_feature_overrides(id uuid,organization_id uuid,feature_id uuid,mode text,limit_value numeric,started_at timestamptz,starts_at timestamptz,ends_at timestamptz,ended_at timestamptz,created_at timestamptz);
 GRANT USAGE ON SCHEMA public,platform_private,auth TO authenticated,anon,service_role;
 GRANT SELECT,INSERT,UPDATE,DELETE ON partner_orders,partner_accounts,partner_order_messages,partner_order_message_attachments TO authenticated,anon,service_role;
 GRANT SELECT ON clientes TO authenticated;
 ''')
 # Bodies reference each other; disable validation only during fixture definition,
 # not in candidate SQL or at execution. No resolver stub replaces a captured body.
 run("SET check_function_bodies=false;"+(HERE/'live-guards.sql.review').read_text()+(HERE/'live-partner.sql.review').read_text())
 run('''DO $$DECLARE p record;BEGIN FOR p IN SELECT oid::regprocedure sig FROM pg_proc WHERE pronamespace='platform_private'::regnamespace LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon',p.sig);EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated,service_role',p.sig);END LOOP;END$$;
 REVOKE EXECUTE ON FUNCTION platform_private.b2b_actor_scope(uuid) FROM authenticated;
 CREATE TRIGGER trg_audit_messages AFTER INSERT OR DELETE OR UPDATE ON partner_order_messages FOR EACH ROW EXECUTE FUNCTION tg_commercial_audit();
 CREATE TRIGGER trg_audit_attachments AFTER INSERT OR DELETE ON partner_order_message_attachments FOR EACH ROW EXECUTE FUNCTION tg_commercial_audit();
 ALTER TABLE partner_orders ENABLE ROW LEVEL SECURITY;
 ALTER TABLE partner_accounts ENABLE ROW LEVEL SECURITY;
 ALTER TABLE partner_order_messages ENABLE ROW LEVEL SECURITY;
 ALTER TABLE partner_order_message_attachments ENABLE ROW LEVEL SECURITY;
 ''')
 run((HERE/'fixture-policies.sql').read_text())
 # Fixture rows are created and rolled back in EACH case, never committed.
 fixtures=f"""
 INSERT INTO organizations VALUES('{A}','{PA}',true,'ativa'),('{B}','{PB}',true,'ativa');
 INSERT INTO profiles VALUES('{UA}','{A}',true,false,now()),('{UB}','{B}',true,false,now()),('{P}','{A}',true,false,now()),('{T}','{A}',true,false,now());
 INSERT INTO user_roles VALUES('{UA}','administrador'),('{UB}','administrador'),('{P}','parceiro_b2b'),('{T}','parceiro_b2b_tecnico');
 INSERT INTO partner_users(partner_id,user_id,papel) VALUES('{PA}','{P}','gestor'),('{PA}','{T}','tecnico');
 INSERT INTO partner_accounts VALUES('{PA}','{A}',NULL,true,NULL),('{PB}','{B}',NULL,true,NULL);
 INSERT INTO partner_orders VALUES('{OA}','{PA}'),('{OB}','{PB}');
 INSERT INTO partner_order_messages(id,order_id,autor_id,autor_tipo,mensagem) VALUES('{MA}','{OA}','{UA}','admin','fixture A'),('{MB}','{OB}','{UB}','admin','fixture B');
 INSERT INTO partner_order_message_attachments(id,message_id,file_name,file_path,uploaded_by) VALUES('{AA}','{MA}','A','{OA}/{MA}/A','{UA}'),('{AB}','{MB}','B','{OB}/{MB}/B','{UB}');
 """
 def scenario(label,u,sql,expected,mutate=''):
  check(label,f"BEGIN;{fixtures}{mutate}SET LOCAL ROLE authenticated;SET LOCAL fixture.actor='{u}';{sql};ROLLBACK;",expected)
 def denied(label,u,sql,mutate=''):
  run(f"BEGIN;{fixtures}{mutate}SET LOCAL ROLE authenticated;SET LOCAL fixture.actor='{u}';{sql};ROLLBACK;",'row-level security');results.append(label)
 scenario('baseline synthetic admin FSF reads AR children despite hidden parent',UB,f"SELECT (SELECT count(*) FROM partner_orders WHERE id='{OA}')||':'||(SELECT count(*) FROM partner_order_messages WHERE id='{MA}')||':'||(SELECT count(*) FROM partner_order_message_attachments WHERE id='{AA}')",'0:1:1')
 run((HERE/'live-counters.sql.review').read_text())
 run((HERE/'candidate.sql.review').read_text())
 # Candidata v2 inclui ALTER ... SECURITY INVOKER: o residual está fechado.
 # Pré-candidata o mesmo corpo DEFINER vazaria '1' para FSF; pós-candidata a
 # RLS filha + policies RESTRICTIVE contenham a contagem ao próprio tenant.
 scenario('counters INVOKER contido: FSF nao conta mensagens AR',UB,f"SELECT public.rpc_partner_message_counters('{PA}')->>'nao_lidas'",'0')
 scenario('counters INVOKER positivo: admin AR conta proprias',UA,f"SELECT public.rpc_partner_message_counters()->>'nao_lidas'",'1')
 for u,label in [(UA,'AR'),(UB,'FSF')]:
  scenario(f'{label} own positive/cross invisible',u,"SELECT (SELECT count(*) FROM partner_order_messages)||':'||(SELECT count(*) FROM partner_order_message_attachments)",'1:1')
 scenario('FSF cannot read AR explicitly',UB,f"SELECT (SELECT count(*) FROM partner_order_messages WHERE id='{MA}')||':'||(SELECT count(*) FROM partner_order_message_attachments WHERE id='{AA}')",'0:0')
 scenario('gestor own positive unchanged',UA,"SELECT count(*) FROM partner_order_messages",'1',f"UPDATE user_roles SET role='gestor_comercial' WHERE user_id='{UA}';")
 scenario('gestor cross invisible',UB,f"SELECT count(*) FROM partner_order_messages WHERE id='{MA}'",'0',f"UPDATE user_roles SET role='gestor_comercial' WHERE user_id='{UB}';")
 scenario('AR inserts own message',UA,f"WITH i AS(INSERT INTO partner_order_messages(order_id,autor_id,autor_tipo,mensagem) VALUES('{OA}','{UA}','admin','new') RETURNING id) SELECT count(*) FROM i",'1')
 denied('FSF forged message AR order denied',UB,f"INSERT INTO partner_order_messages(order_id,autor_tipo,mensagem) VALUES('{OA}','admin','forged')")
 denied('AR forged message FSF order denied',UA,f"INSERT INTO partner_order_messages(order_id,autor_tipo,mensagem) VALUES('{OB}','admin','forged')")
 scenario('AR inserts own attachment',UA,f"WITH i AS(INSERT INTO partner_order_message_attachments(message_id,file_name,file_path,uploaded_by) VALUES('{MA}','new','path','{UA}') RETURNING id) SELECT count(*) FROM i",'1')
 denied('FSF forged attachment to AR denied',UB,f"INSERT INTO partner_order_message_attachments(message_id,file_name,file_path,uploaded_by) VALUES('{MA}','new','path','{UB}')")
 denied('AR forged uploader denied by unchanged permissive policy',UA,f"INSERT INTO partner_order_message_attachments(message_id,file_name,file_path,uploaded_by) VALUES('{MA}','new','path','{UB}')")
 scenario('AR own attachment DELETE',UA,f"WITH d AS(DELETE FROM partner_order_message_attachments WHERE id='{AA}' RETURNING id) SELECT count(*) FROM d",'1')
 scenario('FSF cross AR attachment DELETE zero',UB,f"WITH d AS(DELETE FROM partner_order_message_attachments WHERE id='{AA}' RETURNING id) SELECT count(*) FROM d",'0')
 scenario('AR message DELETE remains zero no permissive grant',UA,f"WITH d AS(DELETE FROM partner_order_messages WHERE id='{MA}' RETURNING id) SELECT count(*) FROM d",'0')
 scenario('cross message DELETE zero',UB,f"WITH d AS(DELETE FROM partner_order_messages WHERE id='{MA}' RETURNING id) SELECT count(*) FROM d",'0')
 scenario('blocked B2B commercial stays blocked',P,"SELECT (SELECT count(*) FROM partner_order_messages)||':'||(SELECT count(*) FROM partner_order_message_attachments)",'0:0')
 scenario('technical stays blocked',T,"SELECT (SELECT count(*) FROM partner_order_messages)||':'||(SELECT count(*) FROM partner_order_message_attachments)",'0:0')
 scenario('removed partner link remains denied',P,"SELECT count(*) FROM partner_order_messages",'0',f"DELETE FROM partner_users WHERE user_id='{P}';")
 scenario('revoked partner link denied (revoked_at respeitado)',P,"SELECT count(*) FROM partner_order_messages",'0',f"UPDATE partner_users SET revoked_at=now(),revoked_by='{UA}',revocation_reason='TESTE',version=2 WHERE user_id='{P}';")
 # P e comercial bloqueado neste recorte (baseline 0:0); a prova de restore e
 # no helper: revogado => NULL, restaurado => partner original.
 scenario('helper NULL com vinculo revogado',P,"SELECT coalesce(get_user_partner_id()::text,'NULL')",'NULL',f"UPDATE partner_users SET revoked_at=now(),revoked_by='{UA}',revocation_reason='TESTE',version=2 WHERE user_id='{P}';")
 scenario('helper restaurado retorna partner original',P,"SELECT get_user_partner_id()::text",PA,f"UPDATE partner_users SET revoked_at=now(),revoked_by='{UA}',revocation_reason='TESTE',version=2 WHERE user_id='{P}';UPDATE partner_users SET revoked_at=NULL,revoked_by=NULL,revocation_reason=NULL,version=3 WHERE user_id='{P}';")
 scenario('inactive admin denied',UA,"SELECT count(*) FROM partner_order_messages",'0',f"UPDATE profiles SET ativo=false WHERE user_id='{UA}';")
 scenario('provisional admin denied',UA,"SELECT count(*) FROM partner_order_messages",'0',f"UPDATE profiles SET senha_provisoria=true WHERE user_id='{UA}';")
 scenario('revoked readiness fence admin denied',UA,"SELECT count(*) FROM partner_order_messages",'0',f"INSERT INTO platform_org_admin_invites VALUES('{UA}','processing',NULL);")
 scenario('inactive partner denied',UA,"SELECT count(*) FROM partner_order_messages",'0',f"UPDATE partner_accounts SET ativo=false WHERE id='{PA}';")
 scenario('cross attachment uploader does not bypass new tenant fence',UB,f"WITH d AS(DELETE FROM partner_order_message_attachments WHERE id='{AA}' RETURNING id) SELECT count(*) FROM d",'0',f"UPDATE partner_order_message_attachments SET uploaded_by='{UB}' WHERE id='{AA}';")
 scenario('missing commercial owner fails closed',UA,"SELECT count(*) FROM partner_order_messages",'0',f"UPDATE partner_accounts SET commercial_owner_organization_id=NULL WHERE id='{PA}';")
 scenario('UPDATE still unavailable without permissive update policy',UA,f"WITH d AS(UPDATE partner_order_messages SET order_id='{OB}' WHERE id='{MA}' RETURNING id) SELECT count(*) FROM d",'0')
 scenario('attachment UPDATE still unavailable',UA,f"WITH d AS(UPDATE partner_order_message_attachments SET message_id='{MB}' WHERE id='{AA}' RETURNING id) SELECT count(*) FROM d",'0')
 check('anon has no permissive child read despite fixture ACL',f"BEGIN;{fixtures}SET LOCAL ROLE anon;SELECT (SELECT count(*) FROM partner_order_messages)||':'||(SELECT count(*) FROM partner_order_message_attachments);ROLLBACK;",'0:0')
 run(f"BEGIN;{fixtures}INSERT INTO partner_order_messages(order_id,autor_tipo,mensagem) VALUES('{uid(99)}','admin','orphan');ROLLBACK;",'foreign key');results.append('owner orphan message FK denied')
 run(f"BEGIN;{fixtures}INSERT INTO partner_order_message_attachments(message_id,file_name,file_path) VALUES('{uid(99)}','orphan','path');ROLLBACK;",'foreign key');results.append('owner orphan metadata FK denied')
 # privileged cascade proof does NOT represent authenticated DELETE authority
 check('owner cascade removes metadata only in rollback',f"BEGIN;{fixtures}DELETE FROM partner_orders WHERE id='{OA}';SELECT count(*) FROM partner_order_message_attachments WHERE id='{AA}';ROLLBACK;",'0')
 check('all fixture rows rolled back',"SELECT (SELECT count(*) FROM partner_order_messages)||':'||(SELECT count(*) FROM partner_order_message_attachments)||':'||(SELECT count(*) FROM commercial_audit_log)",'0:0:0')
 # Rollback candidate deliberately refuses; contains only its two DROP POLICY names.
 run((HERE/'rollback.sql.review').read_text(),'p1_rollback_requires_reviewed_replacement_containment');results.append('rollback fails closed')
 print(json.dumps({'checks':len(results),'pass':results,'mode':'local captured guards/policies + reduced schema; synthetic AR/FSF identities; no hosted proof'},indent=2))
finally:
 subprocess.run(prefix+['pg_ctl','-D',str(root/'data'),'stop','-m','immediate'],capture_output=True)
