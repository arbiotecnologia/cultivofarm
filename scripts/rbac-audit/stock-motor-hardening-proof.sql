-- ONLY canonical swzpzcwiasxmjutrmvkm, official executor. NOT browser/API Auth proof.
-- No Auth rows, no real row edits, no safeguard disabled. P0001 at end MUST rollback grants and fixtures.
DO $proof$
DECLARE
 r text:='TEMPORARY_AUDIT_STOCK_MOTOR_'||gen_random_uuid()::text;
 a uuid:='cbdc4ef3-005a-4674-8ea3-4410c7d7d212'; b uuid:='a7d45277-6dec-413d-bf6b-86620c1ef39f';
 oa uuid; ob uuid; la uuid:=gen_random_uuid(); lb uuid:=gen_random_uuid(); ea uuid:=gen_random_uuid(); eb uuid:=gen_random_uuid();
 sa uuid:=gen_random_uuid(); sb uuid:=gen_random_uuid(); ca uuid:=gen_random_uuid(); os uuid:=gen_random_uuid();
 j jsonb; replay jsonb; payload jsonb; target uuid; expmov uuid; n int; before_n int; denied int:=0; action text;
 results jsonb:='{}'; stocks uuid[]; moves uuid[];
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
 INSERT INTO public.ordens_servico(id,numero_os,cliente_id,organization_id,origem,microrganismo_id,tipo_item) VALUES(os,r,ca,oa,'agronomica','74eb1d1a-dcbc-5ed3-9290-63462a32668f','microrganismo');
 INSERT INTO public.estoque_produto(id,lote_id,envase_id,quantidade,volume_total,validade,observacao_reserva) VALUES(sa,la,ea,10,10000,current_date+30,r);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',b,'role','authenticated','iat',extract(epoch from now())::bigint)::text,true);
 INSERT INTO public.estoque_produto(id,lote_id,envase_id,quantidade,volume_total,validade,observacao_reserva) VALUES(sb,lb,eb,10,10000,current_date+30,r);
 -- Temporary schema privilege strictly inside this transaction; final exception undoes it.
 GRANT EXECUTE ON FUNCTION public.rpc_estoque_operar_v1(text,uuid,numeric,text,jsonb) TO authenticated;
 SET LOCAL ROLE authenticated;
 BEGIN PERFORM public.rpc_estoque_operar_v1('ajuste',sb,1,r||'_PLAN',jsonb_build_object('motivo',r)); RAISE EXCEPTION 'PLAN_NOT_DENIED';
 EXCEPTION WHEN insufficient_privilege THEN IF SQLERRM NOT LIKE '%ESTQ_FEATURE_REQUIRED%' THEN RAISE; END IF; denied:=denied+1; END;
 RESET ROLE;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated','iat',extract(epoch from now())::bigint)::text,true);
 SET LOCAL ROLE authenticated;
 BEGIN PERFORM public.rpc_estoque_operar_v1('ajuste',sb,1,r||'_CROSS',jsonb_build_object('motivo',r)); RAISE EXCEPTION 'CROSS_NOT_DENIED'; EXCEPTION WHEN insufficient_privilege THEN denied:=denied+1; END;
 BEGIN PERFORM public.rpc_estoque_operar_v1('ajuste',sa,1,r||'_FORGE',jsonb_build_object('motivo',r,'organization_id',ob)); RAISE EXCEPTION 'FORGE_NOT_DENIED'; EXCEPTION WHEN invalid_parameter_value THEN denied:=denied+1; END;
 BEGIN PERFORM public.rpc_estoque_operar_v1('ajuste',sa,1,r||'_REF',jsonb_build_object('motivo',r,'referencia_tipo','lote','referencia_id',lb)); RAISE EXCEPTION 'REF_NOT_DENIED'; EXCEPTION WHEN insufficient_privilege THEN denied:=denied+1; END;
 FOREACH action IN ARRAY ARRAY['ajuste','perda','descarte','devolucao'] LOOP
  payload:=jsonb_build_object('motivo',r,'classificacao','reintegravel');
  j:=public.rpc_estoque_operar_v1(action,sa,1,r||'_'||action,payload);
  IF j->>'ok'<>'true' OR j->>'replay'<>'false' THEN RAISE EXCEPTION 'MOTOR_FALSE_SUCCESS %',action; END IF;
  SELECT count(*) INTO before_n FROM public.estoque_movimentacoes WHERE estoque_produto_id=sa;
  replay:=public.rpc_estoque_operar_v1(action,sa,1,r||'_'||action,payload);
  SELECT count(*) INTO n FROM public.estoque_movimentacoes WHERE estoque_produto_id=sa;
  IF replay->>'replay'<>'true' OR replay->>'movimentacao_id' IS DISTINCT FROM j->>'movimentacao_id' OR n<>before_n THEN RAISE EXCEPTION 'BAD_REPLAY %',action; END IF;
  results:=results||jsonb_build_object(action,j);
 END LOOP;
 SELECT quantidade INTO n FROM public.estoque_produto WHERE id=sa; IF n<>8 THEN RAISE EXCEPTION 'BALANCE_EXPECTED_8 %',n; END IF;
 payload:=jsonb_build_object('os_id',os,'os_tipo','manual','cliente_id',ca);
 j:=public.rpc_estoque_operar_v1('reserva',sa,2,r||'_SPLIT',payload); target:=(j->>'estoque_produto_id')::uuid;
 IF target=sa OR j->>'ok'<>'true' THEN RAISE EXCEPTION 'NO_SPLIT'; END IF;
 SELECT count(*) INTO before_n FROM public.estoque_movimentacoes WHERE lote_id=la;
 replay:=public.rpc_estoque_operar_v1('reserva',sa,2,r||'_SPLIT',payload);
 SELECT count(*) INTO n FROM public.estoque_movimentacoes WHERE lote_id=la;
 IF replay->>'replay'<>'true' OR (replay->>'estoque_produto_id')::uuid<>target OR n<>before_n THEN RAISE EXCEPTION 'SPLIT_REPLAY_FAILED'; END IF;
 SELECT quantidade INTO n FROM public.estoque_produto WHERE id=sa; IF n<>6 THEN RAISE EXCEPTION 'SPLIT_SOURCE_BALANCE %',n; END IF;
 SELECT quantidade_reservada INTO n FROM public.estoque_produto WHERE id=target; IF n<>2 THEN RAISE EXCEPTION 'SPLIT_TARGET_BALANCE %',n; END IF;
 BEGIN PERFORM public.rpc_estoque_operar_v1('reserva',target,2,r||'_SPLIT',payload); RAISE EXCEPTION 'WRONG_ITEM_REPLAY'; EXCEPTION WHEN unique_violation THEN denied:=denied+1; END;
 j:=public.rpc_estoque_operar_v1('cancelamento_reserva',target,1,r||'_CANCEL','{}');
 j:=public.rpc_estoque_operar_v1('expedicao',target,1,r||'_EXP','{}'); expmov:=(j->>'movimentacao_id')::uuid;
 j:=public.rpc_estoque_operar_v1('estorno_expedicao',target,NULL,r||'_REV',jsonb_build_object('movimentacao_origem_id',expmov));
 j:=public.rpc_estoque_operar_v1('entrega',target,1,r||'_DEL','{}');
 -- No business status guard is relaxed to make proof green.
 results:=results||jsonb_build_object('split',target,'expedition',expmov,'last',j);
 RESET ROLE;
 SELECT array_agg(id) INTO stocks FROM public.estoque_produto WHERE lote_id IN (la,lb);
 SELECT array_agg(id) INTO moves FROM public.estoque_movimentacoes WHERE lote_id IN (la,lb);
 IF denied<>5 THEN RAISE EXCEPTION 'DENIAL_COUNT %',denied; END IF;
 RAISE EXCEPTION 'STOCK_MOTOR_PROOF_ROLLBACK results=%,denied=%,manifest=%',results,denied,jsonb_build_object('run_id',r,'lotes',jsonb_build_array(la,lb),'envases',jsonb_build_array(ea,eb),'clientes',ca,'os',os,'stock',stocks,'moves',moves);
END $proof$;