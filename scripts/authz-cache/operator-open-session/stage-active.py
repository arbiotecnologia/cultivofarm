"""Isolated active-source review staging. Never install, run SQL or publish."""
import hashlib
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
MANIFEST_SHA256 = "f3cd82b140b62de0d1adec2b632cf3d1b8b023e297d6d0efc0424579f8e28101"
GATE = "src/lib/authz/authzEpochGate.ts"
TEST = "src/test/config/operatorGate.test.ts"
OFF = b"OPERATOR_CONTEXT_MONITOR_ENABLED: boolean = false;"
ON = b"OPERATOR_CONTEXT_MONITOR_ENABLED: boolean = true;"

def sha(raw):
    return hashlib.sha256(raw).hexdigest()

def stage(destination, mode):
    if mode not in ("activation", "deactivation", "rollback"):
        raise ValueError("invalid_mode")
    destination = Path(destination).resolve()
    if destination == ROOT or ROOT in destination.parents:
        raise ValueError("outside_project_required")
    if destination.exists() and any(destination.iterdir()):
        raise ValueError("empty_destination_required")
    raw = (HERE / "manifest.json").read_bytes()
    if sha(raw) != MANIFEST_SHA256:
        raise ValueError("manifest_drift")
    manifest = json.loads(raw.decode("utf-8"))
    if manifest["canonical_ref"] != "swzpzcwiasxmjutrmvkm":
        raise ValueError("canonical_ref_required")
    for path, expected in manifest["artifact_sha256"].items():
        if sha((HERE / path).read_bytes()) != expected:
            raise ValueError("artifact_drift:" + path)
    gate_off = (HERE / "candidate" / GATE).read_bytes()
    if gate_off.count(OFF) != 1 or ON in gate_off:
        raise ValueError("off_gate_invalid")
    gate_on = gate_off.replace(OFF, ON, 1)
    test_off = (HERE / "candidate" / TEST).read_bytes()
    old = b'describe("operator candidate actual flags",()=>{\n it("operator remains OFF",()=>expect(gates.OPERATOR_CONTEXT_MONITOR_ENABLED).toBe(false));'
    new = b'describe("operator authorized activation actual flags",()=>{\n it("only reviewed operator scope is activated",()=>expect(gates.OPERATOR_CONTEXT_MONITOR_ENABLED).toBe(true));'
    if test_off.count(old) != 1:
        raise ValueError("off_assertion_invalid")
    active = {GATE: gate_on, TEST: test_off.replace(old, new, 1)}
    for path, expected in manifest["source_sha256"].items():
        source = (ROOT / path).read_bytes()
        if path in active:
            if source != active[path]:
                raise ValueError("active_source_drift:" + path)
        elif sha(source) != expected:
            raise ValueError("source_drift:" + path)
    # Prepare the entire payload before any output. Original rollback is intact.
    payload = {}
    removals = []
    if mode == "rollback":
        for item in manifest["files"]:
            if item["rollback"] is None:
                removals.append(item["path"])
            else:
                payload[item["path"]] = (HERE / item["rollback"]).read_bytes()
        if removals:
            payload["REMOVE-NEW-FILES.review.json"] = (json.dumps(removals)+"\n").encode("utf-8")
    else:
        payload[GATE] = gate_on if mode == "activation" else gate_off
    for path, data in payload.items():
        target = destination / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)

if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("usage: stage-active.py activation|deactivation|rollback <empty-outside-review-directory>")
    stage(sys.argv[2], sys.argv[1])