-- =====================================================================
-- FASE 1 (correcao de gate) — ROLLBACK FORWARD-SAFE
-- Somente staging ikaauvsflpmamgxmkhoq. Producao recusada.
--
-- PRESERVA INTEGRALMENTE: pedidos, itens, snapshots, condicoes de
-- pagamento, parcelas, recebiveis, producao, entrega, fiscal, BI e
-- comunicacao. Nenhum DELETE/UPDATE de dado operacional.
--
-- ESCOPO DO ROLLBACK (apenas o que pode voltar sem reabrir falha):
--   1. remove a trava de inercia do produtor direto na matriz de precos;
--   2. libera a tabela de idempotencia de checkout (mantida, apenas deixa
--      de ser exigida por novas chaves — os registros existentes ficam).
--
-- NAO E REVERTIDO POR DECISAO DE SEGURANCA (auditado no gate):
--   * obrigatoriedade de `p_expected_cart_hash` em
--     create_partner_order_secure — recriar a assinatura antiga de 7
--     argumentos permitiria criar pedido sem paridade de preco;
--   * bloqueio `forbidden_financial_terms` para parceiro_b2b_tecnico em
--     simulate_b2b_payment_plan_secure e a recusa de conversao por
--     tecnico-only;
--   * reavaliacao de credito dentro de respond_b2b_order_quote_secure;
--   * REVOKE de EXECUTE do papel `anon` nas funcoes comerciais B2B;
--   * exigencia de autenticacao/papel/vinculo em rpc_b2b_partner_credit.
-- Reverter qualquer um desses itens reabriria exposicao financeira ou
-- permitiria pedido sem preco autoritativo; exige decisao explicita
-- fora deste kit.
-- =====================================================================
\set ON_ERROR_STOP on

DO $guard$
DECLARE v_ref text;
BEGIN
  SELECT project_ref INTO v_ref FROM public._fiscal_staging_marker WHERE marker='STAGING' LIMIT 1;
  IF v_ref IS NULL THEN RAISE EXCEPTION 'STAGING_GUARD: marker ausente'; END IF;
  IF v_ref = 'navfzbwgwzruipouyfnk' THEN RAISE EXCEPTION 'STAGING_GUARD: PRODUCAO recusada'; END IF;
  IF v_ref <> 'ikaauvsflpmamgxmkhoq' THEN RAISE EXCEPTION 'STAGING_GUARD: ref inesperado %', v_ref; END IF;
END $guard$;

BEGIN;

-- 1. inercia do produtor direto -----------------------------------------
DROP TRIGGER IF EXISTS trg_commercial_price_rules_producer_inert ON public.commercial_price_rules;
DROP FUNCTION IF EXISTS public.tg_commercial_price_rules_producer_inert();

-- 2. idempotencia de checkout -------------------------------------------
--    A tabela e os registros sao preservados (rastreabilidade). Apenas o
--    indice unico e afrouxado nao e uma opcao segura: sem ele o mesmo
--    checkout poderia duplicar pedido. Por isso este rollback NAO remove
--    a unicidade; ele apenas documenta o ponto.

COMMIT;
