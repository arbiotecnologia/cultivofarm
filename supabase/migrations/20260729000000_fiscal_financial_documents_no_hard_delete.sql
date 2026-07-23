-- =====================================================================
-- Fase corretiva RLS — financial_documents: eliminar hard delete.
-- Aditiva. Não altera fluxo legítimo (soft delete via UPDATE em
-- deleted_at/deleted_by/delete_reason, executado pelo DocumentosPanel).
--
-- Motivação: existem duas policies permissivas FOR ALL
-- ("Financial staff full access" e "fd_staff_all") em
-- public.financial_documents, combinadas por OR. Como authenticated
-- também possui privilégio DELETE, hard delete físico é permitido no
-- staging, pondo em risco XML, DANFE e trilha de auditoria. O frontend
-- não usa DELETE físico; portanto o ramo DELETE é desnecessário.
-- =====================================================================

-- 1. Remover policies permissivas FOR ALL
DROP POLICY IF EXISTS "Financial staff full access" ON public.financial_documents;
DROP POLICY IF EXISTS "fd_staff_all" ON public.financial_documents;

-- 2. INSERT separado (staff financeiro)
DROP POLICY IF EXISTS "fd_staff_insert" ON public.financial_documents;
CREATE POLICY "fd_staff_insert" ON public.financial_documents
  FOR INSERT TO authenticated
  WITH CHECK (public.is_financial_staff(auth.uid()));

-- 3. UPDATE separado (staff financeiro) — cobre o soft delete legítimo
DROP POLICY IF EXISTS "fd_staff_update" ON public.financial_documents;
CREATE POLICY "fd_staff_update" ON public.financial_documents
  FOR UPDATE TO authenticated
  USING (public.is_financial_staff(auth.uid()))
  WITH CHECK (public.is_financial_staff(auth.uid()));

-- 4. DELETE negado — recriação idempotente
DROP POLICY IF EXISTS "fd_no_hard_delete" ON public.financial_documents;
CREATE POLICY "fd_no_hard_delete" ON public.financial_documents
  FOR DELETE TO authenticated USING (false);

-- 5. Defesa em profundidade: revogar DELETE do authenticated
REVOKE DELETE ON public.financial_documents FROM authenticated;

-- Observações:
-- * Policies SELECT existentes (staff em documentos não deletados;
--   produtor sobre documento próprio) permanecem intactas.
-- * GRANTs SELECT/INSERT/UPDATE preservados. Soft delete continua sendo
--   um UPDATE de deleted_at/deleted_by/delete_reason.
