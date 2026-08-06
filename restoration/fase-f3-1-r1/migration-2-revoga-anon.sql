-- =====================================================================
-- FASE F3.1-R1 — REVOGACAO DE EXECUTE ANON EM RPCs FISCAIS
-- STAGING ikaauvsflpmamgxmkhoq. Producao navfzbwgwzruipouyfnk PROIBIDA.
-- Achado do runtime-harness (T54): cinco RPCs fiscais permaneciam
-- executaveis pelo papel anon. Nao altera comportamento para usuarios
-- autenticados nem toca em dados.
-- =====================================================================

REVOKE ALL ON FUNCTION public.rpc_fiscal_company_settings_init() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_fiscal_draft_save(uuid, jsonb, jsonb, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_fiscal_draft_validate_homologation(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_fiscal_certificate_register_os(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_fiscal_certificate_revoke(uuid, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.rpc_fiscal_company_settings_init() TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_fiscal_draft_save(uuid, jsonb, jsonb, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_fiscal_draft_validate_homologation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_fiscal_certificate_register_os(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_fiscal_certificate_revoke(uuid, text) TO authenticated;
