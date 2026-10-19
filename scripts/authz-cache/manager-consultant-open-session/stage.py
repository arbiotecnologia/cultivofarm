"""Only byte-exact review output; never install, execute SQL or deploy."""
import hashlib
import json
import sys
from pathlib import Path
HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
def sha(data):
    return hashlib.sha256(data).hexdigest()
def stage(destination, mode):
    destination = Path(destination).resolve()
    if destination == ROOT or ROOT in destination.parents:
        raise ValueError('outside_project_required')
    if mode not in ('candidate', 'rollback'):
        raise ValueError('invalid_mode')
    if destination.exists() and any(destination.iterdir()):
        raise ValueError('empty_destination_required')
    raw_manifest = (HERE / 'manifest.json').read_bytes()
    if sha(raw_manifest) != 'MANIFEST_FIXED_SHA':
        raise ValueError('manifest_drift')
    m = json.loads(raw_manifest.decode('utf-8'))
    if m['canonical_ref'] != 'swzpzcwiasxmjutrmvkm':
        raise ValueError('canonical_ref_required')
    # Check everything before any writes. Rollback must not erase later scopes.
    for path, expected in m['source_sha256'].items():
        if sha((ROOT / path).read_bytes()) != expected:
            raise ValueError('source_drift:' + path)
    for path, expected in m['artifact_sha256'].items():
        if sha((HERE / path).read_bytes()) != expected:
            raise ValueError('artifact_drift:' + path)
    items = m['files']
    label = mode
    removals = []
    for item in items:
        source = item[label]
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
        raise SystemExit('usage: stage.py candidate|rollback <empty-outside-review-directory>')
    stage(sys.argv[2], sys.argv[1])