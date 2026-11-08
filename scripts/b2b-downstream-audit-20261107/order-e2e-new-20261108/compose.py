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
  commercial=load('new_commercial_merge',H/'commercial.py')
  Q=commercial.apply(B,load,ROOT,OUT)
  checks.append(dict(test='new B3 captured economic composition merged without dropped physical guards',status='PASS'))
  data,error=Q.publish(Q.UFIN,Q.P3,'boleto',Q.M_BOL,30,3,'1.8',0)
  assert data is not None,error
  data,error=Q.assign(Q.UADM,Q.P,Q.P3,'boleto',1);assert data is not None,error
  data,error=Q.activation(Q.UADM,'pilot',[Q.P],0);assert data is not None,error
  choice=Q.ch('boleto',1,30)
  diagnostic=Q.psql(f"""SELECT set_config('request.jwt.claim.sub','{Q.UB}',false);
    SELECT jsonb_build_object(
      'seller_org_partner_is_null',(SELECT partner_account_id IS NULL FROM public.organizations WHERE id='{Q.A}'),
      'buyer_links',(SELECT jsonb_agg(to_jsonb(pu)) FROM public.partner_users pu WHERE pu.user_id='{Q.UB}'),
      'valid_partner_user',public.is_valid_b2b_partner_user('{Q.UB}','{Q.P}'),
      'actor_scope',(SELECT to_jsonb(s) FROM platform_private.b2b_actor_scope('{Q.UB}') s),
      'commercial_context',platform_private.b2b_commercial_context(),
      'owner_order_allowed',platform_private.c2_owner_order_create_allowed('{Q.UB}','{Q.P}'),
      'owner_plan_assigned',platform_private.c2_owner_plan_assigned('{Q.P}','{Q.P3}'),
      'subscriptions',(SELECT jsonb_agg(to_jsonb(s)) FROM public.organization_subscriptions s WHERE s.organization_id='{Q.A}'),
      'versions',(SELECT jsonb_agg(to_jsonb(v)) FROM public.saas_plan_versions v JOIN public.organization_subscriptions s ON s.plan_version_id=v.id WHERE s.organization_id='{Q.A}'),
      'overrides',(SELECT jsonb_agg(to_jsonb(o)) FROM public.organization_feature_overrides o WHERE o.organization_id='{Q.A}'),
      'entitlement_resolver_md5',md5(pg_get_functiondef('platform_private.entitlements_for_user(uuid)'::regprocedure)),
      'entitlements',(SELECT jsonb_agg(to_jsonb(e)) FROM platform_private.entitlements_for_user('{Q.UB}') e)
    )::text;""").stdout.strip().splitlines()[-1]
  scope=json.loads(diagnostic)
  assert scope['seller_org_partner_is_null'] is True and scope['valid_partner_user'] is True and scope['owner_order_allowed'] is True,scope
  assert {x['feature_key'] for x in scope['entitlements'] or []}=={'pedidos_b2b','catalogo_precos'},scope
  assert B.last("SELECT md5(pg_get_functiondef('platform_private.assert_b2b_partner_scope(uuid,uuid)'::regprocedure));")=='f86f43f9d9ad3ed97b840fcc02c79476'
  assert B.last("SELECT md5(pg_get_functiondef('platform_private.c2_order_actor_scope(uuid,uuid)'::regprocedure));")=='54c4327d63f48e39f598129ff9dd8f09'
  (OUT/'buyer-scope-diagnostic.json').write_text(json.dumps(scope,indent=2)+'\n')
  negative={}
  for label,uid,partner,token in [
    ('technician_isolated',Q.UT,Q.P,'forbidden_financial_terms'),
    ('cross_tenant_buyer',Q.UB2,Q.P,'forbidden_partner'),
    ('inactive_profile',Q.UINACT,Q.P,'inactive_scope')]:
   result,err=Q.sim(uid,Q.P3,[Q.S(2)],choice,partner=partner)
   assert result is None and token in (err or ''),(label,result,err)
   negative[label]=err
  B.sql(f"SET session_replication_role=replica;UPDATE public.partner_users SET revoked_at=now(),revoked_by='{Q.UADM}',revoke_reason='LOCAL REVOCATION TEST' WHERE user_id='{Q.UB}' AND partner_id='{Q.P}';SET session_replication_role=origin;")
  result,err=Q.sim(Q.UB,Q.P3,[Q.S(2)],choice)
  B.sql(f"SET session_replication_role=replica;UPDATE public.partner_users SET revoked_at=NULL,revoked_by=NULL,revoke_reason=NULL WHERE user_id='{Q.UB}' AND partner_id='{Q.P}';SET session_replication_role=origin;")
  assert result is None and 'forbidden_partner' in (err or ''),err
  negative['revoked_link']=err
  B.sql(f"SET session_replication_role=replica;UPDATE public.partner_users SET tenant_id='{Q.F}' WHERE user_id='{Q.UB}' AND partner_id='{Q.P}';SET session_replication_role=origin;")
  result,err=Q.sim(Q.UB,Q.P3,[Q.S(2)],choice)
  B.sql(f"SET session_replication_role=replica;UPDATE public.partner_users SET tenant_id='{Q.A}' WHERE user_id='{Q.UB}' AND partner_id='{Q.P}';SET session_replication_role=origin;")
  assert result is None and 'forbidden_partner' in (err or ''),err
  negative['tenant_mismatch']=err
  B.sql(f"SET session_replication_role=replica;INSERT INTO public.partner_users(user_id,partner_id,tenant_id,papel) VALUES('{Q.UB}','{Q.PO}','{Q.A}','gestor');SET session_replication_role=origin;")
  result,err=Q.sim(Q.UB,Q.P3,[Q.S(2)],choice)
  B.sql(f"SET session_replication_role=replica;DELETE FROM public.partner_users WHERE user_id='{Q.UB}' AND partner_id='{Q.PO}';SET session_replication_role=origin;")
  assert result is None and 'forbidden_partner' in (err or ''),err
  negative['second_active_link']=err
  assert B.last("SELECT count(*) FROM public.partner_orders;")=='0'
  (OUT/'buyer-scope-negatives.json').write_text(json.dumps(negative,indent=2)+'\n')
  checks.append(dict(test='real NULL seller org shape; global guards unchanged; role tenant inactive revocation and multilink negatives',status='PASS'))
  data,error=Q.sim(Q.UB,Q.P3,[Q.S(2)],choice);assert data is not None,error
  journal,journal_error=Q.call(Q.UB,f"public.recover_partner_order_attempt_v1('{Q.P}',NULL,NULL,false,NULL)")
  assert journal is not None,journal_error
  assert journal['contract']=='C2_ORDER_JOURNAL_V1' and journal['state']=='reserved',journal
  (OUT/'buyer-attempt.json').write_text(json.dumps(journal,indent=2)+'\n')
  data,error=Q.create(Q.UB,Q.P3,[Q.S(2)],data['cart_hash'],journal['key'],choice);assert data is not None,error
  order_id=data['id']
  replay,replay_error=Q.create(Q.UB,Q.P3,[Q.S(2)],data['cart_hash'],journal['key'],choice)
  assert replay is not None,replay_error
  assert replay['id']==order_id and B.last(f"SELECT count(*) FROM public.partner_orders WHERE id='{order_id}';")=='1',replay
  recovered,recovery_error=Q.call(Q.UB,f"public.recover_partner_order_attempt_v1('{Q.P}',NULL,NULL,false,NULL)")
  assert recovered is not None,recovery_error
  assert recovered['state']=='committed' and recovered['order_id']==order_id,recovered
  (OUT/'buyer-attempt.json').write_text(json.dumps(dict(initial=journal,replay_order_id=replay['id'],recovered=recovered),indent=2)+'\n')
  (OUT/'buyer-order.json').write_text(json.dumps(data,indent=2)+'\n')
  checks.append(dict(test='new buyer canonical B3 packaging order with chosen condition, durable replay and committed recovery',status='PASS',order_id=order_id))
  before=json.loads(Q.psql(f"SELECT to_jsonb(o)::text FROM public.partner_orders o WHERE id='{order_id}'").stdout.strip())
  denied=Q.as_user(Q.UADM,f"SELECT public.approve_partner_order('{order_id}',NULL,NULL);")
  assert denied.returncode!=0 and 'C2_ACCOUNTING_PENDING' in denied.stderr,denied.stderr
  after_denied=json.loads(Q.psql(f"SELECT to_jsonb(o)::text FROM public.partner_orders o WHERE id='{order_id}'").stdout.strip())
  assert after_denied==before,'approval denied before accounting changed order'
  checks.append(dict(test='accounting pending approval denied atomically before synthetic promotion',status='PASS'))
  B.sql(f"""SET session_replication_role=replica;
   INSERT INTO public.company_fiscal_settings(organization_id,is_active,configuration_status,accounting_validated_at,legal_name,cnpj,configuration_version)
    SELECT '{Q.A}',true,'VALIDATED',now(),'ARBIO FIXTURE LOCAL SEM VALIDADE EXTERNA','00000000000191',1
    WHERE NOT EXISTS(SELECT 1 FROM public.company_fiscal_settings WHERE organization_id='{Q.A}' AND is_active);
   SET session_replication_role=origin;""")
  promoted,promote_error=Q.call(Q.UADM,f"public.c2_promote_accounting_pending_order_v1('{order_id}','{before['updated_at']}'::timestamptz)")
  assert promoted is not None,promote_error
  assert promoted['contract']=='C2_EXTERNAL_ORDER_ORIGIN_V1',promoted
  approved=Q.as_user(Q.UADM,f"SELECT public.approve_partner_order('{order_id}',NULL,NULL);")
  assert approved.returncode==0,approved.stderr
  accepted=json.loads(Q.psql(f"SELECT to_jsonb(o)::text FROM public.partner_orders o WHERE id='{order_id}'").stdout.strip())
  assert accepted['status']=='aprovado' and accepted['internal_economic_snapshot'] is not None,accepted
  assert accepted['ready_for_production'] is False,'external resale must not open biological production'
  (OUT/'seller-acceptance.json').write_text(json.dumps(dict(promotion=promoted,order=accepted),indent=2)+'\n')
  checks.append(dict(test='synthetic accounting CAS promotion and canonical seller acceptance; biological production stays closed',status='PASS'))
 except Exception:
  traceback.print_exc();checks.append(dict(test='new composition',status='FAIL'))
 finally:
  (OUT/'checks.json').write_text(json.dumps(checks,indent=2)+'\n')
 return 0 if checks and all(x['status']=='PASS' for x in checks) else 1
if __name__=='__main__':sys.exit(main())
