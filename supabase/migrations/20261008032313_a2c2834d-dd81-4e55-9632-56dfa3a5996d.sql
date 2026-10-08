CREATE TABLE IF NOT EXISTS platform_private.stock_motor_context (txid bigint PRIMARY KEY, actor uuid NOT NULL, item uuid NOT NULL, ctx jsonb NOT NULL);
REVOKE ALL ON platform_private.stock_motor_context FROM PUBLIC,anon,authenticated;
GRANT ALL ON platform_private.stock_motor_context TO service_role;
ALTER TABLE platform_private.stock_motor_context ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION platform_private.stock_motor_context_set(p_ctx jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
BEGIN
 DELETE FROM platform_private.stock_motor_context WHERE txid=txid_current();
 IF p_ctx IS NOT NULL THEN
  PERFORM platform_private.stock_motor_actor(p_ctx->>'acao');
  IF p_ctx->>'usuario_id' IS DISTINCT FROM auth.uid()::text OR jsonb_typeof(p_ctx->'metadata') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'ESTQ_PAYLOAD_INVALIDO' USING ERRCODE='22023'; END IF;
  INSERT INTO platform_private.stock_motor_context(txid,actor,item,ctx) VALUES(txid_current(),auth.uid(),(p_ctx->'metadata'->>'stock_request_item')::uuid,p_ctx);
 END IF;
 PERFORM public.fn_estoque_ctx_force(p_ctx);
END $f$;
REVOKE ALL ON FUNCTION platform_private.stock_motor_context_set(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION platform_private.stock_motor_context_set(jsonb) TO service_role;
DO $patch$
DECLARE s text; original text;
BEGIN
 SELECT pg_get_functiondef('public.rpc_estoque_operar_v1(text,uuid,numeric,text,jsonb)'::regprocedure) INTO original;
 IF md5(original)<>'baa25965692ce39e1412e71029cf5502' THEN RAISE EXCEPTION 'STOCK_MOTOR_BASELINE_CHANGED'; END IF;
 s:=replace(original,'  PERFORM platform_private.stock_motor_item(p_item_id,p_acao,p_payload);','  PERFORM platform_private.stock_motor_context_set(NULL);'||chr(10)||'  PERFORM platform_private.stock_motor_item(p_item_id,p_acao,p_payload);');
 s:=replace(s,$q$    'acao', p_acao, 'origem',$q$,$q$    'reserve_args', jsonb_build_object('os_id',p_payload->>'os_id','os_tipo',COALESCE(p_payload->>'os_tipo','interna'),'cliente_id',NULLIF(p_payload->>'cliente_id',''),'partner_id',NULLIF(p_payload->>'partner_id',''),'partner_order_id',NULLIF(p_payload->>'partner_order_id',''),'observacao',p_payload->>'observacao'),'acao', p_acao, 'origem',$q$);
 s:=replace(s,'PERFORM public.fn_estoque_ctx_force(v_ctx);','PERFORM platform_private.stock_motor_context_set(v_ctx);');
 s:=replace(s,'PERFORM public.fn_estoque_ctx_close();','PERFORM platform_private.stock_motor_context_set(NULL); PERFORM public.fn_estoque_ctx_close();');
 -- Casts in DECLARE ran before actor/payload validation; move them after the validated precheck.
 s:=replace(s,$q$  v_origem_mov uuid := NULLIF(p_payload->>'movimentacao_origem_id','')::uuid;$q$,'  v_origem_mov uuid;');
 s:=replace(s,'  IF p_acao IS NULL OR p_acao NOT IN', $q$  v_origem_mov := NULLIF(p_payload->>'movimentacao_origem_id','')::uuid;$q$||chr(10)||'  IF p_acao IS NULL OR p_acao NOT IN');
 IF s=original OR position('reserve_args' IN s)=0 OR position('fn_estoque_ctx_force(v_ctx)' IN s)>0 THEN RAISE EXCEPTION 'STOCK_CONTEXT_PATCH_INCOMPLETE'; END IF;
 EXECUTE s;
 SELECT pg_get_functiondef('public.reservar_estoque_item(uuid,numeric,uuid,text,uuid,uuid,uuid,text)'::regprocedure) INTO original;
 IF md5(original)<>'421e5d3ab7e902ec5385873a6359f931' THEN RAISE EXCEPTION 'STOCK_RESERVE_BASELINE_CHANGED'; END IF;
 s:=replace(original,$q$  v_parent_ctx:=public.fn_estoque_ctx_read();
  PERFORM public.fn_estoque_ctx_force(coalesce(v_parent_ctx,'{}'::jsonb)||jsonb_build_object('acao','reserva','usuario_id',auth.uid()::text,'metadata',coalesce(v_parent_ctx->'metadata','{}'::jsonb)||jsonb_build_object('stock_request_item',p_item_id::text,'stock_request_actor',auth.uid()::text)));$q$,$q$  SELECT c.ctx INTO v_parent_ctx FROM platform_private.stock_motor_context c WHERE c.txid=txid_current() AND c.actor=auth.uid() AND c.item=p_item_id;
  IF v_parent_ctx IS NOT NULL AND (v_parent_ctx->>'acao' IS DISTINCT FROM 'reserva' OR v_parent_ctx->'reserve_args' IS DISTINCT FROM jsonb_build_object('os_id',p_os_id::text,'os_tipo',p_os_tipo,'cliente_id',p_cliente_id::text,'partner_id',p_partner_id::text,'partner_order_id',p_partner_order_id::text,'observacao',p_observacao)) THEN RAISE EXCEPTION 'ESTQ_PAYLOAD_INVALIDO' USING ERRCODE='22023'; END IF;
  IF v_parent_ctx IS NULL THEN
   v_parent_ctx:=jsonb_build_object('acao','reserva','origem','reservar_estoque_item','usuario_id',auth.uid()::text,'metadata',jsonb_build_object('stock_request_item',p_item_id::text,'stock_request_actor',auth.uid()::text));
  END IF;
  PERFORM public.fn_estoque_ctx_force(v_parent_ctx);$q$);
 s:=replace(s,'PERFORM public.fn_estoque_ctx_close();','PERFORM platform_private.stock_motor_context_set(NULL); PERFORM public.fn_estoque_ctx_close();');
 IF s=original OR position('v_parent_ctx:=public.fn_estoque_ctx_read()' IN s)>0 THEN RAISE EXCEPTION 'STOCK_RESERVE_CONTEXT_PATCH_INCOMPLETE'; END IF;
 EXECUTE s;
 SELECT pg_get_functiondef('public.log_estoque_movimentacao()'::regprocedure) INTO original;
 s:=replace(original,$q$idempotency_key LIKE v_key || '#%'$q$,$q$left(idempotency_key,length(v_key)+1) = v_key || '#'$q$);
 s:=replace(s,$q$FROM public.user_roles ur WHERE ur.role = 'administrativo'::app_role;$q$,$q$FROM public.user_roles ur JOIN public.profiles pr ON pr.user_id=ur.user_id AND pr.ativo IS TRUE JOIN public.lotes l ON l.id=NEW.lote_id AND l.organization_id=pr.organization_id JOIN public.organizations o ON o.id=pr.organization_id AND o.ativo IS TRUE WHERE ur.role = 'administrativo'::app_role AND l.organization_id IS NOT NULL;$q$);
 IF s=original OR position('idempotency_key LIKE' IN s)>0 OR position('l.organization_id=pr.organization_id' IN s)=0 THEN RAISE EXCEPTION 'STOCK_LEDGER_PATCH_INCOMPLETE'; END IF;
 EXECUTE s;
END $patch$;
-- Strong scalar/enum typing before any scoped item lookup. Null remains compatible with optional frontend fields.
DO $payload$
DECLARE s text;
BEGIN
 SELECT pg_get_functiondef('platform_private.stock_motor_item(uuid,text,jsonb)'::regprocedure) INTO s;
 s:=replace(s,' -- Scoped lookup', $q$ IF EXISTS(SELECT 1 FROM jsonb_each(p_payload) e WHERE e.key IN ('motivo','observacao','origem','referencia_tipo','referencia_id','os_id','os_tipo','cliente_id','partner_id','partner_order_id','movimentacao_origem_id','classificacao','sentido','unidade') AND jsonb_typeof(e.value) NOT IN ('string','null')) OR (p_payload->>'sentido' IS NOT NULL AND p_payload->>'sentido' NOT IN ('entrada','saida')) THEN RAISE EXCEPTION 'ESTQ_PAYLOAD_INVALIDO' USING ERRCODE='22023'; END IF;
 -- Scoped lookup$q$);
 IF position('jsonb_each(p_payload)' IN s)=0 THEN RAISE EXCEPTION 'STOCK_PAYLOAD_PATCH_INCOMPLETE'; END IF;
 EXECUTE s;
END $payload$;
REVOKE ALL ON FUNCTION public.rpc_estoque_operar_v1(text,uuid,numeric,text,jsonb),public.reservar_estoque_item(uuid,numeric,uuid,text,uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated;