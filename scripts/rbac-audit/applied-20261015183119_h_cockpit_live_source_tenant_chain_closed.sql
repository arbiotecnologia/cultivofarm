-- CANDIDATO REVISÁVEL, NÃO APLICADO. Nenhum GRANT, refresh, DML ou alteração de flags.
-- Reutiliza h7n -> vw -> RPC; tipo composto da MV apenas como contrato, NÃO lê snapshot.

CREATE TEMP TABLE cockpit_closed_functions ON COMMIT DROP AS
 SELECT p.oid,p.proacl,p.proowner,md5(pg_get_functiondef(p.oid)) AS definition_hash
 FROM pg_proc p WHERE p.oid IN (
 'private.h7n_esteira_laboratorio()'::regprocedure,
 'public.rpc_cockpit_listar_esteira_v1(text,text[],text[],text[],boolean,date,date,boolean,integer,integer)'::regprocedure,
 'public.fn_avancar_etapa_esteira(text,uuid,uuid,text,uuid)'::regprocedure,
 'public.lab_request_replanning(uuid,text)'::regprocedure,
 'public.refresh_esteira_laboratorio()'::regprocedure,
 'public.rpc_converter_visita_em_os(uuid,text)'::regprocedure);
CREATE TEMP TABLE cockpit_closed_relations ON COMMIT DROP AS
 SELECT oid,relacl,relowner,reloptions FROM pg_class WHERE oid IN (
 'public.vw_esteira_laboratorio'::regclass,'public.mv_esteira_laboratorio'::regclass,
 'public.vw_os_integridade_esteira'::regclass,'public._src_vw_esteira_laboratorio'::regclass,
 'public.laboratorio_esteira_eventos'::regclass,'public.cockpit_operacao_idempotencia'::regclass);
