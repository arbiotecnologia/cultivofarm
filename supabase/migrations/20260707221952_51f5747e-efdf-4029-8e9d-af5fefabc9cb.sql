-- FASE 14 — Salvaguarda: valida que as RPCs oficiais do Motor B2B existem.
--
-- Contexto: a migration 20260707213038 usava pg_proc + replace() textual para
-- aplicar a blindagem FASE 11. Não é possível reescrevê-la neste projeto
-- (arquivo gerenciado pelo sistema de migrations). Migrations posteriores
-- (FASE 12.1 e FASE 13) já recriaram as duas RPCs via CREATE OR REPLACE
-- completo, tornando o patch textual redundante.
--
-- Esta migration NÃO altera funções: apenas falha explicitamente se as
-- assinaturas oficiais não existirem, guiando a correção em ambientes limpos.
--
-- Assinaturas oficiais:
--   public.create_partner_order_secure(uuid, text, jsonb, date, uuid, date, integer)
--   public.simulate_b2b_payment_plan_secure(uuid, uuid, jsonb, date)

DO $chk$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'create_partner_order_secure'
      AND pg_get_function_identity_arguments(p.oid) =
          'p_partner_id uuid, p_observacoes text, p_items jsonb, p_requested_delivery_date date, p_payment_plan_id uuid, p_first_due_date date, p_installment_count integer'
  ) THEN
    RAISE EXCEPTION 'FASE 14: assinatura oficial create_partner_order_secure(uuid,text,jsonb,date,uuid,date,integer) ausente. Rode a migration consolidada (FASE 12.1).';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'simulate_b2b_payment_plan_secure'
      AND pg_get_function_identity_arguments(p.oid) =
          'p_partner_id uuid, p_payment_plan_id uuid, p_items jsonb, p_first_due_date date'
  ) THEN
    RAISE EXCEPTION 'FASE 14: assinatura oficial simulate_b2b_payment_plan_secure(uuid,uuid,jsonb,date) ausente. Rode a migration consolidada (FASE 13).';
  END IF;

  RAISE NOTICE 'FASE 14 OK: RPCs oficiais do Motor B2B validadas.';
END $chk$;

COMMENT ON FUNCTION public.create_partner_order_secure(uuid, text, jsonb, date, uuid, date, integer)
IS 'Motor B2B — pedido consolidado. Blindagem FASE 11 (parcelas + vencimento) embutida. Consolidada em 20260707220218 (FASE 12.1). NÃO depender de patch textual via pg_proc.';

COMMENT ON FUNCTION public.simulate_b2b_payment_plan_secure(uuid, uuid, jsonb, date)
IS 'Motor B2B — simulação consolidada. Contrato inclui objeto amounts + requires_credit_approval. Consolidada em FASE 13. NÃO depender de patch textual via pg_proc.';