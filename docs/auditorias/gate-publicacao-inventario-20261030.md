# Gate de publicação — relatório somente leitura

Capturado em 2026-10-30T00:48:04.082418+00:00.

- Referência documentada como publicada: `7c38bc4887e86efaca4dd6a820da2c9d8247a89d`.
- HEAD inspecionado: `4acf7dfe7147c34c5eaa435bc539e2c0a13e3fac`.
- Referência existe e é ancestral de HEAD; árvore de trabalho e índice limpos na captura.
- Nenhuma publicação, reversão, edição de projeto, acesso a banco ou execução de candidato nesta rodada.

## Decisão do gate

**Não considerar a publicação de HEAD como publicação isolada do texto da carteira.** O intervalo contém 26 arquivos de aplicação `src`, dois arquivos de dependências e centenas de artefatos de revisão. A publicação normal de HEAD levaria também as mudanças funcionais de entrega, reconciliação financeira, sincronização offline, campo/monitoramento, planejamento e seleção de portal. A homologação integral dessas mudanças não foi comprovada nesta auditoria read-only. Gate para “somente texto” permanece **NÃO ATENDIDO**; nenhum arquivo foi revertido ou selecionado para implantação.

A ausência de alterações SQL hosted neste intervalo não significa ausência de mudanças funcionais no frontend. Não há diferenças em `public/`, `vite.config.ts`, `supabase/migrations/`, `supabase/functions/`, `index.html` ou cliente canônico Supabase. Scripts candidatos não são migrations e não se aplicam apenas por publicação do frontend. Não certificamos pipelines externos não inspecionados.

## Marcador efetivamente servido

GET público sem autenticação, Cache-Control no-cache, HTTP 200:
- `https://app.cultivofarm.com.br/`: meta `cultivo-build-id=build-mvqwpqek`; entrada `/assets/index-jwJ_l9D2.js`.
- `https://cultivofarm.lovable.app` redireciona para o domínio acima e apresenta os mesmos marcadores.

**Não há SHA publicado confiável demonstrado pela página.** `vite.config.ts` aceita identificadores das variáveis LOVABLE_DEPLOY_SHA, VERCEL_GIT_COMMIT_SHA, GITHUB_SHA, SOURCE_VERSION ou COMMIT_SHA; na ausência usa `build-<timestamp>`. O valor servido é esse fallback, não um SHA Git. O nome do bundle identifica o artefato, mas não demonstra o commit sem uma associação verificável de implantação. Assim, `7c38bc4887e86efaca4dd6a820da2c9d8247a89d` é referência documentada fornecida, não SHA efetivamente publicado confirmado nesta rodada. A comparação é verificável entre commits; não garante equivalência entre referência e produção atual.

## Separação dos arquivos

- Runtime e dependências: **28** arquivos.
- Testes: **33** arquivos.
- Scripts e candidatos de revisão: **345** arquivos.
- Documentos, planos, evidências e regras: **358** arquivos.

### Runtime e dependências — nomes completos

- `bun.lock`
- `package.json`
- `src/components/comercial/CommercialOwnerOrdersSection.tsx`
- `src/components/comercial/ResponderCotacaoDialog.tsx`
- `src/components/comercial/creditBlockReason.ts`
- `src/components/entregas/ConfirmarEntregaDialog.tsx`
- `src/components/financeiro/ConfirmarEntregaFinanceiroDialog.tsx`
- `src/components/visita/OrigemAlertaAgronomico.tsx`
- `src/components/visita/PlanoMonitoramentoEditor.tsx`
- `src/hooks/useDeliveryFinanceReconciliation.ts`
- `src/hooks/useEsteiraLaboratorio.ts`
- `src/hooks/useOfflineSync.ts`
- `src/hooks/useOrigemAlertaAgronomico.ts`
- `src/hooks/useProductionPlanning.ts`
- `src/hooks/useReprogramarMonitoramento.ts`
- `src/hooks/useSalvarPlanoMonitoramento.ts`
- `src/integrations/supabase/types.ts`
- `src/lib/catalogo/platformCatalogLabels.ts`
- `src/lib/comercial/commercialOwnerOrders.ts`
- `src/lib/entregas/payloadEntrega.ts`
- `src/lib/offlineDb.ts`
- `src/lib/visita/campoContract.ts`
- `src/lib/visita/visitaErrorMessages.ts`
- `src/pages/Entregas.tsx`
- `src/pages/MonitoramentoAlertas.tsx`
- `src/pages/SelecionarPortal.tsx`
- `src/pages/app/wizard/WizardCampoStep.tsx`
- `src/pages/app/wizard/WizardRevisaoStep.tsx`

### Alterações funcionais e pendências relevantes

| Recorte | Delta concreto | Gate ainda necessário |
|---|---|---|
| Carteira/cotação | Deduplicação com estados distintos; motivo `credit_block_reason` em resposta de cotação | Carteira: 37 testes isolados/build OK na rodada anterior, sem navegador autenticado pós-patch pelo assistente. Motivo depende de resposta real do servidor; não libera crédito. |
| Entrega | `Entregas.tsx`, diálogo e payload: locks/fences, confirmação/ACK e incerteza após timeout; usa item UUID retornado pela reserva | Homologação real de parcial/timeout/revogação/resposta incerta e compatibilidade dos ACKs remotos. Não prova fechamento do ledger/estoque. |
| Financeiro da entrega | Diálogo substitui despacho financeiro por reconciliação/consulta escopada em hook dedicado; contenção de novos títulos/fiscal | A2, valor, fiscal/contabilidade e composição seguem gates próprios não certificados; conferir títulos existentes e erros em sessão real. Não é autorização para cobrança. |
| Offline/campo | `offlineDb`, `useOfflineSync`, wizard e contratos de campo mudam persistência/sincronização e pré-requisitos | Compatibilidade dos rascunhos, conflitos/replay e recuperação reais não homologados por esta comparação. Não inferir motor financeiro novo no offline. |
| Monitoramento/agronomia | Origem de alerta, plano e reprogramação, erros/CAS e filas | Validar contratos instalados e observações/revisões reais, sem retries ou falso sucesso. |
| Produção/laboratório | `useProductionPlanning`, `useEsteiraLaboratorio` alteram publicação e releitura/contratos | Compatibilidade e autoridade remota não provadas aqui. |
| Portal/catálogo/tipos | Seleção de portal, classificação de conflito de rótulos e tipos Supabase | Revisão dos fluxos e contratos reais; atualização de tipos não altera schema. |
| Dependências | DevDependencies novas: bridge `^1.0.2` (lock 1.3.3), hmr-gate `^1.8.0` (lock 1.8.2) | Mudanças adicionais à referência; Vite config sem delta e não importe esses plugins nesta configuração inspecionada. |

Essas pendências indicam falta de certificação nesta auditoria, não uma alegação de que todos os deltas são defeitos. Testes sintéticos anteriores não substituem JWT/RLS ou E2E reais. Créditos, Price/shared/clientlink e candidatas de implantação continuam separados e não liberados por esse patch.

## git diff --stat — runtime/dependências (regras excluídas)

```text
 bun.lock                                           |   6 +
 package.json                                       |   2 +
 .../comercial/CommercialOwnerOrdersSection.tsx     |  14 +-
 .../comercial/ResponderCotacaoDialog.tsx           |   5 +-
 src/components/comercial/creditBlockReason.ts      |  16 ++
 src/components/entregas/ConfirmarEntregaDialog.tsx |  72 ++++-
 .../ConfirmarEntregaFinanceiroDialog.tsx           | 165 +++++------
 src/components/visita/OrigemAlertaAgronomico.tsx   |  95 ++++++
 src/components/visita/PlanoMonitoramentoEditor.tsx |   2 +
 src/hooks/useDeliveryFinanceReconciliation.ts      |  98 +++++++
 src/hooks/useEsteiraLaboratorio.ts                 |  20 +-
 src/hooks/useOfflineSync.ts                        |  69 +++--
 src/hooks/useOrigemAlertaAgronomico.ts             |  98 +++++++
 src/hooks/useProductionPlanning.ts                 |  40 ++-
 src/hooks/useReprogramarMonitoramento.ts           |  72 +++--
 src/hooks/useSalvarPlanoMonitoramento.ts           |   1 +
 src/integrations/supabase/types.ts                 |  24 ++
 src/lib/catalogo/platformCatalogLabels.ts          |   6 +-
 src/lib/comercial/commercialOwnerOrders.ts         |  10 +
 src/lib/entregas/payloadEntrega.ts                 |  16 +-
 src/lib/offlineDb.ts                               | 115 ++++++--
 src/lib/visita/campoContract.ts                    |  67 +++++
 src/lib/visita/visitaErrorMessages.ts              |   2 +
 src/pages/Entregas.tsx                             | 241 ++++++++++------
 src/pages/MonitoramentoAlertas.tsx                 |  36 ++-
 src/pages/SelecionarPortal.tsx                     |  29 +-
 src/pages/app/wizard/WizardCampoStep.tsx           | 319 +++++++++++++++++----
 src/pages/app/wizard/WizardRevisaoStep.tsx         | 138 +++++++--
 28 files changed, 1384 insertions(+), 394 deletions(-)
```

## git diff --stat — intervalo completo

