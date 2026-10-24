# Exec'd by ../test-local.py inside the disposable PostgreSQL only. Synthetic Auth; NOT hosted JWT/RLS.
# Installs the captured LIVE catalogue readers (MD5/owner/ACL exact) on top of the order chain.
# Real LIVE helper bodies (catalog/live-helpers.json, MD5/ACL exact): c1b_catalog_visibility_scope,
# fn_b2b_resolve_base_unit_price, fn_catalogo_preco_canonico. Only catalogue sheet/visibility table SHAPES are synthetic.
CATDIR=D/'catalog'
LIVECAT={r['signature']:r for r in json.loads((CATDIR/'live-capture.json').read_text())}
pg.sql("""SET session_replication_role=replica;
CREATE TABLE IF NOT EXISTS public.product_technical_profiles(produto_id uuid,status_validacao text,resumo_curto text,explicacao_b2b text,beneficio_combinado text,explicacao_produtor text,indicacoes_uso text,cuidados_aplicacao text);
CREATE TABLE IF NOT EXISTS public.microorganism_technical_profiles(microrganismo_id uuid,status_validacao text,resumo_curto text,explicacao_b2b text,beneficios_agronomicos text,explicacao_produtor text,indicacoes_uso text,cuidados_aplicacao text,mecanismo_acao text);
CREATE TABLE IF NOT EXISTS public.product_target_recommendations(produto_id uuid,ativo boolean);
CREATE TABLE IF NOT EXISTS public.microorganism_targets(microrganismo_id uuid,ativo boolean);
CREATE TABLE IF NOT EXISTS public.catalog_technical_sources(entidade_id uuid,entidade_tipo text);
CREATE TABLE IF NOT EXISTS public.catalog_tenant_visibility(organization_id uuid,entity_type text,produto_id uuid,microrganismo_id uuid,hidden boolean);
SET session_replication_role=origin;""")
LIVEHELP=json.loads((CATDIR/'live-helpers.json').read_text())
for r in LIVEHELP:
    sig=r['signature']
    pg.sql(r['definition']+f";\nALTER FUNCTION {sig} OWNER TO postgres; REVOKE ALL ON FUNCTION {sig} FROM PUBLIC; UPDATE pg_proc SET proacl='{r['acl']}'::aclitem[] WHERE oid='{sig}'::regprocedure;")
    assert md5(sig)==r['md5'] and pg.sql(f"SELECT proacl::text FROM pg_proc WHERE oid='{sig}'::regprocedure")==r['acl'],sig
ok('captured LIVE visibility/price helpers reproduce MD5, owner and ACL exactly (no stubs)')
for sig,r in LIVECAT.items():
    pg.sql(r['definition']+f";\nALTER FUNCTION public.{sig} OWNER TO postgres; REVOKE ALL ON FUNCTION public.{sig} FROM PUBLIC; UPDATE pg_proc SET proacl='{r['acl']}'::aclitem[] WHERE oid='public.{sig}'::regprocedure;")
    assert md5('public.'+sig)==r['md5'] and pg.sql(f"SELECT proacl::text FROM pg_proc WHERE oid='public.{sig}'::regprocedure")==r['acl'],sig
