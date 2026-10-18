"""ENTREGA 2: harness PostgreSQL descartável; nunca conecta ao hosted."""
from pathlib import Path
import os, shutil, subprocess, tempfile

ROOT = Path(__file__).resolve().parents[2]
PORT = '55499'


def main():
    tmp = Path(tempfile.mkdtemp(prefix='entrega2-', dir='/tmp'))
    tmp.chmod(0o777)
    pre = ['setpriv', '--reuid=1000', '--regid=1000', '--clear-groups'] if os.getuid() == 0 else []
    data = tmp / 'data'
    started = False
    try:
        subprocess.run(pre + ['initdb', '-D', str(data), '-U', 'postgres', '-A', 'trust'], check=True, capture_output=True)
        subprocess.run(pre + ['pg_ctl', '-D', str(data), '-l', str(tmp / 'server.log'),
                              '-o', f'-k {tmp} -h "" -p {PORT}', '-w', 'start'], check=True, capture_output=True)
        started = True
        sql = (ROOT / 'scripts/tests/entrega2-helpers-local.sql').read_text()
        r = subprocess.run(['psql', '-X', '-h', str(tmp), '-p', PORT, '-U', 'postgres', '-d', 'postgres',
                            '-v', 'ON_ERROR_STOP=1', '-q'], input=sql, text=True, capture_output=True, timeout=30)
        print(r.stderr)
        if r.returncode:
            raise SystemExit('FAIL psql exit %d' % r.returncode)
        print('NO-GO hosted installation: backup/restauração e provas JWT/RLS pendentes')
    finally:
        if started:
            subprocess.run(pre + ['pg_ctl', '-D', str(data), '-m', 'immediate', 'stop'], capture_output=True)
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == '__main__':
    main()
