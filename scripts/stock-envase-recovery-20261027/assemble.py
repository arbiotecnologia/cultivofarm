"""Offline candidate generator. No network, hosted SQL, or migration writes."""
from pathlib import Path
import json,re
H=Path(__file__).resolve().parent
fs=json.loads((H/'live/functions.json').read_text())['functions']
targets=['public.rpc_cockpit_registrar_envase_v1','public.rpc_estoque_operar_v1','public.rpc_estoque_reservar_v1','public.fn_envase_material_imutavel','public.fn_validate_envase_volume','public.rpc_cockpit_cancelar_reserva_v1']
helper="""CREATE OR REPLACE FUNCTION platform_private.stock_envase_scope_v1(p_lote uuid,p_prog uuid,p_os uuid,p_origem text)
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO '' AS $scope$
DECLARE org uuid; p public.programacao_producao%ROWTYPE; o public.ordens_servico%ROWTYPE; l public.lotes%ROWTYPE;
BEGIN
 org:=platform_private.stock_motor_actor('reserva');
 IF public.technical_actor_ready(auth.uid()) IS NOT TRUE OR public._saas_user_has_feature(auth.uid(),'envase') IS NOT TRUE
 OR public._saas_user_has_feature(auth.uid(),'ordens_producao') IS NOT TRUE THEN RAISE EXCEPTION 'ENVASE_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
 -- Conservative manual-only stage, not a new B2B/onfarm capability.
 IF public.fn_cockpit_norm_origem(p_origem) IS DISTINCT FROM 'manual' THEN RAISE EXCEPTION 'ENVASE_ORIGIN_COMPOSITION_PENDING' USING ERRCODE='42501'; END IF;
 IF (public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'gestor') OR public.has_role(auth.uid(),'producao')) IS NOT TRUE THEN RAISE EXCEPTION 'ENVASE_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
 SELECT * INTO p FROM public.programacao_producao WHERE id=p_prog AND organization_id=org;
 IF NOT FOUND OR p.ordem_servico_id IS DISTINCT FROM p_os OR p.ordem_servico_onfarm_id IS NOT NULL THEN RAISE EXCEPTION 'ENVASE_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
 SELECT * INTO o FROM public.ordens_servico WHERE id=p_os AND organization_id=org;
 IF NOT FOUND OR o.partner_order_id IS NOT NULL OR o.partner_order_item_id IS NOT NULL OR o.origem='b2b'
 OR NOT EXISTS(SELECT 1 FROM public.clientes WHERE id=o.cliente_id AND organization_id=org) THEN RAISE EXCEPTION 'ENVASE_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
 SELECT * INTO l FROM public.lotes WHERE id=p_lote AND organization_id=org;
 IF NOT FOUND OR l.programacao_id IS DISTINCT FROM p_prog OR l.produto_id IS DISTINCT FROM p.produto_id
 OR l.microrganismo_id IS DISTINCT FROM p.microrganismo_id THEN RAISE EXCEPTION 'ENVASE_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
 RETURN org;
END $scope$;
REVOKE ALL ON FUNCTION platform_private.stock_envase_scope_v1(uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION platform_private.stock_envase_scope_v1(uuid,uuid,uuid,text) TO service_role;
"""
out=[helper]
for n in targets:
 b=fs[n]['definition'].replace('\r\n','\n')
 if n=='public.fn_envase_material_imutavel':
  b=re.sub(r'  -- Escape controlado.*?\n  END IF;\n', '', b, count=1,flags=re.S)
 elif n=='public.fn_validate_envase_volume':
  b=b.replace('IF NEW.volume_por_unidade IS NULL OR NEW.volume_por_unidade <= 0 THEN',"IF NEW.volume_por_unidade IS NULL OR NEW.volume_por_unidade <= 0 OR NEW.volume_por_unidade::text IN ('NaN','Infinity','-Infinity') THEN")
  b=b.replace('IF v_produzido IS NULL OR v_produzido <= 0 THEN',"IF v_produzido IS NULL OR v_produzido <= 0 OR v_produzido::text IN ('NaN','Infinity','-Infinity') THEN")
 elif n=='public.rpc_cockpit_cancelar_reserva_v1':
  # Existing signature delegates to the reviewed motor, avoiding an independent
  # stock merge and contradictory row->main lock order. Stable key retains actor.
  b="""CREATE OR REPLACE FUNCTION public.rpc_cockpit_cancelar_reserva_v1(p_item_id uuid,p_os_id uuid,p_origem text,p_motivo text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' SET lock_timeout TO '3s' AS $function$
DECLARE item public.estoque_produto%ROWTYPE; result jsonb; payload jsonb; k text; origin text;
BEGIN
 origin:=public.fn_cockpit_assert_operador_origem(p_origem);
 IF p_item_id IS NULL OR p_os_id IS NULL OR nullif(btrim(p_motivo),'') IS NULL THEN RAISE EXCEPTION 'COCKPIT_RESERVA_PARAMS_INVALIDOS'; END IF;
 payload:=jsonb_build_object('os_id',p_os_id,'os_tipo',origin,'motivo',p_motivo,'origem','rpc_cockpit_cancelar_reserva_v1');
 PERFORM platform_private.stock_motor_item(p_item_id,'cancelamento_reserva',payload);
 PERFORM 1 FROM cf_user_guards_v1.state WHERE singleton FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'STOCK_GATE_UNAVAILABLE' USING ERRCODE='42501'; END IF;
 PERFORM platform_private.stock_motor_item(p_item_id,'cancelamento_reserva',payload);
 k:='cockpit-cancel:'||md5(jsonb_build_array(auth.uid(),p_item_id,p_os_id,origin,p_motivo)::text);
 PERFORM pg_advisory_xact_lock(hashtext('estoque_mov:'||k));
 PERFORM platform_private.stock_motor_item(p_item_id,'cancelamento_reserva',payload);
 SELECT * INTO item FROM public.estoque_produto WHERE id=p_item_id FOR UPDATE;
 PERFORM platform_private.stock_motor_item(p_item_id,'cancelamento_reserva',payload);
 IF item.reservado_por IS DISTINCT FROM auth.uid() AND public.fn_cockpit_is_gestor() IS NOT TRUE THEN RAISE EXCEPTION 'COCKPIT_RESERVA_OVERRIDE_SEM_ALCADA'; END IF;
 -- Never reinterpret a release/replay as a new quantity. Existing motor receipt
 -- is used only when owned and tied to this exact original request.
 IF item.status::text='disponivel' THEN
 SELECT jsonb_build_object('ok',true,'replay',true,'movimentacao_id',id) INTO result FROM public.estoque_movimentacoes
 WHERE idempotency_key=k AND usuario_id=auth.uid() AND metadata->>'stock_request_item'=p_item_id::text;
 IF result IS NULL THEN RAISE EXCEPTION 'COCKPIT_RESERVA_NAO_ENCONTRADA'; END IF;
 RETURN result||jsonb_build_object('success',true);
 END IF;
 IF item.reservado_para_os_id IS DISTINCT FROM p_os_id OR item.reservado_para_os_tipo IS DISTINCT FROM origin THEN RAISE EXCEPTION 'COCKPIT_RELATION_MISMATCH_RESERVA_OS'; END IF;
 IF EXISTS(SELECT 1 FROM public.estoque_movimentacoes WHERE idempotency_key=k) THEN RAISE EXCEPTION 'COCKPIT_RESERVA_NEW_GENERATION_REVIEW_REQUIRED' USING ERRCODE='PT409'; END IF;
 result:=public.rpc_estoque_operar_v1('cancelamento_reserva',p_item_id,item.quantidade_reservada,k,payload);
 IF result->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'ESTQ_SEM_TRILHA'; END IF;
 RETURN result||jsonb_build_object('success',true,'message','Reserva cancelada pelo motor canônico.');
END $function$;
"""
 else:
  b=re.sub(r'( SET search_path TO [^\n]+)',r"\1\n SET lock_timeout TO '3s'",b,count=1)
  if n=='public.rpc_cockpit_registrar_envase_v1':
   check="PERFORM platform_private.stock_envase_scope_v1(p_lote_id,p_programacao_id,p_os_id,p_origem);"
   b=b.replace('\nBEGIN\n','\nBEGIN\n'+check+"\nPERFORM 1 FROM cf_user_guards_v1.state WHERE singleton FOR UPDATE;\nIF NOT FOUND THEN RAISE EXCEPTION 'STOCK_GATE_UNAVAILABLE' USING ERRCODE='42501'; END IF;\n"+check+'\n',1)
   b=re.sub(r'(pg_advisory_xact_lock\([^;]+;|FOR UPDATE;)',r'\1\n'+check,b)
   b=b.replace('IF v_produzido_ml <= 0 THEN',"IF v_produzido_ml <= 0 OR v_produzido_ml::text IN ('NaN','Infinity','-Infinity') THEN")
   b=b.replace("IF (v_linha->>'quantidade') !~ '^[0-9]+$' THEN", "IF jsonb_typeof(v_linha)<>'object' OR NOT (v_linha ? 'quantidade') OR coalesce(v_linha->>'quantidade','') !~ '^[0-9]+$' THEN")
   # Current manual transition guards remain immutable. Full envase creates stock,
   # but completion is a separate reviewed transition, never forged by this core.
   b=b.replace("v_avanco := public._rpc_avancar_esteira_laboratorio_internal(p_os_id, v_origem, 'concluir_envase', p_programacao_id);", "v_avanco := jsonb_build_object('success',false,'motivo','ENVASE_TRANSITION_REVIEW_PENDING');")
  else:
   action="p_acao" if n.endswith('operar_v1') else "'reserva'"
   check=f"PERFORM platform_private.stock_motor_actor({action});"
   b=b.replace('\nBEGIN\n','\nBEGIN\n'+check+"\nPERFORM 1 FROM cf_user_guards_v1.state WHERE singleton FOR UPDATE;\nIF NOT FOUND THEN RAISE EXCEPTION 'STOCK_GATE_UNAVAILABLE' USING ERRCODE='42501'; END IF;\n"+check+'\n',1)
   if n.endswith('operar_v1'):
    # Remove redundant pre-idempotency row lock; gate->advisory->row everywhere.
    b=b.replace('  SELECT * INTO v_item FROM public.estoque_produto WHERE id=p_item_id FOR UPDATE;','')
    b=re.sub(r'(pg_advisory_xact_lock\([^;]+;|FOR UPDATE;)',r'\1\n'+check+'\nPERFORM platform_private.stock_motor_item(p_item_id,p_acao,p_payload);',b)
   else:b=re.sub(r'(pg_advisory_xact_lock\([^;]+;|FOR UPDATE;)',r'\1\n'+check,b)
 out.append(b)
(H/'candidate.sql.review').write_text('-- INACTIVE. No grants/release; manual completion remains contained.\n'+'\n'.join(out))
print('Candidate generated offline:',len(targets),'existing bodies + private scope')