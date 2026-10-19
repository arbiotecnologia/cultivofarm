"""Byte-exact review output only. Never apply, reload, deploy or run SQL."""
from pathlib import Path
import hashlib, json, sys
HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
MANIFEST_SHA256 = '6a080a8b9052581c7635d440d6897a54e967c9e5ce19c7e75d7390acc774ef5a'
def sha(data): return hashlib.sha256(data).hexdigest()
def stage(destination, mode):
    if mode not in ('candidate', 'rollback'): raise ValueError('mode')
    destination = Path(destination).resolve()
    if destination == ROOT or ROOT in destination.parents: raise ValueError('outside_project_required')
    if destination.exists() and (not destination.is_dir() or any(destination.iterdir())): raise ValueError('empty_destination_required')
    raw = (HERE / 'manifest.json').read_bytes()
    if sha(raw) != MANIFEST_SHA256: raise ValueError('manifest_drift')
    manifest = json.loads(raw)
    if manifest['canonical_ref'] != 'swzpzcwiasxmjutrmvkm': raise ValueError('canonical_ref')
    if sha((HERE / 'preflight-readonly.sql.review').read_bytes()) != manifest['preflight_sha256']: raise ValueError('preflight_drift')
    for item in manifest['protected']:
        if sha((ROOT / item['path']).read_bytes()) != item['sha256']: raise ValueError('protected_drift')
    payload = {}; removals = []
    for item in manifest['files']:
        if sha((ROOT / item['path']).read_bytes()) != item['post_sha256']: raise ValueError('source_drift')
        for label in ('candidate', 'rollback'):
            if item[label] and sha((HERE / item[label]).read_bytes()) != item['post_sha256' if label == 'candidate' else 'pre_sha256']: raise ValueError('artifact_drift')
        if item[mode] is None: removals.append(item['path'])
        else: payload[item['path']] = (HERE / item[mode]).read_bytes()
    if removals: payload['REMOVE-NEW-FILES.review.json'] = (json.dumps(removals)+'\n').encode('utf-8')
    for path, data in payload.items():
        target = destination / path; target.parent.mkdir(parents=True, exist_ok=True); target.write_bytes(data)
if __name__ == '__main__':
    if len(sys.argv) != 3: raise SystemExit('stage.py candidate|rollback <empty-outside-project-review-directory>')
    stage(sys.argv[2], sys.argv[1])