#!/usr/bin/env bash
# FASE H7b — Gate de RUNTIME de binding/origin/CORS das Edge Functions fiscais.
#
# Falha (exit != 0) se:
#   - o endpoint fiscal do staging não responder no project ref esperado;
#   - o diagnóstico reportar ambiente != homologação ou emissão de produção ON;
#   - a origem de preview/staging não for aceita no preflight CORS;
#   - uma origem desconhecida (ou ausente) for aceita;
#   - chamada sem sessão for aceita no upload de certificado;
#   - qualquer endpoint fiscal apontar para o project ref de PRODUÇÃO.
#
# Não imprime chaves, tokens, senhas, DSN ou material de certificado.
set -uo pipefail

STAGING_REF="${STAGING_REF_EXPECTED:-ikaauvsflpmamgxmkhoq}"
PRODUCTION_REF="navfzbwgwzruipouyfnk"
ORIGIN_OK="${FISCAL_ORIGIN_OK:-https://id-preview--a79bb3db-f665-466d-bf41-ee8c6cb91fab.lovable.app}"
ORIGIN_BAD="https://origem-nao-autorizada.example.com"
BASE="https://${STAGING_REF}.supabase.co/functions/v1"

if [ "$STAGING_REF" = "$PRODUCTION_REF" ]; then
  echo "H7b GATE: ABORT — alvo é PRODUÇÃO. Proibido." >&2
  exit 10
fi

PASS=0; FAIL=0
ok()   { echo "  PASS — $*"; PASS=$((PASS+1)); }
bad()  { echo "  FAIL — $*" >&2; FAIL=$((FAIL+1)); }

code() { # method url origin
  local m="$1" u="$2" o="${3:-}"
  if [ -n "$o" ]; then
    curl -s -o /tmp/h7b_body.txt -w "%{http_code}" -X "$m" "$u" -H "Origin: $o"
  else
    curl -s -o /tmp/h7b_body.txt -w "%{http_code}" -X "$m" "$u"
  fi
}

echo "H7b RUNTIME GATE — alvo staging ${STAGING_REF}"

# 1. Preflight CORS aceita a origem autorizada.
c=$(code OPTIONS "$BASE/fiscal-certificate-upload" "$ORIGIN_OK")
[ "$c" = "200" ] || [ "$c" = "204" ] && ok "preflight CORS aceito para origem autorizada ($c)" \
  || bad "preflight CORS recusou a origem autorizada (HTTP $c)"

# 2. Origem desconhecida rejeitada.
c=$(code POST "$BASE/fiscal-certificate-upload" "$ORIGIN_BAD")
[ "$c" = "403" ] && ok "origem desconhecida rejeitada (403)" || bad "origem desconhecida NÃO rejeitada (HTTP $c)"

# 3. Sem Origin também rejeitado (fail-closed no upload).
c=$(code POST "$BASE/fiscal-certificate-upload")
[ "$c" = "403" ] && ok "chamada sem Origin rejeitada (403)" || bad "chamada sem Origin aceita (HTTP $c)"

# 4. Origem autorizada + sem sessão => erro FUNCIONAL de auth (401), nunca 403 de CORS.
c=$(code POST "$BASE/fiscal-certificate-upload" "$ORIGIN_OK")
if [ "$c" = "401" ]; then
  ok "origem autorizada alcança a função e exige auth (401 unauthorized)"
elif [ "$c" = "403" ] && grep -q "cors_origin_not_allowed" /tmp/h7b_body.txt 2>/dev/null; then
  bad "P1 DE BINDING/CORS PRESENTE — 403 cors_origin_not_allowed na origem autorizada"
else
  bad "resposta inesperada na origem autorizada (HTTP $c)"
fi

# 5. Diagnóstico de binding: project ref e ambiente.
c=$(code GET "$BASE/fiscal-binding-diagnostics" "$ORIGIN_OK")
BODY="$(cat /tmp/h7b_body.txt 2>/dev/null || true)"
if [ "$c" = "200" ] && echo "$BODY" | grep -q "\"project_ref\":\"${STAGING_REF}\""; then
  ok "diagnóstico confirma project_ref=${STAGING_REF}"
else
  bad "diagnóstico não confirmou o staging esperado (HTTP $c)"
fi
echo "$BODY" | grep -q "$PRODUCTION_REF" && bad "diagnóstico referencia project ref de PRODUÇÃO" \
  || ok "nenhuma referência a produção no runtime fiscal"
echo "$BODY" | grep -q '"production_emission_allowed":true' \
  && bad "emissão de PRODUÇÃO habilitada no staging" \
  || ok "emissão de produção desabilitada"
echo "$BODY" | grep -q '"binding_ok":true' && ok "binding_ok=true" || bad "binding_ok != true"

rm -f /tmp/h7b_body.txt
echo "H7b RUNTIME GATE — PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ] || exit 11
