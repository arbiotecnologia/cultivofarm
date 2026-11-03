#!/usr/bin/env python3
"""Independent read-only guard for the exact snapshot export; no hosted access."""
import collections
import hashlib
import json
import subprocess
import sys
from pathlib import Path, PurePosixPath

BASE = "9d3a9424d708f6daebfb67b969696db2d1b7e0d0"
PINS = {
    "MANIFEST.json": "b7492bb44b5e118371f22ec80e40e7238c75dd4ce66d192fd42decbc66de6370",
    "SHA256SUMS": "7fd6976f01ba136de29456b1b4c4b6b13255abd254d793d78da3683312803985",
    "apply_from_snapshot.py": "7f51953cb5845c620ada557c6a01371ea2017dcabeac13ad7e0430858f622c93",
}
COUNTS = {"add": 692, "replace": 72, "merged_3way": 6, "keep_original": 31, "never_integrate": 20}
WRITE = {"add", "replace", "merged_3way"}


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest() if path.is_file() else None


def safe_path(root, relative):
    p = PurePosixPath(relative)
    if not relative or p.is_absolute() or "\\" in relative or any(v in ("", ".", "..", ".git") for v in relative.split("/")):
        raise ValueError(f"unsafe_relative:{relative}")
    candidate = root / relative
    candidate.resolve().relative_to(root.resolve())
    # Reject symlinks even when currently contained: the external copier follows them.
    for part in [candidate, *candidate.parents]:
        if part == root:
            break
        if part.is_symlink():
            raise ValueError(f"symlink:{relative}")
    return candidate


def verify(snapshot, original, post=False):
    errors, protected, verified, paths = [], {}, [], set()
    export = safe_path(snapshot, "scripts/original-integration-20261102/export")
    for name, expected in PINS.items():
        if digest(safe_path(export, name)) != expected:
            errors.append(f"export_pin:{name}")
    if errors:
        return {"errors": errors, "n_errors": len(errors)}
    manifest = json.loads((export / "MANIFEST.json").read_text())
    summary = manifest["summary"]
    if summary["target_project"] != "a79bb3db-f665-466d-bf41-ee8c6cb91fab" or summary["production_ref"] != "swzpzcwiasxmjutrmvkm":
        errors.append("target_binding")
    head = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=original, text=True).strip()
    if not post and head != BASE:
        # The harness checkpoints this review's own documentation between calls.
        # Accept ancestry only when no package destination changed since the exact base.
        ancestor = subprocess.run(["git", "merge-base", "--is-ancestor", BASE, head], cwd=original, capture_output=True)
        changed = subprocess.check_output(["git", "diff", "--name-only", BASE, head], cwd=original, text=True).splitlines()
        allowed = {"roadmap.md", "scripts/catalog-exclusive-tenant-reconciliation-20261102/integration-75972877/verify_snapshot.py"}
        if ancestor.returncode or set(changed) - allowed:
            errors.append("original_base_mismatch")
    actual = dict(collections.Counter(x["action"] for x in manifest["files"]))
    if actual != COUNTS or summary["counts"] != COUNTS:
        errors.append("counts_mismatch")
    sums = {}
    for line in (export / "SHA256SUMS").read_text().splitlines():
        value, path = line.split("  ", 1)
        if not path.startswith("files/") or path in sums:
            errors.append(f"sums_path:{path}")
        sums[path] = value
    for entry in manifest["files"]:
        path, action = entry["path"], entry["action"]
        try:
            if path in paths:
                raise ValueError(f"duplicate:{path}")
            paths.add(path)
            # Validate BOTH roots for ALL entries, including never_integrate/keep_original.
            source_base = safe_path(snapshot, path)
            destination = safe_path(original, path)
            if action not in WRITE:
                protected[path] = digest(destination)
                continue
            source = safe_path(export / "merged", path) if action == "merged_3way" else source_base
            new_hash, old_hash = digest(source), digest(destination)
            if new_hash != entry["sha256"]:
                errors.append(f"source_mismatch:{path}")
            if sums.get("files/" + path) != entry["sha256"]:
                errors.append(f"sums_mismatch:{path}")
            expected = entry["sha256"] if post else entry.get("original_sha256")
            if post and old_hash != expected:
                errors.append(f"post_mismatch:{path}")
            elif not post and action == "add" and old_hash not in (None, entry["sha256"]):
                errors.append(f"add_target:{path}")
            elif not post and action != "add" and old_hash not in (expected, entry["sha256"]):
                errors.append(f"target_mismatch:{path}")
            body = source.read_bytes()
            # In particular this scans all SIX merged files, not just snapshot/src.
            if (path.startswith("src/") or path == "index.html" or action == "merged_3way") and b"vrlcdwmlytukrjezrrnf" in body:
                errors.append(f"homolog_runtime_marker:{path}")
            verified.append({"path": path, "action": action, "source_sha256": new_hash, "destination_sha256": old_hash})
        except (ValueError, OSError) as exc:
            errors.append(str(exc))
    if len(sums) != 770:
        errors.append("sums_count")
    return {"mode": "POST" if post else "PRE", "original_head": head, "manifest_comparison_base": summary["base_commit"], "counts": actual,
            "verified": verified, "protected": protected, "errors": errors, "n_errors": len(errors)}


if __name__ == "__main__":
    result = verify(Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve(), "--post" in sys.argv)
    print(json.dumps(result, indent=2))
    sys.exit(2 if result["n_errors"] else 0)