```text
 .lovable/plan.md                                                                                                  |     32 +
 .lovable/plan/auditoria-do-fluxo-de-pedido-b2b-catálogo-fiscal-2026-10-27.md                                      |     26 +
 .lovable/plan/fluxo-do-pedido-b2b-do-parceiro-à-emissão-fiscal-2026-10-27.md                                      |     73 +
 .lovable/plan/plano-de-correção-do-fluxo-de-pedido-b2b-2026-10-27.md                                              |     59 +
 .lovable/plan/plano-de-correção-do-fluxo-de-pedido-b2b-por-etapas-2026-10-27.md                                   |    256 +
 AGENTS.md                                                                                                         |     20 +
 bun.lock                                                                                                          |      6 +
 docs/auditorias/arbio-fsf-politica-draft-20261028.md                                                              |     97 +
 docs/auditorias/arbio-fsf-politica-superveniente-20261028.md                                                      |     37 +
 docs/auditorias/auditoria-final-fluxo-b2b-20261028.md                                                             |     96 +
 docs/auditorias/bateria-financeira-b2b-20261028.md                                                                |     93 +
 docs/auditorias/cadastro-financeiro-diferido-offline-20261029.md                                                  |     54 +
 docs/auditorias/cadeia-financeira-offline-20261029.md                                                             |    163 +
 docs/auditorias/cancelamento-parcela-autorizacao-20261029.md                                                      |    150 +
 docs/auditorias/carteira-empresa-owner-read-20261030.md                                                           |    102 +
 docs/auditorias/consumidor-real-entrega-20261028.md                                                               |     61 +
 docs/auditorias/escritores-saldo-canonico-20261028.md                                                             |    103 +
 docs/auditorias/etapa6-consumidor-financeiro-20261028.md                                                          |     59 +
 docs/auditorias/etapas5-6-contratos-os-entrega-estoque-20261028.md                                                |     67 +
 docs/auditorias/evidencias-arbio-fsf-20261028/execucao.json                                                       |     20 +
 docs/auditorias/evidencias-arbio-fsf-20261028/matriz.csv                                                          |     36 +
 docs/auditorias/evidencias-arbio-fsf-20261028/resultados-pg.json                                                  |    308 +
 docs/auditorias/evidencias-arbio-fsf-20261028/resumo.json                                                         |     12 +
 docs/auditorias/evidencias-arbio-fsf-definitiva-20261028/execucao.json                                            |     13 +
 docs/auditorias/evidencias-arbio-fsf-definitiva-20261028/matriz.csv                                               |     64 +
 docs/auditorias/evidencias-arbio-fsf-definitiva-20261028/resultados.json                                          |    569 +
 docs/auditorias/evidencias-arbio-fsf-override-20261028/execucao.json                                              |     13 +
 docs/auditorias/evidencias-arbio-fsf-override-20261028/matriz.csv                                                 |     59 +
 docs/auditorias/evidencias-arbio-fsf-override-20261028/resultados.json                                            |    524 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/SHA256SUMS                                                  |     16 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1428/SHA256SUMS               |     13 +
 .../evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1428/failed-intermediate-run.txt          |     14 +
 .../evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1428/historical-hash-verification.json    |    236 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1428/independent-review.md    |      3 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1428/matrix.csv               |    192 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1428/pg-run.txt               |      1 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1428/results.json             |   1994 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1428/rpc-captured.txt         |     57 +
 .../evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1428/rpc-offline-transformation.diff      |     42 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1428/vitest-run.txt           |     15 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1450/SHA256SUMS               |     33 +
 .../cancel-authorization-revision-1450/cancel-authorization-revision-final/matrix.csv                             |    266 +
 .../cancel-authorization-revision-1450/cancel-authorization-revision-final/results.json                           |   2820 +
 .../cancel-authorization-revision-1450/cancel-authorization-revision-final/rpc-captured.txt                       |     57 +
 .../cancel-authorization-revision-1450/cancel-authorization-revision-final/rpc-offline-transformation.diff        |     42 +
 .../cancel-authorization-revision-1450/cancel-authorization-revision-risk/matrix.csv                              |    233 +
 .../cancel-authorization-revision-1450/cancel-authorization-revision-risk/results.json                            |   2569 +
 .../cancel-authorization-revision-1450/cancel-authorization-revision-risk/rpc-captured.txt                        |     57 +
 .../cancel-authorization-revision-1450/cancel-authorization-revision-risk/rpc-offline-transformation.diff         |     42 +
 .../evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1450/historical-hashes-after.json         |    392 +
 .../evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1450/historical-hashes-before.json        |    275 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1450/independent-review.md    |      7 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1450/monetary/red-green.json  |    305 +
 .../evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1450/provenance-final/provenance.json     |    487 +
 .../evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1450/provenance/provenance.json           |    461 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1458/SHA256SUMS               |     15 +
 .../auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1458/historical-integrity.json |    308 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1458/independent-review.md    |      1 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1458/matrix.csv               |    349 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1458/null-kind-only.diff      |     11 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1458/results.json             |   3658 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1458/rpc-captured.txt         |     57 +
 .../evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1458/rpc-offline-transformation.diff      |     46 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1503/SHA256SUMS               |     36 +
 .../authorization-cancel-authorization-revision-1503/deferred-settings-sandbox.diff                               |    192 +
 .../cancel-authorization-revision-1503/authorization-cancel-authorization-revision-1503/null-kind-only.diff       |     11 +
 .../cancel-authorization-revision-1503/authorization-cancel-authorization-revision-1503/rpc-captured.txt          |     57 +
 .../authorization-cancel-authorization-revision-1503/rpc-offline-transformation.diff                              |     46 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1503/consumer-proposal.md     |      1 +
 .../cancel-authorization-revision-1503/final-cancel-authorization-revision-1503/deferred-settings-sandbox.diff    |    192 +
 .../cancel-authorization-revision-1503/final-cancel-authorization-revision-1503/matrix.csv                        |    654 +
 .../cancel-authorization-revision-1503/final-cancel-authorization-revision-1503/null-kind-only.diff               |     11 +
 .../cancel-authorization-revision-1503/final-cancel-authorization-revision-1503/results.json                      |   6283 ++
 .../cancel-authorization-revision-1503/final-cancel-authorization-revision-1503/rpc-captured.txt                  |     57 +
 .../cancel-authorization-revision-1503/final-cancel-authorization-revision-1503/rpc-offline-transformation.diff   |     46 +
 .../evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1503/historical-integrity-after.json      |    611 +
 .../evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1503/historical-integrity-before.json     |    611 +
 .../evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1503/historical-preservation.json         |     26 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1503/monetary/red-green.json  |    305 +
 .../evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1503/provenance/provenance.json           |    487 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1503/source-hashes.json       |      5 +
 .../cancel-authorization-revision-1536-git-supplement-1558/SHA256SUMS.versioned                                   |     30 +
 .../cancel-authorization-revision-1536-git-supplement-1558/check-git-tree.py                                      |     26 +
 .../cancel-authorization-revision-1536-git-supplement-1558/source-manifest-reconciliation.json                    |    222 +
 .../cancel-authorization-revision-1536-git-supplement-1558/transcripts/attempt1.txt                               |      1 +
 .../cancel-authorization-revision-1536-git-supplement-1558/transcripts/attempt10.txt                              |      1 +
 .../cancel-authorization-revision-1536-git-supplement-1558/transcripts/attempt11.txt                              |      1 +
 .../cancel-authorization-revision-1536-git-supplement-1558/transcripts/attempt2.txt                               |     14 +
 .../cancel-authorization-revision-1536-git-supplement-1558/transcripts/attempt3.txt                               |     17 +
 .../cancel-authorization-revision-1536-git-supplement-1558/transcripts/attempt4.txt                               |     14 +
 .../cancel-authorization-revision-1536-git-supplement-1558/transcripts/attempt5.txt                               |     15 +
 .../cancel-authorization-revision-1536-git-supplement-1558/transcripts/attempt6.txt                               |     16 +
 .../cancel-authorization-revision-1536-git-supplement-1558/transcripts/attempt7.txt                               |      1 +
 .../cancel-authorization-revision-1536-git-supplement-1558/transcripts/attempt8.txt                               |      1 +
 .../cancel-authorization-revision-1536-git-supplement-1558/transcripts/attempt9.txt                               |      1 +
 .../cancel-authorization-revision-1536-git-supplement-1558/transcripts/monetary.txt                               |      1 +
 .../cancel-authorization-revision-1536-git-supplement-1558/transcripts/postgres.txt                               |      1 +
 .../cancel-authorization-revision-1536-git-supplement-1558/transcripts/provenance.txt                             |      1 +
 .../cancel-authorization-revision-1536-git-supplement-1558/transcripts/vitest-final.txt                           |     16 +
 .../cancel-authorization-revision-1536-git-supplement-1558/transcripts/vitest-intermediate1.txt                   |     40 +
 .../cancel-authorization-revision-1536-git-supplement-1558/transcripts/vitest.txt                                 |     37 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1536/SHA256SUMS               |     28 +
 .../cancel-authorization-revision-1536/final-cancel-authorization-revision-1536/deferred-settings-sandbox.diff    |    192 +
 .../cancel-authorization-revision-1536/final-cancel-authorization-revision-1536/matrix.csv                        |    813 +
 .../cancel-authorization-revision-1536/final-cancel-authorization-revision-1536/null-kind-only.diff               |     11 +
 .../cancel-authorization-revision-1536/final-cancel-authorization-revision-1536/parties-credit-captured-impl.txt  |    230 +
 .../cancel-authorization-revision-1536/final-cancel-authorization-revision-1536/parties-credit-sandbox.diff       |     89 +
 .../cancel-authorization-revision-1536/final-cancel-authorization-revision-1536/results.json                      |   7595 ++
 .../cancel-authorization-revision-1536/final-cancel-authorization-revision-1536/rpc-captured.txt                  |     57 +
 .../cancel-authorization-revision-1536/final-cancel-authorization-revision-1536/rpc-offline-transformation.diff   |     46 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1536/history-integrity.json   |    346 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1536/monetary/red-green.json  |    305 +
 .../evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1536/provenance/provenance.json           |    487 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization/SHA256SUMS                             |     10 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization/independent-review.md                  |      9 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization/matrix.csv                             |     58 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization/results.json                           |    662 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization/rpc-captured.txt                       |     57 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization/rpc-offline-transformation.diff        |     36 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/closure.json                                                |  25223 ++++++
 docs/auditorias/evidencias-cadeia-financeira-20261029/consumers-current.json                                      |    155 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/consumers-prior-inventory.json                              |    104 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/dependency-edges.csv                                        |   5827 ++
 docs/auditorias/evidencias-cadeia-financeira-20261029/drift.json                                                  |      4 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/e2e-preflight-evidence-1955/AGENTS.md                       |      4 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/e2e-preflight-evidence-1955/MANIFEST.sha256                 |     10 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/e2e-preflight-evidence-1955/README.md                       |      4 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/e2e-preflight-evidence-1955/ROTEIRO.md                      |     24 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/e2e-preflight-evidence-1955/checklist.json                  |    209 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/e2e-preflight-evidence-1955/evidencia-preflight.schema.md   |     14 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/e2e-preflight-evidence-1955/preflight-sem-evidencia.txt     |      4 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/e2e-preflight-evidence-1955/preflight-tests.txt             |     26 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/e2e-preflight-evidence-1955/preflight.py                    |     91 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/e2e-preflight-evidence-1955/preflight.sh                    |      4 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/e2e-preflight-evidence-1955/test_preflight.py               |     56 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/e2e-preflight-root-type-2000/MANIFEST.sha256                |      4 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/e2e-preflight-root-type-2000/README.md                      |      2 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/e2e-preflight-root-type-2000/preflight-tests.txt            |     28 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/e2e-preflight-root-type-2000/preflight.py                   |     95 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/e2e-preflight-root-type-2000/test_preflight.py              |     63 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/e2e-prep-review-1950/AGENTS.md                              |      4 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/e2e-prep-review-1950/MANIFEST.sha256                        |      8 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/e2e-prep-review-1950/README.md                              |      4 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/e2e-prep-review-1950/ROTEIRO.md                             |     23 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/e2e-prep-review-1950/checklist.json                         |    208 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/e2e-prep-review-1950/preflight-default.txt                  |      7 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/e2e-prep-review-1950/preflight-tests.txt                    |     15 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/e2e-prep-review-1950/preflight.sh                           |     30 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/e2e-prep-review-1950/test_preflight.py                      |     30 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/execution-summary.json                                      |     22 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/incremental-integrated-2110/SHA256SUMS                      |     16 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/incremental-integrated-2110/integrated-results.json         |    382 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/incremental-integrated-2110/red-baseline-self-approval.txt  |      3 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/incremental-prep-2015/AGENTS-budget-supplement.txt          |      2 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/incremental-prep-2015/SHA256SUMS                            |     31 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/incremental-prep-2015/approval-results.json                 |    363 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/incremental-prep-2015/approval-tests.txt                    |     58 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/incremental-prep-2015/client-link-results.json              |    440 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/incremental-prep-2015/client-link-tests.txt                 |     52 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/incremental-prep-2015/p0-red-green-tests.txt                |      1 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/incremental-prep-2015/p0-red-green/red-green.json           |    305 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/incremental-prep-2015/p0-tests.txt                          |     95 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/incremental-prep-2015/p0/execucao.json                      |   1151 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/incremental-prep-2015/p0/matriz.csv                         |    104 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/incremental-prep-2015/preflight-tests.txt                   |      5 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/incremental-prep-2015/price-shared-results.json             |   2526 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/incremental-prep-2015/price-shared-tests.txt                |    339 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/incremental-prep-2015/vitest.txt                            |     13 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/incremental-stack-2028/SHA256SUMS                           |     20 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/incremental-stack-2028/component-results.json               |    363 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/incremental-stack-2028/lexical-closure.json                 |     60 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/incremental-stack-2028/restoration-results.json             |    216 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/incremental-stack-2107/restoration-results.json             |     34 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/independent-review.md                                       |     15 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/matrix.csv                                                  |     45 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/object-pins.csv                                             |    455 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/partner-order-items-owner-read/SHA256SUMS                   |     12 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/partner-order-items-owner-read/results.json                 |    979 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/partner-orders-owner-read/SHA256SUMS                        |     12 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/partner-orders-owner-read/results.json                      |    876 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/payment-method-aliases-homolog-1842/SHA256SUMS              |      4 +
 .../evidencias-cadeia-financeira-20261029/payment-method-aliases-homolog-1842/arbio-fsf-policy.draft.json         |    179 +
 .../payment-method-aliases-homolog-1842/payment-methods-readonly-capture-20261029.json                            |     18 +
 .../payment-method-aliases-homolog-1842/payment-methods-readonly-capture-homolog-20261029.json                    |     48 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/payment-method-aliases-homolog-1842/price-schedule.json     |      1 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/payment-method-boleto-1836/SHA256SUMS                       |      2 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/payment-method-boleto-1836/policy-snapshot.json             |    178 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/payment-method-boleto-1836/price-schedule.json              |      1 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/payment-method-boleto-catalog-1841/SHA256SUMS               |      2 +
 .../payment-method-boleto-catalog-1841/payment-methods-readonly-capture-20261029.json                             |     17 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/payment-method-boleto-catalog-1841/price-schedule.json      |      1 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/price-authority-1753/SHA256SUMS.versioned                   |      9 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/price-authority-1753/check-git-tree.py                      |     26 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/price-authority-1753/check-previous-1749.txt                |      1 +
 .../evidencias-cadeia-financeira-20261029/price-authority-1753/full-term-superseded-override/execucao.json        |     13 +
 .../evidencias-cadeia-financeira-20261029/price-authority-1753/full-term-superseded-override/matriz.csv           |     64 +
 .../evidencias-cadeia-financeira-20261029/price-authority-1753/full-term-superseded-override/resultados.json      |    569 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/price-authority-1753/override-superseded-run.txt            |      1 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/price-authority-1753/price-run.txt                          |      1 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/price-authority-1753/results.json                           |   1627 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/price-authority-1753/vitest-final.txt                       |     18 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/price-calendar-1800/SHA256SUMS.versioned                    |      9 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/price-calendar-1800/check-git-tree.py                       |     26 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/price-calendar-1800/check-previous-1753-vs-72c6c72.txt      |      1 +
 .../evidencias-cadeia-financeira-20261029/price-calendar-1800/full-term-superseded-override/execucao.json         |     13 +
 .../auditorias/evidencias-cadeia-financeira-20261029/price-calendar-1800/full-term-superseded-override/matriz.csv |     64 +
 .../evidencias-cadeia-financeira-20261029/price-calendar-1800/full-term-superseded-override/resultados.json       |    569 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/price-calendar-1800/override-superseded-run.txt             |      1 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/price-calendar-1800/price-run.txt                           |      1 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/price-calendar-1800/results.json                            |   1922 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/price-calendar-1800/vitest-final.txt                        |     17 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/price-calendar-paracatu-1810/SHA256SUMS.versioned           |      6 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/price-calendar-paracatu-1810/historical-superseded.txt      |      1 +
 .../evidencias-cadeia-financeira-20261029/price-calendar-paracatu-1810/paracatu-mg-2026.dataset-copy.json         |    207 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/price-calendar-paracatu-1810/price-results.json             |   2191 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/price-calendar-paracatu-1810/price-summary.txt              |      1 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/price-calendar-paracatu-1810/vitest-isolated-rerun.txt      |    862 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/price-calendar-paracatu-1810/vitest.txt                     |   3901 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/price-calendar-paracatu-2027-1825/SHA256SUMS.versioned      |      6 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/price-calendar-paracatu-2027-1825/build-script-copy.py.txt  |     52 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/price-calendar-paracatu-2027-1825/historical-superseded.txt |      1 +
 .../price-calendar-paracatu-2027-1825/paracatu-mg-2026-2027.dataset-copy.json                                     |    368 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/price-calendar-paracatu-2027-1825/price-results.json        |   2579 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/price-calendar-paracatu-2027-1825/price-summary.txt         |      1 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/price-calendar-paracatu-2027-1825/vitest-price.txt          |     11 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/price-generator-pg-1840/SHA256SUMS.versioned                |      3 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/price-generator-pg-1840/price-generator.sql.review.copy.txt |    277 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/price-generator-pg-1840/results.json                        |   1383 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/price-generator-pg-1840/run.txt                             |    190 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/price-generator-pg-canonical-exposure-1849/SHA256SUMS       |      6 +
 .../price-generator-pg-canonical-exposure-1849/candidate.sql.review.snapshot                                      |    342 +
 .../price-generator-pg-canonical-exposure-1849/homolog-reference-readonly-20261029.txt                            |      6 +
 .../price-generator-pg-canonical-exposure-1849/original-p0-red-green.run.txt                                      |      1 +
 .../price-generator-pg-canonical-exposure-1849/original-p0-red-green/red-green.json                               |    305 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/price-generator-pg-canonical-exposure-1849/pg-run.txt       |    242 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/price-generator-pg-canonical-exposure-1849/results.json     |   1780 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/price-generator-pg-partner-context-1855/SHA256SUMS          |      6 +
 .../evidencias-cadeia-financeira-20261029/price-generator-pg-partner-context-1855/candidate.sql.review.snapshot   |    384 +
 .../evidencias-cadeia-financeira-20261029/price-generator-pg-partner-context-1855/original-p0-red-green.run.txt   |      1 +
 .../price-generator-pg-partner-context-1855/original-p0-red-green/red-green.json                                  |    305 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/price-generator-pg-partner-context-1855/pg-run.txt          |    257 +
 .../price-generator-pg-partner-context-1855/production-readonly-and-authorization-20261029.txt                    |      6 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/price-generator-pg-partner-context-1855/results.json        |   1897 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/price-generator-pg-replay-reauth-1843/SHA256SUMS            |      5 +
 .../evidencias-cadeia-financeira-20261029/price-generator-pg-replay-reauth-1843/candidate.sql.review.snapshot     |    304 +
 .../evidencias-cadeia-financeira-20261029/price-generator-pg-replay-reauth-1843/original-p0-red-green.run.txt     |      1 +
 .../price-generator-pg-replay-reauth-1843/original-p0-red-green/red-green.json                                    |    305 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/price-generator-pg-replay-reauth-1843/pg-run.txt            |    222 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/price-generator-pg-replay-reauth-1843/results.json          |   1625 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/price-generator-pg-review-1845/SHA256SUMS                   |      5 +
 .../auditorias/evidencias-cadeia-financeira-20261029/price-generator-pg-review-1845/candidate.sql.review.snapshot |    296 +
 .../auditorias/evidencias-cadeia-financeira-20261029/price-generator-pg-review-1845/original-p0-red-green.run.txt |      1 +
 .../evidencias-cadeia-financeira-20261029/price-generator-pg-review-1845/original-p0-red-green/red-green.json     |    305 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/price-generator-pg-review-1845/pg-run.txt                   |    218 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/price-generator-pg-review-1845/results.json                 |   1594 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/price-schedule-1741/SHA256SUMS.versioned                    |      4 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/price-schedule-1741/check-git-tree.py                       |     26 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/price-schedule-1741/price-run.txt                           |      1 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/price-schedule-1741/results.json                            |   1109 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/price-schedule-1741/vitest-final.txt                        |     18 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/price-schedule-1749/SHA256SUMS.versioned                    |      5 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/price-schedule-1749/check-git-tree.py                       |     26 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/price-schedule-1749/check-previous-1741-vs-69acee5.txt      |      1 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/price-schedule-1749/price-run.txt                           |      1 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/price-schedule-1749/results.json                            |   1512 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/price-schedule-1749/vitest-final.txt                        |     19 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/red-green.json                                              |    305 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/replay-rowlock-ui-1935/MANIFEST.sha256                      |      6 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/replay-rowlock-ui-1935/README.md                            |      5 +
 .../evidencias-cadeia-financeira-20261029/replay-rowlock-ui-1935/link-partner-client.sql.review.snapshot          |    173 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/replay-rowlock-ui-1935/pg-run.txt                           |     52 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/replay-rowlock-ui-1935/red-previous-candidate.txt           |     52 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/replay-rowlock-ui-1935/results.json                         |    440 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/replay-rowlock-ui-1935/vitest.txt                           |     12 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/review-fixes-1925/SHA256SUMS                                |     12 +
 .../evidencias-cadeia-financeira-20261029/review-fixes-1925/fsf-link-new-tests-vs-previous-candidate.txt          |     45 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/review-fixes-1925/fsf-link-pg-run.txt                       |     49 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/review-fixes-1925/fsf-link-results.json                     |    416 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/review-fixes-1925/link-partner-client.sql.review.snapshot   |    167 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/review-fixes-1925/original-p0-red-green.run.txt             |      1 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/review-fixes-1925/original-p0-red-green/red-green.json      |    305 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/review-fixes-1925/price-and-shared-guard-pg-run.txt         |    323 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/review-fixes-1925/price-and-shared-guard-results.json       |   2399 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/review-fixes-1925/real-reference-confirmed.txt              |      7 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/review-fixes-1925/shared-credit-guard.sql.review.snapshot   |    220 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/review-fixes-1925/verify-manifest-1905.txt                  |      1 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/review-fixes-1925/vitest-credit-block-reason.txt            |     10 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/shared-credit-fsf-link-1905/SHA256SUMS                      |     10 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/shared-credit-fsf-link-1905/fsf-link-pg-run.txt             |     34 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/shared-credit-fsf-link-1905/fsf-link-results.json           |    299 +
 .../evidencias-cadeia-financeira-20261029/shared-credit-fsf-link-1905/link-partner-client.sql.review.snapshot     |    136 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/shared-credit-fsf-link-1905/original-p0-red-green.run.txt   |      1 +
 .../evidencias-cadeia-financeira-20261029/shared-credit-fsf-link-1905/original-p0-red-green/red-green.json        |    305 +
 .../evidencias-cadeia-financeira-20261029/shared-credit-fsf-link-1905/price-and-shared-guard-pg-run.txt           |    301 +
 .../evidencias-cadeia-financeira-20261029/shared-credit-fsf-link-1905/price-and-shared-guard-results.json         |   2236 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/shared-credit-fsf-link-1905/real-reference-vs-fixture.txt   |     13 +
 .../evidencias-cadeia-financeira-20261029/shared-credit-fsf-link-1905/shared-credit-guard.sql.review.snapshot     |    166 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/shared-credit-fsf-link-1905/verify-manifest-1855.txt        |      1 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/trigger-columns-e2e-prep-1945/MANIFEST.sha256               |     10 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/trigger-columns-e2e-prep-1945/README.md                     |     20 +
 .../trigger-columns-e2e-prep-1945/credit-guard-trigger-columns.rollback.sql.review                                |      3 +
 .../evidencias-cadeia-financeira-20261029/trigger-columns-e2e-prep-1945/credit-guard-trigger-columns.sql.review   |      9 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/trigger-columns-e2e-prep-1945/inventory.json                |    195 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/trigger-columns-e2e-prep-1945/p0-red-green.txt              |      1 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/trigger-columns-e2e-prep-1945/pg-run.txt                    |    339 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/trigger-columns-e2e-prep-1945/preflight.txt                 |     11 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/trigger-columns-e2e-prep-1945/results.json                  |   2526 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/trigger-columns-e2e-prep-1945/trigger_columns_tests.py      |     74 +
 docs/auditorias/evidencias-cadeia-financeira-20261029/trigger-columns-e2e-prep-1945/vitest.txt                    |     12 +
 docs/auditorias/evidencias-consumidor-entrega-20261028/baseline.txt                                               |    325 +
 docs/auditorias/evidencias-consumidor-entrega-20261028/vitest.txt                                                 |    337 +
 docs/auditorias/evidencias-escritores-saldo-20261028/SHA256SUMS                                                   |     12 +
 docs/auditorias/evidencias-escritores-saldo-20261028/execucao.json                                                |   1601 +
 docs/auditorias/evidencias-escritores-saldo-20261028/matriz-consumidores-runtime.csv                              |     18 +
 docs/auditorias/evidencias-escritores-saldo-20261028/matriz-escritores-leitores-sql.csv                           |    106 +
 docs/auditorias/evidencias-escritores-saldo-20261028/matriz.csv                                                   |    149 +
 docs/auditorias/evidencias-escritores-saldo-20261028/pinos-drift.json                                             |    464 +
 docs/auditorias/evidencias-financeiro-b2b-20261028/execucao.json                                                  |     30 +
 docs/auditorias/evidencias-financeiro-b2b-20261028/fixtures-decimal.json                                          |    307 +
 docs/auditorias/evidencias-financeiro-b2b-20261028/matriz-financeira.csv                                          |     55 +
 docs/auditorias/evidencias-financeiro-b2b-20261028/resultados-pg.json                                             |    479 +
 docs/auditorias/evidencias-financeiro-b2b-20261028/resumo.json                                                    |     11 +
 docs/auditorias/evidencias-fluxo-b2b-20261028/a2-pg.txt                                                           |     78 +
 docs/auditorias/evidencias-fluxo-b2b-20261028/additional-vitest.txt                                               |     13 +
 docs/auditorias/evidencias-fluxo-b2b-20261028/broad-vitest.txt                                                    |     26 +
 docs/auditorias/evidencias-fluxo-b2b-20261028/combined-vitest.txt                                                 |     18 +
 docs/auditorias/evidencias-fluxo-b2b-20261028/delivery-pg.txt                                                     |     50 +
 docs/auditorias/evidencias-fluxo-b2b-20261028/stock-pg.txt                                                        |     66 +
 docs/auditorias/evidencias-saldo-canonico-20261028/SHA256SUMS                                                     |      7 +
 docs/auditorias/evidencias-saldo-canonico-20261028/execucao.json                                                  |   1150 +
 docs/auditorias/evidencias-saldo-canonico-20261028/matriz.csv                                                     |    104 +
 docs/auditorias/matriz-auditoria-fluxo-b2b-20261028-resumo.json                                                   |     43 +
 docs/auditorias/matriz-auditoria-fluxo-b2b-20261028.csv                                                           |   9191 ++
 docs/auditorias/partes-credito-offline-20261029.md                                                                |     59 +
 docs/auditorias/price-parcelamento-offline-20261029.md                                                            |    141 +
 docs/auditorias/reconciliacao-fluxo-pedido-b2b-20261028-inventario.md                                             |    151 +
 docs/auditorias/reconciliacao-fluxo-pedido-b2b-20261028.md                                                        |    119 +
 docs/auditorias/roteiro-real-fluxo-b2b-20261028.md                                                                |     44 +
 docs/auditorias/saldo-canonico-recebiveis-20261028.md                                                             |    105 +
 package.json                                                                                                      |      2 +
 roadmap.md                                                                                                        |    198 +-
 scripts/arbio-fsf-incremental-20261029/01-credit-approval.body.sql.review                                         |    291 +
 scripts/arbio-fsf-incremental-20261029/01-credit-approval.install.sql.review                                      |    851 +
 scripts/arbio-fsf-incremental-20261029/01-credit-approval.rollback.sql.review                                     |      5 +
 scripts/arbio-fsf-incremental-20261029/AGENTS.md                                                                  |      6 +
 scripts/arbio-fsf-incremental-20261029/LOGIN-READONLY.md                                                          |     14 +
 scripts/arbio-fsf-incremental-20261029/README.md                                                                  |     71 +
 scripts/arbio-fsf-incremental-20261029/build.py                                                                   |    194 +
 scripts/arbio-fsf-incremental-20261029/capture/production-dependencies.json                                       |   2421 +
 scripts/arbio-fsf-incremental-20261029/capture/production-metadata.json                                           |   1969 +
 scripts/arbio-fsf-incremental-20261029/capture/stack-metadata-2028.json                                           |  81085 +++++++++++++++++
 scripts/arbio-fsf-incremental-20261029/capture/stack-supplement-2107.json                                         |    834 +
 scripts/arbio-fsf-incremental-20261029/expected-postflight.json                                                   |     10 +
 scripts/arbio-fsf-incremental-20261029/inventory.json                                                             |    819 +
 scripts/arbio-fsf-incremental-20261029/postflight.sql.readonly                                                    |     21 +
 scripts/arbio-fsf-incremental-20261029/preflight.sql.readonly                                                     |    535 +
 scripts/arbio-fsf-incremental-20261029/restore_stack.py                                                           |    169 +
 scripts/arbio-fsf-incremental-20261029/roadmap.md                                                                 |      0
 scripts/arbio-fsf-incremental-20261029/test_incremental.py                                                        |    166 +
 scripts/arbio-fsf-incremental-20261029/test_integrated.py                                                         |    280 +
 scripts/business-conflicts-cockpit-application-20261027/AGENTS.md                                                 |      3 +
 scripts/business-conflicts-cockpit-application-20261027/LOCK-REVOCATION-REVIEW.md                                 |     23 +
 scripts/business-conflicts-cockpit-application-20261027/README.md                                                 |     55 +
 scripts/business-conflicts-cockpit-application-20261027/SHA256SUMS                                                |     18 +
 scripts/business-conflicts-cockpit-application-20261027/assemble.py                                               |     31 +
 scripts/business-conflicts-cockpit-application-20261027/baseline.sql.review                                       |    329 +
 scripts/business-conflicts-cockpit-application-20261027/candidate.sql.review                                      |   1041 +
 scripts/business-conflicts-cockpit-application-20261027/delta-frontend-tests.diff                                 |      0
 scripts/business-conflicts-cockpit-application-20261027/delta-sql.diff                                            |     20 +
 scripts/business-conflicts-cockpit-application-20261027/functions.sql.review                                      |    329 +
 scripts/business-conflicts-cockpit-application-20261027/live-auth-readonly.json                                   |     62 +
 scripts/business-conflicts-cockpit-application-20261027/live-dependencies.json                                    |    234 +
 scripts/business-conflicts-cockpit-application-20261027/live-targets.json                                         |     28 +
 scripts/business-conflicts-cockpit-application-20261027/manifest.json                                             |     33 +
 scripts/business-conflicts-cockpit-application-20261027/postflight-readonly.sql                                   |    357 +
 scripts/business-conflicts-cockpit-application-20261027/preflight-readonly.sql                                    |    357 +
 scripts/business-conflicts-cockpit-application-20261027/results-local.json                                        |     49 +
 scripts/business-conflicts-cockpit-application-20261027/rollback-conditioned.sql.review                           |   1042 +
 scripts/business-conflicts-cockpit-application-20261027/test-local.py                                             |    129 +
 scripts/catalog-label-conflicts-20261027/AGENTS.md                                                                |      8 +
 scripts/catalog-label-conflicts-20261027/LOCK-REVOCATION-REVIEW.md                                                |     35 +
 scripts/catalog-label-conflicts-20261027/README.md                                                                |     86 +
 scripts/catalog-label-conflicts-20261027/SHA256SUMS                                                               |     27 +
 scripts/catalog-label-conflicts-20261027/assemble.py                                                              |     41 +
 scripts/catalog-label-conflicts-20261027/baseline.sql.review                                                      |     91 +
 scripts/catalog-label-conflicts-20261027/candidate.sql.review                                                     |    121 +
 scripts/catalog-label-conflicts-20261027/delta-frontend.diff                                                      |    191 +
 scripts/catalog-label-conflicts-20261027/delta-sql.diff                                                           |     38 +
 scripts/catalog-label-conflicts-20261027/functions.sql.review                                                     |     91 +
 scripts/catalog-label-conflicts-20261027/live-extra.json                                                          |      7 +
 scripts/catalog-label-conflicts-20261027/live-functions.json                                                      |     62 +
 scripts/catalog-label-conflicts-20261027/manifest.json                                                            |     31 +
 scripts/catalog-label-conflicts-20261027/postflight-readonly.sql                                                  |     16 +
 scripts/catalog-label-conflicts-20261027/preflight-readonly.sql                                                   |     16 +
 scripts/catalog-label-conflicts-20261027/results-local.json                                                       |     59 +
 scripts/catalog-label-conflicts-20261027/revocation-gate/assemble-gate.py                                         |     89 +
 scripts/catalog-label-conflicts-20261027/revocation-gate/candidate-gate.sql.review                                |    165 +
 scripts/catalog-label-conflicts-20261027/revocation-gate/functions-gate.sql.review                                |    121 +
 scripts/catalog-label-conflicts-20261027/revocation-gate/live-gate-deps.json                                      |      1 +
 scripts/catalog-label-conflicts-20261027/revocation-gate/manifest-gate.json                                       |     43 +
 scripts/catalog-label-conflicts-20261027/revocation-gate/postflight-gate-readonly.sql                             |     23 +
 scripts/catalog-label-conflicts-20261027/revocation-gate/preflight-gate-readonly.sql                              |     23 +
 scripts/catalog-label-conflicts-20261027/revocation-gate/results-gate-local.json                                  |     72 +
 scripts/catalog-label-conflicts-20261027/revocation-gate/rollback-containment.sql.review                          |     48 +
 scripts/catalog-label-conflicts-20261027/revocation-gate/test-gate.py                                             |    212 +
 scripts/catalog-label-conflicts-20261027/rollback-conditioned.sql.review                                          |    122 +
 scripts/catalog-label-conflicts-20261027/test-local.py                                                            |    116 +
 scripts/delivery-billing-scope-20261027/AGENTS.md                                                                 |      5 +
 scripts/delivery-billing-scope-20261027/README.md                                                                 |     39 +
 scripts/delivery-billing-scope-20261027/SHA256SUMS                                                                |      8 +
 scripts/delivery-billing-scope-20261027/candidate.sql.review                                                      |    331 +
 scripts/delivery-billing-scope-20261027/postflight.sql                                                            |     15 +
 scripts/delivery-billing-scope-20261027/preflight.sql                                                             |     22 +
 scripts/delivery-billing-scope-20261027/results.txt                                                               |     48 +
 scripts/delivery-billing-scope-20261027/rollback-containment.sql.review                                           |     12 +
 scripts/delivery-billing-scope-20261027/test-local.py                                                             |    205 +
 scripts/delivery-finance-a2-20261028/AGENTS.md                                                                    |      6 +
 scripts/delivery-finance-a2-20261028/README.md                                                                    |     76 +
 scripts/delivery-finance-a2-20261028/SHA256SUMS                                                                   |     22 +
 scripts/delivery-finance-a2-20261028/assemble.py                                                                  |    157 +
 scripts/delivery-finance-a2-20261028/build-guards.py                                                              |     53 +
 scripts/delivery-finance-a2-20261028/candidate.sql.review                                                         |    600 +
 scripts/delivery-finance-a2-20261028/fn_generate_receivable_from_entrega.diff                                     |    378 +
 scripts/delivery-finance-a2-20261028/fn_mark_entrega_not_billable.diff                                            |    124 +
 scripts/delivery-finance-a2-20261028/live-fn_generate_receivable_from_entrega.sql.review                          |    189 +
 scripts/delivery-finance-a2-20261028/live-fn_mark_entrega_not_billable.sql.review                                 |     36 +
 scripts/delivery-finance-a2-20261028/live-functions.json                                                          |    446 +
 scripts/delivery-finance-a2-20261028/live-table-catalog.txt                                                       |     60 +
 scripts/delivery-finance-a2-20261028/live-tables-pins.json                                                        |    128 +
 scripts/delivery-finance-a2-20261028/pg-local-driver.py                                                           |     21 +
 scripts/delivery-finance-a2-20261028/postassert.fragment.sql.review                                               |     67 +
 scripts/delivery-finance-a2-20261028/postflight.sql                                                               |     70 +
 scripts/delivery-finance-a2-20261028/preassert.fragment.sql.review                                                |     67 +
 scripts/delivery-finance-a2-20261028/preflight.sql                                                                |     70 +
 scripts/delivery-finance-a2-20261028/proposed-functions.sql.review                                                |    460 +
 scripts/delivery-finance-a2-20261028/proposed-pg-metadata.json                                                    |      1 +
 scripts/delivery-finance-a2-20261028/results.txt                                                                  |     77 +
 scripts/delivery-finance-a2-20261028/rollback-containment.sql.review                                              |     84 +
 scripts/delivery-finance-a2-20261028/test-local.py                                                                |    272 +
 scripts/delivery-stock-release-20261027/AGENTS.md                                                                 |      5 +
 scripts/delivery-stock-release-20261027/README.md                                                                 |     42 +
 scripts/delivery-stock-release-20261027/SHA256SUMS                                                                |     17 +
 scripts/delivery-stock-release-20261027/assemble.py                                                               |     87 +
 scripts/delivery-stock-release-20261027/build-current-checks.py                                                   |     36 +
 scripts/delivery-stock-release-20261027/candidate.sql.review                                                      |   1602 +
 scripts/delivery-stock-release-20261027/composed-delivery.sql.review                                              |    527 +
 scripts/delivery-stock-release-20261027/containment.sql.review                                                    |     10 +
 scripts/delivery-stock-release-20261027/current-extra-20261028.json                                               |     84 +
 scripts/delivery-stock-release-20261027/current-functions-20261028.json                                           |    162 +
 scripts/delivery-stock-release-20261027/current-postflight.sql                                                    |     78 +
 scripts/delivery-stock-release-20261027/current-preflight.sql                                                     |     78 +
 scripts/delivery-stock-release-20261027/current-tables-20261028.json                                              |    114 +
 scripts/delivery-stock-release-20261027/delivery-only-delta.sql.review                                            |    484 +
 scripts/delivery-stock-release-20261027/local-post-hashes.json                                                    |      1 +
 scripts/delivery-stock-release-20261027/release.sql.review                                                        |      7 +
 scripts/delivery-stock-release-20261027/results.txt                                                               |     49 +
 scripts/delivery-stock-release-20261027/test-local.py                                                             |    177 +
 scripts/e2e-arbio-fsf-real-20261029/AGENTS.md                                                                     |      4 +
 scripts/e2e-arbio-fsf-real-20261029/API-ISOLATION.md                                                              |     43 +
 scripts/e2e-arbio-fsf-real-20261029/ROTEIRO.md                                                                    |     24 +
 scripts/e2e-arbio-fsf-real-20261029/api-isolation-readonly.js                                                     |     56 +
 scripts/e2e-arbio-fsf-real-20261029/checklist.json                                                                |    209 +
 scripts/e2e-arbio-fsf-real-20261029/evidencia-preflight.schema.md                                                 |     14 +
 scripts/e2e-arbio-fsf-real-20261029/evidencia-template.json                                                       |      9 +
 scripts/e2e-arbio-fsf-real-20261029/preflight.py                                                                  |     95 +
 scripts/e2e-arbio-fsf-real-20261029/preflight.sh                                                                  |      4 +
 scripts/e2e-arbio-fsf-real-20261029/test_preflight.py                                                             |     63 +
 scripts/financial-installments-initial-20261024/AGENTS.md                                                         |     10 +
 scripts/financial-installments-initial-20261024/arbio-fsf-policy.draft.json                                       |    179 +
 scripts/financial-installments-initial-20261024/arbio-fsf-policy.full-term-20261028.superseded.json               |    279 +
 scripts/financial-installments-initial-20261024/arbio-fsf-policy.july2026.historical.json                         |    274 +
 scripts/financial-installments-initial-20261024/audit-receivable-recursive.py                                     |     98 +
 scripts/financial-installments-initial-20261024/calendars/build-paracatu-2026-2027.py                             |     52 +
 scripts/financial-installments-initial-20261024/calendars/paracatu-mg-2026-2027.json                              |    368 +
 scripts/financial-installments-initial-20261024/calendars/paracatu-mg-2026.json                                   |    207 +
 scripts/financial-installments-initial-20261024/cancel-parties-credit.py                                          |    193 +
 scripts/financial-installments-initial-20261024/cancel-risk-composition.py                                        |     85 +
 scripts/financial-installments-initial-20261024/cancel-settings-deferred.py                                       |    261 +
 scripts/financial-installments-initial-20261024/financial-battery-live.json                                       |     16 +
 scripts/financial-installments-initial-20261024/payment-methods-readonly-capture-20261029.json                    |     18 +
 scripts/financial-installments-initial-20261024/payment-methods-readonly-capture-homolog-20261029.json            |     48 +
 scripts/financial-installments-initial-20261024/price-schedule.py                                                 |    660 +
 scripts/financial-installments-initial-20261024/receivable-history-diagnostic.sql.readonly                        |     45 +
 scripts/financial-installments-initial-20261024/receivable-recursive-live-20261029.json                           | 265178 +++++++++++++++++++++++++++++++++++++++++++++++++++++++
 scripts/financial-installments-initial-20261024/receivable-semantics-live-20261028.json                           |   2923 +
 scripts/financial-installments-initial-20261024/receivable-writers-dependencies-live-20261028.json                |   3197 +
 scripts/financial-installments-initial-20261024/receivable-writers-live-20261028.json                             |    537 +
 scripts/financial-installments-initial-20261024/test-arbio-fsf-override.py                                        |    115 +
 scripts/financial-installments-initial-20261024/test-arbio-fsf-reference.py                                       |     96 +
 scripts/financial-installments-initial-20261024/test-cancel-authorization.py                                      |    439 +
 scripts/financial-installments-initial-20261024/test-financial-battery.py                                         |    191 +
 scripts/financial-installments-initial-20261024/test-financial-provenance.py                                      |     64 +
 scripts/financial-installments-initial-20261024/test-receivable-red-green.py                                      |    132 +
 scripts/financial-installments-initial-20261024/test-receivable-semantics.py                                      |    278 +
 scripts/financial-price-generator-20261029/AGENTS.md                                                              |      6 +
 scripts/financial-price-generator-20261029/build-candidate.py                                                     |     35 +
 scripts/financial-price-generator-20261029/credit-guard-trigger-columns.rollback.sql.review                       |      3 +
 scripts/financial-price-generator-20261029/credit-guard-trigger-columns.sql.review                                |      9 +
 scripts/financial-price-generator-20261029/price-generator.sql.review                                             |    384 +
 scripts/financial-price-generator-20261029/price-generator.template.sql                                           |    384 +
 scripts/financial-price-generator-20261029/shared-credit-guard.sql.review                                         |    220 +
 scripts/financial-price-generator-20261029/shared_guard_tests.py                                                  |    217 +
 scripts/financial-price-generator-20261029/test-price-generator.py                                                |    478 +
 scripts/financial-price-generator-20261029/trigger_columns_tests.py                                               |     74 +
 scripts/fsf-client-link-20261029/AGENTS.md                                                                        |      5 +
 scripts/fsf-client-link-20261029/link-partner-client.sql.review                                                   |    173 +
 scripts/fsf-client-link-20261029/test-link-partner-client.py                                                      |    232 +
 scripts/order-flow-direct-writes-20261027/README.md                                                               |     55 +
 scripts/os-delivery-reopening-20261027/AGENTS.md                                                                  |      4 +
 scripts/os-delivery-reopening-20261027/README.md                                                                  |     40 +
 scripts/os-delivery-reopening-20261027/SHA256SUMS                                                                 |     45 +
 scripts/os-delivery-reopening-20261027/build-candidate.py                                                         |     81 +
 scripts/os-delivery-reopening-20261027/candidate-hardening.sql.review                                             |    507 +
 scripts/os-delivery-reopening-20261027/candidate-pins.json                                                        |     20 +
 scripts/os-delivery-reopening-20261027/containment.sql.review                                                     |     10 +
 scripts/os-delivery-reopening-20261027/live/cf_user_guards_v1.acquire_gate.sql.review                             |     14 +
 scripts/os-delivery-reopening-20261027/live/definitions.json                                                      |    133 +
 scripts/os-delivery-reopening-20261027/live/platform_private.stock_p1_guard.sql.review                            |     59 +
 scripts/os-delivery-reopening-20261027/live/platform_private.stock_p1_movement_guard.sql.review                   |     33 +
 scripts/os-delivery-reopening-20261027/live/public._refresh_esteira_laboratorio_after_change.sql.review           |     12 +
 scripts/os-delivery-reopening-20261027/live/public.fn_cockpit_assert_b2b_liberado.sql.review                      |     38 +
 scripts/os-delivery-reopening-20261027/live/public.fn_cockpit_assert_operador_origem.sql.review                   |     34 +
 scripts/os-delivery-reopening-20261027/live/public.fn_cockpit_norm_origem.sql.review                              |     15 +
 scripts/os-delivery-reopening-20261027/live/public.fn_entrega_assert_confirmador.sql.review                       |     28 +
 scripts/os-delivery-reopening-20261027/live/public.fn_entrega_confirmar_engine_v1.sql.review                      |    172 +
 scripts/os-delivery-reopening-20261027/live/public.fn_entrega_marcar_cancelamento.sql.review                      |     21 +
 scripts/os-delivery-reopening-20261027/live/public.fn_estoque_ctx_open.sql.review                                 |     13 +
 scripts/os-delivery-reopening-20261027/live/public.fn_estoque_ctx_read.sql.review                                 |     14 +
 scripts/os-delivery-reopening-20261027/live/public.fn_estoque_produto_guard.sql.review                            |     17 +
 scripts/os-delivery-reopening-20261027/live/public.fn_h6c_entrega_ar_b2b_link.sql.review                          |     44 +
 scripts/os-delivery-reopening-20261027/live/public.fn_ledger_append_only.sql.review                               |     12 +
 scripts/os-delivery-reopening-20261027/live/public.fn_sync_entrega_financial_status.sql.review                    |     43 +
 scripts/os-delivery-reopening-20261027/live/public.fn_validate_entrega_confirmacao.sql.review                     |     46 +
 scripts/os-delivery-reopening-20261027/live/public.fn_validate_entrega_estoque.sql.review                         |     61 +
 scripts/os-delivery-reopening-20261027/live/public.guard_tenant_organization_id.sql.review                        |     27 +
 scripts/os-delivery-reopening-20261027/live/public.log_estoque_movimentacao.sql.review                            |    129 +
 scripts/os-delivery-reopening-20261027/live/public.rpc_aprovar_os_v1.sql.review                                   |     22 +
 scripts/os-delivery-reopening-20261027/live/public.rpc_cockpit_cancelar_reserva_v1.sql.review                     |     96 +
 scripts/os-delivery-reopening-20261027/live/public.rpc_cockpit_confirmar_entrega_v1.sql.review                    |     15 +
 scripts/os-delivery-reopening-20261027/live/public.rpc_cockpit_criar_entrega_v1.sql.review                        |    151 +
 scripts/os-delivery-reopening-20261027/live/public.rpc_entrega_cancelar_v1.sql.review                             |    111 +
 scripts/os-delivery-reopening-20261027/live/public.rpc_entrega_confirmar_v1.sql.review                            |     11 +
 scripts/os-delivery-reopening-20261027/live/public.rpc_programar_os_v1.sql.review                                 |     89 +
 scripts/os-delivery-reopening-20261027/live/public.tg_recalc_planning_from_entrega.sql.review                     |     26 +
 scripts/os-delivery-reopening-20261027/live/public.trg_entrega_sync_partner_order_fn.sql.review                   |     31 +
 scripts/os-delivery-reopening-20261027/live/public.update_updated_at_column.sql.review                            |      6 +
 scripts/os-delivery-reopening-20261027/live/public.validate_estoque_entrada.sql.review                            |     45 +
 scripts/os-delivery-reopening-20261027/live/public.validate_estoque_reserva.sql.review                            |     54 +
 scripts/os-delivery-reopening-20261027/local-candidate-hashes.json                                                |      1 +
 scripts/os-delivery-reopening-20261027/postflight.sql                                                             |      8 +
 scripts/os-delivery-reopening-20261027/preflight.sql                                                              |      8 +
 scripts/os-delivery-reopening-20261027/release.sql.review                                                         |      8 +
 scripts/os-delivery-reopening-20261027/results.txt                                                                |     40 +
 scripts/os-delivery-reopening-20261027/test-local.py                                                              |    157 +
 scripts/partner-order-items-owner-read-20261029/AGENTS.md                                                         |      4 +
 scripts/partner-order-items-owner-read-20261029/README.md                                                         |     10 +
 scripts/partner-order-items-owner-read-20261029/install.sql.final.review                                          |     54 +
 scripts/partner-order-items-owner-read-20261029/install.sql.review                                                |     54 +
 scripts/partner-order-items-owner-read-20261029/pins.json                                                         |      4 +
 scripts/partner-order-items-owner-read-20261029/postflight.sql.readonly                                           |     17 +
 scripts/partner-order-items-owner-read-20261029/preflight.sql.readonly                                            |     17 +
 scripts/partner-order-items-owner-read-20261029/rollback.sql.final.review                                         |     22 +
 scripts/partner-order-items-owner-read-20261029/rollback.sql.review                                               |     22 +
 scripts/partner-order-items-owner-read-20261029/test_items_owner_read.py                                          |    164 +
 scripts/partner-orders-owner-read-20261029/AGENTS.md                                                              |      5 +
 scripts/partner-orders-owner-read-20261029/README.md                                                              |     13 +
 scripts/partner-orders-owner-read-20261029/install.sql.final.review                                               |     76 +
 scripts/partner-orders-owner-read-20261029/install.sql.review                                                     |     76 +
 scripts/partner-orders-owner-read-20261029/pins.json                                                              |      4 +
 scripts/partner-orders-owner-read-20261029/postflight.sql.readonly                                                |     19 +
 scripts/partner-orders-owner-read-20261029/preflight.sql.readonly                                                 |     20 +
 scripts/partner-orders-owner-read-20261029/rollback.sql.final.review                                              |     30 +
 scripts/partner-orders-owner-read-20261029/rollback.sql.review                                                    |     30 +
 scripts/partner-orders-owner-read-20261029/test_owner_read.py                                                     |    205 +
 scripts/rbac-audit/build-order-flow-matrix.py                                                                     |     67 +
 scripts/stock-envase-recovery-20261027/AGENTS.md                                                                  |      5 +
 scripts/stock-envase-recovery-20261027/README.md                                                                  |     47 +
 scripts/stock-envase-recovery-20261027/SHA256SUMS                                                                 |     72 +
 scripts/stock-envase-recovery-20261027/assemble.py                                                                |     95 +
 scripts/stock-envase-recovery-20261027/build-checks.py                                                            |     32 +
 scripts/stock-envase-recovery-20261027/candidate.sql.review                                                       |    742 +
 scripts/stock-envase-recovery-20261027/containment.sql.review                                                     |     12 +
 scripts/stock-envase-recovery-20261027/live/catalog.json                                                          |   1177 +
 scripts/stock-envase-recovery-20261027/live/current-20261028.json                                                 |    188 +
 scripts/stock-envase-recovery-20261027/live/functions.json                                                        |    233 +
 scripts/stock-envase-recovery-20261027/live/platform_private.guard_manual_cq_parent_v1.sql.review                 |     38 +
 scripts/stock-envase-recovery-20261027/live/platform_private.guard_manual_lot_delete_v1.sql.review                |     12 +
 scripts/stock-envase-recovery-20261027/live/platform_private.guard_manual_lot_write_v1.sql.review                 |     61 +
 scripts/stock-envase-recovery-20261027/live/platform_private.guard_manual_program_binding_v1.sql.review           |     14 +
 scripts/stock-envase-recovery-20261027/live/platform_private.stock_motor_actor.sql.review                         |     13 +
 scripts/stock-envase-recovery-20261027/live/platform_private.stock_motor_context_set.sql.review                   |     15 +
 scripts/stock-envase-recovery-20261027/live/platform_private.stock_motor_item.sql.review                          |     19 +
 scripts/stock-envase-recovery-20261027/live/platform_private.stock_motor_refs.sql.review                          |     34 +
 scripts/stock-envase-recovery-20261027/live/platform_private.stock_p1_guard.sql.review                            |     58 +
 scripts/stock-envase-recovery-20261027/live/platform_private.stock_p1_lote_owned.sql.review                       |     12 +
 scripts/stock-envase-recovery-20261027/live/platform_private.stock_p1_movement_guard.sql.review                   |     32 +
 scripts/stock-envase-recovery-20261027/live/platform_private.stock_p1_movement_owned.sql.review                   |      6 +
 scripts/stock-envase-recovery-20261027/live/platform_private.trg_lab_lot_biological_only.sql.review               |     12 +
 scripts/stock-envase-recovery-20261027/live/platform_private.trg_lab_os_biological_only.sql.review                |     12 +
 scripts/stock-envase-recovery-20261027/live/platform_private.trg_lab_programming_biological_only.sql.review       |     12 +
 scripts/stock-envase-recovery-20261027/live/private.guard_os_separate_approval.sql.review                         |     35 +
 scripts/stock-envase-recovery-20261027/live/public._comunicacao_trg_os_pronto_retirada.sql.review                 |     15 +
 scripts/stock-envase-recovery-20261027/live/public._refresh_esteira_laboratorio_after_change.sql.review           |     11 +
 scripts/stock-envase-recovery-20261027/live/public._saas_trg_require_feature.sql.review                           |     29 +
 scripts/stock-envase-recovery-20261027/live/public._sync_planning_from_os.sql.review                              |     38 +
 scripts/stock-envase-recovery-20261027/live/public.check_os_item_ref.sql.review                                   |     12 +
 scripts/stock-envase-recovery-20261027/live/public.check_os_status_transition.sql.review                          |     88 +
 scripts/stock-envase-recovery-20261027/live/public.fn_cockpit_ctx_programacao.sql.review                          |     32 +
 scripts/stock-envase-recovery-20261027/live/public.fn_cockpit_is_gestor.sql.review                                |      9 +
 scripts/stock-envase-recovery-20261027/live/public.fn_create_programacao_on_os_classica_insert.sql.review         |     24 +
 scripts/stock-envase-recovery-20261027/live/public.fn_envase_avanca_os.sql.review                                 |     42 +
 scripts/stock-envase-recovery-20261027/live/public.fn_envase_material_imutavel.sql.review                         |     28 +
 scripts/stock-envase-recovery-20261027/live/public.fn_estoque_ctx_close.sql.review                                |      9 +
 scripts/stock-envase-recovery-20261027/live/public.fn_estoque_ctx_force.sql.review                                |      9 +
 scripts/stock-envase-recovery-20261027/live/public.fn_estoque_ctx_open.sql.review                                 |     12 +
 scripts/stock-envase-recovery-20261027/live/public.fn_estoque_ctx_read.sql.review                                 |     13 +
 scripts/stock-envase-recovery-20261027/live/public.fn_estoque_fingerprint.sql.review                              |     12 +
 scripts/stock-envase-recovery-20261027/live/public.fn_estoque_pode_operar.sql.review                              |     15 +
 scripts/stock-envase-recovery-20261027/live/public.fn_estoque_produto_guard.sql.review                            |     16 +
 scripts/stock-envase-recovery-20261027/live/public.fn_ledger_append_only.sql.review                               |     11 +
 scripts/stock-envase-recovery-20261027/live/public.fn_notify_lab_on_programacao.sql.review                        |     15 +
 scripts/stock-envase-recovery-20261027/live/public.fn_sync_os_classica_downstream.sql.review                      |     72 +
 scripts/stock-envase-recovery-20261027/live/public.fn_validate_envase_cq.sql.review                               |     25 +
 scripts/stock-envase-recovery-20261027/live/public.fn_validate_envase_volume.sql.review                           |     51 +
 scripts/stock-envase-recovery-20261027/live/public.guard_tenant_organization_id.sql.review                        |     26 +
 scripts/stock-envase-recovery-20261027/live/public.log_estoque_movimentacao.sql.review                            |    128 +
 scripts/stock-envase-recovery-20261027/live/public.lote_volume_envasado.sql.review                                |     10 +
 scripts/stock-envase-recovery-20261027/live/public.rpc_cockpit_cancelar_reserva_v1.sql.review                     |     95 +
 scripts/stock-envase-recovery-20261027/live/public.rpc_cockpit_registrar_envase_v1.sql.review                     |    211 +
 scripts/stock-envase-recovery-20261027/live/public.rpc_criar_embalagens_pos_envase.sql.review                     |    125 +
 scripts/stock-envase-recovery-20261027/live/public.rpc_estoque_operar_v1.sql.review                               |    303 +
 scripts/stock-envase-recovery-20261027/live/public.rpc_estoque_reservar_v1.sql.review                             |     65 +
 scripts/stock-envase-recovery-20261027/live/public.set_numero_os_regular.sql.review                               |     14 +
 scripts/stock-envase-recovery-20261027/live/public.stock_p1_lote_owned.sql.review                                 |      6 +
 scripts/stock-envase-recovery-20261027/live/public.stock_p1_movement_owned.sql.review                             |      6 +
 scripts/stock-envase-recovery-20261027/live/public.tg_protect_os_structural_fields.sql.review                     |     18 +
 scripts/stock-envase-recovery-20261027/live/public.tg_recalc_planning_from_os.sql.review                          |     25 +
 scripts/stock-envase-recovery-20261027/live/public.trg_os_sync_partner_order_fn.sql.review                        |     30 +
 scripts/stock-envase-recovery-20261027/live/public.update_updated_at_column.sql.review                            |      5 +
 scripts/stock-envase-recovery-20261027/live/public.validate_estoque_entrada.sql.review                            |     44 +
 scripts/stock-envase-recovery-20261027/live/public.validate_estoque_reserva.sql.review                            |     53 +
 scripts/stock-envase-recovery-20261027/live/public.validate_responsavel_producao.sql.review                       |     37 +
 scripts/stock-envase-recovery-20261027/local-post-hashes.json                                                     |      1 +
 scripts/stock-envase-recovery-20261027/postflight.sql                                                             |    128 +
 scripts/stock-envase-recovery-20261027/preflight.sql                                                              |    128 +
 scripts/stock-envase-recovery-20261027/release.sql.review                                                         |      4 +
 scripts/stock-envase-recovery-20261027/results.txt                                                                |     65 +
 scripts/stock-envase-recovery-20261027/test-local.py                                                              |    210 +
 scripts/visit-approval-submit-20261027/AGENTS.md                                                                  |      4 +
 scripts/visit-approval-submit-20261027/README.md                                                                  |     55 +
 scripts/visit-approval-submit-20261027/SHA256SUMS                                                                 |     13 +
 scripts/visit-approval-submit-20261027/baseline.sql                                                               |     68 +
 scripts/visit-approval-submit-20261027/candidate.sql.review                                                       |    148 +
 scripts/visit-approval-submit-20261027/delta-frontend.diff                                                        |    590 +
 scripts/visit-approval-submit-20261027/delta-sql.diff                                                             |    121 +
 scripts/visit-approval-submit-20261027/installed.sql.review                                                       |    100 +
 scripts/visit-approval-submit-20261027/postflight-installed.sql                                                   |     11 +
 scripts/visit-approval-submit-20261027/postflight.sql                                                             |     11 +
 scripts/visit-approval-submit-20261027/preflight.sql                                                              |     15 +
 scripts/visit-approval-submit-20261027/results.txt                                                                |     45 +
 scripts/visit-approval-submit-20261027/rollback-containment.sql.review                                            |      3 +
 scripts/visit-approval-submit-20261027/test-local.py                                                              |    215 +
 scripts/visit-field-cas-20261027/AGENTS.md                                                                        |      7 +
 scripts/visit-field-cas-20261027/README.md                                                                        |     70 +
 scripts/visit-field-cas-20261027/SHA256SUMS                                                                       |     16 +
 scripts/visit-field-cas-20261027/applied-write-only.sql.review                                                    |     10 +
 scripts/visit-field-cas-20261027/baseline.sql                                                                     |    120 +
 scripts/visit-field-cas-20261027/candidate.sql.review                                                             |    298 +
 scripts/visit-field-cas-20261027/delta-frontend-fe6fc410.diff                                                     |   1139 +
 scripts/visit-field-cas-20261027/delta-frontend.diff                                                              |    443 +
 scripts/visit-field-cas-20261027/delta-sql-fe6fc410.diff                                                          |    249 +
 scripts/visit-field-cas-20261027/delta-sql.diff                                                                   |    332 +
 scripts/visit-field-cas-20261027/postflight.sql                                                                   |     20 +
 scripts/visit-field-cas-20261027/preflight.sql                                                                    |     26 +
 scripts/visit-field-cas-20261027/results-frontend.txt                                                             |     17 +
 scripts/visit-field-cas-20261027/results-sql.txt                                                                  |     89 +
 scripts/visit-field-cas-20261027/rollback-containment.sql.review                                                  |     17 +
 scripts/visit-field-cas-20261027/test-local.py                                                                    |    295 +
 scripts/visit-field-cas-20261027/verify-write-only-readonly.sql                                                   |     77 +
 scripts/visit-monitoring-plan-20261027/agronomic-origin/AGENTS.md                                                 |      5 +
 scripts/visit-monitoring-plan-20261027/agronomic-origin/README.md                                                 |     84 +
 scripts/visit-monitoring-plan-20261027/agronomic-origin/SHA256SUMS                                                |     10 +
 scripts/visit-monitoring-plan-20261027/agronomic-origin/candidate.sql.review                                      |    449 +
 scripts/visit-monitoring-plan-20261027/agronomic-origin/client.diff                                               |    650 +
 scripts/visit-monitoring-plan-20261027/agronomic-origin/postflight.sql                                            |     10 +
 scripts/visit-monitoring-plan-20261027/agronomic-origin/preflight.sql                                             |     14 +
 scripts/visit-monitoring-plan-20261027/agronomic-origin/review-533d329.diff                                       |    434 +
 scripts/visit-monitoring-plan-20261027/agronomic-origin/review-6dd3.diff                                          |    248 +
 scripts/visit-monitoring-plan-20261027/agronomic-origin/review-direct-write.diff                                  |    741 +
 scripts/visit-monitoring-plan-20261027/agronomic-origin/rollback-containment.sql.review                           |     21 +
 scripts/visit-monitoring-plan-20261027/agronomic-origin/test-local.py                                             |    318 +
 scripts/visit-monitoring-plan-20261027/agronomic-origin/write-closure/AGENTS.md                                   |      4 +
 scripts/visit-monitoring-plan-20261027/agronomic-origin/write-closure/README.md                                   |     65 +
 scripts/visit-monitoring-plan-20261027/agronomic-origin/write-closure/SHA256SUMS                                  |     12 +
 scripts/visit-monitoring-plan-20261027/agronomic-origin/write-closure/candidate.sql.review                        |    114 +
 scripts/visit-monitoring-plan-20261027/agronomic-origin/write-closure/delta.diff                                  |    673 +
 scripts/visit-monitoring-plan-20261027/agronomic-origin/write-closure/postflight.sql                              |     39 +
 scripts/visit-monitoring-plan-20261027/agronomic-origin/write-closure/preflight.sql                               |     47 +
 scripts/visit-monitoring-plan-20261027/agronomic-origin/write-closure/results.txt                                 |    167 +
 scripts/visit-monitoring-plan-20261027/agronomic-origin/write-closure/rollback-containment.sql.review             |     23 +
 .../agronomic-origin/write-closure/rpc_atualizar_status_alerta_agronomico_v1.baseline.sql                         |     47 +
 scripts/visit-monitoring-plan-20261027/agronomic-origin/write-closure/rpc_criar_alerta_climatico_v1.baseline.sql  |     72 +
 .../visit-monitoring-plan-20261027/agronomic-origin/write-closure/rpc_reprogramar_monitoramento_v1.baseline.sql   |     82 +
 scripts/visit-monitoring-plan-20261027/agronomic-origin/write-closure/test-local.py                               |    119 +
 src/components/comercial/CommercialOwnerOrdersSection.tsx                                                         |     14 +-
 src/components/comercial/ResponderCotacaoDialog.tsx                                                               |      5 +-
 src/components/comercial/creditBlockReason.ts                                                                     |     16 +
 src/components/entregas/ConfirmarEntregaDialog.tsx                                                                |     72 +-
 src/components/financeiro/ConfirmarEntregaFinanceiroDialog.tsx                                                    |    165 +-
 src/components/visita/OrigemAlertaAgronomico.tsx                                                                  |     95 +
 src/components/visita/PlanoMonitoramentoEditor.tsx                                                                |      2 +
 src/hooks/AGENTS.md                                                                                               |      3 +
 src/hooks/useDeliveryFinanceReconciliation.ts                                                                     |     98 +
 src/hooks/useEsteiraLaboratorio.ts                                                                                |     20 +-
 src/hooks/useOfflineSync.ts                                                                                       |     69 +-
 src/hooks/useOrigemAlertaAgronomico.ts                                                                            |     98 +
 src/hooks/useProductionPlanning.ts                                                                                |     40 +-
 src/hooks/useReprogramarMonitoramento.ts                                                                          |     72 +-
 src/hooks/useSalvarPlanoMonitoramento.ts                                                                          |      1 +
 src/integrations/supabase/types.ts                                                                                |     24 +
 src/lib/catalogo/platformCatalogLabels.ts                                                                         |      6 +-
 src/lib/comercial/commercialOwnerOrders.ts                                                                        |     10 +
 src/lib/entregas/payloadEntrega.ts                                                                                |     16 +-
 src/lib/offlineDb.ts                                                                                              |    115 +-
 src/lib/visita/campoContract.ts                                                                                   |     67 +
 src/lib/visita/visitaErrorMessages.ts                                                                             |      2 +
 src/pages/Entregas.tsx                                                                                            |    241 +-
 src/pages/MonitoramentoAlertas.tsx                                                                                |     36 +-
 src/pages/SelecionarPortal.tsx                                                                                    |     29 +-
 src/pages/app/wizard/WizardCampoStep.tsx                                                                          |    319 +-
 src/pages/app/wizard/WizardRevisaoStep.tsx                                                                        |    138 +-
 src/test/aplicacoes/salvar.test.ts                                                                                |     14 +
 src/test/catalogo/catalogLabelPt409.test.ts                                                                       |     36 +
 src/test/catalogo/catalogLabelsPanelFlow.test.tsx                                                                 |     26 +-
 src/test/comercial/creditBlockReason.test.ts                                                                      |     20 +
 src/test/comercial/responderCotacaoCreditReason.test.tsx                                                          |     32 +
 src/test/config/authProviderTopology.test.ts                                                                      |      3 +-
 src/test/config/myPartner.session.test.tsx                                                                        |     12 +-
 src/test/entregas/confirmacaoEntregaAck.test.tsx                                                                  |     56 +
 src/test/entregas/consumidorEntrega.test.tsx                                                                      |    107 +
 src/test/entregas/creationContracts.offline.test.ts                                                               |     30 +
 src/test/entregas/registroEntrega.test.ts                                                                         |      8 +-
 src/test/financeiro/arbioFsfReference.test.ts                                                                     |     90 +
 src/test/financeiro/bateriaB2bOffline.test.ts                                                                     |     53 +
 src/test/financeiro/cancelAuthorizationPostgres.test.ts                                                           |     58 +
 src/test/financeiro/deliveryFinanceReconciliation.test.tsx                                                        |    147 +
 src/test/financeiro/financialProvenanceOffline.test.ts                                                            |     14 +
 src/test/financeiro/priceScheduleOffline.test.ts                                                                  |     11 +
 src/test/financeiro/receivableRedGreenPostgres.test.ts                                                            |     11 +
 src/test/financeiro/receivableSemantics.test.ts                                                                   |     44 +
 src/test/lotes/gerar-lote-fences.test.tsx                                                                         |     12 +
 src/test/monitoramento/agronomicOriginPostgres.test.ts                                                            |     24 +
 src/test/monitoramento/origemAlertaAgronomico.test.tsx                                                            |    133 +
 src/test/monitoramento/saveVisitMonitoringPlanClient.test.tsx                                                     |      5 +-
 src/test/multiportal.guards.test.tsx                                                                              |      8 +
 src/test/multiportal.superadmin.test.tsx                                                                          |     59 +
 src/test/pedidos/commercialOwnerOrders.test.tsx                                                                   |     98 +-
 src/test/planejamento-producao/publicacao-contrato-current.test.tsx                                               |    117 +
 src/test/rbac/order-flow-coverage.test.ts                                                                         |     17 +
 src/test/saas/c2-internal-order-entry-postgres.test.ts                                                            |      2 +-
 src/test/visita/monitoringAutosave.interaction.test.tsx                                                           |      2 +
 src/test/visita/visitaErrorMessages.test.ts                                                                       |      7 +
 src/test/visita/wizardCampo.persistence.test.tsx                                                                  |    270 +-
 src/test/visita/wizardRevisao.confirmation.test.tsx                                                               |    292 +-
 764 files changed, 541554 insertions(+), 554 deletions(-)
```

