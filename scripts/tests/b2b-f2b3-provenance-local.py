"""F2-B3 structural experiment only; synthetic tables, no Auth/RLS/hosted access."""
from pathlib import Path
import os
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
DOCS = ROOT / 'docs/auditorias'


def main():
    tmp = Path(tempfile.mkdtemp(prefix='f2b3-', dir='/tmp'))
    tmp.chmod(0o777)
    prefix = ['setpriv', '--reuid=1000', '--regid=1000', '--clear-groups'] if os.getuid() == 0 else []
    started = False
    count = 0
    cmd = ['psql', '-X', '-h', str(tmp), '-p', '55493', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At']

    def run(sql, error=None):
        result = subprocess.run(cmd, input=sql, text=True, capture_output=True, timeout=30)
        if error:
            if result.returncode == 0 or error not in result.stderr:
                raise RuntimeError('Expected exact error ' + error + ': ' + result.stderr)
        elif result.returncode:
            raise RuntimeError(result.stderr)
        return result.stdout.strip()

    def check(name, expression):
        nonlocal count
        if run('SELECT (' + expression + ') IS TRUE;') != 't':
            raise RuntimeError('FAIL ' + name)
        count += 1
        print('PASS ' + name)

    try:
        subprocess.run(prefix + ['initdb', '-D', str(tmp / 'data'), '-A', 'trust', '-U', 'postgres'], check=True, capture_output=True)
        subprocess.run(prefix + ['pg_ctl', '-D', str(tmp / 'data'), '-l', str(tmp / 'server.log'), '-o', f'-k {tmp} -h "" -p 55493', 'start'], check=True, capture_output=True)
        started = True
        run('''CREATE TABLE partner_user_clients(id uuid PRIMARY KEY,partner_id uuid NOT NULL,user_id uuid NOT NULL,cliente_id uuid NOT NULL,active boolean NOT NULL,
          CONSTRAINT partner_user_clients_unique UNIQUE(partner_id,user_id,cliente_id));
          CREATE TABLE partner_technician_clients(id uuid PRIMARY KEY,partner_id uuid NOT NULL,technician_user_id uuid NOT NULL,cliente_id uuid NOT NULL,active boolean NOT NULL,
          CONSTRAINT partner_technician_clients_unique UNIQUE(partner_id,technician_user_id,cliente_id));''')
        candidate = (DOCS / 'vinculos-b2b-f2b3-esquema-candidato-20261018.sql').read_text()
        rollback = (DOCS / 'vinculos-b2b-f2b3-rollback-candidato-20261018.sql').read_text()
        run(candidate, 'F2B3_NO_GO_ACTOR_READERS_AND_CUTOVER_UNPROVEN')
        check('installer refuses execution before schema changes', "NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='partner_technician_clients' AND column_name='grant_origin')")
        run(candidate.split('-- BEGIN LOCAL SCHEMA\n')[1].split('-- END LOCAL SCHEMA')[0])
        run('''INSERT INTO partner_user_clients VALUES ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',true);''')
        base = "INSERT INTO partner_technician_clients(id,partner_id,technician_user_id,cliente_id,active,grant_origin,source_puc_id) VALUES ('50000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',true,"
        run(base + "NULL,NULL);")
        check('legacy preserved unknown, not inferred', '(SELECT grant_origin IS NULL AND source_puc_id IS NULL AND active FROM partner_technician_clients)')
        run("UPDATE partner_technician_clients SET grant_origin='direct';")
        check('reviewed direct may have no PUC source', "(SELECT grant_origin='direct' AND source_puc_id IS NULL FROM partner_technician_clients)")
        for label, sql, error in [
            ('null origin with source rejected', "UPDATE partner_technician_clients SET grant_origin=NULL,source_puc_id='10000000-0000-4000-8000-000000000001';", 'f2b3_ptc_origin_coherence'),
            ('projected without source rejected', "UPDATE partner_technician_clients SET grant_origin='puc';", 'f2b3_ptc_origin_coherence'),
            ('invalid origin rejected', "UPDATE partner_technician_clients SET grant_origin='guessed';", 'f2b3_ptc_origin_coherence'),
        ]:
            run(sql, error)
            check(label + ' and state unchanged', "(SELECT grant_origin='direct' AND source_puc_id IS NULL FROM partner_technician_clients)")
        run("UPDATE partner_technician_clients SET grant_origin='puc',source_puc_id='10000000-0000-4000-8000-000000000001';")
        check('verified matching projection accepted', "(SELECT grant_origin='puc' AND source_puc_id IS NOT NULL FROM partner_technician_clients)")
        for column, uid in [('partner_id', '20000000-0000-4000-8000-000000000002'), ('technician_user_id', '30000000-0000-4000-8000-000000000002'), ('cliente_id', '40000000-0000-4000-8000-000000000002')]:
            run(f"UPDATE partner_technician_clients SET {column}='{uid}';", 'f2b3_ptc_source_identity_fk')
            check('FK rejects mismatched ' + column, '(SELECT count(*)=1 FROM partner_technician_clients)')
        run('DELETE FROM partner_user_clients;', 'f2b3_ptc_source_identity_fk')
        check('source physical deletion restricted, not detached/cascaded', '(SELECT count(*)=1 FROM partner_user_clients) AND (SELECT count(*)=1 FROM partner_technician_clients)')
        run('UPDATE partner_user_clients SET active=false;')
        check('known gap: additive schema does not revoke residual access', '(SELECT NOT active FROM partner_user_clients) AND (SELECT active FROM partner_technician_clients)')
        run(rollback, 'F2B3_ROLLBACK_REQUIRES_INDEPENDENT_REVIEW')
        local_rb = rollback.split('-- BEGIN LOCAL ROLLBACK\n')[1].split('-- END LOCAL ROLLBACK')[0]
        run('BEGIN;\n' + local_rb, 'F2B3_ROLLBACK_WOULD_LOSE_PROVENANCE')
        check('rollback refuses provenance loss', "EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='partner_technician_clients' AND column_name='grant_origin')")
        # Only discardable synthetic metadata is reset to exercise pre-cutover rollback.
        run('UPDATE partner_technician_clients SET grant_origin=NULL,source_puc_id=NULL;')
        run('BEGIN;\n' + local_rb + '\nCOMMIT;')
        check('pre-cutover rollback retains rows and keys', "(SELECT count(*)=1 FROM partner_technician_clients) AND NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='partner_technician_clients' AND column_name='grant_origin') AND EXISTS(SELECT 1 FROM pg_constraint WHERE conname='partner_technician_clients_unique')")
        print(f'PASS {count} structural checks; NO-GO hosted/actor/RLS/revocation; synthetic schema only')
    finally:
        if started:
            subprocess.run(prefix + ['pg_ctl', '-D', str(tmp / 'data'), '-m', 'immediate', 'stop'], capture_output=True)
        shutil.rmtree(tmp)


if __name__ == '__main__':
    main()