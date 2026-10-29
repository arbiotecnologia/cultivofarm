"""Schema-only local restoration. Never connects to hosted PostgreSQL; no authority stubs."""
import json
import re
import sys
from pathlib import Path

H = Path(__file__).resolve().parent
sys.path.insert(0, str(H.parents[1] / 'scripts/contracts-c2-20261022/integral'))
import pg

def q(s):
    return '"' + s.replace('"', '""') + '"'

def name(x):
    return q(x['schema']) + '.' + q(x.get('table', x.get('name')))

def acl_sql(kind, obj, acl, owner):
    sql = f'ALTER {kind} {obj} OWNER TO {q(owner)};\n'
    sql += f'REVOKE ALL ON {kind} {obj} FROM PUBLIC;\n'
    if acl is None:
        if kind == 'FUNCTION': sql += f'GRANT EXECUTE ON FUNCTION {obj} TO PUBLIC;\n'
        return sql
    codes = {'r':'SELECT','a':'INSERT','w':'UPDATE','d':'DELETE','D':'TRUNCATE','x':'REFERENCES','t':'TRIGGER','X':'EXECUTE','U':'USAGE','C':'CREATE'}
    for entry in acl.strip('{}').split(','):
        role, rights = entry.split('=',1); rights = rights.split('/')[0]
        grants = [codes[c] for c in rights if c in codes]
        if grants: sql += f'GRANT {",".join(grants)} ON {kind} {obj} TO {q(role) if role else "PUBLIC"};\n'
    return sql

