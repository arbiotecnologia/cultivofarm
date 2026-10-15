-- CANDIDATO LOCAL NÃO APLICADO. Sem GRANT, sem UI, sem fabricação.
-- Executar somente em transação revisada; ACL/owner e demais corpos preservados.
CREATE TEMP TABLE programar_baseline ON COMMIT DROP AS
SELECT oid,proacl,proowner,pg_get_functiondef(oid) definition
FROM pg_proc WHERE oid='public.rpc_programar_os_v1(uuid,text,date)'::regprocedure;
DO $pre$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.fiscal_environment_marker WHERE project_ref='swzpzcwiasxmjutrmvkm') THEN RAISE EXCEPTION 'CANONICAL_REF_REQUIRED'; END IF;
 IF md5(pg_get_functiondef('public.rpc_programar_os_v1(uuid,text,date)'::regprocedure)) IS DISTINCT FROM 'a42d6b07f51e6dacf41096f6cefb8163' THEN RAISE EXCEPTION 'PROGRAMAR_BODY_DRIFT'; END IF;
 IF md5(pg_get_functiondef('private.h7n_esteira_laboratorio()'::regprocedure)) IS DISTINCT FROM 'bad38b5200629cc887767e62b7a46e40' THEN RAISE EXCEPTION 'CHAIN_DRIFT'; END IF;
 IF md5(pg_get_functiondef('platform_private.lab_item_is_manufacturable(uuid,uuid)'::regprocedure)) IS DISTINCT FROM '853595394240e8f2a61ac2d621118271' THEN RAISE EXCEPTION 'BIOLOGICAL_DRIFT'; END IF;
 IF md5(pg_get_functiondef('public.fn_cockpit_norm_origem(text)'::regprocedure)) IS DISTINCT FROM '701ba8da92fc3df9ea0e5270ab5e74b2' THEN RAISE EXCEPTION 'ORIGIN_DRIFT'; END IF;
 IF md5(pg_get_functiondef('public.technical_actor_ready(uuid)'::regprocedure)) IS DISTINCT FROM 'b5d0994b6eb976b14122cd2a1ec798cf' OR md5(pg_get_functiondef('platform_private.h15_actor_organization()'::regprocedure)) IS DISTINCT FROM '64e10608403238a41a9baf92857ca881' OR md5(pg_get_functiondef('public._saas_user_has_feature(uuid,text)'::regprocedure)) IS DISTINCT FROM '501dd958e117d2df8a4d38f6bcbeed04' THEN RAISE EXCEPTION 'ACTOR_CONTRACT_DRIFT'; END IF;
 IF md5((SELECT string_agg(table_name||':'||column_name||':'||udt_name||':'||is_nullable||':'||coalesce(column_default,''),E'\n' ORDER BY table_name,ordinal_position) FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('ordens_servico','ordens_servico_onfarm','programacao_producao','laboratorio_esteira_eventos'))) IS DISTINCT FROM '65c9714925862453043e64da5bf2cbdb' THEN RAISE EXCEPTION 'SCHEMA_DRIFT'; END IF;
 IF (SELECT md5(string_agg(t.tgrelid::regclass::text||':'||t.tgname||':'||t.tgenabled::text||':'||pg_get_triggerdef(t.oid)||':'||md5(pg_get_functiondef(t.tgfoid)),E'\n' ORDER BY t.tgrelid::regclass::text,t.tgname)) FROM pg_trigger t WHERE NOT t.tgisinternal AND t.tgrelid IN ('public.ordens_servico'::regclass,'public.ordens_servico_onfarm'::regclass,'public.programacao_producao'::regclass)) IS DISTINCT FROM '7f00df0799ad242031f0279373091034' THEN RAISE EXCEPTION 'TRIGGER_CHAIN_DRIFT'; END IF;
 IF has_function_privilege('authenticated','public.rpc_programar_os_v1(uuid,text,date)','EXECUTE') OR has_function_privilege('anon','public.rpc_programar_os_v1(uuid,text,date)','EXECUTE') OR EXISTS(SELECT 1 FROM programar_baseline b,LATERAL aclexplode(coalesce(b.proacl,acldefault('f',b.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') THEN RAISE EXCEPTION 'PROGRAMAR_ACL_NOT_CLOSED'; END IF;
END $pre$;
CREATE OR REPLACE FUNCTION public.rpc_programar_os_v1(p_os_id uuid,p_origem text,p_data_programada date DEFAULT NULL::date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE
 v_uid uuid:=auth.uid(); v_org uuid; v_origin text; v_os record;
 v_pp public.programacao_producao%ROWTYPE; v_before jsonb; v_after jsonb;
 v_count integer; v_canonical text; v_status text;
BEGIN
 -- O helper corrente valida a cadeia completa atual, não a MV; antes de status/replay.
 v_org:=platform_private.h15_actor_organization();
 IF v_uid IS NULL OR v_org IS NULL OR public.technical_actor_ready(v_uid) IS NOT TRUE
 OR public._saas_user_has_feature(v_uid,'ordens_producao') IS NOT TRUE
 OR NOT (public.has_role(v_uid,'administrador') OR public.has_role(v_uid,'gestor') OR public.has_role(v_uid,'producao') OR public.has_role(v_uid,'administrativo')) THEN
 RAISE EXCEPTION 'PROGRAMAR_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
 v_origin:=public.fn_cockpit_norm_origem(p_origem);
 v_canonical:=CASE WHEN v_origin='onfarm' THEN 'onfarm' ELSE 'manual' END;
 IF p_os_id IS NULL OR NOT EXISTS(SELECT 1 FROM private.h7n_esteira_laboratorio() s WHERE s.os_id=p_os_id AND s.origem_os=v_canonical) THEN RAISE EXCEPTION 'PROGRAMAR_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
 -- Serialização de chamadas deste motor; writers externos não assumem este lock.
 PERFORM pg_advisory_xact_lock(hashtextextended('programar:'||p_os_id::text,0));
 IF v_canonical='manual' THEN
 SELECT o.id,o.cliente_id,o.fazenda_id,o.talhao_id,o.produto_id,o.microrganismo_id,o.status::text status,o.volume_total_ml,o.data_programada os_date,o.partner_order_id,o.partner_order_item_id,o.origem INTO v_os FROM public.ordens_servico o WHERE o.id=p_os_id FOR UPDATE;
 ELSE
 SELECT o.id,o.cliente_id,o.fazenda_id,o.talhao_id,o.produto_id,o.microrganismo_id,o.status::text status,o.volume_total_ml,NULL::date os_date,NULL::uuid partner_order_id,NULL::uuid partner_order_item_id,'onfarm'::text origem INTO v_os FROM public.ordens_servico_onfarm o WHERE o.id=p_os_id FOR UPDATE;
 END IF;
 IF v_os.id IS NULL THEN RAISE EXCEPTION 'PROGRAMAR_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
 -- Locks sobre referências atuais. Revalidação posterior impede respostas antigas.
 PERFORM 1 FROM public.profiles WHERE user_id=v_uid FOR SHARE;
 PERFORM 1 FROM public.organizations WHERE id=v_org FOR SHARE;
 PERFORM 1 FROM public.clientes WHERE id=v_os.cliente_id FOR SHARE;
 PERFORM 1 FROM public.fazendas WHERE id=v_os.fazenda_id FOR SHARE;
 PERFORM 1 FROM public.talhoes WHERE id=v_os.talhao_id FOR SHARE;
 PERFORM 1 FROM public.produtos WHERE id=v_os.produto_id FOR SHARE;
 PERFORM 1 FROM public.microrganismos WHERE id=v_os.microrganismo_id FOR SHARE;
 PERFORM 1 FROM public.programacao_producao WHERE ordem_servico_id=p_os_id OR ordem_servico_onfarm_id=p_os_id ORDER BY id FOR UPDATE;
 IF public.technical_actor_ready(v_uid) IS NOT TRUE OR platform_private.h15_actor_organization() IS DISTINCT FROM v_org
 OR public._saas_user_has_feature(v_uid,'ordens_producao') IS NOT TRUE
 OR NOT EXISTS(SELECT 1 FROM private.h7n_esteira_laboratorio() s WHERE s.os_id=p_os_id AND s.origem_os=v_canonical) THEN RAISE EXCEPTION 'PROGRAMAR_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
 -- B2B/links acionam sync comercial/planejamento/notificações não homologados.
 IF v_origin='b2b' OR v_os.origem='b2b' OR v_os.partner_order_id IS NOT NULL OR v_os.partner_order_item_id IS NOT NULL
 OR EXISTS(SELECT 1 FROM public.production_order_link WHERE ordem_servico_id=p_os_id) THEN
 RETURN jsonb_build_object('success',false,'message','Programação B2B indisponível até validação dos efeitos associados.'); END IF;
 SELECT count(*) INTO v_count FROM public.programacao_producao WHERE ordem_servico_id=p_os_id OR ordem_servico_onfarm_id=p_os_id;
 IF v_count<>1 THEN RETURN jsonb_build_object('success',false,'message','Programação existente não comprovada; revisão necessária.'); END IF;
 SELECT * INTO v_pp FROM public.programacao_producao WHERE ordem_servico_id=p_os_id OR ordem_servico_onfarm_id=p_os_id;
 IF NOT ((v_pp.organization_id=v_org AND ((v_canonical='manual' AND v_pp.ordem_servico_id=p_os_id AND v_pp.ordem_servico_onfarm_id IS NULL) OR (v_canonical='onfarm' AND v_pp.ordem_servico_onfarm_id=p_os_id AND v_pp.ordem_servico_id IS NULL)) AND v_pp.produto_id IS NOT DISTINCT FROM v_os.produto_id AND v_pp.microrganismo_id IS NOT DISTINCT FROM v_os.microrganismo_id) IS TRUE) THEN RAISE EXCEPTION 'PROGRAMAR_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
 -- FK responsável usa profiles.id; helper legado usa user_id. Não reinterpretar silenciosamente.
 IF v_pp.responsavel_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=v_pp.responsavel_id AND p.organization_id=v_org AND p.ativo IS TRUE) THEN RAISE EXCEPTION 'PROGRAMAR_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
 IF v_os.status NOT IN ('aprovada','programada') THEN RETURN jsonb_build_object('success',false,'message','A OS deve estar previamente aprovada; esta ação não aprova nem inicia fabricação.'); END IF;
 IF platform_private.lab_item_is_manufacturable(v_os.produto_id,v_os.microrganismo_id) IS NOT TRUE THEN RETURN jsonb_build_object('success',false,'message','Item não elegível ao laboratório biológico.'); END IF;
 IF v_pp.status::text<>'aguardando' OR EXISTS(SELECT 1 FROM public.lotes WHERE programacao_id=v_pp.id) THEN RETURN jsonb_build_object('success',false,'message','A programação já avançou; operação indisponível.'); END IF;
 IF p_data_programada IS NULL OR NOT isfinite(p_data_programada) THEN RETURN jsonb_build_object('success',false,'message','Informe uma data válida, sem inferência automática.'); END IF;
 v_before:=jsonb_build_object('status_os',v_os.status,'data_os',v_os.os_date,'data_programacao',v_pp.data_programada,'status_programacao',v_pp.status,'volume_os',v_os.volume_total_ml,'volume_programacao',v_pp.volume_necessario);
 IF v_os.status='programada' AND v_pp.data_programada IS NOT DISTINCT FROM p_data_programada AND (v_canonical='onfarm' OR v_os.os_date IS NOT DISTINCT FROM p_data_programada) THEN RETURN jsonb_build_object('success',true,'replay',true,'status','programada','message','Programação já corresponde à data informada.'); END IF;
 -- Sem INSERT de programação/lote: usa somente programação previamente criada pelo fluxo.
 IF v_canonical='manual' THEN UPDATE public.ordens_servico SET status='programada',data_programada=p_data_programada WHERE id=p_os_id;
 ELSE UPDATE public.ordens_servico_onfarm SET status='programada' WHERE id=p_os_id; END IF;
 UPDATE public.programacao_producao SET data_programada=p_data_programada WHERE id=v_pp.id AND organization_id=v_org;
 SELECT * INTO v_pp FROM public.programacao_producao WHERE id=v_pp.id;
 IF v_pp.organization_id IS DISTINCT FROM v_org OR v_pp.status::text<>'aguardando' OR v_pp.data_programada IS DISTINCT FROM p_data_programada OR EXISTS(SELECT 1 FROM public.lotes WHERE programacao_id=v_pp.id)
 OR public.technical_actor_ready(v_uid) IS NOT TRUE OR platform_private.h15_actor_organization() IS DISTINCT FROM v_org OR public._saas_user_has_feature(v_uid,'ordens_producao') IS NOT TRUE
 OR NOT EXISTS(SELECT 1 FROM private.h7n_esteira_laboratorio() s WHERE s.os_id=p_os_id AND s.origem_os=v_canonical) THEN RAISE EXCEPTION 'PROGRAMAR_POSTCONDITION_FAILED'; END IF;
 v_after:=jsonb_build_object('status_os','programada','data_os',CASE WHEN v_canonical='manual' THEN p_data_programada ELSE NULL END,'data_programacao',v_pp.data_programada,'status_programacao',v_pp.status,'volume_os',v_os.volume_total_ml,'volume_programacao',v_pp.volume_necessario);
 INSERT INTO public.laboratorio_esteira_eventos(os_id,origem_os,programacao_id,etapa_anterior,etapa_nova,acao,usuario_id,observacao)
 VALUES(p_os_id,v_canonical,v_pp.id,v_os.status,'programada','programar_os',v_uid,jsonb_build_object('organization_id',v_org,'before',v_before,'after',v_after,'actor',v_uid,'at',clock_timestamp(),'manufacturing_started',false)::text);
 -- Refresh interno existente por trigger permanece; nenhum refresh adicional/client-side.
 RETURN jsonb_build_object('success',true,'replay',false,'status','programada','message','Data programada; fabricação não iniciada.');
END $function$;
DO $post$
BEGIN
 IF EXISTS(SELECT 1 FROM programar_baseline b JOIN pg_proc p ON p.oid=b.oid WHERE p.proacl IS DISTINCT FROM b.proacl OR p.proowner IS DISTINCT FROM b.proowner) THEN RAISE EXCEPTION 'ACL_OWNER_CHANGED'; END IF;
 IF has_function_privilege('authenticated','public.rpc_programar_os_v1(uuid,text,date)','EXECUTE') OR has_function_privilege('anon','public.rpc_programar_os_v1(uuid,text,date)','EXECUTE') THEN RAISE EXCEPTION 'PROGRAMAR_REOPENED'; END IF;
END $post$;
 -- Rollback na mesma sessão/transação: restaurar definition em programar_baseline
-- apenas com ACL fechada; em erro ROLLBACK integral. Nunca conceder acesso ao corpo antigo.