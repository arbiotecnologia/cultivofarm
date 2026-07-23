# Limpeza de referências órfãs a produtos (fora do catálogo v1.3)

Contexto: após o wipe do catálogo antigo e o seed v1.3 (7 produtos: `SOLO-1`, `SOLO-2`, `BINS-01`, `BINS-02`, `BFUN-01`, `BINO-01`, `BSOL-01`), pode haver referências históricas apontando para IDs de produtos que não existem mais.

## Por que não executei diretamente

Este ambiente não tem sessão administrativa direta ao banco (`LOVABLE_BROWSER_AUTH_STATUS=no_supabase`) e as tabelas alvo são protegidas por RLS de admin. Além disso, todas as FKs para `produtos` são enforçadas pelo Postgres — o wipe anterior deve ter cascateado ou anulado a maior parte, então a auditoria precisa rodar no seu banco para confirmar o volume real antes de qualquer limpeza.

## Fase 1 — Auditoria (somente leitura)

1. Abra o SQL Editor em https://supabase.com/dashboard/project/navfzbwgwzruipouyfnk/sql
2. Cole e execute `restoration/produtos-orfaos-audit.sql`
3. Copie o resultado das duas queries (contagem consolidada + amostra de até 20 IDs órfãos) e me envie.

## Fase 2 — Limpeza (aguarda os números da Fase 1)

A migration só será criada depois que a auditoria mostrar o que existe. As regras que aplicarei:

| Categoria | Ação |
|---|---|
| Operacionais correntes (`estoque_produto`, `catalogo_volumes`, `partner_product_prices`, `partner_simulation_items`, `commercial_campaign_products`, `programacao_producao`, `cq_parametros_referencia`, `produto_etiquetas`, `product_*_recommendations`, `product_technical_profiles`, `product_fiscal_profiles`) | `DELETE` das linhas órfãs |
| Histórico transacional (`ordens_servico`, `ordens_servico_onfarm`, `entregas`, `lotes`, `os_faturamento_base`, `partner_order_items`, `registros_consultor_recomendacoes`, `estoque_embalagens`, `formulacoes`) | `SET produto_id = NULL` (preserva histórico) |

## Fase 3 — UI (verificação)

Auditei os consumidores principais (`FichasTecnicas`, `EficienciaBioinsumos`, `BIFiltrosGlobais`, `EncerramentoCard`, `VisaoGeral`) e todos já filtram por `ativo`/joins que descartam órfãos naturalmente. Nenhum hardening extra é necessário.
