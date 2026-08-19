#!/usr/bin/env bash
# FASE H7 — Teste D: idempotência e concorrência real (sessões paralelas).
# Prova que duas tentativas simultâneas da MESMA chave lógica geram um único
# evento fiscal, e que o retry pós-timeout não cria segundo registro.
set -euo pipefail
cd "$(dirname "$0")/../.."

./restoration/homologacao-h7/guard-staging.sh >/dev/null

KEY="h7-conc-$(date +%s)"
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT

# Massa mínima: documento fiscal em rascunho, removido ao final.
INV=$(psql "$STAGING_DSN" -tAc "
  INSERT INTO public.fiscal_invoices (invoice_type, status, total_amount, created_by)
  SELECT 'NFE','DRAFT',0, (SELECT id FROM auth.users ORDER BY created_at LIMIT 1)
  RETURNING id;" | head -1)

cleanup() {
  psql "$STAGING_DSN" -q -c "ALTER TABLE public.fiscal_events DISABLE TRIGGER trg_h7_fiscal_events_append_only;" >/dev/null 2>&1 || true
  psql "$STAGING_DSN" -q -c "DELETE FROM public.fiscal_events WHERE fiscal_invoice_id='$INV';" >/dev/null 2>&1 || true
  psql "$STAGING_DSN" -q -c "ALTER TABLE public.fiscal_events ENABLE TRIGGER trg_h7_fiscal_events_append_only;" >/dev/null 2>&1 || true
  psql "$STAGING_DSN" -q -c "DELETE FROM public.fiscal_invoices WHERE id='$INV';" >/dev/null 2>&1 || true
  rm -rf "$TMP"
}
trap cleanup EXIT

insert_attempt() {
  psql "$STAGING_DSN" -tAc "
    INSERT INTO public.fiscal_events (fiscal_invoice_id, event_type, event_source, idempotency_key)
    VALUES ('$INV','MANUAL_UPDATED','USER','$KEY')
    ON CONFLICT (fiscal_invoice_id, event_type, idempotency_key) DO NOTHING;" >"$1" 2>&1 || true
}

# D1: duas tentativas simultâneas da mesma chave lógica.
insert_attempt "$TMP/a.log" & insert_attempt "$TMP/b.log" &
wait

# D2: retry sequencial após "timeout".
insert_attempt "$TMP/c.log"

N=$(psql "$STAGING_DSN" -tAc "SELECT count(*) FROM public.fiscal_events WHERE fiscal_invoice_id='$INV' AND idempotency_key='$KEY';")

FAIL=0
cat "$TMP"/*.log 1>&2
if [ "$N" = "1" ]; then echo "D1/D2 PASS — 3 tentativas (2 simultaneas + 1 retry) => $N evento";
else echo "D1/D2 FAIL — esperado 1 evento, obtido $N"; FAIL=1; fi

# D3: reserva de numeração — propriedades transacionais exigidas.
PROPS=$(psql "$STAGING_DSN" -tAc "
  SELECT (position('FOR UPDATE' in prosrc)>0)::int::text
       ||(position('pg_advisory' in prosrc)>0)::int::text
       ||(position('idempotency_key' in prosrc)>0)::int::text
       ||(position('assert_environment_homologation' in prosrc)>0)::int::text
    FROM pg_proc WHERE proname='rpc_fiscal_reserve_nfe_number_v1';")
if [ "$PROPS" = "1111" ]; then echo "D3 PASS — reserva com FOR UPDATE + advisory lock + idempotencia + gate";
else echo "D3 FAIL — propriedades da reserva: $PROPS"; FAIL=1; fi

# D4: unicidade de documento ativo por origem preservada.
if psql "$STAGING_DSN" -tAc "SELECT indexdef FROM pg_indexes WHERE indexname='ux_fiscal_invoice_scope_nfe';" | grep -q "UNIQUE"; then
  echo "D4 PASS — indice unico de documento ativo por origem presente"
else echo "D4 FAIL — indice de unicidade por origem ausente"; FAIL=1; fi

if [ "$FAIL" -ne 0 ]; then echo "H7 CONCORRENCIA: FAIL"; exit 1; fi
echo "H7 CONCORRENCIA: OK (4/4)"
