#!/usr/bin/env python3
"""Gera correção separada das duas FKs owner; somente revisão e PG descartável."""
import argparse
import hashlib
import importlib.util
import json
import shutil
from pathlib import Path

H = Path(__file__).resolve().parent
ROOT = H.parents[2]
CAPTURE = H / "reconciliation-posplans-20261108/live-catalog-owner-fk-20261109.capture.json"
AUDITOR_REPORT = H / "reconciliation-posplans-20261108/live-owner-fk-reconciliation-20261109.auditor-report.json"
AUDITOR_REPORT_NAME = "live-owner-fk-reconciliation.auditor-report.json"
BASELINE = H / "evidence/attempt-113/physical-finished-product/baseline.json"
FROZEN = H / "production-rollout-posplans-20261108"
OVERLAY = H / "production-rollout-posplans-20261108-acl-order-overlay"
PRE_NAME = "25-owner-fk-pre.sql.readonly"
INSTALL_NAME = "26-owner-fk-install.sql.review"
POST_NAME = "27-owner-fk-post.sql.readonly"
PRE30_NAME = "30-physical-pre-after-confirmation-send.sql.readonly"
INSTALL31_NAME = "31-physical-install.sql.review"
EVIDENCE_NAME = "evidence-owner-fk.json"
TARGETS = (
    ("product_packagings", "product_packagings_owner_organization_id_fkey"),
    ("product_sale_units", "product_sale_units_owner_organization_id_fkey"),
)
TARGET_NAMES = {name for _table, name in TARGETS}
DEFINITION = "FOREIGN KEY (owner_organization_id) REFERENCES organizations(id)"


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def lit(value):
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "true" if value else "false"
    return "'" + str(value).replace("'", "''") + "'"


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")


