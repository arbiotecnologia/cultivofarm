-- =====================================================================
-- FASE 1 (correcao consolidada final) — ROLLBACK FORWARD-SAFE
-- Somente staging ikaauvsflpmamgxmkhoq. Producao recusada.
--
-- PRESERVA INTEGRALMENTE: pedidos, itens, snapshots, condicoes de
-- pagamento, parcelas, recebiveis, producao, entrega, fiscal, BI e
-- comunicacao. Nenhum DELETE/UPDATE de dado operacional.
--
-- O rollback neutraliza apenas as GUARDAS introduzidas na correcao
-- consolidada, restaurando o contrato anterior de chamada:
--   1. remove a trava de inercia do produtor direto na matriz de precos;
--   2. recria a assinatura antiga (7 argumentos) de
--      create_partner_order_secure como delegacao para a versao atual,
--      com validacao de hash desativada;
--   3. torna a validacao de hash inoperante (chamadas sem hash ja sao
--      aceitas; o passo 2 garante compatibilidade de assinatura).
--
-- NAO E REVERTIDO POR DECISAO DE SEGURANCA (documentado no relatorio):
--   * REVOKE de EXECUTE do papel `anon` nas funcoes comerciais B2B;
--   * exigencia de papel/vinculo em rpc_b2b_partner_credit;
--   * ocultacao de dados de credito para parceiro_b2b_tecnico.
-- Reverter esses itens reabriria exposicao de dado financeiro.
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

-- 2. compatibilidade de assinatura (7 argumentos) -----------------------
CREATE OR REPLACE FUNCTION public.create_partner_order_secure(
  p_partner_id uuid,
  p_observacoes text DEFAULT NULL::text,
  p_items jsonb DEFAULT '[]'::jsonb,
  p_requested_delivery_date date DEFAULT NULL::date,
  p_payment_plan_id uuid DEFAULT NULL::uuid,
  p_first_due_date date DEFAULT NULL::date,
  p_installment_count integer DEFAULT NULL::integer)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT public.create_partner_order_secure(
    p_partner_id, p_observacoes, p_items, p_requested_delivery_date,
    p_payment_plan_id, p_first_due_date, p_installment_count, NULL::text);
$fn$;
REVOKE ALL ON FUNCTION public.create_partner_order_secure(uuid,text,jsonb,date,uuid,date,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_partner_order_secure(uuid,text,jsonb,date,uuid,date,integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_partner_order_secure(uuid,text,jsonb,date,uuid,date,integer)
  TO authenticated, service_role;

-- 3. assinatura do carrinho passa a ser meramente informativa -----------
--    (mantida a funcao; a validacao so ocorre quando o cliente envia hash)

COMMIT;
