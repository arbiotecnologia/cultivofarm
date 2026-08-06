#!/usr/bin/env bash
# =====================================================================
# FASE F4.2 — Orquestrador fail-fast do harness remoto E2E
# Alvo AUTORIZADO: staging ikaauvsflpmamgxmkhoq. Producao proibida.
#
# Nenhum segredo e impresso. As variaveis abaixo devem estar exportadas
# no shell do operador (ver RUNBOOK.md), nunca escritas em arquivo.
# =====================================================================
set -Eeuo pipefail

require() {
  if [ -z "${!1:-}" ]; then echo "ABORT: variavel $1 ausente" >&2; exit 2; fi
}
for v in F42_SUPABASE_URL F42_ANON_KEY F42_SERVICE_ROLE_KEY \
         F42_TEST_MASTER_KEY_B64 F42_ALLOWED_ORIGIN PGURI; do
  require "$v"
done

case "$F42_SUPABASE_URL" in
  *navfzbwgwzruipouyfnk*) echo "ABORT: URL de PRODUCAO" >&2; exit 2;;
  *ikaauvsflpmamgxmkhoq*) ;;
  *) echo "ABORT: URL nao e o staging autorizado" >&2; exit 2;;
esac
case "$PGURI" in
  *navfzbwgwzruipouyfnk*) echo "ABORT: DSN de PRODUCAO" >&2; exit 2;;
esac

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TAG="${F42_TAG:-F42-HARNESS-$(date -u +%Y%m%d%H%M%S)}"
export F42_TAG="$TAG"
export F42_OUT_DIR="${F42_OUT_DIR:-$HERE/artifacts}"

psql_q() { psql "$PGURI" -qAt -v ON_ERROR_STOP=1 "$@"; }

cleanup() {
  echo "--- [cleanup] removendo fixtures da tag $TAG"
  if [ -n "${F42_KEEP_FIXTURES:-}" ]; then
    echo "    (ignorado: F42_KEEP_FIXTURES definido)"; return
  fi
  # Objetos de Storage criados pelo run.
  deno run -A "$HERE/91-cleanup-storage.ts" || true
  psql "$PGURI" --single-transaction -v ON_ERROR_STOP=1 \
    -v f42_tag="'$TAG'" -f "$HERE/90-cleanup.sql" || true
}
trap cleanup EXIT

echo "=== [0/4] Integridade do bundle XSD (repositorio)"
deno run -A "$HERE/../fase-f4-1/runtime-harness/xsd-bundle-integrity.ts"

echo "=== [1/4] Setup das fixtures sinteticas (tag $TAG)"
psql "$PGURI" --single-transaction -v ON_ERROR_STOP=1 \
  -v f42_tag="'$TAG'" -f "$HERE/10-setup.sql" >/dev/null

F42_COMPANY_SETTINGS_ID="$(psql_q -c "select entity_id from public._f42_harness_fixtures where tag='$TAG' and entity='company_fiscal_settings' order by id limit 1")"
F42_INVOICE_ID="$(psql_q -c "select entity_id from public._f42_harness_fixtures where tag='$TAG' and entity='fiscal_invoices' order by id limit 1")"
F42_INVOICE_QUOTE_ID="$(psql_q -c "select entity_id from public._f42_harness_fixtures where tag='$TAG' and entity='fiscal_invoices' order by id desc limit 1")"
export F42_COMPANY_SETTINGS_ID F42_INVOICE_ID F42_INVOICE_QUOTE_ID
echo "    emitente=$F42_COMPANY_SETTINGS_ID documento=$F42_INVOICE_ID"

echo "=== [2/4] Harness remoto E2E contra a Edge Function implantada"
deno run -A "$HERE/20-run-e2e.ts"

echo "=== [3/4] Verificacao de banco (somente leitura)"
psql "$PGURI" --single-transaction -v ON_ERROR_STOP=1 \
  -v f42_tag="'$TAG'" -f "$HERE/30-verify.sql"

echo "=== [4/4] HARNESS F4.2: PASS (tag $TAG)"