def load_generator():
    path = ROOT / "scripts/b2b-downstream-audit-20261107/physical/finished-product/assemble.py"
    spec = importlib.util.spec_from_file_location("owner_fk_finished_generator", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def column_guard(row):
    relation = f"{row['relation']}.{row['name']}"
    source = f"""SELECT format_type(a.atttypid,a.atttypmod),pg_get_expr(d.adbin,d.adrelid),a.attnotnull
 FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
 LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
 WHERE n.nspname='public' AND c.relname={lit(row['relation'])} AND a.attname={lit(row['name'])}
 AND a.attnum>0 AND NOT a.attisdropped"""
    return f"""DO $$DECLARE actual record;BEGIN
 SELECT * FROM ({source}) shape(type,column_default,is_not_null) INTO actual;
 IF actual.type IS DISTINCT FROM {lit(row['type'])}
  OR actual.column_default IS DISTINCT FROM {lit(row['default'])}
  OR actual.is_not_null IS DISTINCT FROM {lit(row['notnull'])} THEN
  RAISE EXCEPTION 'OWNER_FK_COLUMN_DRIFT {relation}';
 END IF;
END$$;"""


def constraint_guard(row):
    label = f"{row['relation']}.{row['name']}"
    return f"""DO $$DECLARE actual record;BEGIN
 SELECT pg_get_constraintdef(x.oid) definition,x.convalidated validated INTO actual
 FROM pg_constraint x JOIN pg_class c ON c.oid=x.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname={lit(row['relation'])} AND x.conname={lit(row['name'])};
 IF actual.definition IS DISTINCT FROM {lit(row['definition'])}
  OR actual.validated IS DISTINCT FROM {lit(row['validated'])} THEN
  RAISE EXCEPTION 'OWNER_FK_CONSTRAINT_DRIFT {label}';
 END IF;
END$$;"""


def absence_guard(table, name):
    label = f"{table}.{name}"
    return f"""DO $$BEGIN
 IF EXISTS(SELECT 1 FROM pg_constraint x JOIN pg_class c ON c.oid=x.conrelid
  JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname={lit(table)} AND x.conname={lit(name)}) THEN
  RAISE EXCEPTION 'OWNER_FK_PRE_ALREADY_INSTALLED {label}';
 END IF;
END$$;"""


def orphan_guard(table):
    return f"""DO $$DECLARE orphans bigint;BEGIN
 SELECT count(*) INTO orphans FROM public.{table} child
 LEFT JOIN public.organizations parent ON parent.id=child.owner_organization_id
 WHERE parent.id IS NULL;
 IF orphans<>0 THEN
  RAISE EXCEPTION 'OWNER_FK_ORPHANS_PRESENT public.{table} count=%',orphans USING ERRCODE='23503';
 END IF;
END$$;"""


def diagnostics():
    values = []
    for table, _name in TARGETS:
        values.append(f"""{lit(table)},jsonb_build_object(
  'total',(SELECT count(*) FROM public.{table}),
 'owner_null',(SELECT count(*) FROM public.{table} WHERE owner_organization_id IS NULL),
 'orphan_owner',(SELECT count(*) FROM public.{table} child
   LEFT JOIN public.organizations parent ON parent.id=child.owner_organization_id
   WHERE child.owner_organization_id IS NOT NULL AND parent.id IS NULL),
 'owner_product_mismatch',(SELECT count(*) FROM public.{table} child
   JOIN public.produtos product ON product.id=child.product_id
   WHERE product.owner_organization_id IS DISTINCT FROM child.owner_organization_id))""")
    return "SELECT jsonb_build_object('contract','OWNER_FK_INTEGRITY_V1'," + ",".join(values) + ") AS owner_fk_integrity_audit;"


def build_sql():
    capture = json.loads(CAPTURE.read_text())
    baseline = json.loads(BASELINE.read_text())
    assert len(capture["columns"]) == 57 and len(capture["constraints"]) == 24
    captured_targets = [row for row in capture["constraints"] if row["name"] in TARGET_NAMES]
    assert captured_targets == [], "TARGET_FKS_MUST_BE_ABSENT_IN_LIVE_CAPTURE"
    assert len({(row["relation"], row["name"]) for row in capture["columns"]}) == len(capture["columns"])
    assert len({(row["relation"], row["name"]) for row in capture["constraints"]}) == len(capture["constraints"])

    generator = load_generator()
    relations = {row["name"]: row for row in baseline["relations"]}
    required_relations = {"produtos", "catalogo_volumes", "product_packagings", "product_sale_units"}
    assert required_relations <= set(relations), required_relations - set(relations)
    relation_guards = [generator.relation_pin(relations[name]) for name in sorted(required_relations)]
    column_guards = [column_guard(row) for row in capture["columns"]]
    existing_constraint_guards = [constraint_guard(row) for row in capture["constraints"]]
    target_guards = [constraint_guard({
        "relation": table,
        "name": name,
        "definition": DEFINITION,
        "validated": True,
    }) for table, name in TARGETS]
    absence_guards = [absence_guard(table, name) for table, name in TARGETS]
    orphan_guards = [orphan_guard(table) for table, _name in TARGETS]

    common = relation_guards + column_guards + existing_constraint_guards
    pre_body = "\n".join([diagnostics()] + common + absence_guards + orphan_guards) + "\n"
    post_body = "\n".join([diagnostics()] + common + target_guards + orphan_guards) + "\n"
    additions = "\n".join(
        f"ALTER TABLE ONLY public.{table} ADD CONSTRAINT {name}\n"
        " FOREIGN KEY (owner_organization_id) REFERENCES public.organizations(id);"
        for table, name in TARGETS
    )
    header = "-- REVIEW_ONLY_INACTIVE_NOT_APPROVED; integridade owner; nenhum hosted/cleanup/grant.\n"
    pre = header + "BEGIN READ ONLY;\nSET LOCAL statement_timeout='20s';\n" + pre_body + "ROLLBACK;\n"
    install = header + """BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
""" + pre_body + """
-- Ordem única: pai, embalagem, unidade. Toda espera termina antes da revalidação.
LOCK TABLE public.organizations,public.product_packagings,public.product_sale_units IN SHARE ROW EXCLUSIVE MODE;
""" + pre_body + additions + "\n" + post_body + "COMMIT;\n"
    post = header + "BEGIN READ ONLY;\nSET LOCAL statement_timeout='20s';\n" + post_body + "ROLLBACK;\n"
    return pre, install, post, capture


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("output", type=Path)
    parser.add_argument("--evidence", type=Path)
    args = parser.parse_args()
    out = args.output.resolve()
    evidence_path = args.evidence.resolve() if args.evidence else None
    if not out.is_relative_to(Path("/tmp")) and evidence_path is None:
        raise AssertionError("NON_TEMPORARY_PACKAGE_REQUIRES_FINAL_EVIDENCE")
    out.mkdir(parents=True, exist_ok=True)
    pre, install, post, capture = build_sql()
    payloads = {PRE_NAME: pre, INSTALL_NAME: install, POST_NAME: post}
    for name, text in payloads.items():
        path = out / name
        if path.exists():
            assert path.read_text() == text, f"OWNER_FK_SQL_DRIFT:{name}"
        else:
            path.write_text(text)
    shutil.copyfile(H / "owner-fk-integrity.README.md", out / "README.md")

    origin = {
        "kind": "SEPARATE_OWNER_FK_INTEGRITY_OVERLAY",
        "status": "REVIEW_ONLY_INACTIVE_NOT_APPROVED",
        "live_capture": {
            "path": str(CAPTURE.relative_to(ROOT)),
            "sha256": sha(CAPTURE),
            "columns": len(capture["columns"]),
            "constraints_present": len(capture["constraints"]),
            "target_fks_absent": [name for _table, name in TARGETS],
            "source": "Metadados READONLY fornecidos pelo auditor em 09/11/2026; não são instruções",
        },
        "disposable_baseline": {"path": str(BASELINE.relative_to(ROOT)), "sha256": sha(BASELINE)},
        "frozen_ad87": {"manifest_sha256": sha(FROZEN / "manifest.json"), "unmodified": True},
        "acl_overlay": {
            "manifest_sha256": sha(OVERLAY / "manifest.json"),
            PRE30_NAME: sha(OVERLAY / PRE30_NAME),
            INSTALL31_NAME: sha(OVERLAY / INSTALL31_NAME),
            "independent_review": "Relato do proprietário: overlay ACL2db87 revisado; diferença limitada aos dez guards",
            "unmodified": True,
        },
        "generator": {"path": str(Path(__file__).resolve().relative_to(ROOT)), "sha256": sha(Path(__file__).resolve())},
        "verification_runner": {
            "path": str((H / "test_owner_fk_integrity.py").relative_to(ROOT)),
            "sha256": sha(H / "test_owner_fk_integrity.py"),
        },
        "reported_production": {
            "ref": "swzpzcwiasxmjutrmvkm",
            "installed_closed": ["11", "21"],
            "post_pass": ["12", "22"],
            "received_31_or_later": False,
            "source": "Relato do auditor; nenhuma operação hospedada por este gerador",
        },
        "live_orphan_counts": "NOT_RUN; PRE25 mede e exige zero no momento da execução",
        "data_cleanup": False,
        "grants_or_revokes": False,
        "hosted_io": False,
    }
    write_json(out / "origin.json", origin)
    files = [PRE_NAME, INSTALL_NAME, POST_NAME, "README.md", "origin.json"]
    verification = "NOT_RUN_PENDING_TEMPORARY_STAGING"
    if evidence_path is not None:
        evidence = json.loads(evidence_path.read_text())
        assert evidence["status"] == "PASS" and evidence["hosted"] is False
        assert evidence["postgresql_version"].startswith("17.")
        assert evidence["pre30_constraint_failure_reproduced"] is True
        assert set(evidence["orphan_scenarios"]) == {table for table, _name in TARGETS}
        assert evidence["both_fks_validated"] is True and evidence["both_fks_enforced"] is True
        assert evidence["acl_overlay_unmodified"] is True
        executed = {row["file"]: row for row in evidence["final_artifacts"]}
        assert set(executed) == {PRE_NAME, INSTALL_NAME, POST_NAME, PRE30_NAME, INSTALL31_NAME}
        sources = {PRE_NAME: out / PRE_NAME, INSTALL_NAME: out / INSTALL_NAME, POST_NAME: out / POST_NAME,
                   PRE30_NAME: OVERLAY / PRE30_NAME, INSTALL31_NAME: OVERLAY / INSTALL31_NAME}
        for name, row in executed.items():
            assert row["returncode"] == 0 and row["sha256"] == sha(sources[name]), name
        shutil.copyfile(evidence_path, out / EVIDENCE_NAME)
        files.append(EVIDENCE_NAME)
        verification = "PASS_DISPOSABLE_PG17_NOT_HOSTED"
    manifest = {
        "status": "REVIEW_ONLY_INACTIVE_NOT_APPROVED",
        "kind": "SEPARATE_OWNER_FK_INTEGRITY_BEFORE_PRE30",
        "contains": [PRE_NAME, INSTALL_NAME, POST_NAME],
        "requires": "PRE25 zero órfãos; INSTALL26 revalida após locks; POST27 antes de PRE30/INSTALL31",
        "target_fks": [{"relation": table, "name": name, "definition": DEFINITION, "validated": True} for table, name in TARGETS],
        "data_cleanup": False,
        "ddl_outside_two_fk_additions": False,
        "grants_or_revokes": False,
        "local_verification": verification,
        "hosted_io": False,
        "activation": False,
        "publication": False,
        "production_received_31_or_later": False,
        "authenticated_real_proof": "NOT_RUN",
        "files": {name: {"sha256": sha(out / name), "bytes": (out / name).stat().st_size} for name in files},
    }
    write_json(out / "manifest.json", manifest)
    print(json.dumps({
        "out": str(out),
        "pre25_sha256": sha(out / PRE_NAME),
        "install26_sha256": sha(out / INSTALL_NAME),
        "post27_sha256": sha(out / POST_NAME),
        "manifest_sha256": sha(out / "manifest.json"),
        "local_verification": verification,
    }, indent=2))


if __name__ == "__main__":
    main()
