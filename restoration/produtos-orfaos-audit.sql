-- =====================================================================
-- Fase 1 — AUDITORIA (SOMENTE LEITURA) de referências órfãs a produtos
-- Executar em: Supabase SQL Editor (projeto produção navfzbwgwzruipouyfnk)
-- Não altera dados. Gera contagens por tabela para orientar Fase 2.
-- =====================================================================

-- 0) Snapshot: catálogo canônico atual (deve retornar 7 linhas)
SELECT id, codigo, nome, ativo
FROM public.produtos
ORDER BY codigo;

-- 1) Contagem consolidada de órfãos por tabela dependente
WITH prod_ids AS (SELECT id FROM public.produtos)
SELECT tabela, coluna, total_referencias, orfaos, distinct_ids_orfaos
FROM (
  SELECT 'catalogo_volumes'::text tabela, 'produto_id'::text coluna,
         COUNT(*) total_referencias,
         COUNT(*) FILTER (WHERE produto_id NOT IN (SELECT id FROM prod_ids)) orfaos,
         COUNT(DISTINCT produto_id) FILTER (WHERE produto_id NOT IN (SELECT id FROM prod_ids)) distinct_ids_orfaos
  FROM public.catalogo_volumes WHERE produto_id IS NOT NULL
  UNION ALL SELECT 'commercial_campaign_products','product_id',
         COUNT(*), COUNT(*) FILTER (WHERE product_id NOT IN (SELECT id FROM prod_ids)),
         COUNT(DISTINCT product_id) FILTER (WHERE product_id NOT IN (SELECT id FROM prod_ids))
  FROM public.commercial_campaign_products WHERE product_id IS NOT NULL
  UNION ALL SELECT 'cq_parametros_referencia','produto_id',
         COUNT(*), COUNT(*) FILTER (WHERE produto_id NOT IN (SELECT id FROM prod_ids)),
         COUNT(DISTINCT produto_id) FILTER (WHERE produto_id NOT IN (SELECT id FROM prod_ids))
  FROM public.cq_parametros_referencia WHERE produto_id IS NOT NULL
  UNION ALL SELECT 'entregas','produto_id',
         COUNT(*), COUNT(*) FILTER (WHERE produto_id NOT IN (SELECT id FROM prod_ids)),
         COUNT(DISTINCT produto_id) FILTER (WHERE produto_id NOT IN (SELECT id FROM prod_ids))
  FROM public.entregas WHERE produto_id IS NOT NULL
  UNION ALL SELECT 'estoque_embalagens','produto_id',
         COUNT(*), COUNT(*) FILTER (WHERE produto_id NOT IN (SELECT id FROM prod_ids)),
         COUNT(DISTINCT produto_id) FILTER (WHERE produto_id NOT IN (SELECT id FROM prod_ids))
  FROM public.estoque_embalagens WHERE produto_id IS NOT NULL
  UNION ALL SELECT 'estoque_produto','produto_id',
         COUNT(*), COUNT(*) FILTER (WHERE produto_id NOT IN (SELECT id FROM prod_ids)),
         COUNT(DISTINCT produto_id) FILTER (WHERE produto_id NOT IN (SELECT id FROM prod_ids))
  FROM public.estoque_produto WHERE produto_id IS NOT NULL
  UNION ALL SELECT 'formulacoes','produto_id',
         COUNT(*), COUNT(*) FILTER (WHERE produto_id NOT IN (SELECT id FROM prod_ids)),
         COUNT(DISTINCT produto_id) FILTER (WHERE produto_id NOT IN (SELECT id FROM prod_ids))
  FROM public.formulacoes WHERE produto_id IS NOT NULL
  UNION ALL SELECT 'formulacoes','component_insumo_id',
         COUNT(*), COUNT(*) FILTER (WHERE component_insumo_id NOT IN (SELECT id FROM prod_ids)),
         COUNT(DISTINCT component_insumo_id) FILTER (WHERE component_insumo_id NOT IN (SELECT id FROM prod_ids))
  FROM public.formulacoes WHERE component_insumo_id IS NOT NULL
  UNION ALL SELECT 'lotes','produto_id',
         COUNT(*), COUNT(*) FILTER (WHERE produto_id NOT IN (SELECT id FROM prod_ids)),
         COUNT(DISTINCT produto_id) FILTER (WHERE produto_id NOT IN (SELECT id FROM prod_ids))
  FROM public.lotes WHERE produto_id IS NOT NULL
  UNION ALL SELECT 'ordens_servico','produto_id',
         COUNT(*), COUNT(*) FILTER (WHERE produto_id NOT IN (SELECT id FROM prod_ids)),
         COUNT(DISTINCT produto_id) FILTER (WHERE produto_id NOT IN (SELECT id FROM prod_ids))
  FROM public.ordens_servico WHERE produto_id IS NOT NULL
  UNION ALL SELECT 'ordens_servico_onfarm','produto_id',
         COUNT(*), COUNT(*) FILTER (WHERE produto_id NOT IN (SELECT id FROM prod_ids)),
         COUNT(DISTINCT produto_id) FILTER (WHERE produto_id NOT IN (SELECT id FROM prod_ids))
  FROM public.ordens_servico_onfarm WHERE produto_id IS NOT NULL
  UNION ALL SELECT 'os_faturamento_base','produto_id',
         COUNT(*), COUNT(*) FILTER (WHERE produto_id NOT IN (SELECT id FROM prod_ids)),
         COUNT(DISTINCT produto_id) FILTER (WHERE produto_id NOT IN (SELECT id FROM prod_ids))
  FROM public.os_faturamento_base WHERE produto_id IS NOT NULL
  UNION ALL SELECT 'partner_order_items','product_id',
         COUNT(*), COUNT(*) FILTER (WHERE product_id NOT IN (SELECT id FROM prod_ids)),
         COUNT(DISTINCT product_id) FILTER (WHERE product_id NOT IN (SELECT id FROM prod_ids))
  FROM public.partner_order_items WHERE product_id IS NOT NULL
  UNION ALL SELECT 'partner_product_prices','product_id',
         COUNT(*), COUNT(*) FILTER (WHERE product_id NOT IN (SELECT id FROM prod_ids)),
         COUNT(DISTINCT product_id) FILTER (WHERE product_id NOT IN (SELECT id FROM prod_ids))
  FROM public.partner_product_prices WHERE product_id IS NOT NULL
  UNION ALL SELECT 'partner_simulation_items','product_id',
         COUNT(*), COUNT(*) FILTER (WHERE product_id NOT IN (SELECT id FROM prod_ids)),
         COUNT(DISTINCT product_id) FILTER (WHERE product_id NOT IN (SELECT id FROM prod_ids))
  FROM public.partner_simulation_items WHERE product_id IS NOT NULL
  UNION ALL SELECT 'product_crop_recommendations','produto_id',
         COUNT(*), COUNT(*) FILTER (WHERE produto_id NOT IN (SELECT id FROM prod_ids)),
         COUNT(DISTINCT produto_id) FILTER (WHERE produto_id NOT IN (SELECT id FROM prod_ids))
  FROM public.product_crop_recommendations WHERE produto_id IS NOT NULL
  UNION ALL SELECT 'product_fiscal_profiles','product_id',
         COUNT(*), COUNT(*) FILTER (WHERE product_id NOT IN (SELECT id FROM prod_ids)),
         COUNT(DISTINCT product_id) FILTER (WHERE product_id NOT IN (SELECT id FROM prod_ids))
  FROM public.product_fiscal_profiles WHERE product_id IS NOT NULL
  UNION ALL SELECT 'product_target_recommendations','produto_id',
         COUNT(*), COUNT(*) FILTER (WHERE produto_id NOT IN (SELECT id FROM prod_ids)),
         COUNT(DISTINCT produto_id) FILTER (WHERE produto_id NOT IN (SELECT id FROM prod_ids))
  FROM public.product_target_recommendations WHERE produto_id IS NOT NULL
  UNION ALL SELECT 'product_technical_profiles','produto_id',
         COUNT(*), COUNT(*) FILTER (WHERE produto_id NOT IN (SELECT id FROM prod_ids)),
         COUNT(DISTINCT produto_id) FILTER (WHERE produto_id NOT IN (SELECT id FROM prod_ids))
  FROM public.product_technical_profiles WHERE produto_id IS NOT NULL
  UNION ALL SELECT 'produto_etiquetas','produto_id',
         COUNT(*), COUNT(*) FILTER (WHERE produto_id NOT IN (SELECT id FROM prod_ids)),
         COUNT(DISTINCT produto_id) FILTER (WHERE produto_id NOT IN (SELECT id FROM prod_ids))
  FROM public.produto_etiquetas WHERE produto_id IS NOT NULL
  UNION ALL SELECT 'programacao_producao','produto_id',
         COUNT(*), COUNT(*) FILTER (WHERE produto_id NOT IN (SELECT id FROM prod_ids)),
         COUNT(DISTINCT produto_id) FILTER (WHERE produto_id NOT IN (SELECT id FROM prod_ids))
  FROM public.programacao_producao WHERE produto_id IS NOT NULL
  UNION ALL SELECT 'registros_consultor_recomendacoes','produto_biologico_sugerido_id',
         COUNT(*), COUNT(*) FILTER (WHERE produto_biologico_sugerido_id NOT IN (SELECT id FROM prod_ids)),
         COUNT(DISTINCT produto_biologico_sugerido_id) FILTER (WHERE produto_biologico_sugerido_id NOT IN (SELECT id FROM prod_ids))
  FROM public.registros_consultor_recomendacoes WHERE produto_biologico_sugerido_id IS NOT NULL
) s
ORDER BY orfaos DESC, tabela;

