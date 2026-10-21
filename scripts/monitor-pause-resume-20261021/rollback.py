#!/usr/bin/env python3
"""Rollback fail-closed: restaura os 4 arquivos baseline e remove o módulo de retomada.
Não toca no monitor (já byte-exato 51048f), Auth, SQL ou dados."""
import os, shutil, sys
R = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(R, "../.."))
M = {"ProdutoresTab.tsx": "src/pages/clientes/ProdutoresTab.tsx",
     "ClienteFormTabs.tsx": "src/components/clientes/ClienteFormTabs.tsx",
     "AuthzEpochBoundary.tsx": "src/components/authz/AuthzEpochBoundary.tsx",
     "useAuth.tsx": "src/hooks/useAuth.tsx"}
for b, dst in M.items():
    src = os.path.join(R, "rollback", b + ".baseline")
    if not os.path.isfile(src): sys.exit(f"baseline ausente: {b}")
for b, dst in M.items(): shutil.copyfile(os.path.join(R, "rollback", b + ".baseline"), os.path.join(ROOT, dst))
for p in ["src/lib/navigation/protectedResumeContext.ts", "src/test/clientes/ProdutoresTab.authzResume.test.tsx", "src/test/clientes/ProdutoresTab.authzResume.integration.test.tsx"]:
    fp = os.path.join(ROOT, p)
    if os.path.exists(fp): os.remove(fp)
print("rollback OK")