DO $pre$
DECLARE f record; v record;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.fiscal_environment_marker WHERE project_ref='swzpzcwiasxmjutrmvkm') THEN RAISE EXCEPTION 'CANONICAL_REF_REQUIRED'; END IF;
 IF NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261015180956' AND name='h_cockpit_contain_event_idempotency_cross_tenant' AND md5(array_to_string(statements,E'\n;\n'))='a7503391ff26db06a1b7d26f3156a217') THEN RAISE EXCEPTION 'LEDGER_DRIFT_20261015180956'; END IF;
 IF NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261015181119' AND name='h_cockpit_contain_legacy_mutation_bypass' AND md5(array_to_string(statements,E'\n;\n'))='e2e9c9e96b0533db8c0635d891306052') THEN RAISE EXCEPTION 'LEDGER_DRIFT_20261015181119'; END IF;
 IF NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261015181542' AND name='h_cockpit_onfarm_micro_projection_closed' AND md5(array_to_string(statements,E'\n;\n'))='9e260c759499a8a68a1eeadac34207ce') THEN RAISE EXCEPTION 'LEDGER_DRIFT_20261015181542'; END IF;
 IF md5(pg_get_functiondef('private.h7n_esteira_laboratorio()'::regprocedure)) IS DISTINCT FROM 'e690611cd0967e7697cdbecb8c40e984' THEN RAISE EXCEPTION 'FUNCTION_DRIFT private.h7n_esteira_laboratorio()'; END IF;
 IF md5(pg_get_functiondef('public.rpc_cockpit_listar_esteira_v1(text,text[],text[],text[],boolean,date,date,boolean,integer,integer)'::regprocedure)) IS DISTINCT FROM '53c9fdb94780b9666ca9b602ad95a813' THEN RAISE EXCEPTION 'FUNCTION_DRIFT public.rpc_cockpit_listar_esteira_v1(text,text[],text[],text[],boolean,date,date,boolean,integer,integer)'; END IF;
 IF md5(pg_get_functiondef('public.rpc_converter_visita_em_os(uuid,text)'::regprocedure)) IS DISTINCT FROM 'b112888e28d8a5727df713e0ae7bcd1b' THEN RAISE EXCEPTION 'FUNCTION_DRIFT public.rpc_converter_visita_em_os(uuid,text)'; END IF;
 IF md5(pg_get_functiondef('platform_private.h15_actor_organization()'::regprocedure)) IS DISTINCT FROM '64e10608403238a41a9baf92857ca881' THEN RAISE EXCEPTION 'FUNCTION_DRIFT platform_private.h15_actor_organization()'; END IF;
 IF md5(pg_get_functiondef('public.technical_actor_ready(uuid)'::regprocedure)) IS DISTINCT FROM 'b5d0994b6eb976b14122cd2a1ec798cf' THEN RAISE EXCEPTION 'FUNCTION_DRIFT public.technical_actor_ready(uuid)'; END IF;
 IF md5(pg_get_functiondef('public._saas_user_has_feature(uuid,text)'::regprocedure)) IS DISTINCT FROM '501dd958e117d2df8a4d38f6bcbeed04' THEN RAISE EXCEPTION 'FUNCTION_DRIFT public._saas_user_has_feature(uuid,text)'; END IF;
 IF md5(pg_get_viewdef('public.vw_os_integridade_esteira'::regclass,true)) IS DISTINCT FROM 'e8331dbe2bc538cf21fad123fb43f19b' THEN RAISE EXCEPTION 'VIEW_DRIFT vw_os_integridade_esteira'; END IF;
 IF md5(pg_get_viewdef('public._src_vw_esteira_laboratorio'::regclass,true)) IS DISTINCT FROM 'c71226f594d27d92833686212415ccec' THEN RAISE EXCEPTION 'VIEW_DRIFT _src_vw_esteira_laboratorio'; END IF;
 IF md5(pg_get_viewdef('public.mv_esteira_laboratorio'::regclass,true)) IS DISTINCT FROM '50e27806080f38e4adbd94f3bdf2db23' THEN RAISE EXCEPTION 'VIEW_DRIFT mv_esteira_laboratorio'; END IF;
 IF md5(pg_get_viewdef('public.vw_esteira_laboratorio'::regclass,true)) IS DISTINCT FROM 'd72d5df7bacffdf8f4fc4282b804ab90' THEN RAISE EXCEPTION 'VIEW_DRIFT vw_esteira_laboratorio'; END IF;
 FOR f IN SELECT * FROM cockpit_closed_functions WHERE oid<>'public.rpc_converter_visita_em_os(uuid,text)'::regprocedure LOOP
 IF has_function_privilege('authenticated',f.oid,'EXECUTE') OR has_function_privilege('anon',f.oid,'EXECUTE') OR EXISTS(SELECT 1 FROM aclexplode(coalesce(f.proacl,acldefault('f',f.proowner))) WHERE grantee=0 AND privilege_type='EXECUTE') THEN RAISE EXCEPTION 'FUNCTION_ACL_NOT_CLOSED'; END IF;
 END LOOP;
 FOR v IN SELECT * FROM cockpit_closed_relations WHERE oid NOT IN ('public.vw_os_integridade_esteira'::regclass,'public._src_vw_esteira_laboratorio'::regclass) LOOP
 IF has_table_privilege('authenticated',v.oid,'SELECT') OR has_table_privilege('anon',v.oid,'SELECT') OR EXISTS(SELECT 1 FROM aclexplode(coalesce(v.relacl,acldefault('r',v.relowner))) WHERE grantee=0) THEN RAISE EXCEPTION 'RELATION_ACL_NOT_CLOSED'; END IF;
 END LOOP;
