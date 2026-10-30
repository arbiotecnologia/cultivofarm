"""Actual install transaction tests, no hosted connections."""
import json,sys,traceback
from pathlib import Path
import restore,assemble_install
import pins
H=Path(__file__).resolve().parent
results=[]
def run():
    r=restore.restore();assert not any(r.values()),r
    assemble_install.build();sql=restore.pg.sql
    install=(H/'install.sql.review').read_text()
    baseline=json.loads((H/'capture/review-live.json').read_text())
    f=next(x for x in baseline['functions'] if x['name']=='rpc_estoque_reservar_v1')
    sql(f['body'].rstrip().rstrip(';').replace('BEGIN','BEGIN\n PERFORM 1;',1)+';')
    e=sql(install,False);assert 'DELIVERY_PRE_FUNCTION_DRIFT' in e,e
    sql(assemble_install.statement(f['body']))
    results.append({'test':'real body drift aborts PRE before DDL','status':'PASS'})
    sql('GRANT EXECUTE ON FUNCTION public.rpc_estoque_reservar_v1(uuid,text,jsonb,text,jsonb) TO anon;')
    e=sql(install,False);assert 'DELIVERY_PRE_FUNCTION_DRIFT' in e,e
    sql('REVOKE EXECUTE ON FUNCTION public.rpc_estoque_reservar_v1(uuid,text,jsonb,text,jsonb) FROM anon;')
    results.append({'test':'real ACL drift aborts PRE before DDL','status':'PASS'})
    e=sql(install.replace('COMMIT;',"DO $$ BEGIN RAISE EXCEPTION 'LOCAL_POST_FAIL'; END $$; COMMIT;"),False)
    assert 'LOCAL_POST_FAIL' in e,e
    assert sql("SELECT to_regclass('platform_private.delivery_requests_20261030') IS NULL")=='t'
    results.append({'test':'POST failure rolls back real DDL','status':'PASS'})
    sql(install)
    if not (H/'capture/post-expected.json').exists():
        (H/'capture/post-expected.json').write_text(json.dumps(pins.capture_post(sql),indent=2)+'\n')
        # Next fresh run exercises the generated exact POST, not only its capture.
        results.append({'test':'captured exact post baseline; rerun test required','status':'BLOCKED'})
        return
    results.append({'test':'full installation COMMIT and exact postflight','status':'PASS'})
    for x in [x for x in baseline['functions'] if x['name']=='rpc_estoque_reservar_v1']:
        assert json.loads(sql('SELECT '+pins.function_expr(x['schema'],x['name'])+';'))==[{'signature':x['signature'],'body':x['body'],'acl':x['acl'],'owner':x['owner']}]
    results.append({'test':'independent batch body owner ACL unchanged','status':'PASS'})
    # Actual immutable history survives deny rollback, even with all client entrypoints closed.
    sql("INSERT INTO platform_private.delivery_requests_20261030(request_key,actor,organization_id,action,fingerprint,result) VALUES('history-proof','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','group','proof','{}');")
    e=sql(install,False);assert 'DELIVERY_ALREADY_INSTALLED' in e,e
    results.append({'test':'rerun denied','status':'PASS'})
    sql((H/'rollback.sql.review').read_text())
    assert 'DELIVERY_ROLLBACK_CLOSED' in sql("SELECT public.rpc_entrega_cancelar_v1(NULL,NULL,NULL);",False)
    assert sql("SELECT count(*)=1 FROM platform_private.delivery_requests_20261030 WHERE request_key='history-proof'")=='t'
    results.append({'test':'deny-only rollback retains tables and history','status':'PASS'})
if __name__=='__main__':
    try:run()
    except Exception:results.append({'test':'installer execution','status':'FAIL','error':traceback.format_exc()});traceback.print_exc()
    (H/'install-results.json').write_text(json.dumps(results,indent=2)+'\n');print(json.dumps(results,indent=2))
    sys.exit(1 if any(x['status']!='PASS' for x in results) else 0)