#!/usr/bin/env python3
"""Disposable PG, real captured provisioning/trigger bodies. Synthetic Auth bridge, no network."""
import hashlib, json, os, shutil, subprocess, tempfile, time, uuid
from pathlib import Path
H=Path(__file__).resolve().parent; P=H.parent
C=json.loads((H/'captured/catalog.json').read_text())
tmp=Path(tempfile.mkdtemp(prefix='fin-receipt-',dir='/tmp')); tmp.chmod(0o777)
os.environ['PATH']=str(Path(shutil.which('initdb')).resolve().parent)+os.pathsep+os.environ['PATH']
priv=['setpriv','--reuid=1000','--regid=1000','--clear-groups'] if os.getuid()==0 else []
cmd=['psql','-X','-qAt','-h',str(tmp),'-p','55639','-U','postgres','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose']
results=[]; failure=None
def sql(s,error=None):
    r=subprocess.run(cmd,input=s,text=True,capture_output=True)
    if error:
        assert r.returncode and error in r.stderr,(error,r.stdout,r.stderr)
    else: assert r.returncode==0,r.stderr
    return r.stdout.strip()
def check(n,s,expected=None,error=None):
    out=sql(s,error)
    if expected is not None: assert out==expected,(n,out,expected)
    results.append({'name':n,'status':'PASS'}); print('PASS',n)
