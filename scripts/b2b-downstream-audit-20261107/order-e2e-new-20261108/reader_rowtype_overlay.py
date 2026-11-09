#!/usr/bin/env python3
"""Generate the separate PRE70/INSTALL71/POST72 + rollback 95 overlay for
public.rpc_b2b_resale_os_availability_v1(uuid).

Single delta over the body installed by frozen 61 (live MD5 d426e075...):
  `SELECT * INTO v_order FROM public.partner_orders po\n  JOIN`
becomes
  `SELECT po.* INTO v_order FROM public.partner_orders po\n  JOIN`
so the %ROWTYPE target receives exactly partner_orders columns (no positional
dependence on join order; survives plpgsql.extra_errors=strict_multi_assignment).

Owner/ACL/header unchanged; no GRANT/REVOKE. Frozen packages never modified.
Rollback 95 restores the exact previous body (not a vulnerability; same
authorization predicates) under its own pins. No hosted I/O.
"""
import argparse
import hashlib
import json
import shutil
from pathlib import Path

H = Path(__file__).resolve().parent
ROOT = H.parents[2]
FROZEN = H / "production-rollout-posplans-20261108"
SOURCE = FROZEN / "61-pilot-containment-install.sql.review"
SIG = "public.rpc_b2b_resale_os_availability_v1(uuid)"
LIVE_MD5 = "d426e0758d03a143f8014cbb6590fb49"
OWNER = "postgres"
ACL = "{postgres=X/postgres,authenticated=X/postgres}"
OLD = " SELECT * INTO v_order FROM public.partner_orders po\n  JOIN public.partner_accounts pa ON pa.id=po.partner_id\n"
NEW = " SELECT po.* INTO v_order FROM public.partner_orders po\n  JOIN public.partner_accounts pa ON pa.id=po.partner_id\n"
PRE, INSTALL, POST, ROLLBACK = ("70-reader-rowtype-pre.sql.readonly", "71-reader-rowtype-install.sql.review",
                                "72-reader-rowtype-post.sql.readonly", "95-reader-rowtype-rollback.sql.review")
NEW_MD5_FILE = "new-body-md5.txt"