ok('captured LIVE catalogue readers reproduce MD5, owner and ACL exactly')
M,PROD2,PROD3=U(60),U(61),U(62)
pg.sql(f"""SET session_replication_role=replica;
INSERT INTO public.produtos(id,nome,tipo,codigo,ativo,b2b_enabled,familia_catalogo,created_at,updated_at) VALUES
 ('{PROD2}','Chemical hidden by A','inseticida','CHEM',true,true,'quimico',now(),now()),
 ('{PROD3}','Fertilizer','solo','FERT',true,true,'fertilizante_adubo',now(),now());
UPDATE public.produtos SET familia_catalogo='quimico' WHERE id='{PROD}';
INSERT INTO public.microrganismos(id,nome,tipo,created_at,ativo,b2b_enabled,codigo,nome_cientifico,updated_at) VALUES('{M}','Bio','bacteria',now(),true,true,'BIO','Bacillus synth',now());
INSERT INTO public.product_technical_profiles(produto_id,status_validacao,resumo_curto,explicacao_produtor) VALUES('{PROD}','aprovado','resumo aprovado','uso aprovado'),('{PROD3}','rascunho','nao publicar','nao publicar');
INSERT INTO public.catalog_tenant_visibility(organization_id,entity_type,produto_id,hidden) VALUES('{A}','produto','{PROD2}',true);
UPDATE public.microrganismos SET valor_litro_brl=30 WHERE id='{M}';
INSERT INTO public.partner_product_prices(id,partner_id,product_id,microrganismo_id,preco_tabela,desconto_percentual,ativo,created_at,updated_at,valid_from,valid_until,is_current) VALUES
 ('{U(70)}','{P}','{PROD3}',NULL,50,0,true,now(),now(),current_date-10,NULL,true),
 ('{U(71)}','{P}',NULL,'{M}',99,0,true,now(),now(),current_date-30,current_date-1,true),
 ('{U(72)}','{P}','{PROD2}',NULL,77,0,false,now(),now(),NULL,NULL,true);
SET session_replication_role=origin;""")
# Fixture-only synthetic MG issuer (owner-authorized 24/10): identified, homologation, never real A.
pg.sql(f"SET session_replication_role=replica; UPDATE public.company_fiscal_settings SET state='MG',legal_name='FIXTURE SINTETICA MG - SEM VALIDADE JURIDICA',fiscal_environment='HOMOLOGATION' WHERE id='{SETTINGS}'; SET session_replication_role=origin;")
ok('synthetic MG issuer is explicitly identified fixture in homologation',pg.sql(f"SELECT state||'/'||fiscal_environment||'/'||(legal_name LIKE 'FIXTURE%')::text FROM public.company_fiscal_settings WHERE id='{SETTINGS}'")=='MG/HOMOLOGATION/true')
def catq(u,p):return val(u,f"SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.item_id),'[]') FROM public.get_partner_catalog_secure('{p}',true) x;")
def caterr(u,p,v2=True):
    claims=json.dumps({'sub':u,'role':'authenticated','iat':int(time.time())})
    arg=f"'{p}',true" if v2 else f"'{p}'"
    out=pg.sql(f"BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims','{claims}',true); SELECT count(*) FROM public.get_partner_catalog_secure({arg}); COMMIT;",ok=False)
    return out.split('ERROR:')[1].splitlines()[0].strip() if 'ERROR:' in out else 'OK'
CAT_BEFORE={'G':catq(G,P),'GB':catq(GB,Q),'T':caterr(T,P),'GT':caterr(GT,P),'PR':caterr(PR,P),'G_foreign':caterr(G,Q)}
ok('LIVE baseline: internal A portfolio catalogue denied forbidden_partner',caterr(ADMIN,P)=='forbidden_partner')

