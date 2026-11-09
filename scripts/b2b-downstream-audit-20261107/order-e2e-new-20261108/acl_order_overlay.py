#!/usr/bin/env python3
"""Generate a separate PRE30/INSTALL31 ACL-order overlay; never modify ad87."""
import argparse
import hashlib
import importlib.util
import json
import re
import shutil
from pathlib import Path

H = Path(__file__).resolve().parent
ROOT = H.parents[2]
FROZEN = H / "production-rollout-posplans-20261108"
PRE_NAME = "30-physical-pre-after-confirmation-send.sql.readonly"
INSTALL_NAME = "31-physical-install.sql.review"
README_NAME = "README.md"
ORIGIN_NAME = "origin.json"
EVIDENCE_NAME = "evidence-acl-overlay.json"


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def load_generator():
    path = ROOT / "scripts/b2b-downstream-audit-20261107/physical/finished-product/assemble.py"
    spec = importlib.util.spec_from_file_location("finished_acl_order_generator", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module, path


def parse_legacy_guard(line):
    if "FINISHED_PRE_RELATION_DRIFT" not in line:
        return None
    schema = re.search(r"n\.nspname='([^']+)'", line)
    name = re.search(r"c\.relname='([^']+)'", line)
    owner = re.search(r"r\.rolname.*?IS DISTINCT FROM '((?:[^']|'')*)'", line)
    acl = re.search(r"coalesce\(c\.relacl::text,''\).*?IS DISTINCT FROM '((?:[^']|'')*)'", line)
    if not all((schema, name, owner, acl)):
        raise AssertionError("UNRECOGNIZED_LEGACY_RELATION_GUARD")
    return {
        "schema": schema.group(1),
        "name": name.group(1),
        "owner": owner.group(1).replace("''", "'"),
        "acl": acl.group(1).replace("''", "'"),
    }


def build_sql():
    generator, generator_path = load_generator()
    old_pre = (FROZEN / PRE_NAME).read_text()
    old_install = (FROZEN / INSTALL_NAME).read_text()
    prefix = "BEGIN READ ONLY;\n"
    suffix = "ROLLBACK;\n"
    assert old_pre.startswith(prefix) and old_pre.endswith(suffix)
    frozen_pre_body = old_pre[len(prefix):-len(suffix)]
    assert old_install.startswith(frozen_pre_body + "\n"), "FROZEN_PRE_INSTALL_DRIFT"
    candidate = old_install[len(frozen_pre_body) + 1:]
    assert candidate and old_install.endswith(candidate)

    replacements = []
    for line in old_install.splitlines(keepends=True):
        relation = parse_legacy_guard(line)
        if relation is not None:
            replacements.append((line, generator.relation_pin(relation) + "\n", relation))
    assert len(replacements) == 10, len(replacements)
    assert len({(row[2]["schema"], row[2]["name"]) for row in replacements}) == 10

    new_install = old_install
    for old, new, _ in replacements:
        assert new_install.count(old) == 1
        new_install = new_install.replace(old, new, 1)
    assert new_install.endswith(candidate), "DDL_CANDIDATE_CHANGED"
    new_pre_body = new_install[:-len(candidate)].rstrip() + "\n"
    new_pre = prefix + new_pre_body + suffix

    for original, updated in ((old_install, new_install), (old_pre, new_pre)):
        restored = updated
        for old, new, _ in replacements:
            assert restored.count(new) == 1
            restored = restored.replace(new, old, 1)
        assert restored == original, "CHANGE_OUTSIDE_TEN_RELATION_GUARDS"

    relations = [{
        "relation": f"{row[2]['schema']}.{row[2]['name']}",
        "expected_acl": row[2]["acl"],
        "owner": row[2]["owner"],
    } for row in replacements]
    return new_pre, new_install, candidate, relations, generator_path


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
    out.mkdir(parents=True, exist_ok=True)

    new_pre, new_install, candidate, relations, generator_path = build_sql()
    payloads = {PRE_NAME: new_pre, INSTALL_NAME: new_install}
    for name, text in payloads.items():
        path = out / name
        if path.exists():
            assert path.read_text() == text, f"OVERLAY_SQL_DRIFT:{name}"
        else:
            path.write_text(text)
    readme = H / "acl-order-overlay.README.md"
    shutil.copyfile(readme, out / README_NAME)

    origin = {
        "kind": "SEPARATE_ACL_ORDER_OVERLAY",
        "auditor_package_label": "ad87",
        "frozen_package_unmodified": True,
        "frozen_package": {
            "path": str(FROZEN.relative_to(ROOT)),
            "manifest_sha256": sha(FROZEN / "manifest.json"),
            PRE_NAME: sha(FROZEN / PRE_NAME),
            INSTALL_NAME: sha(FROZEN / INSTALL_NAME),
        },
        "generator": {
            "path": str(generator_path.relative_to(ROOT)),
            "sha256": sha(generator_path),
            "comparison": "jsonb_agg(aclitem::text ORDER BY aclitem::text COLLATE C)",
            "preserves": ["grantee", "privileges", "grant_option", "grantor"],
            "guards_changed": 10,
            "ddl_candidate_sha256": hashlib.sha256(candidate.encode()).hexdigest(),
            "ddl_candidate_byte_identical": True,
        },
        "relations": relations,
        "auditor_reported_production": {
            "ref": "swzpzcwiasxmjutrmvkm",
            "installed": ["11-confirmation-install.sql.review", "21-send-install.sql.review"],
            "post_pass": ["12-confirmation-post.sql.readonly", "22-send-post.sql.readonly"],
            "writers_enabled": False,
            "pre30_stop": "FINISHED_PRE_RELATION_DRIFT public.estoque_movimentacoes",
            "actual_acl": "{postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres,authenticated=r/postgres}",
            "expected_acl": "{postgres=arwdDxtm/postgres,authenticated=r/postgres,service_role=arwdDxtm/postgres}",
            "rls": True,
            "force_rls": False,
            "owner": "postgres",
            "received_31_or_later": False,
            "source": "Relato independente do auditor em 09/11/2026 03:02 UTC; nenhuma operação hospedada pelo gerador",
        },
        "hosted_io": False,
    }
    write_json(out / ORIGIN_NAME, origin)

    files = [PRE_NAME, INSTALL_NAME, README_NAME, ORIGIN_NAME]
    verification = "NOT_RUN_PENDING_TEMPORARY_STAGING"
    if evidence_path is not None:
        evidence = json.loads(evidence_path.read_text())
        assert evidence["status"] == "PASS" and evidence["hosted"] is False
        assert evidence["postgresql_version"].startswith("17.")
        assert evidence["guards_changed"] == 10
        assert evidence["ddl_candidate_byte_identical"] is True
        executed = {row["file"]: row for row in evidence["final_artifacts"]}
        assert set(executed) == {PRE_NAME, INSTALL_NAME}
        for name, row in executed.items():
            assert row["returncode"] == 0 and row["sha256"] == sha(out / name), name
        shutil.copyfile(evidence_path, out / EVIDENCE_NAME)
        files.append(EVIDENCE_NAME)
        verification = "PASS_DISPOSABLE_PG17_NOT_HOSTED"

    manifest = {
        "status": "REVIEW_ONLY_INACTIVE_NOT_APPROVED",
        "overlay_of": "ad87",
        "base_manifest_sha256": origin["frozen_package"]["manifest_sha256"],
        "contains_only_changed_rollout_artifacts": [PRE_NAME, INSTALL_NAME],
        "excludes_reinstall": ["11", "12", "20", "21", "22"],
        "guards_changed": 10,
        "ddl_changed": False,
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
        "guards_changed": 10,
        "ddl_candidate_sha256": origin["generator"]["ddl_candidate_sha256"],
        "pre_sha256": sha(out / PRE_NAME),
        "install_sha256": sha(out / INSTALL_NAME),
        "manifest_sha256": sha(out / "manifest.json"),
        "local_verification": verification,
    }, indent=2))


if __name__ == "__main__":
    main()
