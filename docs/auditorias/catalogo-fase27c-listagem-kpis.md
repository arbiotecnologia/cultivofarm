# FASE 27C — Auditoria da 27B e otimização visual da listagem interna do Catálogo AR Bio

Escopo: frontend-only, incremental e reversível. Sem banco, migrations, RLS, RPC, Edge Functions, portais externos ou carrinho.

## 1. Auditoria da Fase 27B — **27B CERTIFICADA**

| Item verificado | Resultado |
| --- | --- |
| `queryKey: ["catalogo-unificado", scope]` | OK |
| `staleTime` / `gcTime` / `refetchOnWindowFocus: false` | OK |
| Ausência de `select("*")` | OK (constantes explícitas de colunas) |
| Helpers puros (`catalogoIsB2BScope`, `catalogoGateB2B`, `catalogoShouldShowB2BRow`, `catalogoBuildSourceKey`, `buildCountMap`) | OK |
| Filtro `ativo && b2b_enabled` | Preservado |
| Gate `status === "aprovado"` | Preservado |
| `explicacao_tecnica` nula em escopo B2B | Preservado |
| `modo_acao` nulo no `raw` de produto B2B | Preservado |
| Portais/carrinho inalterados | Confirmado |
| Testes 27B | 13/13 PASS |

Nenhuma falha crítica ou alta foi encontrada; nenhuma correção corretiva foi necessária na 27B.

## 2. Otimizações aplicadas (listagem interna)

`src/components/catalogo/CatalogoCardsGrid.tsx`:
- `rows` passou a ser memoizado (`useMemo(() => data ?? [], [data])`), estabilizando as dependências de `filtered`/`sorted` e evitando recomputações de filtro/ordenação quando `data` é `undefined`.
- Estado vazio diferenciado: distingue "catálogo sem itens" de "nenhum item para os filtros aplicados", com ação **Limpar filtros** que apenas reseta estados locais de busca/tipo/status/B2B.

`src/components/catalogo/CatalogoKpis.tsx`: já memoizado via `useMemo(computeCatalogoKpis)`; helper puro mantido sem alteração de cálculo.

Virtualização: **não implementada** (nenhuma lib de virtualização instalada e o volume atual do catálogo interno não justifica). Recomendação registrada para fase futura, se a listagem superar ~500 itens.

## 3. Preservações validadas

- "Ver ficha", "Ficha completa" e `actionSlot` intactos.
- `FichaProdutorDrawer`, `ProductTechnicalProfileDialog`, `MicroorganismTechnicalProfileDialog` intactos.
- `CatalogoItemDrawer` permanece complementar e somente leitura (sem `supabase`, `.rpc(`, `useQuery`, `useMutation`).
- `CatalogoKpis` sem query, sem Supabase, sem RPC — apenas `rows` recebidas.
- `AddToCartDialog`, `NovoPedido.tsx`, `usePartnerCatalog`, `usePartnerCatalogTecnico`, `useCreatePartnerOrder` e RPCs seguras não foram tocados.
- Assinatura de `useCatalogoUnificado` e formato de `CatalogoUnificadoRow` inalterados.

## 4. Arquivos alterados

- `src/components/catalogo/CatalogoCardsGrid.tsx` (memoização + estado vazio)
- `src/test/catalogo/catalogo-fase27c-listagem-kpis.test.ts` (novo)
- `docs/auditorias/catalogo-fase27c-listagem-kpis.md` (novo)
- Restauração de baseline `c75bb87f` em `.env` e `src/integrations/supabase/types.ts` (drift recorrente de ambiente)

## 5. Validação

- `connection-binding.static.test.ts`: 8/8 PASS
- Typecheck (`tsgo --noEmit`): 0 erros
- `src/test/catalogo` + `src/test/navigation` + `src/test/protocolos` + `src/test/config`: 250/250 PASS (inclui 27A, 27B e o novo teste 27C com 11 casos)
- Suíte completa e build: ver seção de execução final

## 6. Riscos remanescentes

- Drift recorrente de `.env`/`types.ts` para o projeto Sandbox exige verificação no início de cada fase.
- Listagem ainda renderiza todos os itens filtrados; sem virtualização, listas muito grandes podem degradar a rolagem.

## 7. Rollback

Reverter `src/components/catalogo/CatalogoCardsGrid.tsx` para a versão anterior (duas edições pontuais) e remover o teste/documento 27C. Nenhum efeito em dados ou backend.

## 8. Recomendação para a próxima fase (27D)

Avaliar paginação/virtualização opcional com biblioteca leve, memoização de renderizadores de card e telemetria simples de tempo de render, mantendo o mesmo contrato de dados.
