#!/usr/bin/env bash
# =====================================================================
# P1 — DRY-RUN DO DELTA DE PROMOÇÃO, EXCLUSIVAMENTE EM STAGING
#
# Reaplica o delta (migrations posteriores ao baseline de produção) dentro de
# UMA transação que termina SEMPRE em ROLLBACK, duas vezes seguidas, provando
# idempotência sem persistir nada. Aborta se o DSN não for o staging.
#
# Uso:
#   STAGING_DSN='postgresql://...' restoration/promocao-producao/30-dry-run-staging.sh
# =====================================================================
set -euo pipefail

PROD_REF="navfzbwgwzruipouyfnk"
STG_REF="ikaauvsflpmamgxmkhoq"
BASELINE="20260819020208"

: "${STAGING_DSN:?STAGING_DSN obrigatório}"
case "$STAGING_DSN" in
  *"$PROD_REF"*) echo "ABORT: DSN aponta PRODUÇÃO." >&2; exit 2;;
  *"$STG_REF"*) : ;;
  *) echo "ABORT: DSN não é o staging autorizado." >&2; exit 2;;
esac

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

# Delta = arquivos posteriores ao baseline, EXCLUINDO a quarentena de sandbox
# (nomes UUID de 20260812*), que nunca entra na cadeia de promoção.
mapfile -t FILES < <(ls supabase/migrations | awk -F_ -v b="$BASELINE" '$1>b' | sort)
[ "${#FILES[@]}" -gt 0 ] || { echo "ABORT: delta vazio." >&2; exit 3; }
echo "[1/3] delta com ${#FILES[@]} migrations"
printf '  %s\n' "${FILES[@]}"

echo "[2/3] ensaio em transação revertida (2 passagens)"
{
  echo "BEGIN;"
  for pass in 1 2; do
    echo "\\echo === PASSAGEM $pass ==="
    for f in "${FILES[@]}"; do echo "\\i supabase/migrations/$f"; done
  done
  echo "ROLLBACK;"
} | psql "$STAGING_DSN" -X -v ON_ERROR_STOP=1 -f -

echo "[3/3] nada persistido (ROLLBACK final)"
echo "DRY_RUN_STAGING_DONE"
