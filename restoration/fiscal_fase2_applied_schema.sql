--
-- PostgreSQL database dump
--

\restrict OUNIU04UsI3m0J5Rpybeki8qiEdLe9Robz3fA0FGNjq6HtF1MEQ3fOJOE17fkgb

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.9

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: company_fiscal_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.company_fiscal_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
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
    country_code text DEFAULT 'BR'::text,
    nfe_series text,
    nfse_series text,
    fiscal_provider text DEFAULT 'NONE'::text NOT NULL,
    fiscal_environment text DEFAULT 'NOT_CONFIGURED'::text NOT NULL,
    nfe_enabled boolean DEFAULT false NOT NULL,
    nfse_enabled boolean DEFAULT false NOT NULL,
    production_enabled boolean DEFAULT false NOT NULL,
    configuration_status text DEFAULT 'DRAFT'::text NOT NULL,
    accounting_validated_at timestamp with time zone,
    accounting_validated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    CONSTRAINT company_fiscal_settings_configuration_status_check CHECK ((configuration_status = ANY (ARRAY['DRAFT'::text, 'PENDING_ACCOUNTING'::text, 'VALIDATED'::text, 'BLOCKED'::text]))),
    CONSTRAINT company_fiscal_settings_fiscal_environment_check CHECK ((fiscal_environment = ANY (ARRAY['NOT_CONFIGURED'::text, 'HOMOLOGATION'::text, 'PRODUCTION'::text]))),
    CONSTRAINT company_fiscal_settings_fiscal_provider_check CHECK ((fiscal_provider = ANY (ARRAY['NONE'::text, 'NOT_CONFIGURED'::text, 'FOCUS_NFE'::text, 'SEFAZ_DIRETO'::text, 'NFSE_NACIONAL'::text, 'MUNICIPAL'::text])))
);


--
-- Name: customer_fiscal_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_fiscal_profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_id uuid NOT NULL,
    taxpayer_indicator text,
    state_registration_status text,
    municipal_registration text,
    fiscal_email text,
    fiscal_phone text,
    use_main_address boolean DEFAULT true NOT NULL,
    fiscal_postal_code text,
    fiscal_street text,
    fiscal_number text,
    fiscal_complement text,
    fiscal_neighborhood text,
    fiscal_city text,
    fiscal_municipality_ibge_code text,
    fiscal_state text,
    country_code text DEFAULT 'BR'::text,
    rural_producer_indicator boolean DEFAULT false NOT NULL,
    foreign_customer_indicator boolean DEFAULT false NOT NULL,
    profile_status text DEFAULT 'INCOMPLETE'::text NOT NULL,
    validation_notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    CONSTRAINT customer_fiscal_profiles_profile_status_check CHECK ((profile_status = ANY (ARRAY['INCOMPLETE'::text, 'PENDING_REVIEW'::text, 'VALIDATED'::text, 'BLOCKED'::text])))
);


--
-- Name: financial_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.financial_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_type text NOT NULL,
    owner_id uuid NOT NULL,
    document_type text NOT NULL,
    file_name text NOT NULL,
    storage_path text NOT NULL,
    mime_type text,
    file_size bigint,
    uploaded_by uuid NOT NULL,
    uploaded_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by uuid,
    delete_reason text,
    fiscal_invoice_id uuid,
    document_origin text,
    fiscal_event_id uuid,
    file_category text,
    environment text,
    version_number integer,
    CONSTRAINT financial_documents_document_type_check CHECK ((document_type = ANY (ARRAY['COMPROVANTE'::text, 'BOLETO'::text, 'DANFE'::text, 'XML_NFE'::text, 'RECIBO'::text, 'CONTRATO'::text, 'OUTRO'::text, 'INVOICE'::text, 'RECEIPT'::text, 'XML'::text, 'OTHER'::text, 'CONTRACT'::text]))),
    CONSTRAINT financial_documents_owner_type_check CHECK ((owner_type = ANY (ARRAY['RECEIVABLE'::text, 'PAYABLE'::text, 'DELIVERY'::text, 'FISCAL_INVOICE'::text, 'PAYMENT_RECEIVABLE'::text, 'PAYMENT_PAYABLE'::text, 'FINANCIAL_RECEIPT'::text, 'REPORT_EXPORT'::text])))
);


