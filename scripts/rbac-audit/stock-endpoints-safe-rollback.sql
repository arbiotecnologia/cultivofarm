-- DOCUMENTAL ONLY. Official migration on canonical swzpzcwiasxmjutrmvkm.
-- Preserve all bodies, policies, helper ACL and rows.
REVOKE EXECUTE ON FUNCTION public.rpc_estoque_operar_v1(text,uuid,numeric,text,jsonb) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.rpc_estoque_reservar_v1(uuid,text,jsonb,text,jsonb) FROM authenticated;