def sha(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def lit(v):
    return "'" + str(v).replace("'", "''") + "'"


def acl_items(expr):
    return f"""(SELECT coalesce(jsonb_agg(item::text ORDER BY item::text COLLATE "C"),'[]'::jsonb) FROM unnest({expr}) AS acl_items(item))"""


def old_body():
    text = SOURCE.read_text()
    start = text.index("CREATE OR REPLACE FUNCTION public.rpc_b2b_resale_os_availability_v1(p_order_id uuid)")
    end = text.index("END;$function$;\n", start) + len("END;$function$;\n")
    body = text[start:end]
    assert body.count(OLD) == 1 and "SELECT * INTO v_order" in body
    return body


def new_body():
    b = old_body()
    n = b.replace(OLD, NEW, 1)
    assert n.replace(NEW, OLD, 1) == b and n.count("SELECT * INTO") == 0, "CHANGE_OUTSIDE_SELECT_LIST"
    return n


def pin(prefix, md5):
    return (f"DO $$DECLARE p oid:=to_regprocedure({lit(SIG)});BEGIN\n"
            f" IF p IS NULL THEN RAISE EXCEPTION '{prefix}_MISSING {SIG}';END IF;\n"
            f" IF md5(pg_get_functiondef(p)) IS DISTINCT FROM {lit(md5)} THEN RAISE EXCEPTION '{prefix}_BODY_DRIFT {SIG}';END IF;\n"
            f" IF (SELECT pg_get_userbyid(f.proowner) FROM pg_proc f WHERE f.oid=p) IS DISTINCT FROM {lit(OWNER)} THEN RAISE EXCEPTION '{prefix}_OWNER_DRIFT {SIG}';END IF;\n"
            f" IF (SELECT {acl_items('f.proacl')} FROM pg_proc f WHERE f.oid=p) IS DISTINCT FROM {acl_items(lit(ACL) + '::aclitem[]')} THEN RAISE EXCEPTION '{prefix}_ACL_DRIFT {SIG}';END IF;\n"
            f" IF (SELECT f.prosecdef AND f.provolatile='v' AND f.prorettype='jsonb'::regtype AND f.proconfig=ARRAY['search_path=\"\"','lock_timeout=3s'] FROM pg_proc f WHERE f.oid=p) IS NOT TRUE THEN RAISE EXCEPTION '{prefix}_HEADER_DRIFT {SIG}';END IF;\n"
            "END$$;\n")


GATES = ("DO $$BEGIN IF EXISTS(SELECT 1 FROM platform_private.b2b_resale_logistics_gate_v1 WHERE enabled IS TRUE)"
         " OR EXISTS(SELECT 1 FROM platform_private.finished_product_gate_v1 WHERE enabled IS TRUE)"
         " THEN RAISE EXCEPTION 'READER_ROWTYPE_GATE_NOT_OFF';END IF;END$$;\n")


def build(new_md5):
    return {
        PRE: "BEGIN READ ONLY;\n" + pin("READER_ROWTYPE_PRE", LIVE_MD5) + GATES + "ROLLBACK;\n",
        INSTALL: ("BEGIN;SET LOCAL lock_timeout='3s';\n" + pin("READER_ROWTYPE_PRE", LIVE_MD5) + GATES
                  + new_body() + "\n" + pin("READER_ROWTYPE_INSTALL", new_md5) + GATES + "COMMIT;\n"),
        POST: "BEGIN READ ONLY;\n" + pin("READER_ROWTYPE_POST", new_md5) + GATES + "ROLLBACK;\n",
        ROLLBACK: ("BEGIN;SET LOCAL lock_timeout='3s';\n" + pin("READER_ROWTYPE_ROLLBACK_PRE", new_md5)
                   + old_body() + "\n" + pin("READER_ROWTYPE_ROLLBACK_POST", LIVE_MD5) + "COMMIT;\n"),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("output", type=Path)
    ap.add_argument("--new-md5", required=True, help="md5(pg_get_functiondef) medido no PG17 descartável")
    ap.add_argument("--evidence", type=Path)
    a = ap.parse_args()
    out = a.output.resolve()
    if not out.is_relative_to(Path("/tmp")) and a.evidence is None:
        raise AssertionError("NON_TEMPORARY_OVERLAY_REQUIRES_FINAL_EVIDENCE")
    out.mkdir(parents=True, exist_ok=True)
    for name, text in build(a.new_md5).items():
        p = out / name
        if p.exists():
            assert p.read_text() == text, f"OVERLAY_SQL_DRIFT:{name}"
        else:
            p.write_text(text)
    readme = H / "reader-rowtype-overlay.README.md"
    shutil.copyfile(readme, out / "README.md")
    files = [PRE, INSTALL, POST, ROLLBACK, "README.md"]
    verification = "NOT_RUN_PENDING_TEMPORARY_STAGING"
    if a.evidence is not None:
        ev = json.loads(a.evidence.read_text())
        assert ev["status"] == "PASS" and ev["hosted"] is False and ev["postgresql_version"].startswith("17.")
        assert ev["new_body_md5"] == a.new_md5
        ex = {r["file"]: r for r in ev["final_artifacts"]}
        for n in (PRE, INSTALL, POST, ROLLBACK):
            assert ex[n]["returncode"] == 0 and ex[n]["sha256"] == sha(out / n), n
        shutil.copyfile(a.evidence, out / "evidence-reader-rowtype-overlay.json")
        files.append("evidence-reader-rowtype-overlay.json")
        verification = "PASS_DISPOSABLE_PG17_NOT_HOSTED"
    manifest = {
        "status": "REVIEW_ONLY_INACTIVE_NOT_APPROVED",
        "function": SIG, "live_body_md5_before": LIVE_MD5, "new_body_md5": a.new_md5,
        "owner": OWNER, "acl_preserved": ACL, "grants_added": [], "revokes_added": [],
        "delta": {"from": OLD.strip(), "to": NEW.strip(), "lines_changed": 1},
        "source": {"path": str(SOURCE.relative_to(ROOT)), "sha256": sha(SOURCE)},
        "excludes_reinstall": ["11", "21", "26", "31", "41", "51", "61"],
        "supersedes_post_pin": "62 reader md5 d426... (POST62 rerun after 71 is expected to fail; use POST72)",
        "local_verification": verification, "hosted_io": False, "activation": False, "publication": False,
        "authenticated_real_proof": "NOT_RUN",
        "generator": {"path": str(Path(__file__).resolve().relative_to(ROOT)), "sha256": sha(Path(__file__).resolve())},
        "files": {n: {"sha256": sha(out / n), "bytes": (out / n).stat().st_size} for n in files},
    }
    (out / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"out": str(out), "verification": verification, "files": {n: manifest["files"][n]["sha256"] for n in files}}, indent=2))


if __name__ == "__main__":
    main()
