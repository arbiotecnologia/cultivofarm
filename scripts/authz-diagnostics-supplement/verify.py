"""Offline supplement checks; immutable programming artifacts are never regenerated."""
from pathlib import Path
import hashlib, json, subprocess, tempfile, importlib.util

ROOT = Path(__file__).resolve().parents[2]
H = Path(__file__).resolve().parent
sha = lambda data: hashlib.sha256(data).hexdigest()
m = json.loads((H / 'manifest.json').read_text())
assert m['baseline_commit'] == 'c30af10c472255c919d167bc555c4f757eedaff0'
assert m['canonical_ref'] == 'swzpzcwiasxmjutrmvkm'
for name, hashes in m['files'].items():
    baseline = subprocess.check_output(['git', 'show', m['baseline_commit'] + ':' + name], cwd=ROOT)
    assert (H / 'rollback' / name).read_bytes() == baseline
    assert sha(baseline) == hashes['pre']
    assert sha((H / 'candidate' / name).read_bytes()) == hashes['post']
    assert (ROOT / name).read_bytes() == (H / 'candidate' / name).read_bytes()
    assert hashes['pre'] != hashes['post']
for name, digest in m['historical_programming_artifacts'].items():
    assert sha((ROOT / name).read_bytes()) == digest, name
# The old programming stager intentionally rejects the new runtime diagnostic.
# Verify the frozen package against its original baseline in a disposable tree;
# do not update its manifest, protected hashes, assembler or snapshot.
pkg = ROOT / 'scripts/os-programming-recovery'
spec = importlib.util.spec_from_file_location('frozen_stage', pkg / 'stage.py')
stage = importlib.util.module_from_spec(spec)
spec.loader.exec_module(stage)
p = json.loads((pkg / 'manifest.json').read_text())
with tempfile.TemporaryDirectory(prefix='diag-check-', dir='/tmp') as tmp:
    root = Path(tmp) / 'root'
    for name, digest in p['protected'].items():
        data = (ROOT / name).read_bytes()
        if name in m['files']:
            assert sha(data) == m['files'][name]['post']
            data = (H / 'rollback' / name).read_bytes()
        assert sha(data) == digest, name
        dest = root / name
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(data)
    name = p['runtime']['path']
    dest = root / name
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes((ROOT / name).read_bytes())
    stage.ROOT = root
    stage.stage(Path(tmp) / 'candidate')
    stage.stage(Path(tmp) / 'rollback', True)
print('PASS: c30af exact rollback, diagnostic-only delta, immutable programming artifacts, frozen candidate/rollback staging')