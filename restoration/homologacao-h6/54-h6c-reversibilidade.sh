#!/usr/bin/env bash
# H6c-002 — PROVA DE REVERSIBILIDADE APPLY -> ROLLBACK -> APPLY.
# SOMENTE staging ikaauvsflpmamgxmkhoq. Nenhum dado real e apagado:
# o roteiro so troca definicoes de funcoes/triggers e compara contagens.
#
# Uso: STAGING_DSN=... restoration/homologacao-h6/54-h6c-reversibilidade.sh
set -euo pipefail
: "${STAGING_DSN:?STAGING_DSN ausente}"
case "$STAGING_DSN" in
  *navfzbwgwzruipouyfnk*) echo "ABORT: DSN aponta para PRODUCAO"; exit 2;;
  *ikaauvsflpmamgxmkhoq*) : ;;
  *) echo "ABORT: DSN nao reconhecido como staging"; exit 2;;
esac
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
H6="restoration/homologacao-h6"

snapshot() {
  psql "$STAGING_DSN" -Atc "SELECT
      (SELECT count(*) FROM public.receivable_payments) || '|' ||
      (SELECT count(*) FROM public.payable_payments) || '|' ||
      (SELECT count(*) FROM public.accounts_receivable) || '|' ||
      (SELECT count(*) FROM public.accounts_payable) || '|' ||
      (SELECT count(*) FROM public.entrega_reconciliacoes) || '|' ||
      (SELECT count(*) FROM public.partner_orders WHERE payment_terms_id IS NOT NULL)"
}

BEFORE="$(snapshot)"
echo "== 1) APPLY inicial (estado corrente H6b+H6c) — postcheck estrutural"
psql "$STAGING_DSN" -v ON_ERROR_STOP=1 -f "$H6/46-h6b-postcheck.sql" | tee /tmp/h6c-apply1.txt

echo "== 2) ROLLBACK integral para a baseline H6"
"$H6/rollback-h6b.sh"
psql "$STAGING_DSN" -v ON_ERROR_STOP=1 -f "$H6/53-h6b-rollback-postcheck.sql" | tee /tmp/h6c-rollback.txt

AFTER_RB="$(snapshot)"

echo "== 3) REAPPLY H6b -> H6c -> H6c-003 (guard integral)"
psql "$STAGING_DSN" -v ON_ERROR_STOP=1 -f "$H6/20260916000000_h6b_financeiro_idempotencia_valor_canonico.sql" >/dev/null
psql "$STAGING_DSN" -v ON_ERROR_STOP=1 -f "$H6/20260917000000_h6c_financeiro_snapshot_b2b_credito.sql" >/dev/null
psql "$STAGING_DSN" -v ON_ERROR_STOP=1 -f "$H6/20260917010000_h6c_backfill_payment_terms_link.sql" >/dev/null
psql "$STAGING_DSN" -v ON_ERROR_STOP=1 -f "$H6/20260918000000_h6c2_guard_integral_canonico.sql" >/dev/null
psql "$STAGING_DSN" -v ON_ERROR_STOP=1 -f "$H6/46-h6b-postcheck.sql" | tee /tmp/h6c-apply2.txt
psql "$STAGING_DSN" -v ON_ERROR_STOP=1 -f "$H6/47-h6c-postcheck.sql" | tee /tmp/h6c-apply2c.txt

AFTER="$(snapshot)"

echo
echo "== EVIDENCIA DE REVERSIBILIDADE =="
echo "contagens antes    : $BEFORE"
echo "contagens rollback : $AFTER_RB"
echo "contagens depois   : $AFTER"
fail=0
[ "$BEFORE" = "$AFTER_RB" ] || { echo "FAIL — rollback alterou dados"; fail=1; }
[ "$BEFORE" = "$AFTER" ]    || { echo "FAIL — reapply alterou dados"; fail=1; }
grep -q FAIL /tmp/h6c-rollback.txt && { echo "FAIL — baseline H6 nao restaurada"; fail=1; }
grep -q FAIL /tmp/h6c-apply2.txt   && { echo "FAIL — H6b nao restabelecido"; fail=1; }
grep -q FAIL /tmp/h6c-apply2c.txt  && { echo "FAIL — H6c nao restabelecido"; fail=1; }
if [ "$fail" = "0" ]; then echo "H6C_REVERSIBILIDADE: PASS (APPLY -> ROLLBACK -> APPLY sem perda de dados)"; else exit 1; fi
