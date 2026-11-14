import json
from pathlib import Path
p=Path('/dev-server/scripts/responsive-layout-116/focused')
x=json.loads((p/'final.json').read_text())
assert not x['errors'],x['errors']
assert len(x['records'])==40
for r in x['records']:
 for group in r['metrics']:
  children=group['children']
  if r['kind']=='config':
   for c in children:
    assert c['sw']<=c['cw']+1,c
    assert c['sh']<=c['ch']+1,c
  else:
   for a,b in zip(children,children[1:]):
    assert a['rect']['right']<=b['rect']['left']+1,(r,a,b)
print('40 cenários: abas sem sobreposição e tipos de cadastro sem clipping; zero pageerrors')
