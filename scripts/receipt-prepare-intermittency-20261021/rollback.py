#!/usr/bin/env python3
"""Restores the published 56e5 frontend files byte-exact (no signed URLs, status-bound).
Safe: baseline is the reviewed/published state; it only re-exposes the intermittency, not a leak.
Removes the diagnostics module only if no runtime import remains."""
import hashlib, pathlib, shutil, subprocess, sys
root = pathlib.Path(__file__).resolve().parents[2]; here = pathlib.Path(__file__).parent
targets = {"RecibosList.tsx": "src/pages/financeiro/RecibosList.tsx",
           "EmitirReciboButton.tsx": "src/components/financeiro/EmitirReciboButton.tsx",
           "useAuthenticatedAttachmentOpener.ts": "src/hooks/useAuthenticatedAttachmentOpener.ts"}
expected = {l.split()[1].split("/")[-1]: l.split()[0] for l in (here / "SHA256SUMS").read_text().splitlines() if "/baseline/" in l}
for name, dest in targets.items():
    src = here / "baseline" / name
    if hashlib.sha256(src.read_bytes()).hexdigest() != expected[name]: sys.exit(f"baseline hash mismatch: {name}")
for name, dest in targets.items(): shutil.copyfile(here / "baseline" / name, root / dest)
diag = root / "src/lib/financeiro/receiptPrepareDiagnostics.ts"
if subprocess.run(["rg", "-l", "receiptPrepareDiagnostics", str(root / "src"), "-g", "!**/test/**"], capture_output=True).stdout.strip() == b"" and diag.exists():
    diag.unlink()
print("rollback OK; also revert Promise<boolean> annotations in the two opener tests and drop receiptPrepareIntermittency.test.tsx")
