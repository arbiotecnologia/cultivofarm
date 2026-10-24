"""Real captured credit + real order chain, disposable PostgreSQL/synthetic Auth only."""
from pathlib import Path
import json,hashlib
N=Path(__file__).resolve().parent
H=N.parent/'internal-origin-composition-20261023'
source=(H/'test-local.py').read_text()
# Reuse captured setup, triggers and actual RPC scenarios; no substitute business functions.
prefix=source[:source.index('# Known numeric(6,2) blocker:')]
suffix=source[source.index('pg.sql(f"SET session_replication_role=replica; UPDATE public.partner_users SET revoked_at=now()'):]
suffix=suffix.replace("rollback=(H/'rollback.sql.review').read_text()","rollback=(N/'origin-rebase/rollback.sql.review').read_text()")
preprobe="""
pg.sql((N/'preflight.sql').read_text())
pg.sql((N/'candidate.sql.review').read_text())
pg.sql((N/'origin-rebase/preflight.sql').read_text())
ok('rebased origin PRE accepts exact numeric hash with writer false')
pg.sql((N/'rollback.sql.review').read_text())
pg.sql((N/'postflight-rollback.sql').read_text())
"""
prefix=prefix.replace("# Preflight must pass unchanged against containment before any candidate mutation.","# Preflight must pass unchanged against containment before any candidate mutation.\n"+preprobe)
env={'__file__':str(H/'test-local.py'),'__name__':'__main__','N':N}
exec(compile(prefix,str(H/'test-local.py'),'exec'),env)
exec(compile((N/'credit-checks.py').read_text(),str(N/'credit-checks.py'),'exec'),env)
exec(compile(suffix,str(H/'test-local.py'),'exec'),env)