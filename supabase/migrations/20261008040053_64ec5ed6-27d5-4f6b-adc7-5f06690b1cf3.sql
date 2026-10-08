DO $gate$ BEGIN
 IF md5(pg_get_functiondef('public.rpc_estoque_operar_v1(text,uuid,numeric,text,jsonb)'::regprocedure))<>'c71a9e848eff0a522cbaa3a7ec2949a5' OR md5(pg_get_functiondef('public.rpc_estoque_reservar_v1(uuid,text,jsonb,text,jsonb)'::regprocedure))<>'d6e1af7b19ca3ba0ddc59ec4bcf24e0d' THEN RAISE EXCEPTION 'STOCK_ENDPOINT_REVIEW_CHANGED'; END IF;
 IF (SELECT count(*) FROM public.estoque_produto)<>1 OR (SELECT md5(string_agg(to_jsonb(t)::text,'' ORDER BY id)) FROM public.estoque_produto t)<>'0c1a052173a564454cd51e69fcb72947' OR (SELECT count(*) FROM public.estoque_movimentacoes)<>2 OR (SELECT md5(string_agg(to_jsonb(t)::text,'' ORDER BY id)) FROM public.estoque_movimentacoes t)<>'f8b6fcf6aa756d745eaf205f606f7795' THEN RAISE EXCEPTION 'STOCK_HISTORICAL_BASELINE_CHANGED'; END IF;
 IF EXISTS(SELECT 1 FROM platform_private.stock_batch_requests) OR EXISTS(SELECT 1 FROM platform_private.stock_motor_context) THEN RAISE EXCEPTION 'STOCK_FIXTURE_RESIDUE'; END IF;
END $gate$;
REVOKE ALL ON FUNCTION public.fn_estoque_ctx_open(jsonb),public.fn_estoque_ctx_force(jsonb),public.fn_estoque_ctx_close(),public.fn_estoque_ctx_read() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_estoque_ctx_open(jsonb),public.fn_estoque_ctx_force(jsonb),public.fn_estoque_ctx_close(),public.fn_estoque_ctx_read() TO service_role;
REVOKE ALL ON FUNCTION public.rpc_estoque_operar_v1(text,uuid,numeric,text,jsonb),public.rpc_estoque_reservar_v1(uuid,text,jsonb,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.rpc_estoque_operar_v1(text,uuid,numeric,text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_estoque_reservar_v1(uuid,text,jsonb,text,jsonb) TO authenticated;
-- Safe rollback: revoke only these two endpoints; do not restore unsafe bodies or policies.