"""Isolated post-activation review staging; original false manifest is immutable."""
import hashlib
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
GATE = 'src/lib/authz/authzEpochGate.ts'
TEST = 'src/test/config/companyAdminGate.test.ts'

def sha(data):
    return hashlib.sha256(data).hexdigest()

def expected_active_test(data):
    old = b'describe("admin candidate actual flags", () => {\n  it("admin remains review gated", () => { expect(COMPANY_ADMIN_CONTEXT_MONITOR_ENABLED).toBe(false); });'
    new = b'describe("admin authorized activation actual flags", () => {\n  it("only reviewed company-admin scope is activated", () => { expect(COMPANY_ADMIN_CONTEXT_MONITOR_ENABLED).toBe(true); });'
    if data.count(old) != 1:
        raise ValueError('reviewed_test_contract_drift')
    return data.replace(old, new)

def verify():
    m = json.loads((HERE / 'manifest.json').read_bytes().decode('utf-8'))
    if m['canonical_ref'] != 'swzpzcwiasxmjutrmvkm':
        raise ValueError('canonical_ref_required')
    # Fixed original hashes only, including original candidate test and gate.
    for path, expected in m['artifact_sha256'].items():
        if sha((HERE / path).read_bytes()) != expected:
            raise ValueError('artifact_drift:' + path)
    a = m['activation']
    active = (HERE / a['candidate']).read_bytes()
    inactive = (HERE / a['rollback']).read_bytes()
    if sha(active) != a['post_sha256'] or sha(inactive) != a['pre_sha256']:
        raise ValueError('activation_hash_drift')
    if active != inactive.replace(b'COMPANY_ADMIN_CONTEXT_MONITOR_ENABLED: boolean = false', b'COMPANY_ADMIN_CONTEXT_MONITOR_ENABLED: boolean = true'):
        raise ValueError('activation_delta_drift')
    for path, expected in m['source_sha256'].items():
        data = (ROOT / path).read_bytes()
        if path == GATE:
            if data != active:
                raise ValueError('active_gate_drift')
        elif path == TEST:
            if data != expected_active_test((HERE / 'candidate' / path).read_bytes()):
                raise ValueError('active_test_drift')
        elif sha(data) != expected:
            raise ValueError('source_drift:' + path)
    return m

def stage(destination, mode):
    destination = Path(destination).resolve()
    if destination == ROOT or ROOT in destination.parents:
        raise ValueError('outside_project_required')
    if mode not in ('deactivation', 'rollback'):
        raise ValueError('invalid_mode')
    if destination.exists() and any(destination.iterdir()):
        raise ValueError('empty_destination_required')
    m = verify()  # All verification precedes writing; no automatic install.
    items = [m['activation']] if mode == 'deactivation' else m['files']
    removals = []
    for item in items:
        source = item['rollback']
        if source is None:
            removals.append(item['path'])
            continue
        path = destination / item['path']
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes((HERE / source).read_bytes())
    if removals:
        (destination / 'REMOVE-NEW-FILES.review.json').write_bytes((json.dumps(removals)+'\n').encode('utf-8'))

if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit('usage: stage-active.py deactivation|rollback <empty-outside-review-directory>')
    stage(sys.argv[2], sys.argv[1])