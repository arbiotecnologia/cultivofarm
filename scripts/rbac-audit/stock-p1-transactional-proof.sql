-- Execute only against verified production swzpzcwiasxmjutrmvkm via official SQL executor.
-- SQL claims/role proof, NOT a signed-in browser/API session. Expected P0001 reverts ALL fixtures.
DO $proof$
DECLARE
 run_id text := 'TEMPORARY_AUDIT_STOCK_P1_20261008T0237';
 ua uuid := 'cbdc4ef3-005a-4674-8ea3-4410c7d7d212'; ub uuid := 'a7d45277-6dec-413d-bf6b-86620c1ef39f';
 oa uuid; ob uuid; la uuid:=gen_random_uuid(); lb uuid:=gen_random_uuid();
 ea uuid:=gen_random_uuid(); eb uuid:=gen_random_uuid(); sa uuid:=gen_random_uuid(); sb uuid:=gen_random_uuid();
 m uuid := '74eb1d1a-dcbc-5ed3-9290-63462a32668f';
 n integer; denied integer:=0; result jsonb:='{}'::jsonb;
BEGIN
 SELECT organization_id INTO oa FROM public.profiles WHERE user_id=ua AND ativo;
 SELECT organization_id INTO ob FROM public.profiles WHERE user_id=ub AND ativo;
 IF oa IS NULL OR ob IS NULL OR oa=ob THEN RAISE EXCEPTION 'PROOF_INVALID_IDENTITIES'; END IF;
 INSERT INTO public.lotes(id,codigo_lote,microrganismo_id,volume_produzido,status,organization_id,observacoes_tecnicas) VALUES
 (la,run_id||'_A',m,100000,'aprovado',oa,run_id),(lb,run_id||'_B',m,100000,'aprovado',ob,run_id);
 INSERT INTO public.controle_qualidade(lote_id,resultado,organization_id) VALUES(la,'aprovado',oa),(lb,'aprovado',ob);
 INSERT INTO public.envase(id,lote_id,tipo_embalagem,volume_por_unidade,quantidade,organization_id) VALUES
 (ea,la,'frasco_1L',1000,10,oa),(eb,lb,'frasco_1L',1000,10,ob);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',ua,'role','authenticated','iat',extract(epoch from now())::bigint)::text,true);

 INSERT INTO public.estoque_produto(id,lote_id,envase_id,quantidade,volume_total,validade,observacao_reserva) VALUES(sa,la,ea,10,10000,CURRENT_DATE+30,run_id);
 SET LOCAL ROLE authenticated;
 SELECT count(*) INTO n FROM public.estoque_produto WHERE id=sa; IF n<>1 THEN RAISE EXCEPTION 'A_OWN_FAILED'; END IF;
 result:=result||jsonb_build_object('a_own',n);
 SELECT count(*) INTO n FROM public.estoque_produto WHERE id='000cd77c-506c-4cdf-b2bd-7233aff8efeb'; IF n<>0 THEN RAISE EXCEPTION 'A_ORPHAN_VISIBLE'; END IF;
 result:=result||jsonb_build_object('a_orphan',n);
 RESET ROLE;
 BEGIN INSERT INTO public.estoque_produto(lote_id,envase_id,quantidade,volume_total) VALUES(lb,eb,1,1000); EXCEPTION WHEN insufficient_privilege THEN denied:=denied+1; END;
 PERFORM public.fn_estoque_ctx_open(jsonb_build_object('origem',run_id,'acao','ajuste','usuario_id',ua::text));
 UPDATE public.estoque_produto SET quantidade=9 WHERE id=sa; GET DIAGNOSTICS n=ROW_COUNT; IF n<>1 THEN RAISE EXCEPTION 'A_OWN_UPDATE_FAILED'; END IF;
 result:=result||jsonb_build_object('a_own_update',n);
 BEGIN UPDATE public.estoque_produto SET lote_id=lb WHERE id=sa; EXCEPTION WHEN insufficient_privilege THEN denied:=denied+1; END;
 BEGIN UPDATE public.estoque_produto SET envase_id=eb WHERE id=sa; EXCEPTION WHEN insufficient_privilege THEN denied:=denied+1; END;
 SET LOCAL ROLE authenticated;
 BEGIN PERFORM public.rpc_estoque_operar_v1('ajuste',sa,1,run_id,jsonb_build_object('motivo',run_id)); EXCEPTION WHEN insufficient_privilege THEN denied:=denied+1; END;
 BEGIN PERFORM public.rpc_estoque_reservar_v1(gen_random_uuid(),'manual','[]'::jsonb,run_id,'{}'::jsonb); EXCEPTION WHEN insufficient_privilege THEN denied:=denied+1; END;
 BEGIN PERFORM public.rpc_rastreio_produto_interno(sa); EXCEPTION WHEN insufficient_privilege THEN denied:=denied+1; END;
 RESET ROLE;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',ub,'role','authenticated','iat',extract(epoch from now())::bigint)::text,true);

 INSERT INTO public.estoque_produto(id,lote_id,envase_id,quantidade,volume_total,validade,observacao_reserva) VALUES(sb,lb,eb,10,10000,CURRENT_DATE+30,run_id);
 SET LOCAL ROLE authenticated;
 SELECT count(*) INTO n FROM public.estoque_produto WHERE id=sb; IF n<>1 THEN RAISE EXCEPTION 'B_OWN_FAILED'; END IF; result:=result||jsonb_build_object('b_own',n);
 SELECT count(*) INTO n FROM public.estoque_produto WHERE id=sa; IF n<>0 THEN RAISE EXCEPTION 'B_CROSS_VISIBLE'; END IF; result:=result||jsonb_build_object('b_cross',n);
 SELECT count(*) INTO n FROM public.estoque_produto WHERE id='000cd77c-506c-4cdf-b2bd-7233aff8efeb'; IF n<>0 THEN RAISE EXCEPTION 'B_ORPHAN_VISIBLE'; END IF; result:=result||jsonb_build_object('b_orphan',n);
 BEGIN UPDATE public.estoque_produto SET quantidade=1 WHERE id=sa; EXCEPTION WHEN insufficient_privilege THEN denied:=denied+1; END; result:=result||jsonb_build_object('b_cross_update','ACL_DENIED');
 BEGIN DELETE FROM public.estoque_produto WHERE id=sa; EXCEPTION WHEN insufficient_privilege THEN denied:=denied+1; END; result:=result||jsonb_build_object('b_cross_delete','ACL_DENIED');
 RESET ROLE;
 -- B actor with privileged executor still cannot mutate A fixture despite bypass-RLS.
 BEGIN UPDATE public.estoque_produto SET quantidade=1 WHERE id=sa; EXCEPTION WHEN insufficient_privilege THEN denied:=denied+1; END;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',ua,'role','authenticated','iat',extract(epoch from now())::bigint)::text,true);
 SET LOCAL ROLE authenticated;
 SELECT count(*) INTO n FROM public.estoque_produto WHERE id=sb; IF n<>0 THEN RAISE EXCEPTION 'A_CROSS_VISIBLE'; END IF; result:=result||jsonb_build_object('a_cross',n);
 BEGIN UPDATE public.estoque_produto SET quantidade=1 WHERE id=sb; EXCEPTION WHEN insufficient_privilege THEN denied:=denied+1; END; result:=result||jsonb_build_object('a_cross_update','ACL_DENIED');
 BEGIN DELETE FROM public.estoque_produto WHERE id=sb; EXCEPTION WHEN insufficient_privilege THEN denied:=denied+1; END; result:=result||jsonb_build_object('a_cross_delete','ACL_DENIED');
 RESET ROLE;
 IF denied<>11 THEN RAISE EXCEPTION 'DENIAL_COUNT_WRONG %',denied; END IF;
 RAISE EXCEPTION 'STOCK_P1_PROOF_ROLLBACK result=%, denied=%, manifest=%',result,denied,jsonb_build_object('run_id',run_id,'lotes',jsonb_build_array(la,lb),'envases',jsonb_build_array(ea,eb),'stock',jsonb_build_array(sa,sb));
END $proof$;