END $pre$;
CREATE OR REPLACE FUNCTION private.h7n_esteira_laboratorio()
 RETURNS SETOF public.mv_esteira_laboratorio
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
 WITH actor AS MATERIALIZED (
 SELECT auth.uid() uid, platform_private.h15_actor_organization() org
 WHERE public.technical_actor_ready(auth.uid()) IS TRUE
 AND public._saas_user_has_feature(auth.uid(),'ordens_producao') IS TRUE
 -- Intersection of the existing backend and route matrix; no new role, no SA bypass.
 AND (public.has_role(auth.uid(),'administrador'::public.app_role)
 OR public.has_role(auth.uid(),'gestor'::public.app_role)
 OR public.has_role(auth.uid(),'administrativo'::public.app_role)
 OR public.has_role(auth.uid(),'producao'::public.app_role))
 ), os AS (
 SELECT o.id, 'manual'::text origin,o.cliente_id,o.fazenda_id,o.talhao_id,o.produto_id,o.microrganismo_id,
 o.partner_order_id,o.partner_order_item_id,NULL::uuid visit_id,o.organization_id org
 FROM public.ordens_servico o
 UNION ALL
 SELECT o.id,'onfarm',o.cliente_id,o.fazenda_id,o.talhao_id,o.produto_id,o.microrganismo_id,
 NULL::uuid,NULL::uuid,o.registro_consultor_id,NULL::uuid FROM public.ordens_servico_onfarm o
 ), safe_os AS (
 SELECT o.*, a.org tenant FROM os o JOIN actor a ON a.org IS NOT NULL
 JOIN public.clientes c ON c.id=o.cliente_id AND c.organization_id=a.org
 WHERE ((o.produto_id IS NOT NULL)::int+(o.microrganismo_id IS NOT NULL)::int)=1
 AND (SELECT count(*) FROM os x WHERE x.id=o.id)=1
 AND (o.origin='onfarm' OR o.org=a.org)
 AND (o.fazenda_id IS NULL OR EXISTS(SELECT 1 FROM public.fazendas f WHERE f.id=o.fazenda_id AND f.organization_id=a.org AND f.cliente_id=o.cliente_id AND f.ativo IS TRUE))
 AND (o.talhao_id IS NULL OR EXISTS(SELECT 1 FROM public.talhoes t WHERE t.id=o.talhao_id AND t.organization_id=a.org AND t.fazenda_id=o.fazenda_id AND t.ativo IS TRUE))
 AND (o.produto_id IS NULL OR EXISTS(SELECT 1 FROM public.produtos p WHERE p.id=o.produto_id AND to_jsonb(p)->>'owner_organization_id' IS NULL))
 AND (o.microrganismo_id IS NULL OR EXISTS(SELECT 1 FROM public.microrganismos m WHERE m.id=o.microrganismo_id AND to_jsonb(m)->>'owner_organization_id' IS NULL))
 AND (o.visit_id IS NULL OR EXISTS(SELECT 1 FROM public.registros_consultor v WHERE v.id=o.visit_id AND v.cliente_id=o.cliente_id AND v.fazenda_id IS NOT DISTINCT FROM o.fazenda_id AND v.talhao_id IS NOT DISTINCT FROM o.talhao_id))
 AND ((o.partner_order_id IS NULL AND o.partner_order_item_id IS NULL) OR EXISTS(
 SELECT 1 FROM public.partner_orders po JOIN public.partner_accounts pa ON pa.id=po.partner_id
 JOIN public.clientes pc ON pc.id=pa.client_id AND pc.organization_id=a.org
 JOIN public.partner_order_items pi ON pi.order_id=po.id AND pi.id=o.partner_order_item_id
 WHERE po.id=o.partner_order_id AND po.cliente_id=o.cliente_id
 AND pa.commercial_owner_organization_id=a.org AND pa.ativo IS TRUE AND pa.deleted_at IS NULL
 AND pi.product_id IS NOT DISTINCT FROM o.produto_id AND pi.microrganismo_id IS NOT DISTINCT FROM o.microrganismo_id))
 ), validated AS (
 SELECT o.* FROM safe_os o
 WHERE NOT EXISTS (
 SELECT 1 FROM public.programacao_producao pp
 WHERE (pp.ordem_servico_id=o.id OR pp.ordem_servico_onfarm_id=o.id)
 AND NOT ((pp.organization_id=o.tenant
 AND ((o.origin='manual' AND pp.ordem_servico_id=o.id AND pp.ordem_servico_onfarm_id IS NULL)
 OR (o.origin='onfarm' AND pp.ordem_servico_onfarm_id=o.id AND pp.ordem_servico_id IS NULL))
 AND pp.produto_id IS NOT DISTINCT FROM o.produto_id AND pp.microrganismo_id IS NOT DISTINCT FROM o.microrganismo_id
 AND ((pp.responsavel_id IS NULL AND nullif(btrim(pp.responsavel),'') IS NULL)
 OR EXISTS(SELECT 1 FROM public.profiles pr WHERE pr.user_id=pp.responsavel_id AND pr.organization_id=o.tenant AND pr.ativo IS TRUE))
 ) IS TRUE))
 AND NOT EXISTS(SELECT 1 FROM public.programacao_producao pp JOIN public.lotes l ON l.programacao_id=pp.id WHERE (pp.ordem_servico_id=o.id OR pp.ordem_servico_onfarm_id=o.id) AND NOT ((l.organization_id=o.tenant AND l.produto_id IS NOT DISTINCT FROM o.produto_id AND l.microrganismo_id IS NOT DISTINCT FROM o.microrganismo_id) IS TRUE))
 AND NOT EXISTS(SELECT 1 FROM public.programacao_producao pp JOIN public.lotes l ON l.programacao_id=pp.id JOIN public.controle_qualidade cq ON cq.lote_id=l.id WHERE (pp.ordem_servico_id=o.id OR pp.ordem_servico_onfarm_id=o.id) AND NOT ((cq.organization_id=o.tenant AND (cq.responsavel_id IS NULL OR EXISTS(SELECT 1 FROM public.profiles pr WHERE pr.user_id=cq.responsavel_id AND pr.organization_id=o.tenant AND pr.ativo IS TRUE))) IS TRUE))
 AND NOT EXISTS(SELECT 1 FROM public.programacao_producao pp JOIN public.lotes l ON l.programacao_id=pp.id JOIN public.envase ev ON ev.lote_id=l.id WHERE (pp.ordem_servico_id=o.id OR pp.ordem_servico_onfarm_id=o.id) AND NOT ((ev.organization_id=o.tenant) IS TRUE))
 AND NOT EXISTS(SELECT 1 FROM public.programacao_producao pp JOIN public.lotes l ON l.programacao_id=pp.id JOIN public.estoque_produto ep ON ep.lote_id=l.id WHERE (pp.ordem_servico_id=o.id OR pp.ordem_servico_onfarm_id=o.id) AND NOT ((ep.produto_id IS NOT DISTINCT FROM o.produto_id AND ep.microrganismo_id IS NOT DISTINCT FROM o.microrganismo_id AND (ep.envase_id IS NULL OR EXISTS(SELECT 1 FROM public.envase ev WHERE ev.id=ep.envase_id AND ev.lote_id=l.id AND ev.organization_id=o.tenant)) AND (ep.reservado_para_os_id IS NULL OR (ep.reservado_para_os_id=o.id AND ep.reservado_para_os_tipo=o.origin AND ep.reservado_para_cliente_id=o.cliente_id)) AND (ep.reservado_para_cliente_id IS NULL OR ep.reservado_para_cliente_id=o.cliente_id) AND (ep.reservado_para_partner_order_id IS NULL OR ep.reservado_para_partner_order_id=o.partner_order_id) AND (ep.reservado_para_partner_id IS NULL OR EXISTS(SELECT 1 FROM public.partner_orders po WHERE po.id=o.partner_order_id AND po.partner_id=ep.reservado_para_partner_id))) IS TRUE))
 AND NOT EXISTS(SELECT 1 FROM public.entregas e WHERE (e.ordem_servico_id=o.id OR e.ordem_servico_onfarm_id=o.id) AND NOT ((e.organization_id=o.tenant AND e.cliente_id=o.cliente_id AND ((o.origin='manual' AND e.ordem_servico_id=o.id AND e.ordem_servico_onfarm_id IS NULL) OR (o.origin='onfarm' AND e.ordem_servico_onfarm_id=o.id AND e.ordem_servico_id IS NULL)) AND (e.produto_id IS NULL OR e.produto_id=o.produto_id) AND (e.partner_order_id IS NULL OR e.partner_order_id=o.partner_order_id) AND (e.lote_id IS NULL OR EXISTS(SELECT 1 FROM public.lotes l JOIN public.programacao_producao pp ON pp.id=l.programacao_id WHERE l.id=e.lote_id AND l.organization_id=o.tenant AND (pp.ordem_servico_id=o.id OR pp.ordem_servico_onfarm_id=o.id))) AND (e.estoque_produto_id IS NULL OR EXISTS(SELECT 1 FROM public.estoque_produto ep JOIN public.lotes l ON l.id=ep.lote_id JOIN public.programacao_producao pp ON pp.id=l.programacao_id WHERE ep.id=e.estoque_produto_id AND l.id=e.lote_id AND l.organization_id=o.tenant AND (pp.ordem_servico_id=o.id OR pp.ordem_servico_onfarm_id=o.id)))) IS TRUE))
 AND NOT EXISTS(SELECT 1 FROM public.aplicacoes ap WHERE (ap.ordem_servico_id=o.id OR ap.ordem_servico_onfarm_id=o.id) AND NOT ((ap.organization_id=o.tenant AND ((o.origin='manual' AND ap.ordem_servico_id=o.id AND ap.ordem_servico_onfarm_id IS NULL) OR (o.origin='onfarm' AND ap.ordem_servico_onfarm_id=o.id AND ap.ordem_servico_id IS NULL)) AND (ap.produto_usado_id IS NULL OR ap.produto_usado_id=o.produto_id) AND (ap.lote_usado_id IS NULL OR EXISTS(SELECT 1 FROM public.lotes l JOIN public.programacao_producao pp ON pp.id=l.programacao_id WHERE l.id=ap.lote_usado_id AND l.organization_id=o.tenant AND (pp.ordem_servico_id=o.id OR pp.ordem_servico_onfarm_id=o.id))) AND (ap.responsavel_id IS NULL OR EXISTS(SELECT 1 FROM public.profiles pr WHERE pr.user_id=ap.responsavel_id AND pr.organization_id=o.tenant AND pr.ativo IS TRUE)) AND (ap.parent_id IS NULL OR EXISTS(SELECT 1 FROM public.aplicacoes parent WHERE parent.id=ap.parent_id AND parent.organization_id=o.tenant AND parent.ordem_servico_id IS NOT DISTINCT FROM ap.ordem_servico_id AND parent.ordem_servico_onfarm_id IS NOT DISTINCT FROM ap.ordem_servico_onfarm_id))) IS TRUE))
 )
 SELECT (jsonb_populate_record(NULL::public.mv_esteira_laboratorio,to_jsonb(s))).*
 FROM public._src_vw_esteira_laboratorio s JOIN validated o ON o.id=s.os_id AND o.origin=s.origem_os
 AND s.cliente_id=o.cliente_id AND s.fazenda_id IS NOT DISTINCT FROM o.fazenda_id
 AND s.talhao_id IS NOT DISTINCT FROM o.talhao_id AND s.produto_id IS NOT DISTINCT FROM o.produto_id
 AND s.microrganismo_id IS NOT DISTINCT FROM o.microrganismo_id;
