#!/usr/bin/env bash
# Restaura bytes exatos do PUBLICADO 84edf6c para os 2 arquivos de runtime e remove o teste novo.
set -euo pipefail
cd "$(dirname "$0")/../.."
B=scripts/monitor-retry-loading/baseline
for f in src/hooks/useAuth.tsx src/lib/authz/localDiagnostics.ts; do cp "$B/$f" "$f"; done
rm -f src/test/config/retryLoadingRace.integration.test.tsx
sha256sum -c scripts/monitor-retry-loading/SHA256SUMS.baseline
