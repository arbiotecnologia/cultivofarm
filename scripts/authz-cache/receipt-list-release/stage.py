"""Review output only; byte-exact, validates all inputs before writing."""
from pathlib import Path
import hashlib, json, sys
ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
def sha(data): return hashlib.sha256(data).hexdigest()
def stage(destination, rollback=False):
    destination = Path(destination).resolve()
    if destination == ROOT or ROOT in destination.parents:
        raise ValueError('destination_inside_project')
    manifest = json.loads((HERE / 'manifest.json').read_bytes().decode('utf-8'))
    for item in manifest['protected']:
        if sha((ROOT / item['path']).read_bytes()) != item['sha256']:
            raise ValueError('protected_drift:' + item['path'])
    for item in manifest['files']:
        if sha((ROOT / item['path']).read_bytes()) != item['post_sha256']:
            raise ValueError('source_drift:' + item['path'])
        for label in ('candidate', 'rollback'):
            if item.get(label) and sha((HERE / item[label]).read_bytes()) != item['post_sha256' if label == 'candidate' else 'pre_sha256']:
                raise ValueError('artifact_drift:' + item[label])
    # Rollback removes only newly introduced dependency; no SQL/Edge/gate apply.
    removals = []
    for item in manifest['files']:
        if rollback and item.get('rollback') is None:
            removals.append(item['path']); continue
        target = destination / item['path']
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes((HERE / item['rollback' if rollback else 'candidate']).read_bytes())
    if rollback:
        (destination / 'REMOVE-ONLY.json').write_text(json.dumps(removals, indent=2) + '\n', encoding='utf-8')
if __name__ == '__main__':
    if len(sys.argv) != 3 or sys.argv[1] not in ('candidate', 'rollback'):
        raise SystemExit('usage: stage.py candidate|rollback <outside-project-review-directory>')
    stage(Path(sys.argv[2]), sys.argv[1] == 'rollback')