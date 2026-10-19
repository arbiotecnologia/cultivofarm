#!/usr/bin/env bash
# Restaura bytes exatos do PUBLICADO 1c2f29e para os arquivos do delta e remove testes novos.
set -euo pipefail
cd "$(dirname "$0")/../.."
B=scripts/monitor-partial-revocation/baseline
for f in src/App.tsx src/components/guards/AppPortalGuard.tsx src/pages/SelecionarPortal.tsx src/hooks/useAuth.tsx src/components/authz/AuthzEpochBoundary.tsx src/lib/authz/internalContextProbe.ts src/test/config/managerConsultantOpenSession.integration.test.tsx; do cp "$B/$f" "$f"; done
rm -f src/test/config/monitorRetryReresolve.integration.test.tsx src/test/config/internalProbeLatency.test.ts
sha256sum -c scripts/monitor-partial-revocation/SHA256SUMS.baseline
