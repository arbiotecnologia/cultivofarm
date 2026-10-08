DO $fix$ DECLARE s text; BEGIN
 SELECT pg_get_functiondef('public.rpc_estoque_reservar_v1(uuid,text,jsonb,text,jsonb)'::regprocedure) INTO s;
 IF md5(s)<>'a4571d62de1f09fb768d9fe44e47a09b' THEN RAISE EXCEPTION 'STOCK_BATCH_BASELINE_CHANGED'; END IF;
 s:=replace(s,$q$,'referencia_tipo','ordem_servico','referencia_id',p_os_id$q$,'');
 IF position($q$'referencia_tipo','ordem_servico'$q$ IN s)>0 THEN RAISE EXCEPTION 'STOCK_BATCH_COMPAT_PATCH_FAILED'; END IF;
 EXECUTE s;
END $fix$;