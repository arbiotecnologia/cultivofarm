#!/usr/bin/env bash
# FASE H8-D — Suíte única de healthcheck de HOMOLOGAÇÃO (staging ikaauvsflpmamgxmkhoq).
#
# Garantias:
#   * READ-ONLY: a única sessão SQL roda dentro de "BEGIN READ ONLY" e o arquivo
#     h8d-healthcheck.sql não contém DDL/DML. Nenhum dado de negócio é alterado.
#   * IDEMPOTENTE: duas execuções seguidas produzem o mesmo fingerprint de negócio.
#   * FAIL-CLOSED DE IDENTIDADE: aborta se o alvo não for o staging esperado ou se
#     qualquer referência ao project ref de PRODUÇÃO aparecer no ambiente.
#   * SANITIZADO: não imprime nem grava DSN, token, chave, senha, certificado,
#     CPF/CNPJ, e-mail, telefone, nome de pessoa ou payload fiscal.
#
# Uso:
#   bash restoration/homologacao-h8/h8d-healthcheck.sh                # tabela + resumo
#   bash restoration/homologacao-h8/h8d-healthcheck.sh --json         # JSON sanitizado no stdout
#   bash restoration/homologacao-h8/h8d-healthcheck.sh --json --out FILE
#
# Saída (exit code):
#   0 = todos os sinais OK/UNKNOWN
#   1 = ao menos um WARN (nenhum CRITICAL)
#   2 = ao menos um CRITICAL
#   10 = gate de identidade/binding falhou (nada foi consultado)
#   11 = erro de execução (DSN ausente, SQL falhou)

set -uo pipefail

STAGING_REF_EXPECTED="ikaauvsflpmamgxmkhoq"
PRODUCTION_REF="navfzbwgwzruipouyfnk"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SQL="$ROOT/restoration/homologacao-h8/h8d-healthcheck.sql"
NOW_UTC="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

MODE="table"; OUT=""
while [ $# -gt 0 ]; do
  case "$1" in
    --json) MODE="json" ;;
    --out) shift; OUT="${1:-}" ;;
    *) echo "H8-D: argumento desconhecido: $1" >&2; exit 11 ;;
  esac
  shift
done

log() { [ "$MODE" = "table" ] && echo "$@"; return 0; }

# ───────────────────────── GATE 1 — identidade fail-closed ─────────────────────────
if [ "${STAGING_REF:-}" != "$STAGING_REF_EXPECTED" ]; then
  echo "H8-D GATE: ABORT — STAGING_REF não é o staging autorizado. Nenhuma consulta executada." >&2
  exit 10
fi
if [ "${STAGING_DSN:-}" = "" ]; then
  echo "H8-D: ABORT — STAGING_DSN ausente no ambiente." >&2
  exit 11
fi
if printf '%s' "${STAGING_DSN}" | grep -q "$PRODUCTION_REF"; then
  echo "H8-D GATE: ABORT — DSN aponta para PRODUÇÃO. Proibido." >&2
  exit 10
fi
if grep -q "$PRODUCTION_REF" "$ROOT/.env" 2>/dev/null; then
  echo "H8-D GATE: ABORT — .env referencia o project ref de PRODUÇÃO." >&2
  exit 10
fi
if ! grep -q "$STAGING_REF_EXPECTED" "$ROOT/.env" 2>/dev/null; then
  echo "H8-D GATE: ABORT — .env não está vinculado ao staging autorizado (drift de binding)." >&2
  exit 10
fi
if [ ! -f "$SQL" ]; then
  echo "H8-D: ABORT — consulta de healthcheck ausente." >&2; exit 11
fi
if grep -Eiq '^[[:space:]]*(insert|update|delete|drop|alter|create|truncate|grant|revoke)[[:space:]]' "$SQL"; then
  echo "H8-D GATE: ABORT — a consulta de healthcheck contém escrita. Suíte é read-only." >&2
  exit 10
fi

log "H8-D HEALTHCHECK — homologação ${STAGING_REF_EXPECTED} — ${NOW_UTC}"
log "  Gate de identidade/binding: OK (produção não é consultada)"

# ───────────────────────── GATE 2 — guard das 59 repo-only ─────────────────────────
GUARD_OUT="$(bash "$ROOT/restoration/homologacao-h7/h7p-guard-repo-only.sh" 2>&1)"
GUARD_RC=$?
if [ $GUARD_RC -eq 0 ]; then GUARD_STATUS="OK"; else GUARD_STATUS="CRITICAL"; fi
log "  Guard repo-only (59 migrations bloqueadas): ${GUARD_STATUS}"