def catalog_post_checks():
    rows=json.loads(catq(ADMIN,P));ids=[x['item_id'] for x in rows]
    ok('internal A reads own portfolio catalogue through canonical V2 contract',len(rows)==3 and all(x['catalog_contract']=='C1B_DUAL_TENANT_V1' for x in rows))
    ok('dual-tenant visibility preserved: chemical hidden by A omitted',PROD2 not in ids and PROD in ids and M in ids and PROD3 in ids)
    ok('families preserved (quimico/fertilizante/biologico)',sorted(x['familia_catalogo'] for x in rows)==['biologico','fertilizante_adubo','quimico'])
    byid={x['item_id']:x for x in rows}
    ok('canonical volume price: catalogo_volumes 180/L, dose 18, no hectare without dose',byid[PROD]['preco_parceiro']==180.0 and byid[PROD]['unidade_preco_principal']=='litro' and byid[PROD]['valor_dose_brl']==18.0 and byid[PROD]['valor_ha_brl'] is None)
    ok('partner price for portfolio partner P applies (50) and wins over volume/legacy',byid[PROD3]['preco_parceiro']==50.0)
    ok('expired partner price ignored; documented legacy fallback 30/L',byid[M]['preco_parceiro']==30.0 and byid[M]['unidade_preco_principal']=='litro')
    rb={x['item_id']:x for x in json.loads(catq(ADMIN_B,Q))}
    ok('partner P price never leaks to B partner Q; inactive P price ignored',rb[PROD3]['preco_parceiro'] is None and rb[PROD3]['unidade_preco_principal']=='sob_consulta' and rb[PROD2]['preco_parceiro'] is None)
    ok('internal and external reader of same partner see identical prices',{x['item_id']:x['preco_parceiro'] for x in json.loads(catq(G,P))}=={k:v['preco_parceiro'] for k,v in byid.items()})
    ok('approved sheet content only for aprovado',byid[PROD]['ficha_conteudo'].get('explicacao_produtor')=='uso aprovado' and byid[PROD3]['ficha_conteudo']=={} and byid[PROD3]['resumo_curto'] is None)
    ok('internal A foreign partner B catalogue denied',caterr(ADMIN,Q)=='forbidden_partner')
    ok('internal B reads only B portfolio; A partner denied',caterr(ADMIN_B,P)=='forbidden_partner' and len(json.loads(catq(ADMIN_B,Q)))==4)
    ok('V2 wrapper body/ACL unchanged',md5('public.get_partner_catalog_secure(uuid,boolean)')==LIVECAT['get_partner_catalog_secure(uuid,boolean)']['md5'])
    ok('legacy signature ACL/owner unchanged',pg.sql("SELECT proacl::text||pg_get_userbyid(proowner) FROM pg_proc WHERE oid='public.get_partner_catalog_secure(uuid)'::regprocedure")==LIVECAT['get_partner_catalog_secure(uuid)']['acl']+'postgres')
    after={'G':catq(G,P),'GB':catq(GB,Q),'T':caterr(T,P),'GT':caterr(GT,P),'PR':caterr(PR,P),'G_foreign':caterr(G,Q)}
    ok('external manager/technician/cumulative/producer/foreign outcomes byte-identical to LIVE: '+json.dumps({k:v for k,v in after.items() if k not in('G','GB')}),after==CAT_BEFORE)
    pg.sql(f"SET session_replication_role=replica; UPDATE public.saas_plan_version_features SET enabled=false WHERE feature_id='{U(910)}'; SET session_replication_role=origin;")
    c=cap(ADMIN);ok('catalogue feature off closes capability and reader',c['reason'] in('catalog_feature_disabled',) and caterr(ADMIN,P)=='feature_not_entitled')
    pg.sql(f"SET session_replication_role=replica; UPDATE public.saas_plan_version_features SET enabled=true WHERE feature_id='{U(910)}'; SET session_replication_role=origin;")
    ok('feature restored reopens capability',cap(ADMIN)['order_create'] is True)
    for k in ['T','GT']:assert CAT_BEFORE[k]=='forbidden_financial_terms',CAT_BEFORE
    ok('technician denial forbidden_financial_terms preserved')

def catalog_rollback_checks():
    ok('rollback restores exact LIVE catalogue MD5/ACL',md5('public.get_partner_catalog_secure(uuid)')==LIVECAT['get_partner_catalog_secure(uuid)']['md5'] and pg.sql("SELECT proacl::text FROM pg_proc WHERE oid='public.get_partner_catalog_secure(uuid)'::regprocedure")==LIVECAT['get_partner_catalog_secure(uuid)']['acl'])
    ok('after rollback internal portfolio catalogue denied again; external unchanged',caterr(ADMIN,P)=='forbidden_partner' and catq(G,P)==CAT_BEFORE['G'])
