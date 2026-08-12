-- ROLLBACK de 20260830000000_os_esteira_acl_hardening.sql (staging)
-- Restaura os grants amplos anteriores na view e remove pg_temp adicionado.
-- ATENÇÃO: reintroduz exposição a `anon`. Usar apenas em contingência.
GRANT ALL ON TABLE public.vw_os_integridade_esteira TO anon;
GRANT ALL ON TABLE public.vw_os_integridade_esteira TO authenticated;
ALTER FUNCTION public.rpc_validar_integridade_esteira(uuid, text, text) SET search_path = public, auth;
ALTER FUNCTION public.rpc_validar_integridade_esteira(text, uuid) SET search_path = public;
ALTER FUNCTION public.rpc_cockpit_metricas_v1() SET search_path = public;
ALTER FUNCTION public.rpc_cockpit_metricas_v2(text, text[], text[], text[], boolean, date, date) SET search_path = public;
ALTER FUNCTION public.rpc_bi_esteira_resumo(timestamptz, timestamptz, uuid, uuid, uuid, uuid, text, text) SET search_path = public;
