DO $numeric$
DECLARE s text; anchor text; gate text;
BEGIN
 SELECT pg_get_functiondef('public.rpc_estoque_operar_v1(text,uuid,numeric,text,jsonb)'::regprocedure) INTO s;
 anchor := '  PERFORM platform_private.stock_motor_context_set(NULL);'||chr(10)||'  PERFORM platform_private.stock_motor_item(p_item_id,p_acao,p_payload);';
 gate := $q$  PERFORM platform_private.stock_motor_actor(p_acao);
  IF (p_quantidade IS NULL AND p_acao IS DISTINCT FROM 'estorno_expedicao') OR
     (p_quantidade IS NOT NULL AND (p_quantidade::text IN ('NaN','Infinity','-Infinity') OR p_quantidade <= 0)) THEN
    RAISE EXCEPTION 'ESTQ_QUANTIDADE_INVALIDA: quantidade deve ser finita e maior que zero.' USING ERRCODE='23514';
  END IF;
  IF p_acao = 'ajuste' AND p_payload->>'sentido' IS NOT NULL AND p_payload->>'sentido' NOT IN ('entrada','saida') THEN
    RAISE EXCEPTION 'ESTQ_PAYLOAD_INVALIDO: sentido deve ser entrada ou saida.' USING ERRCODE='22023';
  END IF;
$q$;
 IF position('p_quantidade::text IN (''NaN'',''Infinity'',''-Infinity'')' IN s)=0 THEN
  IF position(anchor IN s)=0 THEN RAISE EXCEPTION 'STOCK_NUMERIC_MOTOR_BASELINE_CHANGED'; END IF;
  s:=replace(s,anchor,'  PERFORM platform_private.stock_motor_context_set(NULL);'||chr(10)||gate||'  PERFORM platform_private.stock_motor_item(p_item_id,p_acao,p_payload);');
  EXECUTE s;
 END IF;
 SELECT pg_get_functiondef('public.reservar_estoque_item(uuid,numeric,uuid,text,uuid,uuid,uuid,text)'::regprocedure) INTO s;
 anchor := 'BEGIN'||chr(10)||'  PERFORM platform_private.stock_motor_item';
 gate := $q$BEGIN
  PERFORM platform_private.stock_motor_actor('reserva');
  IF p_qty IS NULL OR p_qty::text IN ('NaN','Infinity','-Infinity') OR p_qty <= 0 THEN
    RAISE EXCEPTION 'ESTQ_QUANTIDADE_INVALIDA: quantidade deve ser finita e maior que zero.' USING ERRCODE='23514';
  END IF;
  PERFORM platform_private.stock_motor_item$q$;
 IF position('p_qty::text IN (''NaN'',''Infinity'',''-Infinity'')' IN s)=0 THEN
  IF position(anchor IN s)=0 THEN RAISE EXCEPTION 'STOCK_NUMERIC_RESERVE_BASELINE_CHANGED'; END IF;
  EXECUTE replace(s,anchor,gate);
 END IF;
END $numeric$;
REVOKE ALL ON FUNCTION public.rpc_estoque_operar_v1(text,uuid,numeric,text,jsonb),public.reservar_estoque_item(uuid,numeric,uuid,text,uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated;