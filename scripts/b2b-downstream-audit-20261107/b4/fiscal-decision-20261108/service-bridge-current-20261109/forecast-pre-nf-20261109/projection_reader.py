"""Minimal authorized contract for rpc_receivable_money_projection_v1 (reviews 890bfa4/5, 209/584d530 item 2).

Consumer: deferred src/lib/financeiro/receivableOrigin.ts (client.rpc), NOT mounted in
live src. The reader is ABSENT in production (READONLY reported by the auditor); its
origin is the INTERMEDIATE stage scripts/financial-price-generator-20261029/integration/
origin.sql.review (revokes authenticated). So PRE pins the promoted LOCAL INTERMEDIATE
body produced by that stage in a disposable restore, never a LIVE capture, and the
install order is: origin.sql.review -> 13 PRE -> 14 INSTALL -> 15 POST (rollback 16).

Pins (body md5 + owner + normalized ACL) cover the RPC, the new helper and every
dependency the candidate calls. is_financial_staff must equal the LIVE READONLY md5
6e8f2fa7b92ca7e039d092353b3ebfe2 (accepts administrador/gestor/financeiro via
fn_authz_uid_scope_ok); the canonical policy is preserved, never narrowed/expanded.
A pre-existing helper of the same signature aborts PRE/INSTALL (CREATE, not REPLACE).
Rollback validates the exact candidate metadata first, then CLOSES deny-only: keeps the
hardened candidate body, helper -> false, revokes authenticated. It never restores the
pre-candidate body. Never applied hosted here.
"""
import hashlib
import json
import re
from pathlib import Path

SIG = 'public.rpc_receivable_money_projection_v1(uuid,integer,integer)'
HELPER = 'platform_private.receivable_money_reader_allowed_v1()'
SOURCE = 'scripts/financial-price-generator-20261029/integration/origin.sql.review'
LIVE_IS_FINANCIAL_STAFF_MD5 = '6e8f2fa7b92ca7e039d092353b3ebfe2'
# Promoted local intermediate body after origin.sql.review (attempt 209, disposable PG).
INTERMEDIATE_RPC_MD5 = '7c5d3fa0a4c9516ab1c40b058a529578'
DEPS = ('public.is_financial_staff(uuid)', 'public.h15_actor_organization()',
        'public._saas_user_has_feature(uuid,text)',
        'platform_private.b2b_legacy_money_row(uuid)', 'platform_private.b2b_allocation_money_row(uuid)')
CHECK = (" IF auth.uid() IS NULL OR org IS NULL OR public.is_financial_staff(auth.uid()) IS NOT TRUE "
         "THEN RAISE EXCEPTION 'MONEY_ORIGIN_ACCESS_DENIED' USING ERRCODE='42501'; END IF;\n")
ADDED = (" IF platform_private.receivable_money_reader_allowed_v1() IS NOT TRUE "
         "THEN RAISE EXCEPTION 'MONEY_ORIGIN_ACCESS_DENIED' USING ERRCODE='42501'; END IF;\n")
HELPER_SQL = f"""CREATE FUNCTION {HELPER} RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT auth.uid() IS NOT NULL
   AND public.h15_actor_organization() IS NOT NULL
   AND public.is_financial_staff(auth.uid()) IS TRUE
   AND public._saas_user_has_feature(auth.uid(),'contas_receber') IS TRUE;
$$;
REVOKE ALL ON FUNCTION {HELPER} FROM PUBLIC,anon,authenticated,service_role;
"""
CLOSED_HELPER = (f"CREATE OR REPLACE FUNCTION {HELPER} RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER "
                 "SET search_path='' AS $$ SELECT false $$;\n"
                 f"REVOKE ALL ON FUNCTION {HELPER} FROM PUBLIC,anon,authenticated,service_role;\n")


def acl_expr(oid_sql):
    """Normalized ACL: sorted grantee:privilege:grantor (PUBLIC=0) over aclexplode, owner default included."""
    return (f"(SELECT coalesce(string_agg(x.grantee::regrole::text||':'||x.privilege_type||':'||x.grantor::regrole::text,"
            f"',' ORDER BY x.grantee::regrole::text,x.privilege_type),'') FROM pg_proc pp, "
            f"aclexplode(coalesce(pp.proacl,acldefault('f',pp.proowner))) x WHERE pp.oid={oid_sql} AND x.grantee<>0)"
            f"||CASE WHEN EXISTS(SELECT 1 FROM pg_proc pp,aclexplode(coalesce(pp.proacl,acldefault('f',pp.proowner))) x "
            f"WHERE pp.oid={oid_sql} AND x.grantee=0) THEN ',PUBLIC' ELSE '' END")


def meta_sql(sig):
    o = f"'{sig}'::regprocedure"
    return (f"SELECT jsonb_build_object('md5',md5(pg_get_functiondef({o})),'owner',"
            f"(SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid={o}),'acl',{acl_expr(o)})::text;")


def original_definition(root):
    text = (Path(root) / SOURCE).read_text()
    m = re.search(r"CREATE OR REPLACE FUNCTION public\.rpc_receivable_money_projection_v1\(.*?\nEND \$\$;", text, re.S)
    assert m, 'projection definition not found in source'
    body = m.group(0)
    assert body.count(CHECK) == 1
    return body


def candidate_definition(root):
    return original_definition(root).replace(CHECK, CHECK + ADDED, 1)


