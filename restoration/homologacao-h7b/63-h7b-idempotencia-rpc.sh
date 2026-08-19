#!/usr/bin/env bash
# FASE H7b — Teste real da RPC canônica public.rpc_fiscal_event_manual.
# Diferente do 62 (que inseria direto na tabela), aqui TODA a evidência vem de
# chamadas à RPC sob contexto autenticado autorizado (role authenticated +
# request.jwt.claims), inclusive em duas sessões paralelas.
#
# A) sem chave                       => FISCAL_IDEMPOTENCY_REQUIRED
# B) 2 chamadas simultâneas iguais    => mesmo event_id, 1 evento
# C) retry sequencial igual           => mesmo event_id
# D) mesma chave, payload diferente   => FISCAL_IDEMPOTENCY_CONFLICT, 1 evento
# E) chave diferente                  => evento distinto
set -euo pipefail
cd "$(dirname "$0")/../.."

./restoration/homologacao-h7/guard-staging.sh >/dev/null

TMP=$(mktemp -d)
KEY="h7b-$(date +%s)-A"
KEY2="h7b-$(date +%s)-B"

ACTOR=$(psql "$STAGING_DSN" -tAc \
  "select user_id from public.user_roles where role='administrador' limit 1")
[ -n "$ACTOR" ] || { echo "H7b: sem usuario administrador no staging"; exit 2; }

INV=$(psql "$STAGING_DSN" -tAc "
  INSERT INTO public.fiscal_invoices (invoice_type, status, total_amount, created_by, notes)
  VALUES ('NFE','DRAFT',0,'$ACTOR','H7B-HARNESS-RPC')
  RETURNING id;" | head -1)

cleanup() {
  psql "$STAGING_DSN" -q -c "ALTER TABLE public.fiscal_events DISABLE TRIGGER trg_h7_fiscal_events_append_only;" >/dev/null 2>&1 || true
  psql "$STAGING_DSN" -q -c "DELETE FROM public.fiscal_events WHERE fiscal_invoice_id='$INV';" >/dev/null 2>&1 || true
  psql "$STAGING_DSN" -q -c "ALTER TABLE public.fiscal_events ENABLE TRIGGER trg_h7_fiscal_events_append_only;" >/dev/null 2>&1 || true
  psql "$STAGING_DSN" -q -c "DELETE FROM public.fiscal_invoices WHERE id='$INV' AND notes='H7B-HARNESS-RPC';" >/dev/null 2>&1 || true
  # rede de segurança: nenhum residuo do harness pode sobreviver
  psql "$STAGING_DSN" -q -c "DELETE FROM public.fiscal_invoices WHERE notes='H7B-HARNESS-RPC';" >/dev/null 2>&1 || true
  rm -rf "$TMP"
}
trap cleanup EXIT INT TERM

# Executa a RPC como usuário autenticado autorizado.
rpc() { # $1=notes|NULL  $2=key|NULL  $3=outfile
  local notes="$1" key="$2" out="$3"
  local n k
  if [ "$notes" = "NULL" ]; then n="NULL"; else n="'$notes'"; fi
  if [ "$key" = "NULL" ]; then k="NULL"; else k="'$key'"; fi
  psql "$STAGING_DSN" -tAc "
    begin;
    select set_config('request.jwt.claims', '{\"sub\":\"$ACTOR\",\"role\":\"authenticated\"}', true);
    set local role authenticated;
    select public.rpc_fiscal_event_manual('$INV','MANUAL_UPDATED',$n,$k);
    commit;" >"$out" 2>&1 || true
}

count() {
  psql "$STAGING_DSN" -tAc "select count(*) from public.fiscal_events where fiscal_invoice_id='$INV';"
}
last_uuid() { grep -Eo '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' "$1" | tail -1; }

FAIL=0
chk() { if [ "$1" = "ok" ]; then echo "$2 PASS — $3"; else echo "$2 FAIL — $3"; FAIL=1; fi; }

# A) sem chave => rejeitado
rpc "sem chave" NULL "$TMP/a.log"
if grep -q "FISCAL_IDEMPOTENCY_REQUIRED" "$TMP/a.log" && [ "$(count)" = "0" ]; then
  chk ok "A" "chamada sem idempotency_key rejeitada, 0 eventos"
else chk no "A" "esperado FISCAL_IDEMPOTENCY_REQUIRED; obtido: $(tr -d '\n' <"$TMP/a.log")"; fi

# B) duas sessões paralelas, mesma chave e mesmo payload
rpc "payload-1" "$KEY" "$TMP/b1.log" & rpc "payload-1" "$KEY" "$TMP/b2.log" &
wait
B1=$(last_uuid "$TMP/b1.log"); B2=$(last_uuid "$TMP/b2.log")
if [ -n "$B1" ] && [ "$B1" = "$B2" ] && [ "$(count)" = "1" ]; then
  chk ok "B" "2 sessoes simultaneas => mesmo event_id ($B1), 1 evento"
else chk no "B" "b1=$B1 b2=$B2 eventos=$(count)"; fi

# C) retry sequencial idêntico
rpc "payload-1" "$KEY" "$TMP/c.log"
C=$(last_uuid "$TMP/c.log")
if [ "$C" = "$B1" ] && [ "$(count)" = "1" ]; then
  chk ok "C" "retry sequencial => mesmo event_id, 1 evento"
else chk no "C" "c=$C esperado=$B1 eventos=$(count)"; fi

# D) mesma chave, payload materialmente diferente
rpc "payload-2-DIFERENTE" "$KEY" "$TMP/d.log"
if grep -q "FISCAL_IDEMPOTENCY_CONFLICT" "$TMP/d.log" && [ "$(count)" = "1" ]; then
  chk ok "D" "payload divergente na mesma chave => FISCAL_IDEMPOTENCY_CONFLICT, 1 evento"
else chk no "D" "esperado conflito; obtido: $(tr -d '\n' <"$TMP/d.log") eventos=$(count)"; fi

# E) chave diferente => novo evento
rpc "payload-3" "$KEY2" "$TMP/e.log"
E=$(last_uuid "$TMP/e.log")
if [ -n "$E" ] && [ "$E" != "$B1" ] && [ "$(count)" = "2" ]; then
  chk ok "E" "chave distinta => evento distinto ($E), 2 eventos"
else chk no "E" "e=$E eventos=$(count)"; fi

if [ "$FAIL" -ne 0 ]; then echo "H7B IDEMPOTENCIA RPC: FAIL"; exit 1; fi
echo "H7B IDEMPOTENCIA RPC: OK (5/5)"
