#!/usr/bin/env bash
# FASE H7d — Gate fail-closed de binding de frontend (estático, SEM acesso a banco).
# Falha se .env, client.ts, config.toml ou types.ts nao corresponderem ao staging
# autorizado, ou se houver binding ativo para sandbox/producao.
#
# Nunca imprime chaves, DSN, tokens ou segredos.
set -euo pipefail

STAGING_REF_EXPECTED="${STAGING_REF_EXPECTED:-ikaauvsflpmamgxmkhoq}"
PRODUCTION_REF_FORBIDDEN="navfzbwgwzruipouyfnk"
SANDBOX_REF_FORBIDDEN="yzszlzjpovmcteuxjznj"

ROOT="${BINDING_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"

fail() { echo "H7d BINDING GATE: ABORT — $*" >&2; exit 10; }

ENV_FILE="$ROOT/.env"
CLIENT_FILE="$ROOT/src/integrations/supabase/client.ts"
TYPES_FILE="$ROOT/src/integrations/supabase/types.ts"
TOML_FILE="$ROOT/supabase/config.toml"

for f in "$ENV_FILE" "$CLIENT_FILE" "$TYPES_FILE" "$TOML_FILE"; do
  [ -f "$f" ] || fail "arquivo de binding ausente: ${f#$ROOT/}"
done

env_value() {
  sed -n "s/^$1[[:space:]]*=[[:space:]]*//p" "$ENV_FILE" | tail -n1 | tr -d '"'"'"'' | tr -d '\r'
}

ENV_REF="$(env_value VITE_SUPABASE_PROJECT_ID)"
ENV_URL="$(env_value VITE_SUPABASE_URL)"

[ "$ENV_REF" = "$STAGING_REF_EXPECTED" ] || \
  fail ".env VITE_SUPABASE_PROJECT_ID='${ENV_REF:-<vazio>}' != staging esperado ($STAGING_REF_EXPECTED)."
[ "$ENV_URL" = "https://${STAGING_REF_EXPECTED}.supabase.co" ] || \
  fail ".env VITE_SUPABASE_URL nao aponta para o staging esperado."

grep -q "https://${STAGING_REF_EXPECTED}.supabase.co" "$CLIENT_FILE" || \
  fail "client.ts nao aponta para o staging esperado."

grep -Eq "^project_id[[:space:]]*=[[:space:]]*\"${STAGING_REF_EXPECTED}\"" "$TOML_FILE" || \
  fail "supabase/config.toml nao aponta para o staging esperado."

# Nenhum ref proibido pode aparecer nos arquivos de binding ativo.
for f in "$ENV_FILE" "$CLIENT_FILE" "$TOML_FILE"; do
  for bad in "$PRODUCTION_REF_FORBIDDEN" "$SANDBOX_REF_FORBIDDEN"; do
    if grep -q "$bad" "$f"; then
      fail "${f#$ROOT/} contem binding proibido ($bad)."
    fi
  done
done

# Contrato de schema do types.ts (marcadores estaveis, nao apenas tamanho).
REQUIRED_RELATIONS="microrganismos microorganism_fiscal_profiles microorganism_regulatory_dossiers fiscal_matrix_load_ledger company_fiscal_settings fiscal_environment_marker ordens_servico notificacoes_operacionais user_roles"
MISSING=""
for rel in $REQUIRED_RELATIONS; do
  grep -q "      ${rel}: {" "$TYPES_FILE" || MISSING="$MISSING $rel"
done
[ -z "$MISSING" ] || fail "types.ts incompativel com o schema de staging; relacoes ausentes:$MISSING"

echo "H7d BINDING GATE: OK — staging $STAGING_REF_EXPECTED (.env, client.ts, config.toml, types.ts consistentes)."
