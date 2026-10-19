#!/usr/bin/env python3
"""Generates the review SQL files of this package from function.sql.review.

REVIEW ONLY. Nothing here connects to any database. POST_MD5 is the md5 of
pg_get_functiondef() measured by test-local.py on PostgreSQL 17 (hosted is 17.6).
Usage: python3 assemble.py <post_md5>
"""
import sys
from pathlib import Path

H = Path(__file__).parent
REF = 'swzpzcwiasxmjutrmvkm'
ACL3 = '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'
DEPS = [
    ('public.h15_actor_organization()', '55edafec08bcc84a00f1526c14334a2c', ACL3, False),
    ('public.has_role(uuid,public.app_role)', '4d90e93d521a4819d9085f28d742030f', ACL3, False),
    ('platform_private.h15_actor_organization()', '64e10608403238a41a9baf92857ca881', ACL3, True),
    ('platform_private.has_role(uuid,public.app_role)', 'c5af5b55de6d79da9b73a33948746ae2', '{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}', True),
    ('platform_private.platform_actor_access_ready(uuid)', '048249c0c2106c3761e26eacb8d0de84', ACL3, True),
]
POLICIES = [('profiles', 'Users can view own profile'), ('user_roles', 'Users can view own roles')]
POLICY_MD5 = 'a1fc7aa105a1b503f03297d4c928519f'  # md5(qual||'|'||with_check) of "(( SELECT auth.uid() AS uid) = user_id)|"
TARGET = 'public.internal_actor_context_v1()'
TARGET_ACL = '{postgres=X/postgres,authenticated=X/postgres}'


def common_guards() -> str:
    g = [f" IF (SELECT project_ref FROM public.fiscal_environment_marker LIMIT 1) IS DISTINCT FROM '{REF}' THEN RAISE EXCEPTION 'WRONG_PROJECT'; END IF;",
         " IF current_setting('server_version_num')::int / 10000 <> 17 THEN RAISE EXCEPTION 'PG_MAJOR_DRIFT'; END IF;"]
    for sig, md5, acl, secdef in DEPS:
        g.append(f" IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('{sig}') AND md5(pg_get_functiondef(oid))='{md5}' AND proowner='postgres'::regrole AND prosecdef IS {'TRUE' if secdef else 'FALSE'} AND provolatile='s' AND proacl::text='{acl}') THEN RAISE EXCEPTION 'FUNCTION_DRIFT: %', '{sig}'; END IF;")
    for t in ('profiles', 'user_roles'):
        g.append(f" IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.{t}'::regclass) THEN RAISE EXCEPTION 'RLS_DRIFT: %', '{t}'; END IF;")
    for t, p in POLICIES:
        g.append(f" IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='{t}' AND policyname='{p}' AND cmd='SELECT' AND permissive='PERMISSIVE' AND md5(coalesce(qual,'')||'|'||coalesce(with_check,''))='{POLICY_MD5}') THEN RAISE EXCEPTION 'POLICY_DRIFT: %', '{t}'; END IF;")
    g.append(" IF NOT EXISTS(SELECT 1 FROM pg_indexes WHERE schemaname='public' AND tablename='profiles' AND indexname='profiles_user_id_key') OR NOT EXISTS(SELECT 1 FROM pg_indexes WHERE schemaname='public' AND tablename='user_roles' AND indexname='user_roles_user_id_role_key') THEN RAISE EXCEPTION 'UNIQUE_DRIFT'; END IF;")
    g.append(" IF NOT has_schema_privilege('authenticated','platform_private','USAGE') THEN RAISE EXCEPTION 'SCHEMA_USAGE_DRIFT'; END IF;")
    return '\n'.join(g)


def pre_guard() -> str:
    return ("DO $pre$ BEGIN\n" + common_guards() +
            "\n IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='internal_actor_context_v1') THEN RAISE EXCEPTION 'TARGET_ALREADY_PRESENT'; END IF;\nEND $pre$;\n")


def post_guard(md5: str) -> str:
    return ("DO $post$ BEGIN\n" + common_guards() + f"""
 IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='internal_actor_context_v1') <> 1 THEN RAISE EXCEPTION 'TARGET_OVERLOAD'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('{TARGET}') AND md5(pg_get_functiondef(oid))='{md5}' AND proowner='postgres'::regrole AND prosecdef IS FALSE AND provolatile='s' AND proretset IS FALSE AND prorettype='jsonb'::regtype AND proconfig::text='{{"search_path=\\"\\""}}' AND proacl::text='{TARGET_ACL}') THEN RAISE EXCEPTION 'TARGET_POST_DRIFT'; END IF;
 IF has_function_privilege('anon','{TARGET}','EXECUTE') OR has_function_privilege('public','{TARGET}','EXECUTE') OR NOT has_function_privilege('authenticated','{TARGET}','EXECUTE') THEN RAISE EXCEPTION 'TARGET_ACL_DRIFT'; END IF;
END $post$;
""")


HEADER = f"-- REVIEW ONLY, NOT APPLIED BY THE AGENT. Apply ONLY to Supabase {REF} after independent review. No data writes.\n"


def main():
    md5 = sys.argv[1]
    assert len(md5) == 32
    fn = (H / 'function.sql.review').read_text().rstrip('\n') + ';\n'
    (H / 'preflight-readonly.sql').write_text(HEADER + "BEGIN READ ONLY;\n" + pre_guard() + "SELECT 'PRE_OK' AS result;\nROLLBACK;\n")
    (H / 'postflight-readonly.sql').write_text(HEADER + "BEGIN READ ONLY;\n" + post_guard(md5) + "SELECT 'POST_OK' AS result;\nROLLBACK;\n")
    (H / 'candidate.sql.review').write_text(
        HEADER + "-- Order: apply THIS first, run postflight, only then publish the frontend.\nBEGIN;\nSET LOCAL lock_timeout = '3s';\n" + pre_guard() + fn +
        f"REVOKE ALL ON FUNCTION {TARGET} FROM PUBLIC;\nREVOKE ALL ON FUNCTION {TARGET} FROM anon;\nREVOKE ALL ON FUNCTION {TARGET} FROM service_role;\nGRANT EXECUTE ON FUNCTION {TARGET} TO authenticated;\n"
        f"COMMENT ON FUNCTION {TARGET} IS 'monitor-single-rtt-probe v1: read-only observation of the caller''s own auth.uid() (h15 org, own profile, own roles + has_role) in one statement. Grants nothing.';\n"
        + post_guard(md5) + "COMMIT;\n")
    (H / 'rollback.sql.review').write_text(
        HEADER + "-- Order: FIRST republish the frontend baseline d58c1730 (rollback.sh), THEN run this. Frontend without the RPC fails closed (pauses).\nBEGIN;\nSET LOCAL lock_timeout = '3s';\n" + post_guard(md5) +
        f"DROP FUNCTION {TARGET};\n" + pre_guard() + "COMMIT;\n")
    print('assembled', md5)


if __name__ == '__main__':
    main()
