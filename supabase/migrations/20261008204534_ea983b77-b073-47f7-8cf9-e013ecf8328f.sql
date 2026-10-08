DO $containment$
DECLARE r record; v_count integer; v_names text[] := ARRAY['rpc_executivo_alertas_prioridades','rpc_executivo_alertas_resumo','rpc_executivo_arquivar_relatorio','rpc_executivo_cliente_detalhe','rpc_executivo_clientes_ranking','rpc_executivo_clientes_resumo','rpc_executivo_exportar_relatorio_evento','rpc_executivo_fazenda_detalhe','rpc_executivo_financeiro_gargalos','rpc_executivo_financeiro_ranking_clientes','rpc_executivo_financeiro_resumo','rpc_executivo_gerar_relatorio','rpc_executivo_listar_relatorios','rpc_executivo_obter_relatorio','rpc_executivo_plano_acao','rpc_executivo_responsaveis_pendencias'];
BEGIN
 SELECT count(*) INTO v_count FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=ANY(v_names);
 IF v_count<>16 THEN RAISE EXCEPTION 'EXECUTIVO_FAMILY_UNEXPECTED_INVENTORY'; END IF;
 FOR r IN SELECT p.oid,p.proname,pg_catalog.pg_get_function_arguments(p.oid) args,pg_catalog.pg_get_function_result(p.oid) result,pg_catalog.pg_get_function_identity_arguments(p.oid) identity_args FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=ANY(v_names) ORDER BY p.proname LOOP
  -- All entry points stop before argument parsing, source reads, nested RPCs or audit writes.
  -- This denies every actor/tenant/plan/session, including privileged nested calls.
  EXECUTE pg_catalog.format('CREATE OR REPLACE FUNCTION public.%I(%s) RETURNS %s LANGUAGE plpgsql SECURITY DEFINER SET search_path = '''' AS $blocked$ BEGIN RAISE EXCEPTION USING ERRCODE = ''42501'', MESSAGE = ''EXECUTIVO_SOURCE_UNAVAILABLE'', DETAIL = ''Fontes executivas sem contrato organizacional comprovado; operação indisponível.''; END; $blocked$',r.proname,r.args,r.result);
  EXECUTE pg_catalog.format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon, authenticated',r.proname,r.identity_args);
  EXECUTE pg_catalog.format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO service_role',r.proname,r.identity_args);
 END LOOP;
END $containment$;
-- No legacy body is retained behind a wrapper; no ownership inference, backfill or data changes.
-- Safe rollback: keep denial bodies and ACL, or audited forward-fix with proven ownership.