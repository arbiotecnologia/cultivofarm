# Integração LOCAL exata — 03/11/2026

**INTEGRADO LOCALMENTE / RELEASE NO-GO.** Sem SQL hosted, publicação, implantação Edge, envio SMTP, emissão fiscal ou cobranças.

## Origem e base

- Original: `a79bb3db-f665-466d-bf41-ee8c6cb91fab`, base funcional `9d3a9424d708f6daebfb67b969696db2d1b7e0d0`.
- Snapshot isolado: `aec6d152-e409-44bf-9cb3-10da72365572`, commit `75972877fb380b02bfb11088bd93df08e9bd19a4`.
- Export: `scripts/original-integration-20261102/export/` (bytes exatos; não regenerado).
- Manifest SHA256 `b7492bb44b5e118371f22ec80e40e7238c75dd4ce66d192fd42decbc66de6370`.
- Script SHA256 `7f51953cb5845c620ada557c6a01371ea2017dcabeac13ad7e0430858f622c93`.
- `050e8bb` no campo `summary.base_commit` é a base de comparação do remix, **não** a base original de aplicação.
- O ambiente registra revisões automaticamente entre ferramentas; o primeiro PRE registrou `original_base_mismatch` após criar documentação/verificador. A diferença contra a base continha somente estes arquivos próprios e roadmap. O verificador passou a aceitar exclusivamente esses três caminhos documentais, com ancestralidade e todos os destinos pinados; não relaxou nenhum hash de pacote.
- Revisão original observada após integração e testes: `f8ccde40614c2a43c9d1d5cc68d247134ba2e715`; o registro final é administrado pelo ambiente, não criado manualmente pelo agente.

## Verificações e cópia

1. Manifest/script/SHA256SUMS conferidos com os pins informados.
2. Todos os 821 caminhos validados nas duas raízes: sem absoluto, `..`, barra invertida, metadados Git ou symlink. Teste do verificador: 3/3.
3. Fontes/destinos dos 770 arquivos conferidos. `SHA256SUMS` compatível com o manifest. Todos os seis merged (incluindo AGENTS) também examinados para marcador homolog, cobrindo a lacuna do script original.
4. Script **original e inalterado** executado primeiro dry-run: 770 planejados, zero erros; depois `--apply`: POST OK.
5. POST independente: 770 hashes exatos; 31 keep_original +20 never_integrate (incluindo ausências) iguais ao PRE. Nenhuma migration copiada para `supabase/migrations/`.
6. Nenhum marcador do ref homolog em `src/` ou `index.html`. Binding/client/featureFlags/fiscalBinding do original intactos. `fiscalEmissionEnabled`, `saasPaymentsOperational` e `OWNED_PRODUCT_FISCAL_ENABLED` continuam false. Configuração preexistente solo/kg/mL não alterada; o formulário novo ProdutosEmpresa não acrescenta seleção de unidade.

Fusões revisadas: AGENTS, monitor catálogo (preserva sonda journal/abortSignal + acrescenta sonda de condição), ownedProductFiscal (ACK apenas DRAFT/BLOCKED e timestamp estrito), useProductFiscalProfiles, FiscalProdutos, teste fiscal da tela. Nenhuma correção extra foi feita nesses bytes.

**Risco de escopo:** o export também inclui consumidores comerciais/financeiros e pacotes financeiros/SQL/homolog históricos, não só catálogo. Foram copiados porque pertencem ao manifest exato, não executados nem promovidos. Arquivos homolog-only em scripts/documentação permanecem material de auditoria; não são runtime nem autorização de aplicação. O pacote global fiscal antigo foi preservado por keep_original, mas não aplicado e não é roteiro vigente.

## Resultados reais

| Bateria | Arquivos | Testes | Resultado |
|---|---:|---:|---|
| Baseline catálogo original | 51 | 1019 | PASS |
| Consumidores alterados/adicionados, sem subprocessos PG | 55 | 742 | PASS |
| Entrega/envase/etiquetas/estoque, inclusive retenção send | 50 | 720 | PASS |
| PG descartável parte1, pool forks | 3 | 3 | PASS |
| PG descartável parte2, pool forks | 3 | 3 | PASS |

**União sem dupla contagem: 159 arquivos, 2450 testes Vitest únicos** (`tested-files.json`). Os valores das baterias não devem ser somados porque há sobreposição. Não é a suíte completa do projeto. Typecheck separado `tsgo --noEmit -p tsconfig.app.json`: exit0. Build validado pelo harness automático: OK, capturado em `automatic-build.log.txt`; não executado manualmente.

Primeira parte PG no pool padrão: três testes passaram, mas o executor terminou exit1 por `[vitest-worker]: Timeout calling "onTaskUpdate"`. **Não contado como bateria verde**; log mantido. Os testes chamam `execFileSync`, que bloqueia o worker; hipótese de comunicação do executor foi testada usando `--pool=forks`, sem alterar testes, mocks, timeouts ou contratos, e ambas as partes passaram. Isso não prova causa única nem estabilidade de paralelismo máximo. Warnings React act/Radix/Router são preservados, não ocultados.

## Comandos reproduzíveis (raiz do original)

```sh
bun run test -- $(cat scripts/catalog-exclusive-tenant-reconciliation-20261102/evidence/monitor-fix/baseline-files.txt) --maxWorkers=2 --minWorkers=1
bun run test -- $(cat scripts/catalog-exclusive-tenant-reconciliation-20261102/integration-75972877/integrated-consumer-files.txt) --maxWorkers=2 --minWorkers=1
bun run test -- $(cat scripts/stock-caller-contract-update-20261031/evidence/regression-files.txt) --maxWorkers=2 --minWorkers=1
bun run test -- src/test/financeiro/financialProvenanceOffline.test.ts src/test/monitoramento/agronomicOriginPostgres.test.ts src/test/saas/c2-orders-origin-composition-postgres.test.ts --maxWorkers=2 --minWorkers=1 --pool=forks
bun run test -- src/test/financeiro/cancelAuthorizationPostgres.test.ts src/test/saas/c2-final-integrated-manual-postgres.test.ts src/test/saas/c2-order-concurrency-postgres.test.ts --maxWorkers=2 --minWorkers=1 --pool=forks
tsgo --noEmit -p tsconfig.app.json
```

## Evidências e limites

- PRE/dry-run/apply/POST, pins de origem, todos os logs e hashes nesta pasta; diff separado entre base original e os 770 caminhos do pacote.
- `git diff --check` de src/Edge: exit0. Diff completo aponta espaços em evidências/pins históricos; preservados byte a byte, **não limpados para verde**. Log bruto foi dividido em seis partes contíguas de menos de2MB por limite de arquivo do repositório; concatenação recompõe exatamente10498814bytes.
- Os logs `.log.txt` não estão ignorados. A revisão final automática e o manifest desta pasta registram o conteúdo entregue; nenhum comando git add/commit foi utilizado.
- Nenhuma conexão com banco hospedado foi executada. Cron/gates SMTP/fiscal server-side informados pelo auditor não foram reverificados; nada os alterou nesta integração.
- Nenhum teste autenticado real, browser real, JWT/RLS/Storage hospedado ou POST de produção executado. Produção catálogo aguarda auditor/JWT e POST; **não publicar antes deles**. Nenhuma propriedade foi atribuída arbitrariamente aos13produtos/25microrganismos.