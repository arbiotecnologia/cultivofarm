-- verify.sql — Etiquetas pós-envase (staging ikaauvsflpmamgxmkhoq)
-- Somente leitura. Retorna uma linha por gate; ok=false indica falha.

SELECT 'marker_staging' AS gate,
       EXISTS (SELECT 1 FROM public._fiscal_staging_marker
               WHERE marker='STAGING' AND project_ref='ikaauvsflpmamgxmkhoq') AS ok
UNION ALL
SELECT 'colunas_snapshot',
       (SELECT count(*) FROM information_schema.columns
         WHERE table_schema='public' AND table_name='produto_etiquetas'
           AND column_name IN ('snapshot','template_versao','cq_liberado',
                               'lote_status_na_emissao','motivo_ultima_reimpressao',
                               'substitui_etiqueta_id','substituida_por_id')) = 7
UNION ALL
SELECT 'trigger_imutabilidade',
       EXISTS (SELECT 1 FROM pg_trigger
               WHERE tgname='trg_produto_etiquetas_snapshot_immutable'
                 AND tgrelid='public.produto_etiquetas'::regclass)
UNION ALL
SELECT 'gate_cq_na_geracao',
       pg_get_functiondef('public.rpc_gerar_etiqueta_produto(jsonb)'::regprocedure)
         ILIKE '%Somente lotes aprovados no CQ%'
UNION ALL
SELECT 'reimpressao_exige_motivo',
       pg_get_functiondef('public.rpc_marcar_etiqueta_impressa(uuid,text)'::regprocedure)
         ILIKE '%Motivo obrigatório para reimpressão%'
UNION ALL
SELECT 'rpc_substituicao_existe',
       to_regprocedure('public.rpc_substituir_etiqueta_produto(uuid,text)') IS NOT NULL
UNION ALL
SELECT 'sem_execute_anon',
       NOT has_function_privilege('anon','public.rpc_marcar_etiqueta_impressa(uuid,text)','EXECUTE')
   AND NOT has_function_privilege('anon','public.rpc_substituir_etiqueta_produto(uuid,text)','EXECUTE')
UNION ALL
SELECT 'indices_etiquetas',
       (SELECT count(*) FROM pg_indexes WHERE schemaname='public'
         AND indexname IN ('idx_produto_etiquetas_lote','idx_produto_etiquetas_envase',
                           'idx_produto_etiquetas_status')) = 3;
