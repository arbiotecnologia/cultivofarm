# Gate técnico de publicação — runtime 7c38bc48 → 4acf7dfe

## Escopo e decisão

Referência documentada: `7c38bc4887e86efaca4dd6a820da2c9d8247a89d`.
Runtime avaliado: `4acf7dfe7147c34c5eaa435bc539e2c0a13e3fac`.
O inventário completo agora está no repositório:

- `docs/auditorias/gate-publicacao-inventario-20261030.md`
- `docs/auditorias/gate-publicacao-diff-stat-20261030.txt`
- `docs/auditorias/gate-publicacao-diff-nomes-20261030.txt`

**PASS do gate de regressão simulada; NO-GO para classificar a publicação inteira
como patch exclusivamente textual.** Não foi comprovado defeito funcional novo que
justifique editar runtime nesta rodada. Os 26 arquivos de aplicação permanecem
idênticos ao runtime 4acf7dfe; mudanças desta rodada são documentação, regras e testes.
Nenhuma publicação, SQL, chamada a produção, cobrança/NF ou dispatch real.

O NO-GO não depende de exigir cobranças/NF reais: essas operações seguem proibidas.
Os bloqueios abaixo são contratos/limitações documentadas, não uma lista genérica
de “faltou certificar”. A aprovação de publicação do conjunto de contenções deve
considerar esses efeitos; testes de transporte não instalam os contratos faltantes.

## Execução reproduzível sem rede

Configuração: `src/test/config/runtimeGate.vitest.config.ts`, herda a configuração
do projeto, acrescenta `runtimeGateNoNetwork.ts`, timeout de teste/hook 10s.
`fetch` e `XMLHttpRequest.open` reais lançam antes da conexão; Supabase/Auth são
mockados nos testes de interação; IndexedDB usa `fake-indexeddb`, QueryClient real.
Nenhum teste PG/hosted foi incluído. Dois testes verificam o próprio bloqueio de rede.
Cada grupo foi limitado externamente a 180s, dois grupos simultâneos, dois workers
por grupo. Comandos e tempos estão em `gate-runtime-20261030/execution.json`;
nomes/assertions/duração completos estão nos JSONs por grupo. Complemento: mesmo
comando/configuração, arquivos registrados no JSON/log, limite 180s.

```text
bun run test -- --config src/test/config/runtimeGate.vitest.config.ts --maxWorkers=2 --reporter=default --reporter=json --outputFile=<arquivo> <testes do grupo>
```

| Grupo | PASS | FAIL | Tempo de execução |
|---|---:|---:|---:|
| Carteira/cotação | 44 | 0 | 20,57s |
| Entrega/financeiro | 61 | 0 | 24,53s |
| Campo/monitoramento | 158 | 0 | 45,03s |
| Planejamento/portal/catálogo | 64 | 0 | 26,88s |
| Complemento direto filas/reserva/cache/página/Cockpit | 73 | 0 | 20,11s Vitest |
| Bloqueio do transporte real | 2 | 0 | 2,49s Vitest |

**388 testes únicos em 30 arquivos**, zero skip final. Não somar os 14 testes de
financeiro repetidos no complemento: o teste de chave/cache é a única adição desse
arquivo. Primeira execução complementar: 66 PASS/2 FAIL; ambos eram erro da
especificação do teste, que chamava `syncAll()` duas vezes explicitamente e rotulava
a segunda chamada como retry automático. O contrato atual só quarentena PT409;
42501/08006 retêm `sync_error` e permitem sincronização explicitamente solicitada.
Teste corrigido para distinguir as duas situações, sem alterar produção ou runtime.
Log e JSON iniciais preservados; não escondemos falha nem alegamos correção funcional.
Warnings de React Router e alguns `act` permanecem nos logs, sem falha/assertion
ignorada. Testes de ACK inválido produzem erros sintéticos esperados no console.

## Cobertura dos 26 arquivos de aplicação

