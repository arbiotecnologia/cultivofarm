"""Audit real PostgreSQL DDL semantics locally. Not authorization or hosted proof."""
from pathlib import Path
import os
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
DOCS = ROOT / 'docs/auditorias'


def main():
    tmp = Path(tempfile.mkdtemp(prefix='f2b32-', dir='/tmp'))
    tmp.chmod(0o777)
    prefix = ['setpriv', '--reuid=1000', '--regid=1000', '--clear-groups'] if os.getuid() == 0 else []
    cmd = ['psql', '-X', '-h', str(tmp), '-p', '55495', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At']
    started = False
    count = 0

    def run(sql, error=None):
        r = subprocess.run(cmd, input=sql, text=True, capture_output=True, timeout=35)
        if error:
            if r.returncode == 0 or error not in r.stderr:
                raise RuntimeError('Expected '+error+': '+r.stderr)
        elif r.returncode:
            raise RuntimeError(r.stderr)
        return r.stdout.strip()

    def check(name, expr):
        nonlocal count
        if run('SELECT ('+expr+') IS TRUE;') != 't':
            raise RuntimeError('FAIL '+name)
        count += 1
        print('PASS '+name)

    try:
        subprocess.run(prefix+['initdb', '-D', str(tmp/'data'), '-A', 'trust', '-U', 'postgres'], check=True, capture_output=True)
        subprocess.run(prefix+['pg_ctl', '-D', str(tmp/'data'), '-l', str(tmp/'server.log'), '-o', f'-k {tmp} -h "" -p 55495', 'start'], check=True, capture_output=True)
        started = True
        run('''CREATE TABLE partner_user_clients(id uuid PRIMARY KEY);
          CREATE TABLE partner_technician_clients(id uuid PRIMARY KEY,active boolean DEFAULT true);
          CREATE ROLE authenticated; GRANT SELECT,INSERT,UPDATE ON partner_technician_clients TO authenticated;
          CREATE VIEW before_star AS SELECT * FROM partner_technician_clients;
          CREATE FUNCTION dynamic_row() RETURNS jsonb LANGUAGE plpgsql AS $$
          DECLARE result jsonb; BEGIN EXECUTE 'SELECT to_jsonb(t) FROM partner_'||'technician_clients t LIMIT 1' INTO result; RETURN result; END $$;
          INSERT INTO partner_technician_clients(id) VALUES ('00000000-0000-4000-8000-000000000001');''')
        old = run((DOCS/'vinculos-b2b-f2b31-preflight-readonly-20261018.sql').read_text()).splitlines()[0]
        # Real catalog queries executed in READ ONLY transaction, no hosted connection.
        pre = (DOCS/'vinculos-b2b-f2b32-preflight-readonly-20261018.sql').read_text()
        post = (DOCS/'vinculos-b2b-f2b32-postflight-readonly-20261018.sql').read_text()
        run('BEGIN READ ONLY;'+pre+post+'ROLLBACK;')
        run((DOCS/'vinculos-b2b-f2b33-fases-candidato-bloqueado-20261018.sql').read_text(), 'F2B33_NO_GO_BACKUP_ACTOR_SOURCE_RECEIPT_CONCURRENCY_RLS')
        check('preflight postflight execute read-only before columns', "NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='partner_technician_clients'::regclass AND attname='grant_origin')")
        candidate = (DOCS/'vinculos-b2b-f2b31-metadata-neutra-candidato-20261018.sql').read_text()
        schema = candidate.split('-- BEGIN LOCAL SCHEMA\n')[1].split('-- END LOCAL SCHEMA')[0]
        run(schema)
        check('existing star view stays two columns', "(SELECT count(*)=2 FROM information_schema.columns WHERE table_name='before_star')")
        check('new star view exposes new metadata', "(SELECT count(*)=4 FROM information_schema.columns WHERE table_name='partner_technician_clients')")
        check('dynamic row JSON exposes keys even null', "dynamic_row() ? 'grant_origin' AND dynamic_row() ? 'source_puc_id'")
        check('table grants implicitly include new columns', "has_column_privilege('authenticated','partner_technician_clients','grant_origin','UPDATE') AND has_column_privilege('authenticated','partner_technician_clients','source_puc_id','SELECT')")
        after = run((DOCS/'vinculos-b2b-f2b31-preflight-readonly-20261018.sql').read_text()).splitlines()[0]
        if after != old:
            raise RuntimeError('Old manifest unexpectedly changed')
        check('old manifest misses rowshape changes', "(SELECT count(*)=4 FROM pg_attribute WHERE attrelid='partner_technician_clients'::regclass AND attnum>0 AND NOT attisdropped)")
        run('BEGIN READ ONLY;'+pre+post+'ROLLBACK;')
        check('expanded inventory executes after columns', "(SELECT count(*)=2 FROM pg_attribute WHERE attrelid='partner_technician_clients'::regclass AND attname IN ('grant_origin','source_puc_id') AND NOT attisdropped)")
        run('CREATE VIEW after_star AS SELECT * FROM partner_technician_clients;')
        check('new star view captures four columns', "(SELECT count(*)=4 FROM information_schema.columns WHERE table_name='after_star')")
        run('BEGIN; ALTER TABLE partner_technician_clients DROP COLUMN grant_origin RESTRICT; ROLLBACK;', 'depend')
        check('new view blocks restrict rollback', "EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='partner_technician_clients'::regclass AND attname='grant_origin' AND NOT attisdropped)")
        run('DROP VIEW after_star; CREATE INDEX metadata_idx ON partner_technician_clients(grant_origin); ALTER TABLE partner_technician_clients ADD CONSTRAINT metadata_check CHECK(grant_origin IS NULL);')
        check('automatic dependencies detectable before rollback', "(SELECT count(*)>=2 FROM pg_depend d JOIN pg_attribute a ON a.attrelid=d.refobjid AND a.attnum=d.refobjsubid WHERE d.refclassid='pg_class'::regclass AND a.attrelid='partner_technician_clients'::regclass AND a.attname='grant_origin')")
        rb = (DOCS/'vinculos-b2b-f2b31-rollback-20261018.sql').read_text().split('-- BEGIN LOCAL ROLLBACK\n')[1].split('-- END LOCAL ROLLBACK')[0]
        run('BEGIN;'+rb+'''DO $$ BEGIN
          IF to_regclass('metadata_idx') IS NOT NULL OR EXISTS(SELECT 1 FROM pg_constraint WHERE conname='metadata_check') THEN RAISE EXCEPTION 'auto removal not reproduced'; END IF;
          END $$; ROLLBACK;''')
        check('restrict silently drops local index and check inside transaction', "to_regclass('metadata_idx') IS NOT NULL AND EXISTS(SELECT 1 FROM pg_constraint WHERE conname='metadata_check')")
        # Keep a lock connection alive; synchronize using stdout marker, never guessed sleep.
        locker = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        try:
            if locker.stdin is None or locker.stdout is None:
                raise RuntimeError('Lock process pipes missing')
            locker.stdin.write("BEGIN; LOCK TABLE partner_technician_clients IN ACCESS EXCLUSIVE MODE; SELECT 'LOCK_READY';\n")
            locker.stdin.flush()
            while True:
                line = locker.stdout.readline()
                if not line:
                    raise RuntimeError('Locker exited before ready')
                if line.strip() == 'LOCK_READY':
                    break
            run("SET lock_timeout='200ms'; SELECT * FROM partner_technician_clients;", 'lock timeout')
        finally:
            if locker.stdin:
                locker.stdin.write('ROLLBACK;\n\\q\n')
                locker.stdin.flush()
            locker.communicate(timeout=5)
        check('access exclusive blocks select and release restores read', '(SELECT count(*)=1 FROM partner_technician_clients)')
        print(f'PASS {count} review checks; NO-GO backup/hosted authorization; B3.3 design only')
    finally:
        if started:
            subprocess.run(prefix+['pg_ctl', '-D', str(tmp/'data'), '-m', 'immediate', 'stop'], capture_output=True)
        shutil.rmtree(tmp)


if __name__ == '__main__':
    main()