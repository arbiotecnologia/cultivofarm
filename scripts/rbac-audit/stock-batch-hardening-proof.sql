-- Canonical swzpzcwiasxmjutrmvkm only. SQL role proof, NOT JWT/API/browser.
-- Final mandatory exception rolls back every fixture and temporary grant.
DO $proof$
DECLARE
 r text:='TEMPORARY_AUDIT_STOCK_BATCH_'||gen_random_uuid()::text;
 a uuid:='cbdc4ef3-005a-4674-8ea3-4410c7d7d212'; b uuid:='a7d45277-6dec-413d-bf6b-86620c1ef39f'; inactive uuid:='d856140b-26c9-4d6a-a5aa-8bea47e78fff';
 oa uuid; ob uuid; la uuid:=gen_random_uuid(); lb uuid:=gen_random_uuid(); ea uuid:=gen_random_uuid(); eb uuid:=gen_random_uuid();
 sa uuid:=gen_random_uuid(); sb uuid:=gen_random_uuid(); ca uuid:=gen_random_uuid(); os uuid:=gen_random_uuid(); fa uuid:=gen_random_uuid(); ta uuid:=gen_random_uuid();
 j jsonb; replay jsonb; data jsonb; items jsonb; bad jsonb; q text; n numeric; before_n int; after_n int; denied int:=0; target uuid;
