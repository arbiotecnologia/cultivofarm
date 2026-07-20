-- ========== 1. Update is_financial_staff to include 'financeiro' role ==========
CREATE OR REPLACE FUNCTION public.is_financial_staff(_uid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT has_role(_uid,'administrador'::app_role)
      OR has_role(_uid,'gestor'::app_role)
      OR has_role(_uid,'administrativo'::app_role)
      OR has_role(_uid,'financeiro'::app_role)
$$;

-- ========== 2. financial_settings (singleton) ==========
CREATE TABLE IF NOT EXISTS public.financial_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  require_receipt_on_receivable_payment boolean NOT NULL DEFAULT false,
  require_receipt_on_payable_payment boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
INSERT INTO public.financial_settings (id) VALUES (true) ON CONFLICT DO NOTHING;
ALTER TABLE public.financial_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fs_read_all_auth" ON public.financial_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "fs_write_staff" ON public.financial_settings FOR UPDATE TO authenticated
  USING (public.is_financial_staff(auth.uid())) WITH CHECK (public.is_financial_staff(auth.uid()));

-- ========== 3. financial_documents ==========
CREATE TABLE IF NOT EXISTS public.financial_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type text NOT NULL CHECK (owner_type IN ('RECEIVABLE','PAYABLE','DELIVERY','FISCAL_INVOICE','PAYMENT_RECEIVABLE','PAYMENT_PAYABLE')),
  owner_id uuid NOT NULL,
  document_type text NOT NULL CHECK (document_type IN ('INVOICE','RECEIPT','CONTRACT','BOLETO','XML','DANFE','OTHER')),
  file_name text NOT NULL,
  storage_path text NOT NULL,
  mime_type text,
  file_size bigint,
  notes text,
  uploaded_by uuid NOT NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fin_docs_owner ON public.financial_documents(owner_type, owner_id);
ALTER TABLE public.financial_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fd_staff_all" ON public.financial_documents FOR ALL TO authenticated
  USING (public.is_financial_staff(auth.uid())) WITH CHECK (public.is_financial_staff(auth.uid()));
-- Producer portal: read own receivable docs
CREATE POLICY "fd_producer_read_own_ar" ON public.financial_documents FOR SELECT TO authenticated
  USING (
    owner_type = 'RECEIVABLE'
    AND has_role(auth.uid(),'cliente_produtor'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.accounts_receivable ar
      WHERE ar.id = financial_documents.owner_id
        AND ar.customer_id = ANY(public.get_cliente_ids_for_user(auth.uid()))
    )
  );

-- ========== 4. recurring_financial_templates ==========
CREATE TABLE IF NOT EXISTS public.recurring_financial_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('RECEIVABLE','PAYABLE')),
  name text NOT NULL,
  customer_id uuid REFERENCES public.clientes(id),
  supplier_id uuid,
  supplier_name text,
  category_id uuid NOT NULL REFERENCES public.financial_categories(id),
  cost_center_id uuid REFERENCES public.financial_cost_centers(id),
  amount numeric(14,2) NOT NULL CHECK (amount >= 0),
  installment_count int NOT NULL DEFAULT 1 CHECK (installment_count >= 1),
  recurrence_frequency text NOT NULL CHECK (recurrence_frequency IN ('WEEKLY','MONTHLY','BIMONTHLY','QUARTERLY','SEMIANNUAL','ANNUAL')),
  due_day int CHECK (due_day BETWEEN 1 AND 31),
  start_date date NOT NULL,
  end_date date,
  next_generation_date date NOT NULL,
  active boolean NOT NULL DEFAULT true,
  auto_generate boolean NOT NULL DEFAULT true,
  payment_method_id uuid REFERENCES public.payment_methods(id),
  bank_account_id uuid REFERENCES public.bank_accounts(id),
  notes text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rft_next ON public.recurring_financial_templates(next_generation_date) WHERE active;
ALTER TABLE public.recurring_financial_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rft_staff_all" ON public.recurring_financial_templates FOR ALL TO authenticated
  USING (public.is_financial_staff(auth.uid())) WITH CHECK (public.is_financial_staff(auth.uid()));