--
-- Name: fiscal_audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fiscal_audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    table_name text NOT NULL,
    record_id uuid,
    action text NOT NULL,
    changed_by uuid,
    changed_at timestamp with time zone DEFAULT now() NOT NULL,
    old_values jsonb,
    new_values jsonb,
    CONSTRAINT fiscal_audit_log_action_check CHECK ((action = ANY (ARRAY['INSERT'::text, 'UPDATE'::text, 'DELETE'::text])))
);


--
-- Name: fiscal_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fiscal_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    fiscal_invoice_id uuid,
    event_type text NOT NULL,
    status_before text,
    status_after text,
    event_source text DEFAULT 'INTERNAL'::text NOT NULL,
    provider_event_id text,
    request_snapshot jsonb,
    response_snapshot jsonb,
    error_code text,
    error_message text,
    performed_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT fiscal_events_event_type_check CHECK ((event_type = ANY (ARRAY['CREATED'::text, 'MANUAL_UPDATED'::text, 'DOCUMENT_ATTACHED'::text, 'VALIDATION_REQUESTED'::text, 'VALIDATION_FAILED'::text, 'READY_FOR_FUTURE_INTEGRATION'::text, 'RECONCILIATION_REQUIRED'::text, 'RECONCILIATION_COMPLETED'::text, 'DOCUMENT_CANCELED_FINANCIAL_REVIEW_REQUIRED'::text, 'TOTAL_MISMATCH'::text, 'CUSTOMER_MISMATCH'::text, 'SOURCE_MISMATCH'::text, 'REPLACEMENT_REQUIRED'::text])))
);


--
-- Name: fiscal_idempotency_keys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fiscal_idempotency_keys (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    idempotency_key text NOT NULL,
    fiscal_invoice_id uuid,
    operation_type text NOT NULL,
    environment text,
    provider text,
    request_hash text,
    status text DEFAULT 'PENDING'::text NOT NULL,
    locked_at timestamp with time zone,
    expires_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT fiscal_idempotency_keys_environment_check CHECK ((environment = ANY (ARRAY['NOT_CONFIGURED'::text, 'HOMOLOGATION'::text, 'PRODUCTION'::text]))),
    CONSTRAINT fiscal_idempotency_keys_operation_type_check CHECK ((operation_type = ANY (ARRAY['PREPARE'::text, 'ISSUE'::text, 'STATUS'::text, 'CANCEL'::text, 'SUBSTITUTE'::text]))),
    CONSTRAINT fiscal_idempotency_keys_status_check CHECK ((status = ANY (ARRAY['PENDING'::text, 'LOCKED'::text, 'COMPLETED'::text, 'FAILED'::text, 'EXPIRED'::text])))
);


--
-- Name: fiscal_invoice_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fiscal_invoice_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    fiscal_invoice_id uuid NOT NULL,
    source_item_type text,
    source_item_id uuid,
    item_sequence integer NOT NULL,
    item_kind text NOT NULL,
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
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT fiscal_invoice_items_item_kind_check CHECK ((item_kind = ANY (ARRAY['PRODUCT'::text, 'SERVICE'::text, 'OTHER'::text])))
);


