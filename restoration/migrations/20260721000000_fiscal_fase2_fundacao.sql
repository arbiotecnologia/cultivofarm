-- =====================================================================
-- FASE FISCAL 2 — FUNDAÇÃO FISCAL SEGURA DA AR BIO
-- Aditiva, transacional, não destrutiva.
-- Sem emissão externa, sem certificados, sem tokens, sem segredos.
-- Aplicado via psql em 2026-07-21. Não usar migration tool: já executado.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 4. IDENTIDADE FISCAL DA AR BIO
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.company_fiscal_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  is_active boolean NOT NULL DEFAULT true,
  legal_name text,
  trade_name text,
  cnpj text,
  state_registration text,
  municipal_registration text,
  tax_regime text,
  crt text,
  primary_cnae text,
  additional_cnaes text[],
  fiscal_email text,
  phone text,
  postal_code text,
  street text,
  number text,
  complement text,
  neighborhood text,
  city text,
  municipality_ibge_code text,
  state text,
  country_code text DEFAULT 'BR',
  nfe_series text,
  nfse_series text,
  fiscal_provider text NOT NULL DEFAULT 'NONE'
    CHECK (fiscal_provider IN ('NONE','NOT_CONFIGURED','FOCUS_NFE','SEFAZ_DIRETO','NFSE_NACIONAL','MUNICIPAL')),
  fiscal_environment text NOT NULL DEFAULT 'NOT_CONFIGURED'
    CHECK (fiscal_environment IN ('NOT_CONFIGURED','HOMOLOGATION','PRODUCTION')),
  nfe_enabled boolean NOT NULL DEFAULT false,
  nfse_enabled boolean NOT NULL DEFAULT false,
  production_enabled boolean NOT NULL DEFAULT false,
  configuration_status text NOT NULL DEFAULT 'DRAFT'
    CHECK (configuration_status IN ('DRAFT','PENDING_ACCOUNTING','VALIDATED','BLOCKED')),
  accounting_validated_at timestamptz,
  accounting_validated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_company_fiscal_settings_active_singleton
  ON public.company_fiscal_settings ((true)) WHERE is_active = true;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_fiscal_settings TO authenticated;
GRANT ALL ON public.company_fiscal_settings TO service_role;
ALTER TABLE public.company_fiscal_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_fiscal_settings_read" ON public.company_fiscal_settings;
CREATE POLICY "company_fiscal_settings_read"
  ON public.company_fiscal_settings FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'administrador')
    OR public.has_role(auth.uid(), 'gestor')
    OR public.has_role(auth.uid(), 'financeiro')
  );

DROP POLICY IF EXISTS "company_fiscal_settings_write" ON public.company_fiscal_settings;
CREATE POLICY "company_fiscal_settings_write"
  ON public.company_fiscal_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'administrador'))
  WITH CHECK (public.has_role(auth.uid(), 'administrador'));

INSERT INTO public.company_fiscal_settings (is_active, configuration_status)
SELECT true, 'DRAFT'
WHERE NOT EXISTS (SELECT 1 FROM public.company_fiscal_settings WHERE is_active = true);

-- ---------------------------------------------------------------------
-- 5. PRODUTOS
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.product_fiscal_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  fiscal_description text,
  commercial_unit text,
  taxable_unit text,
  ncm text,
  cest text,
  origin_code text,
  cfop_in_state text,
  cfop_interstate text,
  icms_cst text,
  icms_csosn text,
  pis_cst text,
  cofins_cst text,
  ipi_cst text,
  gtin text,
  taxable_gtin text,
  tax_benefit_code text,
  approximate_tax_source text,
  profile_status text NOT NULL DEFAULT 'DRAFT'
    CHECK (profile_status IN ('DRAFT','PENDING_ACCOUNTING','VALIDATED','BLOCKED','NOT_FISCALLY_SOLD')),
  accounting_notes text,
  accounting_validated_at timestamptz,
  accounting_validated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_product_fiscal_profiles_active
  ON public.product_fiscal_profiles (product_id) WHERE is_active = true;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_fiscal_profiles TO authenticated;
GRANT ALL ON public.product_fiscal_profiles TO service_role;
ALTER TABLE public.product_fiscal_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "product_fiscal_profiles_read" ON public.product_fiscal_profiles;
CREATE POLICY "product_fiscal_profiles_read"
  ON public.product_fiscal_profiles FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'administrador')
    OR public.has_role(auth.uid(),'gestor')
    OR public.has_role(auth.uid(),'financeiro')
  );

