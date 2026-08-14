# FASE 27D — Auditoria pós-27C e otimização segura de renderização do Catálogo AR Bio

Escopo: frontend-only, incremental e reversível. Sem banco, migrations, RLS, RPC, Edge Functions, portais externos, carrinho ou publicação real.

## 1. Auditoria da Fase 27C — **27C CERTIFICADA**

| Item verificado | Resultado |
| --- | --- |
| `rows` memoizado (`useMemo(() => data ?? [], [data])`) | OK |
| `filtered` e `sorted` memoizados | OK |
| Estado vazio diferenciado (catálogo vazio × filtros sem resultado) | OK |
| Botão "Limpar filtros" reseta apenas estados locais (search/tipo/status/b2b) | OK |
| "Ver ficha" presente | OK |
| "Ficha completa" presente | OK |
| `actionSlot` preservado | OK |
| `FichaProdutorDrawer` preservado | OK |
| `ProductTechnicalProfileDialog` / `MicroorganismTechnicalProfileDialog` preservados | OK |
| `CatalogoItemDrawer` complementar e somente leitura | OK |
| `CatalogoKpis` sem Supabase, RPC ou query | OK |
| Testes 27C | PASS |

Nenhuma falha crítica ou alta na 27C; nenhuma correção corretiva foi necessária.

## 2. Otimizações aplicadas (27D)

`src/components/catalogo/CatalogoCardsGrid.tsx`:

- **Callbacks memoizados**: `abrirVerFicha` e `abrirFichaCompleta` via `useCallback`, compartilhados por todos os cards e linhas da tabela. Comportamento idêntico (B2B continua abrindo `FichaProdutorDrawer`; interno abre os dialogs técnicos).
- **Exibição incremental segura**: constante exportada `CATALOGO_PAGE_SIZE = 60`.
  - `sorted.length <= 60` → renderização visualmente idêntica à atual (nenhum item ocultado, nenhum botão extra).
  - `sorted.length > 60` → exibe os primeiros 60 e um botão "Mostrar mais (N)" que apenas incrementa o limite local.
  - O limite é aplicado **depois** de filtro e ordenação.
  - O limite reseta para `CATALOGO_PAGE_SIZE` sempre que `search`, `tipo`, `status`, `b2b`, `sort` ou `scope` mudam.
  - Sem nova query, sem alteração de dados, sem alteração de ações de card.

Virtualização complexa: **não implementada** (fora do escopo desta fase e sem biblioteca nova).

## 3. Preservações validadas

- "Ver ficha" → `FichaProdutorDrawer` (B2B) / dialogs técnicos (interno).
- "Ficha completa" → `CatalogoItemDrawer` (somente leitura).
- `actionSlot` e `pricingSlot` renderizados nos mesmos pontos (cards e coluna de ações da lista).
- Nenhum botão de carrinho removido; `AddToCartDialog`, `NovoPedido.tsx`, `usePartnerCatalog`, `usePartnerCatalogTecnico`, `useCreatePartnerOrder` e as RPCs seguras intocados.
- Assinatura de `useCatalogoUnificado` e formato de `CatalogoUnificadoRow` inalterados.
- `MobileCatalogoTecnico` intocado.

## 4. Arquivos alterados

- `src/components/catalogo/CatalogoCardsGrid.tsx`
- `src/test/catalogo/catalogo-fase27d-renderizacao.test.ts` (novo)
- `docs/auditorias/catalogo-fase27d-renderizacao.md` (novo)
- Restauração de baseline `c75bb87f` em `.env` e `src/integrations/supabase/types.ts` (drift recorrente de ambiente)

## 5. Testes executados

- `connection-binding.static.test.ts`: 8/8 PASS
- Typecheck (`tsgo --noEmit`): 0 erros
- `src/test/catalogo` + `src/test/navigation` + `src/test/protocolos` (inclui 27A, 27B, 27C e o novo 27D)
- Suíte completa e build: ver execução final

## 6. Riscos remanescentes

- Drift recorrente de `.env`/`types.ts` para o projeto Sandbox exige verificação no início de cada fase.
- A exibição incremental é local ao cliente: o hook continua carregando todo o catálogo; ganhos são de renderização, não de rede.

## 7. Rollback

Reverter `src/components/catalogo/CatalogoCardsGrid.tsx` (constante `CATALOGO_PAGE_SIZE`, estado `limite`, `visiveis`, botão "Mostrar mais" e os dois `useCallback`) e remover o teste/documento 27D. Nenhum efeito em dados ou backend.

## 8. Recomendação para a próxima fase (27E)

Avaliar virtualização com biblioteca leve apenas se o catálogo interno superar ~500 itens, além de memoização por card (`React.memo`) e telemetria simples de tempo de render, mantendo o mesmo contrato de dados.