--
-- Name: fiscal_invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fiscal_invoices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    receivable_id uuid,
    delivery_id uuid,
    invoice_type text NOT NULL,
    invoice_number text,
    series text,
    access_key text,
    issue_date date,
    total_amount numeric(14,2),
    status text DEFAULT 'PENDING'::text NOT NULL,
    xml_document_id uuid,
    danfe_document_id uuid,
    notes text,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    document_model text,
    document_origin text,
    environment text,
    provider text,
    provider_reference text,
    idempotency_key text,
    normalized_status text,
    provider_status_raw text,
    source_type text,
    source_id uuid,
    parent_invoice_id uuid,
    substitution_invoice_id uuid,
    authorized_at timestamp with time zone,
    rejected_at timestamp with time zone,
    canceled_at timestamp with time zone,
    cancel_reason text,
    reconciliation_status text,
    company_snapshot jsonb,
    customer_snapshot jsonb,
    fiscal_totals_snapshot jsonb,
    payload_schema_version integer,
    locked_at timestamp with time zone,
    locked_by uuid,
    company_cnpj text,
    CONSTRAINT chk_fi_document_model CHECK (((document_model IS NULL) OR (document_model = ANY (ARRAY['NFE'::text, 'NFSE'::text, 'OTHER'::text])))),
    CONSTRAINT chk_fi_document_origin CHECK (((document_origin IS NULL) OR (document_origin = ANY (ARRAY['MANUAL_RECORD'::text, 'EXTERNAL_IMPORTED'::text, 'SYSTEM_PREPARED'::text, 'PROVIDER_INTEGRATED'::text])))),
    CONSTRAINT chk_fi_environment CHECK (((environment IS NULL) OR (environment = ANY (ARRAY['NOT_CONFIGURED'::text, 'HOMOLOGATION'::text, 'PRODUCTION'::text])))),
    CONSTRAINT chk_fi_normalized_status CHECK (((normalized_status IS NULL) OR (normalized_status = ANY (ARRAY['LEGACY_RECORDED'::text, 'DRAFT'::text, 'VALIDATING'::text, 'READY'::text, 'QUEUED'::text, 'PROCESSING'::text, 'AUTHORIZED'::text, 'REJECTED'::text, 'ERROR'::text, 'CANCEL_REQUESTED'::text, 'CANCELED'::text, 'SUBSTITUTED'::text])))),
    CONSTRAINT chk_fi_reconciliation_status CHECK (((reconciliation_status IS NULL) OR (reconciliation_status = ANY (ARRAY['NOT_APPLICABLE'::text, 'PENDING'::text, 'RECONCILED'::text, 'DIVERGENT'::text, 'REQUIRES_REVIEW'::text])))),
    CONSTRAINT fiscal_invoices_invoice_type_check CHECK ((invoice_type = ANY (ARRAY['NFE'::text, 'NFSE'::text, 'NFCE'::text, 'OUTRO'::text]))),
    CONSTRAINT fiscal_invoices_status_check CHECK ((status = ANY (ARRAY['PENDING'::text, 'ISSUED'::text, 'CANCELED'::text, 'ERROR'::text])))
);


--
-- Name: product_fiscal_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_fiscal_profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
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
    profile_status text DEFAULT 'DRAFT'::text NOT NULL,
    accounting_notes text,
    accounting_validated_at timestamp with time zone,
    accounting_validated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    CONSTRAINT product_fiscal_profiles_profile_status_check CHECK ((profile_status = ANY (ARRAY['DRAFT'::text, 'PENDING_ACCOUNTING'::text, 'VALIDATED'::text, 'BLOCKED'::text, 'NOT_FISCALLY_SOLD'::text])))
);


--
-- Name: service_fiscal_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.service_fiscal_profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    service_id uuid,
    source_reference text,
    is_active boolean DEFAULT true NOT NULL,
    service_name text,
    fiscal_description_template text,
    national_taxation_code text,
    municipal_taxation_code text,
    lc116_item text,
    cnae text,
    iss_rate numeric(6,4),
    iss_withheld_default boolean DEFAULT false NOT NULL,
    incidence_municipality_ibge_code text,
    requirement_status text,
    federal_withholding_defaults jsonb,
    profile_status text DEFAULT 'DRAFT'::text NOT NULL,
    accounting_notes text,
    accounting_validated_at timestamp with time zone,
    accounting_validated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    CONSTRAINT chk_service_ref CHECK (((service_id IS NOT NULL) OR (source_reference IS NOT NULL))),
    CONSTRAINT service_fiscal_profiles_profile_status_check CHECK ((profile_status = ANY (ARRAY['DRAFT'::text, 'PENDING_ACCOUNTING'::text, 'VALIDATED'::text, 'BLOCKED'::text, 'NOT_FISCALLY_BILLED'::text])))
);


--
-- Name: company_fiscal_settings company_fiscal_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_fiscal_settings
    ADD CONSTRAINT company_fiscal_settings_pkey PRIMARY KEY (id);


--
-- Name: customer_fiscal_profiles customer_fiscal_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_fiscal_profiles
    ADD CONSTRAINT customer_fiscal_profiles_pkey PRIMARY KEY (id);


--
-- Name: financial_documents financial_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_documents
    ADD CONSTRAINT financial_documents_pkey PRIMARY KEY (id);


--
-- Name: fiscal_audit_log fiscal_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fiscal_audit_log
    ADD CONSTRAINT fiscal_audit_log_pkey PRIMARY KEY (id);


