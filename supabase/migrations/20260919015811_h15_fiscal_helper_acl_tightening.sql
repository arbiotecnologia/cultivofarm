-- H15 pós-auditoria: endurecimento de ACL dos helpers internos.
-- Helpers sao usados internamente por funcoes SECURITY DEFINER, politicas e triggers;
-- nao devem ser executaveis diretamente por sessoes autenticadas.
REVOKE EXECUTE ON FUNCTION public.h15_active_company() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.h15_require_staff() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.h15_require_company(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.h15_require_invoice(uuid) FROM authenticated;
