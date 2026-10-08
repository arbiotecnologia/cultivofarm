-- Canonical connected project verified: swzpzcwiasxmjutrmvkm.
-- No row changes, no public wrapper, no policy removal, no client ACL reopening.
CREATE OR REPLACE FUNCTION platform_private.stock_motor_actor(p_acao text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$ DECLARE v_org uuid; BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'ESTQ_NAO_AUTENTICADO' USING ERRCODE='42501'; END IF;
 v_org:=public.h15_actor_organization();
 IF v_org IS NULL THEN RAISE EXCEPTION 'ESTQ_IDENTIDADE_INATIVA' USING ERRCODE='42501'; END IF;
 IF NOT coalesce(public.fn_estoque_pode_operar(auth.uid(),p_acao),false) THEN RAISE EXCEPTION 'ESTQ_SEM_PERMISSAO' USING ERRCODE='42501'; END IF;
 IF NOT coalesce(public.saas_has_feature('estoque_embalagens'),false) THEN RAISE EXCEPTION 'ESTQ_FEATURE_REQUIRED' USING ERRCODE='42501'; END IF;
 RETURN v_org;
END $$;
REVOKE ALL ON FUNCTION platform_private.stock_motor_actor(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION platform_private.stock_motor_actor(text) TO service_role;

CREATE OR REPLACE FUNCTION platform_private.stock_motor_refs(p_item uuid,p_lote uuid,p_org uuid,p jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$ DECLARE v_os uuid:=nullif(p->>'os_id','')::uuid; v_tipo text:=p->>'os_tipo'; v_cliente uuid:=nullif(p->>'cliente_id','')::uuid;
 v_partner uuid:=nullif(p->>'partner_id','')::uuid; v_order uuid:=nullif(p->>'partner_order_id','')::uuid;
 v_ref uuid:=nullif(p->>'referencia_id','')::uuid; v_rt text:=p->>'referencia_tipo'; v_origin uuid:=nullif(p->>'movimentacao_origem_id','')::uuid;
 v_os_cliente uuid; v_os_order uuid;
BEGIN
 IF v_cliente IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.clientes c WHERE c.id=v_cliente AND c.organization_id=p_org) THEN RAISE EXCEPTION 'ESTQ_REFERENCE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF v_partner IS NOT NULL AND NOT coalesce(public.b2b_phase1_partner_visible(v_partner,false),false) THEN RAISE EXCEPTION 'ESTQ_REFERENCE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF v_order IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.partner_orders o WHERE o.id=v_order AND o.partner_id=v_partner AND public.b2b_phase1_order_visible(o.id)) THEN RAISE EXCEPTION 'ESTQ_REFERENCE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF v_os IS NOT NULL THEN
  IF v_tipo IN ('manual','b2b') THEN
   SELECT o.cliente_id,o.partner_order_id INTO v_os_cliente,v_os_order FROM public.ordens_servico o WHERE o.id=v_os AND o.organization_id=p_org;
   IF NOT FOUND THEN RAISE EXCEPTION 'ESTQ_REFERENCE_FORBIDDEN' USING ERRCODE='42501'; END IF;
   IF v_tipo='b2b' AND (v_order IS NULL OR v_os_order IS DISTINCT FROM v_order OR v_cliente IS NOT NULL) THEN RAISE EXCEPTION 'ESTQ_REFERENCE_FORBIDDEN' USING ERRCODE='42501'; END IF;
   IF v_tipo='manual' AND (v_os_order IS NOT NULL OR v_partner IS NOT NULL OR v_order IS NOT NULL) THEN RAISE EXCEPTION 'ESTQ_REFERENCE_FORBIDDEN' USING ERRCODE='42501'; END IF;
  ELSIF v_tipo IN ('onfarm','on_farm') THEN
   SELECT o.cliente_id INTO v_os_cliente FROM public.ordens_servico_onfarm o JOIN public.clientes c ON c.id=o.cliente_id WHERE o.id=v_os AND c.organization_id=p_org;
   IF NOT FOUND OR v_partner IS NOT NULL OR v_order IS NOT NULL THEN RAISE EXCEPTION 'ESTQ_REFERENCE_FORBIDDEN' USING ERRCODE='42501'; END IF;
  ELSE RAISE EXCEPTION 'ESTQ_REFERENCE_UNSUPPORTED' USING ERRCODE='42501'; END IF;
  IF v_cliente IS NOT NULL AND v_cliente IS DISTINCT FROM v_os_cliente THEN RAISE EXCEPTION 'ESTQ_REFERENCE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 END IF;
 IF v_origin IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.estoque_movimentacoes m WHERE m.id=v_origin AND m.estoque_produto_id=p_item AND m.lote_id=p_lote AND public.stock_p1_movement_owned(m.estoque_produto_id,m.lote_id)) THEN RAISE EXCEPTION 'ESTQ_ESTORNO_ORIGEM_INVALIDA' USING ERRCODE='42501'; END IF;
 -- Only proven existing guard semantics. Unsupported literals fail even without an ID.
 IF v_rt IS NOT NULL AND v_rt NOT IN ('entrega','ordem_servico','manual','sistema') THEN RAISE EXCEPTION 'ESTQ_REFERENCE_UNSUPPORTED' USING ERRCODE='42501'; END IF;
 IF v_rt IN ('manual','sistema') AND v_ref IS NOT NULL THEN RAISE EXCEPTION 'ESTQ_REFERENCE_UNSUPPORTED' USING ERRCODE='42501'; END IF;
 IF v_ref IS NOT NULL AND v_rt IS NULL THEN RAISE EXCEPTION 'ESTQ_REFERENCE_UNSUPPORTED' USING ERRCODE='42501'; END IF;
 IF v_rt IN ('entrega','ordem_servico') AND v_ref IS NULL THEN RAISE EXCEPTION 'ESTQ_REFERENCE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF v_rt='ordem_servico' AND (v_os IS NULL OR v_ref IS DISTINCT FROM v_os OR v_tipo NOT IN ('manual','b2b')) THEN RAISE EXCEPTION 'ESTQ_REFERENCE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF v_rt='entrega' AND NOT EXISTS(SELECT 1 FROM public.entregas e WHERE e.id=v_ref AND e.organization_id=p_org AND e.estoque_produto_id=p_item AND (e.lote_id IS NULL OR e.lote_id=p_lote) AND (v_cliente IS NULL OR e.cliente_id=v_cliente) AND (v_os IS NULL OR (v_tipo IN ('manual','b2b') AND e.ordem_servico_id=v_os) OR (v_tipo IN ('onfarm','on_farm') AND e.ordem_servico_onfarm_id=v_os))) THEN RAISE EXCEPTION 'ESTQ_REFERENCE_FORBIDDEN' USING ERRCODE='42501'; END IF;
