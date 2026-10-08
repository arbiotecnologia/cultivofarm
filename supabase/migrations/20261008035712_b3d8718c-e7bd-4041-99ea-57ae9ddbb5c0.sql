DO $baseline$ BEGIN
 IF md5(pg_get_functiondef('public.rpc_estoque_reservar_v1(uuid,text,jsonb,text,jsonb)'::regprocedure)) <> '3e87236d748785704a59e65ed4ede470' OR md5(pg_get_functiondef('platform_private.stock_motor_refs(uuid,uuid,uuid,jsonb)'::regprocedure)) <> '04db91be250ec9fd76a8860881f150bb' THEN RAISE EXCEPTION 'STOCK_BATCH_BASELINE_CHANGED'; END IF;
END $baseline$;
CREATE TABLE IF NOT EXISTS platform_private.stock_batch_requests (
 request_key text PRIMARY KEY, actor uuid NOT NULL, organization_id uuid NOT NULL, fingerprint text NOT NULL, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON platform_private.stock_batch_requests FROM PUBLIC,anon,authenticated;
GRANT ALL ON platform_private.stock_batch_requests TO service_role;
ALTER TABLE platform_private.stock_batch_requests ENABLE ROW LEVEL SECURITY;
DO $refs$ DECLARE s text; BEGIN
 SELECT pg_get_functiondef('platform_private.stock_motor_refs(uuid,uuid,uuid,jsonb)'::regprocedure) INTO s;
 s:=replace(s,$q$v_tipo NOT IN ('manual','b2b'))$q$,$q$v_tipo NOT IN ('manual','b2b','onfarm','on_farm'))$q$);
 IF position($q$v_tipo NOT IN ('manual','b2b','onfarm','on_farm'))$q$ IN s)=0 THEN RAISE EXCEPTION 'STOCK_BATCH_REFS_PATCH_FAILED'; END IF;
 EXECUTE s;
