-- Somente leitura. Executar exclusivamente em swzpzcwiasxmjutrmvkm.
-- NÃO é migration. Não chama conversor nem altera a visita aprovada.
BEGIN READ ONLY;
DO $preflight$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.fiscal_environment_marker WHERE project_ref='swzpzcwiasxmjutrmvkm') THEN RAISE EXCEPTION 'CANONICAL_REF_REQUIRED'; END IF;
 IF NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261015161648' AND name='h_catalog_lab_biological_only_and_visit_explicit')
 OR NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261015162631' AND name='h_catalog_visit_selection_current_schema') THEN RAISE EXCEPTION 'APPLIED_BASE_REQUIRED'; END IF;
 IF md5(pg_get_functiondef('public.rpc_converter_visita_em_os(uuid,text)'::regprocedure)) <> '66e8072f7aefbe18c1417240121147a5' THEN RAISE EXCEPTION 'CONVERTER_DRIFT'; END IF;
 IF NOT has_function_privilege('authenticated','public.rpc_converter_visita_em_os(uuid,text)','EXECUTE') OR has_function_privilege('anon','public.rpc_converter_visita_em_os(uuid,text)','EXECUTE') THEN RAISE EXCEPTION 'CONVERTER_ACL_DRIFT'; END IF;
 IF to_regprocedure('public.rpc_get_visita_workspace(uuid)') IS NULL OR to_regprocedure('public.can_view_technical_visit(uuid,uuid)') IS NULL OR to_regprocedure('platform_private.lab_item_is_manufacturable(uuid,uuid)') IS NULL THEN RAISE EXCEPTION 'DEPENDENCY_REQUIRED'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_index WHERE indexrelid=to_regclass('public.idx_unique_os_onfarm_registro_consultor') AND indisunique AND indisvalid AND pg_get_indexdef(indexrelid)='CREATE UNIQUE INDEX idx_unique_os_onfarm_registro_consultor ON public.ordens_servico_onfarm USING btree (registro_consultor_id) WHERE (registro_consultor_id IS NOT NULL)') THEN RAISE EXCEPTION 'CARDINALITY_DRIFT'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.registros_consultor_recomendacoes'::regclass AND tgname='trg_lab_visit_recommendation_lock' AND tgenabled IN ('O','A')) THEN RAISE EXCEPTION 'SELECTION_FENCE_REQUIRED'; END IF;
 IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ordens_servico_onfarm' AND column_name='origem') THEN RAISE EXCEPTION 'UNEXPECTED_ORIGEM_COLUMN'; END IF;
 IF NOT has_table_privilege('authenticated','public.ordens_servico_onfarm','SELECT') THEN RAISE EXCEPTION 'OS_ONFARM_SELECT_REQUIRED'; END IF;
END $preflight$;
-- Contrato mínimo usado por FluxoTecnico. LIMIT 0 valida nomes/FKs sem ler dados.
SELECT o.id,o.numero_os,o.status,o.created_at,o.registro_consultor_id,c.nome AS cliente_nome,f.nome AS fazenda_nome
FROM public.ordens_servico_onfarm o
LEFT JOIN public.clientes c ON c.id=o.cliente_id
LEFT JOIN public.fazendas f ON f.id=o.fazenda_id
LIMIT 0;
-- Estes resultados devem permanecer false para authenticated/anon; não conceder ACL.
SELECT p.oid::regprocedure::text AS operation,
 has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute,
 has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN ('rpc_programar_os_v1','rpc_cockpit_gerar_lote_v1','publish_planning_to_lab');
ROLLBACK;