def probe_sql(root):
    """Run once in a disposable PG inside a rolled-back txn to derive candidate pins."""
    return ("BEGIN;\n" + HELPER_SQL + candidate_definition(root) + f"""
REVOKE ALL ON FUNCTION {SIG} FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION {SIG} TO authenticated;
SELECT 'PROBE_RPC '||({meta_sql(SIG)[7:-1]});
SELECT 'PROBE_HELPER '||({meta_sql(HELPER)[7:-1]});
""" + CLOSED_HELPER + f"""REVOKE ALL ON FUNCTION {SIG} FROM PUBLIC,anon,authenticated,service_role;
SELECT 'PROBE_RB_RPC '||({meta_sql(SIG)[7:-1]});
SELECT 'PROBE_RB_HELPER '||({meta_sql(HELPER)[7:-1]});
ROLLBACK;
""")


def _assert_meta(sig, m, tag):
    o = f"'{sig}'::regprocedure"
    return (f" IF to_regprocedure('{sig}') IS NULL OR md5(pg_get_functiondef({o}))<>'{m['md5']}'"
            f" OR (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid={o})<>'{m['owner']}'"
            f" OR {acl_expr(o)}<>'{m['acl']}' THEN RAISE EXCEPTION '{tag}: {sig}'; END IF;\n")


def build(root, pins):
    """pins: dict with 'pre_rpc', 'deps' {sig: meta}, 'cand_rpc', 'cand_helper', 'rb_rpc', 'rb_helper'."""
    assert pins['pre_rpc']['md5'] == INTERMEDIATE_RPC_MD5, ('INTERMEDIATE_DRIFT', pins['pre_rpc'])
    assert pins['deps']['public.is_financial_staff(uuid)']['md5'] == LIVE_IS_FINANCIAL_STAFF_MD5, \
        ('IS_FINANCIAL_STAFF_NOT_LIVE', pins['deps']['public.is_financial_staff(uuid)'])
    assert set(pins['deps']) == set(DEPS)
    dep_checks = ''.join(_assert_meta(s, pins['deps'][s], 'PROJECTION_READER_DEP_DRIFT') for s in DEPS)
    pre_guard = ("DO $$ BEGIN\n" + _assert_meta(SIG, pins['pre_rpc'], 'PROJECTION_READER_PRE_DRIFT') + dep_checks +
                 f" IF to_regprocedure('{HELPER}') IS NOT NULL THEN RAISE EXCEPTION 'PROJECTION_READER_HELPER_PREEXISTS'; END IF;\n"
                 "END $$;\n")
    post_guard = ("DO $$ BEGIN\n" + _assert_meta(SIG, pins['cand_rpc'], 'PROJECTION_READER_POST_FAILED') +
                  _assert_meta(HELPER, pins['cand_helper'], 'PROJECTION_READER_POST_FAILED') + dep_checks + "END $$;\n")
    rb_post = ("DO $$ BEGIN\n" + _assert_meta(SIG, pins['rb_rpc'], 'PROJECTION_READER_ROLLBACK_FAILED') +
               _assert_meta(HELPER, pins['rb_helper'], 'PROJECTION_READER_ROLLBACK_FAILED') + "END $$;\n")
    header = ("-- REVIEW_ONLY_INACTIVE_NOT_APPROVED. project_ref swzpzcwiasxmjutrmvkm. Order: origin.sql.review"
              " (intermediate, pin LOCAL_INTERMEDIATE " + INTERMEDIATE_RPC_MD5 + ") -> 13 -> 14 -> 15; rollback 16.\n")
    pre = header + "BEGIN READ ONLY;\n" + pre_guard + "SELECT 'PRE_OK';\nROLLBACK;\n"
    install = (header + "BEGIN;\n" + pre_guard + HELPER_SQL + candidate_definition(root) + f"""
REVOKE ALL ON FUNCTION {SIG} FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION {SIG} TO authenticated;
""" + post_guard + "COMMIT;\n")
    post = header + "BEGIN READ ONLY;\n" + post_guard + "SELECT 'POST_OK';\nROLLBACK;\n"
    rollback = (header + "-- Deny-only: validates exact candidate, keeps hardened body, never restores pre-candidate body.\n"
                "BEGIN;\n" + post_guard + CLOSED_HELPER +
                f"REVOKE ALL ON FUNCTION {SIG} FROM PUBLIC,anon,authenticated,service_role;\n" + rb_post + "COMMIT;\n")
    files = {'13-pre-projection-reader.sql.readonly': pre, '14-install-projection-reader.sql.review': install,
             '15-post-projection-reader.sql.readonly': post, '16-rollback-projection-reader-deny.sql.review': rollback}
    return files, {k: hashlib.sha256(v.encode()).hexdigest() for k, v in files.items()}


def parse_probe(stdout):
    out = {}
    for line in stdout.splitlines():
        line = line.strip()
        for tag, key in (('PROBE_RB_RPC ', 'rb_rpc'), ('PROBE_RB_HELPER ', 'rb_helper'),
                         ('PROBE_RPC ', 'cand_rpc'), ('PROBE_HELPER ', 'cand_helper')):
            if line.startswith(tag):
                out[key] = json.loads(line[len(tag):]); break
    assert set(out) == {'rb_rpc', 'rb_helper', 'cand_rpc', 'cand_helper'}, out
    return out
