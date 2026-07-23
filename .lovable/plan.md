## Objetivo

Limpar, em outros módulos do sistema, dados e menções que apontam para produtos que **não existem mais** na tabela `produtos` (por exemplo, itens antigos removidos que sobraram como referência em estoques, recomendações, dashboards, BI, PDFs, etc.).

O catálogo oficial atual é o **A.R Bio v1.3** (7 produtos: `SOLO-1`, `SOLO-2`, `BINS-01`, `BINS-02`, `BFUN-01`, `BINO-01`, `BSOL-01`). Qualquer linha em tabelas dependentes que referencie um `produto_id` fora desse conjunto é considerada "sobressalente".

Nada será apagado sem autorização explícita — a Fase 1 é somente-leitura.

## Fase 1 — Auditoria somente-leitura (sem alterações)

Levantar, sem escrever nada, o volume real de referências órfãs. Entrega em `restoration/produtos-orfaos-manifest.json`.

Para cada tabela dependente detectada em `src/integrations/supabase/types.ts` com FK para `produtos` (≈25 relações), rodar consultas do tipo:

```sql
SELECT '<tabela>' AS tabela, COUNT(*) AS orfas
FROM <tabela> t
LEFT JOIN produtos p ON p.id = t.produto_id
WHERE t.produto_id IS NOT NULL AND p.id IS NULL;
```

Escopo mínimo esperado (a auditoria confirma a lista final):
- `formulacoes`, `estoque_produto`, `movimentacoes_estoque`, `lotes_producao`
- `recomendacoes*`, `visita_recomendacoes`, `ordem_servico_itens`
- `pedido_itens`, `nfe_itens`, `product_fiscal_profiles`
- `partner_prices`, `catalogo_*`, `historico_produtos`

Também mapear, no código, componentes/páginas que exibem produtos e como se comportam quando o `produto_id` referenciado não existe (ex.: cards mostrando "—", nomes vazios, IDs crus). Foco em:
- `pages/dashboard/VisaoGeral.tsx`
- `components/bi/*` (BI/dashboards)
- `pages/portal/*` e `pages/portal-parceiro/FichasTecnicas.tsx`
- `components/visita/EncerramentoCard.tsx`
- `lib/pdf/fichaTecnicaProdutoPdf.ts`

Ao fim, apresentar o manifesto com contagens por tabela e pedir autorização para a Fase 2.

## Fase 2 — Limpeza controlada (só após aprovação do manifesto)

Uma migration única, revisada, com transação, seguindo o princípio "preservar histórico, remover ruído":

1. **Tabelas transacionais/históricas** (pedidos, NF-e, movimentações, lotes, ordens de serviço, histórico): manter linhas, mas gravar `produto_id = NULL` quando a coluna for nullable, preservando `nome_produto`/snapshot textual quando existir. **Não apagar** registros contábeis/fiscais.
2. **Tabelas operacionais vivas** (`estoque_produto`, `formulacoes`, `recomendacoes*`, `partner_prices`, `product_fiscal_profiles`, `catalogo_*`): `DELETE` das linhas cujo `produto_id` não existe em `produtos`.
3. Toda operação restrita a `produto_id NOT IN (SELECT id FROM produtos)` — não toca em nada dos 7 produtos v1.3.
4. Log de contagens antes/depois em `restoration/produtos-orfaos-cleanup-log.md`.

Nenhum `DROP`, nenhuma alteração de schema, nenhuma mudança em RLS.

## Fase 3 — Robustez na UI (defensivo)

Ajustes locais para que os módulos não voltem a "vazar" produto inexistente:

- `EncerramentoCard`, `FichasTecnicas`, `BIFiltrosGlobais`, `EficienciaBioinsumos`, `VisaoGeral`: filtrar `produto_id` nulo/ausente antes de renderizar.
- `fichaTecnicaProdutoPdf`: retornar erro amigável quando `produto` for `null` em vez de gerar PDF vazio.
- Sem mudanças de contrato de API, sem novas dependências.

## Fora de escopo

- Não altera o catálogo v1.3 nem a aba Produtos/Microrganismos.
- Não mexe em migrations históricas, RLS, permissões, rotas ou Edge Functions.
- Não re-executa o wipe da Edge Function `admin-wipe-produtos-catalog`.

## Validação

Após cada fase que tocar código: `bun run typecheck`, `bun run build`, `bunx vitest run`. Após a Fase 2: reconsulta das mesmas queries de auditoria mostrando `0` órfãs.

## Detalhes técnicos

- Acesso `psql` direto não está disponível nesta sessão (`PGHOST` ausente); as consultas da Fase 1 serão executadas via ferramentas Supabase de leitura.
- A Fase 2 será entregue como uma migration SQL em `supabase/migrations/` para revisão antes de aplicar.
- Todo `UPDATE ... SET produto_id = NULL` é precedido por checagem de que a coluna aceita NULL — caso contrário, cai na regra de `DELETE` (com destaque no manifesto).
