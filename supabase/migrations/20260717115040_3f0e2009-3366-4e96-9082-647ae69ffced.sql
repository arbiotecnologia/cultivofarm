
-- Fase 12.8 · Fase 3 · Fechamento: revogar mutations diretas em visitas_checkin.
-- Todas as escritas devem passar por rpc_realizar_checkin_visita ou rpc_realizar_checkout_visita.

REVOKE INSERT, UPDATE, DELETE ON public.visitas_checkin FROM authenticated;
-- SELECT permanece para leitura na UI; RLS continua vigente.
-- service_role mantém ALL para uso em edge functions e admin.
GRANT ALL ON public.visitas_checkin TO service_role;
