#!/usr/bin/env bash
# =====================================================================
# FASE F1 (+ correção 20260813000000) — RUNNER DO PÓS-CHECK
# Somente leitura. Injeta o baseline capturado antes da correção para que
# o postcheck compare estado real x baseline, sem contagens congeladas.
#
# Uso: ./restoration/fase-f1/run-postcheck.sh
# Requer: STAGING_DSN no ambiente (nunca é impresso).
# =====================================================================
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASELINE="$HERE/baseline/pre-correcao.json"

if [[ -z "${STAGING_DSN:-}" ]]; then
  echo "POSTCHECK_ABORT: STAGING_DSN ausente no ambiente" >&2
  exit 1
fi
if [[ ! -f "$BASELINE" ]]; then
  echo "POSTCHECK_ABORT: baseline nao encontrado em $BASELINE" >&2
  exit 1
fi

psql "$STAGING_DSN" \
  -v ON_ERROR_STOP=1 \
  -v baseline_json="$(tr -d '\n' < "$BASELINE")" \
  -f "$HERE/postcheck.sql"