# ───────────────────────── Coleta read-only ─────────────────────────
# Delimitador de unidade (0x1F): nenhum texto de sinal o contém, então campos com
# "|" (ex.: HOMOLOGATION | tpAmb=2) não quebram o parser.
SEP=$'\037'
RAW="$(psql "$STAGING_DSN" -v ON_ERROR_STOP=1 -X -q -t -A -F "$SEP" \
        -c "BEGIN READ ONLY;" -f "$SQL" -c "COMMIT;" 2>&1)"
if [ $? -ne 0 ]; then
  echo "H8-D: ABORT — falha ao coletar sinais (detalhe suprimido para não vazar DSN)." >&2
  exit 11
fi
ROWS="$(printf '%s\n' "$RAW" | grep -v '^BEGIN$' | grep -v '^COMMIT$' | grep "$SEP")"

# guard como sinal adicional
GUARD_ROW="identidade${SEP}guard_repo_only_59${SEP}${GUARD_STATUS}${SEP}$([ "$GUARD_STATUS" = OK ] && echo 'íntegro' || echo 'drift detectado')${SEP}59 migrations íntegras e ausentes do ledger${SEP}Falha do guard bloqueia qualquer migration: seção 7.3 do runbook."
ROWS="$(printf '%s\n%s' "$ROWS" "$GUARD_ROW")"

CRIT=$(printf '%s\n' "$ROWS" | awk -F"$SEP" '$3=="CRITICAL"' | wc -l | tr -d ' ')
WARN=$(printf '%s\n' "$ROWS" | awk -F"$SEP" '$3=="WARN"' | wc -l | tr -d ' ')
UNK=$(printf '%s\n' "$ROWS" | awk -F"$SEP" '$3=="UNKNOWN"' | wc -l | tr -d ' ')
OK=$(printf '%s\n' "$ROWS" | awk -F"$SEP" '$3=="OK"' | wc -l | tr -d ' ')
TOT=$(printf '%s\n' "$ROWS" | grep -c "$SEP")

if [ "$CRIT" -gt 0 ]; then OVERALL="CRITICAL"; RC=2
elif [ "$WARN" -gt 0 ]; then OVERALL="WARN"; RC=1
else OVERALL="OK"; RC=0; fi

# ───────────────────────── Saída ─────────────────────────
json() {
  printf '%s\n' "$ROWS" | awk -F"$SEP" -v ts="$NOW_UTC" -v ref="$STAGING_REF_EXPECTED" \
    -v ok="$OK" -v w="$WARN" -v c="$CRIT" -v u="$UNK" -v t="$TOT" -v ov="$OVERALL" '
    function esc(s) { gsub(/\\/, "\\\\", s); gsub(/"/, "\\\"", s); return s }
    BEGIN {
      printf "{\n  \"suite\": \"h8d-healthcheck\",\n  \"ambiente\": \"homologacao\",\n"
      printf "  \"project_ref\": \"%s\",\n  \"gerado_em_utc\": \"%s\",\n", ref, ts
      printf "  \"resumo\": {\"total\": %d, \"ok\": %d, \"warn\": %d, \"critical\": %d, \"unknown\": %d, \"status\": \"%s\"},\n", t, ok, w, c, u, ov
      printf "  \"sinais\": [\n"
    }
    NF >= 6 {
      if (n++) printf ",\n"
      printf "    {\"categoria\": \"%s\", \"sinal\": \"%s\", \"status\": \"%s\", \"medida\": \"%s\", \"limiar\": \"%s\", \"resposta\": \"%s\"}",
             esc($1), esc($2), esc($3), esc($4), esc($5), esc($6)
    }
    END { printf "\n  ]\n}\n" }'
}

if [ "$MODE" = "json" ]; then
  if [ -n "$OUT" ]; then json > "$OUT"; echo "H8-D: JSON sanitizado gravado em $OUT (status $OVERALL)"; else json; fi
else
  printf '%s\n' "$ROWS" | awk -F"$SEP" '{ printf "  [%-8s] %-22s %-34s %s\n", $3, $1, $2, $4 }'
  echo "  ─────────────────────────────────────────────"
  echo "  RESUMO: total=$TOT ok=$OK warn=$WARN critical=$CRIT unknown=$UNK → $OVERALL"
  [ -n "$OUT" ] && { json > "$OUT"; echo "  JSON sanitizado: $OUT"; }
fi

exit $RC
