-- =====================================================================
-- Fase H2 — Imutabilidade dos itens fiscais conforme estado do pai
--
-- Contexto (auditoria §16 de docs/fiscal-h2-certificacao-staging.md):
-- a policy `fiscal_invoice_items_write` é `FOR ALL` para admin/financeiro
-- e não consulta `normalized_status`/`locked_at` do pai
-- `fiscal_invoices`. Isso permitia INSERT/UPDATE/DELETE em itens de
-- notas em estados terminais (AUTHORIZED, CANCELED, SUBSTITUTED) via
-- PostgREST direto, comprometendo auditabilidade fiscal e paridade
-- com XML/DANFE já emitido.
--
-- Esta migration é ADITIVA e canônica: cria trigger BEFORE
-- INSERT/UPDATE/DELETE em `public.fiscal_invoice_items` que:
--   1. Determina o pai via NEW.fiscal_invoice_id (INSERT/UPDATE) ou
--      OLD.fiscal_invoice_id (DELETE).
--   2. Trava a linha pai com `SELECT ... FOR UPDATE` para bloquear
--      mudança concorrente de status durante a mutação do item.
--   3. Permite mutação apenas quando `normalized_status` esta em
--      {DRAFT, VALIDATING, READY, REJECTED, ERROR}.
--   4. Bloqueia quando pai inexistente ou status em
--      {NULL, LEGACY_RECORDED, QUEUED, PROCESSING, AUTHORIZED,
--       CANCEL_REQUESTED, CANCELED, SUBSTITUTED}.
--
-- Compatibilidade com RPC canonica `rpc_fiscal_draft_save` (fase 3.16):
-- confirmado por leitura do codigo que a RPC so realiza
-- DELETE+INSERT de itens depois de validar o pai em `DRAFT` (linha 617
-- de 20260724000000_fiscal_fase3_16_homologacao_certificados.sql).
-- Como DRAFT eh estado permitido, a trigger nao quebra o fluxo. Nenhum
-- outro RPC do repositorio muta `fiscal_invoice_items` (grep validado
-- em src/ e supabase/migrations/).
--
-- NAO altera: RLS, grants, `fiscal_audit_trigger`, frontend, funcoes
-- existentes. NAO faz backfill nem toca itens preexistentes.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.fiscal_invoice_items_state_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_parent_id uuid;
  v_status    text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_parent_id := OLD.fiscal_invoice_id;
  ELSE
    v_parent_id := NEW.fiscal_invoice_id;
  END IF;

  IF v_parent_id IS NULL THEN
    RAISE EXCEPTION
      'Operacao bloqueada: item fiscal sem nota associada.'
      USING ERRCODE = 'P0001';
  END IF;

  -- Lock explicito da linha pai para impedir mudanca concorrente
  -- de status enquanto a mutacao do item esta em curso.
  SELECT normalized_status
    INTO v_status
    FROM public.fiscal_invoices
   WHERE id = v_parent_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Operacao bloqueada: nota fiscal pai nao encontrada.'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_status IS NULL
     OR v_status NOT IN ('DRAFT','VALIDATING','READY','REJECTED','ERROR') THEN
    RAISE EXCEPTION
      'Operacao bloqueada: itens fiscais so podem ser alterados enquanto a nota esta em rascunho, validacao, pronta, rejeitada ou em erro.'
      USING ERRCODE = 'P0001';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.fiscal_invoice_items_state_guard() FROM PUBLIC;

DROP TRIGGER IF EXISTS fiscal_invoice_items_state_guard_trg
  ON public.fiscal_invoice_items;

CREATE TRIGGER fiscal_invoice_items_state_guard_trg
BEFORE INSERT OR UPDATE OR DELETE ON public.fiscal_invoice_items
FOR EACH ROW EXECUTE FUNCTION public.fiscal_invoice_items_state_guard();
