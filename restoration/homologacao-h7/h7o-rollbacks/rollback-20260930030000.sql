-- H7O P4 ROLLBACK — SOMENTE PARA ENSAIO rollback→reapply em transação descartável.
-- Reverter security_invoker nas views protegidas reabre o achado ERROR (security_definer_view) do
-- Security Advisor e expõe dados sem RLS do chamador. NÃO executar fora de ensaio.
-- O estado "anterior" desta migration em staging já era security_invoker=true (H7N P0); a reversão
-- literal (security_invoker=false) é apresentada apenas para que o ensaio comprove que o forward
-- reconverte as cinco views.
begin;
ALTER VIEW public.vw_os_integridade_esteira        SET (security_invoker = false);
ALTER VIEW public.vw_esteira_laboratorio           SET (security_invoker = false);
ALTER VIEW public.vw_fluxo_visita_tecnica          SET (security_invoker = false);
ALTER VIEW public.vw_catalogo_ficha_produtos       SET (security_invoker = false);
ALTER VIEW public.vw_catalogo_ficha_microrganismos SET (security_invoker = false);
commit;
