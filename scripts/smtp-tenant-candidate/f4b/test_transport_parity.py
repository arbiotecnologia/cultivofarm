"""Disposable PostgreSQL only (initdb in /tmp), no network. Proves the SQL invoker's v1 header expression
equals the Edge helper (base64url UTF-8, no padding) for SYNTHETIC ASCII/Unicode values. Prints only PASS/FAIL."""
import subprocess, tempfile, shutil, base64, re, os
from pathlib import Path

SRC = Path(__file__).parent / 'cron_option.sql.review'
expr = re.search(r"v_header:=(.+);\n", SRC.read_text()).group(1)
SYNTH = ["test-only-".ljust(48, "x"), "teste-sintético-ção-ñ-ü-€-日本語-🙂-".ljust(40, "z"), "a+/b?c>d~" * 6, "é" * 32]

def edge(v: str) -> str:
    return 'b64u1.' + base64.urlsafe_b64encode(v.encode('utf-8')).decode().rstrip('=')

t = Path(tempfile.mkdtemp(dir='/tmp', prefix='smtp-parity-')); t.chmod(0o777); ok = True
P = ['setpriv', '--reuid=1000', '--regid=1000', '--clear-groups'] if os.getuid() == 0 else []
try:
    subprocess.run(P + ['initdb', '-D', str(t/'d'), '-A', 'trust', '-U', 'postgres', '-E', 'UTF8'], check=True, capture_output=True)
    subprocess.run(P + ['pg_ctl', '-D', str(t/'d'), '-l', str(t/'l'), '-o', f'-k {t} -h "" -p 55497', 'start', '-w'], check=True, capture_output=True)
    for i, v in enumerate(SYNTH):
        lit = lambda s: "'" + s.replace("'", "''") + "'"
        stmt = f"SET search_path=''; SELECT (SELECT {expr.replace('v_secret', 'x.v')} FROM (SELECT {lit(v)}::text v) x) = {lit(edge(v))};"
        r = subprocess.run(['psql', '-h', str(t), '-p', '55497', '-U', 'postgres', '-At', '-c', stmt], capture_output=True, text=True)
        res = r.stdout.strip() == 't'
        if not res: print('dbg', r.returncode, r.stderr[:300])
        ok &= res
        print(f"{'PASS' if res else 'FAIL'} synthetic#{i} parity")
        raw_ok = edge(v) != v
        ok &= raw_ok
        print(f"{'PASS' if raw_ok else 'FAIL'} synthetic#{i} raw differs from transport")
        ascii_ok = re.fullmatch(r"b64u1\.[A-Za-z0-9_-]+", edge(v)) is not None
        ok &= ascii_ok
        print(f"{'PASS' if ascii_ok else 'FAIL'} synthetic#{i} header ASCII shape")
finally:
    subprocess.run(P + ['pg_ctl', '-D', str(t/'d'), '-m', 'immediate', 'stop'], capture_output=True)
    shutil.rmtree(t, ignore_errors=True)
print('PARITY', 'PASS' if ok else 'FAIL')
raise SystemExit(0 if ok else 1)
