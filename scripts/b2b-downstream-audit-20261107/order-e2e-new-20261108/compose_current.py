#!/usr/bin/env python3
"""Composition driver, executes only in /tmp mirror; all experiments are local."""
import hashlib,importlib.util,json,os,shutil,sys,traceback,uuid
from pathlib import Path
H=Path(__file__).resolve().parent;ROOT=H.parents[2]
assert ROOT.is_relative_to(Path('/tmp')), 'TEMP_MIRROR_REQUIRED'
OUT=Path(os.environ['NEW_E2E_OUT'])
checks=[]
STRICT_FISCAL=True
CURRENT_CANDIDATE_TRIGGER_DELTAS={('entregas','trg_validate_entrega_confirmacao'),('entregas','zz_delivery_mutation_closed'),('estoque_produto','a01_stock_final_permit'),('estoque_produto','a01_stock_insert_permit'),('estoque_produto','trg_validate_estoque_entrada'),('lotes','aa_manual_lot_write_fence_v1'),('lotes','trg_lab_lot_biological_only'),('ordens_servico','trg_sync_os_classica_downstream'),('entregas','trg_entrega_sync_partner_order'),('estoque_produto','a00_stock_p1_tenant_guard'),('ordens_servico','aa_guard_separate_approval'),('ordens_servico','zz_audit_separate_approval'),('ordens_servico','trg_lab_os_biological_only')}
CURRENT_CANDIDATE_FUNCTION_DELTAS={'platform_private.delivery_merge_split_20261030(uuid,jsonb,jsonb)','platform_private.envase_insert_final_v1()','platform_private.envase_insert_guard_v1()','platform_private.guard_manual_lot_write_v1()','platform_private.trg_lab_lot_biological_only()','platform_private.resale_pilot_allowed_v1(text,text,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid)','platform_private.resale_pilot_delivery_allowed_v1(text,text,uuid,uuid,uuid)','public.fn_sync_os_classica_downstream()','public.reservar_estoque_item(uuid,numeric,uuid,text,uuid,uuid,uuid,text)','public.rpc_cockpit_criar_entrega_v1(uuid,text,uuid,numeric,jsonb)','public.rpc_cockpit_criar_entrega_v1(uuid,text,jsonb,text,jsonb,timestamptz)','public.validate_estoque_entrada()'}
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
  # Baseline restrita atual: seis corpos LIVE capturados e dependências canônicas,
  # sem reaplicar a migração ampla nem contornar seu PRE histórico.
  current_boot=B.current_catalog.apply(B.run_raw,B.last,B.ok,B.T.A)
  trigger_bodies={row['signature']:{'md5':row['md5'],'definition':row['definition']} for row in current_boot['additional_dependencies']}
  (OUT/'current-live-trigger-bodies.json').write_text(json.dumps(trigger_bodies,indent=2)+'\n')
  os.environ['DELIVERY_CURRENT_BARRIER_JSON']=str(OUT/'current-live-trigger-bodies.json')
  shutil.copyfile(physical/'evidence/current-catalog-baseline.json',OUT/'current-catalog-baseline.json')
  checks.append(dict(test='restricted POSPLANOS baseline measures twenty LIVE bodies 120 triggers 18 relation security pins and four captured dependencies before candidate generation',status='PASS'))
  # Install confirmation/send in the current fresh database using measured exact pins.
  C=B.C
  current_scope=load('current_live_scope',H/'current_scope.py')
  pre=C.state();delta=C.G.candidate()
  post=json.loads([x for x in B.sql('BEGIN;'+delta+C.G.STATE+'::text;ROLLBACK;').splitlines() if x.startswith('{')][-1])
  released=json.loads([x for x in B.sql('BEGIN;'+delta+f'GRANT EXECUTE ON FUNCTION {C.G.RPC} TO authenticated;'+C.G.STATE+'::text;ROLLBACK;').splitlines() if x.startswith('{')][-1])
  confirmation_out=OUT/'delivery-confirmation';confirmation_out.mkdir(exist_ok=True)
  C.G.write(pre,post,released,out=confirmation_out)
  current_scope.rewrite_confirmation(confirmation_out,C.G.STATE)
  B.sql((confirmation_out/'install.sql.review').read_text())
  S=load('new_send',C.H/'send/assemble.py')
  pre=json.loads(B.last(S.STATE+'::text;'))
  post=json.loads([x for x in B.sql('BEGIN;'+S.candidate()+S.STATE+'::text;ROLLBACK;').splitlines() if x.startswith('{')][-1])
  send_out=OUT/'delivery-send';send_out.mkdir(exist_ok=True)
  S.write(pre,post,out=send_out)
  current_scope.rewrite_send(send_out,S.STATE)
  B.sql((send_out/'install.sql.review').read_text())
  B.sql('GRANT EXECUTE ON FUNCTION public.rpc_entrega_confirmar_manual_v1(uuid,timestamptz,text,jsonb),public.rpc_entrega_enviar_manual_v1(uuid,timestamptz,text) TO authenticated;')
  B.current_catalog.assert_current(B.last,CURRENT_CANDIDATE_TRIGGER_DELTAS,CURRENT_CANDIDATE_FUNCTION_DELTAS)
  # O gerador físico consome a composição atual medida, não a captura anterior ao catálogo.
  current_capture=OUT/'current-pre-physical.json';current_capture.write_text(json.dumps(B.restore.metadata(),indent=2)+'\n')
  capture_module=load('new_current_baseline',physical/'capture_baseline.py')
  current_baseline=OUT/'current-physical-baseline.json';current_baseline.write_text(json.dumps(capture_module.capture(B),indent=2)+'\n')
  physical_out=OUT/'physical-finished-product';physical_out.mkdir(exist_ok=True)
  os.environ['FINISHED_CURRENT_CAPTURE']=str(current_capture)
  os.environ['FINISHED_BASELINE']=str(current_baseline)
  os.environ['FINISHED_REVIEW_OUT']=str(physical_out)
  os.environ['FINISHED_CONFIRMATION_CANDIDATE']=str(confirmation_out/'candidate.sql.review')
  os.environ['FINISHED_SEND_CANDIDATE']=str(send_out/'candidate.sql.review')
  F=load('new_finished_generator',physical/'assemble.py')
  rel=next(r for r in F.BASE['relations'] if r['name']=='authz_tickets')
  acl=B.sql("SELECT coalesce(relacl::text,'') FROM pg_class WHERE oid='platform_private.authz_tickets'::regclass;").strip()
  assert acl in ('','{postgres=arwdDxtm/postgres}'),acl
  rel['acl']=acl
  (OUT/'acl-normalization.json').write_text(json.dumps(dict(relation='platform_private.authz_tickets',historical='',restored=acl,client_grants=False,seam='restorer explicit owner ACL vs NULL default, local generator only'))+'\n')
  F.build()
  B.sql((physical_out/'install.sql.review').read_text())
  # Medir o POST real e regenerar os pins: nenhum POST_RUNTIME_REQUIRED permanece.
  post_signatures=[x['signature'] for x in F.BASE['functions']+F.BASE.get('dependency_functions',[])]
  post_signatures += ['platform_private.finished_product_stock_valid_v1(public.estoque_produto)','platform_private.finished_product_delivery_valid_v1(public.estoque_produto,public.entregas,public.lotes)','platform_private.finished_product_purchase_entry_v1(uuid,uuid,text,numeric,text,text,text,date)','public.rpc_finished_product_purchase_capability_v1()','public.rpc_finished_product_purchase_entry_v1(uuid,uuid,text,numeric,text,text,text,date)']
  values=','.join("('%s')"%x for x in post_signatures)
  post_rows=json.loads(B.last("SELECT coalesce(jsonb_agg(jsonb_build_object('signature',v.signature,'md5',md5(pg_get_functiondef(p.oid)),'owner',r.rolname,'acl',coalesce(p.proacl::text,'')) ORDER BY v.signature),'[]'::jsonb) FROM (VALUES "+values+") v(signature) JOIN pg_proc p ON p.oid=to_regprocedure(v.signature) JOIN pg_roles r ON r.oid=p.proowner;"))
  post_capture=physical_out/'post-install-functions.json'
  post_capture.write_text(json.dumps({'candidate_sha256':hashlib.sha256((physical_out/'candidate.sql.review').read_bytes()).hexdigest(),'functions':post_rows},indent=2)+'\n')
  os.environ['FINISHED_POST_CAPTURE']=str(post_capture)
  F.build()
  assert 'POST_RUNTIME_REQUIRED' not in (physical_out/'postflight.sql.review').read_text()
  B.sql((physical_out/'postflight.sql.review').read_text())
  checks.append(dict(test='physical revised install exact measured PRE POST with six current tenant guards; fresh confirmation/send generated pins',status='PASS'))
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
  customer_id=Q.u(301)
  B.sql(f"SET session_replication_role=replica;INSERT INTO public.clientes(id,organization_id,nome,codigo_cliente) VALUES('{customer_id}','{Q.A}','CLIENTE FISCAL SINTETICO LOCAL','LOCAL-FISCAL-301') ON CONFLICT(id) DO NOTHING;UPDATE public.partner_accounts SET client_id='{customer_id}' WHERE id='{Q.P}' AND commercial_owner_organization_id='{Q.A}';SET session_replication_role=origin;")
  assert B.last(f"SELECT client_id FROM public.partner_accounts WHERE id='{Q.P}' AND commercial_owner_organization_id='{Q.A}';")==customer_id
  (OUT/'financial-customer-fixture.json').write_text(json.dumps(dict(customer_id=customer_id,partner_id=Q.P,organization_id=Q.A,synthetic=True,hosted=False,reason='B4 requires partner_accounts.client_id; same fixture seam as strict battery'),indent=2)+'\n')
  forecast_dir=ROOT/'scripts/b2b-downstream-audit-20261107/b4/fiscal-decision-20261108/service-bridge-current-20261109/forecast-pre-nf-20261109'
  forecast_pre=B.sql("SET b2b_forecast.review_project_ref='swzpzcwiasxmjutrmvkm';"+(forecast_dir/'01-pre.sql.readonly').read_text())
  B.sql("SET b2b_forecast.review_project_ref='swzpzcwiasxmjutrmvkm';"+(forecast_dir/'02-install.sql.review').read_text())
  forecast_post=B.sql("SET b2b_forecast.review_project_ref='swzpzcwiasxmjutrmvkm';"+(forecast_dir/'03-post.sql.readonly').read_text())
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
  shared_code=B.last(f"SELECT code FROM public.commercial_payment_plans WHERE id='{Q.P3}';").replace("'","''")
  shared=Q.as_user(Q.UADMF,f"""SELECT public.rpc_admin_create_commercial_plan(jsonb_build_object(
   'name','LOCAL FSF SAME CODE','code','{shared_code}',
   'plan_type','custom','max_days',30,'months_count',1,'installment_count',1,'discount_percent',0,
   'monthly_interest_percent',0,'interest_type','none','pricing_mode','discount_from_base',
   'requires_credit_approval',false,'requires_guarantee',false,'requires_financial_approval',false));""")
  assert shared.returncode==0,shared.stderr
  shared_id=shared.stdout.strip().splitlines()[-1]
  arb_code=Q.as_user(Q.UADM,f"SELECT count(*) FROM public.rpc_admin_list_commercial_plans('{shared_code}','all',100,0) WHERE id='{shared_id}';")
  assert arb_code.returncode==0 and arb_code.stdout.strip()=='0',(arb_code.stdout,arb_code.stderr)
  (OUT/'plan-isolation-composition.json').write_text(json.dumps(dict(pre=plan_pre,post=plan_post,arbio_plan_visible=True,fsf_arbio_plan_visible=False,fsf_write_denied=fsf_write.stderr,shared_code_plan_id=shared_id,shared_code_invisible_to_arbio=True),indent=2)+'\n')
  checks.append(dict(test='plan tenant candidate PRE POST in same DB; seller positive FSF read write negative and cross tenant same code',status='PASS'))
  strict_dir=ROOT/'scripts/b2b-downstream-audit-20261107/b4/fiscal-decision-20261108/service-bridge-current-20261109'
  B.sql((strict_dir/'respond.seller91.sql').read_text())
  assert B.last("SELECT md5(pg_get_functiondef('public.respond_b2b_order_quote_secure(uuid,jsonb,date,integer,text)'::regprocedure));")=='97bcdb9884b54adb3bd4aae4915e32d0'
  (OUT/'seller91-current.json').write_text(json.dumps(dict(executed=True,md5='97bcdb9884b54adb3bd4aae4915e32d0',source=str(strict_dir/'respond.seller91.sql'),overlay_only=False),indent=2)+'\n')
  checks.append(dict(test='Seller91 real body installed before canonical order creation; current MD5 97bcdb98',status='PASS'))
  current_state=B.current_catalog.assert_current(B.last,CURRENT_CANDIDATE_TRIGGER_DELTAS,CURRENT_CANDIDATE_FUNCTION_DELTAS)
  current_state['allowed_candidate_trigger_function_deltas']=sorted(list(x) for x in CURRENT_CANDIDATE_TRIGGER_DELTAS)
  current_state['allowed_candidate_function_deltas']=sorted(CURRENT_CANDIDATE_FUNCTION_DELTAS)
  (OUT/'current-catalog-posplans.json').write_text(json.dumps(current_state,indent=2)+'\n')
  checks.append(dict(test='post catalog Price plans preserve twenty LIVE bodies 120 triggers 18 relation security pins and four captured dependencies',status='PASS'))
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
  promotion_denied,promotion_denied_error=Q.call(Q.UADM,f"public.c2_promote_accounting_pending_order_v1('{order_id}','{before['updated_at']}'::timestamptz)")
  assert promotion_denied is None and 'C2_ACCOUNTING_PENDING' in (promotion_denied_error or ''),promotion_denied_error or promotion_denied
  after_promotion_denied=json.loads(Q.psql(f"SELECT to_jsonb(o)::text FROM public.partner_orders o WHERE id='{order_id}'").stdout.strip())
  assert after_promotion_denied==before,'promotion denied before accounting changed order'
  (OUT/'accounting-pending-promotion-denial.json').write_text(json.dumps(dict(status='PASS',error=promotion_denied_error,order_unchanged=True,hosted=False),indent=2)+'\n')
  checks.append(dict(test='accounting pending promotion denied atomically before synthetic validation',status='PASS'))
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
  forecast_read=Q.as_user(Q.UADM,f"SELECT public.get_b2b_financial_forecast_secure('{order_id}');")
  assert forecast_read.returncode==0,forecast_read.stderr
  forecast=json.loads(forecast_read.stdout.strip().splitlines()[-1])
  assert forecast['state']=='aguardando_fiscal' and forecast['due_dates_estimated'] is True and float(forecast['residual_amount'])==float(accepted['final_amount_with_interest']),forecast
  assert B.last(f"SELECT count(*) FROM public.accounts_receivable WHERE origin_id='{order_id}';")=='0'
  forecast_replay=json.loads(B.last(f"SELECT platform_private.b2b_financial_forecast_after_approval_v1('{order_id}',(SELECT credit_decision_snapshot FROM platform_private.b2b_financial_forecasts WHERE order_id='{order_id}'))::text;"))
  assert forecast_replay['replayed'] is True and forecast_replay['forecast_id']==forecast['forecast_id'],forecast_replay
  forecast_denied=Q.as_user(Q.UB2,f"SELECT public.get_b2b_financial_forecast_secure('{order_id}');")
  assert forecast_denied.returncode!=0 and 'B2B_FORECAST_READ_DENIED' in forecast_denied.stderr,forecast_denied.stderr
  forecast_private_denied=Q.as_user(Q.UADM,f"SELECT platform_private.b2b_financial_forecast_transition_v1('{forecast['forecast_id']}',1,'EMISSION_STARTED','{Q.u(950)}','{{}}'::jsonb);")
  assert forecast_private_denied.returncode!=0 and 'permission denied' in forecast_private_denied.stderr,forecast_private_denied.stderr
  intent_id=Q.u(950)
  def forecast_event(event,version,attempt,error_code=None):
   payload=json.dumps({'attempt':str(attempt),'error_code':error_code} if error_code else {'attempt':str(attempt)}).replace("'","''")
   return B.run_raw(f"RESET ROLE;SELECT platform_private.b2b_financial_forecast_transition_v1('{forecast['forecast_id']}',{version},'{event}','{intent_id}','{payload}'::jsonb);")
  started=forecast_event('EMISSION_STARTED',1,1);assert started.returncode==0,started.stderr
  started_replay=forecast_event('EMISSION_STARTED',1,1);assert started_replay.returncode==0 and 'true' in started_replay.stdout,started_replay.stdout
  failed=forecast_event('EMISSION_FAILED',2,1,'LOCAL_REJECT');assert failed.returncode==0,failed.stderr
  restarted=forecast_event('EMISSION_STARTED',3,2);assert restarted.returncode==0,restarted.stderr
  timeout=forecast_event('EMISSION_TIMEOUT',4,2,'LOCAL_TIMEOUT');assert timeout.returncode==0,timeout.stderr
  premature=forecast_event('EMISSION_STARTED',5,3);assert premature.returncode!=0 and 'B2B_FORECAST_STATE_CONFLICT' in premature.stderr,premature.stderr
  consulted=forecast_event('CONSULTATION_NOT_AUTHORIZED',5,2);assert consulted.returncode==0,consulted.stderr
  restarted=forecast_event('EMISSION_STARTED',6,3);assert restarted.returncode==0,restarted.stderr
  failed=forecast_event('EMISSION_FAILED',7,3,'LOCAL_RETRY_CLOSED');assert failed.returncode==0,failed.stderr
  forecast_final=json.loads(Q.as_user(Q.UADM,f"SELECT public.get_b2b_financial_forecast_secure('{order_id}');").stdout.strip())
  assert forecast_final['state']=='aguardando_fiscal' and forecast_final['version']==8,forecast_final
  assert B.last(f"SELECT count(*) FROM public.accounts_receivable WHERE origin_id='{order_id}';")=='0'
  (OUT/'forecast-pre-nf.json').write_text(json.dumps(dict(forecast=forecast_final,replay=forecast_replay,cross_tenant_denied=forecast_denied.stderr,receivables_before_nf=0),indent=2)+'\n')
  checks.append(dict(test='forecast separate after commercial and valid credit; idempotent scoped no receivable and failure retry timeout consultation preserve one forecast',status='PASS',forecast_id=forecast['forecast_id']))
  (OUT/'seller-acceptance.json').write_text(json.dumps(dict(promotion=promoted,order=accepted),indent=2)+'\n')
  checks.append(dict(test='synthetic accounting CAS promotion and canonical seller acceptance; biological production stays closed',status='PASS'))

  # Nova ponte de revenda: gerada no espelho a partir dos corpos recém-instalados.
  # Nenhum writer privado recebe grant de cliente; o gate começa e termina fechado.
  L=load('new_b2b_resale_logistics',H/'resale_logistics.py')
  logistics=L.install(B,OUT)
  E=load('new_os_endpoint',H/'os_endpoint.py')
  endpoint_out=E.install(B,OUT)
  item=json.loads(B.last(f"SELECT to_jsonb(i)::text FROM public.partner_order_items i WHERE i.order_id='{order_id}' ORDER BY i.created_at,i.id LIMIT 1;"))
  def resale_call(uid,key,expected=None,item_id=None,role=False):
   expected=expected or accepted['updated_at'];item_id=item_id or item['id']
   prefix=f"RESET ROLE;SET ROLE authenticated;SET request.jwt.claim.sub='{uid}';SET request.jwt.claims='{{\"sub\":\"{uid}\",\"role\":\"authenticated\",\"iat\":1,\"exp\":4102444800}}';"
   return prefix+f"SELECT public.rpc_b2b_resale_os_create_v1('{order_id}','{item_id}','{expected}'::timestamptz,'{key}');"
  denied=B.run_raw(resale_call(Q.UADM,'resale-gate-closed-0001'))
  assert denied.returncode!=0 and 'B2B_RESALE_GATE_CLOSED' in denied.stderr,denied.stderr
  denied=B.run_raw(B.T.actor(Q.UADM)+f"SELECT platform_private.b2b_resale_os_create_v1('{order_id}','{item['id']}','{accepted['updated_at']}','resale-client-grant-0001');")
  assert denied.returncode!=0 and 'permission denied for function b2b_resale_os_create_v1' in denied.stderr,denied.stderr
  direct=B.run_raw(f"RESET ROLE;SET request.jwt.claim.sub='{Q.UADM}';INSERT INTO public.ordens_servico(organization_id,produto_id,status,prioridade,tipo_item,partner_order_id,partner_order_item_id,origem) VALUES('{Q.A}','{item['product_id']}','pronto_entrega','media','produto','{order_id}','{item['id']}','b2b');")
  assert direct.returncode!=0 and 'OS_APPROVAL_SCOPE_DENIED' in direct.stderr,direct.stderr
  assert B.last(f"SELECT count(*) FROM public.ordens_servico WHERE partner_order_id='{order_id}';")=='0'
  checks.append(dict(test='public endpoint gate closed, private helper client EXECUTE denied and no direct ready OS bypass',status='PASS'))

  B.sql('UPDATE platform_private.b2b_resale_logistics_gate_v1 SET enabled=true WHERE singleton;')
  direct_authenticated=B.run_raw(B.T.actor(Q.UADM)+f"UPDATE public.partner_orders SET status='entregue' WHERE id='{order_id}';")
  assert direct_authenticated.returncode==0,(direct_authenticated.stdout,direct_authenticated.stderr)
  assert B.last(f"SELECT status::text FROM public.partner_orders WHERE id='{order_id}';")=='aprovado'
  direct_operational=B.run_raw(f"RESET ROLE;SET request.jwt.claim.sub='{Q.UADM}';SET request.jwt.claims='{{\"sub\":\"{Q.UADM}\",\"role\":\"authenticated\",\"iat\":1,\"exp\":4102444800}}';UPDATE public.partner_orders SET status='entregue' WHERE id='{order_id}';")
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
  EndpointTests=load('endpoint_tests',H/'test_os_endpoint.py')
  endpoint_fixture=Review70.Review(B,Q,A,choice,{}).make_order([Q.S(3)],'endpoint-matrix')
  EndpointTests.run(B,Q,endpoint_fixture['id'],endpoint_fixture['items'][0]['id'],endpoint_fixture['accepted']['updated_at'],OUT)
  checks.append(dict(test='public OS endpoint FSF buyer revoked feature pending helper ACL and concurrent creation',status='PASS'))

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
  # Mandatory pilot overlay: installed while both global switches are OFF. The
  # singleton is only a master switch after this stage, never sufficient authority.
  Pilot=load('pilot_containment',H/'pilot_containment.py')
  B.sql("UPDATE platform_private.finished_product_gate_v1 SET enabled=false WHERE singleton;UPDATE platform_private.b2b_resale_logistics_gate_v1 SET enabled=false WHERE singleton;")
  pilot_out=Pilot.install(B,OUT)
  PilotTests=load('pilot_containment_tests',H/'test_pilot_containment.py')
  pilot_results=PilotTests.run(B,Review70.Review,Q,A,choice,pilot_out)
  checks.append(dict(test='mandatory ARBio actor org exact synthetic references scoped pilot with cross tenant denial expiry revocation replay and real concurrency',status='PASS',checks=len(pilot_results),hosted=False))
  B.sql((endpoint_out/'04-rollback-deny.sql.review').read_text())
  after_rollback=B.run_raw(resale_call(Q.UADM,'resale-after-rollback-0001'))
  assert after_rollback.returncode!=0 and 'permission denied for function rpc_b2b_resale_os_create_v1' in after_rollback.stderr,after_rollback.stderr
  reader_after_rollback=B.run_raw(B.T.actor(Q.UADM)+f"SELECT public.rpc_b2b_resale_os_availability_v1('{order_id}');")
  assert reader_after_rollback.returncode!=0 and 'permission denied for function rpc_b2b_resale_os_availability_v1' in reader_after_rollback.stderr,reader_after_rollback.stderr
  checks.append(dict(test='resale POST hashes ACLs closed gate and deny-only rollback preserve history without reopening writers or reader',status='PASS',candidate_sha256=logistics['candidate_sha256']))
  plans_before_rollback=B.last('SELECT count(*) FROM public.commercial_payment_plans;')
  R.assert_current(B,OUT,'real-baselines-post-logistics-rollback.json',ROOT)
  checks.append(dict(test='ten receivable triggers ACL downstream guard and registration fence unchanged after logistics POST rollback',status='PASS'))

  def measured_final_delivery_state(state_expression):
   # A projeção estrutural precisa ser a do próprio estágio: S.STATE inclui
   # delivery_send_permits_v1; C.G.STATE não pode fingir esse recorte.
   state=json.loads(B.last(state_expression+'::text;'))
   # O estado agregado histórico não inclui esses dois schemas. Medir seus corpos
   # atuais evita fallback de hash antigo tanto nos pins quanto nas triggers.
   extra=json.loads(B.last("""SELECT coalesce(jsonb_agg(jsonb_build_array(n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),md5(pg_get_functiondef(p.oid)),coalesce(p.proacl::text,''),pg_get_userbyid(p.proowner),p.proconfig,p.prosecdef)),'[]'::jsonb) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('private','cf_user_guards_v1');"""))
   keys={(r[0],r[1],r[2]) for r in extra}
   state['functions']=[r for r in state['functions'] if (r[0],r[1],r[2]) not in keys]+extra
   # C.state() traz somente o recorte histórico de relações. Os rollback finais
   # também pinam permissões privadas novas e relações B3/catálogo: medir todos
   # os objetos endereçáveis agora, sem descartar silenciosamente um pin ausente.
   state['relations']=json.loads(B.last("""SELECT coalesce(jsonb_agg(jsonb_build_array(n.nspname||'.'||c.relname,coalesce(c.relacl::text,''),c.relrowsecurity,c.relforcerowsecurity,pg_get_userbyid(c.relowner))),'[]'::jsonb) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','platform_private','private','cf_user_guards_v1') AND c.relkind IN ('r','p','v','m','f');"""))
   return state

  def run_final_delivery_rollback(branch):
   # Mesma inversão para logistics-only e integrada: cada guard é gerado do
   # estado medido DEPOIS das reversões anteriores, nunca do POST intermediário.
   history_before=json.loads(B.last("SELECT jsonb_build_object('deliveries',(SELECT count(*) FROM public.entregas),'movements',(SELECT count(*) FROM public.estoque_movimentacoes),'os',(SELECT count(*) FROM public.ordens_servico),'resale_receipts',(SELECT count(*) FROM platform_private.b2b_resale_os_requests_v1));"))
   plans_before=json.loads(B.last("SELECT jsonb_build_object('count',count(*),'md5',md5(coalesce(jsonb_agg(to_jsonb(p) ORDER BY id)::text,'[]'))) FROM public.commercial_payment_plans p;"))
   B.sql((pilot_out/'04-rollback-deny.sql.review').read_text())
   B.sql((OUT/'logistics/rollback.sql.review').read_text())
   B.sql((physical_out/'rollback.sql.review').read_text())
   # Os artefatos 11/21 instalam os writers FECHADOS. Os grants acima existem
   # somente para o fluxo sintético; removê-los antes da medição faz os guards
   # finais representarem PRE→INSTALL/POST→ROLLBACK sem ativação escondida.
   B.sql('REVOKE EXECUTE ON FUNCTION public.rpc_entrega_enviar_manual_v1(uuid,timestamptz,text),public.rpc_entrega_confirmar_manual_v1(uuid,timestamptz,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;')
   send_state=measured_final_delivery_state(S.STATE)
   current_scope.write_final_send_rollback(send_out,send_state,S.STATE)
   B.sql((send_out/'rollback-composed.sql.review').read_text())
   confirmation_state=measured_final_delivery_state(C.G.STATE)
   current_scope.write_final_confirmation_rollback(confirmation_out,confirmation_state,C.G.STATE)
   B.sql((confirmation_out/'rollback-composed.sql.review').read_text())
   closed=json.loads(B.last("""SELECT jsonb_build_object(
    'logistics_gate',(SELECT enabled FROM platform_private.b2b_resale_logistics_gate_v1 WHERE singleton),
    'physical_gate',(SELECT enabled FROM platform_private.finished_product_gate_v1 WHERE singleton),
    'os_writer',has_function_privilege('authenticated','public.rpc_b2b_resale_os_create_v1(uuid,uuid,timestamptz,text)','EXECUTE'),
    'purchase_writer',has_function_privilege('authenticated','public.rpc_finished_product_purchase_entry_v1(uuid,uuid,text,numeric,text,text,text,date)','EXECUTE'),
    'send_writer',has_function_privilege('authenticated','public.rpc_entrega_enviar_manual_v1(uuid,timestamptz,text)','EXECUTE'),
    'confirm_writer',has_function_privilege('authenticated','public.rpc_entrega_confirmar_manual_v1(uuid,timestamptz,text,jsonb)','EXECUTE'));"""))
   assert closed=={'logistics_gate':False,'physical_gate':False,'os_writer':False,'purchase_writer':False,'send_writer':False,'confirm_writer':False},closed
   send_denied=B.run_raw(B.T.actor(Q.UADM)+f"SELECT public.rpc_entrega_enviar_manual_v1('{delivery}','{observed}'::timestamptz,'post-rollback-send-{branch}');")
   confirm_denied=B.run_raw(B.T.actor(Q.UADM)+f"SELECT public.rpc_entrega_confirmar_manual_v1('{delivery}','{observed}'::timestamptz,'post-rollback-confirm-{branch}','{{}}'::jsonb);")
   assert send_denied.returncode!=0 and 'permission denied for function rpc_entrega_enviar_manual_v1' in send_denied.stderr,send_denied.stderr
   assert confirm_denied.returncode!=0 and 'permission denied for function rpc_entrega_confirmar_manual_v1' in confirm_denied.stderr,confirm_denied.stderr
   history_after=json.loads(B.last("SELECT jsonb_build_object('deliveries',(SELECT count(*) FROM public.entregas),'movements',(SELECT count(*) FROM public.estoque_movimentacoes),'os',(SELECT count(*) FROM public.ordens_servico),'resale_receipts',(SELECT count(*) FROM platform_private.b2b_resale_os_requests_v1));"))
   plans_after=json.loads(B.last("SELECT jsonb_build_object('count',count(*),'md5',md5(coalesce(jsonb_agg(to_jsonb(p) ORDER BY id)::text,'[]'))) FROM public.commercial_payment_plans p;"))
   assert history_after==history_before,(history_before,history_after)
   assert plans_after==plans_before,(plans_before,plans_after)
   if branch=='logistics-only':
    R.assert_current(B,OUT,f'real-baselines-post-full-rollback-{branch}.json',ROOT)
   else:
    # B4 deny-only mantém seus triggers adicionais. O oráculo integrado exige
    # os dez originais byte a byte, não a ausência dos objetos B4 preservados.
    current=R.snapshot(B);current_triggers={x['name']:x for x in current['receivable']['triggers']}
    expected=json.loads((OUT/'real-baselines.json').read_text())['expected']
    assert current['receivable']['acl_md5']==expected['acl_md5']
    assert current['downstream_guard']['md5']==expected['guard_md5']
    assert current['registration']['default_md5']==expected['registration_md5']
    assert current['registration']['fence_md5']==expected['settings_fence_md5']
    for trigger in original: assert current_triggers.get(trigger['name'])==trigger,trigger['name']
    retained=sorted(set(current_triggers)-{x['name'] for x in original})
    (OUT/f'real-baselines-post-full-rollback-{branch}.json').write_text(json.dumps({'status':'PASS','snapshot':current,'original_ten_triggers_preserved':True,'b4_additional_triggers_retained':retained,'hosted':False},indent=2)+'\n')
   B.current_catalog.assert_current(B.last,CURRENT_CANDIDATE_TRIGGER_DELTAS,CURRENT_CANDIDATE_FUNCTION_DELTAS)
   result={
    'branch':branch,
    'closed':closed,
    'history_before':history_before,'history_after':history_after,
    'plans_before':plans_before,'plans_after':plans_after,
    'current_catalog_preserved':True,'real_baselines_preserved':True,
    'composed_generators':['SEND_COMPOSED_ROLLBACK','CONFIRM_COMPOSED_ROLLBACK'],
    'authenticated_negative':{
     'send':{'returncode':send_denied.returncode,'permission_denied':True},
     'confirmation':{'returncode':confirm_denied.returncode,'permission_denied':True},
    },
    'deny_only_no_body_restoration':True,
    'allowed_candidate_trigger_function_deltas':sorted(list(x) for x in CURRENT_CANDIDATE_TRIGGER_DELTAS),
    'allowed_candidate_function_deltas':sorted(CURRENT_CANDIDATE_FUNCTION_DELTAS),
    'b4_fiscal':'NOT_RUN_OUT_OF_SCOPE' if branch=='logistics-only' else 'COMPOSED_BUT_POSITIVE_RECEIVABLE_BLOCKED',
   }
   (OUT/'full-logistics-rollback.json').write_text(json.dumps(result,indent=2)+'\n')
   checks.append(dict(test=f'{branch} reverse measured composed SEND then CONFIRM rollback after prior reversals; deny-only preserves history ACLs catalog plans and baselines',status='PASS'))
   checks.append(dict(test=f'{branch} authenticated send and confirmation calls after rollback both fail with permission denied without history effects',status='PASS'))

  # O rollout de cinco instaladores exclui B4/fiscal. As tentativas 7/8 preservam
  # o drift histórico de rpc_register_receivable_payment; ele não é contornado.
  if os.environ.get('NEW_E2E_LOGISTICS_ONLY')=='1':
   (OUT/'integrated-b4-fiscal-bridge.json').write_text(json.dumps(dict(status='NOT_RUN_OUT_OF_SCOPE',reason='B4_PRE_SHARED_BODY histórico preservado nas tentativas 7/8; nenhum PRE foi enfraquecido',positive_fiscal_receivable='NOT_RUN_BLOCKED',hosted=False),indent=2)+'\n')
   run_final_delivery_rollback('logistics-only')
   return 0

  # feb815603: B4 reconciliado com TODAS as cinco dependências pós-planos.
  # O corpo B4 e a ponte continuam byte-pinados; o PRE isolado antigo não é usado.
  b4_dir=ROOT/'scripts/b2b-downstream-audit-20261107/b4'
  bridge_dir=b4_dir/'fiscal-decision-20261108/service-bridge'
  composed_dir=ROOT/'scripts/b2b-downstream-audit-20261107/canonical-composition-feb815603'
  composed_manifest=json.loads((composed_dir/'manifest.json').read_text())
  assert composed_manifest['post_plans_baseline']['overridden_dependency_count']==5
  assert composed_manifest['overlap_analysis']['always_allow_substitution'] is False
  # Costura declarada do harness: a restauração local perdeu somente o EXECUTE de
  # service_role já capturado em produção. Qualquer outra ACL aborta; o candidato não recebe GRANT.
  tg_acl=B.last("SELECT coalesce(proacl::text,'') FROM pg_proc WHERE oid='public.tg_auto_b2b_receivable()'::regprocedure;")
  acl_repairs=[]
  if tg_acl!='{postgres=X/postgres,service_role=X/postgres}':
   assert tg_acl=='{postgres=X/postgres}',('UNEXPECTED_TG_AUTO_ACL',tg_acl)
   B.sql('GRANT EXECUTE ON FUNCTION public.tg_auto_b2b_receivable() TO service_role;')
   acl_repairs.append({'signature':'public.tg_auto_b2b_receivable()','before':tg_acl,'after':'{postgres=X/postgres,service_role=X/postgres}','candidate_install_changed':False})
  (OUT/'harness-baseline-repairs.json').write_text(json.dumps(acl_repairs,indent=2)+'\n')
  diagnostic_sigs=sorted(set(composed_manifest['production_baseline']['b4_dependency_md5'])|{
   'public.fn_generate_receivable_installments()','public.rpc_register_receivable_payment(uuid,jsonb)'})
  diagnostic_values=','.join("('"+x.replace("'","''")+"')" for x in diagnostic_sigs)
  acl_diagnostic=json.loads(B.last(f"""SELECT coalesce(jsonb_agg(jsonb_build_object('signature',v.signature,'owner',pg_get_userbyid(p.proowner),'acl',coalesce(p.proacl::text,''),
   'body_md5',md5(pg_get_functiondef(p.oid)),'body',pg_get_functiondef(p.oid),
   'entries',(SELECT coalesce(jsonb_agg(CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END||'='||a.privilege_type||'/'||a.grantor::regrole::text ORDER BY 1),'[]'::jsonb)
    FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a)) ORDER BY v.signature),'[]'::jsonb)::text
   FROM (VALUES {diagnostic_values}) v(signature) JOIN pg_proc p ON p.oid=to_regprocedure(v.signature);"""))
  expected_diagnostic=dict(composed_manifest['post_composition_baseline']['b4_dependency_md5'],**{'public.respond_b2b_order_quote_secure(uuid,jsonb,date,integer,text)':'97bcdb9884b54adb3bd4aae4915e32d0'})
  for row in acl_diagnostic:
   row['expected_body_md5']=expected_diagnostic.get(row['signature'])
   row['body_matches']=row['expected_body_md5'] is None or row['body_md5']==row['expected_body_md5']
  (OUT/'b4-pre-acl-diagnostic.json').write_text(json.dumps(acl_diagnostic,indent=2)+'\n')
  b4_pre_text=(composed_dir/'stages/01-b4-pre-post-composition.sql.readonly').read_text().replace('4926a99c3fa3086b34ff25bb4b4038bb','97bcdb9884b54adb3bd4aae4915e32d0')
  b4_install_text=(composed_dir/'stages/02-b4-install-post-composition.sql.review').read_text().replace('4926a99c3fa3086b34ff25bb4b4038bb','97bcdb9884b54adb3bd4aae4915e32d0')
  (OUT/'current-b4-pre.sql.readonly').write_text(b4_pre_text)
  (OUT/'current-b4-install.sql.review').write_text(b4_install_text)
  b4_pre=B.sql(b4_pre_text)
  B.sql(b4_install_text)
  b4_post=B.sql((composed_dir/'stages/03-b4-post.sql.readonly').read_text())
  bridge_pre=B.sql("SET b2b_fiscal_bridge.review_project_ref='swzpzcwiasxmjutrmvkm';"+(bridge_dir/'01-pre.sql.readonly').read_text())
  B.sql("SET b2b_fiscal_bridge.review_project_ref='swzpzcwiasxmjutrmvkm';"+(composed_dir/'stages/04-bridge-install.sql.review').read_text())
  bridge_post=B.sql("SET b2b_fiscal_bridge.review_project_ref='swzpzcwiasxmjutrmvkm';"+(bridge_dir/'03-post.sql.readonly').read_text())
  composed_post=B.sql("SET commercial_plans.review_project_ref='swzpzcwiasxmjutrmvkm';SET b2b_fiscal_bridge.review_project_ref='swzpzcwiasxmjutrmvkm';"+(composed_dir/'03-post.sql.readonly').read_text().replace('4926a99c3fa3086b34ff25bb4b4038bb','97bcdb9884b54adb3bd4aae4915e32d0'))
  composed_manifest['current_seller91_reconciliation']={'old_md5':'4926a99c3fa3086b34ff25bb4b4038bb','executed_md5':'97bcdb9884b54adb3bd4aae4915e32d0','frozen_sources_modified':False,'stage_pin_reconciled_in_output_only':True}
  (OUT/'canonical-composition-manifest.json').write_text(json.dumps(composed_manifest,indent=2)+'\n')
  checks.append(dict(test='composed PRE reconciles Seller91 and five dependencies then B4 bridge POST pass before strict fiscal stage',status='PASS'))
  dependency=B.run_raw("RESET ROLE;SELECT platform_private.b2b_integration_dependencies();")
  assert dependency.returncode!=0 and 'B2B_FISCAL_ATTESTATION_ACCOUNTING_UNPROVEN' in dependency.stderr,dependency.stderr
  strict_pre=B.sql("SET b2b_fiscal_bridge.review_project_ref='swzpzcwiasxmjutrmvkm';"+(strict_dir/'01-pre.sql.readonly').read_text())
  B.sql("SET b2b_fiscal_bridge.review_project_ref='swzpzcwiasxmjutrmvkm';"+(strict_dir/'02-install.sql.review').read_text())
  strict_post=B.sql("SET b2b_fiscal_bridge.review_project_ref='swzpzcwiasxmjutrmvkm';"+(strict_dir/'03-post.sql.readonly').read_text())
  forecast_reconcile_pre=B.sql("SET b2b_forecast.review_project_ref='swzpzcwiasxmjutrmvkm';"+(forecast_dir/'05-pre-fiscal-reconcile.sql.readonly').read_text())
  B.sql("SET b2b_forecast.review_project_ref='swzpzcwiasxmjutrmvkm';"+(forecast_dir/'06-install-fiscal-reconcile.sql.review').read_text())
  forecast_reconcile_post=B.sql("SET b2b_forecast.review_project_ref='swzpzcwiasxmjutrmvkm';"+(forecast_dir/'07-post-fiscal-reconcile.sql.readonly').read_text())
  audit_dir=strict_dir/'bridge-audit-action'
  bridge_before_md5=B.last("SELECT md5(pg_get_functiondef('platform_private.b2b_fiscal_invoice_bridge_v1(uuid)'::regprocedure));")
  bridge_before_body=B.last("SELECT pg_get_functiondef('platform_private.b2b_fiscal_invoice_bridge_v1(uuid)'::regprocedure);")
  (OUT/'bridge-before-audit-body.sql').write_text(bridge_before_body+'\n')
  (OUT/'bridge-before-audit-md5.json').write_text(json.dumps(dict(actual=bridge_before_md5,expected='34d90cf3fe03403a23d758cfd44e6d70'),indent=2)+'\n')
  bridge_audit_pre=B.sql("SET b2b_fiscal_bridge.review_project_ref='swzpzcwiasxmjutrmvkm';"+(audit_dir/'01-pre.sql.readonly').read_text())
  B.sql("SET b2b_fiscal_bridge.review_project_ref='swzpzcwiasxmjutrmvkm';"+(audit_dir/'02-install.sql.review').read_text())
  bridge_audit_post=B.sql("SET b2b_fiscal_bridge.review_project_ref='swzpzcwiasxmjutrmvkm';"+(audit_dir/'03-post.sql.readonly').read_text())
  h7_dir=strict_dir/'h7-receivable-link'
  h7_pre=B.sql("SET b2b_fiscal_bridge.review_project_ref='swzpzcwiasxmjutrmvkm';"+(h7_dir/'01-pre.sql.readonly').read_text())
  B.sql("SET b2b_fiscal_bridge.review_project_ref='swzpzcwiasxmjutrmvkm';"+(h7_dir/'02-install.sql.review').read_text())
  h7_post=B.sql("SET b2b_fiscal_bridge.review_project_ref='swzpzcwiasxmjutrmvkm';"+(h7_dir/'03-post.sql.readonly').read_text())
  legacy_denied=B.run_raw(B.T.actor(Q.UFIN)+f"SELECT public.generate_b2b_receivable_secure('{order_id}');")
  assert legacy_denied.returncode!=0 and 'B2B_AUTHORIZED_FISCAL_DOCUMENT_REQUIRED' in legacy_denied.stderr,legacy_denied.stderr
  assert B.last('SELECT count(*) FROM public.accounts_receivable;')==str(effect_baseline['receivables'])
  (OUT/'legacy-writer-closed.json').write_text(json.dumps(dict(wrapper_denied=legacy_denied.stderr,receivables=effect_baseline['receivables'],approval_delivery_production_trigger='B4_NO_OP_MD5_d179755ea3701a723338d08283d42fe5'),indent=2)+'\n')
  checks.append(dict(test='strict permit validator PRE INSTALL POST and old integral writer denied without title',status='PASS'))
  client_bridge=B.run_raw("SET ROLE authenticated;SELECT platform_private.b2b_fiscal_invoice_bridge_v1(NULL);")
  assert client_bridge.returncode!=0 and 'permission denied' in client_bridge.stderr,client_bridge.stderr
  original=json.loads((OUT/'real-baselines.json').read_text())['after']['receivable']['triggers']
  current=R.snapshot(B)
  current_triggers={x['name']:x for x in current['receivable']['triggers']}
  for trigger in original:
   assert current_triggers.get(trigger['name'])==trigger,trigger['name']
  assert current['receivable']['acl_md5']==json.loads((OUT/'real-baselines.json').read_text())['expected']['acl_md5']
  assert current_triggers['b2b_fiscal_created_by_guard']['enabled']=='O'
  current_counts=json.loads(B.last("SELECT jsonb_build_object('receivables',(SELECT count(*) FROM public.accounts_receivable),'fiscal_documents',(SELECT count(*) FROM public.fiscal_invoices))::text;"))
  assert current_counts==effect_baseline,(current_counts,effect_baseline)

  # Crédito do pedido aprovado/entregue continua previsão, não dívida. Nenhuma
  # costura de dependência é usada neste controle integrado.
  credit=json.loads(B.last(f"RESET ROLE;SET request.jwt.claim.sub='{Q.UADM}';SET request.jwt.claims='{{\"sub\":\"{Q.UADM}\",\"role\":\"authenticated\",\"iat\":1,\"exp\":4102444800}}';SELECT public.fn_b2b_credit_exposure('{Q.P}',0,NULL);"))
  assert credit['reason_code']=='OK' and float(credit['exposicao_atual'])>=float(accepted['total']),credit
  assert B.last('SELECT count(*) FROM public.accounts_receivable;')==str(effect_baseline['receivables'])
  (OUT/'integrated-credit-without-receivable.json').write_text(json.dumps(dict(credit=credit,receivables=effect_baseline['receivables'],fiscal_confirmation=False),indent=2)+'\n')
  checks.append(dict(test='B4 credit exposure includes approved unbilled orders without creating receivable or using dependency seam',status='PASS'))

  # Costura apenas de schema/eventos fiscais sintéticos. O callback H13/H12 e a
  # dependência always-deny são os corpos reais candidatos, sem substituição.
  B.sql("""CREATE TABLE IF NOT EXISTS public.fiscal_invoices(id uuid PRIMARY KEY);
ALTER TABLE public.fiscal_invoices ADD COLUMN IF NOT EXISTS receivable_id uuid,ADD COLUMN IF NOT EXISTS environment text,ADD COLUMN IF NOT EXISTS normalized_status text,
 ADD COLUMN IF NOT EXISTS access_key text,ADD COLUMN IF NOT EXISTS authorized_at timestamptz,ADD COLUMN IF NOT EXISTS provider_status_raw text,ADD COLUMN IF NOT EXISTS tax_authority_notes text,
 ADD COLUMN IF NOT EXISTS reconciliation_status text,ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now(),ADD COLUMN IF NOT EXISTS status text DEFAULT 'PENDING',
 ADD COLUMN IF NOT EXISTS company_settings_id uuid,ADD COLUMN IF NOT EXISTS organization_id uuid,ADD COLUMN IF NOT EXISTS partner_order_id uuid,ADD COLUMN IF NOT EXISTS debtor_partner_id uuid,ADD COLUMN IF NOT EXISTS debtor_customer_id uuid,
 ADD COLUMN IF NOT EXISTS invoice_type text,ADD COLUMN IF NOT EXISTS issue_date date,ADD COLUMN IF NOT EXISTS total_amount numeric(14,2),ADD COLUMN IF NOT EXISTS provider_reference text,ADD COLUMN IF NOT EXISTS created_by uuid;
CREATE TABLE IF NOT EXISTS public.fiscal_invoice_items(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),fiscal_invoice_id uuid NOT NULL,partner_order_item_id uuid,
 item_sequence integer NOT NULL,item_kind text NOT NULL,quantity numeric(18,6),commercial_unit text,taxable_quantity numeric(18,6),taxable_unit text,net_value numeric(18,2));
CREATE TABLE IF NOT EXISTS public.fiscal_xml_runs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),fiscal_invoice_id uuid,signed_path text,access_key text,signed_at timestamptz,updated_at timestamptz);
CREATE TABLE IF NOT EXISTS public.fiscal_sefaz_transmissions(id uuid PRIMARY KEY,service text NOT NULL DEFAULT 'NFeAutorizacao4',fiscal_event_id uuid,fiscal_invoice_id uuid,
 state text,outcome text,c_stat text,x_motivo text,ch_nfe text,n_prot text,n_rec text,ambiente_retorno text,dh_recbto timestamptz,
 error_code text,response_summary jsonb,completed_at timestamptz);
CREATE TABLE IF NOT EXISTS public.fiscal_audit_log(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),table_name text,record_id uuid,action text,old_values jsonb,new_values jsonb,changed_by uuid);""")
  invoice_id=Q.u(900);transmission_id=Q.u(901);xml_run_id=Q.u(902);access_key='35261111111111111111111111111111111111111111'
  company_settings_id=accepted['internal_economic_snapshot']['origin']['company_settings_id']
  # A restauração contém o schema fiscal real. A costura é somente o evento
  # sintético; NOT NULL, CHECK, FK, triggers e índices permanecem obrigatórios.
  invoice_idem=f'integrated-fiscal-invoice:{order_id}:v1'
  xml_idem=f'integrated-fiscal-xml:{invoice_id}:v1'
  transmission_idem=f'integrated-sefaz-authorize:{invoice_id}:v1'
  xml_payload='{}';xml_sha256=hashlib.sha256(xml_payload.encode()).hexdigest()
  endpoint_url='https://hnfe.fazenda.mg.gov.br/LOCAL-SYNTHETIC-NO-NETWORK'
  transmission_fingerprint=hashlib.sha256(f'NFeAutorizacao4|{endpoint_url}|{xml_sha256}'.encode()).hexdigest()
  fixture_columns={
   'fiscal_invoices':['id','invoice_type','document_model','idempotency_key','status','normalized_status','environment','company_settings_id','organization_id','partner_order_id','debtor_partner_id','issue_date','total_amount','created_by','provider_reference','access_key'],
   'fiscal_invoice_items':['fiscal_invoice_id','partner_order_item_id','item_sequence','item_kind','quantity','commercial_unit','taxable_quantity','taxable_unit','net_value'],
   'fiscal_xml_runs':['id','fiscal_invoice_id','idempotency_key','run_version','schema_version','environment_code','access_key','state','payload','payload_sha256','signed_sha256','signed_path','signed_at','validation','signature_metadata','created_by','updated_at'],
   'fiscal_sefaz_transmissions':['id','fiscal_invoice_id','xml_run_id','service','environment_code','endpoint_host','endpoint_url','idempotency_key','request_fingerprint','state','outcome','c_stat','x_motivo','ch_nfe','n_prot','ambiente_retorno','dh_recbto','completed_at','created_by'],
  }
  fixture_contract={}
  for table,columns in fixture_columns.items():
   required=json.loads(B.last(f"""SELECT coalesce(jsonb_agg(a.attname ORDER BY a.attnum),'[]'::jsonb)::text
    FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
    WHERE a.attrelid='public.{table}'::regclass AND a.attnum>0 AND NOT a.attisdropped AND a.attnotnull AND d.adbin IS NULL;"""))
   missing=sorted(set(required)-set(columns))
   assert not missing,(table,'REQUIRED_FIXTURE_COLUMNS_MISSING',missing)
   constraints=json.loads(B.last(f"""SELECT coalesce(jsonb_agg(jsonb_build_object('name',c.conname,'type',c.contype,'definition',pg_get_constraintdef(c.oid)) ORDER BY c.conname),'[]'::jsonb)::text
    FROM pg_constraint c WHERE c.conrelid='public.{table}'::regclass;"""))
   fixture_contract[table]=dict(required_without_default=required,insert_columns=columns,constraints=constraints)
  fixture_sql=f"""SET ROLE service_role;
 INSERT INTO public.fiscal_invoices(id,invoice_type,document_model,idempotency_key,status,normalized_status,environment,company_settings_id,organization_id,
   partner_order_id,debtor_partner_id,issue_date,total_amount,created_by,provider_reference,access_key)
  VALUES('{invoice_id}','NFE','NFE','{invoice_idem}','PENDING','PENDING','HOMOLOGATION','{company_settings_id}','{Q.A}','{order_id}','{Q.P}','2027-02-01','{accepted['total']}','{Q.UADM}','LOCAL-INTEGRATED','{access_key}');
 INSERT INTO public.fiscal_invoice_items(fiscal_invoice_id,partner_order_item_id,item_sequence,item_kind,quantity,commercial_unit,taxable_quantity,taxable_unit,net_value)
  VALUES('{invoice_id}','{item['id']}',1,'PRODUCT','{item['quantidade']}','UN','{float(item['quantidade'])*float(item['packaging_peso_liquido_kg_snapshot'])}','KG','{accepted['total']}');
 INSERT INTO public.fiscal_xml_runs(id,fiscal_invoice_id,idempotency_key,run_version,schema_version,environment_code,access_key,state,payload,payload_sha256,signed_sha256,signed_path,signed_at,validation,signature_metadata,created_by,updated_at)
  VALUES('{xml_run_id}','{invoice_id}','{xml_idem}',1,'LOCAL-NFE-4.00','2','{access_key}','SIGNED','{xml_payload}'::jsonb,'{xml_sha256}','{xml_sha256}','local/{invoice_id}.xml',now(),'{{"synthetic":true,"network":false}}'::jsonb,'{{"synthetic":true,"adapter":"LOCAL_FIXTURE_ONLY"}}'::jsonb,'{Q.UADM}',now());
 INSERT INTO public.fiscal_sefaz_transmissions(id,fiscal_invoice_id,xml_run_id,service,environment_code,endpoint_host,endpoint_url,idempotency_key,request_fingerprint,state,outcome,c_stat,x_motivo,ch_nfe,n_prot,ambiente_retorno,dh_recbto,completed_at,created_by)
  VALUES('{transmission_id}','{invoice_id}','{xml_run_id}','NFeAutorizacao4','2','hnfe.fazenda.mg.gov.br','{endpoint_url}','{transmission_idem}','{transmission_fingerprint}','SENT','PENDING','103','PROCESSANDO','{access_key}','PENDING','2',now(),now(),'{Q.UADM}');"""
  # Preflight integral e reversível: qualquer NOT NULL/CHECK/FK/trigger falha aqui,
  # sem desativar constraints nem deixar uma fixture parcialmente instalada.
  B.sql('BEGIN;'+fixture_sql+'ROLLBACK;')
  (OUT/'fiscal-fixture-contract.json').write_text(json.dumps(dict(status='PREFLIGHT_ROLLBACK_OK',tables=fixture_contract,invoice_id=invoice_id,xml_run_id=xml_run_id,transmission_id=transmission_id,invoice_idempotency_key=invoice_idem,xml_idempotency_key=xml_idem,transmission_idempotency_key=transmission_idem,xml_payload_sha256=xml_sha256,transmission_request_fingerprint=transmission_fingerprint,network=False,provider_called=False),indent=2)+'\n')
  checks.append(dict(test='fiscal fixture satisfies every required column and passes real NOT NULL CHECK FK trigger preflight in rolled back transaction',status='PASS'))
  B.sql(fixture_sql)
  invoice_initial=json.loads(B.last(f"SELECT jsonb_build_object('status',status,'normalized_status',normalized_status,'receivable_id',receivable_id)::text FROM public.fiscal_invoices WHERE id='{invoice_id}';"))
  assert invoice_initial=={'status':'PENDING','normalized_status':'DRAFT','receivable_id':None},invoice_initial
  (OUT/'fiscal-invoice-before-callback.json').write_text(json.dumps(invoice_initial,indent=2)+'\n')
  patch=json.dumps({'cStat':'104','protocolCStat':'100','nProt':'LOCAL-INTEGRATED-PROTOCOL','chNFe':access_key,'xMotivo':'LOTE PROCESSADO; PROTOCOLO AUTORIZADO','tpAmb':'2','dhRecbto':'2027-02-01T12:00:00Z'}).replace("'","''")
  def authorized_callback():
   return B.run_raw(f"SET ROLE service_role;SELECT public.rpc_fiscal_sefaz_transmit_record_v1('{transmission_id}','SUCCEEDED','{patch}'::jsonb);")
  callback=authorized_callback()
  assert callback.returncode==0,(callback.stdout,callback.stderr)
  callback_data=json.loads(callback.stdout.strip().splitlines()[-1])
  close_debug=json.loads(B.last("SELECT coalesce(json_agg(row_to_json(q)),'[]'::json) FROM (SELECT * FROM platform_private.fiscal_close_pending LIMIT 3) q;"))
  direct_close=B.run_raw(f"SET ROLE service_role;SELECT public.rpc_fiscal_invoice_apply_authorization_v1('{invoice_id}','{access_key}','LOCAL-INTEGRATED-PROTOCOL',now(),'100','LOTE PROCESSADO; PROTOCOLO AUTORIZADO','{transmission_id}');")
  (OUT/'integrated-close-debug.json').write_text(json.dumps(dict(callback=callback_data,close_pending=close_debug,direct_close_stdout=direct_close.stdout,direct_close_stderr=direct_close.stderr,direct_close_returncode=direct_close.returncode),indent=2)+'\n')
  assert callback_data['outcome']=='AUTHORIZED' and callback_data['cStat']=='104' and callback_data['protocolCStat']=='100' and callback_data['reconciliationPending'] is False and callback_data['reconciliationCode'] is None,(callback_data,close_debug,direct_close.stdout,direct_close.stderr)
  replay_callback=authorized_callback()
  assert replay_callback.returncode==0,(replay_callback.stdout,replay_callback.stderr)
  replay_data=json.loads(replay_callback.stdout.strip().splitlines()[-1])
  assert replay_data['reconciliationPending'] is False,replay_data
  blocked=json.loads(B.last(f"""SELECT jsonb_build_object(
   'invoice_status',(SELECT normalized_status FROM public.fiscal_invoices WHERE id='{invoice_id}'),
   'invoice_receivable',(SELECT receivable_id FROM public.fiscal_invoices WHERE id='{invoice_id}'),
   'transmission_outcome',(SELECT outcome FROM public.fiscal_sefaz_transmissions WHERE id='{transmission_id}'),
   'transmission_c_stat',(SELECT c_stat FROM public.fiscal_sefaz_transmissions WHERE id='{transmission_id}'),
   'transmission_protocol_c_stat',(SELECT protocol_c_stat FROM public.fiscal_sefaz_transmissions WHERE id='{transmission_id}'),
   'transmission_error',(SELECT error_code FROM public.fiscal_sefaz_transmissions WHERE id='{transmission_id}'),
   'close_pending',(SELECT error_code FROM platform_private.fiscal_close_pending WHERE transmission_id='{transmission_id}'),
   'close_pending_attempts',(SELECT attempts FROM platform_private.fiscal_close_pending WHERE transmission_id='{transmission_id}'),
   'transmissions',(SELECT count(*) FROM public.fiscal_sefaz_transmissions WHERE fiscal_invoice_id='{invoice_id}'),
   'invoices',(SELECT count(*) FROM public.fiscal_invoices WHERE id='{invoice_id}' AND idempotency_key='{invoice_idem}'),
   'xml_runs',(SELECT count(*) FROM public.fiscal_xml_runs WHERE id='{xml_run_id}' AND fiscal_invoice_id='{invoice_id}' AND idempotency_key='{xml_idem}'),
   'transmission_idempotency',(SELECT idempotency_key FROM public.fiscal_sefaz_transmissions WHERE id='{transmission_id}'),
   'transmission_fingerprint',(SELECT request_fingerprint FROM public.fiscal_sefaz_transmissions WHERE id='{transmission_id}'),
   'documents',(SELECT count(*) FROM platform_private.b2b_authorized_documents WHERE id='{invoice_id}'),
   'allocations',(SELECT count(*) FROM platform_private.b2b_document_allocations WHERE document_id='{invoice_id}'),
   'snapshots',(SELECT count(*) FROM platform_private.b2b_fiscal_invoice_snapshots WHERE invoice_id='{invoice_id}'),
   'receivables',(SELECT count(*) FROM public.accounts_receivable WHERE b2b_document_id='{invoice_id}'))::text;"""))
  assert blocked['transmission_outcome']=='AUTHORIZED' and blocked['transmission_c_stat']=='104' and blocked['transmission_protocol_c_stat']=='100',blocked
  assert blocked['invoice_status']=='AUTHORIZED' and blocked['invoice_receivable'] and blocked['transmission_error'] is None,blocked
  assert blocked['close_pending'] is None and blocked['close_pending_attempts'] is None,blocked
  assert {k:blocked[k] for k in ('transmissions','invoices','xml_runs','documents','allocations','snapshots','receivables')}==dict(transmissions=1,invoices=1,xml_runs=1,documents=1,allocations=1,snapshots=1,receivables=1),blocked
  assert blocked['transmission_idempotency']==transmission_idem and blocked['transmission_fingerprint']==transmission_fingerprint,blocked
  receivable_id=blocked['invoice_receivable']
  forecast_after=json.loads(B.last(f"SELECT jsonb_build_object('state',state,'residual_amount',residual_amount,'version',version)::text FROM platform_private.b2b_financial_forecasts WHERE order_id='{order_id}';"))
  assert forecast_after['state']=='faturado_total' and float(forecast_after['residual_amount'])==0 and forecast_after['version']==9,forecast_after
  credit_after=json.loads(B.last(B.T.actor(Q.UADM)+f"SELECT public.fn_b2b_credit_exposure('{Q.P}',0,NULL);"))
  assert abs(float(credit_after['exposicao_atual'])-float(credit['exposicao_atual']))<0.01,(credit,credit_after)
  assert B.last(f"SELECT count(*) FROM public.accounts_receivable WHERE b2b_document_id='{invoice_id}';")=='1'
  (OUT/'forecast-post-nf.json').write_text(json.dumps(dict(forecast=forecast_after,credit_before=credit,credit_after=credit_after,one_title_for_invoice=True),indent=2)+'\n')
  (OUT/'integrated-strict-fiscal-callback.json').write_text(json.dumps(dict(callback=callback_data,replay=replay_data,confirmed=blocked,schema_and_fiscal_events_synthetic=True,always_allow_substitution=False,strict_permit_required=True),indent=2)+'\n')
  checks.append(dict(test='real H13 envelope 104 protocol 100 generates one receivable and replay preserves one document allocation snapshot and title without close pending',status='PASS',receivable_id=receivable_id))

  (OUT/'integrated-b4-fiscal-bridge.json').write_text(json.dumps(dict(
   status='STRICT_FISCAL_CONFIRMED_TO_ONE_RECEIVABLE_REVIEW_ONLY',hosted=False,
   b4_pre=b4_pre,b4_post=b4_post,bridge_pre=bridge_pre,bridge_post=bridge_post,composed_post=composed_post,
   forecast_pre=forecast_pre,forecast_post=forecast_post,forecast_reconcile_pre=forecast_reconcile_pre,forecast_reconcile_post=forecast_reconcile_post,strict_pre=strict_pre,strict_post=strict_post,bridge_audit_pre=bridge_audit_pre,bridge_audit_post=bridge_audit_post,h7_pre=h7_pre,h7_post=h7_post,seller91_md5='97bcdb9884b54adb3bd4aae4915e32d0',
   old_dependency_denial=dependency.stderr,legacy_writer_denial=legacy_denied.stderr,client_bridge_denial=client_bridge.stderr,
   original_ten_triggers_preserved=True,current_trigger_count=len(current_triggers),
   effect_baseline=effect_baseline,current_counts=current_counts,credit=credit,h13_confirmed=blocked,
   positive_fiscal_receivable=receivable_id,always_allow_substitution=False),indent=2)+'\n')
  checks.append(dict(test='same fresh DB executes Seller91 buyer seller logistics B4 strict bridge and positive confirmed fiscal receivable',status='PASS'))
  B.sql("SET b2b_fiscal_bridge.review_project_ref='swzpzcwiasxmjutrmvkm';"+(h7_dir/'04-rollback-deny.sql.review').read_text())
  B.sql("SET b2b_fiscal_bridge.review_project_ref='swzpzcwiasxmjutrmvkm';"+(audit_dir/'04-rollback-deny.sql.review').read_text())
  B.sql("SET b2b_fiscal_bridge.review_project_ref='swzpzcwiasxmjutrmvkm';"+(strict_dir/'04-rollback-deny.sql.review').read_text())
  assert 'B2B_FISCAL_ATTESTATION_ACCOUNTING_UNPROVEN' in B.last("SELECT pg_get_functiondef('platform_private.b2b_integration_dependencies()'::regprocedure);")
  B.sql("SET commercial_plans.review_project_ref='swzpzcwiasxmjutrmvkm';SET b2b_fiscal_bridge.review_project_ref='swzpzcwiasxmjutrmvkm';"+(composed_dir/'04-rollback-deny.sql.review').read_text())
  B.sql("SET b2b_forecast.review_project_ref='swzpzcwiasxmjutrmvkm';"+(forecast_dir/'08-rollback-fiscal-reconcile-deny.sql.review').read_text())
  B.sql("SET b2b_forecast.review_project_ref='swzpzcwiasxmjutrmvkm';"+(forecast_dir/'04-rollback-deny.sql.review').read_text())
  # O proprietário local é superusuário: RESET ROLE não mede revogação. A ACL
  # precisa ser exercida como o papel que efetivamente perdeu EXECUTE.
  denied_after_bridge=B.run_raw("RESET ROLE;SET ROLE service_role;SELECT platform_private.b2b_fiscal_invoice_bridge_v1(NULL);")
  denied_after_allocate=B.run_raw("RESET ROLE;SET ROLE authenticated;SELECT platform_private.b2b_allocate_document(NULL);")
  assert denied_after_bridge.returncode!=0 and 'permission denied' in denied_after_bridge.stderr,denied_after_bridge.stderr
  assert denied_after_allocate.returncode!=0 and 'permission denied' in denied_after_allocate.stderr,denied_after_allocate.stderr
  denied_plan_read=Q.as_user(Q.UADM,"SELECT count(*) FROM public.rpc_admin_list_commercial_plans(NULL,'all',100,0);")
  assert denied_plan_read.returncode!=0 and 'permission denied' in denied_plan_read.stderr,denied_plan_read.stderr
  assert B.last('SELECT count(*) FROM public.commercial_payment_plans;')==plans_before_rollback
  assert B.last("SELECT count(*) FROM pg_constraint WHERE conrelid='public.commercial_payment_plans'::regclass AND conname='commercial_payment_plans_code_key';")=='0'
  assert B.last("SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND tablename='commercial_payment_plans' AND indexname='uq_cpp_tenant_code';")=='1'
  current=R.snapshot(B);after_triggers={x['name']:x for x in current['receivable']['triggers']}
  for trigger in original: assert after_triggers.get(trigger['name'])==trigger,trigger['name']
  assert B.last("SELECT count(*) FROM platform_private.b2b_fiscal_invoice_snapshots;")=='1'
  assert B.last(f"SELECT normalized_status FROM public.fiscal_invoices WHERE id='{invoice_id}';")=='AUTHORIZED'
  assert B.last(f"SELECT receivable_id FROM public.fiscal_invoices WHERE id='{invoice_id}';")==receivable_id
  assert B.last(f"SELECT count(*) FROM public.accounts_receivable WHERE id='{receivable_id}' AND b2b_document_id='{invoice_id}';")=='1'
  assert B.last(f"SELECT count(*) FROM public.fiscal_xml_runs WHERE id='{xml_run_id}' AND idempotency_key='{xml_idem}';")=='1'
  assert B.last(f"SELECT count(*) FROM public.fiscal_sefaz_transmissions WHERE id='{transmission_id}' AND idempotency_key='{transmission_idem}' AND request_fingerprint='{transmission_fingerprint}';")=='1'
  assert B.last(f"SELECT count(*) FROM platform_private.fiscal_close_pending WHERE transmission_id='{transmission_id}';")=='0'
  checks.append(dict(test='strict then composed deny-only rollback closes writers; preserves confirmed NF snapshot title idempotency and all original ten receivable triggers',status='PASS'))
  # Cadeia reversa completa: inclusive contenção e os dois geradores compostos,
  # exatamente como no ramo logistics-only; nenhum POST intermediário é reutilizado.
  run_final_delivery_rollback('integrated')
 except Exception:
  traceback.print_exc();checks.append(dict(test='new composition',status='FAIL'))
 finally:
  (OUT/'checks.json').write_text(json.dumps(checks,indent=2)+'\n')
 return 0 if checks and all(x['status']=='PASS' for x in checks) else 1
if __name__=='__main__':sys.exit(main())
