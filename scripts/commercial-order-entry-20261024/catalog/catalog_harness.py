# Exec'd by ../test-local.py inside the disposable PostgreSQL only. Synthetic Auth; NOT hosted JWT/RLS.
# Installs the captured LIVE catalogue readers (MD5/owner/ACL exact) on top of the order chain.
# Synthetic (explicitly, uncaptured in this material): catalogue tables shape, C1B visibility helper
# taken from the reviewed C1B package source, and fn_b2b_resolve_base_unit_price stub (fixed 12/litro).
CATDIR=D/'catalog'
LIVECAT={r['signature']:r for r in json.loads((CATDIR/'live-capture.json').read_text())}
pg.sql("""SET session_replication_role=replica;
CREATE TABLE IF NOT EXISTS public.product_technical_profiles(produto_id uuid,status_validacao text,resumo_curto text,explicacao_b2b text,beneficio_combinado text,explicacao_produtor text,indicacoes_uso text,cuidados_aplicacao text);
CREATE TABLE IF NOT EXISTS public.microorganism_technical_profiles(microrganismo_id uuid,status_validacao text,resumo_curto text,explicacao_b2b text,beneficios_agronomicos text,explicacao_produtor text,indicacoes_uso text,cuidados_aplicacao text,mecanismo_acao text);
CREATE TABLE IF NOT EXISTS public.product_target_recommendations(produto_id uuid,ativo boolean);
CREATE TABLE IF NOT EXISTS public.microorganism_targets(microrganismo_id uuid,ativo boolean);
CREATE TABLE IF NOT EXISTS public.catalog_technical_sources(entidade_id uuid,entidade_tipo text);
CREATE TABLE IF NOT EXISTS public.catalog_tenant_visibility(organization_id uuid,entity_type text,produto_id uuid,microrganismo_id uuid,hidden boolean);
CREATE OR REPLACE FUNCTION public.fn_b2b_resolve_base_unit_price(uuid,uuid,uuid,text,numeric,date) RETURNS jsonb LANGUAGE sql STABLE SET search_path TO '' AS $$SELECT CASE WHEN $4='litro' THEN '{"ok":true,"base_price":12}'::jsonb ELSE '{"ok":false}'::jsonb END$$;
SET session_replication_role=origin;""")
c1b=(ROOT/'scripts/catalog-c1b-20261021/candidate.sql.review').read_text()
i=c1b.index('CREATE OR REPLACE FUNCTION platform_private.c1b_catalog_visibility_scope');j=c1b.index('END $c1b$;',i)+len('END $c1b$;')
pg.sql(c1b[i:j]+"\nREVOKE ALL ON FUNCTION platform_private.c1b_catalog_visibility_scope(uuid) FROM PUBLIC,anon,authenticated,service_role;")
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
SET session_replication_role=origin;""")
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
    ok('canonical price resolver untouched (same base for every reader)',all(x['preco_parceiro']==12.0 and x['unidade_preco_principal']=='litro' for x in rows))
    byid={x['item_id']:x for x in rows}
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