--
-- Name: fiscal_events fiscal_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fiscal_events
    ADD CONSTRAINT fiscal_events_pkey PRIMARY KEY (id);


--
-- Name: fiscal_idempotency_keys fiscal_idempotency_keys_idempotency_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fiscal_idempotency_keys
    ADD CONSTRAINT fiscal_idempotency_keys_idempotency_key_key UNIQUE (idempotency_key);


--
-- Name: fiscal_idempotency_keys fiscal_idempotency_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fiscal_idempotency_keys
    ADD CONSTRAINT fiscal_idempotency_keys_pkey PRIMARY KEY (id);


--
-- Name: fiscal_invoice_items fiscal_invoice_items_fiscal_invoice_id_item_sequence_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fiscal_invoice_items
    ADD CONSTRAINT fiscal_invoice_items_fiscal_invoice_id_item_sequence_key UNIQUE (fiscal_invoice_id, item_sequence);


--
-- Name: fiscal_invoice_items fiscal_invoice_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fiscal_invoice_items
    ADD CONSTRAINT fiscal_invoice_items_pkey PRIMARY KEY (id);


--
-- Name: fiscal_invoices fiscal_invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fiscal_invoices
    ADD CONSTRAINT fiscal_invoices_pkey PRIMARY KEY (id);


--
-- Name: product_fiscal_profiles product_fiscal_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_fiscal_profiles
    ADD CONSTRAINT product_fiscal_profiles_pkey PRIMARY KEY (id);


--
-- Name: service_fiscal_profiles service_fiscal_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_fiscal_profiles
    ADD CONSTRAINT service_fiscal_profiles_pkey PRIMARY KEY (id);


--
-- Name: idx_fd_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fd_owner ON public.financial_documents USING btree (owner_type, owner_id);


--
-- Name: idx_fi_receivable; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fi_receivable ON public.fiscal_invoices USING btree (receivable_id);


--
-- Name: idx_fi_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fi_status ON public.fiscal_invoices USING btree (status);


--
-- Name: idx_fin_docs_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_docs_owner ON public.financial_documents USING btree (owner_type, owner_id);


--
-- Name: idx_findocs_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_findocs_owner ON public.financial_documents USING btree (owner_type, owner_id);


--
-- Name: ix_fiscal_audit_log_changed_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_fiscal_audit_log_changed_at ON public.fiscal_audit_log USING btree (changed_at DESC);


--
-- Name: ix_fiscal_audit_log_table_record; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_fiscal_audit_log_table_record ON public.fiscal_audit_log USING btree (table_name, record_id);


--
-- Name: ix_fiscal_events_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_fiscal_events_created_at ON public.fiscal_events USING btree (created_at DESC);


--
-- Name: ix_fiscal_events_invoice; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_fiscal_events_invoice ON public.fiscal_events USING btree (fiscal_invoice_id);


--
-- Name: ux_company_fiscal_settings_active_singleton; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_company_fiscal_settings_active_singleton ON public.company_fiscal_settings USING btree ((true)) WHERE (is_active = true);


--
-- Name: ux_customer_fiscal_profiles_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_customer_fiscal_profiles_customer ON public.customer_fiscal_profiles USING btree (customer_id);


--
-- Name: ux_fi_access_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_fi_access_key ON public.fiscal_invoices USING btree (access_key) WHERE (access_key IS NOT NULL);


--
-- Name: ux_fi_doc_model_series_number_company; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_fi_doc_model_series_number_company ON public.fiscal_invoices USING btree (document_model, series, invoice_number, company_cnpj) WHERE ((document_model IS NOT NULL) AND (series IS NOT NULL) AND (invoice_number IS NOT NULL) AND (company_cnpj IS NOT NULL));


--
-- Name: ux_fi_idempotency_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_fi_idempotency_key ON public.fiscal_invoices USING btree (idempotency_key) WHERE (idempotency_key IS NOT NULL);


--
-- Name: ux_fi_provider_ref; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_fi_provider_ref ON public.fiscal_invoices USING btree (provider, environment, provider_reference) WHERE (provider_reference IS NOT NULL);


--
-- Name: ux_product_fiscal_profiles_active; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_product_fiscal_profiles_active ON public.product_fiscal_profiles USING btree (product_id) WHERE (is_active = true);


--
-- Name: financial_documents trg_audit_findocs; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_findocs AFTER INSERT OR DELETE ON public.financial_documents FOR EACH ROW EXECUTE FUNCTION public.fn_audit_financial_documents();