$function$;
CREATE OR REPLACE FUNCTION public.rpc_cockpit_listar_esteira_v1(p_busca text DEFAULT NULL, p_stages text[] DEFAULT NULL, p_origens text[] DEFAULT NULL, p_prioridades text[] DEFAULT NULL, p_atrasado boolean DEFAULT NULL, p_de date DEFAULT NULL, p_ate date DEFAULT NULL, p_incluir_finalizadas boolean DEFAULT false, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO ''
AS $function$
 WITH base AS (
 SELECT v.os_id,v.origem_os,v.numero_os,v.cliente_id,v.cliente_nome,v.fazenda_id,v.fazenda_nome,v.talhao_id,v.talhao_nome,
 v.produto_id,v.produto_nome,v.microrganismo_id,v.microrganismo_nome,v.partner_id,v.partner_numero,v.partner_nome,v.titular_nome,v.titular_tipo,
 v.prioridade,v.volume_solicitado_l,v.status_os,v.status_esteira_oficial,public.fn_cockpit_stage(v.status_esteira_oficial) stage,
 v.programacao_id,v.data_programada,v.lote_id,v.codigo_lote,v.status_lote,v.cq_resultado,v.envase_id,v.estoque_id,v.estoque_reservado_id,
 v.entrega_id,v.entrega_status,v.atrasado,v.bloqueios,v.pode_finalizar,v.proxima_acao,v.created_at,
 pp.responsavel_id,pr.nome responsavel_nome
 FROM public.vw_esteira_laboratorio v
 LEFT JOIN public.programacao_producao pp ON pp.id=v.programacao_id AND pp.organization_id=platform_private.h15_actor_organization()
 LEFT JOIN public.profiles pr ON pr.user_id=pp.responsavel_id AND pr.organization_id=pp.organization_id AND pr.ativo IS TRUE
 WHERE (p_incluir_finalizadas IS TRUE OR v.status_os<>'finalizada')
 AND (p_origens IS NULL OR v.origem_os=ANY(p_origens))
 AND (p_prioridades IS NULL OR v.prioridade::text=ANY(p_prioridades))
 AND (p_atrasado IS NULL OR v.atrasado=p_atrasado)
 AND (p_de IS NULL OR v.created_at::date>=p_de) AND (p_ate IS NULL OR v.created_at::date<=p_ate)
 AND (p_stages IS NULL OR public.fn_cockpit_stage(v.status_esteira_oficial)=ANY(p_stages))
 AND (nullif(btrim(coalesce(p_busca,'')),'') IS NULL OR concat_ws(' ',v.numero_os,v.codigo_lote,v.cliente_nome,v.partner_nome,v.titular_nome,v.fazenda_nome,v.talhao_nome,v.produto_nome,v.microrganismo_nome,pr.nome) ILIKE '%'||btrim(p_busca)||'%')
 ) SELECT jsonb_build_object('total_count',(SELECT count(*) FROM base),'limit',greatest(1,least(coalesce(p_limit,50),200)),
 'offset',greatest(0,coalesce(p_offset,0)), 'items',coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.atrasado DESC NULLS LAST,t.created_at DESC,t.origem_os,t.os_id)
 FROM (SELECT * FROM base ORDER BY atrasado DESC NULLS LAST,created_at DESC,origem_os,os_id
 LIMIT greatest(1,least(coalesce(p_limit,50),200)) OFFSET greatest(0,coalesce(p_offset,0))) t),'[]'::jsonb));