CREATE TABLE IF NOT EXISTS public.recurring_generations_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.recurring_financial_templates(id) ON DELETE CASCADE,
  generated_at timestamptz NOT NULL DEFAULT now(),
  target_type text,
  target_id uuid,
  success boolean NOT NULL,
  error text
);
CREATE INDEX IF NOT EXISTS idx_rgl_template ON public.recurring_generations_log(template_id, generated_at DESC);
ALTER TABLE public.recurring_generations_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rgl_staff_read" ON public.recurring_generations_log FOR SELECT TO authenticated
  USING (public.is_financial_staff(auth.uid()));

-- ========== 5. fiscal_invoices ==========
CREATE TABLE IF NOT EXISTS public.fiscal_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receivable_id uuid REFERENCES public.accounts_receivable(id) ON DELETE SET NULL,
  delivery_id uuid REFERENCES public.entregas(id) ON DELETE SET NULL,
  invoice_type text NOT NULL CHECK (invoice_type IN ('NFE','NFSE','NFCE','OUTRO')),
  invoice_number text,
  series text,
  access_key text,
  issue_date date,
  total_amount numeric(14,2),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','ISSUED','CANCELED','ERROR')),
  xml_document_id uuid REFERENCES public.financial_documents(id),
  danfe_document_id uuid REFERENCES public.financial_documents(id),
  notes text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fi_receivable ON public.fiscal_invoices(receivable_id);
CREATE INDEX IF NOT EXISTS idx_fi_status ON public.fiscal_invoices(status);
ALTER TABLE public.fiscal_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fi_staff_all" ON public.fiscal_invoices FOR ALL TO authenticated
  USING (public.is_financial_staff(auth.uid())) WITH CHECK (public.is_financial_staff(auth.uid()));
CREATE POLICY "fi_producer_read" ON public.fiscal_invoices FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(),'cliente_produtor'::app_role)
    AND receivable_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.accounts_receivable ar
      WHERE ar.id = fiscal_invoices.receivable_id
        AND ar.customer_id = ANY(public.get_cliente_ids_for_user(auth.uid()))
    )
  );

-- ========== 6. entregas: receivable_id + campos de confirmação ==========
ALTER TABLE public.entregas
  ADD COLUMN IF NOT EXISTS receivable_id uuid REFERENCES public.accounts_receivable(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS confirmada_em timestamptz,
  ADD COLUMN IF NOT EXISTS confirmada_por uuid,
  ADD COLUMN IF NOT EXISTS recebido_por_nome text;

CREATE INDEX IF NOT EXISTS idx_entregas_receivable ON public.entregas(receivable_id);

-- Uniqueness: 1 receivable per delivery
CREATE UNIQUE INDEX IF NOT EXISTS ux_ar_one_per_delivery
  ON public.accounts_receivable(origin_id)
  WHERE origin_type = 'DELIVERY' AND status <> 'CANCELED';

-- ========== 7. Portal Produtor: leitura de AR/parcelas próprias ==========
DROP POLICY IF EXISTS "ar_producer_read" ON public.accounts_receivable;
CREATE POLICY "ar_producer_read" ON public.accounts_receivable FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(),'cliente_produtor'::app_role)
    AND customer_id = ANY(public.get_cliente_ids_for_user(auth.uid()))
  );

DROP POLICY IF EXISTS "ari_producer_read" ON public.accounts_receivable_installments;
CREATE POLICY "ari_producer_read" ON public.accounts_receivable_installments FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(),'cliente_produtor'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.accounts_receivable ar
      WHERE ar.id = accounts_receivable_installments.receivable_id
        AND ar.customer_id = ANY(public.get_cliente_ids_for_user(auth.uid()))
    )
  );

-- ========== 8. Função de geração de recorrências ==========
CREATE OR REPLACE FUNCTION public.fn_recurring_generate_due()
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  t record;
  v_new_id uuid;
  v_count int := 0;
  v_interval interval;
