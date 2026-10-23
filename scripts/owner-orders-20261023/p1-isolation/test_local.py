"""P1 PostgreSQL descartável: Auth sintética/dependências reduzidas; não JWT hosted."""
from pathlib import Path
import json, subprocess, tempfile, os, shutil, concurrent.futures
H=Path(__file__).resolve().parent; d=json.loads((H/'baseline.json').read_text())
tmp=Path(tempfile.mkdtemp(prefix='c2p1-',dir='/tmp'));tmp.chmod(0o777)
prefix=['setpriv','--reuid=1000','--regid=1000','--clear-groups'] if os.getuid()==0 else []
base=['psql','-X','-h',str(tmp),'-p','55539','-U','postgres','-qAt','-v','ON_ERROR_STOP=1']
n=0
def run(s,err=None):
 r=subprocess.run(base,input=s,text=True,capture_output=True)
 if err:
  assert r.returncode and err in r.stderr,(err,r.stderr);return
 if r.returncode:raise AssertionError(r.stderr)
 return r.stdout.strip()
def test(name,s,value=None,err=None):
 global n
 out=run(s,err)
 if value is not None:assert out==str(value),(name,out,value)
 n+=1;print('PASS',name)
A='aaaaaaaa-0000-0000-0000-000000000001';B='bbbbbbbb-0000-0000-0000-000000000001';OA='aaaaaaaa-1111-0000-0000-000000000001';OB='bbbbbbbb-1111-0000-0000-000000000001';P='aaaaaaaa-2222-0000-0000-000000000001';PB='bbbbbbbb-2222-0000-0000-000000000001';C='aaaaaaaa-3333-0000-0000-000000000001';PLAN='aaaaaaaa-4444-0000-0000-000000000001';ASN='48dcac7d-d4a0-4058-bdf4-5461fee89f45'
def actor(uid,s,role='authenticated'):return f"SET request.jwt.claim.sub='{uid}';SET ROLE {role};\n"+s
fields=dict(billing_trigger='na_entrega',payment_terms_days=7,default_payment_method='AUDIT-AR-20260922 - Sem transferencia',credit_limit=None,block_if_overdue=False,auto_generate_receivable=True,active=True,credit_limit_action='block',overdue_tolerance_days=0,credit_alert_threshold_1=80,credit_alert_threshold_2=90)
def update(uid=A,expected=None,values=None,partner=P):
 e='NULL' if expected is None else "'"+json.dumps(expected).replace("'","''")+"'::jsonb"
 v="'"+json.dumps(values or fields).replace("'","''")+"'::jsonb"
 return actor(uid,f"SELECT to_jsonb(public.rpc_update_partner_financial_settings('{partner}',{e},{v}));")
