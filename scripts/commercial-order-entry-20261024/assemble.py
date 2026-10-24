"""Assemble review-only SQL. Never executes anything."""
import json
from pathlib import Path
D=Path(__file__).resolve().parent
BASE=Path('/dev-server/scripts/owner-orders-20261023/credit-numeric-20261024/current-base-reconciliation-20261024/origin/baseline')
E=json.loads((D/'expected.json').read_text())
fn=(D/'src/functions.sql').read_text()
CAP=json.loads((D/'catalog/live-capture.json').read_text())
CAT={r['signature']:r for r in CAP}
L1=CAT['get_partner_catalog_secure(uuid)'];L2=CAT['get_partner_catalog_secure(uuid,boolean)']
GATE_OLD="    IF NOT s.profile_ok OR s.org_partner IS DISTINCT FROM p_partner_id OR NOT s.partner_valid THEN\n"
GATE_NEW=("    IF (NOT s.profile_ok OR s.org_partner IS DISTINCT FROM p_partner_id OR NOT s.partner_valid)\n"
          "       AND NOT (platform_private.b2b_internal_commercial_actor()\n"
          "                AND platform_private.c2_internal_order_target_reason(v_uid, p_partner_id) IS NULL) THEN\n")
assert L1['definition'].count(GATE_OLD)==1
cat_sql="-- C2_INTERNAL_ORDER_ENTRY_V1 catalogue: only the partner gate changes; visibility, prices, sheets, V2 wrapper untouched.\n"+L1['definition'].replace(GATE_OLD,GATE_NEW)+";\nALTER FUNCTION public.get_partner_catalog_secure(uuid) OWNER TO postgres;\n"
(D/'catalog/get_partner_catalog_secure.candidate.sql').write_text(cat_sql)
fn=fn.replace('__CATALOG_MD5__',E['candidate'].get('public.get_partner_catalog_secure(uuid)','__CATALOG_MD5__'))+"\n"+cat_sql
live=(BASE/'platform_private.c2_order_actor_scope.sql').read_text().strip()
def guard(sig,md5,label):
    return f"IF md5(pg_get_functiondef('{sig}'::regprocedure)) IS DISTINCT FROM '{md5}' THEN RAISE EXCEPTION '{label}:{sig}'; END IF;"
def acl(sig,want,label):
    return f"IF (SELECT proacl::text FROM pg_proc WHERE oid='{sig}'::regprocedure) IS DISTINCT FROM '{want}' OR (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid='{sig}'::regprocedure) IS DISTINCT FROM 'postgres' THEN RAISE EXCEPTION '{label}:{sig}'; END IF;"
HELP=json.loads((D/'catalog/live-helpers.json').read_text())
deps=[guard(k,v,'C2IOE_DEPENDENCY_DRIFT') for k,v in E['dependencies'].items()]+[x for r in HELP for x in (guard(r['signature'],r['md5'],'C2IOE_DEPENDENCY_DRIFT'),acl(r['signature'],r['acl'],'C2IOE_ACL_DRIFT'))]+[guard('public.get_partner_catalog_secure(uuid,boolean)',L2['md5'],'C2IOE_DEPENDENCY_DRIFT'),acl('public.get_partner_catalog_secure(uuid,boolean)',L2['acl'],'C2IOE_ACL_DRIFT'),acl('public.get_partner_catalog_secure(uuid)',L1['acl'],'C2IOE_ACL_DRIFT'),
]
pre_live="DO $pre$ BEGIN\n SET LOCAL lock_timeout='5s';\n "+"\n ".join(deps+[guard('platform_private.c2_order_actor_scope(uuid,uuid)',E['live_scope'],'C2IOE_PRE_LIVE_DRIFT'),guard('public.get_partner_catalog_secure(uuid)',L1['md5'],'C2IOE_PRE_LIVE_DRIFT'),
 "IF to_regprocedure('public.c2_internal_order_entry_capability_v1()') IS NOT NULL OR to_regprocedure('platform_private.c2_internal_order_target_reason(uuid,uuid)') IS NOT NULL THEN RAISE EXCEPTION 'C2IOE_PRE_ALREADY_PRESENT'; END IF;"])+"\nEND $pre$;\n"
post_cand="DO $post$ BEGIN\n "+"\n ".join(deps+[guard(k,v,'C2IOE_POST_DRIFT') for k,v in E['candidate'].items()]+[
 "IF has_function_privilege('authenticated','platform_private.c2_internal_order_target_reason(uuid,uuid)','EXECUTE') OR has_function_privilege('authenticated','platform_private.c2_order_actor_scope(uuid,uuid)','EXECUTE') OR has_function_privilege('anon','public.c2_internal_order_entry_capability_v1()','EXECUTE') OR NOT has_function_privilege('authenticated','public.c2_internal_order_entry_capability_v1()','EXECUTE') THEN RAISE EXCEPTION 'C2IOE_POST_ACL'; END IF;"])+"\nEND $post$;\n"
head="-- REVIEW ONLY / INACTIVE. Never apply without independent review and owner-run release.\n-- Single transaction: PRE, DDL and POST share one txid. Writer, accounting gate and downstream containment untouched.\n"
(D/'preflight.sql').write_text(head+"BEGIN READ ONLY;\n"+pre_live+"SELECT 'C2IOE_PREFLIGHT_PASS';\nCOMMIT;\n")
(D/'candidate.sql.review').write_text(head+"BEGIN;\n"+pre_live+fn+post_cand+"COMMIT;\n")
(D/'postflight.sql').write_text(head+"BEGIN READ ONLY;\n"+post_cand+"SELECT 'C2IOE_POSTFLIGHT_PASS';\nCOMMIT;\n")
rb_pre="DO $pre$ BEGIN\n "+"\n ".join(deps+[guard(k,v,'C2IOE_ROLLBACK_PRE_DRIFT') for k,v in E['candidate'].items()])+"\nEND $pre$;\n"
rb_post="DO $post$ BEGIN\n "+"\n ".join(deps+[guard('platform_private.c2_order_actor_scope(uuid,uuid)',E['live_scope'],'C2IOE_ROLLBACK_POST_DRIFT'),guard('public.get_partner_catalog_secure(uuid)',L1['md5'],'C2IOE_ROLLBACK_POST_DRIFT'),
 "IF to_regprocedure('public.c2_internal_order_entry_capability_v1()') IS NOT NULL OR to_regprocedure('platform_private.c2_internal_order_target_reason(uuid,uuid)') IS NOT NULL THEN RAISE EXCEPTION 'C2IOE_ROLLBACK_POST_PRESENT'; END IF;"])+"\nEND $post$;\n"
(D/'rollback.sql.review').write_text(head+"-- Restores exact captured LIVE scope and catalogue bodies (internal portfolio entry closed again). No data touched; orders already created keep snapshots/history.\nBEGIN;\n"+rb_pre+live+";\nALTER FUNCTION platform_private.c2_order_actor_scope(uuid,uuid) OWNER TO postgres;\nREVOKE ALL ON FUNCTION platform_private.c2_order_actor_scope(uuid,uuid) FROM PUBLIC, anon, authenticated, service_role;\nGRANT EXECUTE ON FUNCTION platform_private.c2_order_actor_scope(uuid,uuid) TO postgres;\n"+L1['definition']+";\nALTER FUNCTION public.get_partner_catalog_secure(uuid) OWNER TO postgres;\nDROP FUNCTION public.c2_internal_order_entry_capability_v1();\nDROP FUNCTION platform_private.c2_internal_order_target_reason(uuid,uuid);\n"+rb_post+"COMMIT;\n")
print('assembled')
