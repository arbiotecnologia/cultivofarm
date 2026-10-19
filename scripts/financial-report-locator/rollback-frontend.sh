#!/usr/bin/env bash
# Restores exact 5ad97d6c bytes for ReportShell and its test; removes added files.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"; P="$ROOT/scripts/financial-report-locator"
cp "$P/frontend-baseline/ReportShell.tsx" "$ROOT/src/components/financeiro/relatorios/ReportShell.tsx"
cp "$P/frontend-baseline/test/reportShell.session.test.tsx" "$ROOT/src/test/financeiro/reportShell.session.test.tsx"
rm -f "$ROOT/src/lib/financeiro/reportExportLocator.ts" "$ROOT/src/test/financeiro/reportShell.authenticatedExport.test.tsx" "$ROOT/src/test/financeiro/financialReport.candidate.edge.test.ts"
(cd "$P" && sha256sum -c --quiet frontend-baseline.SHA256SUMS); echo "frontend rollback to 5ad97d6c OK"
