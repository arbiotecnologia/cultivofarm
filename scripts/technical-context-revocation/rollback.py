from pathlib import Path
import hashlib, json, sys

root = Path(__file__).resolve().parents[2]
pkg = Path(__file__).resolve().parent
manifest = json.loads((pkg / 'manifest.json').read_text())
for entry in manifest['files']:
    target = root / entry['path']
    baseline = pkg / 'baseline' / entry['path']
    if not target.exists() or hashlib.sha256(target.read_bytes()).hexdigest() != entry['post_sha256']:
        raise SystemExit('DRIFT: ' + entry['path'])
    if hashlib.sha256(baseline.read_bytes()).hexdigest() != entry['pre_sha256']:
        raise SystemExit('BASELINE DRIFT: ' + entry['path'])
print('CHECK_OK: all candidate and baseline hashes match')
if '--apply' in sys.argv:
    for entry in manifest['files']:
        (root / entry['path']).write_bytes((pkg / 'baseline' / entry['path']).read_bytes())
    print('ROLLBACK_OK: exact db1eee restored; known frontend weakness restored, no SQL/publish')