import json,hashlib,glob,subprocess
from pathlib import Path
R=Path('/dev-server/scripts/responsive-layout-116');items=json.loads((R/'checklist-original.json').read_text());routes=json.loads((R/'route-candidates.json').read_text());rows=[]
for i,c in enumerate(items,1):
 f=R/'isolated'/f'{i:03}.json';partial=R/'isolated'/f'{i:03}.partial.json';d=json.loads((f if f.exists() else partial).read_text()) if f.exists() or partial.exists() else {'scenarios':[]}
 scenarios=[]
 for s in d['scenarios']:
  scenarios.append({'profile':s['profile'],'viewport':s['viewport'],'mode':s['mode'],'status':s['status'],'evidence':[x['artifact'] for x in s['states']] or [s.get('artifact')],'steps':[x['step'] for x in s['states']],'clipping':any(g['clipped'] for x in s['states'] for g in x['geometry']),'errors':s['errors'],'checkpoint':str((f if f.exists() else partial).relative_to(R))})
 # Reuse earlier actual route evidence; no approval inferred from absence of page overflow.
 nav=[]
 for sf in (R/'survey').glob('results*.json'):
  for r in json.loads(sf.read_text()):
   if not r.get('viewport'):continue
   states=[x for x in r.get('states',[]) if any(g.get('id')==str(i) for g in x['mounted'])]
   if states:nav.append({'profile':r['profile'],'viewport':r['viewport'],'mode':'REAL_PAGE_NAVIGATION_SYNTHETIC','route':r['route'],'evidence':[x['artifact'] for x in states],'status':'MOUNTED_RECORDED_NOT_VISUAL_APPROVAL'})
 rows.append({'id':i,**c,'route_candidates':[x['path'] for x in routes[i-1]['routes']],'checkpoint_complete':f.exists(),'isolated':scenarios,'navigation':nav,'overall':'RECORDED_WITH_GAPS' if scenarios or nav else 'NOT_EXECUTED'})
# Focused original-component verification replaces generic approval for corrected items only.
for ids,filename,kind in [([48],'final.json','bulk'),([52],'final.json','evidence'),([68,69],'final.json','config'),([16],'delivery-final.json','delivery')]:
 d=json.loads((R/'focused'/filename).read_text())
 for i in ids:
  rows[i-1]['focused']=[{'profile':'administrador','viewport':r['viewport'],'tab':r['tab'],'mode':'ISOLATED_ORIGINAL_COMPONENT','artifact':r['artifact'],'status':'VISUAL_REVIEWED_RETEST' if not d['errors'] else 'HARNESS_ERROR'} for r in d['records'] if r['kind']==kind]
  rows[i-1]['fix']='Local scroll tabs with min-width containment' if i in [16,48,52] else 'One column at every modal width and nonshrinking options'
nav=json.loads((R/'navigation'/'results.json').read_text());matrix={'baseline':'da80884ad25c78c0f9623df95f526888957fdb19','revision_observed':subprocess.check_output(['git','rev-parse','HEAD'],cwd='/dev-server',text=True).strip(),'source_sha256':hashlib.sha256((R/'checklist-original.json').read_bytes()).hexdigest(),'scope':'116 exact IDs; synthetic only; no production access; no authorization certification','summary':{'ids':116,'checkpoint_complete':sum(x['checkpoint_complete'] for x in rows),'isolated_scenarios':sum(len(x['isolated']) for x in rows),'mounted_isolated':sum(s['status'].startswith('MOUNTED') for x in rows for s in x['isolated']),'navigation_profiles':len(set(x['profile'] for x in nav)),'navigation_scenarios':len(nav),'visual_approval':'ONLY corrected focused scenarios; all others are measurements or gaps'},'items':rows,'representative_navigation':nav}
(R/'MATRIX.json').write_text(json.dumps(matrix,ensure_ascii=False,separators=(',',':')));print(matrix['summary'])
