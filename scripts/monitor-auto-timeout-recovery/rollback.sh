#!/usr/bin/env bash
# Restaura bytes exatos de 89151cac e remove arquivos novos da recuperação automática.
set -euo pipefail
cd "$(dirname "$0")/../.."
B=scripts/monitor-auto-timeout-recovery/baseline
for f in src/hooks/useAuth.tsx src/lib/authz/localDiagnostics.ts src/test/config/financialOpenSession.integration.test.tsx src/test/config/companyAdminOpenSession.integration.test.tsx; do cp "$B/$f" "$f"; done
rm -f src/lib/authz/transientTimeoutRecovery.ts src/test/config/autoTimeoutRecovery.integration.test.tsx src/test/lib/transientTimeoutRecovery.test.ts
sha256sum -c scripts/monitor-auto-timeout-recovery/SHA256SUMS.baseline
