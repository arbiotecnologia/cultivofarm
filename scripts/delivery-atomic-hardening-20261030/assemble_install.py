"""Inactive transactional installation, exact captured pins and closed entrypoints."""
import json,hashlib
from pathlib import Path
import build_motor
H=Path(__file__).resolve().parent
def lit(s):return "'"+s.replace("'","''")+"'"
def statement(s):return s.rstrip().rstrip(';')+';\n'
def build():
    build_motor.build()
    j=json.loads((H/'capture/review-live.json').read_text())
    graph=json.loads((H/'callgraph.json').read_text())
    funcs=[x for x in j['functions'] if x['name'] in graph['roots']]
    pre=[]
    for f in funcs:
        assert hashlib.md5(f['body'].encode()).hexdigest()==f['md5']
        pre.append(f"IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname={lit(f['schema'])} AND p.proname={lit(f['name'])} AND format('%I.%I(%s)',n.nspname,p.proname,pg_get_function_identity_arguments(p.oid))={lit(f['signature'])} AND md5(pg_get_functiondef(p.oid))={lit(f['md5'])} AND pg_get_userbyid(p.proowner)={lit(f['owner'])} AND p.proacl::text IS NOT DISTINCT FROM {lit(f['acl']) if f['acl'] is not None else 'NULL'}) THEN RAISE EXCEPTION 'DELIVERY_PRE_FUNCTION_DRIFT: %',{lit(f['signature'])}; END IF;")
    for x in j['indexes']:
        if x['table'] not in graph['destinations']:continue
        pre.append(f"IF pg_get_indexdef(to_regclass({lit(x['schema']+'.'+x['name'])})) IS DISTINCT FROM {lit(x['definition'])} THEN RAISE EXCEPTION 'DELIVERY_PRE_INDEX_DRIFT: %',{lit(x['name'])}; END IF;")
    for x in j['triggers']:
        if x['table'] not in graph['destinations']:continue
        pre.append(f"IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=to_regclass({lit(x['schema']+'.'+x['table'])}) AND tgname={lit(x['name'])} AND pg_get_triggerdef(oid)={lit(x['definition'])} AND tgenabled={lit(x['enabled'])}) THEN RAISE EXCEPTION 'DELIVERY_PRE_TRIGGER_DRIFT: %',{lit(x['name'])}; END IF;")
    import pins
    pre.extend(pins.table_checks(j,graph))
    pre.extend(pins.policy_checks(graph))
    pre.insert(0,"IF to_regclass('platform_private.delivery_requests_20261030') IS NOT NULL THEN RAISE EXCEPTION 'DELIVERY_ALREADY_INSTALLED'; END IF;")
    p='DO $pre$ BEGIN\n'+'\n'.join(pre)+'\nEND $pre$;\n'
    (H/'preflight.sql.review').write_text(p)
    candidate=statement((H/'candidate.sql.review').read_text());motor=statement((H/'motor-delta.sql.review').read_text())
    post="""DO $post$ BEGIN
 IF to_regclass('platform_private.delivery_requests_20261030') IS NULL OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='a00_delivery_order_transition_closed' AND tgenabled='O') THEN RAISE EXCEPTION 'DELIVERY_POST_MISSING'; END IF;
 IF has_function_privilege('authenticated','public.rpc_entrega_cancelar_v1(uuid,text,timestamptz)','EXECUTE') OR has_function_privilege('anon','public.rpc_entrega_cancelar_v1(uuid,text,timestamptz)','EXECUTE') THEN RAISE EXCEPTION 'DELIVERY_POST_ACL_OPEN'; END IF;
END $post$;
"""
    if (H/'capture/post-expected.json').exists():
        post=pins.post_checks(json.loads((H/'capture/post-expected.json').read_text()))
    (H/'postflight.sql.review').write_text(post)
    (H/'install.sql.review').write_text('-- INACTIVE. NO OPERATIONAL RELEASE.\nBEGIN; SET LOCAL lock_timeout=\'3s\'; SET LOCAL statement_timeout=\'30s\';\n'+p+candidate+'\n'+motor+'\n'+post+'COMMIT;\n')
    rollback="""BEGIN;
REVOKE ALL ON FUNCTION public.rpc_cockpit_criar_entrega_v1(uuid,text,jsonb,text,jsonb,timestamptz),public.rpc_entrega_cancelar_v1(uuid,text,timestamptz),public.rpc_entrega_cancelar_v1(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.rpc_entrega_cancelar_v1(p_entrega_id uuid,p_motivo text,p_observed timestamptz) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$BEGIN RAISE EXCEPTION 'DELIVERY_ROLLBACK_CLOSED' USING ERRCODE='42501';END$$;
COMMIT;
"""
    (H/'rollback.sql.review').write_text(rollback)
if __name__=='__main__':build()