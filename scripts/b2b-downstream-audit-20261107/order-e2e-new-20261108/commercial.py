"""Merge B3 disposable captured economic contracts into the fresh physical catalog.
Fixtures and schema expansions are explicit synthetic seams, never hosted authority.
"""
import json, subprocess
from pathlib import Path

def apply(driver, load, root, out):
 B=driver
 M=load('new_b4_contract',root/'scripts/b2b-downstream-audit-20261107/b4/test-b4-b3.py')
 Q=M.B3
 tmp=Q.boot()
 try:
  work=tmp/'b3-install';work.mkdir();work.chmod(0o777)
  M.install_b3(work)
  assert all(c['ok'] for c in Q.CHECKS+M.CHECKS),(Q.CHECKS,M.CHECKS)
  # Extract structural delta and exact function bodies from the just-booted B3.
  meta=json.loads(Q.psql("""SELECT jsonb_build_object(
    'types',(SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'name',t.typname,'labels',(SELECT jsonb_agg(e.enumlabel ORDER BY e.enumsortorder) FROM pg_enum e WHERE e.enumtypid=t.oid))) FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE t.typtype='e' AND n.nspname='public'),
    'tables',(SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,'columns',(SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'default',pg_get_expr(d.adbin,d.adrelid),'notnull',a.attnotnull) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped))) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='r' AND n.nspname IN ('public','platform_private')),
    'functions',(SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,'signature',p.oid::regprocedure::text,'body',pg_get_functiondef(p.oid),'md5',md5(pg_get_functiondef(p.oid)),'acl',p.proacl::text)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','platform_private') AND p.prokind='f'),
    'triggers',(SELECT jsonb_agg(jsonb_build_object('table',c.relname,'name',t.tgname,'definition',pg_get_triggerdef(t.oid))) FROM pg_trigger t JOIN pg_class c ON c.oid=c.oid AND c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal),
    'constraints',(SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'table',r.relname,'name',c.conname,'definition',pg_get_constraintdef(c.oid))) FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid JOIN pg_namespace n ON n.oid=r.relnamespace WHERE n.nspname IN ('public','platform_private') AND c.contype IN ('p','u'))
  )::text""").stdout.strip())
  (out/'new-b3-metadata.json').write_text(json.dumps(meta,indent=2)+'\n')
  def lit(s):return "'"+str(s).replace("'","''")+"'"
  for t in meta['types'] or []:
   if B.last(f"SELECT to_regtype('public.{t['name']}') IS NOT NULL;")=='f':
    B.sql(f"CREATE TYPE public.{t['name']} AS ENUM ("+','.join(lit(x) for x in t['labels'])+');')
  for t in meta['tables']:
   obj=t['schema']+'.'+t['name'];exists=B.last(f"SELECT to_regclass('{obj}') IS NOT NULL;")=='t'
   if not exists:
    B.sql('CREATE TABLE '+obj+' ('+','.join('"'+c['name']+'" '+c['type']+((' DEFAULT '+c['default']) if c['default'] else '') for c in t['columns'])+');')
   else:
    for c in t['columns']:
     if B.last(f"SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='{t['schema']}' AND table_name='{t['name']}' AND column_name='{c['name']}');")=='f':
      B.sql(f'ALTER TABLE {obj} ADD COLUMN "{c["name"]}" {c["type"]}'+((' DEFAULT '+c['default']) if c['default'] else '')+';')
  for c in meta['constraints'] or []:
   obj=c['schema']+'.'+c['table']
   if B.last(f"SELECT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='{obj}'::regclass AND conname='{c['name']}');")=='f':
    B.sql(f'ALTER TABLE {obj} ADD CONSTRAINT "{c["name"]}" '+c['definition']+';')
  # Economic functions retain their exact B3 bodies. h15 and physical helpers stay original.
  keep={'h15_actor_organization','tg_create_default_pfs','has_role','is_platform_superadmin','get_user_partner_id','update_updated_at_column','b2b_actor_scope','b2b_internal_commercial_actor','c2_internal_order_target_reason','c2_order_actor_scope','c2_owner_order_guard','c2_attempt_dispatch_guard','c2_partner_order_attempt_authz','c2_order_internal_recipients','c2_owner_order_create_allowed','platform_actor_access_ready','entitlements_for_user','issue_ticket','has_ticket','c2_accounting_promotion_ok','c2p1_internal_actor','c2p1_settings_allowed','_notify_role','_saas_user_has_feature'}
  keep.update(f['name'] for f in meta['functions'] if ' LANGUAGE c' in f['body'])
  keep.update({'fn_b2b_status_is_approved_or_later','fn_catalogo_preco_canonico','b2b_phase1_order_visible','get_partner_catalog_secure','get_partner_catalog_volumes_secure','solid_pack_price_set_v1','solid_pack_offers_admin_v1','b2b_internal_origin_valid','c2_external_origin_contract_valid','tg_partner_orders_require_items','tg_refresh_engagement','fn_b2b_status_is_operational','fn_cc_can_prepare','partner_order_has_production','refresh_partner_engagement','rpc_register_receivable_payment','fn_generate_receivable_installments'})
  for f in meta['functions']:
   if f['name'] in keep:continue
   B.sql(f['body']+';')
  # Fixture load only, before the tested create; cannot certify this as provisioning.
  # Identidade exigida pelo FK do comprovante, SOMENTE no PG descartável. O
  # trigger real cria o perfil; a carga abaixo completa seus dados explícitos.
  for actor in (Q.UADM,Q.UFIN):
   B.sql(f"INSERT INTO auth.users(id) VALUES('{actor}') ON CONFLICT DO NOTHING;")
   assert B.last(f"SELECT EXISTS(SELECT 1 FROM auth.users WHERE id='{actor}');")=='t'
  fixture_tables=['organizations','profiles','user_roles','partner_accounts','partner_users','produtos','microrganismos','catalogo_volumes','product_sale_units','product_packagings','catalogo_precos_embalagem','commercial_payment_plans','commercial_payment_plan_assignments','commercial_price_rules','partner_financial_settings','payment_methods','financial_categories','seam_entitlements']
  B.sql('SET session_replication_role=replica;')
  for name in fixture_tables:
   schema='platform_private' if name=='seam_entitlements' else 'public';obj=schema+'.'+name
   rows=json.loads(Q.psql(f"SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM {obj} x").stdout.strip())
   for row in rows:
    if name=='profiles':row.update(nome='LOCAL B3',senha_provisoria=False)
    if name=='organizations':row.update(nome='LOCAL B3',status='ativa')
    if name=='partner_accounts':row.update(razao_social='LOCAL B3 PARTNER')
    # Shape real c40a13b8: comprador é vínculo externo no tenant VENDEDOR;
    # organizations.partner_account_id do vendedor permanece NULL. A fixture B3
    # reduzida não tinha tenant_id e session_replication_role impede o trigger
    # canônico de derivá-lo, portanto o dado completo é explícito nesta costura.
    if name=='partner_users':
     row.update(tenant_id=Q.F if row['partner_id']==Q.PF else Q.A,
                papel='tecnico' if row['user_id']==Q.UT else 'gestor')
    if name=='produtos':row.update(tipo='solo' if row['id']==Q.SP.SOL else 'inseticida',familia_catalogo='fertilizante_adubo' if row['id']==Q.SP.SOL else 'quimico')
    if name=='microrganismos':row.update(tipo='bacteria')
    if name=='commercial_payment_plans':row.update(plan_type='custom')
    cols=list(row)
    # JSONB populate keeps native arrays/json/numeric casts intact.
    B.sql('SET session_replication_role=replica; INSERT INTO '+obj+' ('+','.join('"'+c+'"' for c in cols)+') SELECT '+','.join('"'+c+'"' for c in cols)+' FROM jsonb_populate_record(NULL::'+obj+','+lit(json.dumps(row))+'::jsonb) ON CONFLICT DO NOTHING; SET session_replication_role=origin;')
  B.sql(f"UPDATE public.profiles SET organization_id='{Q.A}',nome='LOCAL B3 ADMIN',ativo=true,senha_provisoria=false WHERE user_id='{Q.UADM}';")
  # Auth lifecycle creates a default profile before fixture import; ON CONFLICT
  # must not leave the financial actor with a null tenant or temporary password.
  B.sql(f"UPDATE public.profiles SET organization_id='{Q.A}',nome='LOCAL B3 FINANCEIRO',ativo=true,senha_provisoria=false WHERE user_id='{Q.UFIN}';")
  # Entitlements reais: a tabela seam_entitlements do harness B3 não é lida
  # pelo resolvedor canônico mantido da base física. Concessões GRANT apenas
  # no tenant A; nenhuma versão publicada é alterada e F não recebe o grant.
  B.sql(f"""SET session_replication_role=replica;
   INSERT INTO public.saas_modules(id,key,name,active) VALUES
    ('{Q.u(800)}','local_b2b_e2e','LOCAL B2B E2E',true) ON CONFLICT(key) DO NOTHING;
   INSERT INTO public.saas_features(id,module_id,key,name,active)
    SELECT '{Q.u(801)}',id,'pedidos_b2b','LOCAL pedidos B2B',true FROM public.saas_modules WHERE key='local_b2b_e2e'
    ON CONFLICT(key) DO NOTHING;
   INSERT INTO public.saas_features(id,module_id,key,name,active)
    SELECT '{Q.u(802)}',id,'catalogo_precos','LOCAL catálogo preços',true FROM public.saas_modules WHERE key='local_b2b_e2e'
    ON CONFLICT(key) DO NOTHING;
   INSERT INTO public.saas_features(id,module_id,key,name,active)
    SELECT '{Q.u(803)}',id,'estoque_embalagens','LOCAL estoque embalagens',true FROM public.saas_modules WHERE key='local_b2b_e2e'
    ON CONFLICT(key) DO NOTHING;
   INSERT INTO public.saas_features(id,module_id,key,name,active)
    SELECT '{Q.u(804)}',id,'ordens_producao','LOCAL OS canônica sem fabricação de revenda',true FROM public.saas_modules WHERE key='local_b2b_e2e'
    ON CONFLICT(key) DO NOTHING;
   INSERT INTO public.saas_features(id,module_id,key,name,active)
    SELECT '{Q.u(808)}',id,'lotes_qualidade','LOCAL lote de compra sem CQ',true FROM public.saas_modules WHERE key='local_b2b_e2e'
    ON CONFLICT(key) DO NOTHING;
   INSERT INTO public.saas_plans(id,key,name,active,is_default) VALUES
    ('{Q.u(805)}','local_b2b_e2e','LOCAL B2B E2E',true,false) ON CONFLICT(key) DO NOTHING;
   INSERT INTO public.saas_plan_versions(id,plan_id,version_number,name_snapshot,status,effective_from,published_at,features_snapshot,
     price_amount,currency,billing_cycle,trial_days)
    SELECT '{Q.u(806)}',id,1,'LOCAL B2B E2E','PUBLISHED',now()-interval '1 day',now()-interval '1 day',
     '["pedidos_b2b","catalogo_precos","estoque_embalagens","ordens_producao","lotes_qualidade"]'::jsonb,0,'BRL','monthly',1
     FROM public.saas_plans WHERE key='local_b2b_e2e' ON CONFLICT(id) DO NOTHING;
   INSERT INTO public.saas_plan_version_features(plan_version_id,feature_id,enabled)
    SELECT '{Q.u(806)}',id,true FROM public.saas_features WHERE key IN ('pedidos_b2b','catalogo_precos','estoque_embalagens','ordens_producao','lotes_qualidade') ON CONFLICT DO NOTHING;
   INSERT INTO public.organization_subscriptions(id,organization_id,plan_id,plan_version_id,status,started_at)
    SELECT '{Q.u(807)}','{Q.A}',id,'{Q.u(806)}','ACTIVE',now()-interval '1 hour'
     FROM public.saas_plans WHERE key='local_b2b_e2e' ON CONFLICT(id) DO NOTHING;
   SET session_replication_role=origin;""")
  for t in meta['triggers']:
   B.sql('DROP TRIGGER IF EXISTS "'+t['name']+'" ON public.'+t['table']+';'+t['definition']+';')
  for obj in ['produtos','microrganismos','catalogo_volumes','catalogo_precos_embalagem','partner_accounts','partner_users','profiles','user_roles','commercial_payment_plans','commercial_payment_plan_assignments','commercial_price_rules']:
   B.sql('GRANT SELECT ON public.'+obj+' TO authenticated;')
  # Auth transport is synthetic; scoped economic grants reuse local B3 ACL.
  for f in meta['functions']:
   if f['name'] in keep:continue
   sig=f['signature'];B.sql('REVOKE ALL ON FUNCTION '+sig+' FROM PUBLIC,anon,authenticated,service_role;')
   for entry in (f['acl'] or '').strip('{}').split(','):
    if '=' in entry:
     role,rights=entry.split('=',1)
     if 'X' in rights:B.sql('GRANT EXECUTE ON FUNCTION '+sig+' TO '+(role or 'PUBLIC')+';')
  B.sql("GRANT USAGE ON SCHEMA platform_private TO authenticated; GRANT SELECT ON platform_private.seam_entitlements TO authenticated;")
  Q.psql=lambda s,**kwargs: type('R',(),{'stdout':B.sql(s),'returncode':0,'stderr':''})()
  Q.as_user=lambda uid,s,role='authenticated':B.run_raw(f"SET ROLE {role}; SET request.jwt.claim.sub='{uid}'; SET request.jwt.claims='"+json.dumps({'sub':uid,'role':'authenticated','iat':1,'exp':4102444800},separators=(',',':'))+"';"+s)
  return Q
 finally:
  subprocess.run(Q.SP.su()+['pg_ctl','-D',str(tmp/'d'),'-m','fast','stop'],capture_output=True)