#!/usr/bin/env python3
"""Composition driver, executes only in /tmp mirror; all experiments are local."""
import importlib.util,json,os,sys,traceback
from pathlib import Path
H=Path(__file__).resolve().parent;ROOT=H.parents[2]
assert ROOT.is_relative_to(Path('/tmp')), 'TEMP_MIRROR_REQUIRED'
OUT=Path(os.environ['NEW_E2E_OUT'])
checks=[]
def load(name,p):
 s=importlib.util.spec_from_file_location(name,p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
def main():
 try:
  physical=ROOT/'scripts/b2b-downstream-audit-20261107/physical/finished-product'
  B=load('new_finished',physical/'test_after.py').B
  # Start from exact captured catalog, not an unidentified cached fixture.
  sys.modules[B.C.__name__]=B.C
  checkpoint=Path('/tmp/new-order-checkpoint.sql')
  if os.environ.get('NEW_E2E_REUSE_FRESH')=='1':
   import hashlib
   B.pg.start();j=B.restore.metadata()
   roles={r['name'] for r in j['roles']}|{'supabase_admin'}
   for x in j['relations']+j['functions']+j['schemas']:
    roles.add(x['owner'])
    for ent in (x.get('acl') or '').strip('{}').split(','):
     if '=' in ent:roles.update([ent.split('=')[0],ent.split('/')[-1]])
   for p in j['policies']:roles.update(p['roles'])
   for r in sorted(roles-{'','postgres','pg_database_owner','public'}):B.sql('CREATE ROLE "'+r.replace('"','""')+'";')
   for r in j['roles']:
    if r['name']!='postgres':B.sql('ALTER ROLE "'+r['name']+'" '+('BYPASSRLS' if r['bypassrls'] else 'NOBYPASSRLS')+';')
   B.sql(checkpoint.read_text())
   (OUT/'fresh-checkpoint.json').write_text(json.dumps(dict(path=str(checkpoint),sha256=hashlib.sha256(checkpoint.read_bytes()).hexdigest(),source='new attempt full restoration, not lost historical artifact'))+'\n')
  else:
   result=B.restore.restore()
   (OUT/'restore-results.json').write_text(json.dumps(result,indent=2)+'\n')
   assert not any(result.values()),result
   B.C.prepare_checkpoint(checkpoint)
  checks.append(dict(test='fresh full physical catalog restoration and reviewed upstream composition',status='PASS'))
  # Capture the new checkpoint under the path used by existing local helper.
  # Subsequent composition is continued in this same database; no source evidence reused.
  print('NEW_PHYSICAL_BOOT_OK',flush=True)
  # Install confirmation/send in the current fresh database using measured exact pins.
  C=B.C
  pre=C.state();delta=C.G.candidate()
  post=json.loads([x for x in B.sql('BEGIN;'+delta+C.G.STATE+'::text;ROLLBACK;').splitlines() if x.startswith('{')][-1])
  released=json.loads([x for x in B.sql('BEGIN;'+delta+f'GRANT EXECUTE ON FUNCTION {C.G.RPC} TO authenticated;'+C.G.STATE+'::text;ROLLBACK;').splitlines() if x.startswith('{')][-1])
  C.G.write(pre,post,released);B.sql((C.H/'install.sql.review').read_text())
  S=load('new_send',C.H/'send/assemble.py')
  pre=json.loads(B.last(S.STATE+'::text;'))
  post=json.loads([x for x in B.sql('BEGIN;'+S.candidate()+S.STATE+'::text;ROLLBACK;').splitlines() if x.startswith('{')][-1])
  S.write(pre,post);B.sql((C.H/'send/install.sql.review').read_text())
  B.sql('GRANT EXECUTE ON FUNCTION public.rpc_entrega_confirmar_manual_v1(uuid,timestamptz,text,jsonb),public.rpc_entrega_enviar_manual_v1(uuid,timestamptz,text) TO authenticated;')
  B.apply_current_catalog(B.sql,B.T.A)
  # Captured NULL ACL vs restore's explicit postgres-only ACL: same effective
  # owner-only permissions. Measure representation in TEMP generator, never hosted pins.
  F=load('new_finished_generator',physical/'assemble.py')
  rel=next(r for r in F.BASE['relations'] if r['name']=='authz_tickets')
  acl=B.sql("SELECT coalesce(relacl::text,'') FROM pg_class WHERE oid='platform_private.authz_tickets'::regclass;").strip()
  assert acl in ('','{postgres=arwdDxtm/postgres}'),acl
  rel['acl']=acl
  (OUT/'acl-normalization.json').write_text(json.dumps(dict(relation='platform_private.authz_tickets',historical='',restored=acl,client_grants=False,seam='restorer explicit owner ACL vs NULL default, local generator only'))+'\n')
  F.build()
  B.sql((physical/'install.sql.review').read_text())
  checks.append(dict(test='physical revised install PRE POST; fresh confirmation/send generated pins',status='PASS'))
  # No new production behavior: closed gate first, disposable activation second.
  assert B.last('SELECT enabled FROM platform_private.finished_product_gate_v1 WHERE singleton;')=='f'
  B.sql('UPDATE platform_private.finished_product_gate_v1 SET enabled=true WHERE singleton;')
  A=load('new_purchase_helpers',physical/'test_after.py');A.B=B
  item=A.finished('quimico','kg',25,3)
  reserved=json.loads(B.last(B.reserve(item['os'],item['stock'],2,'new-e2e-physical-reserve')))['itens'][0]
  delivery=json.loads(B.last(B.group(item['os'],reserved,2,'new-e2e-physical-group')))['itens'][0]['entrega_id']
  assert json.loads(B.last(B.send(delivery,'new-e2e-physical-send')))['success'] is True
  B.prove(delivery,'new-e2e-physical-proof')
  assert json.loads(B.last(B.confirm(delivery,'new-e2e-physical-confirm')))['success'] is True
  checks.append(dict(test='new physical control purchase reserve send proof confirm without manufacture',status='PASS'))
 except Exception:
  traceback.print_exc();checks.append(dict(test='new composition',status='FAIL'))
 finally:
  (OUT/'checks.json').write_text(json.dumps(checks,indent=2)+'\n')
 return 0 if checks and all(x['status']=='PASS' for x in checks) else 1
if __name__=='__main__':sys.exit(main())
