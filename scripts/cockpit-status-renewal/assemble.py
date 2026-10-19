"""Offline assembler. No hosted access. Source digest comes from canonical SELECT."""
from pathlib import Path
import hashlib, json, re
ROOT = Path(__file__).resolve().parent
SIG = 'public.rpc_cockpit_listar_esteira_v1(text,text[],text[],text[],boolean,date,date,boolean,integer,integer)'
archive = (ROOT.parent/'rbac-audit/proposed-cockpit-live-source-closed.sql').read_text()
pre = re.search(r'CREATE OR REPLACE FUNCTION public.rpc_cockpit_listar_esteira_v1.*?\$function\$;', archive, re.S)[0]
source = pre.split('AS $function$')[1].removesuffix('$function$;')
assert hashlib.md5(source.encode()).hexdigest() == '7d56fc8280126fa2e227f7b38f83c5ea'
expression = "CASE WHEN v.status_os IN ('aberta','aprovada') THEN v.status_os ELSE v.status_esteira_oficial END"
post = pre.replace('v.status_os,v.status_esteira_oficial,public.fn_cockpit_stage(v.status_esteira_oficial) stage', f'v.status_os,{expression} status_esteira_oficial,public.fn_cockpit_stage({expression}) stage').replace('public.fn_cockpit_stage(v.status_esteira_oficial)=ANY(p_stages)', f'public.fn_cockpit_stage({expression})=ANY(p_stages)')
postsource = post.split('AS $function$')[1].removesuffix('$function$;')
PRE = hashlib.md5(source.encode()).hexdigest()
POST = hashlib.md5(postsource.encode()).hexdigest()
def guard(expected):
    return f'''DO $guard$ BEGIN
 IF (SELECT project_ref FROM public.fiscal_environment_marker LIMIT 1) IS DISTINCT FROM 'swzpzcwiasxmjutrmvkm' THEN RAISE EXCEPTION 'WRONG_PROJECT'; END IF;
 IF (SELECT md5(prosrc) FROM pg_proc WHERE oid='{SIG}'::regprocedure) IS DISTINCT FROM '{expected}' THEN RAISE EXCEPTION 'READER_SOURCE_DRIFT'; END IF;
 IF EXISTS(SELECT 1 FROM pg_proc WHERE oid='{SIG}'::regprocedure AND (prosecdef OR pg_get_userbyid(proowner)<>'postgres' OR proacl::text IS DISTINCT FROM '{{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}}' OR proconfig IS DISTINCT FROM ARRAY['search_path=""'])) THEN RAISE EXCEPTION 'READER_SECURITY_DRIFT'; END IF;
 IF md5(pg_get_functiondef('private.h7n_esteira_laboratorio()'::regprocedure)) IS DISTINCT FROM 'bad38b5200629cc887767e62b7a46e40' OR md5(pg_get_functiondef('public.fn_cockpit_stage(text)'::regprocedure)) IS DISTINCT FROM '1f49fef3faeb479dcc92ed46391ab877' THEN RAISE EXCEPTION 'CHAIN_BODY_DRIFT'; END IF;
 IF md5(pg_get_viewdef('public.vw_esteira_laboratorio'::regclass,true)) IS DISTINCT FROM 'd72d5df7bacffdf8f4fc4282b804ab90' OR md5(pg_get_viewdef('public._src_vw_esteira_laboratorio'::regclass,true)) IS DISTINCT FROM 'c71226f594d27d92833686212415ccec' OR md5(pg_get_viewdef('public.vw_os_integridade_esteira'::regclass,true)) IS DISTINCT FROM 'e8331dbe2bc538cf21fad123fb43f19b' THEN RAISE EXCEPTION 'VIEW_CHAIN_DRIFT'; END IF;
END $guard$;
'''
snapshot = '''CREATE TEMP TABLE cockpit_status_functions ON COMMIT DROP AS SELECT oid,proacl,proowner,proconfig,prosecdef,md5(pg_get_functiondef(oid)) body FROM pg_proc WHERE prokind IN ('f','p') AND pronamespace IN ('public'::regnamespace,'private'::regnamespace,'platform_private'::regnamespace);
CREATE TEMP TABLE cockpit_status_relations ON COMMIT DROP AS SELECT oid,relacl,relowner,reloptions,relrowsecurity,relforcerowsecurity FROM pg_class WHERE relnamespace='public'::regnamespace;
CREATE TEMP TABLE cockpit_status_policies ON COMMIT DROP AS SELECT oid,md5(row_to_json(p)::text) body FROM pg_policy p;
'''
unchanged = f'''DO $unchanged$ BEGIN
 IF EXISTS(SELECT 1 FROM cockpit_status_functions b LEFT JOIN pg_proc p ON p.oid=b.oid WHERE p.oid IS NULL OR p.proacl IS DISTINCT FROM b.proacl OR p.proowner IS DISTINCT FROM b.proowner OR p.proconfig IS DISTINCT FROM b.proconfig OR p.prosecdef IS DISTINCT FROM b.prosecdef OR (p.oid<>'{SIG}'::regprocedure AND md5(pg_get_functiondef(p.oid)) IS DISTINCT FROM b.body)) THEN RAISE EXCEPTION 'FUNCTION_SECURITY_OR_BODY_CHANGED'; END IF;
 IF EXISTS(SELECT 1 FROM cockpit_status_relations b LEFT JOIN pg_class c ON c.oid=b.oid WHERE c.oid IS NULL OR c.relacl IS DISTINCT FROM b.relacl OR c.relowner IS DISTINCT FROM b.relowner OR c.reloptions IS DISTINCT FROM b.reloptions OR c.relrowsecurity IS DISTINCT FROM b.relrowsecurity OR c.relforcerowsecurity IS DISTINCT FROM b.relforcerowsecurity) THEN RAISE EXCEPTION 'RELATION_SECURITY_CHANGED'; END IF;
 IF EXISTS(SELECT 1 FROM cockpit_status_policies b FULL JOIN pg_policy p ON p.oid=b.oid WHERE b.oid IS NULL OR p.oid IS NULL OR md5(row_to_json(p)::text) IS DISTINCT FROM b.body) THEN RAISE EXCEPTION 'POLICIES_CHANGED'; END IF;
END $unchanged$;
'''
(ROOT/'rollback').mkdir(exist_ok=True)
(ROOT/'rollback/reader.sql.review').write_text(pre+'\n')
(ROOT/'reader.sql.review').write_text(post+'\n')
(ROOT/'candidate.sql.review').write_text('BEGIN;\n'+guard(PRE)+snapshot+post+'\n'+guard(POST)+unchanged+'COMMIT;\n')
(ROOT/'rollback.sql.review').write_text('BEGIN;\n'+guard(POST)+snapshot+pre+'\n'+guard(PRE)+unchanged+'COMMIT;\n')
for name, expected in [('preflight-readonly.sql',PRE),('postflight-readonly.sql',POST)]:
    (ROOT/name).write_text('BEGIN READ ONLY;\n'+guard(expected)+f"SELECT '{expected}' AS expected_source_md5;\nCOMMIT;\n")
(ROOT/'manifest.json').write_text(json.dumps({'project_ref':'swzpzcwiasxmjutrmvkm','signature':SIG,'pre_source_md5':PRE,'post_source_md5':POST,'hosted_executed':False,'files':{str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(ROOT.rglob('*')) if p.is_file() and p.name not in ('manifest.json','SHA256SUMS')}},indent=2)+'\n')
print('PRE source',PRE,'POST source',POST)