-- 2) (Opcional) listar até 20 IDs órfãos encontrados, para conferência
WITH prod_ids AS (SELECT id FROM public.produtos),
todos_ids_referenciados AS (
  SELECT produto_id AS id FROM public.catalogo_volumes WHERE produto_id IS NOT NULL
  UNION SELECT product_id FROM public.commercial_campaign_products WHERE product_id IS NOT NULL
  UNION SELECT produto_id FROM public.cq_parametros_referencia WHERE produto_id IS NOT NULL
  UNION SELECT produto_id FROM public.entregas WHERE produto_id IS NOT NULL
  UNION SELECT produto_id FROM public.estoque_embalagens WHERE produto_id IS NOT NULL
  UNION SELECT produto_id FROM public.estoque_produto WHERE produto_id IS NOT NULL
  UNION SELECT produto_id FROM public.formulacoes WHERE produto_id IS NOT NULL
  UNION SELECT component_insumo_id FROM public.formulacoes WHERE component_insumo_id IS NOT NULL
  UNION SELECT produto_id FROM public.lotes WHERE produto_id IS NOT NULL
  UNION SELECT produto_id FROM public.ordens_servico WHERE produto_id IS NOT NULL
  UNION SELECT produto_id FROM public.ordens_servico_onfarm WHERE produto_id IS NOT NULL
  UNION SELECT produto_id FROM public.os_faturamento_base WHERE produto_id IS NOT NULL
  UNION SELECT product_id FROM public.partner_order_items WHERE product_id IS NOT NULL
  UNION SELECT product_id FROM public.partner_product_prices WHERE product_id IS NOT NULL
  UNION SELECT product_id FROM public.partner_simulation_items WHERE product_id IS NOT NULL
  UNION SELECT produto_id FROM public.product_crop_recommendations WHERE produto_id IS NOT NULL
  UNION SELECT product_id FROM public.product_fiscal_profiles WHERE product_id IS NOT NULL
  UNION SELECT produto_id FROM public.product_target_recommendations WHERE produto_id IS NOT NULL
  UNION SELECT produto_id FROM public.product_technical_profiles WHERE produto_id IS NOT NULL
  UNION SELECT produto_id FROM public.produto_etiquetas WHERE produto_id IS NOT NULL
  UNION SELECT produto_id FROM public.programacao_producao WHERE produto_id IS NOT NULL
  UNION SELECT produto_biologico_sugerido_id FROM public.registros_consultor_recomendacoes WHERE produto_biologico_sugerido_id IS NOT NULL
)
SELECT id AS produto_id_orfao
FROM todos_ids_referenciados
WHERE id NOT IN (SELECT id FROM public.produtos)
LIMIT 20;
