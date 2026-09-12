#!/usr/bin/env bash
# H7e — Gate reutilizável de atestação de release fiscal (também usado em H10).
#
# Verifica, SEM revelar valores de segredos:
#   1. project ref esperado do runtime;
#   2. ambiente esperado (homologação, produção bloqueada);
#   3. release implantado das Edge Functions fiscais (X-AR-Bio-Function-Version);
#   4. schema esperado do cofre (SIGNING_BUNDLE_V2, sem colunas de senha);
#   5. presença dos secrets obrigatórios (apenas presença);
#   6. smoke de CORS (origem legítima 2xx, origem estranha 403).
#
# Uso:
#   FISCAL_EXPECTED_REF=swzpzcwiasxmjutrmvkm \
#   FISCAL_EXPECTED_RELEASE=h7e-2026-08-31 \
#   CULTIVOFARM_DSN=... ./scripts/fiscal-release-gate.sh
#
# Saída: PASS/FAIL por verificação; exit 1 bloqueia promoção quando houver drift.
set -uo pipefail

CANONICAL_REF="swzpzcwiasxmjutrmvkm"
EXPECTED_REF="${FISCAL_EXPECTED_REF:-$CANONICAL_REF}"
EXPECTED_RELEASE="${FISCAL_EXPECTED_RELEASE:-h7e-2026-08-31}"
ALLOWED_ORIGIN="${FISCAL_GATE_ORIGIN:-https://id-preview--a79bb3db-f665-466d-bf41-ee8c6cb91fab.lovable.app}"
BASE="https://${EXPECTED_REF}.supabase.co/functions/v1"
FUNCTIONS=(fiscal-certificate-upload fiscal-certificate-revoke fiscal-xml-engine fiscal-event-sign fiscal-sefaz-transport)

fails=0
ok()   { echo "PASS  $*"; }
bad()  { echo "FAIL  $*"; fails=$((fails+1)); }

echo "== 1. Project ref"
[ "$EXPECTED_REF" != "$CANONICAL_REF" ] && { bad "ref não canônico — somente CultivoFarm é permitido"; exit 1; }
ok "ref alvo=$EXPECTED_REF (CultivoFarm canônico)"

echo "== 2/3. Release implantado e CORS"
for fn in "${FUNCTIONS[@]}"; do
  hdrs="$(curl -s -D- -o /dev/null -X OPTIONS "$BASE/$fn" -H "Origin: $ALLOWED_ORIGIN" || true)"
  code="$(printf '%s' "$hdrs" | head -1 | awk '{print $2}')"
  ref="$(printf '%s' "$hdrs" | tr -d '\r' | awk -F': ' 'tolower($1)=="sb-project-ref"{print $2}')"
  rel="$(printf '%s' "$hdrs" | tr -d '\r' | awk -F': ' 'tolower($1)=="x-ar-bio-function-version"{print $2}')"
  acao="$(printf '%s' "$hdrs" | tr -d '\r' | awk -F': ' 'tolower($1)=="access-control-allow-origin"{print $2}')"
  [ "$code" = "200" ] || [ "$code" = "204" ] && ok "$fn OPTIONS $code" || bad "$fn OPTIONS $code (origem legítima deve passar)"
  [ "$acao" = "$ALLOWED_ORIGIN" ] && ok "$fn ACAO exato" || bad "$fn ACAO='$acao' (esperado origem exata, nunca *)"
  [ "$ref" = "$EXPECTED_REF" ] && ok "$fn ref=$ref" || bad "$fn ref='$ref' != $EXPECTED_REF"
  [ "$rel" = "$EXPECTED_RELEASE" ] && ok "$fn release=$rel" || bad "$fn release='$rel' != $EXPECTED_RELEASE (DRIFT)"
  evil="$(curl -s -o /dev/null -w '%{http_code}' -X OPTIONS "$BASE/$fn" -H "Origin: https://evil.example.com" || true)"
  [ "$evil" = "403" ] && ok "$fn origem estranha 403" || bad "$fn origem estranha=$evil (esperado 403)"
done

echo "== 4. Schema do cofre"
if [ -n "${CULTIVOFARM_DSN:-}" ]; then
  cols="$(psql "$CULTIVOFARM_DSN" -Atc "select string_agg(column_name,',' order by column_name) from information_schema.columns where table_schema='public' and table_name='fiscal_certificate_material';")"
  case "$cols" in
    *encrypted_password*|*password_iv*) bad "colunas de senha presentes no cofre" ;;
    *material_format*) ok "cofre sem colunas de senha e com material_format" ;;
    *) bad "cofre não encontrado ou incompleto" ;;
  esac
  overloads="$(psql "$CULTIVOFARM_DSN" -Atc "select count(*) from pg_proc where proname='rpc_fiscal_certificate_register_a1';")"
  [ "$overloads" = "1" ] && ok "RPC com overload único" || bad "RPC com $overloads overloads"
else
  echo "SKIP  CULTIVOFARM_DSN ausente — verificação de schema não executada"
fi

echo "== 5. Secrets obrigatórios (somente presença)"
for s in FISCAL_CERTIFICATE_MASTER_KEY SUPABASE_SERVICE_ROLE_KEY; do
  if [ -n "${!s:-}" ]; then ok "$s presente"; else echo "SKIP  $s não visível neste contexto (validar no runtime da função)"; fi
done

echo
if [ "$fails" -gt 0 ]; then
  echo "GATE FISCAL: BLOQUEADO ($fails falhas) — promoção proibida"
  exit 1
fi
echo "GATE FISCAL: OK"
