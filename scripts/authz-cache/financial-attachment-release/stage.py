"""Byte-exact review output only. Never installs runtime or touches hosted services."""
from pathlib import Path
import hashlib, json, sys

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def stage(destination, rollback=False):
    destination = Path(destination).resolve()
    if destination == ROOT.resolve() or ROOT.resolve() in destination.parents:
        raise ValueError('review output must be outside project')
    manifest = json.loads((HERE / 'manifest.json').read_bytes().decode('utf-8'))
    for path, expected in manifest['protected'].items():
        if digest(ROOT / path) != expected:
            raise ValueError('protected_drift: ' + path)
    for item in manifest['files']:
        if digest(ROOT / item['path']) != item['post_sha256']:
            raise ValueError('source_drift: ' + item['path'])
        for label in ('candidate', 'rollback'):
            if item[label] and digest(HERE / item[label]) != item['post_sha256' if label == 'candidate' else 'pre_sha256']:
                raise ValueError('artifact_drift: ' + item[label])
    for item in manifest['files']:
        artifact = item['rollback' if rollback else 'candidate']
        if artifact is None:
            # Keep the inert new path builder: rollback restores its only importer.
            # No removal/deletion is performed automatically.
            continue
        target = destination / item['path']
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes((HERE / artifact).read_bytes())

if __name__ == '__main__':
    if len(sys.argv) != 3 or sys.argv[1] not in ('candidate', 'rollback'):
        raise SystemExit('usage: stage.py candidate|rollback <external-review-directory>')
    stage(Path(sys.argv[2]), sys.argv[1] == 'rollback')