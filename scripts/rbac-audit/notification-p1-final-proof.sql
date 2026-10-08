-- Canonical swzpzcwiasxmjutrmvkm; SQL/role, NOT JWT/API/browser. Mandatory rollback.
DO $$ DECLARE a uuid:='cbdc4ef3-005a-4674-8ea3-4410c7d7d212'; ca uuid:=gen_random_uuid(); ra uuid:=gen_random_uuid(); org uuid; denied int:=0; n int;
BEGIN
 SELECT organization_id INTO org FROM public.profiles WHERE user_id=a AND ativo;
 IF org IS NULL THEN RAISE EXCEPTION 'ACTOR_INVALID'; END IF;
 INSERT INTO public.clientes(id,nome,codigo_cliente,organization_id) VALUES(ca,'TEMPORARY_AUDIT_NOTIFICATION_FINAL',ca::text,org);
 INSERT INTO public.registros_consultor(id,cliente_id,created_by,consultor_responsavel,codigo_visita) VALUES(ra,ca,a,a,ra::text);
 BEGIN INSERT INTO public.portal_notificacoes(cliente_id,recipient_user_id,titulo,mensagem,tipo,source_type,source_id) VALUES(ca,a,'TEMPORARY_AUDIT_NOTIFICATION_FINAL','test','informativo','registros_consultor',ra); RAISE EXCEPTION 'NON_PRODUCER_ACCEPTED'; EXCEPTION WHEN insufficient_privilege THEN denied:=denied+1; END;
 BEGIN INSERT INTO public.notificacoes_operacionais(usuario_id,tipo,titulo,mensagem,source_type,source_id) VALUES(a,'sistema','TEMPORARY_AUDIT_NOTIFICATION_FINAL','test','registros_consultor',ra); RAISE EXCEPTION 'GLOBAL_ACCEPTED'; EXCEPTION WHEN insufficient_privilege THEN denied:=denied+1; END;
 INSERT INTO public.notificacoes_operacionais(usuario_id,tipo,titulo,mensagem) VALUES(a,'informativo','TEMPORARY_AUDIT_NOTIFICATION_FINAL','test'); GET DIAGNOSTICS n=ROW_COUNT; IF n<>0 THEN RAISE EXCEPTION 'SOURCELESS_CREATED'; END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated','iat',extract(epoch from now())::bigint)::text,true); SET LOCAL ROLE authenticated;
 SELECT count(*) INTO n FROM public.portal_notificacoes; IF n<>0 THEN RAISE EXCEPTION 'PORTAL_LEAK'; END IF;
 BEGIN PERFORM public.rpc_create_portal_notification_secure(ca,'x','x','informativo',NULL,'registros_consultor',ra,'x'); RAISE EXCEPTION 'PORTAL_LEGACY_OPEN'; EXCEPTION WHEN insufficient_privilege THEN denied:=denied+1; END;
 BEGIN PERFORM public.rpc_preparar_notificacoes_alertas(); RAISE EXCEPTION 'QUEUE_OPEN'; EXCEPTION WHEN insufficient_privilege THEN denied:=denied+1; END;
 SELECT count(*) INTO n FROM public.alertas_notificacao_config; IF n<>0 THEN RAISE EXCEPTION 'EXTERNAL_CONFIG_VISIBLE'; END IF;
 RESET ROLE; IF denied<>4 THEN RAISE EXCEPTION 'NEGATIVES %',denied; END IF;
 RAISE EXCEPTION 'NOTIFICATION_FINAL_ROLLBACK negatives=4 sourceLessCreated=0 portalVisible=0 externalVisible=0 ca=% ra=%',ca,ra;
END $$;