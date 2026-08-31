#!/usr/bin/env bash
# FASE H7j — Runner fail-fast: guard de staging -> apply -> postcheck.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
"$HERE/guard-staging.sh"
"$HERE/../os-e2e/staging-psql.sh" -f "$HERE/89-h7j-delete-guard-apply.sql"
"$HERE/../os-e2e/staging-psql.sh" -f "$HERE/91-h7j-postcheck.sql"
echo "H7J RUNNER: OK"