DROP POLICY IF EXISTS "product_fiscal_profiles_write" ON public.product_fiscal_profiles;
CREATE POLICY "product_fiscal_profiles_write"
  ON public.product_fiscal_profiles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'financeiro'))
  WITH CHECK (public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'financeiro'));

-- ---------------------------------------------------------------------
-- 6. SERVIÇOS
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.service_fiscal_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid,
  source_reference text,
  is_active boolean NOT NULL DEFAULT true,
  service_name text,
  fiscal_description_template text,
  national_taxation_code text,
  municipal_taxation_code text,
  lc116_item text,
  cnae text,
  iss_rate numeric(6,4),
  iss_withheld_default boolean NOT NULL DEFAULT false,
  incidence_municipality_ibge_code text,
  requirement_status text,
  federal_withholding_defaults jsonb,
  profile_status text NOT NULL DEFAULT 'DRAFT'
    CHECK (profile_status IN ('DRAFT','PENDING_ACCOUNTING','VALIDATED','BLOCKED','NOT_FISCALLY_BILLED')),
  accounting_notes text,
  accounting_validated_at timestamptz,
  accounting_validated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  CONSTRAINT chk_service_ref CHECK (service_id IS NOT NULL OR source_reference IS NOT NULL)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_fiscal_profiles TO authenticated;
GRANT ALL ON public.service_fiscal_profiles TO service_role;
ALTER TABLE public.service_fiscal_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_fiscal_profiles_read" ON public.service_fiscal_profiles;
CREATE POLICY "service_fiscal_profiles_read"
  ON public.service_fiscal_profiles FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'administrador')
    OR public.has_role(auth.uid(),'gestor')
    OR public.has_role(auth.uid(),'financeiro')
  );

DROP POLICY IF EXISTS "service_fiscal_profiles_write" ON public.service_fiscal_profiles;
CREATE POLICY "service_fiscal_profiles_write"
  ON public.service_fiscal_profiles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'financeiro'))
  WITH CHECK (public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'financeiro'));

-- ---------------------------------------------------------------------
-- 7. CLIENTES
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.customer_fiscal_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL,
  taxpayer_indicator text,
  state_registration_status text,
  municipal_registration text,
  fiscal_email text,
  fiscal_phone text,
  use_main_address boolean NOT NULL DEFAULT true,
  fiscal_postal_code text,
  fiscal_street text,
  fiscal_number text,
  fiscal_complement text,
  fiscal_neighborhood text,
  fiscal_city text,
  fiscal_municipality_ibge_code text,
  fiscal_state text,
  country_code text DEFAULT 'BR',
  rural_producer_indicator boolean NOT NULL DEFAULT false,
  foreign_customer_indicator boolean NOT NULL DEFAULT false,
  profile_status text NOT NULL DEFAULT 'INCOMPLETE'
    CHECK (profile_status IN ('INCOMPLETE','PENDING_REVIEW','VALIDATED','BLOCKED')),
  validation_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_customer_fiscal_profiles_customer
  ON public.customer_fiscal_profiles (customer_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_fiscal_profiles TO authenticated;
GRANT ALL ON public.customer_fiscal_profiles TO service_role;
ALTER TABLE public.customer_fiscal_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "customer_fiscal_profiles_read" ON public.customer_fiscal_profiles;
CREATE POLICY "customer_fiscal_profiles_read"
  ON public.customer_fiscal_profiles FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'administrador')
    OR public.has_role(auth.uid(),'gestor')
    OR public.has_role(auth.uid(),'financeiro')
  );

DROP POLICY IF EXISTS "customer_fiscal_profiles_write" ON public.customer_fiscal_profiles;
CREATE POLICY "customer_fiscal_profiles_write"
  ON public.customer_fiscal_profiles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'financeiro'))
  WITH CHECK (public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'financeiro'));

-- ---------------------------------------------------------------------
-- 8. EVOLUÇÃO DE fiscal_invoices
-- ---------------------------------------------------------------------
ALTER TABLE public.fiscal_invoices
  ADD COLUMN IF NOT EXISTS document_model text,
  ADD COLUMN IF NOT EXISTS document_origin text,
  ADD COLUMN IF NOT EXISTS environment text,
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS provider_reference text,
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS normalized_status text,
  ADD COLUMN IF NOT EXISTS provider_status_raw text,
  ADD COLUMN IF NOT EXISTS source_type text,
  ADD COLUMN IF NOT EXISTS source_id uuid,
  ADD COLUMN IF NOT EXISTS parent_invoice_id uuid,
  ADD COLUMN IF NOT EXISTS substitution_invoice_id uuid,
  ADD COLUMN IF NOT EXISTS authorized_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS canceled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancel_reason text,
  ADD COLUMN IF NOT EXISTS reconciliation_status text,
  ADD COLUMN IF NOT EXISTS company_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS customer_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS fiscal_totals_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS payload_schema_version int,
  ADD COLUMN IF NOT EXISTS locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS locked_by uuid,
  ADD COLUMN IF NOT EXISTS company_cnpj text;

