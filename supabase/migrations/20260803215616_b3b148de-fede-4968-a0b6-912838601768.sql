
ALTER FUNCTION public.rpc_entrega_gerar_termo_v1(uuid, text) SET search_path TO 'public', 'extensions';
ALTER FUNCTION public.rpc_entrega_assinar_termo_v1(uuid, jsonb, text) SET search_path TO 'public', 'extensions';
ALTER FUNCTION public.rpc_entrega_reconciliar_v1(uuid, text) SET search_path TO 'public', 'extensions';
ALTER FUNCTION public.rpc_entrega_reentrega_saldo_v1(uuid, text) SET search_path TO 'public', 'extensions';
ALTER FUNCTION public.rpc_entrega_registrar_conferencia_v1(uuid, jsonb) SET search_path TO 'public', 'extensions';
ALTER FUNCTION public.fn_entrega_build_snapshot_v1(uuid) SET search_path TO 'public', 'extensions';
