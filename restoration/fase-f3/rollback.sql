-- =====================================================================
-- FASE F3 — ROLLBACK (staging). Remove apenas objetos criados pela F3.
-- Não restaura dados; a F3 não altera dados de negócio.
-- =====================================================================
BEGIN;

DROP TRIGGER IF EXISTS tg_fiscal_tax_rules_audit ON public.fiscal_tax_rules;
DROP TRIGGER IF EXISTS tg_fiscal_operation_policies_audit ON public.fiscal_operation_policies;
DROP TRIGGER IF EXISTS tg_fiscal_number_reservations_audit ON public.fiscal_number_reservations;
DROP TRIGGER IF EXISTS tg_fiscal_document_series_audit ON public.fiscal_document_series;
DROP TRIGGER IF EXISTS trg_fiscal_emitter_readiness ON public.company_fiscal_settings;
DROP TRIGGER IF EXISTS trg_fiscal_recipient_readiness ON public.customer_fiscal_profiles;
DROP TRIGGER IF EXISTS trg_fiscal_operation_policy_immutable ON public.fiscal_operation_policies;
DROP TRIGGER IF EXISTS trg_fiscal_tax_rule_immutable ON public.fiscal_tax_rules;

DROP FUNCTION IF EXISTS public.rpc_fiscal_calculate_invoice_v1(uuid,text);
DROP FUNCTION IF EXISTS public.rpc_fiscal_reserve_nfe_number_v1(uuid,text);
DROP FUNCTION IF EXISTS public.rpc_fiscal_tax_rule_publish(uuid,text);
DROP FUNCTION IF EXISTS public.rpc_fiscal_operation_policy_publish(uuid,text);
DROP FUNCTION IF EXISTS public.rpc_fiscal_rule_sod_override(text,uuid,text);
DROP FUNCTION IF EXISTS public.rpc_fiscal_nfe_readiness_v1();
DROP FUNCTION IF EXISTS public.rpc_fiscal_emitter_request_accounting_review(text);
DROP FUNCTION IF EXISTS public.rpc_fiscal_emitter_accounting_validate(text);
DROP FUNCTION IF EXISTS public.tg_fiscal_emitter_refresh_readiness();
DROP FUNCTION IF EXISTS public.tg_fiscal_recipient_refresh_readiness();
DROP FUNCTION IF EXISTS public.tg_fiscal_operation_policy_immutable();
DROP FUNCTION IF EXISTS public.tg_fiscal_tax_rule_immutable();
DROP FUNCTION IF EXISTS public.fn_fiscal_apply_tax(public.fiscal_tax_rules, numeric);
DROP FUNCTION IF EXISTS public.fn_fiscal_resolve_tax_rule(text,text,text,text,text,text,boolean,text,date);
DROP FUNCTION IF EXISTS public.fn_fiscal_resolve_operation(text,text,text,text,boolean,text,text,text,text,date);
DROP FUNCTION IF EXISTS public.fn_fiscal_invoice_eligibility(text,uuid);
DROP FUNCTION IF EXISTS public.fn_fiscal_emitter_status(uuid);
DROP FUNCTION IF EXISTS public.fn_fiscal_emitter_pendencies(uuid);
DROP FUNCTION IF EXISTS public.fn_fiscal_emitter_pendencies_row(public.company_fiscal_settings);
DROP FUNCTION IF EXISTS public.fn_fiscal_recipient_pendencies_row(public.customer_fiscal_profiles);
DROP FUNCTION IF EXISTS public.fn_fiscal_access_key_dv(text);
DROP FUNCTION IF EXISTS public.fn_fiscal_ie_check(text,text);
DROP FUNCTION IF EXISTS public.fn_fiscal_cep_is_valid(text);
DROP FUNCTION IF EXISTS public.fn_fiscal_ibge_municipio_coerente(text,text);
DROP FUNCTION IF EXISTS public.fn_fiscal_uf_ibge_code(text);
DROP FUNCTION IF EXISTS public.fn_fiscal_cpf_is_valid(text);
DROP FUNCTION IF EXISTS public.fn_fiscal_cnpj_is_valid(text);
DROP FUNCTION IF EXISTS public.fn_fiscal_round(numeric);
DROP FUNCTION IF EXISTS public.fn_fiscal_digits(text);

DROP VIEW IF EXISTS public.v_fiscal_nfe_rule_coverage;
DROP VIEW IF EXISTS public.v_fiscal_nfe_recipient_readiness;
DROP VIEW IF EXISTS public.v_fiscal_nfe_emitter_readiness;

DROP INDEX IF EXISTS public.ux_fiscal_invoice_scope_nfe;
DROP INDEX IF EXISTS public.ix_fop_resolution;

DROP TABLE IF EXISTS public.fiscal_calculation_runs;
DROP TABLE IF EXISTS public.fiscal_number_reservations;
DROP TABLE IF EXISTS public.fiscal_document_series;
DROP TABLE IF EXISTS public.fiscal_rule_sod_overrides;
DROP TABLE IF EXISTS public.fiscal_tax_rules;

