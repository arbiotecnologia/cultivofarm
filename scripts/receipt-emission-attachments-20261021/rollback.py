"""Preflight by default. --apply ROOT installs only disabled containment, never old URLs."""
from pathlib import Path
import argparse, hashlib, json

parser = argparse.ArgumentParser()
parser.add_argument("root", nargs="?", default=str(Path(__file__).resolve().parents[2]))
parser.add_argument("--apply", action="store_true")
args = parser.parse_args()
root = Path(args.root).resolve()
packet = Path(__file__).resolve().parent
manifest = json.loads((packet / "manifest.json").read_text())
digest = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
for name, expected in manifest["preserved"].items():
    if digest(root / name) != expected:
        raise SystemExit("STOP: protected dependency differs: " + name)
target = root / manifest["target"]
if digest(target) != manifest["patched_sha256"]:
    raise SystemExit("STOP: target differs from reviewed patch")
safe = packet / "rollback-safe.tsx.review"
if digest(safe) != manifest["safe_rollback_sha256"]:
    raise SystemExit("STOP: containment rollback differs")
if args.apply:
    target.write_bytes(safe.read_bytes())
    print("Containment applied: emission unavailable; protected files untouched")
else:
    print("Preflight PASS: no files changed; rollback disables emission, never restores bearer URLs")