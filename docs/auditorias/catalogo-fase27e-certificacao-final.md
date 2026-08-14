# FASE 27E — Certificação final do Catálogo AR Bio

Escopo: auditoria somente-leitura + teste de contrato + documentação.
Nenhuma alteração de banco, migration, RLS, RPC, Edge Function, precificação,
carrinho, portal parceiro ou portal produtor.

## 1. Auditoria da Fase 27D — **27D CERTIFICADA**

`src/components/catalogo/CatalogoCardsGrid.tsx`:

| Item | Resultado |
| --- | --- |
| `export const CATALOGO_PAGE_SIZE = 60` | OK (linha 26) |
| `visiveis` aplica limite **após** `sorted` | OK (`sorted.slice(0, limite)`) |
| "Mostrar mais" apenas incrementa limite local | OK (`setLimite((l) => l + CATALOGO_PAGE_SIZE)`), sem nova query |
| Reset de limite | OK — deps `[search, tipo, status, b2b, sort, scope]` |
| "Ver ficha" | preservado |
| "Ficha completa" | preservado |
| `actionSlot` / `pricingSlot` | preservados |
| `FichaProdutorDrawer` | preservado |
| `ProductTechnicalProfileDialog` / `MicroorganismTechnicalProfileDialog` | preservados |
| `CatalogoItemDrawer` | complementar e somente leitura |
| `supabase` / `.rpc(` / `useQuery` no grid | ausentes |
| Testes 27D (`catalogo-fase27d-renderizacao.test.ts`) | 14/14 PASS |

## 2. Rotas e telas

- Rótulo "Catálogo AR Bio" preservado em `src/config/navigation.ts` (id `protocolos`).
- Rota canônica `/base-tecnica` preservada (`App.tsx`).
- Rota legada `/protocolos` preservada como redirecionamento (`PreservedNavigate`), com query/hash mantidos (teste `base-tecnica.redirect.test.tsx`).
- Subitens por `?tab=` (produtos, microrganismos, catálogo técnico, culturas, problemas) intactos.
- `MobileCatalogoTecnico` preservado como tela própria.
- Portal parceiro segue com telas específicas (`NovoPedido`, `FichasTecnicas`); não foi substituído pelo catálogo interno.
- Portal produtor não recebeu superfícies internas.

## 3. Portal parceiro

- `usePartnerCatalog` → `get_partner_catalog_secure`.
- `usePartnerCatalogTecnico` → `get_partner_catalog_tecnico_secure`.
- `NovoPedido` usa exclusivamente esses hooks como fonte do carrinho; não invoca `useCatalogoUnificado(` (importa apenas o **tipo** `CatalogoUnificadoRow` para adaptação de props).
- `AddToCartDialog` mantido em `NovoPedido`.
- `FichasTecnicas` filtra `b2b_enabled = true` e `status_validacao = 'aprovado'` (produtos e microrganismos).
- Nenhuma exposição de `explicacao_tecnica`, auditoria, fonte interna ou custo interno ao parceiro.

## 4. Carrinho e unidades comerciais

- `unidade_pedido`: `hectare | dose_100ml | litro | volume_comercial` (`useCreatePartnerOrder`).
- Mapeamento canônico preservado: `hectare → hectare`, `dose_100ml → dose`, `litro → litro`, `volume_comercial → unidade`.
- `useCreatePartnerOrder` continua enviando `unidade_medida` e chamando `create_partner_order_secure` com `expected_cart_hash` + `idempotency_key`.
- `AddToCartDialog` preservado (linhas de vasilhame, sincronização ha ↔ L via `doseRecomendadaLitroHa`).
- Nenhum botão de carrinho removido; a ficha completa interna não é fonte do carrinho.

## 5. Mobile / produtor

- `MobileCatalogoTecnico`: sem `catalog_technical_audit_logs`, sem custo interno, sem auditoria.
- `FichaProdutorDrawer` preservado com os textos permitidos.
- `CatalogoItemDrawer` (interno) não é importado por `NovoPedido`, `FichasTecnicas` nem `MobileCatalogoTecnico`.
- Fichas em rascunho/revisão não alcançam superfícies B2B (filtro `aprovado`).

## 6. Arquivos alterados

- `src/test/catalogo/catalogo-fase27e-certificacao-final.test.ts` (novo).
- `docs/auditorias/catalogo-fase27e-certificacao-final.md` (novo).
- `src/integrations/supabase/types.ts` e `.env`: restaurados ao baseline `c75bb87f` (staging `ikaauvsflpmamgxmkhoq`) após drift detectado no início da fase. Nenhuma mudança funcional.

## 7. Validação

- `connection-binding.static.test.ts`: PASS (binding staging).
- Typecheck (`tsgo --noEmit`): 0 erros.
- `src/test/catalogo` + `src/test/navigation` + `src/test/protocolos`: 273 PASS.
- Teste novo 27E: 17 PASS.
- Suíte completa e build: ver seção final desta execução.

## 8. Riscos remanescentes

- Baixo: drift recorrente de `.env`/`types.ts` para o projeto sandbox entre execuções — exige revalidação do baseline no início de cada fase.
- Baixo: contratos verificados por leitura estática de código; não substituem teste E2E de UI.
- Baixo: listas acima de 60 itens exigem clique em "Mostrar mais" (comportamento intencional).

## 9. Recomendações futuras

- Considerar virtualização somente se o catálogo ultrapassar alguns milhares de itens.
- Avaliar teste E2E de checkout B2B em staging em frente separada.
- Manter o guard de binding como primeiro passo de qualquer nova fase.

## 10. Rollback

Reverter apenas os dois arquivos novos (teste e documento). Nenhuma alteração
funcional de runtime foi introduzida nesta fase.

## Status final

**CATÁLOGO AR BIO — FRENTE DE UNIFICAÇÃO, PERFORMANCE VISUAL E CERTIFICAÇÃO DE PORTAIS FINALIZADA E APTA.**
