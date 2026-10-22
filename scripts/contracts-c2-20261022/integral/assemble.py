"""Assembles ONE installable transaction (C2 coordinated + paired multiprofile finance)
and ONE integral deny-only rollback. Post-C2 baseline hashes required by the finance
variant are computed on the faithful disposable replica (never guessed) and asserted
in-transaction; hosted install must still run preflight first. Never executed hosted."""
import json, re, sys, hashlib
from pathlib import Path
import pg
H = Path(__file__).resolve().parent
C2 = H.parent / 'coordinated'
FIN = H.parents[1] / 'partner-own-finance-20261022'
def body(path, header_lines_to_drop=()):
    s = path.read_text()
    assert s.count('BEGIN;') >= 1 and s.count('COMMIT;') == 1, (path, s.count('COMMIT;'))
    s = s[s.index('BEGIN;') + len('BEGIN;'):]
    s = re.sub(r'\s*COMMIT;\s*$', '\n', s)
    assert 'COMMIT;' not in s
    return s
c2 = body(C2 / 'candidate.sql.review')
fin = body(FIN / 'multiprofile' / 'candidate.sql.review')
blocker = "DO $$ BEGIN RAISE EXCEPTION 'c2_finance_baseline_not_certified' USING ERRCODE='55000'; END $$;"
assert fin.count(blocker) == 1
fin = fin.replace(blocker, '__POST_C2_GUARD__')
SIGS = ['platform_private.b2b_commercial_partner_projection()', 'platform_private.b2b_commercial_context()', 'public.is_valid_b2b_partner_user(uuid,uuid)']
def post_c2_baseline():
    pg.start(); pg.sql(open(H / 'replica.sql', newline='').read())
    pg.sql('BEGIN;' + c2 + 'COMMIT;')
    return {s: pg.sql(f"SELECT md5(pg_get_functiondef('{s}'::regprocedure))||'|'||coalesce(proacl::text,'')||'|'||pg_get_userbyid(proowner) FROM pg_proc WHERE oid='{s}'::regprocedure") for s in SIGS}
if __name__ == '__main__':
    base = post_c2_baseline()
    (H / 'post-c2-baseline.json').write_text(json.dumps(base, indent=1, sort_keys=True) + '\n')
    checks = '\n'.join(
        f"IF (SELECT md5(pg_get_functiondef('{s}'::regprocedure))||'|'||coalesce(proacl::text,'')||'|'||pg_get_userbyid(proowner) FROM pg_proc WHERE oid='{s}'::regprocedure) IS DISTINCT FROM '{v}' THEN RAISE EXCEPTION 'c2_finance_post_c2_drift' USING ERRCODE='55000'; END IF;"
        for s, v in sorted(base.items()))
    guard = "-- Post-C2 in-transaction baseline (computed on faithful replica, see post-c2-baseline.json)\nDO $$ BEGIN\n" + checks + "\nEND $$;"
    install = ("-- INTEGRAL INSTALLABLE CANDIDATE (C2 coordinated + paired own-finance). REVIEW ONLY; NOT APPLIED.\n"
               "-- Requires canonical ref swzpzcwiasxmjutrmvkm, fresh preflight and independent approval.\n"
               "BEGIN;" + c2 + "\n-- ===== paired own-finance (multiprofile variant) =====\n" + fin.replace('__POST_C2_GUARD__', guard) + "\nCOMMIT;\n")
    assert install.count('COMMIT;') == 1 and install.count('\nBEGIN;') + install.startswith('BEGIN;') <= 1
    (H / 'install.sql.review').write_text(install)
    rb = ("-- INTEGRAL DENY-ONLY ROLLBACK (finance deny + C2 deny). No data/history deletion, no legacy restore.\nBEGIN;"
          + body(FIN / 'rollback.sql.review') + body(C2 / 'rollbackdeny.sql.review') + "COMMIT;\n")
    assert rb.count('COMMIT;') == 1
    (H / 'rollback.sql.review').write_text(rb)
    for f in ['install.sql.review', 'rollback.sql.review', 'replica.sql', 'post-c2-baseline.json']:
        print(f, hashlib.sha256((H / f).read_bytes()).hexdigest())