--
-- Name: fiscal_invoices trg_audit_fiscal_status; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_fiscal_status AFTER UPDATE ON public.fiscal_invoices FOR EACH ROW EXECUTE FUNCTION public.fn_audit_fiscal_status();


--
-- Name: financial_documents trg_fd_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_fd_audit AFTER INSERT OR DELETE OR UPDATE ON public.financial_documents FOR EACH ROW EXECUTE FUNCTION public.fn_financial_audit();


--
-- Name: fiscal_invoices trg_fi_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_fi_audit AFTER INSERT OR DELETE OR UPDATE ON public.fiscal_invoices FOR EACH ROW EXECUTE FUNCTION public.fn_financial_audit();


--
-- Name: fiscal_invoices trg_fi_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_fi_updated BEFORE UPDATE ON public.fiscal_invoices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: company_fiscal_settings trg_fiscal_audit_company_fiscal_settings; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_fiscal_audit_company_fiscal_settings AFTER INSERT OR DELETE OR UPDATE ON public.company_fiscal_settings FOR EACH ROW EXECUTE FUNCTION public.fiscal_audit_trigger();


--
-- Name: customer_fiscal_profiles trg_fiscal_audit_customer_fiscal_profiles; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_fiscal_audit_customer_fiscal_profiles AFTER INSERT OR DELETE OR UPDATE ON public.customer_fiscal_profiles FOR EACH ROW EXECUTE FUNCTION public.fiscal_audit_trigger();


--
-- Name: fiscal_events trg_fiscal_audit_fiscal_events; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_fiscal_audit_fiscal_events AFTER INSERT OR DELETE OR UPDATE ON public.fiscal_events FOR EACH ROW EXECUTE FUNCTION public.fiscal_audit_trigger();


--
-- Name: fiscal_idempotency_keys trg_fiscal_audit_fiscal_idempotency_keys; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_fiscal_audit_fiscal_idempotency_keys AFTER INSERT OR DELETE OR UPDATE ON public.fiscal_idempotency_keys FOR EACH ROW EXECUTE FUNCTION public.fiscal_audit_trigger();


--
-- Name: fiscal_invoice_items trg_fiscal_audit_fiscal_invoice_items; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_fiscal_audit_fiscal_invoice_items AFTER INSERT OR DELETE OR UPDATE ON public.fiscal_invoice_items FOR EACH ROW EXECUTE FUNCTION public.fiscal_audit_trigger();


--
-- Name: fiscal_invoices trg_fiscal_audit_fiscal_invoices; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_fiscal_audit_fiscal_invoices AFTER INSERT OR DELETE OR UPDATE ON public.fiscal_invoices FOR EACH ROW EXECUTE FUNCTION public.fiscal_audit_trigger();


--
-- Name: product_fiscal_profiles trg_fiscal_audit_product_fiscal_profiles; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_fiscal_audit_product_fiscal_profiles AFTER INSERT OR DELETE OR UPDATE ON public.product_fiscal_profiles FOR EACH ROW EXECUTE FUNCTION public.fiscal_audit_trigger();


--
-- Name: service_fiscal_profiles trg_fiscal_audit_service_fiscal_profiles; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_fiscal_audit_service_fiscal_profiles AFTER INSERT OR DELETE OR UPDATE ON public.service_fiscal_profiles FOR EACH ROW EXECUTE FUNCTION public.fiscal_audit_trigger();


--
-- Name: financial_documents financial_documents_deleted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_documents
    ADD CONSTRAINT financial_documents_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES auth.users(id);


--
-- Name: financial_documents financial_documents_fiscal_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_documents
    ADD CONSTRAINT financial_documents_fiscal_event_id_fkey FOREIGN KEY (fiscal_event_id) REFERENCES public.fiscal_events(id) ON DELETE SET NULL;


--
-- Name: financial_documents financial_documents_fiscal_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_documents
    ADD CONSTRAINT financial_documents_fiscal_invoice_id_fkey FOREIGN KEY (fiscal_invoice_id) REFERENCES public.fiscal_invoices(id) ON DELETE SET NULL;


--
-- Name: financial_documents financial_documents_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_documents
    ADD CONSTRAINT financial_documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES auth.users(id);


