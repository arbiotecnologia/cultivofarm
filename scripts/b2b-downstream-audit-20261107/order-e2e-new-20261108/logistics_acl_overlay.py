#!/usr/bin/env python3
"""Generate a separate PRE40/INSTALL41/POST42 overlay for the real service_role
EXECUTE grant on platform_private.b2b_internal_order_snapshot_guard().

The frozen production-rollout-posplans-20261108 package is never modified.
Only the three ACL lines of that single function change; every other byte,
including the DDL candidate, the 14 other function pins and rollback 94, stays
identical. No hosted I/O.
"""
import argparse
import hashlib
import json
import shutil
from pathlib import Path

H = Path(__file__).resolve().parent
ROOT = H.parents[2]
FROZEN = H / "production-rollout-posplans-20261108"
PRE_NAME = "40-logistics-pre-after-physical.sql.readonly"
INSTALL_NAME = "41-logistics-install.sql.review"
POST_NAME = "42-logistics-post.sql.readonly"
ROLLBACK_NAME = "94-logistics-rollback-deny.sql.review"
README_NAME = "README.md"
ORIGIN_NAME = "origin.json"
EVIDENCE_NAME = "evidence-logistics-acl-overlay.json"
SIG = "platform_private.b2b_internal_order_snapshot_guard()"
FROZEN_ACL = "{postgres=X/postgres}"
REAL_ACL = "{postgres=X/postgres,service_role=X/postgres}"
REAL_BODY_MD5 = "9cad2aaa995277b913f8b40816fea504"
ORIGIN_MIGRATION = "supabase/migrations/20261008192025_4c4bd075-7352-4dbc-9429-47a75e9500e4.sql"
ORIGIN_STATEMENTS = [
    "REVOKE ALL ON FUNCTION platform_private.b2b_internal_order_snapshot_guard() FROM PUBLIC,anon,authenticated;",
    "GRANT EXECUTE ON FUNCTION platform_private.b2b_internal_order_snapshot_guard() TO service_role;",
]


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def lit(value):
    return "'" + str(value).replace("'", "''") + "'"


def acl_items_sql(expr):
    """Order-insensitive; grantee, privileges, grant option and grantor sensitive."""
    return f"""(SELECT coalesce(jsonb_agg(item::text ORDER BY item::text COLLATE "C"),'[]'::jsonb) FROM unnest({expr}) AS acl_items(item))"""


def old_line(prefix):
    return (f" IF (SELECT coalesce(f.proacl::text,'') FROM pg_proc f WHERE f.oid=p) IS DISTINCT FROM {lit(FROZEN_ACL)}"
            f" THEN RAISE EXCEPTION '{prefix} {SIG}';END IF;\n")


def new_line(prefix, acl=REAL_ACL):
    return (f" IF (SELECT {acl_items_sql('f.proacl')} FROM pg_proc f WHERE f.oid=p) IS DISTINCT FROM "
            f"{acl_items_sql(lit(acl) + '::aclitem[]')} THEN RAISE EXCEPTION '{prefix} {SIG}';END IF;\n")


def guard_sql(prefix, acl):
    """Standalone guard used by the negative tests (same predicate as the overlay)."""
    return f"DO $$DECLARE p oid:=to_regprocedure({lit(SIG)});BEGIN\n" + new_line(prefix, acl) + "END$$;\n"


