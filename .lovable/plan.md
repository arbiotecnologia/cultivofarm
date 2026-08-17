# Unificação: manter apenas o "Catálogo Técnico"

Hoje existem duas entradas no mesmo submenu "Produtos e Planejamento":

- "Catálogo" → `/comercial/catalogo` (página `CatalogoComercial`, escopo `interno`)
- "Catálogo AR Bio" → "Catálogo Técnico" → `/base-tecnica?tab=catalogo-tecnico` (escopo `admin`)

Verificado no código: as duas telas usam os mesmos componentes (`CatalogoKpis` + `CatalogoCardsGrid`) e o mesmo hook `useCatalogoUnificado`. A diferença de dados entre `interno` e `admin` é nula — o hook só filtra campos no escopo `b2b`. É duplicidade real.

## O que muda

1. Remover o item de menu "Catálogo" (`com-catalogo`) da navegação desktop.
2. Transformar `/comercial/catalogo` em redirecionamento preservado para `/base-tecnica?tab=catalogo-tecnico` (link antigo, favorito ou deep link continua funcionando).
3. Manter a página `CatalogoComercial` fora da árvore de rotas ou removê-la, sem tocar em `CatalogoCardsGrid`, `CatalogoKpis`, `CatalogoItemDrawer` nem no hook.
4. Reforçar as `searchKeywords` do item "Catálogo AR Bio" com "catálogo", "portfólio" e "catálogo comercial", para a busca do menu continuar encontrando.

## Ponto que exige sua autorização explícita

`gestor_comercial` hoje tem acesso a `/comercial/catalogo`, mas **não** tem acesso a `/base-tecnica`. Ao unificar, esse papel perde a visão de catálogo, a menos que se conceda leitura.

Opções:

- (A) Adicionar `gestor_comercial: "r"` em `/base-tecnica` no `permissions.ts` — mantém o acesso atual do papel. Recomendado.
- (B) Não alterar permissões — `gestor_comercial` deixa de ver catálogo.

Aprovar este plano sem ressalva será tratado como escolha (A). Se preferir (B), diga na resposta.

## Detalhes técnicos

- `src/config/navigation.ts`: remover `com-catalogo`; ampliar keywords de `protocolos`.
- `src/App.tsx`: `/comercial/catalogo` passa a `<PreservedNavigate to="/base-tecnica?tab=catalogo-tecnico" />`, mesmo padrão já usado em `/protocolos`.
- `src/lib/permissions.ts`: manter a chave `/comercial/catalogo` (rota legada de redirecionamento); em (A), acrescentar `gestor_comercial: "r"` em `/base-tecnica`.
- `src/pages/comercial/CatalogoComercial.tsx`: removido junto com seu import.
- Ajustar `src/test/catalogo/catalogo-fase26f.certificacao.test.ts` e `e2e/catalogo-cards-assertions.py` onde referenciam `/comercial/catalogo`, e adicionar teste do redirecionamento.
- Frontend apenas: nenhuma migration, RPC, RLS ou dado é alterado. Rotas B2B, `/app/catalogo` (mobile consultor) e `MobileCatalogoTecnico` ficam intactas.

## Validação

`tsgo` (typecheck), `vitest run` completo e `build`.
