#!/usr/bin/env bash
# Fase Fiscal 3.0.1 — 03-apply.sh
# Aplica as três migrations fiscais em ordem sobre banco isolado.
# NUNCA executar contra produção.
set -euo pipefail

: "${PGURL:?PGURL obrigatório (ex.: postgres://postgres:temp@localhost:55432/postgres)}"

if [[ "$PGURL" == *navfzbwgwzruipouyfnk* ]]; then
  echo "ABORT: PGURL aponta para produção" >&2
  exit 2
fi

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

psql "$PGURL" -v ON_ERROR_STOP=1 -f supabase/migrations/20260721000000_fiscal_fase2_fundacao.sql
psql "$PGURL" -v ON_ERROR_STOP=1 -f supabase/migrations/20260721010000_fiscal_fase2_1_hardening.sql
# 3.0.1 mora em restoration/migrations/ até promoção manual para supabase/migrations/
psql "$PGURL" -v ON_ERROR_STOP=1 -f restoration/migrations/20260722000000_fiscal_fase3_0_1_integridade.sql

echo "APLICADO: fase2 + fase2.1 + fase3.0.1"
