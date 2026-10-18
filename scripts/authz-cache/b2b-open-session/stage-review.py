"""Only stages guarded gate candidates OUTSIDE runtime. Never deploys/applies/SQL.
No mode can write src. Promotion requires the auditor's separately approved live
receipt and exact tracked source hashes. Closing gate alone isn't safe rollback:
must stop/drain served monitored clients (old bundles cannot be revoked by Git).
"""
import argparse
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
GATE = "src/lib/authz/authzEpochGate.ts"
REF = "swzpzcwiasxmjutrmvkm"

def sha(data):
    return hashlib.sha256(data).hexdigest()

def stage(manifest, receipt, output):
    output = output.resolve()
    if output == ROOT or ROOT in output.parents:
        raise ValueError("staging_inside_project_forbidden")
    if receipt.get("project_ref") != REF or receipt.get("scope") != "b2b-context":
        raise ValueError("canonical_ref_or_scope_missing")
    # No capture, hash or snapshot is interpreted as a review approval.
    for field in ("canonical_rpc_reviewed", "rls_rpc_denials_reviewed", "bounded_observation_accepted",
                  "legacy_signed_urls_excluded", "rollback_client_drain_reviewed", "auditor_release"):
        if receipt.get(field) is not True:
            raise ValueError("approval_missing:" + field)
    if receipt.get("manifest_sha256") != sha(json.dumps(manifest, sort_keys=True).encode("utf-8")):
        raise ValueError("receipt_manifest_mismatch")
    for path, expected in manifest["files"].items():
        if (ROOT / path).resolve() != ROOT / path or Path(path).is_absolute():
            raise ValueError("manifest_path_invalid")
        if sha((ROOT / path).read_bytes()) != expected:
            raise ValueError("source_drift:" + path)
    gate_bytes = (ROOT / GATE).read_bytes()
    gate = gate_bytes.decode("utf-8")
    marker = "export const AUTHZ_CACHE_FOUNDATION_ENABLED: boolean = false;"
    if gate.count(marker) != 1 or ' = "b2b-context";' not in gate:
        raise ValueError("gate_baseline_mismatch")
    output.mkdir(parents=True, exist_ok=True)
    # Deliberately not .ts in src; auditor must review the exact delta and release.
    candidate_bytes = gate.replace(marker, marker.replace("false", "true")).encode("utf-8")
    (output / "gate-candidate.ts.review").write_bytes(candidate_bytes)
    (output / "gate-rollback.ts.review").write_bytes(gate_bytes)
    (output / "gate-guards.json").write_bytes((json.dumps({
        "project_ref": REF, "scope": "b2b-context", "pre_sha256": sha(gate_bytes),
        "post_sha256": sha(candidate_bytes), "rollback_requires_exact_post": True,
        "rollback_requires_client_drain": True, "applied": False,
    }, indent=2) + "\n").encode("utf-8"))

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--receipt", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    try:
        stage(json.loads((HERE / "manifest.json").read_bytes().decode("utf-8")),
              json.loads(args.receipt.read_bytes().decode("utf-8")), args.output)
    except (ValueError, OSError) as error:
        raise SystemExit(str(error))