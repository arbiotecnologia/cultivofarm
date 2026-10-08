DO $patch$ DECLARE s text; BEGIN
 SELECT pg_get_functiondef('public.rpc_estoque_reservar_v1(uuid,text,jsonb,text,jsonb)'::regprocedure) INTO s;
 IF md5(s)<>'d6e1af7b19ca3ba0ddc59ec4bcf24e0d' THEN RAISE EXCEPTION 'STOCK_BATCH_BASELINE_CHANGED'; END IF;
 s:=replace(s,$q$  v_call:=public.rpc_estoque_operar_v1('reserva',v_id,v_qty,v_key,v_payload);$q$,$q$  IF EXISTS(SELECT 1 FROM public.estoque_movimentacoes WHERE idempotency_key=v_key OR left(idempotency_key,length(v_key)+1)=v_key||'#') THEN RAISE EXCEPTION 'ESTQ_IDEMPOTENCY_CONFLITO' USING ERRCODE='23505'; END IF;
  v_call:=public.rpc_estoque_operar_v1('reserva',v_id,v_qty,v_key,v_payload);$q$);
 s:=replace(s,$q$IF v_call->>'ok' IS DISTINCT FROM 'true' THEN$q$,$q$IF v_call->>'ok' IS DISTINCT FROM 'true' OR v_call->>'replay' IS DISTINCT FROM 'false' THEN$q$);
 IF position($q$WHERE idempotency_key=v_key$q$ IN s)=0 THEN RAISE EXCEPTION 'STOCK_BATCH_KEY_PATCH_FAILED'; END IF;
 EXECUTE s;
END $patch$;