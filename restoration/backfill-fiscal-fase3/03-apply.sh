#!/usr/bin/env bash
# Fase Fiscal 3.0.2-C — 03-apply.sh
# Aplica as migrations fiscais CANÔNICAS (supabase/migrations) em staging isolado.
# Nunca aplica de restoration/migrations.
set -euo pipefail

: "${FISCAL_TEST_ENV:?FISCAL_TEST_ENV obrigatório (=STAGING)}"
: "${FISCAL_TEST_PROJECT_REF:?FISCAL_TEST_PROJECT_REF obrigatório}"
: "${PGURL_STAGING:?PGURL_STAGING obrigatório}"

if [[ "${FISCAL_TEST_ENV}" != "STAGING" ]]; then
  echo "ABORT: FISCAL_TEST_ENV != STAGING" >&2; exit 2
fi

PROD_REF="navfzbwgwzruipouyfnk"
if [[ "${FISCAL_TEST_PROJECT_REF}" == "${PROD_REF}" ]]; then
  echo "ABORT: FISCAL_TEST_PROJECT_REF aponta produção" >&2; exit 2
fi
if [[ "${PGURL_STAGING}" == *"${PROD_REF}"* ]]; then
  echo "ABORT: PGURL_STAGING contém ref de produção" >&2; exit 2
fi
if [[ "${PGURL_STAGING}" != *"${FISCAL_TEST_PROJECT_REF}"* ]]; then
  echo "ABORT: PGURL_STAGING não corresponde a FISCAL_TEST_PROJECT_REF" >&2; exit 2
fi

# Confere marker+project_ref antes de qualquer aplicação.
MARKER_OK=$(psql "$PGURL_STAGING" -Atqc \
  "SELECT count(*) FROM public._fiscal_staging_marker WHERE marker='STAGING' AND project_ref='${FISCAL_TEST_PROJECT_REF}'")
if [[ "$MARKER_OK" != "1" ]]; then
  echo "ABORT: marker _fiscal_staging_marker ausente/incompatível" >&2; exit 3
fi

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

# ORDEM ESTRITA — todas em supabase/migrations (fonte canônica única).
psql "$PGURL_STAGING" -v ON_ERROR_STOP=1 -f supabase/migrations/20260721000000_fiscal_fase2_fundacao.sql
psql "$PGURL_STAGING" -v ON_ERROR_STOP=1 -f supabase/migrations/20260721010000_fiscal_fase2_1_hardening.sql
psql "$PGURL_STAGING" -v ON_ERROR_STOP=1 -f supabase/migrations/20260722000000_fiscal_fase3_0_1_integridade.sql

echo "APLICADO: fase2 + fase2.1 + fase3.0.1 (canônico) contra ref=${FISCAL_TEST_PROJECT_REF}"
