# Filtros do catálogo — correção runtime revisável01:46

## Causa comprovada pelo código e regressão
PortalParceiroLayout retorna Acesso indisponível quando partnerReady=false/erro, desmontando OwnerCatalog/Grid. Grid guardava filtros somente em useState; além disso `key=source.scope` muda no authzEpoch/renewal. Existe **segunda desmontagem ancestral**: B2BRouteGuard/AuthzEpochBoundary oculta/remonta todo layout por pausa/época. Portanto memória somente dentro do layout não cobriria a sessão real.

## Patch
- `src/lib/catalogo/catalogFilterPreferences.ts`: memória volátil de seis filtros allowlisted, geração fence para callbacks antigos; sem dados, drawer, capability, lease, storage, token ou query cache.
- `src/components/guards/B2BRouteGuard.tsx`: memória acima da boundary existente, sem manter conteúdo montado; limpa por ator/tenant/parceiro/role/rota, inclusive A→B→A enquanto pausado.
- `src/pages/portal-parceiro/PortalParceiroLayout.tsx`: consome memória do guard (fallback local para montagens existentes), mantém todos retornos/guards/entitlements; key distingue identidade e parceiro.
- `src/components/catalogo/OwnerCatalog.tsx` e `CatalogoCardsGrid.tsx`: binding opcional das preferências, preservando leitores e reset de filtros. Drawers/paginação/rows continuam descartados no unmount. Consumidores sem binding preservam comportamento anterior.
- `src/test/catalogo/ownerCatalogFilters.session.test.tsx`: Layout+Owner+Grid e B2BRouteGuard reais; Auth/transporte/boundary sintéticos reproduzem pause/epoch. Nenhuma sessão teste4 tocada.

## Reversão segura
Reverter somente esses cinco arquivos runtime para baseline e remover helper/teste se necessário. Resultado perde preferências novamente, mas continua negando durante pausa/revogação. NÃO reverter SQL/capabilities C2-CAT, reader, leases/monitor, dados, policies, dashboard ou candidatas financeiras. `git` operacional não executado; diff para revisão independente.

## Limites
Validação:12/12 regressões filtros reais montados;43/43 focados runtime (incluindo filtros/famílias/reader/guards),30/30 regressões pacote C2-CAT. Types dos arquivos runtime afetados e pacotes candidatos PASS via tsgo; build automático preview OK. Pedido de tsc coberto pela checagem TypeScript equivalente disponível, não execução manual de tsc/build do projeto. Financeiro33/33 PostgreSQL sintético+32/32Vitest; C2.1 adapters/lifecycle33/33Vitest. Não equivalem a sessão JWT/RLS real.
Sem publicação, hosted SQL, alteração de Auth/monitor/lease/refresh/polling ou sessão/reload. Homologação real dos filtros aguarda publicação pelo auditor; o teste não certifica JWT/RLS. Financeiro/cadastro multiperfil continuam INATIVOS em pacotes separados; capacidade/menu/entitlements financeiros candidatos coordenados, receipts/readers/selector multiperfil ainda requerem evolução server-side completa e revisão.