"""Disposable PostgreSQL helper (local only, never hosted)."""
import os, subprocess, tempfile, atexit
from pathlib import Path
PORT = 55511
root = Path(tempfile.mkdtemp(prefix='c2-integral-', dir='/tmp')); root.chmod(0o777)
prefix = ['setpriv', '--reuid=1000', '--regid=1000', '--clear-groups'] if os.getuid() == 0 else []
def psql(user='postgres'):
    return ['psql', '-X', '-h', str(root), '-p', str(PORT), '-U', user, '-qAt', '-v', 'ON_ERROR_STOP=1', 'postgres']
def start():
    subprocess.run(prefix + ['initdb', '-D', str(root / 'data'), '-A', 'trust', '-U', 'postgres'], check=True, capture_output=True)
    subprocess.run(prefix + ['pg_ctl', '-D', str(root / 'data'), '-l', str(root / 'server.log'), '-o', f'-k {root} -h "" -p {PORT}', 'start', '-w'], check=True, capture_output=True)
    atexit.register(lambda: subprocess.run(prefix + ['pg_ctl', '-D', str(root / 'data'), '-m', 'immediate', 'stop'], capture_output=True))
def sql(s, ok=True):
    r = subprocess.run(psql(), input=s.encode(), capture_output=True); r.stdout = r.stdout.decode(); r.stderr = r.stderr.decode()
    if ok:
        assert r.returncode == 0, r.stderr[-3000:]
        return r.stdout.strip()
    assert r.returncode != 0, 'expected failure, got success: ' + r.stdout[-500:]
    return r.stderr
def popen(s):
    return subprocess.Popen(psql(), stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
