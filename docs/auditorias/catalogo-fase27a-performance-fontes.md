# FASE 27A — Auditoria pós-unificação do Catálogo AR Bio (performance e fontes canônicas)

Escopo: somente auditoria, testes de contrato e documentação. Nenhuma alteração de banco, migrations, RLS, RPCs, Edge Functions, precificação, pedido B2B, carrinho, publicação real ou rotas.

## 1. Diagnóstico — `src/hooks/useCatalogoUnificado.ts`

- **Queries:** 8 consultas paralelas por execução (`Promise.all`).
- **Tabelas:** `produtos`, `microrganismos`, `product_technical_profiles`, `microorganism_technical_profiles`, `formulacoes`, `catalog_technical_sources`, `microorganism_targets`, `product_target_recommendations`.
- **SELECT *:** não há. Todas as consultas listam colunas explícitas.
- **Filtros por scope:** o scope é aplicado **no frontend** — `gate()` para conteúdo de ficha e filtro final `ativo && b2b_enabled` no escopo `b2b`. `microorganism_targets` e `product_target_recommendations` filtram `ativo = true` no servidor.
- **Payload:** cresce linearmente com o catálogo; sem paginação nem `staleTime`. Hoje é aceitável (dezenas de itens), com risco de crescimento.
- **Exposição em `b2b`:** `explicacao_tecnica` sempre `null`; `modo_acao` anulado em `raw`; resumo/explicações só quando `status_validacao === "aprovado"`. Fontes e auditoria não são retornadas (apenas contagem agregada `fontes_count`).
- **Dependência de dados técnicos para KPIs internos:** sim — contagens de fontes, alvos e composição alimentam `CatalogoKpis` e `catalogoRevisionPending`.

**Conclusão:** conforme. Sem `SELECT *`, sem vazamento de texto técnico, gate de aprovação e filtro B2B presentes.

## 2. `src/components/catalogo/CatalogoItemDrawer.tsx`

- Somente leitura confirmada: sem `supabase`, sem `.rpc(`, sem `useQuery`, sem `useMutation`.
- Sem ações de publicar/despublicar e sem ação de carrinho — a aba Publicação é **diagnóstico visual** derivado de `ativo`, `b2b_enabled` e `ficha_status`.
- Aba "Volumes e Preços" lê exclusivamente `item.raw` — nenhuma query adicional.
- Revisão visual: espaçamentos, labels e textos das abas revisados; nenhuma correção necessária nesta fase.

## 3. Portais e fontes canônicas

| Tela | Fonte | Natureza |
|---|---|---|
| `portal-parceiro/NovoPedido.tsx` | `usePartnerCatalog` + `usePartnerCatalogTecnico` (RPC) | Carrinho/pedido oficial |
| `hooks/usePartnerCatalog.ts` | RPC `get_partner_catalog_secure` | Canônica |
| `hooks/usePartnerCatalogTecnico.ts` | RPC `get_partner_catalog_tecnico_secure` | Canônica |
| `portal-parceiro/FichasTecnicas.tsx` | Query direta com `b2b_enabled = true` + `status_validacao = aprovado` (inner join) | Consulta/ficha/PDF |
| `app/MobileCatalogoTecnico.tsx` | Query direta em `produtos`/`microrganismos` + perfis (colunas explícitas, `ativo = true`) | Consulta interna/ficha |
| `CatalogoItemDrawer` | `CatalogoUnificadoRow` já carregado | Leitura |

- `useCreatePartnerOrder` chama `create_partner_order_secure` e envia `unidade_medida` por item.
- `MobileCatalogoTecnico` não exibe custo interno, auditoria nem `catalog_technical_audit_logs`; é rota interna (`/app`), não parceiro/produtor.

## 4. Riscos por prioridade

- **Crítico:** nenhum. Carrinho canônico, `unidade_medida` presente, drawer sem mutação, nenhum dado interno em telas de parceiro/produtor.
- **Alto:** nenhum bloqueante. Observação: `MobileCatalogoTecnico` exibe badge de ficha não aprovada — aceitável por ser superfície interna; deve permanecer fora de portais externos.
- **Médio:**
  - `useCatalogoUnificado` carrega 8 conjuntos completos sem paginação nem `staleTime`;
  - filtragem de scope executada no cliente;
  - volumes da ficha dependem de `raw` sem carregamento sob demanda.
- **Baixo:** documentação e rótulos.

## 5. O que está apto / o que não alterar

Apto: rotas `/base-tecnica`, `/protocolos`, `/comercial/catalogo`, `/app/catalogo`; ficha unificada 26D–26F; KPIs compartilhados; portais parceiro e produtor.

Não alterar: `usePartnerCatalog`, `usePartnerCatalogTecnico`, `get_partner_catalog_secure`, `get_partner_catalog_tecnico_secure`, `NovoPedido`, `AddToCartDialog`, `useCreatePartnerOrder`, `create_partner_order_secure`, `MobileCatalogoTecnico` (funcional), migrations/RLS/Edge Functions.

## 6. Plano seguro para 27B

- **Preferencial:** otimizar internamente `useCatalogoUnificado` mantendo assinatura e retorno idênticos — `staleTime`, deduplicação de mapas e `select` mínimo por scope.
- **Conservadora:** apenas parâmetros opcionais (`staleTime`, `enabled`, filtros locais documentados), sem mudar o retorno.
- **Futura:** RPC agregada segura para catálogo interno — exige fase própria com migration auditada; fora desta frente.

## 7. Validação

Ver seção final do relatório de execução: typecheck, testes de catálogo/navegação, novo contrato `src/test/catalogo/catalogo-fase27a-fontes-canonicas.test.ts`, suíte completa e build.

**Status: FASE 27A APLICADA COM SUCESSO — APTO PARA PLANEJAR 27B.**
