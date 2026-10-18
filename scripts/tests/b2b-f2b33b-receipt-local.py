"""F2-B3.3-B simulação sintética em PostgreSQL descartável; não é Auth/JWT/RLS real."""
from pathlib import Path
import os, shutil, subprocess, tempfile, time

ROOT = Path(__file__).resolve().parents[2]
PORT = '55497'


def main():
    tmp = Path(tempfile.mkdtemp(prefix='f2b33b-', dir='/tmp'))
    tmp.chmod(0o777)
    pre = ['setpriv', '--reuid=1000', '--regid=1000', '--clear-groups'] if os.getuid() == 0 else []
    data = tmp / 'data'
    started = False
    try:
        subprocess.run(pre + ['initdb', '-D', str(data), '-U', 'postgres', '-A', 'trust'], check=True, capture_output=True)
        subprocess.run(pre + ['pg_ctl', '-D', str(data), '-o', f'-k {tmp} -p {PORT} -c listen_addresses=', '-w', 'start'],
                       check=True, capture_output=True)
        started = True
        sql = (ROOT / 'scripts/tests/b2b-f2b33b-receipt-local.sql').read_text()
        r = subprocess.run(['psql', '-X', '-h', str(tmp), '-p', PORT, '-U', 'postgres', '-d', 'postgres',
                            '-v', 'ON_ERROR_STOP=1', '-q'], input=sql, text=True, capture_output=True, timeout=30)
        print(r.stderr)
        if r.returncode:
            raise SystemExit('FAIL psql exit %d' % r.returncode)
        print('NO-GO hosted installation/JWT/RLS')
    finally:
        if started:
            subprocess.run(pre + ['pg_ctl', '-D', str(data), '-m', 'immediate', 'stop'], capture_output=True)
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == '__main__':
    main()
