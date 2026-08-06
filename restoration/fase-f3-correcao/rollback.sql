-- =====================================================================
-- FASE F3 — CORREÇÃO DA AUDITORIA — ROLLBACK CONTROLADO
-- STAGING ikaauvsflpmamgxmkhoq. Produção navfzbwgwzruipouyfnk PROIBIDA.
-- Reverte APENAS os endurecimentos da correção (20260817000000..030000).
-- Não apaga dados, documentos, reservas, regras nem trilha de auditoria.
-- Executar com --single-transaction -v ON_ERROR_STOP=1.
-- =====================================================================

-- 1) Idempotência/numeração: volta ao escopo anterior (menos seguro).
DROP INDEX IF EXISTS public.fnr_unique_idempotency_scoped;
CREATE UNIQUE INDEX IF NOT EXISTS fnr_unique_idempotency
  ON public.fiscal_number_reservations (idempotency_key);
DROP TRIGGER IF EXISTS trg_fiscal_reservation_immutable ON public.fiscal_number_reservations;
ALTER TABLE public.fiscal_number_reservations DROP CONSTRAINT IF EXISTS fnr_tp_emis_chk;
ALTER TABLE public.fiscal_invoices DROP CONSTRAINT IF EXISTS fiscal_invoices_tp_emis_chk;

-- 2) Motor tributário: remove constraints introduzidas pela correção.
ALTER TABLE public.fiscal_tax_rules DROP CONSTRAINT IF EXISTS ftr_base_components_chk;
ALTER TABLE public.fiscal_tax_rules DROP CONSTRAINT IF EXISTS ftr_st_modality_chk;
ALTER TABLE public.fiscal_tax_rules DROP CONSTRAINT IF EXISTS ftr_crt_cst_csosn_chk;
ALTER TABLE public.fiscal_tax_rules DROP CONSTRAINT IF EXISTS ftr_rtc_not_publishable_chk;
ALTER TABLE public.company_fiscal_settings DROP CONSTRAINT IF EXISTS cfs_homologation_no_secret_chk;

-- 3) Auditoria adicional da correção.
DROP TRIGGER IF EXISTS trg_f3_audit_fiscal_tax_rules ON public.fiscal_tax_rules;
DROP TRIGGER IF EXISTS trg_f3_audit_fiscal_operation_policies ON public.fiscal_operation_policies;
DROP TRIGGER IF EXISTS trg_f3_audit_fiscal_number_reservations ON public.fiscal_number_reservations;

-- 4) Políticas RLS criadas pela correção.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'fiscal_number_reservations','fiscal_tax_rules','fiscal_operation_policies',
    'fiscal_calculation_runs','fiscal_document_series','fiscal_rule_sod_overrides']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'f3_internal_read_'||t, t);
  END LOOP;
END $$;

-- 5) Colunas adicionadas permanecem (drop destruiria dados já gravados).
--    Removê-las exige autorização humana explícita e nova migration.

-- 6) Registro do rollback no ledger de migrations.
DELETE FROM supabase_migrations.schema_migrations
 WHERE version IN ('20260817000000','20260817010000','20260817020000','20260817030000');

DO $$
BEGIN
  RAISE NOTICE 'ROLLBACK F3-CORRECAO aplicado. Funcoes permanecem na versao corrigida; reaplique a fase F3 original se precisar do comportamento anterior.';
END $$;
