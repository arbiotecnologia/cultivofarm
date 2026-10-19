"""Prepare review files only; never install, run SQL, reload sessions or deploy."""
import hashlib
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
MANIFEST_SHA256 = 'afbcd75883acf82c0baaa3ef3a41448148fa575db6cdfb5a5b05936ef7d26f18'
GATE = 'src/lib/authz/authzEpochGate.ts'
ON = b'MANAGER_CONSULTANT_CONTEXT_MONITOR_ENABLED: boolean = true;'
OFF = b'MANAGER_CONSULTANT_CONTEXT_MONITOR_ENABLED: boolean = false;'

def sha(raw):
    return hashlib.sha256(raw).hexdigest()

def stage(destination, mode):
    if mode not in ('candidate', 'rollback', 'deactivation'):
        raise ValueError('invalid_mode')
    destination = Path(destination).resolve()
    if destination == ROOT or ROOT in destination.parents:
        raise ValueError('outside_project_required')
    if destination.exists() and (not destination.is_dir() or any(destination.iterdir())):
        raise ValueError('empty_destination_required')
    raw = (HERE / 'manifest.json').read_bytes()
    if sha(raw) != MANIFEST_SHA256:
        raise ValueError('manifest_drift')
    manifest = json.loads(raw.decode('utf-8'))
    if manifest['canonical_ref'] != 'swzpzcwiasxmjutrmvkm':
        raise ValueError('canonical_ref_required')
    for path, expected in manifest['source_sha256'].items():
        if sha((ROOT / path).read_bytes()) != expected:
            raise ValueError('source_drift:' + path)
    for path, expected in manifest['artifact_sha256'].items():
        if sha((HERE / path).read_bytes()) != expected:
            raise ValueError('artifact_drift:' + path)
    # Validate and collect ALL payload bytes before producing any output.
    payload = {}
    removals = []
    if mode == 'deactivation':
        gate = (ROOT / GATE).read_bytes()
        if gate.count(ON) != 1 or OFF in gate:
            raise ValueError('active_gate_required')
        payload[GATE] = gate.replace(ON, OFF, 1)
    else:
        for item in manifest['files']:
            artifact = item[mode]
            if artifact is None:
                removals.append(item['path'])
            else:
                payload[item['path']] = (HERE / artifact).read_bytes()
        if removals:
            payload['REMOVE-NEW-FILES.review.json'] = (json.dumps(removals)+'\n').encode('utf-8')
    for path, data in payload.items():
        target = destination / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)

if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit('usage: stage.py candidate|rollback|deactivation <empty-outside-review-directory>')
    stage(sys.argv[2], sys.argv[1])