UPDATE public.fiscal_invoices SET
  document_origin = COALESCE(document_origin, 'MANUAL_RECORD'),
  document_model = COALESCE(document_model,
    CASE WHEN invoice_type ILIKE '%NFS%' THEN 'NFSE'
         WHEN invoice_type ILIKE '%NFE%' THEN 'NFE' ELSE 'OTHER' END),
  normalized_status = COALESCE(normalized_status, 'LEGACY_RECORDED'),
  environment = COALESCE(environment, 'NOT_CONFIGURED'),
  provider = COALESCE(provider, 'NONE'),
  reconciliation_status = COALESCE(reconciliation_status,
    CASE WHEN receivable_id IS NULL THEN 'NOT_APPLICABLE' ELSE 'PENDING' END),
  payload_schema_version = COALESCE(payload_schema_version, 1)
WHERE document_origin IS NULL OR document_model IS NULL OR normalized_status IS NULL
   OR environment IS NULL OR provider IS NULL OR reconciliation_status IS NULL;

ALTER TABLE public.fiscal_invoices
  DROP CONSTRAINT IF EXISTS chk_fi_document_model,
  ADD CONSTRAINT chk_fi_document_model CHECK (document_model IS NULL OR document_model IN ('NFE','NFSE','OTHER'));
ALTER TABLE public.fiscal_invoices
  DROP CONSTRAINT IF EXISTS chk_fi_document_origin,
  ADD CONSTRAINT chk_fi_document_origin CHECK (document_origin IS NULL OR document_origin IN
    ('MANUAL_RECORD','EXTERNAL_IMPORTED','SYSTEM_PREPARED','PROVIDER_INTEGRATED'));
ALTER TABLE public.fiscal_invoices
  DROP CONSTRAINT IF EXISTS chk_fi_environment,
  ADD CONSTRAINT chk_fi_environment CHECK (environment IS NULL OR environment IN
    ('NOT_CONFIGURED','HOMOLOGATION','PRODUCTION'));
ALTER TABLE public.fiscal_invoices
  DROP CONSTRAINT IF EXISTS chk_fi_normalized_status,
  ADD CONSTRAINT chk_fi_normalized_status CHECK (normalized_status IS NULL OR normalized_status IN
    ('LEGACY_RECORDED','DRAFT','VALIDATING','READY','QUEUED','PROCESSING',
     'AUTHORIZED','REJECTED','ERROR','CANCEL_REQUESTED','CANCELED','SUBSTITUTED'));
ALTER TABLE public.fiscal_invoices
  DROP CONSTRAINT IF EXISTS chk_fi_reconciliation_status,
  ADD CONSTRAINT chk_fi_reconciliation_status CHECK (reconciliation_status IS NULL OR reconciliation_status IN
    ('NOT_APPLICABLE','PENDING','RECONCILED','DIVERGENT','REQUIRES_REVIEW'));

-- 9. UNIQUES parciais
CREATE UNIQUE INDEX IF NOT EXISTS ux_fi_provider_ref
  ON public.fiscal_invoices (provider, environment, provider_reference)
  WHERE provider_reference IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_fi_idempotency_key
  ON public.fiscal_invoices (idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_fi_access_key
  ON public.fiscal_invoices (access_key) WHERE access_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_fi_doc_model_series_number_company
  ON public.fiscal_invoices (document_model, series, invoice_number, company_cnpj)
  WHERE document_model IS NOT NULL AND series IS NOT NULL
    AND invoice_number IS NOT NULL AND company_cnpj IS NOT NULL;

-- 10. ITENS
CREATE TABLE IF NOT EXISTS public.fiscal_invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscal_invoice_id uuid NOT NULL REFERENCES public.fiscal_invoices(id) ON DELETE CASCADE,
  source_item_type text,
  source_item_id uuid,
  item_sequence int NOT NULL,
  item_kind text NOT NULL CHECK (item_kind IN ('PRODUCT','SERVICE','OTHER')),
  description text,
  quantity numeric(18,6),
  commercial_unit text,
  taxable_quantity numeric(18,6),
  taxable_unit text,
  unit_value numeric(18,6),
  gross_value numeric(18,2),
  discount_value numeric(18,2),
  freight_value numeric(18,2),
  insurance_value numeric(18,2),
  other_value numeric(18,2),
  net_value numeric(18,2),
  fiscal_profile_snapshot jsonb,
  tax_snapshot jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fiscal_invoice_id, item_sequence)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fiscal_invoice_items TO authenticated;
