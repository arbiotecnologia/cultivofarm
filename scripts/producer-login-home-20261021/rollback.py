#!/usr/bin/env python3
"""Rollback byte-exato ao a82c82d5 de 3 arquivos (login produtor). Preserva retomada/renovação e XML isolado."""
import hashlib, shutil, sys
from pathlib import Path
R = Path(__file__).resolve().parents[2]; D = Path(__file__).resolve().parent
F = {"src/hooks/useAvailableContexts.ts": "useAvailableContexts.ts", "src/pages/SelecionarPortal.tsx": "SelecionarPortal.tsx", "src/pages/AcessoPendente.tsx": "AcessoPendente.tsx"}
h = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
for rel, n in F.items():
    if h(R/rel) not in (h(D/"candidate"/n), h(D/"baseline"/n)): sys.exit(f"ABORT: {rel} divergente")
for rel, n in F.items(): shutil.copyfile(D/"baseline"/n, R/rel)
print("rollback OK -> a82c82d5")
