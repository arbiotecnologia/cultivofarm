"""Replica fidelity: every captured function md5 and the candidate's own 16-relation
structural guard must match the hosted capture before any candidate runs."""
import json, sys
from pathlib import Path
import pg
H = Path(__file__).resolve().parent
def load():
    pg.start(); pg.sql(open(H / 'replica.sql', newline='').read())
    cap = json.loads((H / 'hosted-capture.json').read_text())
    auth = json.loads((H / 'hosted-capture-auth.json').read_text())
    bad = []
    allf = cap['fns'] + (auth['fns'] or []) + json.loads((H / 'hosted-capture-extra.json').read_text())
    for f in allf:
        got = pg.sql(f"SELECT md5(pg_get_functiondef('{f['sig']}'::regprocedure))||'|'||coalesce(proacl::text,'')||'|'||pg_get_userbyid(proowner) FROM pg_proc WHERE oid='{f['sig']}'::regprocedure")
        if got != f"{f['md5']}|{f['acl'] or ''}|{f['owner']}": bad.append((f['sig'], got))
    return len(allf), bad
if __name__ == '__main__':
    n, bad = load(); print('functions', n, 'mismatch', len(bad)); [print(b) for b in bad[:10]]
    want = dict(l.split('=') for l in (H/'hosted-fingerprints-named.txt').read_text().split())
    got = dict(l.split('=') for l in pg.sql((H/'fingerprint-named.sql').read_text()).split())
    drift = sorted(k for k in want if want[k] != got.get(k)); print('relations', len(want), 'drift', drift)
    cand = (H.parent / 'coordinated' / 'candidate.sql.review').read_text()
    guard = cand[cand.index('DO $$ BEGIN IF EXISTS(WITH expected'):]; guard = guard[:guard.index('END $$;') + 7]
    r = __import__("subprocess").run(pg.psql(), input=guard, text=True, capture_output=True); print("structural guard:", "PASS" if r.returncode == 0 else r.stderr[-400:])
def diff(sig):
    import difflib
    allf = {f['sig']: f for f in json.loads((H/'hosted-capture.json').read_text())['fns'] + json.loads((H/'hosted-capture-extra.json').read_text())}
    loc = pg.sql(f"SELECT pg_get_functiondef('{sig}'::regprocedure)")
    print(allf[sig]['acl'], allf[sig]['owner'])
    print(''.join(list(difflib.unified_diff(allf[sig]['def'].splitlines(1), (loc+'\n').splitlines(1)))[:30]))