def restore(j):
    pg.start()
    assert pg.root.is_relative_to(Path('/tmp'))
    pg.sql('CREATE SCHEMA extensions; CREATE EXTENSION pgcrypto WITH SCHEMA extensions; CREATE EXTENSION "uuid-ossp" WITH SCHEMA extensions; CREATE EXTENSION btree_gist WITH SCHEMA extensions;')
    roles = set(x['name'] for x in j['roles']) | {'supabase_admin'}
    for x in j['relations'] + j['functions'] + j['schemas']:
        roles.add(x['owner'])
        if x.get('acl'):
            for ent in x['acl'].strip('{}').split(','):
                roles.add(ent.split('=')[0]); roles.add(ent.split('/')[-1])
    for p in j['policies']: roles.update(p['roles'])
    for r in sorted(roles - {'','postgres','pg_database_owner','public'}):
        pg.sql(f'CREATE ROLE {q(r)};')
    for x in j['roles']:
        if x['name']!='postgres': pg.sql(f'ALTER ROLE {q(x["name"])} {"BYPASSRLS" if x["bypassrls"] else "NOBYPASSRLS"};')
    for s in j['schemas']:
        if s['name'] not in ('public','extensions'): pg.sql(f'CREATE SCHEMA {q(s["name"])};')
        pg.sql(acl_sql('SCHEMA',q(s['name']),s['acl'],s['owner']))
    for e in j['enums']:
        pg.sql(f'CREATE TYPE {name(e)} AS ENUM (' + ','.join("'"+v.replace("'","''")+"'" for v in e['labels']) + ');')
    for s in j['sequences']: pg.sql(s['definition'])
    tables = [t for t in j['relations'] if t['kind']=='r']
    for t in tables:
        cols = [c for c in j['columns'] if c['schema']==t['schema'] and c['table']==t['name']]
        def col(c):
            extra = (' GENERATED ALWAYS AS ('+c['default']+') STORED' if c.get('generated') else ' GENERATED '+('ALWAYS' if c['identity']=='a' else 'BY DEFAULT')+' AS IDENTITY' if c.get('identity') else ' DEFAULT '+c['default'] if c['default'] else '')
            return q(c['name'])+' '+c['type']+extra+(' NOT NULL' if not c['nullable'] else '')
        pg.sql(f'CREATE TABLE {name(t)} (' + ','.join(col(c) for c in cols) + ');')
    # Dependency ordering is resolved by retrying exact bodies/views, never placeholder functions.
    pending = [('function',f) for f in j['functions']] + [('view',t) for t in j['relations'] if t['kind'] in ('v','m')]
    failures = {}
    while pending:
        remaining=[]
        for kind,x in pending:
            sql = x['body'] if kind=='function' else f'CREATE {"MATERIALIZED " if x["kind"]=="m" else ""}VIEW {name(x)} AS '+x['view']+';'
            try: pg.sql(sql)
            except AssertionError as e:
                remaining.append((kind,x)); failures[x.get('signature',name(x))]=str(e)
        if len(remaining)==len(pending): break
        pending=remaining
    # Only the subset closure is required, unrelated unresolved modules are explicitly reported.
    for t in tables:
        pg.sql(acl_sql('TABLE',name(t),t['acl'],t['owner']))
        pg.sql(f'ALTER TABLE {name(t)} {"ENABLE" if t["rls"] else "DISABLE"} ROW LEVEL SECURITY; ALTER TABLE {name(t)} {"FORCE" if t["force_rls"] else "NO FORCE"} ROW LEVEL SECURITY;')
    for f in j['functions']:
        if ('function',f) not in remaining: pg.sql(acl_sql('FUNCTION',f['signature'],f['acl'],f['owner']))
    required = json.loads((H/'capture/production-metadata.json').read_text())
    dependencies = json.loads((H/'capture/production-dependencies.json').read_text())
    wanted = {'public.'+r['name'] for r in required['relations']}
    constraints_failed=[]
    for c in sorted(j['constraints'],key=lambda x:x['type']=='f'):
        try: pg.sql(f'ALTER TABLE {name(c)} ADD CONSTRAINT {q(c["name"])} '+c['definition']+';')
        except AssertionError as e: constraints_failed.append({'object':name(c)+'.'+c['name'],'error':str(e)})
    policies_failed=[]
    for p in j['policies']:
        obj=q(p['schemaname'])+'.'+q(p['tablename'])
        sql=f'CREATE POLICY {q(p["policyname"])} ON {obj} AS {p["permissive"]} FOR {p["cmd"]} TO '+','.join(q(r) if r!='public' else 'PUBLIC' for r in p['roles'])
        if p['qual']: sql+=' USING ('+p['qual']+')'
        if p['with_check']: sql+=' WITH CHECK ('+p['with_check']+')'
        try: pg.sql(sql+';')
        except AssertionError as e: policies_failed.append({'object':obj+'.'+p['policyname'],'error':str(e)})
    triggers_failed=[]
    for t in j['triggers']:
        try:
            pg.sql(t['definition']+';')
            mode={'D':'DISABLE','O':'ENABLE','R':'ENABLE REPLICA','A':'ENABLE ALWAYS'}[t['enabled']]
            pg.sql(f'ALTER TABLE {name(t)} {mode} TRIGGER {q(t["name"])};')
        except AssertionError as e: triggers_failed.append({'object':name(t)+'.'+t['name'],'error':str(e)})
    return {'unrestored_functions_views':[{'object':x.get('signature',name(x)),'error':failures[x.get('signature',name(x))]} for _,x in remaining], 'constraints_failed':constraints_failed,'policies_failed':policies_failed,'triggers_failed':triggers_failed}

if __name__=='__main__':
    j=json.loads(Path(sys.argv[1]).read_text())
    try:
        result=restore(j)
        result['preflight']='NOT RUN'
        try: pg.sql((H/'preflight.sql.readonly').read_text()); result['preflight']='PASS'
        except AssertionError as e: result['preflight']='FAIL'; result['preflight_error']=str(e)
    except Exception as e:
        result={'restoration':'BLOCKED','error':str(e)}
    Path(sys.argv[2]).write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps({k:len(v) if isinstance(v,list) else v for k,v in result.items()},indent=2))