| Arquivo runtime (todos sob src/) | Evidência simulada executada |
|---|---|
| components/comercial/CommercialOwnerOrdersSection.tsx | commercialOwnerOrders: sete sobrepostos, parcial, vazio no filtro, refresh/erro/negação/escopo/papéis |
| lib/comercial/commercialOwnerOrders.ts | parser de envelope/tenant + classificação rows/already_listed/empty_filter |
| components/comercial/ResponderCotacaoDialog.tsx | responderCotacaoCreditReason: resposta conhecida/desconhecida, sem autoridade adicional |
| components/comercial/creditBlockReason.ts | creditBlockReason: mapeamento seguro e razão desconhecida |
| components/entregas/ConfirmarEntregaDialog.tsx | confirmacaoEntregaAck: UUID/ACK, duplo envio, timeout e resultado tardio |
| pages/Entregas.tsx | consumidorEntrega: 23 casos, falha parcial/ACK perdido/travas/fences/split sem rollback fictício |
| lib/entregas/payloadEntrega.ts | registroEntrega: whitelist/UUID/replay/sem success; sem volume como autoridade |
| components/financeiro/ConfirmarEntregaFinanceiroDialog.tsx | deliveryFinanceReconciliation: categoria RECEITA/método ativo, draft, erro vs recibo, zero RPC financeiro/fiscal |
| hooks/useDeliveryFinanceReconciliation.ts | mesmo teste + chave real/invalidação exata/desmontagem e cache do título |
| hooks/useEsteiraLaboratorio.ts | reservaDeferredRuntimeGate: UUID split, respostas inválidas, fence antes/RPC/auditoria, sem efeitos globais; consultaOnly mantém operações não montadas |
| hooks/useProductionPlanning.ts | publicacao-contrato-current: RPC canônica única, sem legado, lock, target/ACK, 403/PT409/ausência/contexto, zero retry automático |
| lib/offlineDb.ts | wizardCampo.persistence + campoSyncRuntimeGate + offlineDb.claim + offlineSync.dedupe: claims/CAS/dono/revisão concorrente |
| hooks/useOfflineSync.ts | campoSyncRuntimeGate monta hook real: mapping→claim→RPC→cleanup, pai ausente/dono/tenant/CAS/erros/ACK inválido/epoch/revisão substituída |
| lib/visita/campoContract.ts | wizardCampo.persistence: matriz UUID/versão/replay/identidade + fila real simulada |
| pages/app/wizard/WizardCampoStep.tsx | wizardCampo.persistence: hidratação negada, conflito/revisão explícita, autosave/drafts, perda CAS, respostas tardias |
| pages/app/wizard/WizardRevisaoStep.tsx | wizardRevisao.confirmation: pré-requisitos, contagens com erro, confirmação, cancelamento, CAS, lock, identity fences |
| hooks/useOrigemAlertaAgronomico.ts | origemAlertaAgronomico: CAS/origem/tipo/erros/envelope e nenhuma alternativa direta |
| components/visita/OrigemAlertaAgronomico.tsx | origemAlertaAgronomico: cancelar/somente leitura/instalação ausente/chave estável |
| hooks/useReprogramarMonitoramento.ts | reprogramarCasClient + origemAlertaAgronomico: CAS microsegundos/v1-v2/envelope/sem fallback/retry |
| pages/MonitoramentoAlertas.tsx | pageRuntimeGate: origem e versão lidas→v2, workspace negado/ausente, tenant durante leitura e erro na lista |
| hooks/useSalvarPlanoMonitoramento.ts | saveVisitMonitoringPlanClient: ledger/version/erro/retorno/contexto, sem retry |
| components/visita/PlanoMonitoramentoEditor.tsx | visitMonitoringPlanEditor + monitoringAutosave.interaction: hidratação/rascunho/conduta/refetch/sem escrita no mount |
| lib/visita/visitaErrorMessages.ts | visitaErrorMessages e confirmação: conflitos/rejeições não são sucesso |
| lib/catalogo/platformCatalogLabels.ts | catalogLabelPt409 + catalogLabelsPanelFlow: conflito/revisão preservada/sem retry |
| pages/SelecionarPortal.tsx | multiportal.guards/gestao/superadmin: identidade única, escolha manual/preferência/contexto e isolamento sem criar papéis |
| integrations/supabase/types.ts | Somente quatro assinaturas RPC adicionadas; chamadas correspondentes cobertas pelos testes origem/reprogramação. Tipos não executam nem instalam SQL; não equivalem a validação de schema hosted. |

Testes referenciados usam os caminhos completos registrados nos JSONs. Nenhum
teste de snapshot/styling foi criado. Não se alegam cobertura de todos os ramos
pré-existentes desses arquivos ou medição percentual de coverage.

## Achados revisados: prova versus hipótese

- **Hipótese de chave divergente financeira refutada.** O wrapper
  `useScopedPortalQuery.ts:27` acrescenta `[actor.scope,fence.scope]`; o hook passa
  ambos como `access`. A chave efetiva é precisamente a chave usada no cleanup.
  Novo teste compara invalidação com a entrada real do cache e verifica remoção
  após desmontagem. Nenhuma correção desse hook é necessária.
- **Gap de fila Campo fechado:** o teste antigo do wizard não montava o replay;
  novo `campoSyncRuntimeGate.test.tsx` monta `useOfflineSync` com IndexedDB fake
  e cobre explicitamente mapping, autoria, claim, ACK e cleanup. Não equivale a
  IndexedDB entre dispositivos reais; esse não é requisito para simulação local.
