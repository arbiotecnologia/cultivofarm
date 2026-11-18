"""Root-local assembly only; never opens a connection or transfers a capture."""
import argparse, json
from pathlib import Path
H=Path(__file__).resolve().parent
def read_capture(path, ref):
 if ref not in ['swzpzcwiasxmjutrmvkm','vrlcdwmlytukrjezrrnf']: raise ValueError('explicit environment binding required')
 value=json.loads(Path(path).read_text(encoding='utf-8'))
 if value.get('ref')!=ref or value.get('provenance')!='root-local-exact-catalog': raise ValueError('root-local capture binding mismatch')
 return value['catalog']
def assemble(pre, post, fresh_md5):
 if len(fresh_md5)!=32 or any(c not in '0123456789abcdef' for c in fresh_md5): raise ValueError('exact fresh body md5 required')
 for state in [pre,post]:
  if set(state)!= {'relations','functions','publications'}: raise ValueError('complete catalog envelope required')
  if len(state['relations'])!=2: raise ValueError('two relations required')
  if not all(r['rls'] for r in state['relations']): raise ValueError('RLS must already be enabled')
  authority=[f for f in state['functions'] if 'recorte_a_actor_fresh' in f['signature']]
  if len(authority)!=1 or authority[0]['body']!=fresh_md5 or authority[0]['volatile']!='v' or not authority[0]['definer']: raise ValueError('fresh authority mismatch')
 if any('product_source_scope_read_v1' in f['signature'] for f in pre['functions']): raise ValueError('already installed')
 if not any('product_source_scope_read_v1' in f['signature'] for f in post['functions']): raise ValueError('POST helper missing')
 if pre['publications']!=post['publications']: raise ValueError('publication drift')
 if len(pre['functions'])!=1 or len(post['functions'])!=2: raise ValueError('unexpected function closure')
 fresh_pre=[f for f in pre['functions'] if 'recorte_a_actor_fresh' in f['signature']]
 fresh_post=[f for f in post['functions'] if 'recorte_a_actor_fresh' in f['signature']]
 if fresh_pre!=fresh_post: raise ValueError('authority metadata drift')
 helper=next(f for f in post['functions'] if 'product_source_scope_read_v1' in f['signature'])
 if helper['owner']!='postgres' or not helper['definer'] or helper['volatile']!='v': raise ValueError('helper owner/security mismatch')
 expected={'product_sources_scope_select_v1':'r','product_sources_direct_insert_closed_v1':'a','product_sources_direct_update_closed_v1':'w','product_sources_direct_delete_closed_v1':'d'}
 for before in pre['relations']:
  after=next((r for r in post['relations'] if r['oid']==before['oid']),None)
  if after is None: raise ValueError('relation missing')
  b={**before,'policies':before['policies'] or []};a={**after,'policies':after['policies'] or []}
  if 'catalog_technical_sources' in before['name']:
   old_names={p['name'] for p in b['policies']}
   if old_names & expected.keys(): raise ValueError('existing delta policy')
   added=[p for p in a['policies'] if p['name'] not in old_names]
   if {p['name']:p['command'] for p in added}!=expected or any(p['permissive'] or [str(r) for r in p['roles']]!=['0'] for p in added): raise ValueError('POST restrictive policies mismatch')
   a['policies']=[p for p in a['policies'] if p['name'] in old_names]
  if a!=b: raise ValueError('legacy catalog drift')
 query=(H/'catalog.sql.review').read_text().split('SELECT ',1)[1].rstrip().removesuffix(';')
 def check(state,label):
  literal=json.dumps(state,ensure_ascii=False).replace("'","''")
  return f"DO $assert$ BEGIN IF (SELECT {query}) IS DISTINCT FROM '{literal}'::jsonb THEN RAISE EXCEPTION '{label}_catalog_drift'; END IF; END $assert$;\n"
 return 'BEGIN;\nLOCK TABLE public.produtos, public.catalog_technical_sources IN ACCESS EXCLUSIVE MODE;\n'+check(pre,'PRE')+(H/'delta.sql.review').read_text()+check(post,'POST')+'COMMIT;\n'
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--pre',required=True);p.add_argument('--post',required=True);p.add_argument('--ref',required=True);p.add_argument('--fresh-md5',required=True);p.add_argument('--output',required=True);a=p.parse_args()
 Path(a.output).write_text('-- Root-local binding: '+a.ref+'\n'+assemble(read_capture(a.pre,a.ref),read_capture(a.post,a.ref),a.fresh_md5),encoding='utf-8',newline='\n')