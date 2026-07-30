-- HARNESS DE LIMPEZA — provas runtime do gate da Fase 1 (Motor B2B)
-- NÃO pertence à cadeia de migrations e NÃO pode ser promovido para produção.
-- Origem: procedimento executado durante a prova runtime no staging em 2026-07-30.
--
-- Uso (somente staging), informando o pedido de teste por parâmetro:
--   psql -v gate_order_id="'00000000-0000-0000-0000-000000000000'" \
--        -f scripts/tests/harness/gate-runtime-cleanup.sql
--
-- Guarda de ambiente obrigatória: aborta fora do staging ikaauvsflpmamgxmkhoq.

DO $g$
DECLARE v text;
BEGIN
  SELECT project_ref INTO v FROM public._fiscal_staging_marker WHERE marker = 'STAGING' LIMIT 1;
  IF v IS DISTINCT FROM 'ikaauvsflpmamgxmkhoq' THEN
    RAISE EXCEPTION 'HARNESS_GUARD: somente staging ikaauvsflpmamgxmkhoq';
  END IF;
END $g$;

\if :{?gate_order_id}
\else
  \echo 'ERRO: informe -v gate_order_id=''<uuid>'''
  \quit
\endif

BEGIN;

DELETE FROM public.partner_order_idempotency
 WHERE idempotency_key LIKE 'GATE-RUNTIME-%';

DELETE FROM public.partner_order_payment_schedule
 WHERE partner_order_id = (:gate_order_id)::uuid;

UPDATE public.partner_orders
   SET payment_terms_id = NULL
 WHERE id = (:gate_order_id)::uuid
   AND observacoes LIKE 'GATE-RUNTIME%';

DELETE FROM public.partner_order_payment_terms
 WHERE partner_order_id = (:gate_order_id)::uuid;

DELETE FROM public.partner_order_items
 WHERE order_id = (:gate_order_id)::uuid;

DELETE FROM public.partner_order_audit_logs
 WHERE order_id = (:gate_order_id)::uuid;

DELETE FROM public.partner_orders
 WHERE id = (:gate_order_id)::uuid
   AND observacoes LIKE 'GATE-RUNTIME%';

-- Verificação: todas as contagens devem ser 0
SELECT
  (SELECT count(*) FROM public.partner_order_idempotency WHERE idempotency_key LIKE 'GATE-RUNTIME-%') AS idempotency,
  (SELECT count(*) FROM public.partner_orders WHERE observacoes LIKE 'GATE-RUNTIME%') AS orders;

COMMIT;
