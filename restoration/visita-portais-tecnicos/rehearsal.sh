#!/usr/bin/env bash
# ============================================================================
# ROLLBACK REHEARSAL — Fluxo unificado de atendimento técnico (STAGING ONLY)
#
# Sequência fail-fast:
#   0) guard de ambiente (STAGING_REF)
#   1) snapshot do estado final
#   2) rollback.sql            (estado pré-fase)
#   3) verify-restoration.sql  (checksums do baseline comparados)
#   4) reaplica a migration canônica (estado final)
#   5) postcheck-final.sql     (checksums do estado final comparados)
#
# Ao término, o staging permanece no ESTADO FINAL.
# Requer STAGING_DSN e STAGING_REF no ambiente. Nada é impresso do DSN.
# ============================================================================
set -euo pipefail

EXPECTED_REF="ikaauvsflpmamgxmkhoq"
PROD_REF="navfzbwgwzruipouyfnk"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
CANONICAL="$ROOT/supabase/migrations/20260805040000_visita_canonica_failclosed.sql"
FINALIZER="$ROOT/supabase/migrations/20260805041601_752b9122-f0e1-4646-9c4a-7c1393deae8d.sql"

if [[ -z "${STAGING_DSN:-}" || -z "${STAGING_REF:-}" ]]; then
  echo "ABORT: STAGING_DSN/STAGING_REF ausentes"; exit 1
fi
if [[ "$STAGING_REF" == "$PROD_REF" ]]; then
  echo "ABORT: STAGING_REF aponta para PRODUCAO"; exit 1
fi
if [[ "$STAGING_REF" != "$EXPECTED_REF" ]]; then
  echo "ABORT: STAGING_REF inesperado"; exit 1
fi

run() { psql "$STAGING_DSN" -v ON_ERROR_STOP=1 --single-transaction -f "$1"; }

echo "== 1) snapshot do estado final =="
psql "$STAGING_DSN" -tAF'|' -c "select p.proname, encode(extensions.digest(pg_get_functiondef(p.oid)::bytea,'sha256'),'hex') from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('is_visit_responsible','rpc_criar_visita_idempotente','rpc_iniciar_atendimento_solicitacao_v1','rpc_listar_atendimentos_tecnicos_v1','rpc_resumo_atendimentos_tecnicos_v1','rpc_finalizar_visita_v2') order by 1;"

echo "== 2) rollback =="
run "$HERE/rollback.sql"

echo "== 3) verify (baseline) =="
run "$HERE/verify-restoration.sql"

echo "== 4) reaplicar migration canonica =="
run "$CANONICAL"
run "$FINALIZER"

echo "== 5) postcheck (estado final) =="
run "$HERE/postcheck-final.sql"

echo "ROLLBACK_REHEARSAL_PASS"
