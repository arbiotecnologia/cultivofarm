"""Real captured credit + real order chain, disposable PostgreSQL/synthetic Auth only."""
from pathlib import Path
import json,hashlib
N=Path(__file__).resolve().parent
H=N.parent/'internal-origin-composition-20261023'
source=(H/'test-local.py').read_text()
for name in ['preflight.sql','candidate.sql.review','postflight.sql','rollback.sql.review']:
    original=(H/name).read_text();rebased=(N/'origin-rebase'/name).read_text()
    assert original.count('3bcc92e68f80b86bc01db7b5e94ee4c6')==1
    assert original.replace('3bcc92e68f80b86bc01db7b5e94ee4c6','213ac31f3a30816ead75365b0d1fed18')==rebased,name
# Reuse captured setup, triggers and actual RPC scenarios; no substitute business functions.
prefix=source[:source.index('# Known numeric(6,2) blocker:')]
strict='''
def strict_denied(u,s,msg):
    claims=json.dumps({'sub':u,'role':'authenticated','iat':int(time.time())})
    err=pg.sql(f"\\set VERBOSITY verbose\nBEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims','{claims}',true); {s}; COMMIT;",ok=False)
    assert 'ERROR:  42501: '+msg in err,err[-1800:]
'''
prefix=prefix.replace("def snapshot():",strict+"def snapshot():",1)
for old_call,new_call in [
 ("actor(u,create(G,'denied-'+str(u),p,h=hashA)+';',err='')","strict_denied(u,create(G,'denied-'+str(u),p,h=hashA),{T:'forbidden_financial_terms'}.get(u,'forbidden_partner'))"),
 ("actor(u,f\"SELECT public.approve_partner_order('{orders[1]}',NULL,NULL);\",err='')","strict_denied(u,f\"SELECT public.approve_partner_order('{orders[1]}',NULL,NULL)\",'b2b_phase1_scope_denied')")]:
    assert prefix.count(old_call)==1,old_call; prefix=prefix.replace(old_call,new_call)

suffix=source[source.index('pg.sql(f"SET session_replication_role=replica; UPDATE public.partner_users SET revoked_at=now()'):]
revoked_old="actor(G,create(G,'revoked',h=hashA)+';',err='')"
assert suffix.count(revoked_old)==1
suffix=suffix.replace(revoked_old,"strict_denied(G,create(G,'revoked',h=hashA),'forbidden_financial_terms')")
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
env={'__file__':str(H/'test-local.py'),'__name__':'__main__','N':N,'hashlib':hashlib}
exec(compile(prefix,str(H/'test-local.py'),'exec'),env)
exec(compile((N/'credit-checks.py').read_text(),str(N/'credit-checks.py'),'exec'),env)
exec(compile(suffix,str(H/'test-local.py'),'exec'),env)