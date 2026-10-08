-- Canonical swzpzcwiasxmjutrmvkm only. SQL claims proof, NOT browser/API authentication.
-- Expected final exception rolls back every fixture. Use a new run_id per execution.
DO $proof$
DECLARE
 r text:='TEMPORARY_AUDIT_STOCK_MOV_P1_'||gen_random_uuid()::text;
 a uuid:='a7d45277-6dec-413d-bf6b-86620c1ef39f'; -- AR Bio
 b uuid:='cbdc4ef3-005a-4674-8ea3-4410c7d7d212'; -- FSF
 oa uuid; ob uuid; la uuid:=gen_random_uuid(); lb uuid:=gen_random_uuid();
 sa uuid:=gen_random_uuid(); sb uuid:=gen_random_uuid(); ma uuid; mb uuid;
 ea uuid:=gen_random_uuid(); eb uuid:=gen_random_uuid();
 u uuid; own_id uuid; cross_id uuid; n int; d int:=0; j jsonb:='[]';
BEGIN
 SELECT organization_id INTO oa FROM public.profiles WHERE user_id=a AND ativo;
  SELECT organization_id INTO ob FROM public.profiles WHERE user_id=b AND ativo;
 IF oa IS NULL OR ob IS NULL OR oa=ob THEN RAISE EXCEPTION 'INVALID_ACTORS'; END IF;
 INSERT INTO public.lotes(id,codigo_lote,microrganismo_id,volume_produzido,status,organization_id,observacoes_tecnicas) VALUES
 (la,r||'_A','74eb1d1a-dcbc-5ed3-9290-63462a32668f',10000,'aprovado',oa,r),
 (lb,r||'_B','74eb1d1a-dcbc-5ed3-9290-63462a32668f',10000,'aprovado',ob,r);
 INSERT INTO public.controle_qualidade(lote_id,resultado,organization_id) VALUES(la,'aprovado',oa),(lb,'aprovado',ob);
 INSERT INTO public.envase(id,lote_id,tipo_embalagem,volume_por_unidade,quantidade,organization_id) VALUES
 (ea,la,'frasco_1L',1000,10,oa),(eb,lb,'frasco_1L',1000,10,ob);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated','iat',extract(epoch from now())::bigint)::text,true);
 INSERT INTO public.estoque_produto(id,lote_id,envase_id,quantidade,volume_total,validade,observacao_reserva) VALUES(sa,la,ea,10,10000,CURRENT_DATE+30,r);
 SELECT id INTO ma FROM public.estoque_movimentacoes WHERE estoque_produto_id=sa;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',b,'role','authenticated','iat',extract(epoch from now())::bigint)::text,true);
 INSERT INTO public.estoque_produto(id,lote_id,envase_id,quantidade,volume_total,validade,observacao_reserva) VALUES(sb,lb,eb,10,10000,CURRENT_DATE+30,r);
 SELECT id INTO mb FROM public.estoque_movimentacoes WHERE estoque_produto_id=sb;
 FOREACH u IN ARRAY ARRAY[a,b] LOOP
  own_id:=CASE WHEN u=a THEN sa ELSE sb END; cross_id:=CASE WHEN u=a THEN sb ELSE sa END;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated','iat',extract(epoch from now())::bigint)::text,true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM public.estoque_movimentacoes WHERE estoque_produto_id=own_id; IF n<>1 THEN RAISE EXCEPTION 'OWN_DIRECT %',n; END IF;
  SELECT count(*) INTO n FROM public.vw_bi_movimentacoes WHERE estoque_produto_id=own_id; IF n<>1 THEN RAISE EXCEPTION 'OWN_VIEW %',n; END IF;
  SELECT count(*) INTO n FROM public.estoque_movimentacoes WHERE estoque_produto_id=cross_id; IF n<>0 THEN RAISE EXCEPTION 'CROSS_DIRECT'; END IF;
  SELECT count(*) INTO n FROM public.vw_bi_movimentacoes WHERE estoque_produto_id=cross_id; IF n<>0 THEN RAISE EXCEPTION 'CROSS_VIEW'; END IF;
  SELECT count(*) INTO n FROM public.estoque_movimentacoes WHERE estoque_produto_id='000cd77c-506c-4cdf-b2bd-7233aff8efeb'; IF n<>0 THEN RAISE EXCEPTION 'ORPHAN_DIRECT'; END IF;
  SELECT count(*) INTO n FROM public.vw_bi_movimentacoes WHERE estoque_produto_id='000cd77c-506c-4cdf-b2bd-7233aff8efeb'; IF n<>0 THEN RAISE EXCEPTION 'ORPHAN_VIEW'; END IF;
  SELECT count(*) INTO n FROM public.vw_bi_estoque_produto WHERE id='000cd77c-506c-4cdf-b2bd-7233aff8efeb'; IF n<>0 THEN RAISE EXCEPTION 'ORPHAN_STOCK_VIEW'; END IF;
  RESET ROLE;
  j:=j||jsonb_build_array(jsonb_build_object('actor',u,'own_direct',1,'own_view',1,'cross_direct',0,'cross_view',0,'orphan_direct',0,'orphan_view',0));
 END LOOP;
 -- Actor B remains selected. Privileged writer must still reject divergent references.
 BEGIN INSERT INTO public.estoque_movimentacoes(estoque_produto_id,lote_id,acao) VALUES(sb,la,'ajuste'); EXCEPTION WHEN insufficient_privilege THEN d:=d+1; END;
 BEGIN INSERT INTO public.estoque_movimentacoes(estoque_produto_id,lote_id,acao) VALUES(sa,la,'ajuste'); EXCEPTION WHEN insufficient_privilege THEN d:=d+1; END;
 BEGIN INSERT INTO public.estoque_movimentacoes(estoque_produto_id,lote_id,acao,movimentacao_origem_id) VALUES(sb,lb,'ajuste',ma); EXCEPTION WHEN insufficient_privilege THEN d:=d+1; END;
 BEGIN INSERT INTO public.estoque_movimentacoes(estoque_produto_id,lote_id,acao,referencia_tipo,referencia_id) VALUES(sb,lb,'ajuste','estoque',sa); EXCEPTION WHEN insufficient_privilege THEN d:=d+1; END;
 IF d<>4 THEN RAISE EXCEPTION 'DENIALS %',d; END IF;
 RAISE EXCEPTION 'MOV_P1_POST_ROLLBACK result=%,denied=%,manifest=%',j,d,jsonb_build_object('run_id',r,'lotes',jsonb_build_array(la,lb),'envases',jsonb_build_array(ea,eb),'stock',jsonb_build_array(sa,sb),'movs',jsonb_build_array(ma,mb));
END $proof$;