#!/usr/bin/env bash
# FASE H7 — Guard duro de staging para qualquer script fiscal (apply/test/HML).
# Aborta se o alvo não for o staging autorizado ou se detectar a produção.
set -euo pipefail

STAGING_REF_EXPECTED="ikaauvsflpmamgxmkhoq"
PRODUCTION_REF_FORBIDDEN="navfzbwgwzruipouyfnk"

# FASE H7d — gate estatico de binding de frontend ANTES de qualquer acesso a banco.
"$(dirname "${BASH_SOURCE[0]}")/check-frontend-binding.sh"

: "${STAGING_DSN:?STAGING_DSN nao definido}"

# 1) Bloqueio por string do DSN (defesa 1).
if printf '%s' "$STAGING_DSN" | grep -q "$PRODUCTION_REF_FORBIDDEN"; then
  echo "H7 GUARD: ABORT — DSN aponta para a producao ($PRODUCTION_REF_FORBIDDEN)." >&2
  exit 2
fi

# 2) Bloqueio pelo marcador server-side (defesa 2, independente do DSN).
MARKER=$(psql "$STAGING_DSN" -tAc \
  "select project_ref||'|'||environment_label||'|'||production_emission_allowed::int
     from public.fiscal_environment_marker where id" 2>/dev/null || true)

if [ -z "$MARKER" ]; then
  echo "H7 GUARD: ABORT — marcador fiscal de ambiente ausente no banco." >&2
  exit 3
fi

REF="${MARKER%%|*}"
REST="${MARKER#*|}"
LABEL="${REST%%|*}"
PROD_ALLOWED="${REST##*|}"

if [ "$REF" != "$STAGING_REF_EXPECTED" ] || [ "$LABEL" != "STAGING" ] || [ "$PROD_ALLOWED" != "0" ]; then
  echo "H7 GUARD: ABORT — marcador invalido (ref=$REF label=$LABEL prod_allowed=$PROD_ALLOWED)." >&2
  exit 4
fi

# 3) Ambiente fiscal do emitente jamais pode estar em producao.
TPAMB=$(psql "$STAGING_DSN" -tAc \
  "select coalesce(nfe_environment_code,'') from public.company_fiscal_settings where is_active limit 1")
if [ "$TPAMB" = "1" ]; then
  echo "H7 GUARD: ABORT — emitente ativo com tpAmb=1 (producao)." >&2
  exit 5
fi

echo "H7 GUARD: OK — staging $REF, tpAmb='${TPAMB:-<vazio>}', producao fiscal desabilitada."
