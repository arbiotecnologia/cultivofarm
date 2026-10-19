#!/usr/bin/env bash
# Restaura bytes exatos da baseline (commit d767eb23) dos 5 arquivos de runtime e remove o teste novo.
set -euo pipefail
cd "$(dirname "$0")/../.."
B=scripts/monitor-retry-reresolve/baseline
for f in src/App.tsx src/components/guards/AppPortalGuard.tsx src/pages/SelecionarPortal.tsx src/hooks/useAuth.tsx src/components/authz/AuthzEpochBoundary.tsx; do cp "$B/$f" "$f"; done
rm -f src/test/config/monitorRetryReresolve.integration.test.tsx
sha256sum -c scripts/monitor-retry-reresolve/SHA256SUMS.baseline