## Nomes completos por grupo

### Testes

- `src/test/aplicacoes/salvar.test.ts`
- `src/test/catalogo/catalogLabelPt409.test.ts`
- `src/test/catalogo/catalogLabelsPanelFlow.test.tsx`
- `src/test/comercial/creditBlockReason.test.ts`
- `src/test/comercial/responderCotacaoCreditReason.test.tsx`
- `src/test/config/authProviderTopology.test.ts`
- `src/test/config/myPartner.session.test.tsx`
- `src/test/entregas/confirmacaoEntregaAck.test.tsx`
- `src/test/entregas/consumidorEntrega.test.tsx`
- `src/test/entregas/creationContracts.offline.test.ts`
- `src/test/entregas/registroEntrega.test.ts`
- `src/test/financeiro/arbioFsfReference.test.ts`
- `src/test/financeiro/bateriaB2bOffline.test.ts`
- `src/test/financeiro/cancelAuthorizationPostgres.test.ts`
- `src/test/financeiro/deliveryFinanceReconciliation.test.tsx`
- `src/test/financeiro/financialProvenanceOffline.test.ts`
- `src/test/financeiro/priceScheduleOffline.test.ts`
- `src/test/financeiro/receivableRedGreenPostgres.test.ts`
- `src/test/financeiro/receivableSemantics.test.ts`
- `src/test/lotes/gerar-lote-fences.test.tsx`
- `src/test/monitoramento/agronomicOriginPostgres.test.ts`
- `src/test/monitoramento/origemAlertaAgronomico.test.tsx`
- `src/test/monitoramento/saveVisitMonitoringPlanClient.test.tsx`
- `src/test/multiportal.guards.test.tsx`
- `src/test/multiportal.superadmin.test.tsx`
- `src/test/pedidos/commercialOwnerOrders.test.tsx`
- `src/test/planejamento-producao/publicacao-contrato-current.test.tsx`
- `src/test/rbac/order-flow-coverage.test.ts`
- `src/test/saas/c2-internal-order-entry-postgres.test.ts`
- `src/test/visita/monitoringAutosave.interaction.test.tsx`
- `src/test/visita/visitaErrorMessages.test.ts`
- `src/test/visita/wizardCampo.persistence.test.tsx`
- `src/test/visita/wizardRevisao.confirmation.test.tsx`

