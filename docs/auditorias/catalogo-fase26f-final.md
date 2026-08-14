# FASE 26F — Auditoria final e certificação da unificação do Catálogo AR Bio

Status final: **UNIFICAÇÃO VISUAL DO CATÁLOGO AR BIO FINALIZADA E APTA**

Escopo desta fase: auditoria, testes de contrato e documentação. Nenhuma alteração de banco,
migration, RLS, RPC, Edge Function, aprovação técnica, precificação, pedido B2B ou publicação real.

## Fases aplicadas

| Fase | Entrega |
| --- | --- |
| 26A | Auditoria e plano de unificação (`catalogo-fase26a.md`) |
| 26B | `CatalogoKpis.tsx` compartilhado, duplicação de KPIs removida |
| 26C | Menu “Catálogo AR Bio” e aliases de aba em `useTabParam` |
| 26D | `CatalogoItemDrawer.tsx` — ficha unificada somente leitura |
| 26E | Abas “Volumes e Preços” e “Publicação” (diagnóstico) |
| 26F | Auditoria final, teste de certificação e este relatório |

## Arquivos principais

Criados: `src/components/catalogo/CatalogoKpis.tsx`,
`src/components/catalogo/CatalogoItemDrawer.tsx`,
`src/test/catalogo/catalogo-item-drawer.test.tsx`,
`src/test/catalogo/catalogo-fase26f.certificacao.test.ts`, docs 26A–26F.

Alterados: `src/config/navigation.ts`, `src/lib/navigation/useTabParam.ts`,
`src/pages/Protocolos.tsx`, `src/pages/CatalogoComercial.tsx`,
`src/components/catalogo/CatalogoCardsGrid.tsx`, aba técnica do catálogo.

Nesta fase 26F só foi adicionado o teste de certificação; nenhum arquivo de produto foi alterado.

## Rotas preservadas (verificadas em `src/App.tsx`)

- `/base-tecnica` → Catálogo AR Bio interno.
- `/protocolos` → redireciona preservando query/hash.
- `/comercial/catalogo` → visão comercial interna.
- `/app/catalogo` → visão mobile/produtor.
- `portal-parceiro/catalogo` e `portal-parceiro/fichas` → fluxo B2B existente.

## Fluxos preservados

- `CatalogoCardsGrid` mantém “Ver ficha” (fluxo antigo), `actionSlot` e o botão complementar
  “Ficha completa”.
- `FichaProdutorDrawer`, `ProductTechnicalProfileDialog` e
  `MicroorganismTechnicalProfileDialog` continuam referenciados na grade.
- Abas canônicas: `produtos`, `microrganismos`, `catalogo-tecnico`, `culturas`, `problemas`.
  Aliases: `catalogo`, `fichas`, `tecnico`, `revisao`.

## Portais

- **Parceiro (b2b)**: `useCatalogoUnificado("b2b")` filtra `ativo && b2b_enabled` e libera texto de
  ficha apenas com `ficha_status = 'aprovado'`; `explicacao_tecnica` e `modo_acao` nunca são
  expostos. No drawer, `fichaPermiteInterno("b2b") = false` (sem fontes, auditoria ou custo
  interno) e `fichaPermiteTextoProdutor("b2b") = false`; texto B2B permanece visível.
- **Produtor**: `fichaPermiteTextoB2B("produtor") = false` e `fichaPermiteInterno("produtor") =
  false`. `FichaProdutorDrawer` preservada.

## Carrinho e pedido B2B

- `AddToCartDialog` continua existindo e é usado por `NovoPedido.tsx` junto da grade unificada.
- `unidade_medida` continua sendo enviada; `useCreatePartnerOrder` mantém o mapeamento
  `hectare → hectare`, `dose_100ml → dose`, `litro → litro`, `volume_comercial → unidade`.
- `create_partner_order_secure`, `p_expected_cart_hash` e a idempotência permanecem intactos;
  o frontend não recalcula desconto nem preço.
- `CatalogoItemDrawer` não referencia carrinho e não interfere no checkout.

## Publicação e performance

A aba Publicação é diagnóstico derivado de `ativo`, `b2b_enabled` e `ficha_status`. O drawer não
usa `supabase`, `.rpc(`, `useQuery` nem `useMutation`, e não possui ação de publicar/despublicar.
Nenhuma consulta nova foi introduzida na listagem.

## Testes e build

- Catálogo/navegação/protocolos/parceiro: 209 PASS (17 arquivos).
- Suíte completa: **2906 passed, 4 skipped, 0 failed**.
- Typecheck (`tsgo`, `tsconfig.app.json`): **0 erros**.
- `vite build`: **SUCESSO**.
- `.env` e `src/integrations/supabase/types.ts` restaurados ao baseline `c75bb87f`
  (staging `ikaauvsflpmamgxmkhoq`, types com 21.850 linhas) antes da execução.

## Riscos remanescentes

- Drift recorrente de `.env`/`types.ts` para o projeto sandbox exige verificação a cada sessão.
- `useCatalogoUnificado` ainda faz 8 consultas sem paginação nem colunas mínimas.
- Visões mobile e B2B ainda não convergiram para as RPCs canônicas.

## Rollback

Reverter os arquivos de catálogo (`CatalogoKpis`, `CatalogoItemDrawer`, ajustes em
`CatalogoCardsGrid`, `navigation.ts`, `useTabParam.ts`, `Protocolos.tsx`) restaura o comportamento
pré-26B. Nenhum objeto de banco foi criado ou alterado, portanto não há rollback de dados.

## Pendências futuras (opcionais)

1. Paginação e seleção explícita de colunas em `useCatalogoUnificado`.
2. Carregamento sob demanda de volumes reais na ficha.
3. Convergência de mobile/B2B para `get_partner_catalog_secure`.
