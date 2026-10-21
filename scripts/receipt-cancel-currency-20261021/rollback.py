#!/usr/bin/env python3
"""Safe rollback: replaces the Edge with a 503 stub (no signing, no rendering). v91 is NOT restored:
it renders CANCELED over the historical ISSUED object. The fixed frontend stays: ISSUED receipts
already generated still download via authenticated Storage; generation and CANCELED fail closed.
Restoring the baseline list would reintroduce the defect and is not offered. No SQL/policy changes."""
import pathlib, shutil, hashlib
D = pathlib.Path(__file__).parent
src = D / "rollback/edge-503.ts.review"; dst = pathlib.Path("supabase/functions/generate-financial-receipt/index.ts")
t = src.read_text(); assert "createSignedUrl" not in t and "upload(" not in t
shutil.copyfile(src, dst); print("edge 503 stub", hashlib.sha256(dst.read_bytes()).hexdigest())
