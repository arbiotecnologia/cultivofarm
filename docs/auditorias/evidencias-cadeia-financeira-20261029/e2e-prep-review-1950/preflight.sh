#!/usr/bin/env bash
# READ-ONLY preflight. No DB/network writes, no secrets printed.
# Exit: 0 = GO (all PASS) | 2 = BLOCKED (pending evidence) | 1 = DENY (wrong/unknown target).
# Inputs (env): PREFLIGHT_MODE=PROD_READONLY|HOMOLOG_ISOLATED ; PREFLIGHT_TARGET_REF (ref the operator will use);
#   PREFLIGHT_TARGET_VERSION + PREFLIGHT_VERSION_EVIDENCE (file proving the published/preview version; never HEAD);
#   PREFLIGHT_OUTPUTS_OFF_EVIDENCE (file proving delivery flags OFF); HOMOLOG_APPROVED_REF_EVIDENCE (only for a non-default homolog ref).
set -u; ROOT="${PREFLIGHT_ROOT:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"; cd "$ROOT"
PROD=swzpzcwiasxmjutrmvkm; HOMOL=vrlcdwmlytukrjezrrnf
FORBIDDEN="yzszlzjpovmcteuxjznj chkgpuawcswhefiabwsm navfzbwgwzruipouyfnk ikaauvsflpmamgxmkhoq"
deny=0; blocked=0
P(){ echo "PASS $1"; }; D(){ echo "DENY $1"; deny=1; }; B(){ echo "BLOCKED $1"; blocked=1; }
MODE="${PREFLIGHT_MODE:-}"; REF="${PREFLIGHT_TARGET_REF:-}"
case "$MODE" in
  PROD_READONLY) [ "$REF" = "$PROD" ] && P "modo PROD_READONLY ref=$PROD" || D "PROD_READONLY exige ref $PROD (recebido '${REF:-vazio}')";;
  HOMOLOG_ISOLATED)
    if [ "$REF" = "$PROD" ]; then D "HOMOLOG_ISOLATED rejeita ref de produção"
    elif [ "$REF" = "$HOMOL" ]; then P "modo HOMOLOG_ISOLATED ref=$HOMOL"
    elif [ -n "$REF" ] && [ -s "${HOMOLOG_APPROVED_REF_EVIDENCE:-/nonexistent}" ] && grep -q "$REF" "$HOMOLOG_APPROVED_REF_EVIDENCE"; then P "homolog ref aprovado por evidência"
    else D "HOMOLOG_ISOLATED exige ref $HOMOL ou configuração aprovada (recebido '${REF:-vazio}')"; fi;;
  *) D "modo desconhecido/ausente ('${MODE:-vazio}')";;
esac
for r in $FORBIDDEN; do [ "$REF" = "$r" ] && D "ref proibido $r"; rg -q "$r" src supabase/config.toml --glob '!src/test/**' 2>/dev/null && D "ref proibido $r no código"; done
grep -q "$PROD" src/integrations/supabase/client.ts 2>/dev/null && P "cliente canônico do app = $PROD (o app; não o alvo)" || D "cliente canônico divergente"
rg -q "SERVICE_ROLE_KEY|cm9sZSI6InNlcnZpY2Vfcm9sZS" src --glob '!src/test/**' 2>/dev/null && D "chave service_role no frontend" || P "sem chave service_role no frontend"
ls supabase/migrations 2>/dev/null | rg -q '\.review$' && D ".review em migrations" || P "nenhum .review em migrations"
if [ -n "${PREFLIGHT_TARGET_VERSION:-}" ] && [ -s "${PREFLIGHT_VERSION_EVIDENCE:-/nonexistent}" ] && grep -q "$PREFLIGHT_TARGET_VERSION" "$PREFLIGHT_VERSION_EVIDENCE"; then P "versão alvo comprovada por evidência"
else B "versão alvo não comprovada (HEAD local não serve; não publicar nada)"; fi
if [ -s "${PREFLIGHT_OUTPUTS_OFF_EVIDENCE:-/nonexistent}" ] && [ "$(grep -cE '^(COMMUNICATION_DELIVERY_ENABLED|EMAIL_DELIVERY_ENABLED|WHATSAPP_DELIVERY_ENABLED|COMMUNICATION_INAPP_ADAPTER_ENABLED|WHATSAPP_WEBHOOK_ENABLED)=false$' "$PREFLIGHT_OUTPUTS_OFF_EVIDENCE")" = 5 ]; then P "5 saídas externas OFF comprovadas"
else B "saídas externas OFF não comprovadas"; fi
[ $deny = 1 ] && { echo "RESULT DENY"; exit 1; }; [ $blocked = 1 ] && { echo "RESULT BLOCKED"; exit 2; }; echo "RESULT GO"; exit 0
