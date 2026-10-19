"""Explicit review staging only; no implicit production target or installation."""
import argparse, hashlib, json
from pathlib import Path

def stage(target: Path, mode: str):
    here = Path(__file__).resolve().parent
    manifest = json.loads((here / "manifest.json").read_text(encoding="utf-8"))
    pending = []
    for entry in manifest["files"]:
        destination = target / entry["path"]
        current = destination.read_bytes()
        expected = entry["baseline_sha256" if mode == "candidate" else "candidate_sha256"]
        if hashlib.sha256(current).hexdigest() != expected:
            raise ValueError("Baseline drift: " + entry["path"])
        data = (here / entry[mode]).read_bytes()
        result = entry["candidate_sha256" if mode == "candidate" else "baseline_sha256"]
        if hashlib.sha256(data).hexdigest() != result:
            raise ValueError("Artifact drift: " + entry["path"])
        data.decode("utf-8")
        pending.append((destination, data))
    # Validate every file before any write. Filesystem interruption is not a DB transaction.
    for destination, data in pending:
        destination.write_bytes(data)

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--target", type=Path, required=True)
    parser.add_argument("--mode", choices=["candidate", "rollback"], required=True)
    args = parser.parse_args()
    stage(args.target, args.mode)