### Scripts e candidatos de revisão

- `scripts/arbio-fsf-incremental-20261029/01-credit-approval.body.sql.review`
- `scripts/arbio-fsf-incremental-20261029/01-credit-approval.install.sql.review`
- `scripts/arbio-fsf-incremental-20261029/01-credit-approval.rollback.sql.review`
- `scripts/arbio-fsf-incremental-20261029/LOGIN-READONLY.md`
- `scripts/arbio-fsf-incremental-20261029/README.md`
- `scripts/arbio-fsf-incremental-20261029/build.py`
- `scripts/arbio-fsf-incremental-20261029/capture/production-dependencies.json`
- `scripts/arbio-fsf-incremental-20261029/capture/production-metadata.json`
- `scripts/arbio-fsf-incremental-20261029/capture/stack-metadata-2028.json`
- `scripts/arbio-fsf-incremental-20261029/capture/stack-supplement-2107.json`
- `scripts/arbio-fsf-incremental-20261029/expected-postflight.json`
- `scripts/arbio-fsf-incremental-20261029/inventory.json`
- `scripts/arbio-fsf-incremental-20261029/postflight.sql.readonly`
- `scripts/arbio-fsf-incremental-20261029/preflight.sql.readonly`
- `scripts/arbio-fsf-incremental-20261029/restore_stack.py`
- `scripts/arbio-fsf-incremental-20261029/roadmap.md`
- `scripts/arbio-fsf-incremental-20261029/test_incremental.py`
- `scripts/arbio-fsf-incremental-20261029/test_integrated.py`
- `scripts/business-conflicts-cockpit-application-20261027/LOCK-REVOCATION-REVIEW.md`
- `scripts/business-conflicts-cockpit-application-20261027/README.md`
- `scripts/business-conflicts-cockpit-application-20261027/SHA256SUMS`
- `scripts/business-conflicts-cockpit-application-20261027/assemble.py`
- `scripts/business-conflicts-cockpit-application-20261027/baseline.sql.review`
- `scripts/business-conflicts-cockpit-application-20261027/candidate.sql.review`
- `scripts/business-conflicts-cockpit-application-20261027/delta-frontend-tests.diff`
- `scripts/business-conflicts-cockpit-application-20261027/delta-sql.diff`
- `scripts/business-conflicts-cockpit-application-20261027/functions.sql.review`
- `scripts/business-conflicts-cockpit-application-20261027/live-auth-readonly.json`
- `scripts/business-conflicts-cockpit-application-20261027/live-dependencies.json`
- `scripts/business-conflicts-cockpit-application-20261027/live-targets.json`
- `scripts/business-conflicts-cockpit-application-20261027/manifest.json`
- `scripts/business-conflicts-cockpit-application-20261027/postflight-readonly.sql`
- `scripts/business-conflicts-cockpit-application-20261027/preflight-readonly.sql`
- `scripts/business-conflicts-cockpit-application-20261027/results-local.json`
- `scripts/business-conflicts-cockpit-application-20261027/rollback-conditioned.sql.review`
- `scripts/business-conflicts-cockpit-application-20261027/test-local.py`
- `scripts/catalog-label-conflicts-20261027/LOCK-REVOCATION-REVIEW.md`
- `scripts/catalog-label-conflicts-20261027/README.md`
- `scripts/catalog-label-conflicts-20261027/SHA256SUMS`
- `scripts/catalog-label-conflicts-20261027/assemble.py`
- `scripts/catalog-label-conflicts-20261027/baseline.sql.review`
- `scripts/catalog-label-conflicts-20261027/candidate.sql.review`
- `scripts/catalog-label-conflicts-20261027/delta-frontend.diff`
- `scripts/catalog-label-conflicts-20261027/delta-sql.diff`
- `scripts/catalog-label-conflicts-20261027/functions.sql.review`
- `scripts/catalog-label-conflicts-20261027/live-extra.json`
- `scripts/catalog-label-conflicts-20261027/live-functions.json`
- `scripts/catalog-label-conflicts-20261027/manifest.json`
- `scripts/catalog-label-conflicts-20261027/postflight-readonly.sql`
- `scripts/catalog-label-conflicts-20261027/preflight-readonly.sql`
- `scripts/catalog-label-conflicts-20261027/results-local.json`
- `scripts/catalog-label-conflicts-20261027/revocation-gate/assemble-gate.py`
- `scripts/catalog-label-conflicts-20261027/revocation-gate/candidate-gate.sql.review`
- `scripts/catalog-label-conflicts-20261027/revocation-gate/functions-gate.sql.review`
- `scripts/catalog-label-conflicts-20261027/revocation-gate/live-gate-deps.json`
- `scripts/catalog-label-conflicts-20261027/revocation-gate/manifest-gate.json`
- `scripts/catalog-label-conflicts-20261027/revocation-gate/postflight-gate-readonly.sql`
- `scripts/catalog-label-conflicts-20261027/revocation-gate/preflight-gate-readonly.sql`
- `scripts/catalog-label-conflicts-20261027/revocation-gate/results-gate-local.json`
- `scripts/catalog-label-conflicts-20261027/revocation-gate/rollback-containment.sql.review`
- `scripts/catalog-label-conflicts-20261027/revocation-gate/test-gate.py`
- `scripts/catalog-label-conflicts-20261027/rollback-conditioned.sql.review`
- `scripts/catalog-label-conflicts-20261027/test-local.py`
- `scripts/delivery-billing-scope-20261027/README.md`
- `scripts/delivery-billing-scope-20261027/SHA256SUMS`
- `scripts/delivery-billing-scope-20261027/candidate.sql.review`
- `scripts/delivery-billing-scope-20261027/postflight.sql`
- `scripts/delivery-billing-scope-20261027/preflight.sql`
- `scripts/delivery-billing-scope-20261027/results.txt`
- `scripts/delivery-billing-scope-20261027/rollback-containment.sql.review`
- `scripts/delivery-billing-scope-20261027/test-local.py`
- `scripts/delivery-finance-a2-20261028/README.md`
- `scripts/delivery-finance-a2-20261028/SHA256SUMS`
- `scripts/delivery-finance-a2-20261028/assemble.py`
- `scripts/delivery-finance-a2-20261028/build-guards.py`
- `scripts/delivery-finance-a2-20261028/candidate.sql.review`
- `scripts/delivery-finance-a2-20261028/fn_generate_receivable_from_entrega.diff`
- `scripts/delivery-finance-a2-20261028/fn_mark_entrega_not_billable.diff`
- `scripts/delivery-finance-a2-20261028/live-fn_generate_receivable_from_entrega.sql.review`
- `scripts/delivery-finance-a2-20261028/live-fn_mark_entrega_not_billable.sql.review`
- `scripts/delivery-finance-a2-20261028/live-functions.json`
- `scripts/delivery-finance-a2-20261028/live-table-catalog.txt`
- `scripts/delivery-finance-a2-20261028/live-tables-pins.json`
- `scripts/delivery-finance-a2-20261028/pg-local-driver.py`
- `scripts/delivery-finance-a2-20261028/postassert.fragment.sql.review`
- `scripts/delivery-finance-a2-20261028/postflight.sql`
- `scripts/delivery-finance-a2-20261028/preassert.fragment.sql.review`
- `scripts/delivery-finance-a2-20261028/preflight.sql`
- `scripts/delivery-finance-a2-20261028/proposed-functions.sql.review`
- `scripts/delivery-finance-a2-20261028/proposed-pg-metadata.json`
- `scripts/delivery-finance-a2-20261028/results.txt`
- `scripts/delivery-finance-a2-20261028/rollback-containment.sql.review`
- `scripts/delivery-finance-a2-20261028/test-local.py`
- `scripts/delivery-stock-release-20261027/README.md`
- `scripts/delivery-stock-release-20261027/SHA256SUMS`
- `scripts/delivery-stock-release-20261027/assemble.py`
- `scripts/delivery-stock-release-20261027/build-current-checks.py`
- `scripts/delivery-stock-release-20261027/candidate.sql.review`
- `scripts/delivery-stock-release-20261027/composed-delivery.sql.review`
- `scripts/delivery-stock-release-20261027/containment.sql.review`
- `scripts/delivery-stock-release-20261027/current-extra-20261028.json`
- `scripts/delivery-stock-release-20261027/current-functions-20261028.json`
- `scripts/delivery-stock-release-20261027/current-postflight.sql`
- `scripts/delivery-stock-release-20261027/current-preflight.sql`
- `scripts/delivery-stock-release-20261027/current-tables-20261028.json`
- `scripts/delivery-stock-release-20261027/delivery-only-delta.sql.review`
- `scripts/delivery-stock-release-20261027/local-post-hashes.json`
- `scripts/delivery-stock-release-20261027/release.sql.review`
- `scripts/delivery-stock-release-20261027/results.txt`
- `scripts/delivery-stock-release-20261027/test-local.py`
- `scripts/e2e-arbio-fsf-real-20261029/API-ISOLATION.md`
- `scripts/e2e-arbio-fsf-real-20261029/ROTEIRO.md`
- `scripts/e2e-arbio-fsf-real-20261029/api-isolation-readonly.js`
- `scripts/e2e-arbio-fsf-real-20261029/checklist.json`
- `scripts/e2e-arbio-fsf-real-20261029/evidencia-preflight.schema.md`
- `scripts/e2e-arbio-fsf-real-20261029/evidencia-template.json`
- `scripts/e2e-arbio-fsf-real-20261029/preflight.py`
- `scripts/e2e-arbio-fsf-real-20261029/preflight.sh`
- `scripts/e2e-arbio-fsf-real-20261029/test_preflight.py`
- `scripts/financial-installments-initial-20261024/arbio-fsf-policy.draft.json`
- `scripts/financial-installments-initial-20261024/arbio-fsf-policy.full-term-20261028.superseded.json`
- `scripts/financial-installments-initial-20261024/arbio-fsf-policy.july2026.historical.json`
- `scripts/financial-installments-initial-20261024/audit-receivable-recursive.py`
- `scripts/financial-installments-initial-20261024/calendars/build-paracatu-2026-2027.py`
- `scripts/financial-installments-initial-20261024/calendars/paracatu-mg-2026-2027.json`
- `scripts/financial-installments-initial-20261024/calendars/paracatu-mg-2026.json`
- `scripts/financial-installments-initial-20261024/cancel-parties-credit.py`
- `scripts/financial-installments-initial-20261024/cancel-risk-composition.py`
- `scripts/financial-installments-initial-20261024/cancel-settings-deferred.py`
- `scripts/financial-installments-initial-20261024/financial-battery-live.json`
- `scripts/financial-installments-initial-20261024/payment-methods-readonly-capture-20261029.json`
- `scripts/financial-installments-initial-20261024/payment-methods-readonly-capture-homolog-20261029.json`
- `scripts/financial-installments-initial-20261024/price-schedule.py`
- `scripts/financial-installments-initial-20261024/receivable-history-diagnostic.sql.readonly`
- `scripts/financial-installments-initial-20261024/receivable-recursive-live-20261029.json`
- `scripts/financial-installments-initial-20261024/receivable-semantics-live-20261028.json`
- `scripts/financial-installments-initial-20261024/receivable-writers-dependencies-live-20261028.json`
- `scripts/financial-installments-initial-20261024/receivable-writers-live-20261028.json`
- `scripts/financial-installments-initial-20261024/test-arbio-fsf-override.py`
- `scripts/financial-installments-initial-20261024/test-arbio-fsf-reference.py`
- `scripts/financial-installments-initial-20261024/test-cancel-authorization.py`
- `scripts/financial-installments-initial-20261024/test-financial-battery.py`
- `scripts/financial-installments-initial-20261024/test-financial-provenance.py`
- `scripts/financial-installments-initial-20261024/test-receivable-red-green.py`
- `scripts/financial-installments-initial-20261024/test-receivable-semantics.py`
- `scripts/financial-price-generator-20261029/build-candidate.py`
- `scripts/financial-price-generator-20261029/credit-guard-trigger-columns.rollback.sql.review`
- `scripts/financial-price-generator-20261029/credit-guard-trigger-columns.sql.review`
- `scripts/financial-price-generator-20261029/price-generator.sql.review`
- `scripts/financial-price-generator-20261029/price-generator.template.sql`
- `scripts/financial-price-generator-20261029/shared-credit-guard.sql.review`
- `scripts/financial-price-generator-20261029/shared_guard_tests.py`
- `scripts/financial-price-generator-20261029/test-price-generator.py`
- `scripts/financial-price-generator-20261029/trigger_columns_tests.py`
- `scripts/fsf-client-link-20261029/link-partner-client.sql.review`
- `scripts/fsf-client-link-20261029/test-link-partner-client.py`
- `scripts/order-flow-direct-writes-20261027/README.md`
- `scripts/os-delivery-reopening-20261027/README.md`
- `scripts/os-delivery-reopening-20261027/SHA256SUMS`
- `scripts/os-delivery-reopening-20261027/build-candidate.py`
- `scripts/os-delivery-reopening-20261027/candidate-hardening.sql.review`
- `scripts/os-delivery-reopening-20261027/candidate-pins.json`
- `scripts/os-delivery-reopening-20261027/containment.sql.review`
- `scripts/os-delivery-reopening-20261027/live/cf_user_guards_v1.acquire_gate.sql.review`
- `scripts/os-delivery-reopening-20261027/live/definitions.json`
- `scripts/os-delivery-reopening-20261027/live/platform_private.stock_p1_guard.sql.review`
- `scripts/os-delivery-reopening-20261027/live/platform_private.stock_p1_movement_guard.sql.review`
- `scripts/os-delivery-reopening-20261027/live/public._refresh_esteira_laboratorio_after_change.sql.review`
- `scripts/os-delivery-reopening-20261027/live/public.fn_cockpit_assert_b2b_liberado.sql.review`
- `scripts/os-delivery-reopening-20261027/live/public.fn_cockpit_assert_operador_origem.sql.review`
- `scripts/os-delivery-reopening-20261027/live/public.fn_cockpit_norm_origem.sql.review`
- `scripts/os-delivery-reopening-20261027/live/public.fn_entrega_assert_confirmador.sql.review`
- `scripts/os-delivery-reopening-20261027/live/public.fn_entrega_confirmar_engine_v1.sql.review`
- `scripts/os-delivery-reopening-20261027/live/public.fn_entrega_marcar_cancelamento.sql.review`
- `scripts/os-delivery-reopening-20261027/live/public.fn_estoque_ctx_open.sql.review`
- `scripts/os-delivery-reopening-20261027/live/public.fn_estoque_ctx_read.sql.review`
- `scripts/os-delivery-reopening-20261027/live/public.fn_estoque_produto_guard.sql.review`
- `scripts/os-delivery-reopening-20261027/live/public.fn_h6c_entrega_ar_b2b_link.sql.review`
- `scripts/os-delivery-reopening-20261027/live/public.fn_ledger_append_only.sql.review`
- `scripts/os-delivery-reopening-20261027/live/public.fn_sync_entrega_financial_status.sql.review`
- `scripts/os-delivery-reopening-20261027/live/public.fn_validate_entrega_confirmacao.sql.review`
- `scripts/os-delivery-reopening-20261027/live/public.fn_validate_entrega_estoque.sql.review`
- `scripts/os-delivery-reopening-20261027/live/public.guard_tenant_organization_id.sql.review`
- `scripts/os-delivery-reopening-20261027/live/public.log_estoque_movimentacao.sql.review`
- `scripts/os-delivery-reopening-20261027/live/public.rpc_aprovar_os_v1.sql.review`
- `scripts/os-delivery-reopening-20261027/live/public.rpc_cockpit_cancelar_reserva_v1.sql.review`
- `scripts/os-delivery-reopening-20261027/live/public.rpc_cockpit_confirmar_entrega_v1.sql.review`
- `scripts/os-delivery-reopening-20261027/live/public.rpc_cockpit_criar_entrega_v1.sql.review`
- `scripts/os-delivery-reopening-20261027/live/public.rpc_entrega_cancelar_v1.sql.review`
- `scripts/os-delivery-reopening-20261027/live/public.rpc_entrega_confirmar_v1.sql.review`
- `scripts/os-delivery-reopening-20261027/live/public.rpc_programar_os_v1.sql.review`
- `scripts/os-delivery-reopening-20261027/live/public.tg_recalc_planning_from_entrega.sql.review`
- `scripts/os-delivery-reopening-20261027/live/public.trg_entrega_sync_partner_order_fn.sql.review`
- `scripts/os-delivery-reopening-20261027/live/public.update_updated_at_column.sql.review`
- `scripts/os-delivery-reopening-20261027/live/public.validate_estoque_entrada.sql.review`
- `scripts/os-delivery-reopening-20261027/live/public.validate_estoque_reserva.sql.review`
- `scripts/os-delivery-reopening-20261027/local-candidate-hashes.json`
- `scripts/os-delivery-reopening-20261027/postflight.sql`
- `scripts/os-delivery-reopening-20261027/preflight.sql`
- `scripts/os-delivery-reopening-20261027/release.sql.review`
- `scripts/os-delivery-reopening-20261027/results.txt`
- `scripts/os-delivery-reopening-20261027/test-local.py`
- `scripts/partner-order-items-owner-read-20261029/README.md`
- `scripts/partner-order-items-owner-read-20261029/install.sql.final.review`
- `scripts/partner-order-items-owner-read-20261029/install.sql.review`
- `scripts/partner-order-items-owner-read-20261029/pins.json`
- `scripts/partner-order-items-owner-read-20261029/postflight.sql.readonly`
- `scripts/partner-order-items-owner-read-20261029/preflight.sql.readonly`
- `scripts/partner-order-items-owner-read-20261029/rollback.sql.final.review`
- `scripts/partner-order-items-owner-read-20261029/rollback.sql.review`
- `scripts/partner-order-items-owner-read-20261029/test_items_owner_read.py`
- `scripts/partner-orders-owner-read-20261029/README.md`
- `scripts/partner-orders-owner-read-20261029/install.sql.final.review`
- `scripts/partner-orders-owner-read-20261029/install.sql.review`
- `scripts/partner-orders-owner-read-20261029/pins.json`
- `scripts/partner-orders-owner-read-20261029/postflight.sql.readonly`
- `scripts/partner-orders-owner-read-20261029/preflight.sql.readonly`
- `scripts/partner-orders-owner-read-20261029/rollback.sql.final.review`
- `scripts/partner-orders-owner-read-20261029/rollback.sql.review`
- `scripts/partner-orders-owner-read-20261029/test_owner_read.py`
- `scripts/rbac-audit/build-order-flow-matrix.py`
- `scripts/stock-envase-recovery-20261027/README.md`
- `scripts/stock-envase-recovery-20261027/SHA256SUMS`
- `scripts/stock-envase-recovery-20261027/assemble.py`
- `scripts/stock-envase-recovery-20261027/build-checks.py`
- `scripts/stock-envase-recovery-20261027/candidate.sql.review`
- `scripts/stock-envase-recovery-20261027/containment.sql.review`
- `scripts/stock-envase-recovery-20261027/live/catalog.json`
- `scripts/stock-envase-recovery-20261027/live/current-20261028.json`
- `scripts/stock-envase-recovery-20261027/live/functions.json`
- `scripts/stock-envase-recovery-20261027/live/platform_private.guard_manual_cq_parent_v1.sql.review`
- `scripts/stock-envase-recovery-20261027/live/platform_private.guard_manual_lot_delete_v1.sql.review`
- `scripts/stock-envase-recovery-20261027/live/platform_private.guard_manual_lot_write_v1.sql.review`
- `scripts/stock-envase-recovery-20261027/live/platform_private.guard_manual_program_binding_v1.sql.review`
- `scripts/stock-envase-recovery-20261027/live/platform_private.stock_motor_actor.sql.review`
- `scripts/stock-envase-recovery-20261027/live/platform_private.stock_motor_context_set.sql.review`
- `scripts/stock-envase-recovery-20261027/live/platform_private.stock_motor_item.sql.review`
- `scripts/stock-envase-recovery-20261027/live/platform_private.stock_motor_refs.sql.review`
- `scripts/stock-envase-recovery-20261027/live/platform_private.stock_p1_guard.sql.review`
- `scripts/stock-envase-recovery-20261027/live/platform_private.stock_p1_lote_owned.sql.review`
- `scripts/stock-envase-recovery-20261027/live/platform_private.stock_p1_movement_guard.sql.review`
- `scripts/stock-envase-recovery-20261027/live/platform_private.stock_p1_movement_owned.sql.review`
- `scripts/stock-envase-recovery-20261027/live/platform_private.trg_lab_lot_biological_only.sql.review`
- `scripts/stock-envase-recovery-20261027/live/platform_private.trg_lab_os_biological_only.sql.review`
- `scripts/stock-envase-recovery-20261027/live/platform_private.trg_lab_programming_biological_only.sql.review`
- `scripts/stock-envase-recovery-20261027/live/private.guard_os_separate_approval.sql.review`
- `scripts/stock-envase-recovery-20261027/live/public._comunicacao_trg_os_pronto_retirada.sql.review`
- `scripts/stock-envase-recovery-20261027/live/public._refresh_esteira_laboratorio_after_change.sql.review`
- `scripts/stock-envase-recovery-20261027/live/public._saas_trg_require_feature.sql.review`
- `scripts/stock-envase-recovery-20261027/live/public._sync_planning_from_os.sql.review`
- `scripts/stock-envase-recovery-20261027/live/public.check_os_item_ref.sql.review`
- `scripts/stock-envase-recovery-20261027/live/public.check_os_status_transition.sql.review`
- `scripts/stock-envase-recovery-20261027/live/public.fn_cockpit_ctx_programacao.sql.review`
- `scripts/stock-envase-recovery-20261027/live/public.fn_cockpit_is_gestor.sql.review`
- `scripts/stock-envase-recovery-20261027/live/public.fn_create_programacao_on_os_classica_insert.sql.review`
- `scripts/stock-envase-recovery-20261027/live/public.fn_envase_avanca_os.sql.review`
- `scripts/stock-envase-recovery-20261027/live/public.fn_envase_material_imutavel.sql.review`
- `scripts/stock-envase-recovery-20261027/live/public.fn_estoque_ctx_close.sql.review`
- `scripts/stock-envase-recovery-20261027/live/public.fn_estoque_ctx_force.sql.review`
- `scripts/stock-envase-recovery-20261027/live/public.fn_estoque_ctx_open.sql.review`
- `scripts/stock-envase-recovery-20261027/live/public.fn_estoque_ctx_read.sql.review`
- `scripts/stock-envase-recovery-20261027/live/public.fn_estoque_fingerprint.sql.review`
- `scripts/stock-envase-recovery-20261027/live/public.fn_estoque_pode_operar.sql.review`
- `scripts/stock-envase-recovery-20261027/live/public.fn_estoque_produto_guard.sql.review`
- `scripts/stock-envase-recovery-20261027/live/public.fn_ledger_append_only.sql.review`
- `scripts/stock-envase-recovery-20261027/live/public.fn_notify_lab_on_programacao.sql.review`
- `scripts/stock-envase-recovery-20261027/live/public.fn_sync_os_classica_downstream.sql.review`
- `scripts/stock-envase-recovery-20261027/live/public.fn_validate_envase_cq.sql.review`
- `scripts/stock-envase-recovery-20261027/live/public.fn_validate_envase_volume.sql.review`
- `scripts/stock-envase-recovery-20261027/live/public.guard_tenant_organization_id.sql.review`
- `scripts/stock-envase-recovery-20261027/live/public.log_estoque_movimentacao.sql.review`
- `scripts/stock-envase-recovery-20261027/live/public.lote_volume_envasado.sql.review`
- `scripts/stock-envase-recovery-20261027/live/public.rpc_cockpit_cancelar_reserva_v1.sql.review`
- `scripts/stock-envase-recovery-20261027/live/public.rpc_cockpit_registrar_envase_v1.sql.review`
- `scripts/stock-envase-recovery-20261027/live/public.rpc_criar_embalagens_pos_envase.sql.review`
- `scripts/stock-envase-recovery-20261027/live/public.rpc_estoque_operar_v1.sql.review`
- `scripts/stock-envase-recovery-20261027/live/public.rpc_estoque_reservar_v1.sql.review`
- `scripts/stock-envase-recovery-20261027/live/public.set_numero_os_regular.sql.review`
- `scripts/stock-envase-recovery-20261027/live/public.stock_p1_lote_owned.sql.review`
- `scripts/stock-envase-recovery-20261027/live/public.stock_p1_movement_owned.sql.review`
- `scripts/stock-envase-recovery-20261027/live/public.tg_protect_os_structural_fields.sql.review`
- `scripts/stock-envase-recovery-20261027/live/public.tg_recalc_planning_from_os.sql.review`
- `scripts/stock-envase-recovery-20261027/live/public.trg_os_sync_partner_order_fn.sql.review`
- `scripts/stock-envase-recovery-20261027/live/public.update_updated_at_column.sql.review`
- `scripts/stock-envase-recovery-20261027/live/public.validate_estoque_entrada.sql.review`
- `scripts/stock-envase-recovery-20261027/live/public.validate_estoque_reserva.sql.review`
- `scripts/stock-envase-recovery-20261027/live/public.validate_responsavel_producao.sql.review`
- `scripts/stock-envase-recovery-20261027/local-post-hashes.json`
- `scripts/stock-envase-recovery-20261027/postflight.sql`
- `scripts/stock-envase-recovery-20261027/preflight.sql`
- `scripts/stock-envase-recovery-20261027/release.sql.review`
- `scripts/stock-envase-recovery-20261027/results.txt`
- `scripts/stock-envase-recovery-20261027/test-local.py`
- `scripts/visit-approval-submit-20261027/README.md`
- `scripts/visit-approval-submit-20261027/SHA256SUMS`
- `scripts/visit-approval-submit-20261027/baseline.sql`
- `scripts/visit-approval-submit-20261027/candidate.sql.review`
- `scripts/visit-approval-submit-20261027/delta-frontend.diff`
- `scripts/visit-approval-submit-20261027/delta-sql.diff`
- `scripts/visit-approval-submit-20261027/installed.sql.review`
- `scripts/visit-approval-submit-20261027/postflight-installed.sql`
- `scripts/visit-approval-submit-20261027/postflight.sql`
- `scripts/visit-approval-submit-20261027/preflight.sql`
- `scripts/visit-approval-submit-20261027/results.txt`
- `scripts/visit-approval-submit-20261027/rollback-containment.sql.review`
- `scripts/visit-approval-submit-20261027/test-local.py`
- `scripts/visit-field-cas-20261027/README.md`
- `scripts/visit-field-cas-20261027/SHA256SUMS`
- `scripts/visit-field-cas-20261027/applied-write-only.sql.review`
- `scripts/visit-field-cas-20261027/baseline.sql`
- `scripts/visit-field-cas-20261027/candidate.sql.review`
- `scripts/visit-field-cas-20261027/delta-frontend-fe6fc410.diff`
- `scripts/visit-field-cas-20261027/delta-frontend.diff`
- `scripts/visit-field-cas-20261027/delta-sql-fe6fc410.diff`
- `scripts/visit-field-cas-20261027/delta-sql.diff`
- `scripts/visit-field-cas-20261027/postflight.sql`
- `scripts/visit-field-cas-20261027/preflight.sql`
- `scripts/visit-field-cas-20261027/results-frontend.txt`
- `scripts/visit-field-cas-20261027/results-sql.txt`
- `scripts/visit-field-cas-20261027/rollback-containment.sql.review`
- `scripts/visit-field-cas-20261027/test-local.py`
- `scripts/visit-field-cas-20261027/verify-write-only-readonly.sql`
- `scripts/visit-monitoring-plan-20261027/agronomic-origin/README.md`
- `scripts/visit-monitoring-plan-20261027/agronomic-origin/SHA256SUMS`
- `scripts/visit-monitoring-plan-20261027/agronomic-origin/candidate.sql.review`
- `scripts/visit-monitoring-plan-20261027/agronomic-origin/client.diff`
- `scripts/visit-monitoring-plan-20261027/agronomic-origin/postflight.sql`
- `scripts/visit-monitoring-plan-20261027/agronomic-origin/preflight.sql`
- `scripts/visit-monitoring-plan-20261027/agronomic-origin/review-533d329.diff`
- `scripts/visit-monitoring-plan-20261027/agronomic-origin/review-6dd3.diff`
- `scripts/visit-monitoring-plan-20261027/agronomic-origin/review-direct-write.diff`
- `scripts/visit-monitoring-plan-20261027/agronomic-origin/rollback-containment.sql.review`
- `scripts/visit-monitoring-plan-20261027/agronomic-origin/test-local.py`
- `scripts/visit-monitoring-plan-20261027/agronomic-origin/write-closure/README.md`
- `scripts/visit-monitoring-plan-20261027/agronomic-origin/write-closure/SHA256SUMS`
- `scripts/visit-monitoring-plan-20261027/agronomic-origin/write-closure/candidate.sql.review`
- `scripts/visit-monitoring-plan-20261027/agronomic-origin/write-closure/delta.diff`
- `scripts/visit-monitoring-plan-20261027/agronomic-origin/write-closure/postflight.sql`
- `scripts/visit-monitoring-plan-20261027/agronomic-origin/write-closure/preflight.sql`
- `scripts/visit-monitoring-plan-20261027/agronomic-origin/write-closure/results.txt`
- `scripts/visit-monitoring-plan-20261027/agronomic-origin/write-closure/rollback-containment.sql.review`
- `scripts/visit-monitoring-plan-20261027/agronomic-origin/write-closure/rpc_atualizar_status_alerta_agronomico_v1.baseline.sql`
- `scripts/visit-monitoring-plan-20261027/agronomic-origin/write-closure/rpc_criar_alerta_climatico_v1.baseline.sql`
- `scripts/visit-monitoring-plan-20261027/agronomic-origin/write-closure/rpc_reprogramar_monitoramento_v1.baseline.sql`
- `scripts/visit-monitoring-plan-20261027/agronomic-origin/write-closure/test-local.py`

