"""Root supplies private local PRE and normalized expected POST; emits one atomic assertion transaction."""
import json,argparse,hashlib
from pathlib import Path
from build import H,build,TARGETS,FRESH,validate_signatures
CATALOG_SCHEMAS=('public','platform_private','storage')  # storage: read-only pins of captured trigger functions, never build targets
REFS=['swzpzcwiasxmjutrmvkm','vrlcdwmlytukrjezrrnf']
def load(path,ref):
 c=json.loads(Path(path).read_text(encoding='utf-8'))
 if ref not in REFS or c.get('ref')!=ref or c.get('provenance')!='root-local-exact-catalog':raise ValueError('binding/provenance required')
 if set(c['catalog'])!={'functions','relations','publications'}:raise ValueError('complete catalog required')
 return c['catalog']
def assemble(pre,post,pins):
 for catalog in (pre,post):
  validate_signatures([f['signature'] for f in catalog['functions']],CATALOG_SCHEMAS)
  names=[r['name'] for r in catalog['relations']]
  if len(set(names))!=len(names) or any(not name.startswith(('public.','platform_private.','storage.')) for name in names):raise ValueError('qualified unique relations required; recapture locally, never normalize pins')
 defs={f['signature']:f['definition'] for f in pre['functions'] if f['signature'] in TARGETS+[FRESH] or f['signature'].startswith('public.tenant_product_dossier_') or f['signature']=='public.rpc_regulatory_product_document_access(uuid,uuid,uuid)'}
 storage_pre=[f for f in pre['functions'] if f['signature'].startswith('storage.')]
 if storage_pre!=[f for f in post['functions'] if f['signature'].startswith('storage.')]:raise ValueError('storage function drift; storage dependencies are read-only')
 if any(s.startswith('storage.') for s in defs):raise ValueError('storage functions are never build targets')
 fresh=next(f for f in pre['functions'] if f['signature']==FRESH)
 if fresh['volatile']!='v' or not fresh['definer'] or fresh['owner']!='postgres' or fresh!=next(f for f in post['functions'] if f['signature']==FRESH):raise ValueError('fresh authority metadata drift')
 if pre['publications']!=post['publications']:raise ValueError('publication drift')
 if any('product_dossier_structured_' in r['name'] for r in pre['relations']):raise ValueError('already installed')
 new=[r for r in post['relations'] if 'product_dossier_structured_' in r['name'] and r['kind']=='r']
 if len(new)!=3 or any(not r['rls'] or r['owner']!='postgres' for r in new):raise ValueError('private RLS POST required')
 for f in post['functions']:
  if 'product_dossier_structured_' in f['signature'] and (not f['definer'] or f['owner']!='postgres' or any(x in f['acl'] for x in ['authenticated=','anon=','service_role=','{=X/',',=X/'])):raise ValueError('private function ACL invalid')
 query=(H/'capture-query.sql.review').read_text().split('WITH settings',1)[1].rstrip().removesuffix(';');query='WITH settings'+query
 def check(c,label):
  lit=json.dumps(c,ensure_ascii=False).replace("'","''")
  return "DO $assert$ BEGIN IF ("+query+") IS DISTINCT FROM '"+lit+"'::jsonb THEN RAISE EXCEPTION '"+label+"_CATALOG_DRIFT'; END IF; END $assert$;\n"
 delta=build(defs,pins)
 return 'BEGIN;\nLOCK TABLE public.produtos,public.microorganism_regulatory_dossiers,public.product_regulatory_dossier_links,public.microorganism_regulatory_documents IN ACCESS EXCLUSIVE MODE;\n'+check(pre,'PRE')+delta+check(post,'POST')+'COMMIT;\n'
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--pre',required=True);p.add_argument('--post',required=True);p.add_argument('--pins',required=True);p.add_argument('--ref',required=True);p.add_argument('--output',required=True);a=p.parse_args();Path(a.output).write_text('-- explicit binding '+a.ref+'\n'+assemble(load(a.pre,a.ref),load(a.post,a.ref),json.loads(Path(a.pins).read_text())),encoding='utf-8',newline='\n')