END $$;
REVOKE ALL ON FUNCTION platform_private.stock_motor_refs(uuid,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION platform_private.stock_motor_refs(uuid,uuid,uuid,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION platform_private.stock_motor_item(p_item uuid,p_acao text,p_payload jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$ DECLARE v_org uuid; v_item public.estoque_produto%ROWTYPE; v_lote public.lotes%ROWTYPE;
BEGIN
 v_org:=platform_private.stock_motor_actor(p_acao);
 IF p_payload IS NULL OR jsonb_typeof(p_payload)<>'object' OR (p_payload ? 'metadata' AND jsonb_typeof(p_payload->'metadata')<>'object') OR p_payload ?| ARRAY['organization_id','tenant_id','usuario_id','user_id','owner_id'] OR coalesce(p_payload->'metadata','{}'::jsonb) ?| ARRAY['stock_request_item','stock_request_actor','stock_request_fp'] THEN RAISE EXCEPTION 'ESTQ_PAYLOAD_INVALIDO' USING ERRCODE='22023'; END IF;
 -- Scoped lookup never returns a foreign/orphan row, even under DEFINER.
 SELECT e.* INTO v_item FROM public.estoque_produto e JOIN public.lotes l ON l.id=e.lote_id WHERE e.id=p_item AND l.organization_id=v_org;
 IF NOT FOUND THEN RAISE EXCEPTION 'ESTQ_TENANT_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT l.* INTO v_lote FROM public.lotes l WHERE l.id=v_item.lote_id AND l.organization_id=v_org;
 IF v_lote.programacao_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.programacao_producao g WHERE g.id=v_lote.programacao_id AND g.organization_id=v_org) THEN RAISE EXCEPTION 'ESTQ_REFERENCE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF v_item.envase_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.envase e WHERE e.id=v_item.envase_id AND e.lote_id=v_item.lote_id AND e.organization_id=v_org) THEN RAISE EXCEPTION 'ESTQ_REFERENCE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM platform_private.stock_motor_refs(p_item,v_item.lote_id,v_org,jsonb_build_object('os_id',v_item.reservado_para_os_id,'os_tipo',v_item.reservado_para_os_tipo,'cliente_id',v_item.reservado_para_cliente_id,'partner_id',v_item.reservado_para_partner_id,'partner_order_id',v_item.reservado_para_partner_order_id));
 PERFORM platform_private.stock_motor_refs(p_item,v_item.lote_id,v_org,p_payload);
END $$;
REVOKE ALL ON FUNCTION platform_private.stock_motor_item(uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION platform_private.stock_motor_item(uuid,text,jsonb) TO service_role;

-- Surgical replacement of audited live bodies, with optimistic hashes against concurrent edits.
-- Retains every business branch and the existing function OID/signature/ACL.
DO $hardening$
DECLARE s text; original text;
BEGIN
 SELECT pg_get_functiondef('public.rpc_estoque_operar_v1(text,uuid,numeric,text,jsonb)'::regprocedure) INTO s;
 IF md5(s)<>'720044a830a5fc5d017cfec1d6e870d0' THEN RAISE EXCEPTION 'STOCK_CONCURRENT_ENGINE_CHANGE'; END IF;
 original:=s;
 s:=replace(s,'BEGIN'||chr(10)||'  IF p_acao IS NULL','BEGIN'||chr(10)||'  PERFORM platform_private.stock_motor_item(p_item_id,p_acao,p_payload);'||chr(10)||'  IF p_acao IS NULL');
 s:=replace(s,'  v_fp := public.fn_estoque_fingerprint', '  SELECT * INTO v_item FROM public.estoque_produto WHERE id=p_item_id FOR UPDATE;'||chr(10)||'  PERFORM platform_private.stock_motor_item(p_item_id,p_acao,p_payload);'||chr(10)||'  v_fp := public.fn_estoque_fingerprint');
 s:=replace(s,'  IF FOUND THEN'||chr(10)||'    IF v_prev.request_fingerprint', '  IF FOUND THEN'||chr(10)||'    IF v_prev.usuario_id IS DISTINCT FROM v_uid OR NOT coalesce(public.stock_p1_movement_owned(v_prev.estoque_produto_id,v_prev.lote_id),false) OR v_prev.metadata->>''stock_request_item'' IS DISTINCT FROM p_item_id::text OR v_prev.metadata->>''stock_request_actor'' IS DISTINCT FROM v_uid::text THEN'||chr(10)||'      RAISE EXCEPTION ''ESTQ_IDEMPOTENCY_CONFLITO'' USING ERRCODE=''23505'';'||chr(10)||'    END IF;'||chr(10)||'    IF v_prev.request_fingerprint');
 -- Request metadata binds source item, not the split reservation target.
 s:=replace(s,$q$jsonb_build_object('motor','v1')$q$, $q$jsonb_build_object('motor','v1','stock_request_item',p_item_id::text,'stock_request_actor',v_uid::text)$q$);
 s:=replace(s,$q$jsonb_build_object('classificacao', v_classif, 'reintegrado', false, 'motor','v1')$q$, $q$jsonb_build_object('classificacao', v_classif, 'reintegrado', false, 'motor','v1','stock_request_item',p_item_id::text,'stock_request_actor',v_uid::text)$q$);
 s:=replace(s,'public.fn_estoque_ctx_open(v_ctx)','public.fn_estoque_ctx_force(v_ctx)');
 s:=replace(s,'  RETURN jsonb_build_object('||chr(10)||'    ''ok'', true, ''replay'', false', '  IF v_mov.usuario_id IS DISTINCT FROM v_uid OR v_mov.metadata->>''stock_request_item'' IS DISTINCT FROM p_item_id::text OR NOT coalesce(public.stock_p1_movement_owned(v_mov.estoque_produto_id,v_mov.lote_id),false) THEN RAISE EXCEPTION ''ESTQ_SEM_TRILHA'' USING ERRCODE=''42501''; END IF;'||chr(10)||'  RETURN jsonb_build_object('||chr(10)||'    ''ok'', true, ''replay'', false');
 s:=replace(s,'END; $function$', 'EXCEPTION WHEN OTHERS THEN PERFORM public.fn_estoque_ctx_close(); RAISE;'||chr(10)||'END; $function$');
 IF s=original OR position('PERFORM platform_private.stock_motor_item(p_item_id,p_acao,p_payload);' IN s)=0 OR position('stock_request_actor' IN s)=0 OR position('EXCEPTION WHEN OTHERS' IN s)=0 THEN RAISE EXCEPTION 'STOCK_ENGINE_PATCH_INCOMPLETE'; END IF;
 EXECUTE s;
 SELECT pg_get_functiondef('public.reservar_estoque_item(uuid,numeric,uuid,text,uuid,uuid,uuid,text)'::regprocedure) INTO s;
 IF md5(s)<>'8f627c0926d07ff962153803e1688840' THEN RAISE EXCEPTION 'STOCK_CONCURRENT_RESERVE_CHANGE'; END IF;
 original:=s;
 s:=replace(s,'  v_new_id uuid;', '  v_new_id uuid;'||chr(10)||'  v_parent_ctx jsonb;');
 s:=replace(s,'BEGIN'||chr(10)||'  IF auth.uid()', 'BEGIN'||chr(10)||'  PERFORM platform_private.stock_motor_item(p_item_id,''reserva'',jsonb_build_object(''os_id'',p_os_id,''os_tipo'',p_os_tipo,''cliente_id'',p_cliente_id,''partner_id'',p_partner_id,''partner_order_id'',p_partner_order_id));'||chr(10)||'  IF auth.uid()');
 s:=replace(s,$q$  PERFORM public.fn_estoque_ctx_open(jsonb_build_object('acao','reserva','origem','reservar_estoque_item','usuario_id',auth.uid()::text));$q$, $q$  v_parent_ctx:=public.fn_estoque_ctx_read();$q$||chr(10)||$q$  PERFORM public.fn_estoque_ctx_force(coalesce(v_parent_ctx,'{}'::jsonb)||jsonb_build_object('acao','reserva','usuario_id',auth.uid()::text,'metadata',coalesce(v_parent_ctx->'metadata','{}'::jsonb)||jsonb_build_object('stock_request_item',p_item_id::text,'stock_request_actor',auth.uid()::text)));$q$);
 s:=replace(s,$q$  IF v_item.status::text <> 'disponivel' THEN$q$, $q$  PERFORM platform_private.stock_motor_item(p_item_id,'reserva',jsonb_build_object('os_id',p_os_id,'os_tipo',p_os_tipo,'cliente_id',p_cliente_id,'partner_id',p_partner_id,'partner_order_id',p_partner_order_id));$q$||chr(10)||$q$  IF v_item.status::text <> 'disponivel' THEN$q$);
 s:=replace(s,'  RETURN v_new_id;', '  PERFORM public.fn_estoque_ctx_close();'||chr(10)||'  RETURN v_new_id;');
 s:=replace(s,'END;'||chr(10)||'$function$', 'EXCEPTION WHEN OTHERS THEN PERFORM public.fn_estoque_ctx_close(); RAISE;'||chr(10)||'END;'||chr(10)||'$function$');
 IF s=original OR position('PERFORM platform_private.stock_motor_item' IN s)=0 OR position('v_parent_ctx:=public.fn_estoque_ctx_read()' IN s)=0 OR position('EXCEPTION WHEN OTHERS' IN s)=0 THEN RAISE EXCEPTION 'STOCK_RESERVE_PATCH_INCOMPLETE'; END IF;
 EXECUTE s;
END $hardening$;
-- Explicitly keep client ACL closed, never grant any of the 23 contained functions.
REVOKE ALL ON FUNCTION public.rpc_estoque_operar_v1(text,uuid,numeric,text,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.reservar_estoque_item(uuid,numeric,uuid,text,uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
