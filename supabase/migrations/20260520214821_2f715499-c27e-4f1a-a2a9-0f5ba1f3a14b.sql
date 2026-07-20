-- Soft delete em documentos financeiros
ALTER TABLE public.financial_documents 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS delete_reason TEXT;

-- Campos espelhados de NF-e em Contas a Receber
ALTER TABLE public.accounts_receivable
ADD COLUMN IF NOT EXISTS fiscal_invoice_number TEXT,
ADD COLUMN IF NOT EXISTS fiscal_access_key TEXT,
ADD COLUMN IF NOT EXISTS fiscal_issue_date DATE;

-- Campo de data da nota do fornecedor em Contas a Pagar
ALTER TABLE public.accounts_payable
ADD COLUMN IF NOT EXISTS supplier_invoice_date DATE;

-- Atualizar políticas de RLS para filtrar documentos excluídos por padrão
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Staff can view all documents' AND tablename = 'financial_documents') THEN
        DROP POLICY "Staff can view all documents" ON public.financial_documents;
    END IF;
END $$;

-- Política para visualizar documentos não excluídos
CREATE POLICY "Staff can view non-deleted documents"
ON public.financial_documents
FOR SELECT
TO authenticated
USING (
  deleted_at IS NULL AND (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role IN ('administrador', 'gestor', 'administrativo', 'financeiro')
    )
  )
);
