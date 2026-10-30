"""Exact catalog restoration to a /tmp Unix-socket PostgreSQL; never hosted."""
import json, os, sys
from pathlib import Path
H = Path(__file__).resolve().parent
PG = Path('/nix/store/avg1rhq9w93k03qmdaklazcsapn45zpd-postgresql-17.9/bin')
os.environ['PATH'] = str(PG) + ':' + os.environ['PATH']
sys.path.insert(0, str(H.parent / 'arbio-fsf-incremental-20261029'))
import restore_stack
from restore_stack import pg

def metadata():
    old = restore_stack.merge_supplement(json.loads((H.parent/'arbio-fsf-incremental-20261029/capture/stack-metadata-2028.json').read_text()))
    current = json.loads((H/'capture/current.json').read_text())
    extra = json.loads((H/'capture/extra.json').read_text())
    for key, values in current.items():
        if key == 'policies':
            keep = [x for x in old[key] if x['schemaname'] not in {'public','platform_private','private','cf_user_guards_v1','auth'}]
        else:
            keep = [x for x in old[key] if x['schema'] not in {'public','platform_private','private','cf_user_guards_v1','auth'}]
        old[key] = keep + (values or [])
    old.update({k:extra[k] for k in ('schemas','enums','roles')})
    old['enums'] = [x for x in old['enums'] if x['schema'] in {s['name'] for s in old['schemas']}]
    old['constraints'] = [x for x in old['constraints'] if not x['definition'].startswith('TRIGGER')]
    supplement=json.loads((H/'capture/restore-supplement.json').read_text())
    for key,values in supplement.items():
        values=values or []
        if key=='functions':
            names={(x['schema'],x['name']) for x in values}
            old[key]=[x for x in old[key] if (x['schema'],x['name']) not in names]+values
        elif key=='sequences':
            names={(x['schema'],x['name']) for x in values}
            old[key]=[x for x in old[key] if (x['schema'],x['name']) not in names]+values
        else:
            old[key]=old.get(key,[])+values
    return old

def restore():
    j = metadata()
    result = restore_stack.restore(j)
    indexes_failed = []
    for x in json.loads((H/'capture/extra.json').read_text())['indexes']:
        try:
            # Constraints already created their indexes; preserve all independent indexes.
            present = pg.sql("SELECT to_regclass('%s.%s') IS NOT NULL" % (x['schema'], x['name']))
            if present != 't': pg.sql(x['definition']+';')
        except AssertionError as e: indexes_failed.append({'object':x['schema']+'.'+x['name'],'error':str(e)})
    result['indexes_failed'] = indexes_failed
    # Restore captured column privileges too: table ACL alone is not effective ACL.
    for t in json.loads((H/'capture/review-live.json').read_text())['table_pins']:
        for c in t['columns']:
            if not c['acl']:continue
            obj=restore_stack.q(t['schema'])+'.'+restore_stack.q(t['name'])
            for entry in c['acl'].strip('{}').split(','):
                role,rights=entry.split('=',1);rights=rights.split('/')[0]
                for code,priv in [('r','SELECT'),('a','INSERT'),('w','UPDATE'),('x','REFERENCES')]:
                    if code in rights:pg.sql(f'GRANT {priv} ({restore_stack.q(c["name"])}) ON {obj} TO {restore_stack.q(role) if role else "PUBLIC"};')
    (H/'restore-results.json').write_text(json.dumps(result,indent=2)+'\n')
    return result

if __name__ == '__main__':
    result = restore()
    print(json.dumps({k:len(v) for k,v in result.items()},indent=2))
    sys.exit(1 if any(result.values()) else 0)