#!/usr/bin/env bash
# Export SELETIVO somente leitura da origem gerenciada para arquivos locais.
#
# Esta fase NAO executa transferencia para o canonico. O script apenas
# materializa CSVs de tabelas explicitamente listadas, para auditoria humana.
#
# Fail-closed:
#  - Origem obrigatoria e diferente do canonico.
#  - Destino declarado deve ser o canonico (registro de intencao), mas nenhuma
#    escrita remota e feita aqui: sem --i-have-audited-the-diff o script para.
#  - Tabelas com conteudo sensivel (certificados/segredos) sao bloqueadas.
set -euo pipefail

CANONICAL_REF="swzpzcwiasxmjutrmvkm"
CLOUD_REF="${CLOUD_REF:-}"
TARGET_REF="${TARGET_REF:-${CANONICAL_REF}}"
TABLES="${TABLES:-}"
OUTDIR="${OUTDIR:-/tmp/cloud-exit-export}"

DENYLIST="fiscal_certificates fiscal_certificate_material vault secrets user_secrets"

if [[ -z "${CLOUD_REF}" || -z "${CLOUD_DB_URL:-}" ]]; then
  echo "FAIL-CLOSED: defina CLOUD_REF e CLOUD_DB_URL da origem." >&2
  exit 2
fi
if [[ "${CLOUD_REF}" == "${CANONICAL_REF}" || "${CLOUD_DB_URL}" == *"${CANONICAL_REF}"* ]]; then
  echo "FAIL-CLOSED: a origem nao pode ser o canonico ${CANONICAL_REF}." >&2
  exit 2
fi
if [[ "${TARGET_REF}" != "${CANONICAL_REF}" ]]; then
  echo "FAIL-CLOSED: destino permitido e exclusivamente ${CANONICAL_REF}." >&2
  exit 2
fi
if [[ "${1:-}" != "--i-have-audited-the-diff" ]]; then
  echo "PARADO: exportacao exige --i-have-audited-the-diff apos auditoria do diff." >&2
  exit 3
fi
if [[ -z "${TABLES}" ]]; then
  echo "FAIL-CLOSED: informe TABLES com a lista explicita de tabelas." >&2
  exit 2
fi

mkdir -p "${OUTDIR}"
for table in ${TABLES}; do
  for denied in ${DENYLIST}; do
    if [[ "${table}" == "${denied}" ]]; then
      echo "FAIL-CLOSED: tabela sensivel bloqueada: ${table}" >&2
      exit 2
    fi
  done
  psql "${CLOUD_DB_URL}" -v ON_ERROR_STOP=1 --no-psqlrc \
    -c "SET default_transaction_read_only = on;" \
    -c "\copy (select * from public.${table}) to '${OUTDIR}/${table}.csv' with csv header"
  echo "exportado: ${OUTDIR}/${table}.csv"
done

echo "Export concluido em ${OUTDIR}. NENHUMA escrita remota foi feita no canonico."
