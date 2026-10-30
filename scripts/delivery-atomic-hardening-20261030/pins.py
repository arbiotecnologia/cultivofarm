"""Exact catalog expressions shared by assembly and disposable post-baseline capture."""
import json
from pathlib import Path
H=Path(__file__).resolve().parent
def lit(s):return "'"+s.replace("'","''")+"'"
def table_expr(schema,name):
    return """(SELECT jsonb_build_object('schema',n.nspname,'name',c.relname,'acl',c.relacl::text,'owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,'columns',(SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'notnull',a.attnotnull,'acl',a.attacl::text,'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped)) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.oid=to_regclass(%s))"""%lit(schema+'.'+name)
def assertion(expr,expected,label):
    return f"IF {expr} IS DISTINCT FROM {lit(json.dumps(expected))}::jsonb THEN RAISE EXCEPTION '{label}'; END IF;"
def involved(j,graph):
    import re
    names=set(graph['destinations'])|{'cf_user_guards_v1.state','state','organizations','profiles','user_roles','partner_users','ordens_servico','clientes','lotes'}
    for f in j['functions']:
        if f['name'] in graph['roots']:
            names.update(re.findall(r'(?:FROM|JOIN)\s+(?:public|platform_private|cf_user_guards_v1)\.([\w]+)',f['body'],re.I))
    return [x for x in j['table_pins'] if x['name'] in names]
def table_checks(j,graph):
    return [assertion(table_expr(x['schema'],x['name']),x,'DELIVERY_PRE_TABLE_DRIFT: '+x['schema']+'.'+x['name']) for x in involved(j,graph)]
def policy_expr(schema,name):
    return """(SELECT coalesce(jsonb_agg(jsonb_build_object('cmd',cmd,'qual',qual,'roles',roles,'tablename',tablename,'permissive',permissive,'policyname',policyname,'schemaname',schemaname,'with_check',with_check) ORDER BY policyname),'[]'::jsonb) FROM pg_policies WHERE schemaname=%s AND tablename=%s)"""%(lit(schema),lit(name))
def policy_checks(graph):
    j=json.loads((H/'capture/review-live.json').read_text());pol=json.loads((H/'capture/current.json').read_text())['policies']
    return [assertion(policy_expr(x['schema'],x['name']),sorted([p for p in pol if p['schemaname']==x['schema'] and p['tablename']==x['name']],key=lambda p:p['policyname']),'DELIVERY_PRE_POLICY_DRIFT: '+x['schema']+'.'+x['name']) for x in involved(j,graph)]
def function_expr(schema,name):
    return """(SELECT coalesce(jsonb_agg(jsonb_build_object('signature',format('%%I.%%I(%%s)',n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)),'body',pg_get_functiondef(p.oid),'acl',p.proacl::text,'owner',pg_get_userbyid(p.proowner)) ORDER BY pg_get_function_identity_arguments(p.oid)),'[]'::jsonb) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=%s AND p.proname=%s)"""%(lit(schema),lit(name))
def capture_post(sql):
    j=json.loads((H/'capture/review-live.json').read_text());g=json.loads((H/'callgraph.json').read_text())
    names={(f['schema'],f['name']) for f in j['functions'] if f['name'] in g['roots']}
    import re
    names.update(re.findall(r'CREATE (?:OR REPLACE )?FUNCTION ([\w]+)\.([\w]+)',(H/'candidate.sql.review').read_text()))
    expressions=[function_expr(s,n) for s,n in sorted(names)]
    tables=involved(j,g)+[{'schema':'platform_private','name':n} for n in ['delivery_requests_20261030','delivery_context_20261030']]
    expressions += [table_expr(x['schema'],x['name']) for x in tables]
    expressions += [policy_expr(x['schema'],x['name']) for x in tables]
    # Exact triggers/indexes include original stack and all newly installed barriers.
    for x in tables:
        obj=lit(x['schema']+'.'+x['name'])
        expressions.append(f"(SELECT coalesce(jsonb_agg(jsonb_build_object('name',tgname,'definition',pg_get_triggerdef(oid),'enabled',tgenabled) ORDER BY tgname),'[]'::jsonb) FROM pg_trigger WHERE tgrelid=to_regclass({obj}) AND NOT tgisinternal)")
        expressions.append(f"(SELECT coalesce(jsonb_agg(indexdef ORDER BY indexname),'[]'::jsonb) FROM pg_indexes WHERE schemaname={lit(x['schema'])} AND tablename={lit(x['name'])})")
    return [{'expression':e,'expected':json.loads(sql('SELECT '+e+';'))} for e in expressions]
def post_checks(expected):
    return 'DO $post$ BEGIN\n'+'\n'.join(assertion(x['expression'],x['expected'],'DELIVERY_POST_DRIFT: '+str(i)) for i,x in enumerate(expected))+'\nEND $post$;\n'