END $refs$;
CREATE OR REPLACE FUNCTION public.rpc_estoque_reservar_v1(p_os_id uuid,p_origem text,p_itens jsonb,p_idempotency_key text,p_dados jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $batch$
DECLARE
 v_org uuid; v_actor uuid:=auth.uid(); v_tipo text; v_cliente uuid; v_partner uuid; v_order uuid; v_obs text;
 v_item jsonb; v_qty numeric; v_id uuid; v_payload jsonb; v_items jsonb; v_fp text; v_key text;
 v_prev platform_private.stock_batch_requests%ROWTYPE; v_result jsonb; v_call jsonb; v_ids uuid[]:=ARRAY[]::uuid[];
BEGIN
 v_org:=platform_private.stock_motor_actor('reserva');
 PERFORM platform_private.stock_motor_context_set(NULL);
 IF p_os_id IS NULL THEN RAISE EXCEPTION 'ESTQ_OS_OBRIGATORIA' USING ERRCODE='23514'; END IF;
 IF p_idempotency_key IS NULL OR length(btrim(p_idempotency_key))<8 OR length(p_idempotency_key)>200 THEN RAISE EXCEPTION 'ESTQ_IDEMPOTENCY_OBRIGATORIA' USING ERRCODE='23514'; END IF;
 IF p_origem IS NULL OR p_origem NOT IN ('padrao','manual','onfarm','on_farm','b2b') THEN RAISE EXCEPTION 'ESTQ_REFERENCE_UNSUPPORTED' USING ERRCODE='42501'; END IF;
 v_tipo:=CASE WHEN p_origem='padrao' THEN 'manual' WHEN p_origem='on_farm' THEN 'onfarm' ELSE p_origem END;
 IF p_dados IS NULL OR jsonb_typeof(p_dados)<>'object' THEN RAISE EXCEPTION 'ESTQ_PAYLOAD_INVALIDO' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_each(p_dados) e WHERE e.key NOT IN ('cliente_id','partner_id','partner_order_id','observacao') OR jsonb_typeof(e.value) NOT IN ('string','null')) THEN RAISE EXCEPTION 'ESTQ_PAYLOAD_INVALIDO' USING ERRCODE='22023'; END IF;
 IF p_itens IS NULL OR jsonb_typeof(p_itens)<>'array' THEN RAISE EXCEPTION 'ESTQ_PAYLOAD_INVALIDO' USING ERRCODE='22023'; END IF;
 IF jsonb_array_length(p_itens)=0 THEN RAISE EXCEPTION 'ESTQ_ITENS_VAZIOS' USING ERRCODE='23514'; END IF;
 v_cliente:=nullif(p_dados->>'cliente_id','')::uuid; v_partner:=nullif(p_dados->>'partner_id','')::uuid; v_order:=nullif(p_dados->>'partner_order_id','')::uuid; v_obs:=nullif(p_dados->>'observacao','');
 v_payload:=jsonb_build_object('os_id',p_os_id,'os_tipo',v_tipo,'cliente_id',v_cliente,'partner_id',v_partner,'partner_order_id',v_order,'observacao',v_obs,'referencia_tipo','ordem_servico','referencia_id',p_os_id);
 v_items:='[]'::jsonb;
 FOR v_item IN SELECT value FROM jsonb_array_elements(p_itens) LOOP
  IF jsonb_typeof(v_item)<>'object' OR NOT(v_item ? 'item_id' AND v_item ? 'quantidade') THEN RAISE EXCEPTION 'ESTQ_PAYLOAD_INVALIDO' USING ERRCODE='22023'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_each(v_item) e WHERE e.key NOT IN ('item_id','quantidade') OR (e.key='item_id' AND jsonb_typeof(e.value)<>'string') OR (e.key='quantidade' AND jsonb_typeof(e.value) NOT IN ('string','number'))) THEN RAISE EXCEPTION 'ESTQ_PAYLOAD_INVALIDO' USING ERRCODE='22023'; END IF;
  v_id:=(v_item->>'item_id')::uuid; v_qty:=(v_item->>'quantidade')::numeric;
  IF v_qty IS NULL OR v_qty::text IN ('NaN','Infinity','-Infinity') OR v_qty<=0 THEN RAISE EXCEPTION 'ESTQ_QUANTIDADE_INVALIDA' USING ERRCODE='23514'; END IF;
  PERFORM platform_private.stock_motor_item(v_id,'reserva',v_payload);
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(v_items) e WHERE e->>'item_id'=v_id::text) THEN RAISE EXCEPTION 'ESTQ_PAYLOAD_INVALIDO' USING ERRCODE='22023'; END IF;
  v_items:=v_items||jsonb_build_array(jsonb_build_object('item_id',v_id,'quantidade',v_qty));
 END LOOP;
 SELECT jsonb_agg(value ORDER BY value->>'item_id') INTO v_items FROM jsonb_array_elements(v_items);
 v_fp:=md5(jsonb_build_object('actor',v_actor,'org',v_org,'os',p_os_id,'tipo',v_tipo,'payload',v_payload,'itens',v_items)::text);
 -- Global key collision is denied, never reused across actor/tenant/content. No wildcard comparisons.
 PERFORM pg_advisory_xact_lock(hashtextextended('stock_batch:'||p_idempotency_key,0));
 SELECT * INTO v_prev FROM platform_private.stock_batch_requests WHERE request_key=p_idempotency_key;
 IF FOUND THEN
  IF v_prev.actor IS DISTINCT FROM v_actor OR v_prev.organization_id IS DISTINCT FROM v_org OR v_prev.fingerprint IS DISTINCT FROM v_fp THEN RAISE EXCEPTION 'ESTQ_IDEMPOTENCY_CONFLITO' USING ERRCODE='23505'; END IF;
  RETURN v_prev.result||jsonb_build_object('replay',true);
 END IF;
 IF EXISTS(SELECT 1 FROM public.estoque_movimentacoes WHERE idempotency_key=p_idempotency_key OR left(idempotency_key,length(p_idempotency_key)+1)=p_idempotency_key||'#') THEN RAISE EXCEPTION 'ESTQ_IDEMPOTENCY_CONFLITO' USING ERRCODE='23505'; END IF;
 -- Consistent item order before nested motor calls; all writes are one transaction.
 FOR v_item IN SELECT value FROM jsonb_array_elements(v_items) LOOP
  v_id:=(v_item->>'item_id')::uuid;
  PERFORM 1 FROM public.estoque_produto WHERE id=v_id FOR UPDATE;
  PERFORM platform_private.stock_motor_item(v_id,'reserva',v_payload);
 END LOOP;
 FOR v_item IN SELECT value FROM jsonb_array_elements(v_items) LOOP
  v_id:=(v_item->>'item_id')::uuid; v_qty:=(v_item->>'quantidade')::numeric;
  v_key:='stock_batch_item:'||md5(jsonb_build_array(p_idempotency_key,v_actor,v_org,v_id)::text);
  v_call:=public.rpc_estoque_operar_v1('reserva',v_id,v_qty,v_key,v_payload);
  IF v_call->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'ESTQ_SEM_TRILHA'; END IF;
  -- The ledger is canonical for the split target, not the source item.
  SELECT estoque_produto_id INTO v_id FROM public.estoque_movimentacoes WHERE id=(v_call->>'movimentacao_id')::uuid;
  IF v_id IS NULL THEN RAISE EXCEPTION 'ESTQ_SEM_TRILHA'; END IF;
  v_ids:=array_append(v_ids,v_id);
 END LOOP;
 v_result:=jsonb_build_object('ok',true,'replay',false,'itens',to_jsonb(v_ids));
 INSERT INTO platform_private.stock_batch_requests(request_key,actor,organization_id,fingerprint,result) VALUES(p_idempotency_key,v_actor,v_org,v_fp,v_result);
 PERFORM platform_private.stock_motor_context_set(NULL);
 RETURN v_result;
END $batch$;
REVOKE ALL ON FUNCTION public.rpc_estoque_reservar_v1(uuid,text,jsonb,text,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.rpc_estoque_operar_v1(text,uuid,numeric,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_estoque_reservar_v1(uuid,text,jsonb,text,jsonb) TO service_role;