GRANT ALL ON public.fiscal_invoice_items TO service_role;
ALTER TABLE public.fiscal_invoice_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fiscal_invoice_items_read" ON public.fiscal_invoice_items;
CREATE POLICY "fiscal_invoice_items_read"
  ON public.fiscal_invoice_items FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'gestor')
      OR public.has_role(auth.uid(),'financeiro') OR public.has_role(auth.uid(),'administrativo'));

DROP POLICY IF EXISTS "fiscal_invoice_items_write" ON public.fiscal_invoice_items;
CREATE POLICY "fiscal_invoice_items_write"
  ON public.fiscal_invoice_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'financeiro'))
  WITH CHECK (public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'financeiro'));

-- 11. EVENTOS
CREATE TABLE IF NOT EXISTS public.fiscal_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscal_invoice_id uuid REFERENCES public.fiscal_invoices(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN (
    'CREATED','MANUAL_UPDATED','DOCUMENT_ATTACHED','VALIDATION_REQUESTED',
    'VALIDATION_FAILED','READY_FOR_FUTURE_INTEGRATION',
    'RECONCILIATION_REQUIRED','RECONCILIATION_COMPLETED',
    'DOCUMENT_CANCELED_FINANCIAL_REVIEW_REQUIRED','TOTAL_MISMATCH',
    'CUSTOMER_MISMATCH','SOURCE_MISMATCH','REPLACEMENT_REQUIRED'
  )),
  status_before text,
  status_after text,
  event_source text NOT NULL DEFAULT 'INTERNAL',
  provider_event_id text,
  request_snapshot jsonb,
  response_snapshot jsonb,
  error_code text,
  error_message text,
  performed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_fiscal_events_invoice ON public.fiscal_events(fiscal_invoice_id);
CREATE INDEX IF NOT EXISTS ix_fiscal_events_created_at ON public.fiscal_events(created_at DESC);

GRANT SELECT, INSERT ON public.fiscal_events TO authenticated;
GRANT ALL ON public.fiscal_events TO service_role;
ALTER TABLE public.fiscal_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fiscal_events_read" ON public.fiscal_events;
CREATE POLICY "fiscal_events_read"
  ON public.fiscal_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'gestor')
      OR public.has_role(auth.uid(),'financeiro'));

DROP POLICY IF EXISTS "fiscal_events_insert" ON public.fiscal_events;
CREATE POLICY "fiscal_events_insert"
  ON public.fiscal_events FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'financeiro')
           OR public.has_role(auth.uid(),'gestor'));

INSERT INTO public.fiscal_events (fiscal_invoice_id, event_type, status_after, event_source, created_at)
SELECT fi.id, 'CREATED', fi.status, 'LEGACY_BACKFILL', fi.created_at
FROM public.fiscal_invoices fi
WHERE NOT EXISTS (SELECT 1 FROM public.fiscal_events fe
                   WHERE fe.fiscal_invoice_id = fi.id AND fe.event_type = 'CREATED');

-- 12. IDEMPOTÊNCIA
CREATE TABLE IF NOT EXISTS public.fiscal_idempotency_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key text NOT NULL UNIQUE,
  fiscal_invoice_id uuid REFERENCES public.fiscal_invoices(id) ON DELETE SET NULL,
  operation_type text NOT NULL CHECK (operation_type IN ('PREPARE','ISSUE','STATUS','CANCEL','SUBSTITUTE')),
  environment text CHECK (environment IN ('NOT_CONFIGURED','HOMOLOGATION','PRODUCTION')),
  provider text,
  request_hash text,
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','LOCKED','COMPLETED','FAILED','EXPIRED')),
  locked_at timestamptz,
  expires_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.fiscal_idempotency_keys TO authenticated;
GRANT ALL ON public.fiscal_idempotency_keys TO service_role;
ALTER TABLE public.fiscal_idempotency_keys ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fiscal_idempotency_read" ON public.fiscal_idempotency_keys;
CREATE POLICY "fiscal_idempotency_read"
  ON public.fiscal_idempotency_keys FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'administrador'));