$function$;
DO $post$
BEGIN
 IF EXISTS(SELECT 1 FROM cockpit_closed_functions b JOIN pg_proc p ON p.oid=b.oid WHERE p.proacl IS DISTINCT FROM b.proacl OR p.proowner IS DISTINCT FROM b.proowner) THEN RAISE EXCEPTION 'FUNCTION_ACL_OWNER_CHANGED'; END IF;
 IF EXISTS(SELECT 1 FROM cockpit_closed_relations b JOIN pg_class c ON c.oid=b.oid WHERE c.relacl IS DISTINCT FROM b.relacl OR c.relowner IS DISTINCT FROM b.relowner OR c.reloptions IS DISTINCT FROM b.reloptions) THEN RAISE EXCEPTION 'RELATION_SECURITY_CHANGED'; END IF;
 IF EXISTS(SELECT 1 FROM cockpit_closed_functions b JOIN pg_proc p ON p.oid=b.oid WHERE p.proname NOT IN ('h7n_esteira_laboratorio','rpc_cockpit_listar_esteira_v1') AND md5(pg_get_functiondef(p.oid)) IS DISTINCT FROM b.definition_hash) THEN RAISE EXCEPTION 'OPERATIONAL_BODY_CHANGED'; END IF;
END $post$;

-- Rollback seguro: manter ACL fechada. Nunca restaurar snapshot reader vulnerável ou grants.