--
-- Name: fiscal_events fiscal_events_fiscal_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fiscal_events
    ADD CONSTRAINT fiscal_events_fiscal_invoice_id_fkey FOREIGN KEY (fiscal_invoice_id) REFERENCES public.fiscal_invoices(id) ON DELETE CASCADE;


--
-- Name: fiscal_idempotency_keys fiscal_idempotency_keys_fiscal_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fiscal_idempotency_keys
    ADD CONSTRAINT fiscal_idempotency_keys_fiscal_invoice_id_fkey FOREIGN KEY (fiscal_invoice_id) REFERENCES public.fiscal_invoices(id) ON DELETE SET NULL;


--
-- Name: fiscal_invoice_items fiscal_invoice_items_fiscal_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fiscal_invoice_items
    ADD CONSTRAINT fiscal_invoice_items_fiscal_invoice_id_fkey FOREIGN KEY (fiscal_invoice_id) REFERENCES public.fiscal_invoices(id) ON DELETE CASCADE;


--
-- Name: fiscal_invoices fiscal_invoices_danfe_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fiscal_invoices
    ADD CONSTRAINT fiscal_invoices_danfe_document_id_fkey FOREIGN KEY (danfe_document_id) REFERENCES public.financial_documents(id);


--
-- Name: fiscal_invoices fiscal_invoices_delivery_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fiscal_invoices
    ADD CONSTRAINT fiscal_invoices_delivery_id_fkey FOREIGN KEY (delivery_id) REFERENCES public.entregas(id) ON DELETE SET NULL;


--
-- Name: fiscal_invoices fiscal_invoices_receivable_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fiscal_invoices
    ADD CONSTRAINT fiscal_invoices_receivable_id_fkey FOREIGN KEY (receivable_id) REFERENCES public.accounts_receivable(id) ON DELETE SET NULL;


--
-- Name: fiscal_invoices fiscal_invoices_xml_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fiscal_invoices
    ADD CONSTRAINT fiscal_invoices_xml_document_id_fkey FOREIGN KEY (xml_document_id) REFERENCES public.financial_documents(id);


--
-- Name: financial_documents Financial staff full access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Financial staff full access" ON public.financial_documents TO authenticated USING (public.is_financial_staff(auth.uid())) WITH CHECK (public.is_financial_staff(auth.uid()));


--
-- Name: financial_documents Staff can view non-deleted documents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can view non-deleted documents" ON public.financial_documents FOR SELECT TO authenticated USING (((deleted_at IS NULL) AND (EXISTS ( SELECT 1
   FROM public.user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = ANY (ARRAY['administrador'::public.app_role, 'gestor'::public.app_role, 'administrativo'::public.app_role, 'financeiro'::public.app_role])))))));


--
-- Name: company_fiscal_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.company_fiscal_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: company_fiscal_settings company_fiscal_settings_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_fiscal_settings_read ON public.company_fiscal_settings FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'administrador'::public.app_role) OR public.has_role(auth.uid(), 'gestor'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role)));


--
-- Name: company_fiscal_settings company_fiscal_settings_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_fiscal_settings_write ON public.company_fiscal_settings TO authenticated USING (public.has_role(auth.uid(), 'administrador'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'administrador'::public.app_role));


--
-- Name: customer_fiscal_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.customer_fiscal_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: customer_fiscal_profiles customer_fiscal_profiles_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY customer_fiscal_profiles_read ON public.customer_fiscal_profiles FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'administrador'::public.app_role) OR public.has_role(auth.uid(), 'gestor'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role)));


--
-- Name: customer_fiscal_profiles customer_fiscal_profiles_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY customer_fiscal_profiles_write ON public.customer_fiscal_profiles TO authenticated USING ((public.has_role(auth.uid(), 'administrador'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role))) WITH CHECK ((public.has_role(auth.uid(), 'administrador'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role)));


--
-- Name: financial_documents fd_producer_read_own_ar; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fd_producer_read_own_ar ON public.financial_documents FOR SELECT TO authenticated USING (((owner_type = 'RECEIVABLE'::text) AND public.has_role(auth.uid(), 'cliente_produtor'::public.app_role) AND (EXISTS ( SELECT 1
   FROM public.accounts_receivable ar
  WHERE ((ar.id = financial_documents.owner_id) AND (ar.customer_id = ANY (public.get_cliente_ids_for_user(auth.uid()))))))));


