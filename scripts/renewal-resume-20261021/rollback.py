#!/usr/bin/env python3
"""Rollback byte-exato ao publicado a82c82d5 (useAuth + protectedResumeContext).
Recusa se o runtime não for a candidata nem o baseline. Não toca monitor/lease/XML."""
import hashlib, shutil, sys
from pathlib import Path
R = Path(__file__).resolve().parents[2]; D = Path(__file__).resolve().parent
F = {"src/hooks/useAuth.tsx": "useAuth.tsx", "src/lib/navigation/protectedResumeContext.ts": "protectedResumeContext.ts"}
h = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
for rel, n in F.items():
    cur, cand, base = R/rel, D/"candidate"/n, D/"baseline"/n
    if h(cur) not in (h(cand), h(base)): sys.exit(f"ABORT: {rel} divergente")
for rel, n in F.items(): shutil.copyfile(D/"baseline"/n, R/rel)
print("rollback OK -> a82c82d5")
