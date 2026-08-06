-- =====================================================================
-- FASE F3.1 — ROLLBACK CONTROLADO
-- STAGING ikaauvsflpmamgxmkhoq. Produção navfzbwgwzruipouyfnk PROIBIDA.
-- Reverte APENAS os endurecimentos de 20260818000000.
-- NÃO apaga reservas, snapshots, documentos, regras nem trilha de auditoria.
-- Executar com --single-transaction -v ON_ERROR_STOP=1.
-- =====================================================================

-- 1) Guarda de evidência de homologação (endurecimento desta fase).
DROP TRIGGER IF EXISTS trg_fiscal_homologation_evidence_guard ON public.company_fiscal_settings;
DROP FUNCTION IF EXISTS public.tg_fiscal_homologation_evidence_guard();

-- 2) Funções introduzidas nesta fase.
--    Removidas apenas se nenhum objeto remanescente depender delas.
DROP FUNCTION IF EXISTS public.fn_fiscal_rule_validate_synthetic(text, public.fiscal_tax_rules, jsonb);
-- fn_fiscal_assert_debtor_recipient / fn_fiscal_partner_fiscal_customer só podem
-- ser removidas após restaurar as RPCs anteriores (passo 3), pois são chamadas por elas.

-- 3) RPCs e triggers: reaplique a fase anterior para voltar ao comportamento de
--    20260817030000. Os arquivos canônicos são:
--      supabase/migrations/20260817000000_fase_f3_correcao_auditoria.sql
--      supabase/migrations/20260817020000_fase_f3_correcao_fcpst.sql
--      supabase/migrations/20260817030000_fase_f3_correcao_calcmode.sql
--    Todas são CREATE OR REPLACE e idempotentes.
DO $$
BEGIN
  RAISE NOTICE 'ROLLBACK F3.1: reaplique 20260817000000/020000/030000 para restaurar rpc_fiscal_calculate_invoice_v1, rpc_fiscal_reserve_nfe_number_v1, fn_fiscal_scenario_coverage, rpc_fiscal_nfe_readiness_v1 e tg_fiscal_emitter_refresh_readiness.';
END $$;

-- 4) RLS: recria as policies SELECT removidas somente se a política interna
--    canônica não existir (evita ficar sem leitura alguma).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'fiscal_calculation_runs','fiscal_document_series','fiscal_number_reservations',
    'fiscal_tax_rules','fiscal_rule_sod_overrides','fiscal_operation_policies']
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t
                     AND policyname='f3_internal_read_'||t) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.fn_fiscal_can_read_internal())',
        'f3_internal_read_'||t, t);
    END IF;
  END LOOP;
END $$;

-- 5) Fontes oficiais: URLs anteriores (também específicas, sem home genérica).
UPDATE public.fiscal_official_sources SET url =
  'https://www.nfe.fazenda.gov.br/portal/listaConteudo.aspx?tipoConteudo=33ol5hhSYZk=', updated_at = now()
 WHERE source_key = 'MOC_NFE_70';
UPDATE public.fiscal_official_sources SET url =
  'https://www.nfe.fazenda.gov.br/portal/listaConteudo.aspx?tipoConteudo=/fwLvLUSmU8=', updated_at = now()
 WHERE source_key = 'PORTAL_NFE_SCHEMAS_NT';
UPDATE public.fiscal_official_sources SET url =
  'https://www.nfe.fazenda.gov.br/portal/webServices.aspx', updated_at = now()
 WHERE source_key = 'PORTAL_NFE_SERVICOS_UF';

-- 6) Ledger.
DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260818000000';

DO $$
BEGIN
  RAISE NOTICE 'ROLLBACK F3.1 aplicado. Nenhuma reserva, snapshot, documento ou trilha foi removida.';
END $$;
