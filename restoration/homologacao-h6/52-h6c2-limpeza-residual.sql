-- H6c — LIMPEZA DE FIXTURES RESIDUAIS 'H6C2%' (somente staging ikaauvsflpmamgxmkhoq).
-- Idempotente. Remove exclusivamente objetos criados pelo harness 51-h6c2-*.
-- Uso: psql "$STAGING_DSN" -v ON_ERROR_STOP=1 -f restoration/homologacao-h6/52-h6c2-limpeza-residual.sql
\pset pager off
\set ON_ERROR_STOP on

DO $guard$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public._fiscal_staging_marker
                  WHERE marker='STAGING' AND project_ref='ikaauvsflpmamgxmkhoq') THEN
    RAISE EXCEPTION 'STAGING_GUARD: ambiente nao autorizado';
  END IF;
END
$guard$;

BEGIN;

CREATE TEMP TABLE h6c2_orders ON COMMIT DROP AS
  SELECT id FROM public.partner_orders WHERE observacoes LIKE 'H6C2%';
CREATE TEMP TABLE h6c2_entregas ON COMMIT DROP AS
  SELECT id FROM public.entregas WHERE partner_order_id IN (SELECT id FROM h6c2_orders);
CREATE TEMP TABLE h6c2_lotes ON COMMIT DROP AS
  SELECT id FROM public.lotes WHERE codigo_lote LIKE 'H6C2%';

ALTER TABLE public.partner_order_financial_links DISABLE TRIGGER USER;
DELETE FROM public.partner_order_financial_links
 WHERE partner_order_id IN (SELECT id FROM h6c2_orders)
    OR receivable_id IN (SELECT id FROM public.accounts_receivable
                          WHERE origin_id IN (SELECT id FROM h6c2_entregas));
ALTER TABLE public.partner_order_financial_links ENABLE TRIGGER USER;

DELETE FROM public.receivable_payments WHERE installment_id IN
  (SELECT i.id FROM public.accounts_receivable_installments i
     JOIN public.accounts_receivable a ON a.id = i.receivable_id
    WHERE a.origin_id IN (SELECT id FROM h6c2_entregas));
DELETE FROM public.accounts_receivable_installments WHERE receivable_id IN
  (SELECT id FROM public.accounts_receivable WHERE origin_id IN (SELECT id FROM h6c2_entregas));
DELETE FROM public.financial_audit_log WHERE entity_id IN (SELECT id FROM h6c2_entregas);
DELETE FROM public.accounts_receivable WHERE origin_id IN (SELECT id FROM h6c2_entregas);

DELETE FROM public.entrega_conferencia_itens WHERE entrega_id IN (SELECT id FROM h6c2_entregas);
ALTER TABLE public.entrega_reconciliacoes DISABLE TRIGGER USER;
DELETE FROM public.entrega_reconciliacoes WHERE entrega_id IN (SELECT id FROM h6c2_entregas);
ALTER TABLE public.entrega_reconciliacoes ENABLE TRIGGER USER;
ALTER TABLE public.entregas DISABLE TRIGGER USER;
DELETE FROM public.entregas WHERE id IN (SELECT id FROM h6c2_entregas);
ALTER TABLE public.entregas ENABLE TRIGGER USER;

DELETE FROM public.estoque_embalagens WHERE codigo_embalagem LIKE 'H6C2%';
ALTER TABLE public.estoque_produto DISABLE TRIGGER USER;
ALTER TABLE public.estoque_movimentacoes DISABLE TRIGGER USER;
DELETE FROM public.estoque_movimentacoes WHERE estoque_produto_id IN
  (SELECT id FROM public.estoque_produto WHERE lote_id IN (SELECT id FROM h6c2_lotes));
DELETE FROM public.estoque_produto WHERE lote_id IN (SELECT id FROM h6c2_lotes);
ALTER TABLE public.estoque_movimentacoes ENABLE TRIGGER USER;
ALTER TABLE public.estoque_produto ENABLE TRIGGER USER;
DELETE FROM public.controle_qualidade WHERE lote_id IN (SELECT id FROM h6c2_lotes);
DELETE FROM public.lotes WHERE id IN (SELECT id FROM h6c2_lotes);

UPDATE public.partner_orders SET payment_terms_id = NULL WHERE id IN (SELECT id FROM h6c2_orders);
DELETE FROM public.partner_order_payment_terms WHERE partner_order_id IN (SELECT id FROM h6c2_orders);
UPDATE public.partner_orders SET status = 'pendente' WHERE id IN (SELECT id FROM h6c2_orders);
DELETE FROM public.partner_order_items WHERE order_id IN (SELECT id FROM h6c2_orders);
DELETE FROM public.partner_orders WHERE id IN (SELECT id FROM h6c2_orders);
DELETE FROM public.partner_accounts WHERE nome_fantasia LIKE 'H6C2%';
DELETE FROM public.clientes WHERE nome LIKE 'H6C2%';
DELETE FROM public.financial_categories WHERE name LIKE 'H6C2%';

COMMIT;

SELECT 'H6C2_RESIDUOS' AS escopo,
       (SELECT count(*) FROM public.partner_orders WHERE observacoes LIKE 'H6C2%')
     + (SELECT count(*) FROM public.clientes WHERE nome LIKE 'H6C2%')
     + (SELECT count(*) FROM public.lotes WHERE codigo_lote LIKE 'H6C2%')
     + (SELECT count(*) FROM public.estoque_embalagens WHERE codigo_embalagem LIKE 'H6C2%')
     + (SELECT count(*) FROM public.partner_accounts WHERE nome_fantasia LIKE 'H6C2%')
     + (SELECT count(*) FROM public.financial_categories WHERE name LIKE 'H6C2%') AS residuos;