def build_sql():
    out = {}
    plan = {PRE_NAME: "B2B_RESALE_PRE_ACL_DRIFT", INSTALL_NAME: "B2B_RESALE_PRE_ACL_DRIFT", POST_NAME: "B2B_RESALE_POST_ACL_DRIFT"}
    for name, prefix in plan.items():
        text = (FROZEN / name).read_text()
        old, new = old_line(prefix), new_line(prefix)
        assert text.count(old) == 1, (name, text.count(old))
        # Only this function's ACL line is pinned to the frozen value with this exact text.
        assert text.count(f"'{prefix} {SIG}'") == 1, name
        updated = text.replace(old, new, 1)
        assert updated.replace(new, old, 1) == text, "CHANGE_OUTSIDE_SNAPSHOT_GUARD_ACL_LINE"
        out[name] = updated
    pre_body = out[PRE_NAME][len("BEGIN READ ONLY;\n"):-len("ROLLBACK;\n")]
    assert out[PRE_NAME].startswith("BEGIN READ ONLY;\n") and out[PRE_NAME].endswith("ROLLBACK;\n")
    assert out[INSTALL_NAME].startswith(pre_body.rstrip("\n")), "PRE_INSTALL_PREFIX_DRIFT"
    assert REAL_BODY_MD5 in out[PRE_NAME] and REAL_BODY_MD5 in out[INSTALL_NAME]
    rollback = (FROZEN / ROLLBACK_NAME).read_text()
    assert "b2b_internal_order_snapshot_guard" not in rollback, "ROLLBACK94_TOUCHES_GUARD"
    return out


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("output", type=Path)
    parser.add_argument("--evidence", type=Path)
    args = parser.parse_args()
    out = args.output.resolve()
    evidence_path = args.evidence.resolve() if args.evidence else None
    if not out.is_relative_to(Path("/tmp")) and evidence_path is None:
        raise AssertionError("NON_TEMPORARY_OVERLAY_REQUIRES_FINAL_EVIDENCE")
    migration = (ROOT / ORIGIN_MIGRATION).read_text()
    assert all(s in migration for s in ORIGIN_STATEMENTS), "ORIGIN_GRANT_NOT_FOUND"
    out.mkdir(parents=True, exist_ok=True)
    payloads = build_sql()
    for name, text in payloads.items():
        path = out / name
        if path.exists():
            assert path.read_text() == text, f"OVERLAY_SQL_DRIFT:{name}"
        else:
            path.write_text(text)
    shutil.copyfile(H / "logistics-acl-overlay.README.md", out / README_NAME)
    origin = {
        "kind": "SEPARATE_LOGISTICS_FUNCTION_ACL_OVERLAY",
        "frozen_package_unmodified": True,
        "frozen_package": {
            "path": str(FROZEN.relative_to(ROOT)),
            "manifest_sha256": sha(FROZEN / "manifest.json"),
            **{n: sha(FROZEN / n) for n in (PRE_NAME, INSTALL_NAME, POST_NAME, ROLLBACK_NAME)},
        },
        "function": SIG,
        "body_md5_real_and_pinned": REAL_BODY_MD5,
        "owner": "postgres",
        "frozen_expected_acl": FROZEN_ACL,
        "real_acl_expected": REAL_ACL,
        "grant_origin": {
            "path": ORIGIN_MIGRATION,
            "sha256": sha(ROOT / ORIGIN_MIGRATION),
            "statements": ORIGIN_STATEMENTS,
            "note": "Permissão service_role criada junto com a função; CREATE OR REPLACE posterior (41) preserva a ACL. A fixture descartável antiga não reproduzia esse GRANT.",
        },
        "comparison": "jsonb_agg(aclitem::text ORDER BY aclitem::text COLLATE C)",
        "preserves": ["grantee", "privileges", "grant_option", "grantor"],
        "lines_changed": {PRE_NAME: 1, INSTALL_NAME: 1, POST_NAME: 1},
        "unchanged": ["14 other function pins", "DDL candidate", ROLLBACK_NAME, "50-62", "89-93"],
        "generator": {"path": str(Path(__file__).resolve().relative_to(ROOT)), "sha256": sha(Path(__file__).resolve())},
        "verification_runner": {"path": str((H / "test_logistics_acl_overlay.py").relative_to(ROOT)), "sha256": sha(H / "test_logistics_acl_overlay.py")},
        "auditor_reported_production": {
            "ref": "swzpzcwiasxmjutrmvkm",
            "installed_do_not_reinstall": ["11", "21", "26", "31"],
            "post_pass": ["12", "22", "27", "32"],
            "pre40_stop": "B2B_RESALE_PRE_ACL_DRIFT " + SIG,
            "pins_checked": {"body_md5": "15/15", "owner": "15/15", "acl": "14/15"},
            "actual_acl": REAL_ACL,
            "received_41_or_later": False,
            "stock_gate": "OFF",
            "source": "Relato independente do auditor em 09/11/2026 13:34 UTC; nenhuma operação hospedada pelo gerador",
        },
        "hosted_io": False,
    }
    write_json(out / ORIGIN_NAME, origin)
    files = [PRE_NAME, INSTALL_NAME, POST_NAME, README_NAME, ORIGIN_NAME]
    verification = "NOT_RUN_PENDING_TEMPORARY_STAGING"
    if evidence_path is not None:
        evidence = json.loads(evidence_path.read_text())
        assert evidence["status"] == "PASS" and evidence["hosted"] is False
        assert evidence["postgresql_version"].startswith("17.")
        executed = {row["file"]: row for row in evidence["final_artifacts"]}
        assert {PRE_NAME, INSTALL_NAME, POST_NAME} <= set(executed)
        for name in (PRE_NAME, INSTALL_NAME, POST_NAME):
            assert executed[name]["returncode"] == 0 and executed[name]["sha256"] == sha(out / name), name
        shutil.copyfile(evidence_path, out / EVIDENCE_NAME)
        files.append(EVIDENCE_NAME)
        verification = "PASS_DISPOSABLE_PG17_NOT_HOSTED"
    manifest = {
        "status": "REVIEW_ONLY_INACTIVE_NOT_APPROVED",
        "overlay_of": "production-rollout-posplans-20261108 (40/41/42 only)",
        "base_manifest_sha256": origin["frozen_package"]["manifest_sha256"],
        "contains_only_changed_rollout_artifacts": [PRE_NAME, INSTALL_NAME, POST_NAME],
        "use_frozen_unchanged": ["50-52", "60-62", "89-94"],
        "excludes_reinstall": ["11", "21", "26", "31"],
        "guards_changed": 3,
        "ddl_changed": False,
        "local_verification": verification,
        "hosted_io": False,
        "activation": False,
        "publication": False,
        "authenticated_real_proof": "NOT_RUN",
        "files": {n: {"sha256": sha(out / n), "bytes": (out / n).stat().st_size} for n in files},
    }
    write_json(out / "manifest.json", manifest)
    print(json.dumps({"out": str(out), "verification": verification,
                      "files": {n: manifest["files"][n]["sha256"] for n in files}}, indent=2))


if __name__ == "__main__":
    main()
