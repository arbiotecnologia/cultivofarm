-- Rollback deny-only: para de registrar, mantém coluna, dados e histórico.
DROP TRIGGER IF EXISTS company_fiscal_pis_cofins_history_record ON public.company_fiscal_settings;
REVOKE ALL ON public.company_fiscal_pis_cofins_history FROM PUBLIC, anon, authenticated;
