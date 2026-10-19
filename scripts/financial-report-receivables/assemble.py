#!/usr/bin/env python3
"""Builds candidate/rollback/preflight/postflight from the exact function files."""
import hashlib, pathlib
H = pathlib.Path(__file__).parent
base = (H/"baseline.function.sql").read_text()
cand = (H/"candidate.function.sql").read_text()
BASE_MD5 = "970a18caa86f578cd31de2a56f002f6f"
assert hashlib.md5(base.encode()).hexdigest() == BASE_MD5, "baseline bytes drifted"
CAND_MD5 = hashlib.md5(cand.encode()).hexdigest()
SIG = "public.get_report_receivables(jsonb)"
BASE_ACL = "{postgres=X/postgres,service_role=X/postgres}"
CAND_ACL = "{postgres=X/postgres,authenticated=X/postgres}"

def guard(name, md5, acl):
    return f"""DO $guard$
DECLARE r record; n int;
BEGIN
  IF current_setting('server_version_num')::int < 140000 THEN RAISE EXCEPTION '{name}: pg version'; END IF;
  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace
   WHERE s.nspname='public' AND p.proname='get_report_receivables';
  IF n <> 1 THEN RAISE EXCEPTION '{name}: overloads %', n; END IF;
  SELECT md5(pg_get_functiondef(p.oid)) AS m, coalesce(p.proacl::text,'') AS a INTO r
    FROM pg_proc p WHERE p.oid = '{SIG}'::regprocedure;
  IF r.m <> '{md5}' THEN RAISE EXCEPTION '{name}: function md5 %', r.m; END IF;
  IF r.a <> '{acl}' THEN RAISE EXCEPTION '{name}: acl %', r.a; END IF;
  -- helpers the candidate depends on (exact live fingerprints, read-only 2026-10-19)
  IF md5(pg_get_functiondef('platform_private.h15_actor_organization()'::regprocedure)) <> '64e10608403238a41a9baf92857ca881'
  OR md5(pg_get_functiondef('platform_private.has_role(uuid,public.app_role)'::regprocedure)) <> 'c5af5b55de6d79da9b73a33948746ae2'
  OR md5(pg_get_functiondef('platform_private.platform_actor_access_ready(uuid)'::regprocedure)) <> '048249c0c2106c3761e26eacb8d0de84'
  THEN RAISE EXCEPTION '{name}: helper drift'; END IF;
  -- schema used by the body (no invented columns)
  SELECT count(*) INTO n FROM information_schema.columns WHERE table_schema='public' AND (table_name, column_name) IN (
    ('accounts_receivable','organization_id'),('accounts_receivable','customer_id'),('accounts_receivable','category_id'),
    ('accounts_receivable','status'),('accounts_receivable','description'),
    ('accounts_receivable_installments','organization_id'),('accounts_receivable_installments','receivable_id'),
    ('accounts_receivable_installments','due_date'),('accounts_receivable_installments','original_amount'),
    ('accounts_receivable_installments','received_amount'),('accounts_receivable_installments','discount_amount'),
    ('accounts_receivable_installments','status'),('clientes','organization_id'),('clientes','nome'),
    ('clientes','razao_social'),('financial_categories','name'));
  IF n <> 16 THEN RAISE EXCEPTION '{name}: schema columns %', n; END IF;
END $guard$;
"""

hdr = "-- REVIEW ONLY. Not a migration; never auto-applied. Target ref swzpzcwiasxmjutrmvkm.\n"
(H/"preflight-readonly.sql").write_text(hdr + guard("preflight", BASE_MD5, BASE_ACL))
(H/"postflight-readonly.sql").write_text(hdr + guard("postflight", CAND_MD5, CAND_ACL))
(H/"candidate.sql.review").write_text(hdr + "BEGIN;\n" + guard("pre", BASE_MD5, BASE_ACL) + cand + ";\n"
  f"REVOKE ALL ON FUNCTION {SIG} FROM PUBLIC, anon, service_role;\n"
  f"GRANT EXECUTE ON FUNCTION {SIG} TO authenticated;\n" + guard("post", CAND_MD5, CAND_ACL) + "COMMIT;\n")
(H/"rollback.sql.review").write_text(hdr + "BEGIN;\n" + guard("rollback-pre", CAND_MD5, CAND_ACL) + base + ";\n"
  f"REVOKE ALL ON FUNCTION {SIG} FROM PUBLIC, anon, authenticated;\n"
  f"GRANT EXECUTE ON FUNCTION {SIG} TO service_role;\n" + guard("rollback-post", BASE_MD5, BASE_ACL) + "COMMIT;\n")
print("candidate md5", CAND_MD5)