REF="SET app.expected_ref='swzpzcwiasxmjutrmvkm';\n"
try:
    subprocess.run(priv+['initdb','-D',str(tmp/'data'),'-U','postgres','-A','trust'],check=True,capture_output=True)
    subprocess.run(priv+['pg_ctl','-D',str(tmp/'data'),'-l',str(tmp/'log'),'-o',f'-k {tmp} -h "" -p 55639','start','-w'],check=True,capture_output=True)
    sql((P/'fixture.sql').read_text())
    sql("ALTER TYPE public.app_role ADD VALUE 'parceiro_b2b_financeiro';")
    cols=', '.join('"'+a['name']+'" '+a['type']+(' NOT NULL' if a['notnull'] else '')+(' DEFAULT '+a['default'] if a['default'] else '') for a in C['columns'])
    constraints=', '.join('CONSTRAINT '+c['name']+' '+c['definition'] for c in C['constraints'] if c['table']=='platform_private.b2b_provisioning_receipts')
    sql('DROP TABLE platform_private.b2b_provisioning_receipts; CREATE TABLE platform_private.b2b_provisioning_receipts('+cols+', '+constraints+');')
    sql("ALTER TABLE partner_users DROP CONSTRAINT partner_users_papel_check; ALTER TABLE partner_users ADD CONSTRAINT partner_users_papel_check CHECK(papel IN ('gestor','tecnico','financeiro')); CREATE SCHEMA cf_user_guards_v1; CREATE TABLE cf_user_guards_v1.state(singleton boolean PRIMARY KEY,revision bigint); INSERT INTO cf_user_guards_v1.state VALUES(true,0); CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_app_meta_data jsonb DEFAULT '{}',raw_user_meta_data jsonb DEFAULT '{}'); ALTER TABLE profiles ADD COLUMN id uuid DEFAULT gen_random_uuid(),ADD COLUMN data_admissao date,ADD COLUMN observacoes_internas text; ALTER TABLE user_clientes ADD COLUMN id uuid DEFAULT gen_random_uuid(); CREATE TABLE platform_private.provisional_password_state(user_id uuid PRIMARY KEY,desde timestamptz,expires_at timestamptz);")
    for n in ('platform_private.platform_actor_access_ready','platform_private.has_role','has_role','is_platform_superadmin','platform_private.require_service_role'):
        sql((P/'captured'/f'{n}.sql').read_text())
    # Explicit schema seams: entitlements_for_user is fixture-backed, auth.uid/jwt use SQL claims;
    # has_ticket is never reached (session_user=postgres), not an authorization proof.
    sql("CREATE FUNCTION platform_private.has_ticket(text,uuid) RETURNS boolean LANGUAGE sql AS $$SELECT false$$;")
    OA,OB,A,B,PA,PB=[str(uuid.uuid4()) for _ in range(6)]
    sql(f"INSERT INTO organizations(id) VALUES('{OA}'),('{OB}'); INSERT INTO profiles(user_id,organization_id) VALUES('{A}','{OA}'),('{B}','{OB}'); INSERT INTO user_roles VALUES('{A}','administrador'),('{B}','administrador'); INSERT INTO partner_accounts(id,commercial_owner_organization_id) VALUES('{PA}','{OA}'),('{PB}','{OB}'); INSERT INTO platform_private.t_ent VALUES('{OA}','catalogo_precos'),('{OB}','catalogo_precos');")
    # Bootstrap precedes trigger attachment; no disabled triggers or altered real bodies.
    for t in C['triggers']: sql(t['body'])
    for t in C['triggers']: sql(t['binding']+';')
    for f in sorted(C['functions'],key=lambda f:(0 if f['signature'].startswith('platform_private.external_provisioning_scope') else 1 if f['signature'].startswith('platform_private.b2b_claim_provisioning') else 2)):
        sql(f['body'])
        check('pin_'+f['signature'],f"SELECT md5(pg_get_functiondef('{f['signature']}'::regprocedure));",f['md5'])
    for t in C['triggers']:
        check('binding_'+t['table']+'_'+t['name'],f"SELECT pg_get_triggerdef(oid) FROM pg_trigger WHERE tgrelid='{t['table']}'::regclass AND tgname='{t['name']}';",t['binding'])
    iat=int(time.time())
    def actor(s,uid=A):return f"SET request.jwt.claim.sub='{uid}'; SET request.jwt.claims='{{\"sub\":\"{uid}\",\"role\":\"authenticated\",\"iat\":{iat}}}'; "+s
    def claim(roles="ARRAY['parceiro_b2b_financeiro']::app_role[]",partner=PA):return actor(f"SELECT public.b2b_claim_provisioning('{partner}','{uuid.uuid4()}','qa-{uuid.uuid4()}@example.invalid','QA FIN',{roles},ARRAY[]::uuid[],NULL);")
    check('old_claim_reproduces_23514',claim(),error='c2_receipt_roles_shape')
    check('old_claim_no_partial_receipt',"SELECT count(*) FROM platform_private.b2b_provisioning_receipts;",'0')
    check('old_no_auth',"SELECT count(*) FROM auth.users;",'0')
    check('wrong_ref_denied',"SET app.expected_ref='wrong';"+(H/'02-install.sql.review').read_text(),error='B2B_FIN_RECEIPT_REF_UNPROVEN')
    print('LOCAL_CONSTRAINT',sql("SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='platform_private.b2b_provisioning_receipts'::regclass AND conname='c2_receipt_roles_shape';"))
    sql(REF+(H/'01-pre.sql.readonly').read_text())
    sql(REF+(H/'02-install.sql.review').read_text())
    sql(REF+(H/'02-install.sql.review').read_text())
    check('post_and_idempotent',REF+(H/'03-post.sql.readonly').read_text(),'POST_RECEIPT_PASS')
    # Constraint matrix uses valid, fully populated captured receipt rows, nested transactions rollback all rows.
    def row(arr):return f"BEGIN; INSERT INTO platform_private.b2b_provisioning_receipts(actor_id,organization_id,idempotency_key,email,nome,actor_stamp,actor_iat,actor_invite_fence,external_roles) VALUES('{A}','{OA}',gen_random_uuid(),'matrix@example.invalid','QA',now(),{iat},'[]',{arr}); ROLLBACK;"
    for r in ('parceiro_b2b','parceiro_b2b_tecnico','cliente_produtor'):
        check('legacy_'+r,row(f"ARRAY['{r}']::app_role[]"))
    check('legacy_null',row('NULL'))
    check('legacy_three',row("ARRAY['parceiro_b2b','parceiro_b2b_tecnico','cliente_produtor']::app_role[]"))
    check('legacy_duplicate_preserved',row("ARRAY['parceiro_b2b','parceiro_b2b']::app_role[]"))
    check('finance_singleton',row("ARRAY['parceiro_b2b_financeiro']::app_role[]"))
    for r in ('parceiro_b2b','parceiro_b2b_tecnico','cliente_produtor','financeiro','administrador'):
        check('deny_finance_plus_'+r,row(f"ARRAY['parceiro_b2b_financeiro','{r}']::app_role[]"),error='c2_receipt_roles_shape')
    for n,arr in [('empty','ARRAY[]::app_role[]'),('null_element',"ARRAY[NULL]::app_role[]"),('finance_null',"ARRAY['parceiro_b2b_financeiro',NULL]::app_role[]"),('finance_duplicate',"ARRAY['parceiro_b2b_financeiro','parceiro_b2b_financeiro']::app_role[]"),('too_many',"ARRAY['parceiro_b2b','parceiro_b2b','parceiro_b2b','parceiro_b2b']::app_role[]")]:
        check('deny_'+n,row(arr),error='c2_receipt_roles_shape')
    check('claim_cross_tenant',claim(partner=PB),error='external_provisioning_forbidden')
    check('claim_mixed_roles',claim("ARRAY['parceiro_b2b_financeiro','parceiro_b2b']::app_role[]"),error='c2_finance_role_exclusive')
    r=json.loads(sql(claim())); u=r['user_id']
    check('claim_contract',f"SELECT external_roles::text FROM platform_private.b2b_provisioning_receipts WHERE id='{r['claim_id']}';",'{parceiro_b2b_financeiro}')
    # AuthAdmin.createUser bridge: synthetic auth table INSERT, real on_auth_user_created/profile triggers.
    sql(f"INSERT INTO auth.users(id,email,raw_app_meta_data) SELECT user_id,email,jsonb_build_object('b2b_provisioning_receipt',id) FROM platform_private.b2b_provisioning_receipts WHERE id='{r['claim_id']}';")
    check('auth_trigger_unprivileged_profile',f"SELECT (organization_id IS NULL)::text||':'||(SELECT count(*) FROM user_roles WHERE user_id='{u}')::text FROM profiles WHERE user_id='{u}';",'true:0')
    finish=f"SELECT public.b2b_finish_provisioning('{r['claim_id']}','{r['fence']}','{u}')->>'success';"
    check('finish_requires_service',actor(finish),error='platform_forbidden')
    service="SET request.jwt.claim.sub=''; SET request.jwt.claims='{\"role\":\"service_role\"}'; SET request.jwt.claim.role='service_role'; "
    check('finish_real',service+finish,'true')
    check('finish_replay',service+finish,'true')
    check('finish_exclusive_role',f"SELECT string_agg(role::text,',') FROM user_roles WHERE user_id='{u}';",'parceiro_b2b_financeiro')
    check('finish_exact_link',f"SELECT papel||':'||tenant_id FROM partner_users WHERE user_id='{u}';",'financeiro:'+OA)
    check('receipt_completed',f"SELECT status FROM platform_private.b2b_provisioning_receipts WHERE user_id='{u}';",'completed')
    check('rollback_history_refused',REF+(H/'04-rollback.sql.review').read_text(),error='B2B_FIN_RECEIPT_ROLLBACK_HISTORY_PRESERVED')
    # Restore only in disposable database; never delete hosted receipts/history.
    sql('DELETE FROM platform_private.b2b_provisioning_receipts;')
    sql(REF+(H/'04-rollback.sql.review').read_text())
    sql(REF+(H/'04-rollback.sql.review').read_text())
    check('post_rollback',REF+(H/'05-post-rollback.sql.readonly').read_text(),'POST_RECEIPT_ROLLBACK_PASS')
    check('rollback_old_denies_finance',row("ARRAY['parceiro_b2b_financeiro']::app_role[]"),error='c2_receipt_roles_shape')
    sql('ALTER TABLE platform_private.b2b_provisioning_receipts DROP CONSTRAINT c2_receipt_roles_shape; ALTER TABLE platform_private.b2b_provisioning_receipts ADD CONSTRAINT c2_receipt_roles_shape CHECK(true);')
    check('drift_aborts',REF+(H/'02-install.sql.review').read_text(),error='B2B_FIN_RECEIPT_DRIFT')
except Exception as e:
    failure=str(e); raise
finally:
    subprocess.run(priv+['pg_ctl','-D',str(tmp/'data'),'stop','-m','fast'],capture_output=True)
    shutil.rmtree(tmp,ignore_errors=True)
    (H/'evidence-local.json').write_text(json.dumps({'exit_code':1 if failure else 0,'total':len(results),'results':results,'failure':failure,'scope':'Disposable PostgreSQL; captured real trigger bindings and provisioning bodies; synthetic Auth table/claims/schema/entitlements, NOT hosted JWT or AuthAdmin proof'},indent=2)+'\n')
print('TOTAL',len(results),'PASS')