#!/usr/bin/env bash
# =====================================================================
# FASE H9-F1 — Gate fail-closed de ambiente (estático, SEM acesso a banco).
#
# Motivação: durante H9-E1/E1R/E2 o `.env` e o `types.ts` foram reescritos
# pela plataforma apontando para o sandbox Lovable Cloud. O drift é tratado
# aqui como risco operacional recorrente, com gate executável.
#
# Reprova quando:
#   1. `.env`, `client.ts` ou `supabase/config.toml` não apontam para o
#      staging autorizado ikaauvsflpmamgxmkhoq;
#   2. `types.ts` está com o contrato reduzido (stub do sandbox);
#   3. qualquer arquivo ATIVO de runtime referencia sandbox/produção fora de
#      uma declaração explícita de bloqueio.
#
# Escopo de "arquivo ativo de runtime": src/** (exceto src/test/**) e
# supabase/functions/**. Documentação, restoration/, scripts de auditoria,
# migrations históricas e testes de guarda ficam fora — ali as refs proibidas
# existem justamente para bloquear.
#
# Nunca imprime chaves, DSN, tokens ou segredos. Project refs são públicos.
# =====================================================================
set -euo pipefail

STAGING_REF="${STAGING_REF_EXPECTED:-ikaauvsflpmamgxmkhoq}"
PROD_REF="navfzbwgwzruipouyfnk"
SANDBOX_REF="yzszlzjpovmcteuxjznj"

ROOT="${BINDING_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)}"
cd "$ROOT"

fail() { echo "H9F BINDING GATE: ABORT — $*" >&2; exit 10; }

for f in .env src/integrations/supabase/client.ts src/integrations/supabase/types.ts supabase/config.toml; do
  [ -f "$f" ] || fail "arquivo de binding ausente: $f"
done

env_value() {
  sed -n "s/^$1[[:space:]]*=[[:space:]]*//p" .env | tail -n1 | tr -d '"'"'"'' | tr -d '\r'
}

[ "$(env_value VITE_SUPABASE_PROJECT_ID)" = "$STAGING_REF" ] || \
  fail ".env VITE_SUPABASE_PROJECT_ID nao aponta para o staging autorizado."
[ "$(env_value VITE_SUPABASE_URL)" = "https://${STAGING_REF}.supabase.co" ] || \
  fail ".env VITE_SUPABASE_URL nao aponta para o staging autorizado."

grep -q "https://${STAGING_REF}.supabase.co" src/integrations/supabase/client.ts || \
  fail "client.ts nao aponta para o staging autorizado."
grep -Eq "^project_id[[:space:]]*=[[:space:]]*\"${STAGING_REF}\"" supabase/config.toml || \
  fail "supabase/config.toml nao aponta para o staging autorizado."

for f in .env src/integrations/supabase/client.ts supabase/config.toml src/integrations/supabase/types.ts; do
  for bad in "$PROD_REF" "$SANDBOX_REF"; do
    grep -q "$bad" "$f" && fail "$f contem binding proibido."
  done
done

# types.ts precisa ser o contrato real do staging, nao o stub do sandbox.
TYPES_LINES="$(wc -l < src/integrations/supabase/types.ts)"
[ "$TYPES_LINES" -ge 5000 ] || \
  fail "types.ts com $TYPES_LINES linhas — contrato reduzido (stub de outro backend)."
for rel in registros_consultor visitas_checkin visitas_logs solicitacoes_timeline user_roles ordens_servico; do
  grep -q "      ${rel}: {" src/integrations/supabase/types.ts || \
    fail "types.ts sem a relacao '$rel' — contrato incompativel com o staging."
done

# Refs proibidas em runtime, exceto declaracoes explicitas de bloqueio.
ALLOW_DECL='FORBIDDEN|PROIBID|BLOQUEAD|blocked|forbidden'
OFFENDERS="$(
  { rg -n "$PROD_REF|$SANDBOX_REF" src --glob '!src/test/**' || true
    rg -n "$PROD_REF|$SANDBOX_REF" supabase/functions || true
  } | grep -Ev "$ALLOW_DECL" || true
)"
[ -z "$OFFENDERS" ] || {
  echo "$OFFENDERS" >&2
  fail "referencia ativa a sandbox/producao fora de declaracao de bloqueio."
}

# DSN, quando presente no ambiente, tem de ser o staging (valor nunca impresso).
if [ -n "${STAGING_DSN:-}" ]; then
  case "$STAGING_DSN" in
    *"$PROD_REF"*|*"$SANDBOX_REF"*) fail "STAGING_DSN aponta para ambiente proibido.";;
    *"$STAGING_REF"*) :;;
    *) fail "STAGING_DSN nao aponta para o staging autorizado.";;
  esac
fi

echo "H9F BINDING GATE: OK — staging $STAGING_REF (.env, client.ts, config.toml, types.ts, runtime)."
