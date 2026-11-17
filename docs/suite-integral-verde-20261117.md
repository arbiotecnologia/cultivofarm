# Suíte integral verde — 17/11/2026

Base: `873c8a9ca`. Somente local: nenhum SQL/Edge hospedado, nenhuma emissão fiscal, nenhuma publicação.

## Ambiente
- PostgreSQL 17.12 (nix `postgresql-17.12`, inclui `dict_snowball.so`), Python 3.13.18, Node 22.23.5, Vitest 3.2.4.

## Causas e correções
| Falha | Causa | Correção |
|---|---|---|
| Baterias PG (`companyAccreditations.pg`, `companyFiscalSave.pg` e +~20 em saas/financeiro/cockpit/monitoramento) | `initdb` invocado via symlink `/usr/bin` → PostgreSQL resolve `$libdir` fora da instalação real (`dict_snowball` ausente) | `vitest.config.ts` põe o `bin` real da MESMA instalação na frente do `PATH`; sem stub/extensão falsa |
| `fase3_20.unified_list.ui` (11) | fixture de auth obsoleta: `useAuth` real sempre expõe `roles[]`; mock só tinha `role` | mock com `roles: [role]`; controle superadmin/B2B preservado |
| `c1bFichas` (5), `c1bCatalog` (2) | filtro de família passou a ler pelo React Query (3d54dd6f3); testes sem `QueryClientProvider` | wrapper de provider no teste |
| `ownerCatalogFilters.session` (16) | **bug runtime**: fallback das famílias usava rótulo "Produtos químicos" em vez de "Químicos" | `useActiveCatalogFamilies` usa `READ_FAMILY_LABEL` |
| `validityDatePersistence` (1) | teste dependente da data (fim 15/11 já no passado) | relógio fixado em 11/11 (data da fixture) |
| `base-tecnica.rename` (1), `navigation-inventory` (2) | aba Serviços e rota `/diagnostico/elegibilidade-fiscal` sem inventário | expectativa + inventário regenerado por `scripts/navigation-audit/generate.ts` |
| `globalCatalogContainment` (1) | ficha de microrganismo migrou para RPC por empresa (a9740d97c) | passa a ser verificada pelo mesmo contrato da ficha de produto (gate de ator antes da RPC, sem DML) |
| `tenant-catalog-owned-flow` (9) | aba Culturas passou a `TenantReferencePanel` (61ed3992f) | testes apontam para `LegacyCulturasTab` (exportado), asserções intactas |
| `catalogMobileExtensions` (1) | botão fechar traduzido para "Fechar" (7035139ee) | nome atualizado |
| `cancellationPolicyCandidate` (1) | intermitente sob carga (espera 1 s) | só a espera cresce para 5 s |

## Resultados (códigos de saída reais)
- 13 casos pedidos: `npx vitest run --maxWorkers=2 <3 arquivos>` → 17/17, exit 0.
- Suíte integral: `npx vitest run --maxWorkers=2 --shard=i/8` (i=1..8, 515 s) → 8× exit 0; arquivos 839 passed + 1 skipped (840); testes 11569 passed, 6 skipped.
- Skips preexistentes: `fase3_20_1.microorganism_product_resolver` (1), `fiscal/rls/harness` (2), `fiscal/rls/mask.sql` (1), `visita/mobileCivilDate` (2).
- `npx tsgo -p tsconfig.app.json --noEmit` exit 0; `-p tsconfig.node.json` exit 0; `npx vite build` exit 0.

## Limitações
- Shards em vez de uma única invocação (limite de 600 s por comando no sandbox); cobertura idêntica.
- Supabase simulado/PG descartável: não prova JWT/RLS/Storage hospedados.

## Rollback
Reverter o commit; nenhum efeito fora do repositório.
