"""Full-command POST failures, disposable PostgreSQL only; no function slicing."""
import importlib.util
import re
spec = importlib.util.spec_from_file_location('receipt_assembly', V/'assemble.py')
assembly = importlib.util.module_from_spec(spec)
spec.loader.exec_module(assembly)

def catalog_state():
    return pg.sql("SELECT md5(string_agg(pg_get_functiondef(oid)||coalesce(proacl::text,'')||proowner::text,'|' ORDER BY oid)) FROM pg_proc WHERE pronamespace IN ('public'::regnamespace,'platform_private'::regnamespace)")

def full_command(name, fail=False):
    sql=(V/name).read_text()
    lines=list(assembly.external_lines(sql))
    controls=[line.strip().upper() for line,outside in lines if outside and assembly.DELIMITER.fullmatch(line)]
    assert controls==[('BEGIN READ ONLY;' if name in ('preflight.sql','postflight.sql') else 'BEGIN;'),'COMMIT;'],(name,controls)
    # Notices before every top-level DO and DDL checkpoint must have one xid.
    instrumented=[];checkpoints=0
    for line,outside in lines:
        if outside and (line.startswith('DO ') or line.startswith('CREATE OR REPLACE FUNCTION')):
            instrumented.append("DO $atomic_trace$ BEGIN RAISE NOTICE 'ATOMIC_XID:%',txid_current(); END $atomic_trace$;\n")
            checkpoints+=1
        if outside and line.strip()=='COMMIT;' and fail:
            # Fail after the actual POST checkpoints and all DDL, inside the same transaction.
            instrumented.append("DO $atomic_post_failure$ BEGIN RAISE EXCEPTION 'DELIBERATE_POST_FAILURE' USING ERRCODE='P0001'; END $atomic_post_failure$;\n")
        instrumented.append(line)
    before=catalog_state();p=pg.popen('');p.stdin.write(''.join(instrumented));p.stdin.close()
    out=p.stdout.read();err=p.stderr.read();p.wait(timeout=30)
    ids=re.findall(r'ATOMIC_XID:(\d+)',err)
    assert len(ids)==checkpoints and len(set(ids))==1,(name,ids,err[-1800:])
    assert ('no transaction in progress' not in err and 'already a transaction' not in err),err
    if fail:
        assert p.returncode!=0 and 'DELIBERATE_POST_FAILURE' in err,err
        assert catalog_state()==before,(name,'partial function/owner/ACL commit')
    else:
        assert p.returncode==0,err[-3000:]
    return before

gate=pg.sql("SELECT pg_get_functiondef('platform_private.c2_owner_order_create_allowed(uuid,uuid)'::regprocedure)")+'\n'
pg.sql("CREATE OR REPLACE FUNCTION platform_private.c2_owner_order_create_allowed(_uid uuid,_partner uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $function$ SELECT false; $function$;")
try:
    full_command('preflight.sql')
    ok('atomic preflight all checkpoints one real read-only transaction')
    full_command('candidate.sql.review',True)
    ok('atomic complete candidate deliberate POST failure preserves baseline hash owner ACL',pg.sql(f"SELECT md5(pg_get_functiondef('{sig}'::regprocedure))")==base_md5)
    full_command('candidate.sql.review')
    full_command('postflight.sql')
    ok('atomic candidate and postflight every checkpoint same real transaction')
    full_command('rollback.sql.review',True)
    ok('atomic complete rollback deliberate POST failure preserves new hash owner ACL',pg.sql(f"SELECT md5(pg_get_functiondef('{sig}'::regprocedure))")=='31eeb54e4b69d97c311629a37e553faf')
    full_command('containment.sql.review',True)
    ok('atomic complete containment deliberate POST failure preserves all function hashes owner ACL')
    full_command('rollback.sql.review')
    ok('atomic complete successful rollback restores baseline',pg.sql(f"SELECT md5(pg_get_functiondef('{sig}'::regprocedure))")==base_md5)
finally:
    pg.sql(gate) # local synthetic fixture restoration only