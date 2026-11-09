#!/usr/bin/env python3
"""Execute the exact final rollout files in a fresh disposable PostgreSQL 17.

The input package must live in a /tmp mirror. No hosted connection, activation,
external effect or production data is used. The JSON result binds every executed
byte sequence to its SHA256 and is later copied into the review-only package.
"""
import hashlib
import importlib.util
import json
import os
import sys
import tempfile
import traceback
from pathlib import Path

H = Path(__file__).resolve().parent
ROOT = H.parents[2]
PACKAGE = Path(sys.argv[1]).resolve()
OUT = Path(sys.argv[2]).resolve()
ARTIFACT_ORDER = [
    "00-production-pre-posplans.sql.readonly",
    "11-confirmation-install.sql.review",
    "12-confirmation-post.sql.readonly",
    "20-send-pre.sql.readonly",
    "21-send-install.sql.review",
    "22-send-post.sql.readonly",
    "30-physical-pre-after-confirmation-send.sql.readonly",
    "31-physical-install.sql.review",
    "32-physical-post.sql.readonly",
    "40-logistics-pre-after-physical.sql.readonly",
    "41-logistics-install.sql.review",
    "42-logistics-post.sql.readonly",
    "50-endpoint-reader-pre.sql.readonly",
    "51-endpoint-reader-install.sql.review",
    "52-endpoint-reader-post.sql.readonly",
    "60-pilot-containment-pre.sql.readonly",
    "61-pilot-containment-install.sql.review",
    "62-pilot-containment-post.sql.readonly",
    "89-pilot-containment-rollback-deny.sql.review",
    "90-endpoint-reader-rollback-deny.sql.review",
    "94-logistics-rollback-deny.sql.review",
    "93-physical-rollback-deny.sql.review",
    "92-send-rollback-deny.sql.review",
    "91-confirmation-rollback-deny.sql.review",
]


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main():
    assert ROOT.is_relative_to(Path("/tmp")), "TEMP_MIRROR_REQUIRED"
    assert PACKAGE.is_relative_to(Path("/tmp")), "TEMP_FINAL_PACKAGE_REQUIRED"
    assert OUT != PACKAGE and not OUT.is_relative_to(PACKAGE)
    manifest = json.loads((PACKAGE / "manifest.json").read_text())
    assert manifest["production_ref"] == "swzpzcwiasxmjutrmvkm"
    assert manifest["hosted_io"] is False and manifest["default_enabled"] is False
    for name, row in manifest["files"].items():
        path = PACKAGE / name
        assert path.stat().st_size == row["bytes"] and sha(path) == row["sha256"], name
    package_sql = {
        path.name for path in PACKAGE.iterdir()
        if path.name.endswith(".sql.review") or path.name.endswith(".sql.readonly")
    }
    assert package_sql == set(ARTIFACT_ORDER), {
        "not_executed": sorted(package_sql - set(ARTIFACT_ORDER)),
        "missing": sorted(set(ARTIFACT_ORDER) - package_sql),
    }

    results = []
    report = {
        "status": "FAIL",
        "scope": "exact final artifacts on fresh disposable PostgreSQL 17; synthetic schema/Auth only",
        "hosted": False,
        "package": str(PACKAGE),
        "runner_sha256": sha(Path(__file__)),
        "artifacts": results,
    }
    work = Path(tempfile.mkdtemp(prefix="final-rollout-execution-", dir="/tmp"))
    try:
        physical = ROOT / "scripts/b2b-downstream-audit-20261107/physical/finished-product"
        B = load("final_finished", physical / "test_after.py").B
        sys.modules[B.C.__name__] = B.C
        pg17 = next(Path("/nix/store").glob("*-postgresql-17.11/bin"))
        os.environ["PATH"] = str(pg17) + ":" + os.environ["PATH"]
        restored = B.restore.restore()
        assert not any(restored.values()), restored
        B.C.prepare_checkpoint(Path("/tmp/new-order-checkpoint.sql"))
        B.current_catalog.apply(B.run_raw, B.last, B.ok, B.T.A)

        # Reproduce only the already reviewed local POSPLANOS prerequisite. This
        # is a disposable baseline, never a hosted plan reinstall or package step.
        commercial = load("final_commercial", H / "commercial.py")
        Q = commercial.apply(B, load, ROOT, work)
        plan_dir = ROOT / "scripts/commercial-plans-tenant-20261108"
        plan_ref = "SET commercial_plans.review_project_ref='swzpzcwiasxmjutrmvkm';"
        B.sql(plan_ref + (plan_dir / "01-pre.sql.readonly").read_text())
        B.sql(plan_ref + (plan_dir / "02-install.sql.review").read_text())
        B.sql(plan_ref + (plan_dir / "03-post.sql.readonly").read_text())

        current_scope = load("final_current_scope", H / "current_scope.py")

        def relation_security():
            actual = {}
            for name in current_scope.SECURITY_RELATIONS:
                row = json.loads(B.last(f"""SELECT jsonb_build_object(
                  'acl',coalesce((SELECT string_agg(a::text,',' ORDER BY a::text) FROM unnest(c.relacl) a),''),
                  'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,'owner',pg_get_userbyid(c.relowner))
                  FROM pg_class c WHERE c.oid='{name}'::regclass;"""))
                actual[name] = row
            return actual

        relations_before = relation_security()
        history_before = json.loads(B.last("""SELECT jsonb_build_object(
          'deliveries',(SELECT count(*) FROM public.entregas),
          'movements',(SELECT count(*) FROM public.estoque_movimentacoes),
          'os',(SELECT count(*) FROM public.ordens_servico));"""))
        plans_before = B.last("SELECT md5(coalesce(jsonb_agg(to_jsonb(p) ORDER BY id)::text,'[]')) FROM public.commercial_payment_plans p;")

        for name in ARTIFACT_ORDER:
            path = PACKAGE / name
            before = sha(path)
            completed = B.run_raw(path.read_text())
            row = {
                "file": name,
                "sha256": before,
                "returncode": completed.returncode,
            }
            results.append(row)
            if completed.returncode != 0:
                row["stdout_tail"] = completed.stdout[-2000:]
                row["stderr_tail"] = completed.stderr[-6000:]
                raise AssertionError(f"FINAL_ARTIFACT_FAILED:{name}\n{completed.stderr[-6000:]}")
            assert sha(path) == before, f"FINAL_ARTIFACT_CHANGED_DURING_EXECUTION:{name}"

        negative_calls = {
            "send": "public.rpc_entrega_enviar_manual_v1(NULL,NULL,NULL)",
            "confirmation": "public.rpc_entrega_confirmar_manual_v1(NULL,NULL,NULL,NULL)",
            "os_writer": "public.rpc_b2b_resale_os_create_v1(NULL,NULL,NULL,NULL)",
            "os_reader": "public.rpc_b2b_resale_os_availability_v1(NULL)",
            "purchase_writer": "public.rpc_finished_product_purchase_entry_v1(NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL)",
        }
        negatives = {}
        for label, call in negative_calls.items():
            denied = B.run_raw(f"RESET ROLE;SET ROLE authenticated;SELECT {call};")
            assert denied.returncode != 0 and "permission denied" in denied.stderr, (label, denied.stdout, denied.stderr)
            negatives[label] = {"returncode": denied.returncode, "permission_denied": True}

        closed = json.loads(B.last("""SELECT jsonb_build_object(
          'logistics_gate',(SELECT enabled FROM platform_private.b2b_resale_logistics_gate_v1 WHERE singleton),
          'physical_gate',(SELECT enabled FROM platform_private.finished_product_gate_v1 WHERE singleton),
          'os_writer',has_function_privilege('authenticated','public.rpc_b2b_resale_os_create_v1(uuid,uuid,timestamptz,text)','EXECUTE'),
          'purchase_writer',has_function_privilege('authenticated','public.rpc_finished_product_purchase_entry_v1(uuid,uuid,text,numeric,text,text,text,date)','EXECUTE'),
          'send_writer',has_function_privilege('authenticated','public.rpc_entrega_enviar_manual_v1(uuid,timestamptz,text)','EXECUTE'),
          'confirm_writer',has_function_privilege('authenticated','public.rpc_entrega_confirmar_manual_v1(uuid,timestamptz,text,jsonb)','EXECUTE'));"""))
        assert all(value is False for value in closed.values()), closed
        relations_after = relation_security()
        assert relations_after == relations_before, "FINAL_RELATION_SECURITY_DRIFT"
        history_after = json.loads(B.last("""SELECT jsonb_build_object(
          'deliveries',(SELECT count(*) FROM public.entregas),
          'movements',(SELECT count(*) FROM public.estoque_movimentacoes),
          'os',(SELECT count(*) FROM public.ordens_servico));"""))
        plans_after = B.last("SELECT md5(coalesce(jsonb_agg(to_jsonb(p) ORDER BY id)::text,'[]')) FROM public.commercial_payment_plans p;")
        assert history_after == history_before and plans_after == plans_before
        report.update({
            "status": "PASS",
            "postgresql_version": B.last("SHOW server_version;"),
            "artifact_count": len(results),
            "authenticated_negative": negatives,
            "closed": closed,
            "relation_security_pins": len(relations_before),
            "relation_security_preserved": True,
            "history_before": history_before,
            "history_after": history_after,
            "plans_before_md5": plans_before,
            "plans_after_md5": plans_after,
            "gates_activated": False,
            "authenticated_real_proof": "NOT_RUN",
        })
        return 0
    except Exception:
        report["error"] = traceback.format_exc()
        return 1
    finally:
        OUT.parent.mkdir(parents=True, exist_ok=True)
        OUT.write_text(json.dumps(report, indent=2) + "\n")


if __name__ == "__main__":
    sys.exit(main())
