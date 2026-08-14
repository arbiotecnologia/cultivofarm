# FASE 27B — Otimização segura do `useCatalogoUnificado`

Escopo: frontend-only, incremental e reversível. Nenhuma alteração de banco, migrations, RLS, RPCs, Edge Functions, precificação, pedido B2B, carrinho, publicação real, rotas ou portais.

## 1. O que foi otimizado

- **Cache conservador** no `useQuery`: `staleTime = 120_000 ms`, `gcTime = 10 * 60_000 ms`, `refetchOnWindowFocus: false`. Sem polling (`refetchInterval` ausente) e sem bloqueio de invalidação manual por `queryKey`.
- **Colunas explícitas extraídas para constantes** exportadas: `PRODUTOS_SELECT`, `MICROORGANISMOS_SELECT`, `PRODUCT_PROFILES_SELECT`, `MICRO_PROFILES_SELECT`, `FORMULACOES_SELECT`, `SOURCES_SELECT`, `MICRO_TARGETS_SELECT`, `PRODUCT_TARGETS_SELECT`. Nenhuma coluna adicionada ou removida.
- **Montagem de mapas simplificada** por helpers puros (`buildCountMap`, índice interno de perfis), eliminando repetição de `forEach` manuais.
- **Regras de escopo extraídas em helpers puros**, testáveis isoladamente.

## 2. O que foi preservado

- Assinatura pública: `CatalogoUnificadoRow`, `CatalogoScope`, `useCatalogoUnificado(scope = "interno")`, `catalogoRevisionPending`.
- `queryKey` inalterada: `["catalogo-unificado", scope]`.
- 8 consultas paralelas às mesmas tabelas, com os mesmos filtros de servidor (`ativo = true` em alvos/recomendações) e a mesma ordenação por nome.
- Retorno idêntico campo a campo para todas as telas (`CatalogoCardsGrid`, `CatalogoKpis`, `CatalogoItemDrawer`).

## 3. Helpers criados

| Helper | Função |
|---|---|
| `catalogoIsB2BScope(scope)` | Identifica exclusivamente o escopo `b2b` |
| `catalogoGateB2B(scope, status, value)` | Libera conteúdo de ficha no B2B só com `status === "aprovado"` |
| `catalogoShouldShowB2BRow(r)` | Filtro `r.ativo && r.b2b_enabled` |
| `catalogoBuildSourceKey(tipo, id)` | Normaliza `ficha_produto` → `produto` e `ficha_microrganismo` → `microrganismo` |
| `buildCountMap(rows, keyField)` | Contagem por chave, ignorando nulos |

## 4. Garantias B2B preservadas (verificadas por teste)

- B2B recebe apenas itens `ativo && b2b_enabled`.
- `explicacao_tecnica` sempre `null` no B2B.
- `modo_acao` anulado em `raw` para produto no B2B.
- `ficha_resumo`, `explicacao_b2b`, `explicacao_produtor`, `mecanismo_acao` e `beneficios_agronomicos` retornam `null` no B2B quando a ficha não está aprovada.
- `fontes_count` e `alvos_count` permanecem contagens; nenhum conteúdo de fonte, auditoria ou custo interno é exposto.

## 5. Fluxos externos intocados

`NovoPedido.tsx` (usa apenas o *tipo* `CatalogoUnificadoRow`), `AddToCartDialog`, `usePartnerCatalog`, `usePartnerCatalogTecnico`, `useCreatePartnerOrder`, `FichasTecnicas.tsx` e `MobileCatalogoTecnico.tsx` permanecem sem alteração funcional.

## 6. Validação

- Baseline: `.env` e `types.ts` (21.850 linhas) restaurados de `c75bb87f` antes da execução.
- Typecheck: **0 erros**.
- `src/test/catalogo` + `src/test/navigation` + `src/test/protocolos`: **231/231 PASS** (inclui 27A e o novo 27B).
- Suíte completa e build: ver resultado da execução final.

## 7. Riscos remanescentes

- **Médio:** ausência de paginação — o hook continua carregando o catálogo inteiro; mitigado por cache, mas persiste com o crescimento da base.
- **Médio:** filtragem de escopo ainda ocorre no cliente.
- **Baixo:** volumes da ficha continuam derivados de `raw`, sem carregamento sob demanda.
- **Recorrente:** drift de `.env`/`types.ts` para o Sandbox, exigindo restauração de baseline a cada execução.

## 8. Rollback

Reverter apenas dois arquivos:
`src/hooks/useCatalogoUnificado.ts` e `src/test/catalogo/catalogo-fase27b-useCatalogoUnificado.test.ts`. Nenhuma dependência externa foi criada.

## 9. Recomendação para 27C

Avaliar paginação/virtualização na grade interna e memoização dos KPIs — sempre mantendo `useCatalogoUnificado` como fonte única interna e sem tocar nas RPCs canônicas do B2B.

**Status: FASE 27B APLICADA COM SUCESSO — `useCatalogoUnificado` OTIMIZADO COM COMPATIBILIDADE PRESERVADA.**
