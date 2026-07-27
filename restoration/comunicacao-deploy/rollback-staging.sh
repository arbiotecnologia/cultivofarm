#!/usr/bin/env bash
# rollback-staging.sh — desfaz Fase 4 e/ou Fase 2. Nunca toca Fase 1 nem dados
# de negócio.
#
# REGRAS CRÍTICAS:
# - Fase 4 é aditiva sobre Fase 2. Rollback de F2 com F4 ainda instalada
#   deixaria FKs órfãos e RPC quebrada. Este script RECUSA F2 se F4 presente,
#   a menos que o mesmo run também derrube F4 (ROLLBACK_COMMUNICATION_FASE4=true).
# - Rollback F4 e F2 são cada um transacionais via psql --single-transaction.
#   Os .sql são transaction-neutral (sem BEGIN/COMMIT internos).
set -Eeuo pipefail

HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd -- "${HERE}/../.." && pwd)"
F2="${ROOT}/restoration/comunicacao-fase2"
F4="${ROOT}/restoration/comunicacao-fase4"

log()  { printf '[rollback] %s\n' "$*"; }
fail() { printf '[rollback][ERRO] %s\n' "$*" >&2; exit 1; }

REQUIRE_DATABASE=true bash "${HERE}/validate-staging.sh"

# Detecta presença de QUALQUER artefato Fase 4 no banco (read-only, fail-closed).
# Consulta retorna 4 booleans "t"/"f" separados por "|" na ordem:
#   rpc | tabela receipts | coluna provider_delivery_status | índice unique parcial
# Qualquer erro de psql, saída vazia ou formato inesperado ABORTA o script.
# Retorna 0 se QUALQUER artefato existir (instalada/parcial); 1 se todos ausentes.
detect_fase4_installed() {
  local out rc
  set +e
  out="$(psql "${STAGING_DB_URL}" -Atc "
    SELECT
      (to_regprocedure('public.rpc_record_whatsapp_delivery_status(text,text,timestamptz,text)') IS NOT NULL)::text
      || '|' ||
      (EXISTS (
        SELECT 1 FROM information_schema.tables
         WHERE table_schema='public' AND table_name='comunicacao_provider_receipts'
      ))::text
      || '|' ||
      (EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema='public' AND table_name='comunicacao_outbox'
           AND column_name='provider_delivery_status'
      ))::text
      || '|' ||
      (EXISTS (
        SELECT 1 FROM pg_indexes
         WHERE schemaname='public' AND indexname='ix_comunicacao_outbox_wa_provider_msgid'
      ))::text;
  " 2>/dev/null)"
  rc=$?
  set -e
  if [[ ${rc} -ne 0 ]]; then
    fail "detect_fase4_installed: consulta psql falhou (detalhe suprimido para não vazar DSN)."
  fi
  if [[ ! "${out}" =~ ^[tf]\|[tf]\|[tf]\|[tf]$ ]]; then
    fail "detect_fase4_installed: saída inesperada da consulta (formato inválido)."
  fi
  [[ "${out}" == *t* ]]
}

FASE4_INSTALLED=false
if detect_fase4_installed; then
  FASE4_INSTALLED=true
  log "detect: Fase 4 INSTALADA no banco"
else
  log "detect: Fase 4 ausente no banco"
fi

# ── Fase 4 primeiro ────────────────────────────────────────────────────────
if [[ "${ROLLBACK_COMMUNICATION_FASE4:-false}" == "true" ]]; then
  log "step: fase4/rollback (atômico via --single-transaction)"
  if ! psql "${STAGING_DB_URL}" -v ON_ERROR_STOP=1 --single-transaction \
        -f "${F4}/rollback.sql" >/dev/null; then
    fail "rollback da Fase 4 falhou (log suprimido)."
  fi
  # Confirma ausência pós-rollback.
  if detect_fase4_installed; then
    fail "pós-rollback: artefatos Fase 4 ainda presentes."
  fi
  FASE4_INSTALLED=false
  log "ok:   fase4/rollback"
else
  log "skip: fase4/rollback (ROLLBACK_COMMUNICATION_FASE4 != true)"
fi

# ── Fase 2: guarda dura ────────────────────────────────────────────────────
if [[ "${ROLLBACK_COMMUNICATION:-false}" != "true" ]]; then
  log "skip: fase2/rollback (ROLLBACK_COMMUNICATION != true)"
  log "Fase 1 e dados de negócio permanecem intactos."
  exit 0
fi

if [[ "${FASE4_INSTALLED}" == "true" ]]; then
  fail "recusado: Fase 4 ainda instalada. Rode com ROLLBACK_COMMUNICATION_FASE4=true no MESMO run (preferido) ou execute o rollback da Fase 4 antes."
fi

log "step: fase2/rollback (atômico via --single-transaction)"
if ! psql "${STAGING_DB_URL}" -v ON_ERROR_STOP=1 --single-transaction \
      -f "${F2}/rollback.sql" >/dev/null; then
  fail "rollback da Fase 2 falhou (log suprimido)."
fi
log "ok:   fase2/rollback"
log "Fase 1 e dados de negócio permanecem intactos."
