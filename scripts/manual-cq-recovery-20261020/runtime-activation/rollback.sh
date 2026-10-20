#!/usr/bin/env bash
# Rollback frontend CQ: restaura bytes exatos pré-ativação (gate volta a false implicitamente).
set -euo pipefail
P=scripts/manual-cq-recovery-20261020
for f in components/cockpit/CQComparativoTable.tsx components/cockpit/RegistrarCQDialog.tsx components/ordens-servico/OSDetalhesDialog.tsx hooks/useCQReferencia.ts; do cp "$P/rollback/src/$f.review" "src/$f"; done
cp "$P/runtime-activation/rollback/d51-5-p0d-production-rbac.test.ts.review" src/test/security/d51-5-p0d-production-rbac.test.ts
sha256sum -c <<'H'
e5b13716e1fee437bfebda58d15239d2b3cd72113ad852aad4c81780d2d1ac03  src/components/cockpit/CQComparativoTable.tsx
feb8228fb7ebbfb5b9837e8f6dc651587f17a803e3a17243cdbf420b3da8f192  src/components/cockpit/RegistrarCQDialog.tsx
3860b367d2b136b2239ad1b36dd99cb8f08f1098d8b8dcffc3ef9098e2eb46c2  src/components/ordens-servico/OSDetalhesDialog.tsx
d49770351f2f6faf6f1465b59474385d8146145b9eaa08a4a35f99b8dae1bdf9  src/hooks/useCQReferencia.ts
dc72c7689e22f28dffcccf6e9a8aa271218f43530715a0f832452e7be18be1df  src/test/security/d51-5-p0d-production-rbac.test.ts
H
