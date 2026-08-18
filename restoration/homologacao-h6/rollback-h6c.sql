-- =====================================================================
-- H6c — ROLLBACK FORWARD-SAFE (H6d)
-- Ambiente: SOMENTE staging ikaauvsflpmamgxmkhoq.
-- Producao navfzbwgwzruipouyfnk: PROIBIDO executar este arquivo.
--
-- ESCOPO E LIMITES (leia antes de executar)
-- -------------------------------------------------------------------
-- Reversivel automaticamente (objetos criados/instalados por H6c):
--   * trigger trg_h6c_entrega_ar_b2b_link       (public.entregas)
--   * trigger trg_h6c_set_canonical_payment_terms (public.partner_order_payment_terms)
--   * funcoes fn_h6c_entrega_ar_b2b_link, fn_h6c_set_canonical_payment_terms
--
-- NAO reversivel automaticamente (redefinicoes CREATE OR REPLACE):
--   * fn_entrega_valor_faturavel_v1
--   * fn_b2b_order_billing_eligibility
--   * fn_entrega_guard_faturamento_v1
--   * generate_b2b_receivable_secure_impl
--   H6c substituiu corpos anteriores (H6/H6b) sem snapshot das definicoes
--   antigas. Para restaurar o comportamento pre-H6c, reaplique a migration
--   canonica anterior:
--     supabase/migrations/20260916000000_h6b_financeiro_idempotencia_valor_canonico.sql
--   e, se necessario, as migrations H6 anteriores, na ordem cronologica.
--
-- NAO revertido por decisao explicita (preservacao de dados historicos):
--   * backfill de public.partner_orders.payment_terms_id (20 pedidos legados).
--     O backfill so preencheu vinculos INEQUIVOCOS (pedido com exatamente 1
--     termo) e nao sobrescreveu nenhum valor existente. Nao ha snapshot dos
--     NULLs anteriores, e apagar vinculos indiscriminadamente destruiria
--     vinculos legitimos criados depois pelo fluxo normal ou pelo trigger.
--     Zerar vinculos e, alem disso, financeiramente perigoso: um pedido sem
--     termo canonico fica bloqueado para faturamento (fail-closed H6C-001).
--     Se um vinculo especifico estiver errado, corrija-o pontualmente com
--     UPDATE explicito e auditado, pedido a pedido.
--
-- EFEITO COLATERAL DE EXECUTAR ESTE ROLLBACK
--   Sem trg_h6c_entrega_ar_b2b_link, entregas B2B faturadas voltam a gerar
--   recebivel sem partner_id e sem partner_order_financial_links: o pedido
--   permanece como "comprometido nao faturado" (regressao consciente de
--   H6C-003). Use apenas em incidente controlado.
-- =====================================================================

DO $guard$
BEGIN
  IF current_database() IS NULL THEN RAISE EXCEPTION 'ambiente indefinido'; END IF;
END
$guard$;

BEGIN;

-- 1) ciclo de credito B2B (H6C-003)
DROP TRIGGER IF EXISTS trg_h6c_entrega_ar_b2b_link ON public.entregas;
DROP FUNCTION IF EXISTS public.fn_h6c_entrega_ar_b2b_link();

-- 2) vinculo canonico automatico de condicao de pagamento (H6C-001.2)
--    Remove apenas o automatismo. Os vinculos ja gravados PERMANECEM.
DROP TRIGGER IF EXISTS trg_h6c_set_canonical_payment_terms ON public.partner_order_payment_terms;
DROP FUNCTION IF EXISTS public.fn_h6c_set_canonical_payment_terms();

-- 3) Evidencia pos-rollback
SELECT 'ROLLBACK_H6C' AS escopo,
       (SELECT count(*) FROM pg_trigger
         WHERE tgname IN ('trg_h6c_entrega_ar_b2b_link','trg_h6c_set_canonical_payment_terms')
           AND NOT tgisinternal) AS triggers_h6c_restantes,
       (SELECT count(*) FROM public.partner_orders WHERE payment_terms_id IS NOT NULL)
         AS vinculos_canonicos_preservados;

COMMIT;
