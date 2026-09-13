#!/usr/bin/env bash
# FASE H7d — Gate fail-closed de binding de frontend (estático, SEM acesso a banco).
# Falha se .env, client.ts ou config.toml nao corresponderem ao projeto
# CultivoFarm autorizado, ou se houver binding ativo para sandbox/producao anterior.
#
# Nunca imprime chaves, DSN, tokens ou segredos.
set -euo pipefail

CULTIVOFARM_REF_EXPECTED="${CULTIVOFARM_REF_EXPECTED:-swzpzcwiasxmjutrmvkm}"
LEGACY_STAGING_REF_FORBIDDEN="ikaauvsflpmamgxmkhoq"
PRODUCTION_REF_FORBIDDEN="navfzbwgwzruipouyfnk"
SANDBOX_REF_FORBIDDEN="yzszlzjpovmcteuxjznj"

ROOT="${BINDING_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"

fail() { echo "H7d BINDING GATE: ABORT — $*" >&2; exit 10; }

ENV_FILE="$ROOT/.env"
CLIENT_FILE="$ROOT/src/integrations/supabase/client.ts"
TOML_FILE="$ROOT/supabase/config.toml"

for f in "$CLIENT_FILE" "$TOML_FILE"; do
  [ -f "$f" ] || fail "arquivo de binding ausente: ${f#$ROOT/}"
done

# .env foi removido do projeto: o runtime usa exclusivamente as constantes
# literais de client.ts. Se a plataforma regerar o arquivo, ele volta a ser
# validado fail-closed.

env_value() {
  sed -n "s/^$1[[:space:]]*=[[:space:]]*//p" "$ENV_FILE" | tail -n1 | tr -d '"'"'"'' | tr -d '\r'
}

if [ -f "$ENV_FILE" ]; then
  ENV_REF="$(env_value VITE_SUPABASE_PROJECT_ID)"
  ENV_URL="$(env_value VITE_SUPABASE_URL)"

  [ "$ENV_REF" = "$CULTIVOFARM_REF_EXPECTED" ] || \
    fail ".env VITE_SUPABASE_PROJECT_ID='${ENV_REF:-<vazio>}' != CultivoFarm esperado ($CULTIVOFARM_REF_EXPECTED)."
  [ "$ENV_URL" = "https://${CULTIVOFARM_REF_EXPECTED}.supabase.co" ] || \
    fail ".env VITE_SUPABASE_URL nao aponta para o CultivoFarm esperado."
fi

grep -q "https://${CULTIVOFARM_REF_EXPECTED}.supabase.co" "$CLIENT_FILE" || \
  fail "client.ts nao aponta para o CultivoFarm esperado."

grep -Eq "^project_id[[:space:]]*=[[:space:]]*\"${CULTIVOFARM_REF_EXPECTED}\"" "$TOML_FILE" || \
  fail "supabase/config.toml nao aponta para o CultivoFarm esperado."

# Nenhum ref proibido pode aparecer nos arquivos de binding ativo.
for f in "$CLIENT_FILE" "$TOML_FILE" "$ENV_FILE"; do
  [ -f "$f" ] || continue
  for bad in "$LEGACY_STAGING_REF_FORBIDDEN" "$PRODUCTION_REF_FORBIDDEN" "$SANDBOX_REF_FORBIDDEN"; do
    if grep -q "$bad" "$f"; then
      fail "${f#$ROOT/} contem binding proibido ($bad)."
    fi
  done
done

echo "H7d BINDING GATE: OK — CultivoFarm $CULTIVOFARM_REF_EXPECTED (client.ts e config.toml consistentes; .env ausente ou consistente)."