BEGIN
  FOR t IN
    SELECT * FROM public.recurring_financial_templates
    WHERE active = true
      AND auto_generate = true
      AND next_generation_date <= CURRENT_DATE
      AND (end_date IS NULL OR next_generation_date <= end_date)
  LOOP
    BEGIN
      IF t.type = 'RECEIVABLE' AND t.customer_id IS NOT NULL THEN
        INSERT INTO public.accounts_receivable
          (origin_type, customer_id, description, category_id, cost_center_id,
           total_amount, first_due_date, installment_count, created_by, notes)
        VALUES
          ('RECURRING', t.customer_id, t.name, t.category_id, t.cost_center_id,
           t.amount, t.next_generation_date, t.installment_count, t.created_by,
           'Gerado automaticamente do template ' || t.name)
        RETURNING id INTO v_new_id;
        INSERT INTO public.recurring_generations_log(template_id, target_type, target_id, success)
        VALUES (t.id, 'RECEIVABLE', v_new_id, true);
      ELSIF t.type = 'PAYABLE' THEN
        INSERT INTO public.accounts_payable
          (supplier_id, supplier_name, description, category_id, cost_center_id,
           total_amount, first_due_date, installment_count, origin_type, created_by, notes)
        VALUES
          (t.supplier_id, t.supplier_name, t.name, t.category_id, t.cost_center_id,
           t.amount, t.next_generation_date, t.installment_count, 'RECURRING', t.created_by,
           'Gerado automaticamente do template ' || t.name)
        RETURNING id INTO v_new_id;
        INSERT INTO public.recurring_generations_log(template_id, target_type, target_id, success)
        VALUES (t.id, 'PAYABLE', v_new_id, true);
      ELSE
        INSERT INTO public.recurring_generations_log(template_id, success, error)
        VALUES (t.id, false, 'Template inválido: customer_id ausente para RECEIVABLE');
        CONTINUE;
      END IF;

      v_interval := CASE t.recurrence_frequency
        WHEN 'WEEKLY' THEN interval '7 days'
        WHEN 'MONTHLY' THEN interval '1 month'
        WHEN 'BIMONTHLY' THEN interval '2 months'
        WHEN 'QUARTERLY' THEN interval '3 months'
        WHEN 'SEMIANNUAL' THEN interval '6 months'
        WHEN 'ANNUAL' THEN interval '1 year'
      END;

      UPDATE public.recurring_financial_templates
        SET next_generation_date = (t.next_generation_date + v_interval)::date,
            updated_at = now()
        WHERE id = t.id;

      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.recurring_generations_log(template_id, success, error)
      VALUES (t.id, false, SQLERRM);
    END;
  END LOOP;
  RETURN v_count;
END $$;

-- ========== 9. Auditoria nas novas tabelas ==========
DROP TRIGGER IF EXISTS trg_fd_audit ON public.financial_documents;
CREATE TRIGGER trg_fd_audit AFTER INSERT OR UPDATE OR DELETE ON public.financial_documents
  FOR EACH ROW EXECUTE FUNCTION public.fn_financial_audit();

DROP TRIGGER IF EXISTS trg_rft_audit ON public.recurring_financial_templates;
CREATE TRIGGER trg_rft_audit AFTER INSERT OR UPDATE OR DELETE ON public.recurring_financial_templates
  FOR EACH ROW EXECUTE FUNCTION public.fn_financial_audit();

DROP TRIGGER IF EXISTS trg_fi_audit ON public.fiscal_invoices;
CREATE TRIGGER trg_fi_audit AFTER INSERT OR UPDATE OR DELETE ON public.fiscal_invoices
  FOR EACH ROW EXECUTE FUNCTION public.fn_financial_audit();

-- ========== 10. Storage policies for financial-docs bucket (producer read) ==========
DROP POLICY IF EXISTS "financial_docs_producer_read" ON storage.objects;
CREATE POLICY "financial_docs_producer_read" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'financial-docs'
    AND has_role(auth.uid(),'cliente_produtor'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.financial_documents fd
      WHERE fd.storage_path = storage.objects.name
        AND fd.owner_type = 'RECEIVABLE'
        AND EXISTS (
          SELECT 1 FROM public.accounts_receivable ar
          WHERE ar.id = fd.owner_id
            AND ar.customer_id = ANY(public.get_cliente_ids_for_user(auth.uid()))
        )
    )
  );

-- ========== 11. Trigger updated_at ==========
DROP TRIGGER IF EXISTS trg_rft_updated ON public.recurring_financial_templates;
CREATE TRIGGER trg_rft_updated BEFORE UPDATE ON public.recurring_financial_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_fi_updated ON public.fiscal_invoices;
CREATE TRIGGER trg_fi_updated BEFORE UPDATE ON public.fiscal_invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();