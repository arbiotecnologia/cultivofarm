#!/usr/bin/env bash
# Restores the exact published baseline 3eeb3212 bytes for the hotfix files.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"; PKG="$ROOT/scripts/monitor-attachments-hotfix"
for f in src/lib/authz/authzEpochMonitor.ts src/components/financeiro/DocumentosPanel.tsx \
  src/components/financeiro/relatorios/HistoricoExportacoes.tsx src/test/config/authzEarlyRenewal.test.ts \
  src/test/equipe-tecnica/StorageDownloads.session.test.tsx; do cp "$PKG/baseline/$f" "$ROOT/$f"; done
rm -f "$ROOT/src/test/financeiro/FinancialAuthenticatedDownloads.test.tsx"
(cd "$PKG" && sha256sum -c --quiet baseline.SHA256SUMS)
echo "rollback to 3eeb3212 restored"