--
-- Name: financial_documents fd_staff_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fd_staff_all ON public.financial_documents TO authenticated USING (public.is_financial_staff(auth.uid())) WITH CHECK (public.is_financial_staff(auth.uid()));


--
-- Name: fiscal_invoices fi_producer_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fi_producer_read ON public.fiscal_invoices FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'cliente_produtor'::public.app_role) AND (receivable_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.accounts_receivable ar
  WHERE ((ar.id = fiscal_invoices.receivable_id) AND (ar.customer_id = ANY (public.get_cliente_ids_for_user(auth.uid()))))))));


--
-- Name: fiscal_invoices fi_staff_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fi_staff_all ON public.fiscal_invoices TO authenticated USING (public.is_financial_staff(auth.uid())) WITH CHECK (public.is_financial_staff(auth.uid()));


--
-- Name: financial_documents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.financial_documents ENABLE ROW LEVEL SECURITY;

--
-- Name: fiscal_audit_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fiscal_audit_log ENABLE ROW LEVEL SECURITY;

--
-- Name: fiscal_audit_log fiscal_audit_log_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fiscal_audit_log_read ON public.fiscal_audit_log FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'administrador'::public.app_role));


--
-- Name: fiscal_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fiscal_events ENABLE ROW LEVEL SECURITY;

--
-- Name: fiscal_events fiscal_events_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fiscal_events_insert ON public.fiscal_events FOR INSERT TO authenticated WITH CHECK ((public.has_role(auth.uid(), 'administrador'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role) OR public.has_role(auth.uid(), 'gestor'::public.app_role)));


--
-- Name: fiscal_events fiscal_events_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fiscal_events_read ON public.fiscal_events FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'administrador'::public.app_role) OR public.has_role(auth.uid(), 'gestor'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role)));


--
-- Name: fiscal_idempotency_keys; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fiscal_idempotency_keys ENABLE ROW LEVEL SECURITY;

--
-- Name: fiscal_idempotency_keys fiscal_idempotency_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fiscal_idempotency_read ON public.fiscal_idempotency_keys FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'administrador'::public.app_role));


--
-- Name: fiscal_invoice_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fiscal_invoice_items ENABLE ROW LEVEL SECURITY;

--
-- Name: fiscal_invoice_items fiscal_invoice_items_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fiscal_invoice_items_read ON public.fiscal_invoice_items FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'administrador'::public.app_role) OR public.has_role(auth.uid(), 'gestor'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role) OR public.has_role(auth.uid(), 'administrativo'::public.app_role)));


--
-- Name: fiscal_invoice_items fiscal_invoice_items_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fiscal_invoice_items_write ON public.fiscal_invoice_items TO authenticated USING ((public.has_role(auth.uid(), 'administrador'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role))) WITH CHECK ((public.has_role(auth.uid(), 'administrador'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role)));


--
-- Name: fiscal_invoices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fiscal_invoices ENABLE ROW LEVEL SECURITY;

--
-- Name: product_fiscal_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_fiscal_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: product_fiscal_profiles product_fiscal_profiles_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY product_fiscal_profiles_read ON public.product_fiscal_profiles FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'administrador'::public.app_role) OR public.has_role(auth.uid(), 'gestor'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role)));


--
-- Name: product_fiscal_profiles product_fiscal_profiles_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY product_fiscal_profiles_write ON public.product_fiscal_profiles TO authenticated USING ((public.has_role(auth.uid(), 'administrador'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role))) WITH CHECK ((public.has_role(auth.uid(), 'administrador'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role)));


--
-- Name: service_fiscal_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.service_fiscal_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: service_fiscal_profiles service_fiscal_profiles_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_fiscal_profiles_read ON public.service_fiscal_profiles FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'administrador'::public.app_role) OR public.has_role(auth.uid(), 'gestor'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role)));


--
-- Name: service_fiscal_profiles service_fiscal_profiles_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_fiscal_profiles_write ON public.service_fiscal_profiles TO authenticated USING ((public.has_role(auth.uid(), 'administrador'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role))) WITH CHECK ((public.has_role(auth.uid(), 'administrador'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role)));


--
-- PostgreSQL database dump complete
--

\unrestrict OUNIU04UsI3m0J5Rpybeki8qiEdLe9Robz3fA0FGNjq6HtF1MEQ3fOJOE17fkgb

