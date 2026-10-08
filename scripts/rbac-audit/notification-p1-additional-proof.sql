-- Canonical swzpzcwiasxmjutrmvkm; SQL/role NOT JWT/API/browser.
-- No persistent writes; final exception mandatory. Unknown source and all forged columns.
DO $$
DECLARE a uuid := 'cbdc4ef3-005a-4674-8ea3-4410c7d7d212';
 b uuid := 'a7d45277-6dec-413d-bf6b-86620c1ef39f';
 target uuid := gen_random_uuid(); source uuid := gen_random_uuid(); denied int := 0;
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id=a AND ativo AND organization_id IS NOT NULL) THEN RAISE EXCEPTION 'INVALID_ACTOR'; END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated','iat',extract(epoch FROM now())::bigint)::text,true);
 SET LOCAL ROLE authenticated;
 BEGIN PERFORM public.rpc_create_notificacao_operacional(b,'retorno_programado','TEMPORARY_AUDIT_ADDITIONAL','test','/agenda','registros_consultor',source,target::text); RAISE EXCEPTION 'FORGED_SOURCE_ACCEPTED'; EXCEPTION WHEN insufficient_privilege THEN denied:=denied+1; END;
 BEGIN UPDATE public.notificacoes_operacionais SET titulo='forged' WHERE id=target; RAISE EXCEPTION 'TITLE_ACCEPTED'; EXCEPTION WHEN insufficient_privilege THEN denied:=denied+1; END;
 BEGIN UPDATE public.notificacoes_operacionais SET mensagem='forged' WHERE id=target; RAISE EXCEPTION 'BODY_ACCEPTED'; EXCEPTION WHEN insufficient_privilege THEN denied:=denied+1; END;
 BEGIN UPDATE public.notificacoes_operacionais SET source_type='registros_consultor',source_id=source WHERE id=target; RAISE EXCEPTION 'SOURCE_ACCEPTED'; EXCEPTION WHEN insufficient_privilege THEN denied:=denied+1; END;
 BEGIN UPDATE public.notificacoes_operacionais SET link='/agenda' WHERE id=target; RAISE EXCEPTION 'LINK_ACCEPTED'; EXCEPTION WHEN insufficient_privilege THEN denied:=denied+1; END;
 RESET ROLE;
 IF denied<>5 THEN RAISE EXCEPTION 'NEGATIVE_COUNT %',denied; END IF;
 RAISE EXCEPTION 'NOTIFICATION_ADDITIONAL_ROLLBACK negatives=5 target=% source=%',target,source;
END $$;