BEGIN
 SELECT organization_id INTO oa FROM public.profiles WHERE user_id=a AND ativo;
 SELECT organization_id INTO ob FROM public.profiles WHERE user_id=b AND ativo;
 IF oa IS NULL OR ob IS NULL OR oa=ob THEN RAISE EXCEPTION 'INVALID_ACTORS'; END IF;
 INSERT INTO public.lotes(id,codigo_lote,microrganismo_id,volume_produzido,status,organization_id,observacoes_tecnicas) VALUES
 (la,r||'_A','74eb1d1a-dcbc-5ed3-9290-63462a32668f',100000,'aprovado',oa,r),(lb,r||'_B','74eb1d1a-dcbc-5ed3-9290-63462a32668f',100000,'aprovado',ob,r);
 INSERT INTO public.controle_qualidade(lote_id,resultado,organization_id) VALUES(la,'aprovado',oa),(lb,'aprovado',ob);
 INSERT INTO public.envase(id,lote_id,tipo_embalagem,volume_por_unidade,quantidade,organization_id) VALUES(ea,la,'frasco_1L',1000,10,oa),(eb,lb,'frasco_1L',1000,10,ob);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated','iat',extract(epoch from now())::bigint)::text,true);
 INSERT INTO public.clientes(id,nome,codigo_cliente,organization_id) VALUES(ca,r,r,oa);
 INSERT INTO public.fazendas(id,cliente_id,nome,organization_id) VALUES(fa,ca,r,oa);
 INSERT INTO public.talhoes(id,fazenda_id,nome,organization_id) VALUES(ta,fa,r,oa);
 INSERT INTO public.ordens_servico(id,numero_os,cliente_id,fazenda_id,talhao_id,organization_id,origem,microrganismo_id,tipo_item) VALUES(os,r,ca,fa,ta,oa,'agronomica','74eb1d1a-dcbc-5ed3-9290-63462a32668f','microrganismo');
 INSERT INTO public.estoque_produto(id,lote_id,envase_id,quantidade,volume_total,validade,observacao_reserva) VALUES(sa,la,ea,10,10000,current_date+30,r);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',b,'role','authenticated','iat',extract(epoch from now())::bigint)::text,true);
 INSERT INTO public.estoque_produto(id,lote_id,envase_id,quantidade,volume_total,validade,observacao_reserva) VALUES(sb,lb,eb,10,10000,current_date+30,r);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated','iat',extract(epoch from now())::bigint)::text,true);

 data:=jsonb_build_object('cliente_id',ca); items:=jsonb_build_array(jsonb_build_object('item_id',sa,'quantidade',2));
 GRANT EXECUTE ON FUNCTION public.rpc_estoque_operar_v1(text,uuid,numeric,text,jsonb),public.rpc_estoque_reservar_v1(uuid,text,jsonb,text,jsonb) TO authenticated;
 GRANT EXECUTE ON FUNCTION public.fn_estoque_ctx_force(jsonb) TO authenticated; -- temporary only, final exception reverts
 SET LOCAL ROLE authenticated;
 PERFORM public.fn_estoque_ctx_force(jsonb_build_object('acao','ajuste','idempotency_key',r||'_FORGED','metadata',jsonb_build_object('forged',true)));
 j:=public.rpc_estoque_reservar_v1(os,'padrao',items,r||'_BATCH',data);
 IF j->>'ok'<>'true' OR j->>'replay'<>'false' THEN RAISE EXCEPTION 'BATCH_FALSE_SUCCESS'; END IF;
 target:=(j->'itens'->>0)::uuid;
 IF target=sa THEN RAISE EXCEPTION 'BATCH_SPLIT_TARGET_WRONG'; END IF;
 SELECT quantidade INTO n FROM public.estoque_produto WHERE id=sa; IF n<>8 THEN RAISE EXCEPTION 'BATCH_BALANCE_WRONG %',n; END IF;
 SELECT quantidade_reservada INTO n FROM public.estoque_produto WHERE id=target; IF n<>2 THEN RAISE EXCEPTION 'BATCH_RESERVED_WRONG'; END IF;
 SELECT count(*) INTO before_n FROM public.estoque_movimentacoes WHERE lote_id=la;
 replay:=public.rpc_estoque_reservar_v1(os,'manual',items,r||'_BATCH',data);
 SELECT count(*) INTO after_n FROM public.estoque_movimentacoes WHERE lote_id=la;
 IF replay->>'replay'<>'true' OR replay->'itens'<>j->'itens' OR before_n<>after_n THEN RAISE EXCEPTION 'BATCH_REPLAY_DUPLICATED'; END IF;
 IF EXISTS(SELECT 1 FROM public.estoque_movimentacoes WHERE lote_id=la AND (metadata ? 'forged' OR idempotency_key=r||'_FORGED')) THEN RAISE EXCEPTION 'BATCH_CONTEXT_FORGED'; END IF;
 BEGIN PERFORM public.rpc_estoque_reservar_v1(os,'padrao',jsonb_build_array(jsonb_build_object('item_id',sa,'quantidade',3)),r||'_BATCH',data); RAISE EXCEPTION 'KEY_CONFLICT_ACCEPTED'; EXCEPTION WHEN unique_violation THEN denied:=denied+1; END;
 BEGIN PERFORM public.rpc_estoque_reservar_v1(os,'padrao',jsonb_build_array(jsonb_build_object('item_id',sb,'quantidade',1)),r||'_CROSS',data); RAISE EXCEPTION 'CROSS_ACCEPTED'; EXCEPTION WHEN insufficient_privilege THEN denied:=denied+1; END;
 BEGIN PERFORM public.rpc_estoque_reservar_v1(os,'padrao',items,r||'_FORGE',data||jsonb_build_object('organization_id',ob)); RAISE EXCEPTION 'FORGE_ACCEPTED'; EXCEPTION WHEN invalid_parameter_value THEN denied:=denied+1; END;
 BEGIN PERFORM public.rpc_estoque_reservar_v1(gen_random_uuid(),'padrao',items,r||'_REF',data); RAISE EXCEPTION 'REF_ACCEPTED'; EXCEPTION WHEN insufficient_privilege THEN denied:=denied+1; END;
 FOREACH q IN ARRAY ARRAY['NaN','Infinity','-Infinity','0','-1'] LOOP
  BEGIN PERFORM public.rpc_estoque_reservar_v1(os,'padrao',jsonb_build_array(jsonb_build_object('item_id',sa,'quantidade',q)),r||'_NUM',data); RAISE EXCEPTION 'NUMERIC_ACCEPTED'; EXCEPTION WHEN check_violation THEN denied:=denied+1; END;
 END LOOP;
 FOREACH bad IN ARRAY ARRAY['null'::jsonb,'{}'::jsonb,'[1]'::jsonb,'[{"item_id":[],"quantidade":1}]'::jsonb] LOOP
  BEGIN PERFORM public.rpc_estoque_reservar_v1(os,'padrao',bad,r||'_BAD',data); RAISE EXCEPTION 'PAYLOAD_ACCEPTED'; EXCEPTION WHEN invalid_parameter_value THEN denied:=denied+1; END;
 END LOOP;
 -- Multi-item failure must revert the first item's successful mutation.
 BEGIN PERFORM public.rpc_estoque_reservar_v1(os,'manual',jsonb_build_array(jsonb_build_object('item_id',sa,'quantidade',1),jsonb_build_object('item_id',target,'quantidade',1)),r||'_ATOMIC',data); RAISE EXCEPTION 'INVALID_STATUS_ACCEPTED'; EXCEPTION WHEN check_violation THEN denied:=denied+1; END;
 SELECT quantidade INTO n FROM public.estoque_produto WHERE id=sa; IF n<>8 THEN RAISE EXCEPTION 'BATCH_NONATOMIC'; END IF;
 j:=public.rpc_estoque_reservar_v1(os,'manual',jsonb_build_array(jsonb_build_object('item_id',sa,'quantidade',8)),r||'_TOTAL',data);
 SELECT quantidade_reservada INTO n FROM public.estoque_produto WHERE id=sa; IF n<>8 OR (j->'itens'->>0)::uuid<>sa THEN RAISE EXCEPTION 'TOTAL_RESERVATION_FAILED'; END IF;
 replay:=public.rpc_estoque_reservar_v1(os,'manual',jsonb_build_array(jsonb_build_object('item_id',sa,'quantidade',8)),r||'_TOTAL',data);
 IF replay->>'replay'<>'true' THEN RAISE EXCEPTION 'TOTAL_REPLAY_FAILED'; END IF;
 RESET ROLE;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',b,'role','authenticated','iat',extract(epoch from now())::bigint)::text,true);
 SET LOCAL ROLE authenticated;
 BEGIN PERFORM public.rpc_estoque_reservar_v1(os,'manual',items,r||'_BATCH',data); RAISE EXCEPTION 'PLAN_ACCEPTED'; EXCEPTION WHEN insufficient_privilege THEN IF SQLERRM NOT LIKE '%ESTQ_FEATURE_REQUIRED%' THEN RAISE; END IF; denied:=denied+1; END;
 RESET ROLE;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',inactive,'role','authenticated','iat',extract(epoch from now())::bigint)::text,true);
 SET LOCAL ROLE authenticated;
 BEGIN PERFORM public.rpc_estoque_reservar_v1(os,'manual',items,r||'_BATCH',data); RAISE EXCEPTION 'INACTIVE_ACCEPTED'; EXCEPTION WHEN insufficient_privilege THEN IF SQLERRM NOT LIKE '%ESTQ_IDENTIDADE_INATIVA%' THEN RAISE; END IF; denied:=denied+1; END;
 RESET ROLE;
 IF denied<>16 THEN RAISE EXCEPTION 'DENIAL_COUNT %',denied; END IF;
 IF EXISTS(SELECT 1 FROM platform_private.stock_motor_context WHERE txid=txid_current()) THEN RAISE EXCEPTION 'PRIVATE_CONTEXT_NOT_CLOSED'; END IF;
 RAISE EXCEPTION 'STOCK_BATCH_PROOF_ROLLBACK run=% denied=% manifest=%',r,denied,jsonb_build_object('lotes',ARRAY[la,lb],'envases',ARRAY[ea,eb],'clientes',ca,'fazendas',fa,'talhoes',ta,'os',os,'stock',(SELECT array_agg(id) FROM public.estoque_produto WHERE lote_id IN(la,lb)),'moves',(SELECT array_agg(id) FROM public.estoque_movimentacoes WHERE lote_id IN(la,lb)),'batch_keys',ARRAY[r||'_BATCH',r||'_TOTAL']);
END $proof$;