ALTER TABLE public.fiscal_operation_policies
  DROP CONSTRAINT IF EXISTS fop_direction_domain,
  DROP CONSTRAINT IF EXISTS fop_cfop_format,
  DROP CONSTRAINT IF EXISTS fop_crt_domain,
  DROP CONSTRAINT IF EXISTS fop_ufs_domain,
  DROP CONSTRAINT IF EXISTS fop_status_domain,
  DROP CONSTRAINT IF EXISTS fop_published_requires_evidence,
  DROP CONSTRAINT IF EXISTS fop_fin_nfe_domain,
  DROP CONSTRAINT IF EXISTS fop_presence_domain,
  DROP COLUMN IF EXISTS direction, DROP COLUMN IF EXISTS fin_nfe,
  DROP COLUMN IF EXISTS nature_operation, DROP COLUMN IF EXISTS presence_indicator,
  DROP COLUMN IF EXISTS final_consumer, DROP COLUMN IF EXISTS taxpayer_indicator,
  DROP COLUMN IF EXISTS origin_uf, DROP COLUMN IF EXISTS destination_uf,
  DROP COLUMN IF EXISTS cfop, DROP COLUMN IF EXISTS crt,
  DROP COLUMN IF EXISTS ncm_prefix, DROP COLUMN IF EXISTS product_category,
  DROP COLUMN IF EXISTS priority, DROP COLUMN IF EXISTS source_id,
  DROP COLUMN IF EXISTS legal_version, DROP COLUMN IF EXISTS policy_status,
  DROP COLUMN IF EXISTS published_at, DROP COLUMN IF EXISTS published_by,
  DROP COLUMN IF EXISTS prepared_by;

ALTER TABLE public.customer_fiscal_profiles
  DROP CONSTRAINT IF EXISTS cfp_person_type_domain,
  DROP CONSTRAINT IF EXISTS cfp_nfe_readiness_domain,
  DROP CONSTRAINT IF EXISTS cfp_nfe_readiness_pendencies_shape,
  DROP COLUMN IF EXISTS person_type, DROP COLUMN IF EXISTS cpf_cnpj,
  DROP COLUMN IF EXISTS legal_name, DROP COLUMN IF EXISTS state_registration,
  DROP COLUMN IF EXISTS final_consumer, DROP COLUMN IF EXISTS icms_taxpayer,
  DROP COLUMN IF EXISTS nfe_readiness_status, DROP COLUMN IF EXISTS nfe_readiness_pendencies,
  DROP COLUMN IF EXISTS nfe_readiness_checked_at;

ALTER TABLE public.company_fiscal_settings
  DROP CONSTRAINT IF EXISTS cfs_nfe_series_number_range,
  DROP CONSTRAINT IF EXISTS cfs_nfe_environment_code_domain,
  DROP CONSTRAINT IF EXISTS cfs_crt_domain,
  DROP CONSTRAINT IF EXISTS cfs_pis_cofins_regime_domain,
  DROP CONSTRAINT IF EXISTS cfs_uf_accreditations_shape,
  DROP CONSTRAINT IF EXISTS cfs_nfe_readiness_domain,
  DROP CONSTRAINT IF EXISTS cfs_nfe_readiness_pendencies_shape,
  DROP COLUMN IF EXISTS nfe_series_number, DROP COLUMN IF EXISTS nfe_environment_code,
  DROP COLUMN IF EXISTS uf_accreditations, DROP COLUMN IF EXISTS pis_cofins_regime,
  DROP COLUMN IF EXISTS ipi_taxpayer, DROP COLUMN IF EXISTS icms_st_responsible,
  DROP COLUMN IF EXISTS fcp_applicable, DROP COLUMN IF EXISTS difal_responsible,
  DROP COLUMN IF EXISTS rtc_scaffolding_enabled, DROP COLUMN IF EXISTS nfe_readiness_status,
  DROP COLUMN IF EXISTS nfe_readiness_checked_at, DROP COLUMN IF EXISTS nfe_readiness_pendencies;

DELETE FROM public.fiscal_official_sources
 WHERE source_key IN ('MOC_NFE_70','PORTAL_NFE_SCHEMAS_NT','PORTAL_NFE_SERVICOS_UF','RFB_NCM_TIPI','GUIA_EFD_ICMS_IPI_322');

-- Restaura a lista original de tabelas auditadas.
CREATE OR REPLACE FUNCTION public.fiscal_audit_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE
  v_actor uuid;
  v_allowed text[] := ARRAY[
    'company_fiscal_settings','product_fiscal_profiles','service_fiscal_profiles',
    'customer_fiscal_profiles','fiscal_invoices','fiscal_invoice_items',
    'fiscal_events','fiscal_idempotency_keys'
  ];
BEGIN
  IF NOT (TG_TABLE_NAME = ANY(v_allowed)) THEN RETURN COALESCE(NEW, OLD); END IF;
  BEGIN v_actor := auth.uid(); EXCEPTION WHEN OTHERS THEN v_actor := NULL; END;
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.fiscal_audit_log(table_name, record_id, action, changed_by, new_values)
    VALUES (TG_TABLE_NAME, NEW.id, 'INSERT', v_actor, public.mask_sensitive_jsonb(to_jsonb(NEW)));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.fiscal_audit_log(table_name, record_id, action, changed_by, old_values, new_values)
    VALUES (TG_TABLE_NAME, NEW.id, 'UPDATE', v_actor,
            public.mask_sensitive_jsonb(to_jsonb(OLD)), public.mask_sensitive_jsonb(to_jsonb(NEW)));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.fiscal_audit_log(table_name, record_id, action, changed_by, old_values)
    VALUES (TG_TABLE_NAME, OLD.id, 'DELETE', v_actor, public.mask_sensitive_jsonb(to_jsonb(OLD)));
    RETURN OLD;
  END IF;
  RETURN NULL;
END $$;

DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260816000000';

COMMIT;