try:
 subprocess.run(prefix+['initdb','-D',str(tmp/'data'),'-A','trust','-U','postgres'],check=True,capture_output=True)
 subprocess.run(prefix+['pg_ctl','-D',str(tmp/'data'),'-l',str(tmp/'log'),'-o',f'-k {tmp} -h "" -p 55539','start','-w'],check=True,capture_output=True)
 run('''CREATE ROLE authenticated;CREATE ROLE anon;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE SCHEMA platform_private;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT jsonb_build_object('iat',extract(epoch from now())::bigint) $$;
 CREATE TYPE app_role AS ENUM('administrador','financeiro','gestor_comercial','gestor','administrativo','parceiro_b2b','parceiro_b2b_tecnico','cliente_produtor','superadmin');
 CREATE TABLE user_roles(user_id uuid,role app_role);CREATE TABLE organizations(id uuid PRIMARY KEY,ativo boolean,status text,partner_account_id uuid);
 CREATE TABLE profiles(user_id uuid PRIMARY KEY,organization_id uuid,ativo boolean,senha_provisoria boolean);
 CREATE TABLE platform_org_admin_invites(user_id uuid,access_operation_status text,access_valid_after timestamptz);
 CREATE TABLE partner_accounts(id uuid PRIMARY KEY,commercial_owner_organization_id uuid,ativo boolean,deleted_at timestamptz);
 CREATE TABLE clientes(id uuid PRIMARY KEY,organization_id uuid,status_cliente text);
 CREATE TABLE commercial_payment_plans(id uuid PRIMARY KEY);
 CREATE TABLE commercial_condition_audit_log(entity text,entity_id uuid,action text,actor_id uuid,before_data jsonb,after_data jsonb,motivo text);
 CREATE TABLE financial_governance_audit_log(usuario_id uuid,partner_id uuid,acao text,dados_anteriores jsonb,dados_novos jsonb);
 CREATE TABLE platform_private.authz_tickets(txid bigint,scope text,target uuid,PRIMARY KEY(txid,scope,target));
 ALTER TABLE platform_private.authz_tickets ENABLE ROW LEVEL SECURITY;REVOKE ALL ON platform_private.authz_tickets FROM PUBLIC,anon,authenticated,service_role;
 CREATE FUNCTION platform_private.has_role(u uuid,r app_role) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=u AND role=r) $$;
 CREATE FUNCTION platform_private.issue_ticket(_scope text,_target uuid) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ INSERT INTO platform_private.authz_tickets(txid,scope,target) VALUES(txid_current(),_scope,_target) ON CONFLICT DO NOTHING $$;
 CREATE FUNCTION platform_private.has_ticket(_scope text,_target uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT EXISTS(SELECT 1 FROM platform_private.authz_tickets WHERE txid=txid_current() AND scope=_scope AND target=_target) $$;
 REVOKE ALL ON FUNCTION platform_private.issue_ticket(text,uuid),platform_private.has_ticket(text,uuid) FROM PUBLIC,anon,authenticated,service_role;
 GRANT USAGE ON SCHEMA auth,platform_private TO authenticated,anon;
 GRANT EXECUTE ON FUNCTION platform_private.has_role(uuid,app_role) TO authenticated;
 ''')
 for table in ('commercial_payment_plan_assignments','partner_financial_settings','payment_methods'):
  cols=[]
  for c in d['columns']:
   if c['table_name']!=table:continue
   typ=c['data_type'];typ={'timestamp with time zone':'timestamptz','integer':'integer'}.get(typ,typ)
   cols.append('"'+c['column_name']+'" '+typ+(' NOT NULL' if c['is_nullable']=='NO' else '')+(' DEFAULT '+c['column_default'] if c['column_default'] else ''))
  run(f'CREATE TABLE public.{table}('+','.join(cols)+');GRANT ALL ON public.'+table+' TO authenticated,anon,service_role;')
 for c in d['constraints']:run(f"ALTER TABLE public.{c['table']} ADD CONSTRAINT {c['name']} {c['definition']};")
 run((H/'baseline.sql').read_text())
 for f in d['functions']:
  run('ALTER FUNCTION '+f['signature']+' OWNER TO postgres; REVOKE ALL ON FUNCTION '+f['signature']+' FROM PUBLIC,anon,authenticated,service_role;'+('GRANT EXECUTE ON FUNCTION '+f['signature']+' TO authenticated,service_role;' if 'authenticated=' in (f['acl'] or '') else ''))
 for t in d['triggers']:run(t['definition']+';')
 for table in ('partner_financial_settings','commercial_payment_plan_assignments'):run('ALTER TABLE '+table+' ENABLE ROW LEVEL SECURITY;')
 for p in d['policies']:
  run(f"CREATE POLICY {p['policyname']} ON public.{p['tablename']} AS {p['permissive']} FOR {p['cmd']} TO authenticated"+(' USING ('+p['qual']+')' if p['qual'] else '')+(' WITH CHECK ('+p['with_check']+')' if p['with_check'] else '')+';')
 run(f"INSERT INTO organizations VALUES('{OA}',true,'ativa',NULL),('{OB}',true,'ativa',NULL);INSERT INTO profiles VALUES('{A}','{OA}',true,false),('{B}','{OB}',true,false);INSERT INTO user_roles VALUES('{A}','administrador'),('{B}','administrador');INSERT INTO partner_accounts VALUES('{P}','{OA}',true,NULL),('{PB}','{OB}',true,NULL);INSERT INTO clientes VALUES('{C}','{OA}','ativo');INSERT INTO commercial_payment_plans VALUES('{PLAN}');INSERT INTO commercial_payment_plan_assignments(id,plan_id,buyer_scope,partner_id,status) VALUES('{ASN}','{PLAN}','partner','{P}','published');INSERT INTO payment_methods(name) VALUES('AUDIT-AR-20260922 - Sem transferencia');")
 test('reproduz leak direto B antes',actor(B,f"SELECT count(*) FROM commercial_payment_plan_assignments WHERE id='{ASN}';"),1)
 test('reproduz leak RPC B antes',actor(B,f"SELECT count(*) FROM rpc_cc_list_assignments(NULL) WHERE id='{ASN}';"),1)
 # core is separate from hosted catalog preflight: it does not pretend reduced schema passes hosted gate.
 run((H/'core.sql.review').read_text())
 test('B leitura direta A invisível',actor(B,f"SELECT count(*) FROM commercial_payment_plan_assignments WHERE id='{ASN}';"),0)
 test('B RPC A invisível',actor(B,f"SELECT count(*) FROM rpc_cc_list_assignments(NULL) WHERE id='{ASN}';"),0)
 test('A lê assignmentA publicado',actor(A,f"SELECT status FROM rpc_cc_list_assignments(NULL) WHERE id='{ASN}';"),'published')
 for name in ('publish','archive','submit'):
  test('B nega '+name,actor(B,f"SELECT rpc_cc_{name}_assignment('{ASN}','audit');"),err='C2P1_FORBIDDEN')
 up=lambda uid,pid,scope,partner,customer:actor(uid,f"SELECT rpc_cc_upsert_assignment({pid},'{PLAN}','{scope}',{partner},{customer},CURRENT_DATE,NULL,'audit');")
 test('B criar A negado',up(B,'NULL','partner',f"'{P}'",'NULL'),err='C2P1_FORBIDDEN')
 test('B editar A negado',up(B,f"'{ASN}'",'partner',f"'{PB}'",'NULL'),err='C2P1_FORBIDDEN')
 test('default sem tenant comprovado negado',up(A,'NULL','default','NULL','NULL'),err='C2P1_FORBIDDEN')
 aid=run(up(A,'NULL','partner',f"'{P}'",'NULL'));assert aid
 test('A publica seu draft',actor(A,f"SELECT rpc_cc_publish_assignment('{aid}','audit');SELECT status FROM commercial_payment_plan_assignments WHERE id='{aid}';"),'published')
 test('A arquiva seu draft publicado',actor(A,f"SELECT rpc_cc_archive_assignment('{aid}','audit');SELECT status FROM commercial_payment_plan_assignments WHERE id='{aid}';"),'archived')
 test('produtor A criar permitido',up(A,'NULL','producer','NULL',f"'{C}'"))
 test('B produtor A negado',up(B,'NULL','producer','NULL',f"'{C}'"),err='C2P1_FORBIDDEN')
 test('DML direto assignment negado',actor(A,f"UPDATE commercial_payment_plan_assignments SET status='archived' WHERE id='{ASN}';"),err='permission denied')
 test('B settings A negado',update(B),err='C2P1_FORBIDDEN')
 saved=json.loads(run(update()));assert saved['billing_trigger']=='na_entrega';n+=1;print('PASS owner A cria settings sem pedido com método AUDIT')
 test('A leitura settings',actor(A,f"SELECT count(*) FROM partner_financial_settings WHERE partner_id='{P}';"),1)
 test('B leitura settings A invisível',actor(B,f"SELECT count(*) FROM partner_financial_settings WHERE partner_id='{P}';"),0)
 test('ausência velha não sobrescreve',update(),err='settings_conflict')
 test('método pix inexistente negado',update(expected=saved,values={**fields,'default_payment_method':'pix'}),err='C2P1_PAYMENT_METHOD_INVALID')
 test('método nome não canônico negado',update(expected=saved,values={**fields,'default_payment_method':'audit-ar-20260922 - Sem transferencia'}),err='C2P1_PAYMENT_METHOD_INVALID')
 test('valor financeiro negativo negado',update(expected=saved,values={**fields,'credit_limit':-1}),err='C2P1_FINANCIAL_VALUES_INVALID')
 test('CAS integral alterado negado',update(expected={**saved,'payment_terms_days':9}),err='settings_conflict')
 test('DML settings direto negado',actor(A,f"UPDATE partner_financial_settings SET payment_terms_days=99 WHERE partner_id='{P}';"),err='permission denied')
 test('ticket privado negado',actor(A,f"SELECT platform_private.issue_ticket('c2p1_settings_write','{P}');"),err='permission denied')
 # Two independent transactions use identical expected row: one winner, one 40001.
 def attempt(v):
  r=subprocess.run(base,input=update(expected=saved,values={**fields,'payment_terms_days':v}),text=True,capture_output=True);return r
 with concurrent.futures.ThreadPoolExecutor(max_workers=2) as ex:results=list(ex.map(attempt,[11,12]))
 assert sum(r.returncode==0 for r in results)==1 and sum('settings_conflict' in r.stderr for r in results)==1
 n+=1;print('PASS concorrência CAS: exatamente um sucesso e um conflito')
 saved2=json.loads(run(actor(A,f"SELECT to_jsonb(s) FROM partner_financial_settings s WHERE partner_id='{P}';")))
 assert saved2['updated_at']>saved['updated_at'];n+=1;print('PASS timestamp servidor monotônico')
 test('CAS stale sequencial negado',update(expected=saved),err='settings_conflict')
 test('ticket consumido',"SELECT count(*) FROM platform_private.authz_tickets WHERE scope='c2p1_settings_write';",0)
 run("UPDATE payment_methods SET active=false;")
 test('método desativado servidor negado',update(expected=saved2),err='C2P1_PAYMENT_METHOD_INVALID')
 run("UPDATE payment_methods SET active=true;INSERT INTO payment_methods(name) VALUES('AUDIT-AR-20260922 - Sem transferencia');")
 test('método ambíguo negado',update(expected=saved2),err='C2P1_PAYMENT_METHOD_INVALID')
 run("DELETE FROM payment_methods WHERE id=(SELECT id FROM payment_methods ORDER BY created_at DESC LIMIT 1);")
 run(f"INSERT INTO user_roles VALUES('{A}','parceiro_b2b_tecnico');")
 test('externo cumulativo interno negado',update(expected=saved2),err='C2P1_FORBIDDEN')
 test('externo não lê assignments',actor(A,"SELECT count(*) FROM rpc_cc_list_assignments(NULL);"),0)
 run(f"DELETE FROM user_roles WHERE user_id='{A}' AND role='parceiro_b2b_tecnico';UPDATE profiles SET senha_provisoria=true WHERE user_id='{A}';")
 test('h15 senha provisória nega',update(expected=saved2),err='C2P1_FORBIDDEN')
 run(f"UPDATE profiles SET senha_provisoria=false WHERE user_id='{A}';UPDATE organizations SET ativo=false WHERE id='{OA}';")
 test('owner inativo nega',update(expected=saved2),err='C2P1_FORBIDDEN')
 run(f"UPDATE organizations SET ativo=true WHERE id='{OA}';UPDATE partner_accounts SET commercial_owner_organization_id=NULL WHERE id='{P}';UPDATE organizations SET partner_account_id='{P}' WHERE id='{OA}';")
 test('ownorg legado interno preservado',update(expected=saved2))
 run(f"UPDATE profiles SET ativo=false WHERE user_id='{A}';")
 test('perfil inativo nega',update(),err='C2P1_FORBIDDEN')
 run(f"UPDATE profiles SET ativo=true WHERE user_id='{A}';")
 run("SET c2p1.review_project_ref='swzpzcwiasxmjutrmvkm';"+(H/'rollback.sql.review').read_text())
 test('rollback leitura assignment fechada',actor(B,'SELECT count(*) FROM rpc_cc_list_assignments(NULL);'),0)
 test('rollback writer assignment fechado',up(A,'NULL','partner',f"'{P}'",'NULL'),err='C2P1_FORBIDDEN')
 test('rollback settings RPC fechado',update(),err='permission denied')
 test('histórico assignment original preservado',f"SELECT status FROM commercial_payment_plan_assignments WHERE id='{ASN}';",'published')
 test('anon não lê assignments',actor(B,'SELECT count(*) FROM commercial_payment_plan_assignments;',role='anon'),0)
 test('ref ausente preflight nega',(H/'preflight.sql').read_text(),err='C2P1_REF_NOT_VERIFIED')
 print(f'{n}/{n} PostgreSQL sintético PASS; sem JWT/PostgREST hosted.')
finally:
 subprocess.run(prefix+['pg_ctl','-D',str(tmp/'data'),'stop','-m','immediate'],capture_output=True)
 shutil.rmtree(tmp,ignore_errors=True)
