#!/usr/bin/env bash
# Rollback frontend CQ (bytes exatos). Uso: rollback.sh [--with-types]
# types.ts reflete o schema hosted pós-DDL; restaurá-lo só junto do rollback SQL.
set -euo pipefail
P=scripts/manual-cq-recovery-20261020; R=$P/runtime-activation
for f in components/cockpit/CQComparativoTable.tsx components/cockpit/RegistrarCQDialog.tsx components/ordens-servico/OSDetalhesDialog.tsx hooks/useCQReferencia.ts; do cp "$P/rollback/src/$f.review" "src/$f"; done
cp "$R/rollback/d51-5-p0d-production-rbac.test.ts.review" src/test/security/d51-5-p0d-production-rbac.test.ts
# A correção de importação de tipos é independente; só reverter com --with-imports.
if [[ " $* " == *" --with-imports "* ]]; then (cd "$R/rollback/types-import" && find src -name '*.review') | while read -r f; do cp "$R/rollback/types-import/$f" "${f%.review}"; done; fi
if [[ " $* " == *" --with-types "* ]]; then cp "$R/rollback/types/types.ts.review" src/integrations/supabase/types.ts; fi
python3 - "$R" "$@" <<'PY'
import hashlib,json,sys
R=sys.argv[1]; m=json.load(open(f"{R}/manifest.json")); ok=True
for k,v in m["files"].items():
  if v["group"]=="types" and "--with-types" not in sys.argv: continue
  if v["group"]=="types-import" and "--with-imports" not in sys.argv: continue
  h=hashlib.sha256(open(k,"rb").read()).hexdigest()
  if h!=v["pre_sha256"]: ok=False; print("DRIFT",k)
print("ROLLBACK OK" if ok else "ROLLBACK FAIL"); sys.exit(0 if ok else 1)
PY
