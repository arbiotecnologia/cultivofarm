#!/usr/bin/env bash
# Inventario SOMENTE LEITURA do backend gerenciado (Lovable Cloud).
#
# Regras fail-closed:
#  - Origem deve ser EXATAMENTE o ref gerenciado informado em CLOUD_REF.
#  - Destino canonico swzpzcwiasxmjutrmvkm NUNCA e alvo deste script.
#  - Nenhuma escrita: apenas SELECT. Nenhum segredo/certificado/dado pessoal e impresso.
#  - Nao transfere nada. Transferencia exige fase posterior autorizada.
set -euo pipefail

CANONICAL_REF="swzpzcwiasxmjutrmvkm"
CLOUD_REF="${CLOUD_REF:-}"
OUT="${OUT:-docs/auditorias/cloud-exit/inventory-$(date -u +%Y%m%dT%H%M%SZ).txt}"

if [[ -z "${CLOUD_REF}" ]]; then
  echo "FAIL-CLOSED: defina CLOUD_REF com o ref do backend gerenciado de origem." >&2
  exit 2
fi
if [[ "${CLOUD_REF}" == "${CANONICAL_REF}" ]]; then
  echo "FAIL-CLOSED: origem nao pode ser o projeto canonico ${CANONICAL_REF}." >&2
  exit 2
fi
if [[ -z "${CLOUD_DB_URL:-}" ]]; then
  echo "FAIL-CLOSED: defina CLOUD_DB_URL (conexao de leitura da origem)." >&2
  exit 2
fi
if [[ "${CLOUD_DB_URL}" != *"${CLOUD_REF}"* ]]; then
  echo "FAIL-CLOSED: CLOUD_DB_URL nao corresponde a CLOUD_REF." >&2
  exit 2
fi
if [[ "${CLOUD_DB_URL}" == *"${CANONICAL_REF}"* ]]; then
  echo "FAIL-CLOSED: CLOUD_DB_URL aponta para o canonico. Abortado." >&2
  exit 2
fi

mkdir -p "$(dirname "${OUT}")"

run() {
  psql "${CLOUD_DB_URL}" -v ON_ERROR_STOP=1 --no-psqlrc -At -c "SET default_transaction_read_only = on; $1"
}

{
  echo "# Inventario somente leitura — origem ${CLOUD_REF}"
  echo "# gerado em $(date -u +%FT%TZ)"
  echo
  echo "## Tabelas public e contagens exatas"
  run "select table_name || '|' || (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by table_name"
  echo
  echo "## Funcoes public (nomes apenas)"
  run "select routine_name from information_schema.routines where routine_schema='public' order by 1"
  echo
  echo "## Politicas RLS (tabela|policy)"
  run "select tablename || '|' || policyname from pg_policies where schemaname='public' order by 1,2"
  echo
  echo "## Buckets e objetos (metadados)"
  run "select id || '|public=' || public::text from storage.buckets order by 1"
  run "select bucket_id || '|' || count(*)::text from storage.objects group by 1 order by 1"
  echo
  echo "## Migrations registradas"
  run "select version from supabase_migrations.schema_migrations order by 1"
  echo
  echo "## Auth (apenas contagem)"
  run "select count(*)::text from auth.users"
} | tee "${OUT}"

echo "Inventario escrito em ${OUT} (nenhum dado pessoal, segredo ou certificado exportado)."