-- 14. financial_documents metadados
ALTER TABLE public.financial_documents
  ADD COLUMN IF NOT EXISTS fiscal_invoice_id uuid REFERENCES public.fiscal_invoices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS document_origin text,
  ADD COLUMN IF NOT EXISTS fiscal_event_id uuid REFERENCES public.fiscal_events(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS file_category text,
  ADD COLUMN IF NOT EXISTS environment text,
  ADD COLUMN IF NOT EXISTS version_number int;

-- 16. AUDIT
CREATE TABLE IF NOT EXISTS public.fiscal_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  record_id uuid,
  action text NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE')),
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now(),
  old_values jsonb,
  new_values jsonb
);
CREATE INDEX IF NOT EXISTS ix_fiscal_audit_log_table_record ON public.fiscal_audit_log(table_name, record_id);
CREATE INDEX IF NOT EXISTS ix_fiscal_audit_log_changed_at ON public.fiscal_audit_log(changed_at DESC);

GRANT SELECT ON public.fiscal_audit_log TO authenticated;
GRANT ALL ON public.fiscal_audit_log TO service_role;
ALTER TABLE public.fiscal_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fiscal_audit_log_read" ON public.fiscal_audit_log;
CREATE POLICY "fiscal_audit_log_read"
  ON public.fiscal_audit_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'administrador'));

CREATE OR REPLACE FUNCTION public.fiscal_audit_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor uuid;
BEGIN
  BEGIN v_actor := auth.uid(); EXCEPTION WHEN OTHERS THEN v_actor := NULL; END;
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.fiscal_audit_log(table_name, record_id, action, changed_by, new_values)
    VALUES (TG_TABLE_NAME, NEW.id, 'INSERT', v_actor, to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.fiscal_audit_log(table_name, record_id, action, changed_by, old_values, new_values)
    VALUES (TG_TABLE_NAME, NEW.id, 'UPDATE', v_actor, to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.fiscal_audit_log(table_name, record_id, action, changed_by, old_values)
    VALUES (TG_TABLE_NAME, OLD.id, 'DELETE', v_actor, to_jsonb(OLD));
    RETURN OLD;
  END IF;
  RETURN NULL;
END; $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'company_fiscal_settings','product_fiscal_profiles','service_fiscal_profiles',
    'customer_fiscal_profiles','fiscal_invoices','fiscal_invoice_items',
    'fiscal_events','fiscal_idempotency_keys']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_fiscal_audit_%I ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER trg_fiscal_audit_%I AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.fiscal_audit_trigger()', t, t);
  END LOOP;
END $$;

-- 18. VIEWS
CREATE OR REPLACE VIEW public.v_fiscal_company_readiness AS
SELECT id, configuration_status, nfe_enabled, nfse_enabled, production_enabled,
  fiscal_environment, fiscal_provider,
  ((cnpj IS NOT NULL)::int + (legal_name IS NOT NULL)::int + (tax_regime IS NOT NULL)::int
   + (crt IS NOT NULL)::int + (primary_cnae IS NOT NULL)::int
   + (municipality_ibge_code IS NOT NULL)::int)::int AS filled_score,
  6 AS max_score,
  accounting_validated_at IS NOT NULL AS accounting_validated
FROM public.company_fiscal_settings WHERE is_active = true;

CREATE OR REPLACE VIEW public.v_product_fiscal_readiness AS
SELECT product_id, profile_status,
  (ncm IS NOT NULL AND cfop_in_state IS NOT NULL) AS minimally_classified,
  accounting_validated_at IS NOT NULL AS accounting_validated
FROM public.product_fiscal_profiles WHERE is_active = true;

CREATE OR REPLACE VIEW public.v_service_fiscal_readiness AS
SELECT id, service_id, source_reference, profile_status,
  (lc116_item IS NOT NULL AND cnae IS NOT NULL) AS minimally_classified,
  accounting_validated_at IS NOT NULL AS accounting_validated
FROM public.service_fiscal_profiles WHERE is_active = true;

CREATE OR REPLACE VIEW public.v_customer_fiscal_readiness AS
SELECT customer_id, profile_status,
  (fiscal_municipality_ibge_code IS NOT NULL) AS has_ibge
FROM public.customer_fiscal_profiles;

CREATE OR REPLACE VIEW public.v_fiscal_document_reconciliation_pending AS
SELECT id AS fiscal_invoice_id, receivable_id, reconciliation_status,
  document_model, document_origin, status, normalized_status
FROM public.fiscal_invoices
WHERE reconciliation_status IN ('PENDING','DIVERGENT','REQUIRES_REVIEW');

GRANT SELECT ON public.v_fiscal_company_readiness TO authenticated;
GRANT SELECT ON public.v_product_fiscal_readiness TO authenticated;
GRANT SELECT ON public.v_service_fiscal_readiness TO authenticated;
GRANT SELECT ON public.v_customer_fiscal_readiness TO authenticated;
GRANT SELECT ON public.v_fiscal_document_reconciliation_pending TO authenticated;

COMMIT;
