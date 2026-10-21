#!/usr/bin/env python3
"""Safe rollback: restores ONLY the Edge source to v91 (no signing). Frontend stays fixed, so a
CANCELED receipt fails closed ("Recibo indisponível") instead of serving the old ISSUED PDF.
Restoring baseline/RecibosList.tsx would reintroduce the defect and is intentionally not offered."""
import pathlib, shutil, hashlib
D = pathlib.Path(__file__).parent
dst = pathlib.Path("supabase/functions/generate-financial-receipt/index.ts")
src = D / "baseline/edge-index.ts.v91"
assert "createSignedUrl" not in src.read_text()
shutil.copyfile(src, dst); print("edge restored", hashlib.sha256(dst.read_bytes()).hexdigest())
