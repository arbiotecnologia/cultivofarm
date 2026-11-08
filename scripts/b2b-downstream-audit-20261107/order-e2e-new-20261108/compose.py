#!/usr/bin/env python3
"""Composition driver, executes only in /tmp mirror; all experiments are local."""
import importlib.util,json,os,sys,traceback,uuid
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
  # f32c4f3: o candidato de planos é instalado no MESMO banco da B3/logística.
  # PRE/POST permanecem integrais; divergência de pin aborta sem stub ou bypass.
  plan_dir=ROOT/'scripts/commercial-plans-tenant-20261108'
  plan_pre=Q.psql("SET commercial_plans.review_project_ref='swzpzcwiasxmjutrmvkm';"+(plan_dir/'01-pre.sql.readonly').read_text()).stdout.strip()
  B.sql("SET commercial_plans.review_project_ref='swzpzcwiasxmjutrmvkm';"+(plan_dir/'02-install.sql.review').read_text())
  plan_post=Q.psql("SET commercial_plans.review_project_ref='swzpzcwiasxmjutrmvkm';"+(plan_dir/'03-post.sql.readonly').read_text()).stdout.strip()
  arb_plans=Q.as_user(Q.UADM,"SELECT coalesce(jsonb_agg(id),'[]'::jsonb) FROM public.rpc_admin_list_commercial_plans(NULL,'all',100,0);")
  fsf_plans=Q.as_user(Q.UADMF,"SELECT coalesce(jsonb_agg(id),'[]'::jsonb) FROM public.rpc_admin_list_commercial_plans(NULL,'all',100,0);")
  assert arb_plans.returncode==0 and Q.P3 in json.loads(arb_plans.stdout.strip()),(arb_plans.stdout,arb_plans.stderr)
  assert fsf_plans.returncode==0 and Q.P3 not in json.loads(fsf_plans.stdout.strip()),(fsf_plans.stdout,fsf_plans.stderr)
  fsf_write=Q.as_user(Q.UADMF,f"SELECT public.rpc_admin_update_commercial_plan_metadata('{Q.P3}','FSF DENIED',NULL,NULL);")
  assert fsf_write.returncode!=0 and 'plan_not_found' in fsf_write.stderr,fsf_write.stderr
  shared=Q.as_user(Q.UADMF,f"""SELECT public.rpc_admin_create_commercial_plan(jsonb_build_object(
   'name','LOCAL FSF SAME CODE','code',(SELECT code FROM public.commercial_payment_plans WHERE id='{Q.P3}'),
   'plan_type','custom','max_days',30,'months_count',1,'installment_count',1,'discount_percent',0,
   'monthly_interest_percent',0,'interest_type','none','pricing_mode','discount_from_base',
   'requires_credit_approval',false,'requires_guarantee',false,'requires_financial_approval',false));""")
  assert shared.returncode==0,shared.stderr
  shared_id=shared.stdout.strip().splitlines()[-1]
  arb_code=Q.as_user(Q.UADM,f"SELECT count(*) FROM public.rpc_admin_list_commercial_plans((SELECT code FROM public.commercial_payment_plans WHERE id='{shared_id}'),'all',100,0) WHERE id='{shared_id}';")
  assert arb_code.returncode==0 and arb_code.stdout.strip()=='0',(arb_code.stdout,arb_code.stderr)
  (OUT/'plan-isolation-composition.json').write_text(json.dumps(dict(pre=plan_pre,post=plan_post,arbio_plan_visible=True,fsf_arbio_plan_visible=False,fsf_write_denied=fsf_write.stderr,shared_code_plan_id=shared_id,shared_code_invisible_to_arbio=True),indent=2)+'\n')
  checks.append(dict(test='plan tenant candidate PRE POST in same DB; seller positive FSF read write negative and cross tenant same code',status='PASS'))
  # As baselines atuais são compostas antes do pedido B2B: o fluxo inteiro abaixo
  # corre com a ACL e os dez gatilhos reais de recebíveis, além do cadastro sem
  # configuração automática. Nenhum writer B4/NF é instalado por esta etapa.
  R=load('new_real_baselines',H/'real_baselines.py')
  R.install(B,OUT,ROOT)
  checks.append(dict(test='real registration fence and exact receivable ACL with all ten triggers enabled before B2B order',status='PASS'))
  R.negative_controls(B,Q,OUT)
  checks.append(dict(test='direct settings write denied and delivery context forbids receivable INSERT UPDATE DELETE',status='PASS'))
  # A restauração contém sentinelas reais das dez tabelas downstream. O oráculo
  # deve medir delta desta execução, não exigir banco global vazio.
  effect_baseline=json.loads(B.last("SELECT jsonb_build_object('receivables',(SELECT count(*) FROM public.accounts_receivable),'fiscal_documents',(SELECT count(*) FROM public.fiscal_invoices))::text;"))
  data,error=Q.publish(Q.UFIN,Q.P3,'boleto',Q.M_BOL,30,3,'1.8',0)
  assert data is not None,error
  data,error=Q.assign(Q.UADM,Q.P,Q.P3,'boleto',1);assert data is not None,error
  data,error=Q.activation(Q.UADM,'pilot',[Q.P],0);assert data is not None,error
  # Expansão aditiva do piloto: PN representa o novo parceiro sintético, sem
  # promover enforced global. O parceiro antigo P e os demais escopos são medidos.
  assigned_new,assign_new_error=Q.assign(Q.UADM,Q.PN,Q.P3,'boleto',1);assert assigned_new is not None,assign_new_error
  stale,stale_error=Q.activation(Q.UADM,'pilot',[Q.P,Q.PN],0)
  assert stale is None and 'payment_condition_activation_stale' in (stale_error or ''),stale_error
  expanded,expand_error=Q.activation(Q.UADM,'pilot',[Q.P,Q.PN],1);assert expanded is not None,expand_error
  old_options,old_error=Q.call(Q.UB,f"public.b2b_list_payment_condition_options_secure('{Q.P}','{Q.PLD}')")
  new_options,new_error=Q.call(Q.UN,f"public.b2b_list_payment_condition_options_secure('{Q.PN}','{Q.P3}')")
  out_options,out_error=Q.call(Q.UADM,f"public.b2b_list_payment_condition_options_secure('{Q.PO}','{Q.P3}')")
  foreign_options,foreign_error=Q.call(Q.UADMF,f"public.b2b_list_payment_condition_options_secure('{Q.PF}','{Q.PLD}')")
  assert old_options and old_options['mode']=='required' and new_options and new_options['mode']=='required',(old_error,new_error)
  assert out_options and out_options['mode']=='legacy' and foreign_options and foreign_options['mode']=='legacy',(out_error,foreign_error)
  new_journal,new_journal_error=Q.call(Q.UN,f"public.recover_partner_order_attempt_v1('{Q.PN}',NULL,NULL,false,NULL)")
  assert new_journal and new_journal['state']=='reserved',new_journal_error or new_journal
  legacy_new=Q.legacy(Q.UN,Q.P3,[Q.S(1)],new_journal['key'],partner=Q.PN)
  assert legacy_new.returncode!=0 and 'B2B_PAYMENT_CONDITION_REQUIRED' in legacy_new.stderr,legacy_new.stderr
  assert Q.idem(new_journal['key'])=='0'
  (OUT/'pilot-targeting.json').write_text(json.dumps(dict(activation=expanded,old_required=old_options['mode'],new_required=new_options['mode'],outside_pilot=out_options['mode'],other_tenant=foreign_options['mode'],legacy_denial=legacy_new.stderr,stale_cas=stale_error,orders_for_denied_attempt=Q.idem(new_journal['key'])),indent=2)+'\n')
  checks.append(dict(test='additive pilot targeting keeps old and new required; legacy writer denied; outside partner and tenant unchanged',status='PASS'))
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
  assert {x['feature_key'] for x in scope['entitlements'] or []}=={'pedidos_b2b','catalogo_precos','estoque_embalagens','ordens_producao','lotes_qualidade'},scope
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
  second=B.run_raw(f"SET session_replication_role=replica;INSERT INTO public.partner_users(user_id,partner_id,tenant_id,papel) VALUES('{Q.UB}','{Q.PO}','{Q.A}','gestor');SET session_replication_role=origin;")
  assert second.returncode!=0 and 'partner_users_user_id_key' in second.stderr,second.stderr
  negative['second_active_link']=second.stderr
  assert B.last(f"SELECT count(*) FROM public.partner_users WHERE user_id='{Q.UB}';")=='1'
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

  # Nova ponte de revenda: gerada no espelho a partir dos corpos recém-instalados.
  # Nenhum writer privado recebe grant de cliente; o gate começa e termina fechado.
  L=load('new_b2b_resale_logistics',H/'resale_logistics.py')
  logistics=L.install(B,OUT)
  item=json.loads(B.last(f"SELECT to_jsonb(i)::text FROM public.partner_order_items i WHERE i.order_id='{order_id}' ORDER BY i.created_at,i.id LIMIT 1;"))
  def resale_call(uid,key,expected=None,item_id=None,role=False):
   expected=expected or accepted['updated_at'];item_id=item_id or item['id']
   prefix=(f"SET ROLE authenticated;SET request.jwt.claim.sub='{uid}';" if role else f"RESET ROLE;SET request.jwt.claim.sub='{uid}';SET request.jwt.claims='{{\"sub\":\"{uid}\",\"iat\":1}}';")
   return prefix+f"SELECT platform_private.b2b_resale_os_create_v1('{order_id}','{item_id}','{expected}'::timestamptz,'{key}');"
  denied=B.run_raw(resale_call(Q.UADM,'resale-gate-closed-0001'))
  assert denied.returncode!=0 and 'B2B_RESALE_GATE_CLOSED' in denied.stderr,denied.stderr
  denied=B.run_raw(resale_call(Q.UADM,'resale-client-grant-0001',role=True))
  assert denied.returncode!=0 and 'permission denied for function b2b_resale_os_create_v1' in denied.stderr,denied.stderr
  direct=B.run_raw(f"RESET ROLE;SET request.jwt.claim.sub='{Q.UADM}';INSERT INTO public.ordens_servico(organization_id,produto_id,status,prioridade,tipo_item,partner_order_id,partner_order_item_id,origem) VALUES('{Q.A}','{item['product_id']}','pronto_entrega','media','produto','{order_id}','{item['id']}','b2b');")
  assert direct.returncode!=0 and 'OS_APPROVAL_SCOPE_DENIED' in direct.stderr,direct.stderr
  assert B.last(f"SELECT count(*) FROM public.ordens_servico WHERE partner_order_id='{order_id}';")=='0'
  checks.append(dict(test='resale candidate gate closed, no client EXECUTE and no direct ready OS bypass',status='PASS'))

  B.sql('UPDATE platform_private.b2b_resale_logistics_gate_v1 SET enabled=true WHERE singleton;')
  direct_authenticated=B.run_raw(B.T.actor(Q.UADM)+f"UPDATE public.partner_orders SET status='entregue' WHERE id='{order_id}';")
  assert direct_authenticated.returncode==0,(direct_authenticated.stdout,direct_authenticated.stderr)
  assert B.last(f"SELECT status::text FROM public.partner_orders WHERE id='{order_id}';")=='aprovado'
  direct_operational=B.run_raw(f"RESET ROLE;SET request.jwt.claim.sub='{Q.UADM}';SET request.jwt.claims='{{\"sub\":\"{Q.UADM}\",\"iat\":1}}';UPDATE public.partner_orders SET status='entregue' WHERE id='{order_id}';")
  (OUT/'resale-direct-status-denial.json').write_text(json.dumps(dict(authenticated_zero_rows=dict(returncode=direct_authenticated.returncode,stdout=direct_authenticated.stdout,stderr=direct_authenticated.stderr),privileged_guard=dict(returncode=direct_operational.returncode,stdout=direct_operational.stdout,stderr=direct_operational.stderr)),indent=2)+'\n')
  assert direct_operational.returncode!=0 and 'B2B_INTERNAL_DOWNSTREAM_UNVERIFIED' in direct_operational.stderr,(direct_operational.returncode,direct_operational.stdout,direct_operational.stderr)
  assert B.last(f"SELECT status::text FROM public.partner_orders WHERE id='{order_id}';")=='aprovado'
  checks.append(dict(test='authenticated direct status changes zero rows and privileged direct operational transition is explicitly denied',status='PASS'))
  denied=B.run_raw(resale_call(Q.UB,'resale-buyer-denied-0001'))
  assert denied.returncode!=0 and 'B2B_RESALE_ACTOR_DENIED' in denied.stderr,denied.stderr
  denied=B.run_raw(resale_call(Q.UADM,'resale-stale-cas-0001',expected='2000-01-01 00:00:00+00'))
  assert denied.returncode!=0 and 'B2B_RESALE_ORDER_CONFLICT' in denied.stderr,denied.stderr
  created=json.loads(B.last(resale_call(Q.UADM,'resale-os-create-0001')))
  assert created['ok'] is True and created['replay'] is False,created
  os_id=created['os_id']
  replay=json.loads(B.last(resale_call(Q.UADM,'resale-os-create-0001')))
  assert replay['replay'] is True and replay['os_id']==os_id,replay
  conflict=B.run_raw(resale_call(Q.UADM,'resale-os-create-0001',expected='2000-01-01 00:00:00+00'))
  assert conflict.returncode!=0 and 'B2B_RESALE_REPLAY_CONFLICT' in conflict.stderr,conflict.stderr
  assert B.last(f"SELECT count(*) FROM public.ordens_servico WHERE partner_order_item_id='{item['id']}';")=='1'
  assert B.last(f"SELECT NOT EXISTS(SELECT 1 FROM public.programacao_producao WHERE ordem_servico_id='{os_id}') AND NOT EXISTS(SELECT 1 FROM public.production_order_link WHERE ordem_servico_id='{os_id}');")=='t'
  (OUT/'resale-os.json').write_text(json.dumps(dict(created=created,replay=replay),indent=2)+'\n')
  checks.append(dict(test='approved resale order creates one ready OS without planning production or biological link; CAS replay conflict and buyer denial',status='PASS',os_id=os_id))

  purchased=A.purchase({'product':item['product_id'],'packaging':item['packaging_id_snapshot']},3,'resale-order-purchase-0001',actor=Q.UADM)
  received=json.loads(B.last(purchased));assert received['ok'] is True and received['replay'] is False,received
  stock=received['estoque_produto_id']
  def reserve_resale(key,quantity=2):
   items=json.dumps([{'item_id':stock,'quantidade':quantity}]);data=json.dumps({'partner_id':Q.P,'partner_order_id':order_id})
   return B.T.actor(Q.UADM)+f"SELECT public.rpc_estoque_reservar_v1('{os_id}','b2b','{items}'::jsonb,'{key}','{data}'::jsonb);"
  group_observations={}
  def group_resale(stock_id,key):
   if key not in group_observations:
    group_observations[key]=(B.last(f"SELECT updated_at FROM public.ordens_servico WHERE id='{os_id}';"),B.last(f"SELECT updated_at FROM public.estoque_produto WHERE id='{stock_id}';"))
   observed_os,observed_stock=group_observations[key]
   items=json.dumps([{'item_id':stock_id,'quantidade':2,'observed_updated_at':observed_stock}])
   return B.T.actor(Q.UADM)+f"SELECT public.rpc_cockpit_criar_entrega_v1('{os_id}','b2b','{items}'::jsonb,'{key}','{{}}'::jsonb,'{observed_os}'::timestamptz);"
  def prove_resale(delivery_id,key):
   denied=B.run_raw(B.T.actor(Q.UB)+f"SELECT public.rpc_entrega_formulario_gerar_v1('{delivery_id}','resale-buyer-proof-{key}');")
   assert denied.returncode!=0 and 'DELIVERY_PROOF_ACTOR_DENIED' in denied.stderr,denied.stderr
   generated=json.loads(B.last(B.T.actor(Q.UADM)+f"SELECT public.rpc_entrega_formulario_gerar_v1('{delivery_id}','resale-generate-{key}');"))
   assert generated['success'] is True,generated
   generated_replay=json.loads(B.last(B.T.actor(Q.UADM)+f"SELECT public.rpc_entrega_formulario_gerar_v1('{delivery_id}','resale-generate-{key}');"))
   assert generated_replay['replayed'] is True and generated_replay['comprovante_id']==generated['comprovante_id'],generated_replay
   path=f"entregas/{delivery_id}/comprovantes/{uuid.uuid4()}.pdf"
   B.sql(f"INSERT INTO storage.objects(bucket_id,name,owner,owner_id) VALUES('entrega-documentos','{path}','{Q.UADM}','{Q.UADM}');")
   payload=json.dumps({'arquivo_path':path,'arquivo_nome':'local.pdf','arquivo_mime':'application/pdf','recebedor_nome':'LOCAL REVENDA'})
   attached=json.loads(B.last(B.T.actor(Q.UADM)+f"SELECT public.rpc_entrega_comprovante_anexar_v1('{delivery_id}','resale-proof-{key}','{payload}'::jsonb);"))
   assert attached['success'] is True,attached
   attached_replay=json.loads(B.last(B.T.actor(Q.UADM)+f"SELECT public.rpc_entrega_comprovante_anexar_v1('{delivery_id}','resale-proof-{key}','{payload}'::jsonb);"))
   assert attached_replay['replayed'] is True and attached_replay['comprovante_id']==attached['comprovante_id'],attached_replay
   (OUT/'resale-proof.json').write_text(json.dumps(dict(generate=generated,generate_replay=generated_replay,attach=attached,attach_replay=attached_replay),indent=2)+'\n')
  wrong=B.T.actor(Q.UADM)+f"SELECT public.rpc_estoque_reservar_v1('{os_id}','b2b','[{{\"item_id\":\"{stock}\",\"quantidade\":0.5}}]'::jsonb,'resale-fractional-0001','{json.dumps({'partner_id':Q.P,'partner_order_id':order_id})}'::jsonb);"
  rejected=B.run_raw(wrong);assert rejected.returncode!=0 and 'FINISHED_PRODUCT_WHOLE_PACK_REQUIRED' in rejected.stderr,rejected.stderr
  wrong_partner=B.T.actor(Q.UADM)+f"SELECT public.rpc_estoque_reservar_v1('{os_id}','b2b','[{{\"item_id\":\"{stock}\",\"quantidade\":2}}]'::jsonb,'resale-wrong-partner-0001','{json.dumps({'partner_id':Q.PO,'partner_order_id':order_id})}'::jsonb);"
  rejected=B.run_raw(wrong_partner);assert rejected.returncode!=0 and 'ESTQ_REFERENCE_FORBIDDEN' in rejected.stderr,rejected.stderr
  wrong_order=B.T.actor(Q.UADM)+f"SELECT public.rpc_estoque_reservar_v1('{os_id}','b2b','[{{\"item_id\":\"{stock}\",\"quantidade\":2}}]'::jsonb,'resale-wrong-order-0001','{json.dumps({'partner_id':Q.P,'partner_order_id':'00000000-0000-0000-0000-000000000001'})}'::jsonb);"
  rejected=B.run_raw(wrong_order);assert rejected.returncode!=0 and 'ESTQ_REFERENCE_FORBIDDEN' in rejected.stderr,rejected.stderr
  wrong_actor=B.T.actor(Q.UB)+f"SELECT public.rpc_estoque_reservar_v1('{os_id}','b2b','[{{\"item_id\":\"{stock}\",\"quantidade\":2}}]'::jsonb,'resale-wrong-actor-0001','{json.dumps({'partner_id':Q.P,'partner_order_id':order_id})}'::jsonb);"
  rejected=B.run_raw(wrong_actor);assert rejected.returncode!=0,rejected.stderr
  assert B.last(f"SELECT quantidade=3 AND status='disponivel' AND reservado_para_os_id IS NULL FROM public.estoque_produto WHERE id='{stock}';")=='t'
  checks.append(dict(test='fractional pack, mismatched partner/order and buyer reservation all fail without changing stock',status='PASS'))
  reserved=json.loads(B.last(reserve_resale('resale-reserve-cancel-0001')))['itens'][0]
  grouped=json.loads(B.last(group_resale(reserved,'resale-group-cancel-0001')))
  cancel_delivery=grouped['itens'][0]['entrega_id']
  cancel_observed=B.last(f"SELECT updated_at FROM public.entregas WHERE id='{cancel_delivery}';")
  cancelled=json.loads(B.last(B.T.actor(Q.UADM)+f"SELECT public.rpc_entrega_cancelar_v1('{cancel_delivery}','LOCAL resale-cancel-0001','{cancel_observed}'::timestamptz);"))
  assert cancelled['success'] is True and cancelled['replay'] is False,cancelled
  assert B.last(f"SELECT quantidade=3 AND status='disponivel' FROM public.estoque_produto WHERE id='{stock}';")=='t'
  assert B.last(f"SELECT receivable_id IS NULL AND partner_order_id='{order_id}' FROM public.entregas WHERE id='{cancel_delivery}';")=='t'
  (OUT/'resale-cancel.json').write_text(json.dumps(dict(group=grouped,cancel=cancelled),indent=2)+'\n')
  checks.append(dict(test='resale purchase partial reserve group cancellation restores three whole packs and preserves order link without receivable',status='PASS',delivery_id=cancel_delivery))

  reserved=json.loads(B.last(reserve_resale('resale-reserve-final-0001')))['itens'][0]
  grouped=json.loads(B.last(group_resale(reserved,'resale-group-final-0001')))
  delivery=grouped['itens'][0]['entrega_id']
  group_replay=json.loads(B.last(group_resale(reserved,'resale-group-final-0001')))
  assert group_replay['replay'] is True and group_replay['itens'][0]['entrega_id']==delivery,group_replay
  observed=B.last(f"SELECT updated_at FROM public.entregas WHERE id='{delivery}';")
  sent=json.loads(B.last(B.T.actor(Q.UADM)+f"SELECT public.rpc_entrega_enviar_manual_v1('{delivery}','{observed}','resale-send-0001');"))
  assert sent['success'] is True and sent['status']=='em_rota',sent
  sent_replay=json.loads(B.last(B.T.actor(Q.UADM)+f"SELECT public.rpc_entrega_enviar_manual_v1('{delivery}','{observed}','resale-send-0001');"))
  assert sent_replay['replay'] is True,sent_replay
  prove_resale(delivery,'resale-proof-0001')
  observed=B.last(f"SELECT updated_at FROM public.entregas WHERE id='{delivery}';")
  confirmed=json.loads(B.last(B.T.actor(Q.UADM)+f"SELECT public.rpc_entrega_confirmar_manual_v1('{delivery}','{observed}','resale-confirm-0001','{{\"nome\":\"LOCAL REVENDA\"}}'::jsonb);"))
  assert confirmed['success'] is True and confirmed['status']=='entregue',confirmed
  confirmed_replay=json.loads(B.last(B.T.actor(Q.UADM)+f"SELECT public.rpc_entrega_confirmar_manual_v1('{delivery}','{observed}','resale-confirm-0001','{{\"nome\":\"LOCAL REVENDA\"}}'::jsonb);"))
  assert confirmed_replay['replay'] is True,confirmed_replay
  containment=json.loads(B.last(f"""SELECT jsonb_build_object(
   'order_status',(SELECT status::text FROM public.partner_orders WHERE id='{order_id}'),
   'receivable_generated',(SELECT receivable_generated FROM public.partner_orders WHERE id='{order_id}'),
   'receivables',(SELECT count(*) FROM public.accounts_receivable),
   'fiscal_documents',(SELECT count(*) FROM public.fiscal_invoices),
   'delivery_receivable',(SELECT receivable_id FROM public.entregas WHERE id='{delivery}'),
   'production_programs',(SELECT count(*) FROM public.programacao_producao WHERE ordem_servico_id='{os_id}'),
   'production_links',(SELECT count(*) FROM public.production_order_link WHERE ordem_servico_id='{os_id}'),
   'cq',(SELECT count(*) FROM public.controle_qualidade q JOIN public.lotes l ON l.id=q.lote_id WHERE l.id='{received['lote_id']}'),
   'envase',(SELECT count(*) FROM public.envase e WHERE e.lote_id='{received['lote_id']}'),
   'expedition_movements',(SELECT count(*) FROM public.estoque_movimentacoes WHERE referencia_id='{delivery}' AND acao='expedicao'))::text;"""))
  assert containment['order_status']=='entregue' and containment['receivable_generated'] is False,containment
  assert {k:containment[k] for k in ('receivables','fiscal_documents')}==effect_baseline,(effect_baseline,containment)
  assert all(containment[k] in (0,None) for k in ('delivery_receivable','production_programs','production_links','cq','envase')),containment
  assert containment['expedition_movements']==1,containment
  containment['effect_baseline']=effect_baseline
  (OUT/'resale-delivery.json').write_text(json.dumps(dict(group=grouped,group_replay=group_replay,send=sent,send_replay=sent_replay,confirm=confirmed,confirm_replay=confirmed_replay,containment=containment),indent=2)+'\n')
  checks.append(dict(test='resale second reserve group send proof confirm and replays complete local B2B order with zero new NF receivable manufacture CQ envase',status='PASS',delivery_id=delivery))

  # Revisão independente 70d08c: cada caso exige contenção/conclusão somente
  # completa e reautorização após waits reais. Na execução ANTES, os oito casos
  # de quantidade/lock devem falhar sem interromper a evidência dos demais.
  Review70=load('review_70d08c',H/'review_70d08c.py')
  review70=Review70.run(B,Q,A,choice,dict(order_id=order_id,item_id=item['id'],expected=accepted['updated_at'],key='resale-os-create-0001'))
  (OUT/'review-70d08c.json').write_text(json.dumps(dict(review='70d08c',candidate_sha256=logistics['candidate_sha256'],hosted=False,results=review70),indent=2)+'\n')
  for row in review70:
   checks.append(dict(test='review70 '+row['name'],status=row['status'],detail=row.get('detail') or row.get('error')))

  manual=A.finished('quimico','kg',25,2)
  manual_reserved=json.loads(B.last(B.reserve(manual['os'],manual['stock'],2,'resale-manual-regression-reserve')))['itens'][0]
  manual_group=json.loads(B.last(B.group(manual['os'],manual_reserved,2,'resale-manual-regression-group')))
  manual_delivery=manual_group['itens'][0]['entrega_id']
  assert json.loads(B.last(B.send(manual_delivery,'resale-manual-regression-send')))['success'] is True
  B.prove(manual_delivery,'resale-manual-regression-proof')
  assert json.loads(B.last(B.confirm(manual_delivery,'resale-manual-regression-confirm')))['success'] is True
  checks.append(dict(test='manual agronomic physical flow still passes after resale candidate',status='PASS',delivery_id=manual_delivery))
  manifest=L.finish(B,OUT)
  assert manifest['default_enabled'] is False and manifest['new_client_grants']==[]
  after_rollback=B.run_raw(resale_call(Q.UADM,'resale-after-rollback-0001'))
  assert after_rollback.returncode!=0 and 'B2B_RESALE_GATE_CLOSED' in after_rollback.stderr,after_rollback.stderr
  checks.append(dict(test='resale POST hashes ACLs closed gate and deny-only rollback preserve history without reopening writers',status='PASS',candidate_sha256=logistics['candidate_sha256']))
  R.assert_current(B,OUT,'real-baselines-post-rollback.json',ROOT)
  checks.append(dict(test='ten receivable triggers ACL downstream guard and registration fence unchanged after logistics POST rollback',status='PASS'))
 except Exception:
  traceback.print_exc();checks.append(dict(test='new composition',status='FAIL'))
 finally:
  (OUT/'checks.json').write_text(json.dumps(checks,indent=2)+'\n')
 return 0 if checks and all(x['status']=='PASS' for x in checks) else 1
if __name__=='__main__':sys.exit(main())