- **Gap deferEffects fechado:** novo teste monta hook real da esteira, não o mock
  da página, valida UUID retornado/filhos e ausência de efeitos globais.
- **Página de monitoramento:** teste novo cobre integração do leitor da versão com
  hook v2, inclusive erro/tenant durante leitura. Os testes estáticos antigos da
  página não foram apresentados como evidência dinâmica.
- **Leitura `useProductionPlanning` não escopada:** é pré-existente e byte-idêntica
  na referência; o delta avaliado é a publicação, coberta. Não ampliar escopo para
  corrigir leitor legado sem reprodução/autorização. Não constitui regressão nova
  demonstrada por esta rodada.
- **Campos legados sem dono/revisão:** retenção é deliberadamente fail-closed;
  recuperação humana não foi homologada. Não apagar, inferir owner nem reenviar
  automaticamente. Essa limitação existe na transição offline, sem autorizar dado
  falso. Não foi observada ocorrência real nesta rodada.

## Bloqueios concretos que permanecem

1. **Publicar HEAD não é publicar só texto:** 26 arquivos funcionais + package/lock
   diferem da referência, embora todos os deltas tenham testes simulados úteis.
   Nenhuma separação/reversão de código foi autorizada/feita nesta rodada.
2. **Entrega multichamada não tem contrato atômico de grupo/receipt/CAS instalado
   comprovado nos registros da revisão.** Reserva/criação/expedição podem produzir
   parcial. Lock/quarentena por mount não protege outra aba/reload; releitura não
   retira quarentena. `docs/auditorias/consumidor-real-entrega-20261028.md:44-54`
   registra ausência do contrato e cancelamento/estorno em duas transações. Os
   testes agora comprovam que a interface reporta/contém isso; não tornam operação
   financeira integral apta nem corrigem servidor via frontend.
3. **A2/valor/fiscal/contabilidade permanecem contidos.** A UI financeira nova só
   reconcilia títulos existentes e bloqueia novo despacho; testes concretos
   comprovam zero RPC de cobrança/fiscal inclusive fiscal ERROR. Fiscal AR Bio
   DRAFT/NOT_READY e accounting NULL são relatos prévios do proprietário, não leitura
   nova. Não exigir executar NF/cobrança para fechar este gate de contenção. Publicar
   essa UI significa aceitar indisponibilidade explícita do fluxo antes existente,
   não homologação do fluxo financeiro completo.
4. **Sem associação verificável build LIVE↔commit.** Não é possível certificar
   que o intervalo Git representa exatamente tudo que difere de produção; isso
   bloqueia a afirmação de patch isolado e rollback para SHA publicado comprovado.

Não foi descoberta exigência técnica de DDL para a carteira. Pacotes crédito,
Price/shared/clientlink e candidatos financeiros continuam separados; existência
dos scripts não os instala nem os libera. Lacunas SQL/operacionais não serão
“fechadas” com stubs ou ações proibidas.

## Correlação local do build LIVE

Identificadores externos capturados na rodada anterior: `build-mvqwpqek` e
`/assets/index-jwJ_l9D2.js`. Inspeção local desta rodada: buscas em docs/scripts/
.lovable/public e metadados Git não localizaram manifesto ou registro de implantação
que ligue esses valores a SHA. Não há `dist/assets/index-jwJ_l9D2.js` local observado.
Os únicos registros encontrados desses identificadores são o próprio relatório
da captura anterior, sem associação independente. O commit referência existe
(27/10/2026 01:29:36Z, “Validated local changes”); mensagem Git não prova publicação.

`vite.config.ts:14-18` usa env de deployment ou fallback temporal `build-*`.
O ID servido é fallback, não SHA; não converter horário estimado em prova de commit.
Nenhuma produção/rede foi consultada nesta rodada. Resultado: **correlação local
indisponível**, não alegação de inexistência de registro fora deste checkout.

## Evidência histórica e final

Evidência real existente da carteira (RPC com org AR Bio e sete IDs, SELECT owner
pedidos/itens positivo AR Bio e negativo FSF) é relato independente do proprietário;
está registrada em `carteira-empresa-owner-read-20261030.md`. Não a substituir por
mock nem exigir nova cobrança/NF. Nesta rodada só testes locais.

Build automático observado após a última criação de teste/runtime inalterado:
`build OK` em 30/10/2026 00:56:13Z (confirmar log final arquivado no encerramento).
Typecheck separado não foi executado: harness é responsável por essa etapa;
ausência de saída independente é limite explícito, não alegação de PASS separado.

Artefatos/JSON/logs/hashes: `docs/auditorias/gate-runtime-20261030/`.
Carteira final continua deduplicando e distinguindo todos já exibidos de zero
resultados no filtro. Sem alteração de cliente/configuração/dependências/rotas/
permissões/runtime funcional nesta rodada.