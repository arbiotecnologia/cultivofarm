#!/usr/bin/env bash
# Fase Fiscal 3.0 — aplica migrations fiscais canônicas contra banco de teste.
# NUNCA executar contra o projeto real.
set -euo pipefail

PGURL="${1:-}"
if [[ -z "$PGURL" ]]; then
  echo "Uso: $0 <PGURL>"
  exit 2
fi

if [[ "$PGURL" == *"navfzbwgwzruipouyfnk"* ]]; then
  echo "ABORT: PGURL aponta para o projeto real da AR Bio." >&2
  exit 3
fi

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

psql "$PGURL" -v ON_ERROR_STOP=1 -f "$ROOT/supabase/migrations/20260721000000_fiscal_fase2_fundacao.sql"
psql "$PGURL" -v ON_ERROR_STOP=1 -f "$ROOT/supabase/migrations/20260721010000_fiscal_fase2_1_hardening.sql"

echo "OK — migrations fiscais aplicadas."
