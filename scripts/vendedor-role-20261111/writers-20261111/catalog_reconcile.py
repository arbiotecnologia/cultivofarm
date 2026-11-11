"""Reconstitui no espelho descartável o catálogo de PRODUÇÃO public.get_partner_catalog_secure(uuid) 6b56cfb1.
Cadeia comprovada: espelho b5684d35 -> deltas tenant-exclusive-catalog-20261101/ae_section (d3217db2)
-> deltas b2b-catalog-read-fence-v2-20261103/02-install-v2 (6b56cfb1). Dependência catalog_tenant_seller(uuid)
vem de tenant-exclusive-catalog-20261101/homolog-clean (v4, reportada aplicada). Nunca hospedado."""
import re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
SIG='public.get_partner_catalog_secure(uuid)'
MIRROR_MD5='b5684d350603d1db77ab9f1db0f4b253';AE_MD5='d3217db2d641a8bae11bcf7d68d47dae';PROD_MD5='6b56cfb144ebc8dd947473e90e2d7768'
READER=('platform_private.b2b_partner_catalog_reader(uuid)','bd985484b69c8fa6e63a920eff518369')
PRICE=('platform_private.b2b_partner_catalog_item_price(uuid,uuid,uuid,text,numeric,date)','61e545e6138485ba995f989d2011590a')
SELLER_SIG='platform_private.catalog_tenant_seller(uuid)'
SELLER_FN=re.search(r"CREATE FUNCTION platform_private\.catalog_tenant_seller.*?\$f\$;",(ROOT/'tenant-exclusive-catalog-20261101/homolog-clean/01-migrate.homolog-clean.sql.review').read_text(),re.S).group(0)
AE=[('WHERE p.ativo = true AND p.b2b_enabled = true AND','WHERE p.ativo = true AND p.b2b_enabled = true AND p.owner_organization_id = platform_private.catalog_tenant_seller(p_partner_id) AND',1),
    ('WHERE m.ativo = true AND m.b2b_enabled = true AND','WHERE m.ativo = true AND m.b2b_enabled = true AND m.owner_organization_id = platform_private.catalog_tenant_seller(p_partner_id) AND',1)]
A2="  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE='42501'; END IF;\n"
V2=[('public.fn_b2b_resolve_base_unit_price(p_partner_id, v_pid, v_mid, ','platform_private.b2b_partner_catalog_item_price(p_partner_id, v_pid, v_mid, ',3),
    (A2,A2+"  PERFORM platform_private.b2b_partner_catalog_reader(p_partner_id);\n",1)]
# ACL de PRODUÇÃO informada pelo auditor (somente leitura). Comparação por CONJUNTO (grantor,grantee,priv,grant_option)+owner.
PROD_ACL={
 'public.get_partner_catalog_secure(uuid)':'{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}|postgres',
 'public.simulate_b2b_payment_plan_secure(uuid,uuid,jsonb,date)':'{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}|postgres',
 'public.respond_b2b_order_quote_secure(uuid,jsonb,date,integer,text)':'{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}|postgres',
 'platform_private.b2b_internal_order_snapshot_guard()':'{postgres=X/postgres,service_role=X/postgres}|postgres',
 'platform_private.b2b_internal_child_snapshot_guard()':'{postgres=X/postgres,service_role=X/postgres}|postgres',
 'platform_private.b2b_internal_assert_origin(jsonb,uuid,uuid)':'{postgres=X/postgres,service_role=X/postgres}|postgres'}
def apply(db,v,reps):
    for a,b,n in reps:
        assert v.count(a)==n,('ANCHOR',a[:60],v.count(a)); v=v.replace(a,b)
    db.sql(v)
def reconcile(db):
    acl0=db.last(f"SELECT coalesce(proacl::text,'NULL')||'|'||pg_get_userbyid(proowner) FROM pg_proc WHERE oid='{SIG}'::regprocedure")
    m=db.md5(SIG)
    if m==PROD_MD5: return dict(already=True)
    assert m==MIRROR_MD5,('CATALOG_BASE_UNKNOWN',m)
    for s,h in (READER,PRICE): assert db.md5(s)==h,('DEP_DRIFT',s)
    if db.last(f"SELECT to_regprocedure('{SELLER_SIG}') IS NULL")=='t':
        db.sql(SELLER_FN);db.sql(f"REVOKE ALL ON FUNCTION {SELLER_SIG} FROM PUBLIC, anon, authenticated, service_role;")
    apply(db,db.body(SIG),AE);assert db.md5(SIG)==AE_MD5
    apply(db,db.body(SIG),V2);assert db.md5(SIG)==PROD_MD5
    acl1=db.last(f"SELECT coalesce(proacl::text,'NULL')||'|'||pg_get_userbyid(proowner) FROM pg_proc WHERE oid='{SIG}'::regprocedure")
    assert acl0==acl1
    return dict(already=False,chain=[MIRROR_MD5,AE_MD5,PROD_MD5],seller_fn_md5=db.md5(SELLER_SIG),acl=acl1)
def acl_set_sql(sig):
    "Conjunto canônico ordenado de (grantor,grantee,privilégio,grant_option) + owner; PUBLIC=grantee 0."
    return (f"(SELECT coalesce(string_agg(format('%s>%s:%s:%s',pg_get_userbyid(a.grantor),CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,a.privilege_type,a.is_grantable),',' ORDER BY 1),'')"
            f"||'|'||pg_get_userbyid(p.proowner) FROM pg_proc p LEFT JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a ON true WHERE p.oid='{sig}'::regprocedure GROUP BY p.proowner)")
def acl_set(db,sig): return db.last("SELECT "+acl_set_sql(sig)+";")
def acl_text_to_set(db,text):
    acl,owner=text.split('|')
    return db.last(f"SELECT coalesce(string_agg(format('%s>%s:%s:%s',pg_get_userbyid(a.grantor),CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,a.privilege_type,a.is_grantable),',' ORDER BY 1),'')||'|{owner}' FROM aclexplode('{acl}'::aclitem[]) a;")
