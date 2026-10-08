-- Canonical swzpzcwiasxmjutrmvkm. SQL/role only, NOT JWT/API/browser.
-- Every fixture is random; final exception is mandatory and rolls back all writes.
DO $proof$
DECLARE
 run text:='TEMPORARY_AUDIT_NOTIF_'||gen_random_uuid();
 a uuid:='cbdc4ef3-005a-4674-8ea3-4410c7d7d212';
 b uuid:='a7d45277-6dec-413d-bf6b-86620c1ef39f';
 inactive uuid:='d856140b-26c9-4d6a-a5aa-8bea47e78fff';
 oa uuid; ob uuid; ca uuid:=gen_random_uuid(); cb uuid:=gen_random_uuid();
 ra uuid:=gen_random_uuid(); rb uuid:=gen_random_uuid(); na uuid; nb uuid;
 j jsonb; replay jsonb; n int; denied int:=0;
BEGIN
 SELECT organization_id INTO oa FROM public.profiles WHERE user_id=a AND ativo;
 SELECT organization_id INTO ob FROM public.profiles WHERE user_id=b AND ativo;
 IF oa IS NULL OR ob IS NULL OR oa=ob THEN RAISE EXCEPTION 'NOTIF_INVALID_ACTORS'; END IF;
 INSERT INTO public.clientes(id,nome,codigo_cliente,organization_id) VALUES(ca,run,ca::text,oa),(cb,run,cb::text,ob);
 INSERT INTO public.registros_consultor(id,cliente_id,created_by,consultor_responsavel,codigo_visita) VALUES(ra,ca,a,a,ra::text),(rb,cb,b,b,rb::text);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated','iat',extract(epoch from now())::bigint)::text,true);
 SET LOCAL ROLE authenticated;
 j:=public.rpc_create_notificacao_operacional(a,'retorno_programado',run,'A','/agenda','registros_consultor',ra,run);
 na:=(j->>'notification_id')::uuid;
 IF na IS NULL OR j->>'created'<>'true' THEN RAISE EXCEPTION 'NOTIF_FALSE_SUCCESS'; END IF;
 replay:=public.rpc_create_notificacao_operacional(a,'retorno_programado',run,'A','/agenda','registros_consultor',ra,run);
 IF replay->>'notification_id'<>na::text OR replay->>'duplicated'<>'true' THEN RAISE EXCEPTION 'NOTIF_REPLAY_FAILED'; END IF;
 SELECT count(*) INTO n FROM public.notificacoes_operacionais WHERE id=na;
 IF n<>1 THEN RAISE EXCEPTION 'NOTIF_OWN_HIDDEN'; END IF;
 UPDATE public.notificacoes_operacionais SET lido=true WHERE id=na;
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>1 THEN RAISE EXCEPTION 'NOTIF_READ_UPDATE_FAILED'; END IF;
 BEGIN UPDATE public.notificacoes_operacionais SET mensagem='forged' WHERE id=na; RAISE EXCEPTION 'BODY_ACCEPTED'; EXCEPTION WHEN insufficient_privilege THEN denied:=denied+1; END;
 BEGIN UPDATE public.notificacoes_operacionais SET usuario_id=b WHERE id=na; RAISE EXCEPTION 'RECIPIENT_ACCEPTED'; EXCEPTION WHEN insufficient_privilege THEN denied:=denied+1; END;
 BEGIN PERFORM public.rpc_create_notificacao_operacional(b,'retorno_programado',run,'A','/agenda','registros_consultor',ra,run); RAISE EXCEPTION 'CROSS_RECIPIENT_ACCEPTED'; EXCEPTION WHEN insufficient_privilege THEN denied:=denied+1; END;
 BEGIN PERFORM public.rpc_create_notificacao_operacional(a,'retorno_programado',run,'A','/agenda','registros_consultor',rb,run); RAISE EXCEPTION 'CROSS_SOURCE_ACCEPTED'; EXCEPTION WHEN insufficient_privilege THEN denied:=denied+1; END;
 BEGIN PERFORM public.rpc_create_notificacao_operacional(a,'retorno_programado',run,'A','/agenda','registros_consultor',gen_random_uuid(),run); RAISE EXCEPTION 'FORGED_SOURCE_ACCEPTED'; EXCEPTION WHEN insufficient_privilege THEN denied:=denied+1; END;
 BEGIN PERFORM public.rpc_create_notificacao_operacional(a,'sistema',run,'A','/agenda','registros_consultor',ra,run); RAISE EXCEPTION 'FAKE_GLOBAL_ACCEPTED'; EXCEPTION WHEN insufficient_privilege THEN denied:=denied+1; END;
 BEGIN PERFORM public.rpc_create_notificacao_operacional(a,'retorno_programado',run,'CHANGED','/agenda','registros_consultor',ra,run); RAISE EXCEPTION 'REPLAY_CONFLICT_ACCEPTED'; EXCEPTION WHEN invalid_parameter_value THEN denied:=denied+1; END;
 BEGIN PERFORM public.rpc_create_notificacao_operacional(inactive,'retorno_programado',run,'A','/agenda','registros_consultor',ra,run); RAISE EXCEPTION 'INACTIVE_TARGET_ACCEPTED'; EXCEPTION WHEN insufficient_privilege THEN denied:=denied+1; END;
 BEGIN PERFORM public.rpc_notificar_gestor(run,'A',NULL); RAISE EXCEPTION 'SOURCELESS_ACCEPTED'; EXCEPTION WHEN insufficient_privilege THEN denied:=denied+1; END;
 SELECT count(*) INTO n FROM public.notificacoes_operacionais WHERE source_id IS NULL;
 IF n<>0 THEN RAISE EXCEPTION 'LEGACY_VISIBLE'; END IF;
 RESET ROLE;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',b,'role','authenticated','iat',extract(epoch from now())::bigint)::text,true);
 SET LOCAL ROLE authenticated;
 SELECT count(*) INTO n FROM public.notificacoes_operacionais WHERE id=na;
 IF n<>0 THEN RAISE EXCEPTION 'CROSS_READ'; END IF;
 UPDATE public.notificacoes_operacionais SET lido=false WHERE id=na; GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>0 THEN RAISE EXCEPTION 'CROSS_UPDATE'; END IF;
 j:=public.rpc_create_notificacao_operacional(b,'retorno_programado',run,'B','/agenda','registros_consultor',rb,run);
 nb:=(j->>'notification_id')::uuid;
 IF nb IS NULL OR nb=na THEN RAISE EXCEPTION 'GLOBAL_KEY_COLLISION'; END IF;
 BEGIN PERFORM public.rpc_create_notificacao_operacional(b,'retorno_programado',run,'A','/agenda','registros_consultor',ra,run); RAISE EXCEPTION 'CROSS_REPLAY_ACCEPTED'; EXCEPTION WHEN insufficient_privilege THEN denied:=denied+1; END;
 RESET ROLE;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',inactive,'role','authenticated')::text,true);
 SET LOCAL ROLE authenticated;
 BEGIN PERFORM public.rpc_create_notificacao_operacional(inactive,'retorno_programado',run,'A','/agenda','registros_consultor',ra,run); RAISE EXCEPTION 'INACTIVE_ACTOR_ACCEPTED'; EXCEPTION WHEN insufficient_privilege THEN denied:=denied+1; END;
 RESET ROLE;
 IF denied<>11 THEN RAISE EXCEPTION 'NEGATIVE_COUNT %',denied; END IF;
 RAISE EXCEPTION 'NOTIFICATION_P1_ROLLBACK ownA=1 ownB=1 cross=0 updateRead=1 crossUpdate=0 legacy=0 replay=1 independentKey=1 negatives=% run=% ca=% cb=% ra=% rb=% na=% nb=%',denied,run,ca,cb,ra,rb,na,nb;
END $proof$;