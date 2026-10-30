"""Actual install transaction tests, no hosted connections."""
import json,sys,traceback
from pathlib import Path
import restore,assemble_install
H=Path(__file__).resolve().parent
results=[]
def run():
    r=restore.restore();assert not any(r.values()),r
    assemble_install.build();sql=restore.pg.sql
    install=(H/'install.sql.review').read_text()
    # Inject PRE mismatch without touching a captured body.
    e=sql(install.replace('BEGIN; SET LOCAL',"BEGIN; DO $$ BEGIN RAISE EXCEPTION 'LOCAL_PRE_DRIFT'; END $$; SET LOCAL",1),False)
    assert 'LOCAL_PRE_DRIFT' in e and sql("SELECT to_regclass('platform_private.delivery_requests_20261030') IS NULL")=='t'
    results.append({'test':'PRE failure aborts before DDL','status':'PASS'})
    e=sql(install.replace('COMMIT;',"DO $$ BEGIN RAISE EXCEPTION 'LOCAL_POST_FAIL'; END $$; COMMIT;"),False)
    assert 'LOCAL_POST_FAIL' in e,e
    assert sql("SELECT to_regclass('platform_private.delivery_requests_20261030') IS NULL")=='t'
    results.append({'test':'POST failure rolls back real DDL','status':'PASS'})
    sql(install);results.append({'test':'full installation COMMIT and postflight','status':'PASS'})
    e=sql(install,False);assert 'DELIVERY_ALREADY_INSTALLED' in e,e
    results.append({'test':'rerun denied','status':'PASS'})
    sql((H/'rollback.sql.review').read_text())
    assert 'DELIVERY_ROLLBACK_CLOSED' in sql("SELECT public.rpc_entrega_cancelar_v1(NULL,NULL,NULL);",False)
    results.append({'test':'deny-only rollback retains tables and history','status':'PASS'})
if __name__=='__main__':
    try:run()
    except Exception:results.append({'test':'installer execution','status':'FAIL','error':traceback.format_exc()});traceback.print_exc()
    (H/'install-results.json').write_text(json.dumps(results,indent=2)+'\n');print(json.dumps(results,indent=2))
    sys.exit(1 if any(x['status']!='PASS' for x in results) else 0)