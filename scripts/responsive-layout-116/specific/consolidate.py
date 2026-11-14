import json,glob,hashlib,subprocess
from pathlib import Path
R=Path('/dev-server/scripts/responsive-layout-116');S=R/'specific'
old=json.loads((S/'MATRIX-before-specific.json').read_text());drivers=json.loads((S/'drivers.json').read_text());rows=[r for f in sorted(S.glob('driver-*.json')) for r in json.loads(f.read_text())]
na={10,40,61,62,63,64,65,66,67};items=[]
for x in old['items']:
 i=x['id'];rr=[r for r in rows if i in r['ids']];ds=[d for d in drivers if i in d['ids']];prev=[r for r in x['isolated'] if r['status'].startswith('MOUNTED')];pos=[r for r in rr if r['result'].startswith('PASS')]
 status='N_A_CURRENT_CLOSED_OR_RETIRED_CONTEXTUAL_ASSERTION' if i in na and pos else 'CONTEXTUAL_ASSERTED_NOT_ALL_PROFILES_CERTIFIED' if pos else 'PRIOR_MOUNT_GEOMETRY_ONLY' if prev else 'OPEN_GAP'
 scenarios=[]
 for r in rr:
  scenarios.append({'profile':r['profile'],'viewport':r['viewport'],'type':r['validation'],'result':r['result'],'assertion_record':f'specific/driver-{r["ids"][0]}.json','evidence':r['artifacts'],'exception':r.get('classification'),'gap':r.get('error')})
 gap=None
 if status=='OPEN_GAP':gap='Estado/entrada normal ainda não comprovado; não classificado N/A nem aprovado.'
 if i==110:gap='Histórico produtor não montou o filtro de fazenda; pré-requisito/fixture não resolvido.'
 items.append({'id':i,'file':x['file'],'line':x['line'],'control':x['tag'],'routes':list(dict.fromkeys(x.get('route_candidates',[])+[r['route'] for r in rr])),'trigger':ds[0]['trigger'] if ds else 'Inspeção AST candidata: specific/ast-triggers.json; entrada normal ainda não comprovada','profiles_tested':sorted({r['profile'] for r in rr}),'profiles_route_candidates':sorted({r['profile'] for r in x['isolated']}),'profile_eligibility':'Route unions are not action authority; contextual drivers cover listed roles only; remaining eligible comparisons NOT_RUN','viewports':[list(v) for v in sorted({tuple(r['viewport']) for r in rr})],'result':status,'corrections':(['Título da fazenda sem truncamento'] if i==111 else ['Título PDF com quebra; corpo flexível e ações preservadas'] if i==115 else []),'visual_review':['specific/specific-111-cliente_produtor-390.png'] if i==111 else ['specific/specific-115-parceiro_b2b-390.png'] if i==115 else [],'scenarios':scenarios,'prior_checkpoint':f'isolated/{i:03}.json','prior_mounted_scenarios':len(prev),'gap':gap})
counts={s:sum(x['result']==s for x in items) for s in sorted({x['result'] for x in items})};assert sum(counts.values())==116
summary={'ids':116,'by_id':counts,'contextual_scenarios':len(rows),'assertion_pass':sum(r['result'].startswith('PASS') for r in rows),'scenario_gaps':sum(not r['result'].startswith('PASS') for r in rows),'old_route_profiles':15,'old_route_scenarios':30,'new_real_route_scenarios':len(json.loads((S/'routes.json').read_text())),'all_profiles_complete_ids':0,'note':'94 IDs have some mount evidence, 9 closed/retired IDs, 13 open gaps. Mount evidence is NOT full approval.'}
m={'baseline':'1d8111524c13e190ace5a7166117e5d094f21931','revision_observed':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'source_sha256':hashlib.sha256(Path('/dev-server/scripts/responsive-layout-20261114/static-candidates.json').read_bytes()).hexdigest(),'scope':'Local synthetic read-only; no production, SQL or publish; no JWT/RLS/Storage certification','summary':summary,'prior_matrix':'specific/MATRIX-before-specific.json','real_routes':'specific/routes.json','items':items}
assert [x['id'] for x in items]==list(range(1,117))
for x in items:
 for r in x['scenarios']:
  for p in r['evidence']:assert (R/p).exists(),p
(R/'MATRIX.json').write_text(json.dumps(m,ensure_ascii=False,separators=(',',':')))
(S/'SUMMARY.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2));print(json.dumps(summary,ensure_ascii=False,indent=2))