### Documentos, planos, evidências e regras

- `.lovable/plan.md`
- `.lovable/plan/auditoria-do-fluxo-de-pedido-b2b-catálogo-fiscal-2026-10-27.md`
- `.lovable/plan/fluxo-do-pedido-b2b-do-parceiro-à-emissão-fiscal-2026-10-27.md`
- `.lovable/plan/plano-de-correção-do-fluxo-de-pedido-b2b-2026-10-27.md`
- `.lovable/plan/plano-de-correção-do-fluxo-de-pedido-b2b-por-etapas-2026-10-27.md`
- `AGENTS.md`
- `docs/auditorias/arbio-fsf-politica-draft-20261028.md`
- `docs/auditorias/arbio-fsf-politica-superveniente-20261028.md`
- `docs/auditorias/auditoria-final-fluxo-b2b-20261028.md`
- `docs/auditorias/bateria-financeira-b2b-20261028.md`
- `docs/auditorias/cadastro-financeiro-diferido-offline-20261029.md`
- `docs/auditorias/cadeia-financeira-offline-20261029.md`
- `docs/auditorias/cancelamento-parcela-autorizacao-20261029.md`
- `docs/auditorias/carteira-empresa-owner-read-20261030.md`
- `docs/auditorias/consumidor-real-entrega-20261028.md`
- `docs/auditorias/escritores-saldo-canonico-20261028.md`
- `docs/auditorias/etapa6-consumidor-financeiro-20261028.md`
- `docs/auditorias/etapas5-6-contratos-os-entrega-estoque-20261028.md`
- `docs/auditorias/evidencias-arbio-fsf-20261028/execucao.json`
- `docs/auditorias/evidencias-arbio-fsf-20261028/matriz.csv`
- `docs/auditorias/evidencias-arbio-fsf-20261028/resultados-pg.json`
- `docs/auditorias/evidencias-arbio-fsf-20261028/resumo.json`
- `docs/auditorias/evidencias-arbio-fsf-definitiva-20261028/execucao.json`
- `docs/auditorias/evidencias-arbio-fsf-definitiva-20261028/matriz.csv`
- `docs/auditorias/evidencias-arbio-fsf-definitiva-20261028/resultados.json`
- `docs/auditorias/evidencias-arbio-fsf-override-20261028/execucao.json`
- `docs/auditorias/evidencias-arbio-fsf-override-20261028/matriz.csv`
- `docs/auditorias/evidencias-arbio-fsf-override-20261028/resultados.json`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/SHA256SUMS`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1428/SHA256SUMS`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1428/failed-intermediate-run.txt`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1428/historical-hash-verification.json`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1428/independent-review.md`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1428/matrix.csv`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1428/pg-run.txt`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1428/results.json`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1428/rpc-captured.txt`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1428/rpc-offline-transformation.diff`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1428/vitest-run.txt`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1450/SHA256SUMS`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1450/cancel-authorization-revision-final/matrix.csv`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1450/cancel-authorization-revision-final/results.json`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1450/cancel-authorization-revision-final/rpc-captured.txt`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1450/cancel-authorization-revision-final/rpc-offline-transformation.diff`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1450/cancel-authorization-revision-risk/matrix.csv`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1450/cancel-authorization-revision-risk/results.json`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1450/cancel-authorization-revision-risk/rpc-captured.txt`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1450/cancel-authorization-revision-risk/rpc-offline-transformation.diff`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1450/historical-hashes-after.json`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1450/historical-hashes-before.json`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1450/independent-review.md`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1450/monetary/red-green.json`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1450/provenance-final/provenance.json`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1450/provenance/provenance.json`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1458/SHA256SUMS`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1458/historical-integrity.json`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1458/independent-review.md`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1458/matrix.csv`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1458/null-kind-only.diff`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1458/results.json`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1458/rpc-captured.txt`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1458/rpc-offline-transformation.diff`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1503/SHA256SUMS`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1503/authorization-cancel-authorization-revision-1503/deferred-settings-sandbox.diff`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1503/authorization-cancel-authorization-revision-1503/null-kind-only.diff`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1503/authorization-cancel-authorization-revision-1503/rpc-captured.txt`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1503/authorization-cancel-authorization-revision-1503/rpc-offline-transformation.diff`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1503/consumer-proposal.md`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1503/final-cancel-authorization-revision-1503/deferred-settings-sandbox.diff`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1503/final-cancel-authorization-revision-1503/matrix.csv`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1503/final-cancel-authorization-revision-1503/null-kind-only.diff`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1503/final-cancel-authorization-revision-1503/results.json`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1503/final-cancel-authorization-revision-1503/rpc-captured.txt`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1503/final-cancel-authorization-revision-1503/rpc-offline-transformation.diff`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1503/historical-integrity-after.json`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1503/historical-integrity-before.json`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1503/historical-preservation.json`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1503/monetary/red-green.json`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1503/provenance/provenance.json`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1503/source-hashes.json`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1536-git-supplement-1558/SHA256SUMS.versioned`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1536-git-supplement-1558/check-git-tree.py`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1536-git-supplement-1558/source-manifest-reconciliation.json`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1536-git-supplement-1558/transcripts/attempt1.txt`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1536-git-supplement-1558/transcripts/attempt10.txt`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1536-git-supplement-1558/transcripts/attempt11.txt`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1536-git-supplement-1558/transcripts/attempt2.txt`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1536-git-supplement-1558/transcripts/attempt3.txt`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1536-git-supplement-1558/transcripts/attempt4.txt`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1536-git-supplement-1558/transcripts/attempt5.txt`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1536-git-supplement-1558/transcripts/attempt6.txt`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1536-git-supplement-1558/transcripts/attempt7.txt`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1536-git-supplement-1558/transcripts/attempt8.txt`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1536-git-supplement-1558/transcripts/attempt9.txt`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1536-git-supplement-1558/transcripts/monetary.txt`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1536-git-supplement-1558/transcripts/postgres.txt`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1536-git-supplement-1558/transcripts/provenance.txt`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1536-git-supplement-1558/transcripts/vitest-final.txt`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1536-git-supplement-1558/transcripts/vitest-intermediate1.txt`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1536-git-supplement-1558/transcripts/vitest.txt`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1536/SHA256SUMS`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1536/final-cancel-authorization-revision-1536/deferred-settings-sandbox.diff`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1536/final-cancel-authorization-revision-1536/matrix.csv`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1536/final-cancel-authorization-revision-1536/null-kind-only.diff`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1536/final-cancel-authorization-revision-1536/parties-credit-captured-impl.txt`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1536/final-cancel-authorization-revision-1536/parties-credit-sandbox.diff`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1536/final-cancel-authorization-revision-1536/results.json`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1536/final-cancel-authorization-revision-1536/rpc-captured.txt`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1536/final-cancel-authorization-revision-1536/rpc-offline-transformation.diff`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1536/history-integrity.json`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1536/monetary/red-green.json`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1536/provenance/provenance.json`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization/SHA256SUMS`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization/independent-review.md`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization/matrix.csv`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization/results.json`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization/rpc-captured.txt`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization/rpc-offline-transformation.diff`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/closure.json`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/consumers-current.json`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/consumers-prior-inventory.json`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/dependency-edges.csv`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/drift.json`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/e2e-preflight-evidence-1955/AGENTS.md`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/e2e-preflight-evidence-1955/MANIFEST.sha256`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/e2e-preflight-evidence-1955/README.md`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/e2e-preflight-evidence-1955/ROTEIRO.md`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/e2e-preflight-evidence-1955/checklist.json`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/e2e-preflight-evidence-1955/evidencia-preflight.schema.md`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/e2e-preflight-evidence-1955/preflight-sem-evidencia.txt`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/e2e-preflight-evidence-1955/preflight-tests.txt`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/e2e-preflight-evidence-1955/preflight.py`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/e2e-preflight-evidence-1955/preflight.sh`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/e2e-preflight-evidence-1955/test_preflight.py`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/e2e-preflight-root-type-2000/MANIFEST.sha256`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/e2e-preflight-root-type-2000/README.md`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/e2e-preflight-root-type-2000/preflight-tests.txt`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/e2e-preflight-root-type-2000/preflight.py`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/e2e-preflight-root-type-2000/test_preflight.py`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/e2e-prep-review-1950/AGENTS.md`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/e2e-prep-review-1950/MANIFEST.sha256`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/e2e-prep-review-1950/README.md`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/e2e-prep-review-1950/ROTEIRO.md`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/e2e-prep-review-1950/checklist.json`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/e2e-prep-review-1950/preflight-default.txt`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/e2e-prep-review-1950/preflight-tests.txt`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/e2e-prep-review-1950/preflight.sh`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/e2e-prep-review-1950/test_preflight.py`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/execution-summary.json`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/incremental-integrated-2110/SHA256SUMS`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/incremental-integrated-2110/integrated-results.json`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/incremental-integrated-2110/red-baseline-self-approval.txt`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/incremental-prep-2015/AGENTS-budget-supplement.txt`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/incremental-prep-2015/SHA256SUMS`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/incremental-prep-2015/approval-results.json`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/incremental-prep-2015/approval-tests.txt`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/incremental-prep-2015/client-link-results.json`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/incremental-prep-2015/client-link-tests.txt`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/incremental-prep-2015/p0-red-green-tests.txt`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/incremental-prep-2015/p0-red-green/red-green.json`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/incremental-prep-2015/p0-tests.txt`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/incremental-prep-2015/p0/execucao.json`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/incremental-prep-2015/p0/matriz.csv`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/incremental-prep-2015/preflight-tests.txt`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/incremental-prep-2015/price-shared-results.json`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/incremental-prep-2015/price-shared-tests.txt`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/incremental-prep-2015/vitest.txt`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/incremental-stack-2028/SHA256SUMS`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/incremental-stack-2028/component-results.json`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/incremental-stack-2028/lexical-closure.json`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/incremental-stack-2028/restoration-results.json`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/incremental-stack-2107/restoration-results.json`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/independent-review.md`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/matrix.csv`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/object-pins.csv`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/partner-order-items-owner-read/SHA256SUMS`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/partner-order-items-owner-read/results.json`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/partner-orders-owner-read/SHA256SUMS`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/partner-orders-owner-read/results.json`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/payment-method-aliases-homolog-1842/SHA256SUMS`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/payment-method-aliases-homolog-1842/arbio-fsf-policy.draft.json`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/payment-method-aliases-homolog-1842/payment-methods-readonly-capture-20261029.json`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/payment-method-aliases-homolog-1842/payment-methods-readonly-capture-homolog-20261029.json`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/payment-method-aliases-homolog-1842/price-schedule.json`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/payment-method-boleto-1836/SHA256SUMS`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/payment-method-boleto-1836/policy-snapshot.json`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/payment-method-boleto-1836/price-schedule.json`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/payment-method-boleto-catalog-1841/SHA256SUMS`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/payment-method-boleto-catalog-1841/payment-methods-readonly-capture-20261029.json`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/payment-method-boleto-catalog-1841/price-schedule.json`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/price-authority-1753/SHA256SUMS.versioned`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/price-authority-1753/check-git-tree.py`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/price-authority-1753/check-previous-1749.txt`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/price-authority-1753/full-term-superseded-override/execucao.json`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/price-authority-1753/full-term-superseded-override/matriz.csv`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/price-authority-1753/full-term-superseded-override/resultados.json`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/price-authority-1753/override-superseded-run.txt`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/price-authority-1753/price-run.txt`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/price-authority-1753/results.json`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/price-authority-1753/vitest-final.txt`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/price-calendar-1800/SHA256SUMS.versioned`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/price-calendar-1800/check-git-tree.py`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/price-calendar-1800/check-previous-1753-vs-72c6c72.txt`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/price-calendar-1800/full-term-superseded-override/execucao.json`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/price-calendar-1800/full-term-superseded-override/matriz.csv`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/price-calendar-1800/full-term-superseded-override/resultados.json`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/price-calendar-1800/override-superseded-run.txt`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/price-calendar-1800/price-run.txt`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/price-calendar-1800/results.json`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/price-calendar-1800/vitest-final.txt`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/price-calendar-paracatu-1810/SHA256SUMS.versioned`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/price-calendar-paracatu-1810/historical-superseded.txt`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/price-calendar-paracatu-1810/paracatu-mg-2026.dataset-copy.json`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/price-calendar-paracatu-1810/price-results.json`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/price-calendar-paracatu-1810/price-summary.txt`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/price-calendar-paracatu-1810/vitest-isolated-rerun.txt`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/price-calendar-paracatu-1810/vitest.txt`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/price-calendar-paracatu-2027-1825/SHA256SUMS.versioned`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/price-calendar-paracatu-2027-1825/build-script-copy.py.txt`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/price-calendar-paracatu-2027-1825/historical-superseded.txt`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/price-calendar-paracatu-2027-1825/paracatu-mg-2026-2027.dataset-copy.json`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/price-calendar-paracatu-2027-1825/price-results.json`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/price-calendar-paracatu-2027-1825/price-summary.txt`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/price-calendar-paracatu-2027-1825/vitest-price.txt`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/price-generator-pg-1840/SHA256SUMS.versioned`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/price-generator-pg-1840/price-generator.sql.review.copy.txt`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/price-generator-pg-1840/results.json`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/price-generator-pg-1840/run.txt`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/price-generator-pg-canonical-exposure-1849/SHA256SUMS`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/price-generator-pg-canonical-exposure-1849/candidate.sql.review.snapshot`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/price-generator-pg-canonical-exposure-1849/homolog-reference-readonly-20261029.txt`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/price-generator-pg-canonical-exposure-1849/original-p0-red-green.run.txt`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/price-generator-pg-canonical-exposure-1849/original-p0-red-green/red-green.json`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/price-generator-pg-canonical-exposure-1849/pg-run.txt`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/price-generator-pg-canonical-exposure-1849/results.json`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/price-generator-pg-partner-context-1855/SHA256SUMS`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/price-generator-pg-partner-context-1855/candidate.sql.review.snapshot`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/price-generator-pg-partner-context-1855/original-p0-red-green.run.txt`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/price-generator-pg-partner-context-1855/original-p0-red-green/red-green.json`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/price-generator-pg-partner-context-1855/pg-run.txt`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/price-generator-pg-partner-context-1855/production-readonly-and-authorization-20261029.txt`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/price-generator-pg-partner-context-1855/results.json`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/price-generator-pg-replay-reauth-1843/SHA256SUMS`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/price-generator-pg-replay-reauth-1843/candidate.sql.review.snapshot`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/price-generator-pg-replay-reauth-1843/original-p0-red-green.run.txt`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/price-generator-pg-replay-reauth-1843/original-p0-red-green/red-green.json`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/price-generator-pg-replay-reauth-1843/pg-run.txt`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/price-generator-pg-replay-reauth-1843/results.json`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/price-generator-pg-review-1845/SHA256SUMS`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/price-generator-pg-review-1845/candidate.sql.review.snapshot`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/price-generator-pg-review-1845/original-p0-red-green.run.txt`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/price-generator-pg-review-1845/original-p0-red-green/red-green.json`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/price-generator-pg-review-1845/pg-run.txt`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/price-generator-pg-review-1845/results.json`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/price-schedule-1741/SHA256SUMS.versioned`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/price-schedule-1741/check-git-tree.py`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/price-schedule-1741/price-run.txt`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/price-schedule-1741/results.json`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/price-schedule-1741/vitest-final.txt`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/price-schedule-1749/SHA256SUMS.versioned`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/price-schedule-1749/check-git-tree.py`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/price-schedule-1749/check-previous-1741-vs-69acee5.txt`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/price-schedule-1749/price-run.txt`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/price-schedule-1749/results.json`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/price-schedule-1749/vitest-final.txt`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/red-green.json`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/replay-rowlock-ui-1935/MANIFEST.sha256`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/replay-rowlock-ui-1935/README.md`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/replay-rowlock-ui-1935/link-partner-client.sql.review.snapshot`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/replay-rowlock-ui-1935/pg-run.txt`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/replay-rowlock-ui-1935/red-previous-candidate.txt`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/replay-rowlock-ui-1935/results.json`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/replay-rowlock-ui-1935/vitest.txt`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/review-fixes-1925/SHA256SUMS`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/review-fixes-1925/fsf-link-new-tests-vs-previous-candidate.txt`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/review-fixes-1925/fsf-link-pg-run.txt`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/review-fixes-1925/fsf-link-results.json`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/review-fixes-1925/link-partner-client.sql.review.snapshot`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/review-fixes-1925/original-p0-red-green.run.txt`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/review-fixes-1925/original-p0-red-green/red-green.json`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/review-fixes-1925/price-and-shared-guard-pg-run.txt`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/review-fixes-1925/price-and-shared-guard-results.json`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/review-fixes-1925/real-reference-confirmed.txt`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/review-fixes-1925/shared-credit-guard.sql.review.snapshot`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/review-fixes-1925/verify-manifest-1905.txt`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/review-fixes-1925/vitest-credit-block-reason.txt`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/shared-credit-fsf-link-1905/SHA256SUMS`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/shared-credit-fsf-link-1905/fsf-link-pg-run.txt`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/shared-credit-fsf-link-1905/fsf-link-results.json`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/shared-credit-fsf-link-1905/link-partner-client.sql.review.snapshot`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/shared-credit-fsf-link-1905/original-p0-red-green.run.txt`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/shared-credit-fsf-link-1905/original-p0-red-green/red-green.json`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/shared-credit-fsf-link-1905/price-and-shared-guard-pg-run.txt`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/shared-credit-fsf-link-1905/price-and-shared-guard-results.json`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/shared-credit-fsf-link-1905/real-reference-vs-fixture.txt`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/shared-credit-fsf-link-1905/shared-credit-guard.sql.review.snapshot`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/shared-credit-fsf-link-1905/verify-manifest-1855.txt`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/trigger-columns-e2e-prep-1945/MANIFEST.sha256`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/trigger-columns-e2e-prep-1945/README.md`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/trigger-columns-e2e-prep-1945/credit-guard-trigger-columns.rollback.sql.review`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/trigger-columns-e2e-prep-1945/credit-guard-trigger-columns.sql.review`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/trigger-columns-e2e-prep-1945/inventory.json`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/trigger-columns-e2e-prep-1945/p0-red-green.txt`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/trigger-columns-e2e-prep-1945/pg-run.txt`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/trigger-columns-e2e-prep-1945/preflight.txt`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/trigger-columns-e2e-prep-1945/results.json`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/trigger-columns-e2e-prep-1945/trigger_columns_tests.py`
- `docs/auditorias/evidencias-cadeia-financeira-20261029/trigger-columns-e2e-prep-1945/vitest.txt`
- `docs/auditorias/evidencias-consumidor-entrega-20261028/baseline.txt`
- `docs/auditorias/evidencias-consumidor-entrega-20261028/vitest.txt`
- `docs/auditorias/evidencias-escritores-saldo-20261028/SHA256SUMS`
- `docs/auditorias/evidencias-escritores-saldo-20261028/execucao.json`
- `docs/auditorias/evidencias-escritores-saldo-20261028/matriz-consumidores-runtime.csv`
- `docs/auditorias/evidencias-escritores-saldo-20261028/matriz-escritores-leitores-sql.csv`
- `docs/auditorias/evidencias-escritores-saldo-20261028/matriz.csv`
- `docs/auditorias/evidencias-escritores-saldo-20261028/pinos-drift.json`
- `docs/auditorias/evidencias-financeiro-b2b-20261028/execucao.json`
- `docs/auditorias/evidencias-financeiro-b2b-20261028/fixtures-decimal.json`
- `docs/auditorias/evidencias-financeiro-b2b-20261028/matriz-financeira.csv`
- `docs/auditorias/evidencias-financeiro-b2b-20261028/resultados-pg.json`
- `docs/auditorias/evidencias-financeiro-b2b-20261028/resumo.json`
- `docs/auditorias/evidencias-fluxo-b2b-20261028/a2-pg.txt`
- `docs/auditorias/evidencias-fluxo-b2b-20261028/additional-vitest.txt`
- `docs/auditorias/evidencias-fluxo-b2b-20261028/broad-vitest.txt`
- `docs/auditorias/evidencias-fluxo-b2b-20261028/combined-vitest.txt`
- `docs/auditorias/evidencias-fluxo-b2b-20261028/delivery-pg.txt`
- `docs/auditorias/evidencias-fluxo-b2b-20261028/stock-pg.txt`
- `docs/auditorias/evidencias-saldo-canonico-20261028/SHA256SUMS`
- `docs/auditorias/evidencias-saldo-canonico-20261028/execucao.json`
- `docs/auditorias/evidencias-saldo-canonico-20261028/matriz.csv`
- `docs/auditorias/matriz-auditoria-fluxo-b2b-20261028-resumo.json`
- `docs/auditorias/matriz-auditoria-fluxo-b2b-20261028.csv`
- `docs/auditorias/partes-credito-offline-20261029.md`
- `docs/auditorias/price-parcelamento-offline-20261029.md`
- `docs/auditorias/reconciliacao-fluxo-pedido-b2b-20261028-inventario.md`
- `docs/auditorias/reconciliacao-fluxo-pedido-b2b-20261028.md`
- `docs/auditorias/roteiro-real-fluxo-b2b-20261028.md`
- `docs/auditorias/saldo-canonico-recebiveis-20261028.md`
- `roadmap.md`
- `scripts/arbio-fsf-incremental-20261029/AGENTS.md`
- `scripts/business-conflicts-cockpit-application-20261027/AGENTS.md`
- `scripts/catalog-label-conflicts-20261027/AGENTS.md`
- `scripts/delivery-billing-scope-20261027/AGENTS.md`
- `scripts/delivery-finance-a2-20261028/AGENTS.md`
- `scripts/delivery-stock-release-20261027/AGENTS.md`
- `scripts/e2e-arbio-fsf-real-20261029/AGENTS.md`
- `scripts/financial-installments-initial-20261024/AGENTS.md`
- `scripts/financial-price-generator-20261029/AGENTS.md`
- `scripts/fsf-client-link-20261029/AGENTS.md`
- `scripts/os-delivery-reopening-20261027/AGENTS.md`
- `scripts/partner-order-items-owner-read-20261029/AGENTS.md`
- `scripts/partner-orders-owner-read-20261029/AGENTS.md`
- `scripts/stock-envase-recovery-20261027/AGENTS.md`
- `scripts/visit-approval-submit-20261027/AGENTS.md`
- `scripts/visit-field-cas-20261027/AGENTS.md`
- `scripts/visit-monitoring-plan-20261027/agronomic-origin/AGENTS.md`
- `scripts/visit-monitoring-plan-20261027/agronomic-origin/write-closure/AGENTS.md`
- `src/hooks/AGENTS.md`
