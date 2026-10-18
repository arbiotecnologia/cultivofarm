"""Disposable PostgreSQL: structural/compatibility evidence only, NOT RLS/Auth proof."""
from pathlib import Path
import os
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
DOCS = ROOT / 'docs/auditorias'


def main():
    tmp = Path(tempfile.mkdtemp(prefix='f2b31-', dir='/tmp'))
    tmp.chmod(0o777)
    prefix = ['setpriv', '--reuid=1000', '--regid=1000', '--clear-groups'] if os.getuid() == 0 else []
    cmd = ['psql', '-X', '-h', str(tmp), '-p', '55494', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At']
    started = False
    count = 0

    def run(sql, error=None):
        result = subprocess.run(cmd, input=sql, text=True, capture_output=True, timeout=30)
        if error:
            if result.returncode == 0 or error not in result.stderr:
                raise RuntimeError('Expected '+error+': '+result.stderr)
        elif result.returncode:
            raise RuntimeError(result.stderr)
        return result.stdout.strip()

    def check(name, expression):
        nonlocal count
        if run('SELECT ('+expression+') IS TRUE;') != 't':
            raise RuntimeError('FAIL '+name)
        count += 1
        print('PASS '+name)

    try:
        subprocess.run(prefix+['initdb', '-D', str(tmp/'data'), '-A', 'trust', '-U', 'postgres'], check=True, capture_output=True)
        subprocess.run(prefix+['pg_ctl', '-D', str(tmp/'data'), '-l', str(tmp/'server.log'), '-o', f'-k {tmp} -h "" -p 55494', 'start'], check=True, capture_output=True)
        started = True
        run('''CREATE TABLE partner_accounts(id uuid PRIMARY KEY);
        CREATE TABLE clientes(id uuid PRIMARY KEY);
        CREATE TYPE app_role AS ENUM ('parceiro_b2b_tecnico');
        -- Synthetic eligibility stub ONLY; never security/actor evidence.
        CREATE FUNCTION has_role(uuid,app_role) RETURNS boolean LANGUAGE sql AS 'SELECT false';
        CREATE TABLE partner_user_clients(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          partner_id uuid REFERENCES partner_accounts ON DELETE CASCADE,user_id uuid,cliente_id uuid REFERENCES clientes ON DELETE CASCADE,
          assignment_type text,user_role text,assigned_by uuid,active boolean DEFAULT true,notes text,
          CONSTRAINT partner_user_clients_unique UNIQUE(partner_id,user_id,cliente_id));
        CREATE TABLE partner_technician_clients(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          partner_id uuid REFERENCES partner_accounts ON DELETE CASCADE,technician_user_id uuid,cliente_id uuid REFERENCES clientes ON DELETE CASCADE,
          assigned_by uuid,active boolean DEFAULT true,notes text,updated_at timestamptz DEFAULT now(),
          CONSTRAINT partner_technician_clients_unique UNIQUE(partner_id,technician_user_id,cliente_id));
        CREATE ROLE authenticated;
        GRANT SELECT,INSERT,UPDATE ON partner_technician_clients TO authenticated;
        CREATE VIEW local_reader AS SELECT partner_id,technician_user_id,cliente_id,active FROM partner_technician_clients;''')
        run((DOCS/'vinculos-b2b-f2b2-baseline-20261018.sql').read_text())
        run('CREATE TRIGGER trg_sync_puc_to_ptc AFTER INSERT OR UPDATE ON partner_user_clients FOR EACH ROW EXECUTE FUNCTION sync_puc_to_ptc_fn();')
        baseline = run("SELECT md5(pg_get_functiondef('sync_puc_to_ptc_fn()'::regprocedure))||'|'||(SELECT relacl::text FROM pg_class WHERE oid='partner_technician_clients'::regclass)||'|'||pg_get_viewdef('local_reader'::regclass);")
        candidate = (DOCS/'vinculos-b2b-f2b31-metadata-neutra-candidato-20261018.sql').read_text()
        rollback = (DOCS/'vinculos-b2b-f2b31-rollback-20261018.sql').read_text()
        preflight = (DOCS/'vinculos-b2b-f2b31-preflight-readonly-20261018.sql').read_text()
        run(preflight)
        check('read-only preflight creates no columns', "NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='partner_technician_clients' AND column_name='grant_origin')")
        run(candidate, 'F2B31_EXTERNAL_REVIEW_REQUIRED')
        check('unreviewed release is atomic no-op', "NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='partner_technician_clients' AND column_name='grant_origin')")
        reviewed = candidate.replace('reviewed_ref text := NULL', "reviewed_ref text := 'swzpzcwiasxmjutrmvkm'").replace('review_receipt text := NULL', "review_receipt text := 'LOCAL_ONLY_NOT_APPROVAL'")
        run(reviewed, 'F2B31_BASELINE_DRIFT')
        check('reviewed wrong baseline remains no-op', "NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='partner_technician_clients' AND column_name='grant_origin')")
        schema = candidate.split('-- BEGIN LOCAL SCHEMA\n')[1].split('-- END LOCAL SCHEMA')[0]
        rb = rollback.split('-- BEGIN LOCAL ROLLBACK\n')[1].split('-- END LOCAL ROLLBACK')[0]
        run('BEGIN;'+schema+'ROLLBACK;')
        check('DDL rollback removes all staged columns', "NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='partner_technician_clients' AND column_name='grant_origin')")
        run('BEGIN;'+schema+'COMMIT;')
        check('two nullable no-default columns only', "(SELECT count(*)=2 FROM information_schema.columns WHERE table_name='partner_technician_clients' AND column_name IN ('grant_origin','source_puc_id') AND is_nullable='YES' AND column_default IS NULL)")
        check('no new FK or check constraints', "(SELECT count(*)=4 FROM pg_constraint WHERE conrelid='partner_technician_clients'::regclass)")
        run(schema, 'already exists')
        check('repeat install refuses partial schema', "(SELECT count(*)=2 FROM information_schema.columns WHERE table_name='partner_technician_clients' AND column_name IN ('grant_origin','source_puc_id'))")
        p1='20000000-0000-4000-8000-000000000001';p2='20000000-0000-4000-8000-000000000002'
        c1='40000000-0000-4000-8000-000000000001';c2='40000000-0000-4000-8000-000000000002'
        u='30000000-0000-4000-8000-000000000001'
        run(f"INSERT INTO partner_accounts VALUES ('{p1}'),('{p2}'); INSERT INTO clientes VALUES ('{c1}'),('{c2}');")
        run(f"SET ROLE authenticated; INSERT INTO partner_technician_clients(partner_id,technician_user_id,cliente_id) VALUES ('{p1}','{u}','{c1}'); RESET ROLE;")
        check('existing direct INSERT stays unknown active', '(SELECT active AND grant_origin IS NULL AND source_puc_id IS NULL FROM partner_technician_clients)')
        run('SET ROLE authenticated; UPDATE partner_technician_clients SET active=false; RESET ROLE;')
        check('existing direct toggle remains usable', '(SELECT NOT active FROM partner_technician_clients)')
        run(f"SET ROLE authenticated; UPDATE partner_technician_clients SET active=true,grant_origin='puc',source_puc_id='{u}'; RESET ROLE;")
        check('spoofable metadata accepted but not evidence', "(SELECT active AND grant_origin='puc' FROM local_reader JOIN partner_technician_clients USING(partner_id,technician_user_id,cliente_id,active))")
        run('BEGIN;'+rb, 'F2B31_ROLLBACK_WOULD_LOSE_METADATA')
        check('rollback refuses metadata loss', "EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='partner_technician_clients' AND column_name='grant_origin')")
        run("UPDATE partner_technician_clients SET grant_origin=NULL,source_puc_id=NULL;")
        # Existing exact sync is deliberately unchanged. Reproduce its unsafe collision, not a solution PASS.
        run(f"INSERT INTO partner_user_clients(partner_id,user_id,cliente_id,assignment_type,user_role,active) VALUES ('{p1}','{u}','{c1}','tecnico','parceiro_b2b_tecnico',false);")
        check('known gap unchanged sync overwrites unknown direct grant', '(SELECT NOT active AND grant_origin IS NULL FROM partner_technician_clients)')
        run("UPDATE partner_technician_clients SET active=true,grant_origin='direct'; UPDATE partner_user_clients SET active=false;")
        check('known gap unchanged sync overwrites labelled direct grant', "(SELECT NOT active AND grant_origin='direct' FROM partner_technician_clients)")
        run(f"INSERT INTO partner_technician_clients(partner_id,technician_user_id,cliente_id,active) VALUES ('{p2}','{u}','{c1}',true);")
        check('partner B remains independent after A collision', f"(SELECT active FROM partner_technician_clients WHERE partner_id='{p2}')")
        run('BEGIN; DELETE FROM partner_accounts WHERE id=\''+p1+'\';')
        # Each run is a connection. Persistent delete tested under explicit rollback below.
        check('uncommitted parent delete rolls back with connection', '(SELECT count(*)=2 FROM partner_technician_clients)')
        run(f"BEGIN; DELETE FROM partner_accounts WHERE id='{p1}'; DO $$ BEGIN IF EXISTS(SELECT 1 FROM partner_user_clients WHERE partner_id='{p1}') OR EXISTS(SELECT 1 FROM partner_technician_clients WHERE partner_id='{p1}') THEN RAISE EXCEPTION 'cascade failed'; END IF; END $$; ROLLBACK;")
        check('partner parent cascade succeeds and rollback preserves rows', '(SELECT count(*)=2 FROM partner_technician_clients) AND (SELECT count(*)=1 FROM partner_user_clients)')
        run(f"BEGIN; DELETE FROM clientes WHERE id='{c1}'; DO $$ BEGIN IF EXISTS(SELECT 1 FROM partner_user_clients) OR EXISTS(SELECT 1 FROM partner_technician_clients) THEN RAISE EXCEPTION 'client cascade failed'; END IF; END $$; ROLLBACK;")
        check('client parent cascade succeeds and rollback preserves rows', '(SELECT count(*)=2 FROM partner_technician_clients)')
        run("UPDATE partner_technician_clients SET grant_origin='puc',source_puc_id=(SELECT id FROM partner_user_clients LIMIT 1); DELETE FROM partner_user_clients;")
        check('PUC delete does not erase PTC and may orphan untrusted metadata', '(SELECT count(*)=2 AND bool_and(source_puc_id IS NOT NULL) FROM partner_technician_clients) AND NOT EXISTS(SELECT 1 FROM partner_user_clients)')
        run(rollback, 'F2B31_EXTERNAL_REVIEW_REQUIRED')
        check('rollback release still requires external review', '(SELECT count(*)=2 FROM partner_technician_clients)')
        run('UPDATE partner_technician_clients SET grant_origin=NULL,source_puc_id=NULL;')
        # Clearing metadata is ONLY on synthetic fixtures; not a hosted remediation.
        run('CREATE VIEW local_dependency AS SELECT grant_origin FROM partner_technician_clients;')
        run('BEGIN;'+rb, 'depend')
        check('dependent view blocks rollback without CASCADE', "EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='partner_technician_clients' AND column_name='grant_origin')")
        run('DROP VIEW local_dependency; BEGIN;'+rb+'COMMIT;')
        check('rollback retains direct rows and active values', '(SELECT count(*)=2 FROM partner_technician_clients) AND NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name=\'partner_technician_clients\' AND column_name=\'grant_origin\')')
        now = run("SELECT md5(pg_get_functiondef('sync_puc_to_ptc_fn()'::regprocedure))||'|'||(SELECT relacl::text FROM pg_class WHERE oid='partner_technician_clients'::regclass)||'|'||pg_get_viewdef('local_reader'::regclass);")
        if baseline != now:
            raise RuntimeError('FAIL function/ACL/reader drift')
        count += 1
        print('PASS exact sync body ACL and old reader unchanged')
        print(f'PASS {count} structural checks; NO-GO provenance/revocation/RLS hosted')
    finally:
        if started:
            subprocess.run(prefix+['pg_ctl', '-D', str(tmp/'data'), '-m', 'immediate', 'stop'], capture_output=True)
        shutil.rmtree(tmp)


if __name__ == '__main__':
    main()
