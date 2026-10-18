"""Discardable PostgreSQL only. Real sync/validator, synthetic dependency schema; never hosted proof."""
from pathlib import Path
import os, shutil, subprocess, tempfile, json, re
ROOT=Path(__file__).resolve().parents[2]; D=ROOT/'docs/auditorias'; P='vinculos-b2b-f2b2-'
def main():
 tmp=Path(tempfile.mkdtemp(prefix='f2b2-',dir='/tmp')); tmp.chmod(0o777)
 prefix=['setpriv','--reuid=1000','--regid=1000','--clear-groups'] if os.getuid()==0 else []
 started=False; passed=0
 cmd=['psql','-X','-h',str(tmp),'-p','55492','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-At']
 def run(sql,ok=True):
  r=subprocess.run(cmd,input=sql,text=True,capture_output=True)
  if (r.returncode==0)!=ok: raise RuntimeError(r.stderr)
  return r
 def check(label,sql):
  nonlocal passed
  result=run('SELECT ('+sql+') IS TRUE;').stdout.strip()
  if result!='t': raise RuntimeError('FAIL '+label+': '+result)
  passed+=1; print('PASS '+label)
 def snapshot():
  return json.loads(run("SELECT jsonb_build_object('puc',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]') FROM partner_user_clients t),'ptc',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]') FROM partner_technician_clients t),'other',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY user_id),'[]') FROM profiles t),'policy',(SELECT jsonb_agg(to_jsonb(t)) FROM pg_policies t));").stdout)
 def audit(before,label):
  after=snapshot()
  if before['other']!=after['other'] or before['policy']!=after['policy']: raise RuntimeError('UNEXPECTED_SCOPE_DIFF '+label)
  print('AUDIT '+label+': '+','.join(k for k in before if before[k]!=after[k])+'; profiles/policies unchanged')
 try:
  subprocess.run(prefix+['initdb','-D',str(tmp/'data'),'-A','trust','-U','postgres'],check=True,capture_output=True)
  subprocess.run(prefix+['pg_ctl','-D',str(tmp/'data'),'-l',str(tmp/'server.log'),'-o',f'-k {tmp} -h "" -p 55492','start'],check=True,capture_output=True); started=True
  # Exact reduced dependency setup already labeled synthetic by F2-B1; no guard/JWT parity claim.
  old=(ROOT/'scripts/tests/b2b-f2b1-context-local.py').read_text()
  setup=old.split('run(r"""')[1].split('""")')[0]
  run(setup)
  run("ALTER TABLE partner_user_clients ADD COLUMN id uuid DEFAULT gen_random_uuid(),ADD CONSTRAINT partner_user_clients_unique UNIQUE(partner_id,user_id,cliente_id); ALTER TABLE partner_technician_clients ADD COLUMN id uuid DEFAULT gen_random_uuid(),ADD COLUMN created_at timestamptz DEFAULT now();")
  run((D/'vinculos-b2b-f2b1-baseline-20261018.sql').read_text()+(D/'vinculos-b2b-f2b-baseline-20261018.sql').read_text())
  run("REVOKE ALL ON FUNCTION sync_puc_to_ptc_fn(),validate_partner_user_client_fn() FROM PUBLIC; GRANT EXECUTE ON FUNCTION sync_puc_to_ptc_fn(),validate_partner_user_client_fn() TO service_role; CREATE TRIGGER trg_sync_puc_to_ptc AFTER INSERT OR UPDATE ON partner_user_clients FOR EACH ROW EXECUTE FUNCTION sync_puc_to_ptc_fn(); ALTER TABLE partner_user_clients ENABLE ROW LEVEL SECURITY; GRANT SELECT,INSERT,UPDATE ON partner_user_clients TO authenticated; CREATE POLICY local_permissive ON partner_user_clients FOR ALL TO authenticated USING(true) WITH CHECK(true); CREATE POLICY bf02_assignment_contract_containment ON partner_user_clients AS RESTRICTIVE FOR ALL TO anon,authenticated USING(false) WITH CHECK(false);")
  candidate=(D/(P+'candidato-20261018.sql')).read_text()
  refusal=run(candidate,False)
  if 'F2B2_POLICY_DRIFT' not in refusal.stderr: raise RuntimeError('Unexpected refusal '+refusal.stderr)
  check('full preflight refuses synthetic policy manifest',"md5(pg_get_functiondef('sync_puc_to_ptc_fn()'::regprocedure))='4dc955897950bf70ee8e1072bbae1ff2'")
  run("INSERT INTO profiles VALUES('44444444-4444-4444-8444-444444444444','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true,false); INSERT INTO user_roles VALUES('44444444-4444-4444-8444-444444444444','parceiro_b2b_tecnico'); INSERT INTO partner_accounts(id,commercial_owner_organization_id,ativo) VALUES('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true),('22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true); INSERT INTO partner_users VALUES('44444444-4444-4444-8444-444444444444','11111111-1111-4111-8111-111111111111','tecnico','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',now(),NULL);")
  key="partner_id='11111111-1111-4111-8111-111111111111'"
  insert="INSERT INTO partner_user_clients(user_id,partner_id,cliente_id,user_role,active,assignment_type,notes) VALUES('44444444-4444-4444-8444-444444444444','11111111-1111-4111-8111-111111111111','99999999-9999-4999-8999-999999999999','parceiro_b2b_tecnico',true,'tecnico','original');"
  run(insert+"UPDATE partner_user_clients SET assignment_type='comercial';")
  check('baseline leaves residual',"(SELECT active FROM partner_technician_clients)")
  run(candidate.split('-- BEGIN LOCAL CANDIDATE\n')[1].split('-- END LOCAL CANDIDATE')[0])
  before=snapshot(); run("UPDATE partner_user_clients SET assignment_type='comercial';")
  check('candidate repeated commercial cleans residual',"NOT (SELECT active FROM partner_technician_clients)"); audit(before,'commercial cleanup')
  before=snapshot(); run("UPDATE partner_user_clients SET assignment_type='tecnico';")
  check('technical reactivation same row',"(SELECT count(*) FROM partner_technician_clients)=1 AND (SELECT active FROM partner_technician_clients)"); audit(before,'technical projection')
  before=snapshot(); run("UPDATE partner_user_clients SET assignment_type='tecnico';")
  if before['ptc']!=snapshot()['ptc']: raise RuntimeError('ACTIVE PTC IDEMPOTENCY FAIL')
  check('repeated active no PTC timestamp churn',"(SELECT count(*) FROM partner_technician_clients)=1"); audit(before,'idempotent active')
  before=snapshot(); run("BEGIN; INSERT INTO partner_user_clients(user_id,partner_id,cliente_id,user_role,active,assignment_type) VALUES('44444444-4444-4444-8444-444444444444','11111111-1111-4111-8111-111111111111','88888888-8888-4888-8888-888888888888','parceiro_b2b_tecnico',true,'tecnico');")
  # Sessions are fresh per run: persistent transaction cannot span calls. Use one call with assert + rollback.
  run("BEGIN; INSERT INTO partner_user_clients(user_id,partner_id,cliente_id,user_role,active,assignment_type) VALUES('44444444-4444-4444-8444-444444444444','11111111-1111-4111-8111-111111111111','88888888-8888-4888-8888-888888888888','parceiro_b2b_tecnico',true,'tecnico'); SELECT local_assert('candidate technical INSERT creates PTC',(SELECT active FROM partner_technician_clients WHERE cliente_id='88888888-8888-4888-8888-888888888888')); ROLLBACK;")
  passed+=1
  if before!=snapshot(): raise RuntimeError('INSERT fixture rollback changed state')
  audit(before,'candidate INSERT rollback')
  before=snapshot(); run("UPDATE partner_user_clients SET active=false;")
  check('active false deactivates',"NOT (SELECT active FROM partner_technician_clients)"); audit(before,'inactive cleanup')
  before=snapshot(); run("UPDATE partner_user_clients SET active=false;")
  check('repeated inactive no PTC changes',"(SELECT count(*) FROM partner_technician_clients)=1")
  if before['ptc']!=snapshot()['ptc']: raise RuntimeError('PTC IDEMPOTENCY FAIL')
  audit(before,'idempotent inactive')
  run("UPDATE partner_user_clients SET active=true;")
  before=snapshot(); run("UPDATE partner_user_clients SET user_role='parceiro_b2b';")
  check('stored role gestor deactivates despite actual technician role',"NOT (SELECT active FROM partner_technician_clients)"); audit(before,'stored role transition')
  run("UPDATE partner_user_clients SET user_role='parceiro_b2b_tecnico'; UPDATE user_roles SET role='parceiro_b2b';")
  before=snapshot(); run("UPDATE partner_user_clients SET notes='cleanup';")
  check('actual role gestor on PUC touch deactivates',"NOT (SELECT active FROM partner_technician_clients)"); audit(before,'actual role transition')
  run("UPDATE user_roles SET role='parceiro_b2b_tecnico'; UPDATE partner_user_clients SET notes='technical';")
  before=snapshot(); run("UPDATE partner_users SET revoked_at=now();")
  check('known gap revocation alone leaves PTC',"(SELECT active FROM partner_technician_clients)"); audit(before,'membership-only revocation')
  before=snapshot(); run("UPDATE partner_user_clients SET notes='revoked touch';")
  check('revoked touch cleans without eligible target branch',"NOT (SELECT active FROM partner_technician_clients)"); audit(before,'revoked touch cleanup')
  run("UPDATE partner_users SET revoked_at=NULL; UPDATE partner_user_clients SET notes='active again'; UPDATE profiles SET ativo=false;")
  before=snapshot(); run("UPDATE partner_user_clients SET active=false;")
  check('isolated sync inactive target cleanup',"NOT (SELECT active FROM partner_technician_clients)"); audit(before,'isolated inactive target')
  run("CREATE TRIGGER trg_validate_puc BEFORE INSERT OR UPDATE ON partner_user_clients FOR EACH ROW EXECUTE FUNCTION validate_partner_user_client_fn();")
  before=snapshot(); failed=run("UPDATE partner_user_clients SET active=false;",False)
  if 'não é um usuário B2B válido' not in failed.stderr: raise RuntimeError(failed.stderr)
  check('full pipeline validator blocks inactive cleanup',"NOT (SELECT active FROM partner_user_clients)")
  if snapshot()!=before: raise RuntimeError('failed validation changed state')
  audit(before,'full validator failure rollback')
  run("UPDATE profiles SET ativo=true; INSERT INTO partner_clients VALUES('11111111-1111-4111-8111-111111111111','99999999-9999-4999-8999-999999999999',true);")
  run("INSERT INTO partner_clients VALUES('22222222-2222-4222-8222-222222222222','99999999-9999-4999-8999-999999999999',true);")
  before=snapshot(); failed=run("UPDATE partner_user_clients SET cliente_id='88888888-8888-4888-8888-888888888888';",False)
  if 'não está vinculado ao parceiro' not in failed.stderr: raise RuntimeError(failed.stderr)
  # Direct identity boundary exercise is isolated, without disabling a production guard.
  run("DROP TRIGGER trg_validate_puc ON partner_user_clients;")
  before=snapshot(); failed=run("UPDATE partner_user_clients SET partner_id='22222222-2222-4222-8222-222222222222';",False)
  if 'F2B2_ASSIGNMENT_IDENTITY_IMMUTABLE' not in failed.stderr: raise RuntimeError(failed.stderr)
  check('identity change rejected with no side effects',"(SELECT partner_id FROM partner_user_clients)='11111111-1111-4111-8111-111111111111'::uuid")
  if snapshot()!=before: raise RuntimeError('identity failed state changed')
  audit(before,'partner identity denial')
  run("CREATE TRIGGER trg_validate_puc BEFORE INSERT OR UPDATE ON partner_user_clients FOR EACH ROW EXECUTE FUNCTION validate_partner_user_client_fn();")
  run("INSERT INTO partner_technician_clients(partner_id,technician_user_id,cliente_id,active,notes) VALUES('22222222-2222-4222-8222-222222222222','44444444-4444-4444-8444-444444444444','99999999-9999-4999-8999-999999999999',true,'independent B');")
  before=snapshot(); run("UPDATE partner_user_clients SET assignment_type='comercial';")
  check('partner B same target/client untouched',"(SELECT active FROM partner_technician_clients WHERE partner_id='22222222-2222-4222-8222-222222222222')")
  audit(before,'partner B isolation')
  # Privileged direct PTC write is real independence, not proof of authorized client bypass.
  run("UPDATE partner_technician_clients SET active=true,notes='independent direct grant' WHERE "+key+";")
  before=snapshot(); run("UPDATE partner_user_clients SET notes='ambiguous';")
  check('known blocker shared PTC provenance cleanup overwrites direct grant',"NOT (SELECT active FROM partner_technician_clients WHERE "+key+")"); audit(before,'provenance conflict')
  denied=run('SET ROLE authenticated; '+insert,False)
  if 'row-level security' not in denied.stderr: raise RuntimeError(denied.stderr)
  check('synthetic restrictive policy still denies INSERT',"NOT has_function_privilege('authenticated','sync_puc_to_ptc_fn()','EXECUTE')")
  before=snapshot(); run("SET ROLE authenticated; UPDATE partner_user_clients SET active=true;")
  if snapshot()!=before: raise RuntimeError('RLS mutation changed state')
  check('synthetic restrictive policy UPDATE affects zero',"(SELECT assignment_type FROM partner_user_clients)='comercial'"); audit(before,'contained actor update')
  # Row-lock handshake, no timing guess: wait for NOTICE emitted after update holds PUC lock.
  run("UPDATE partner_user_clients SET assignment_type='tecnico',active=true;")
  before=snapshot()
  first=subprocess.Popen(cmd,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
  first.stdin.write("BEGIN; UPDATE partner_user_clients SET active=false; DO $$ BEGIN RAISE NOTICE 'LOCKED'; END $$; SELECT pg_sleep(0.4); COMMIT;\n"); first.stdin.close()
  while True:
   line=first.stderr.readline()
   if 'LOCKED' in line: break
   if not line: raise RuntimeError('concurrency handshake failed')
  run("SET lock_timeout='3s'; UPDATE partner_user_clients SET active=true;")
  first.wait(timeout=10)
  if first.returncode: raise RuntimeError(first.stderr.read())
  check('same PUC concurrent last serialized update projected',"(SELECT active FROM partner_user_clients)=(SELECT active FROM partner_technician_clients WHERE "+key+")")
  audit(before,'serialized same PUC')
  # Dependency-row revocation does not share PUC's lock; prove the remaining race.
  before=snapshot()
  first=subprocess.Popen(cmd,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
  first.stdin.write("BEGIN; UPDATE partner_user_clients SET notes='concurrent projection'; DO $$ BEGIN RAISE NOTICE 'PROJECTED'; END $$; SELECT pg_sleep(0.4); COMMIT;\n"); first.stdin.close()
  while True:
   line=first.stderr.readline()
   if 'PROJECTED' in line: break
   if not line: raise RuntimeError('revocation handshake failed')
  run("SET lock_timeout='3s'; UPDATE partner_users SET revoked_at=now();")
  first.wait(timeout=10)
  if first.returncode: raise RuntimeError(first.stderr.read())
  check('known concurrency gap revocation can commit with active PTC',"(SELECT revoked_at IS NOT NULL FROM partner_users) AND (SELECT active FROM partner_technician_clients WHERE "+key+")")
  audit(before,'dependency revocation race')
  run("UPDATE partner_users SET revoked_at=NULL;")
  before=snapshot(); run("BEGIN; UPDATE partner_user_clients SET assignment_type='comercial'; ROLLBACK;")
  if before!=snapshot(): raise RuntimeError('transaction rollback changed state')
  check('PUC and PTC transaction rollback atomic',"(SELECT active FROM partner_technician_clients WHERE "+key+")"); audit(before,'rollback')
  run((D/(P+'rollback-20261018.sql')).read_text())
  check('exact baseline rollback hash',"md5(pg_get_functiondef('sync_puc_to_ptc_fn()'::regprocedure))='4dc955897950bf70ee8e1072bbae1ff2'")
  print(f'PASS {passed} checks; NO-GO actor/provenance/revocation pipeline; no hosted SQL')
 finally:
  if started: subprocess.run(prefix+['pg_ctl','-D',str(tmp/'data'),'-m','immediate','stop'],capture_output=True)
  shutil.rmtree(tmp)
if __name__=='__main__': main()
