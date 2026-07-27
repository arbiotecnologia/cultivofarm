#!/usr/bin/env bash
# verify-staging.sh — repete postchecks/harness e verifica flags OFF.
# Verificação autenticada só se STAGING_TEST_USER_* estiverem definidos.
set -Eeuo pipefail

HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd -- "${HERE}/../.." && pwd)"
F1="${ROOT}/restoration/comunicacao-fase1"
F2="${ROOT}/restoration/comunicacao-fase2"

log()  { printf '[verify] %s\n' "$*"; }
fail() { printf '[verify][ERRO] %s\n' "$*" >&2; exit 1; }
run()  {
  local label="$1"; shift
  log "step: ${label}"
  if ! psql "${STAGING_DB_URL}" -v ON_ERROR_STOP=1 --single-transaction -f "$1" >/dev/null; then
    fail "step falhou: ${label} (log suprimido)."
  fi
  log "ok:   ${label}"
}

bash "${HERE}/validate-staging.sh"

run "fase1/postcheck" "${F1}/postcheck.sql"
run "fase2/postcheck" "${F2}/postcheck.sql"
run "fase2/harness"   "${F2}/harness-rls.sql"

# Flags OFF — leitura direta na tabela public.feature_flags (se existente).
log "step: flags OFF"
if ! psql "${STAGING_DB_URL}" -v ON_ERROR_STOP=1 -Atqc "
  do \$\$
  begin
    if to_regclass('public.feature_flags') is null then
      raise notice 'feature_flags ausente — SKIP';
      return;
    end if;
    if exists (
      select 1 from public.feature_flags
      where key like 'comunicacao_%' and enabled is true
    ) then
      raise exception 'flags de comunicação ativas em STAGING (esperado OFF).';
    end if;
    raise notice 'flags de comunicação OFF ok';
  end \$\$;
" >/dev/null; then
  fail "verificação de flags falhou."
fi
log "ok:   flags OFF"

# Verificação autenticada opcional
if [[ -n "${STAGING_TEST_USER_EMAIL:-}" && -n "${STAGING_TEST_USER_PASSWORD:-}" ]]; then
  log "step: check autenticado (placeholder) — executado por harness manual"
  log "ok:   credenciais presentes; siga checklist-manual.md item 'flags OFF'"
else
  log "SKIP: verificação autenticada (STAGING_TEST_USER_* ausentes)"
fi

log "verify concluído."
