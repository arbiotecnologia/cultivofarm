"""Byte-exact local staging only; never applies runtime, SQL or Edge files."""
from pathlib import Path
import hashlib, json, sys

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent

def stage(destination: Path, rollback: bool = False):
    manifest = json.loads((HERE / 'manifest.json').read_bytes().decode('utf-8'))
    # Check ALL sources before any output. No signing/regeneration of goldens.
    for item in manifest['files']:
        actual = hashlib.sha256((ROOT / item['path']).read_bytes()).hexdigest()
        if actual != item['post_sha256']:
            raise ValueError('source_drift: ' + item['path'])
        for label in ('candidate', 'rollback'):
            data = (HERE / item[label]).read_bytes()
            if hashlib.sha256(data).hexdigest() != item['post_sha256' if label == 'candidate' else 'pre_sha256']:
                raise ValueError('artifact_drift: ' + item[label])
    for item in manifest['files']:
        target = destination / item['path']
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes((HERE / item['rollback' if rollback else 'candidate']).read_bytes())

if __name__ == '__main__':
    if len(sys.argv) != 3 or sys.argv[1] not in ('candidate', 'rollback'):
        raise SystemExit('usage: stage.py candidate|rollback <review-output-directory>')
    destination = Path(sys.argv[2]).resolve()
    if destination == ROOT or ROOT in destination.parents:
        raise SystemExit('review output must be outside project; no application allowed')
    stage(destination, sys.argv[1] == 'rollback')