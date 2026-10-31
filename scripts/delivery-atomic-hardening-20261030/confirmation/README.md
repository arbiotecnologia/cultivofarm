# Confirmação física manual — provas locais ampliadas, NO-GO de release

Preparação local; nenhum acesso hosted, sessão, segredo, publicação ou fixture real.

## Resultado efetivamente executado

- Vitest entrega/envase/etiquetas: 538/538, 35 arquivos (evidence/all-vitest-final.log.txt).
- Envelopes e diálogo montado: 33/33; quatro negativos independentes corrigidos, raiz/prova divergentes negadas e tentativa incerta mantém chave/payload sem toast/onConfirmed/close (envelope-tests.log).
- Build automático observado OK; sem log de typecheck separado.
- PostgreSQL: 78 checks PASS, exit_code 0 (evidence/all-matrix-final2.log.txt); test-results.json contém contagem e SQLSTATEs exatos. Rodadas históricas falhadas permanecem nas evidências, não compõem a aprovação atual.
- Composição local restaurada, sentinelas existentes, instalação fechada, release NO-GO verificado com P0001, ativação exclusivamente no harness descartável, attach/confirmação física, replay e isolamento estrangeiro passaram na rodada atual.
- Primeiro sucesso preservou conteúdo financeiro/fiscal/outbox e estoque/ledger; não houve segunda expedição.
- Executados: digital com formulário reutilizado e novo, hash adulterado/objeto ausente/foreign owner, CAS válido e stale, singleton ausente, replay, revogação de perfil/papel/tenant/SaaS DURANTE lock observado, cancelamento canônico vence confirmação PT409, confirmação impede cancelamento ordinário, parcial envase + dois itens, segundo item com OS entregue, invariantes integrais de 14 tabelas downstream.
- Restore integral original passou; reruns finais usam pg_dump local dessa composição aplicada e fixtures, papéis capturados restaurados. Nenhum transporte hosted. O checkpoint está em /tmp e não é artefato deployável.

## Bloqueio reproduzido

O comprovante digital canônico instalado recalcula entrega_comprovantes.validation_hash ao assinar, mas, quando reutiliza formulário existente, conserva entregas.validation_hash anterior (delivery-proof-authz candidate.sql.review, linhas 215 e 237). A confirmação exige concordância exata e corretamente nega DELIVERY_CONFIRM_PROOF_DENIED. O teste que esperava PT409 de CAS recebeu 42501 da prova: falha explícita, não tratada como PASS.

Corrigido por delta mínimo gerado do corpo canônico: token/hash do comprovante atualizado são adotados atomicamente pela entrega, inclusive no formulário reutilizado; demais guards/ACL/recibos e writers preservados. Igualdade não foi removida. Ledger de replay agora exige os mesmos campos referencia_tipo/os_id/os_tipo/lote_id do primeiro sucesso.

Finalização mede volume por programação/produto em mililitros. Matrizes concluídas no esquema real: um programa por OS (`programacao_producao_os_uniq`) e um lote por programa (`idx_lotes_programacao_id_unique`) rejeitam múltiplos produtos/lotes na mesma OS com 23505 exato e snapshots. Nenhum índice foi removido para fabricar positivo. Produto distinto foi confirmado positivamente em outra OS/programa/lote sem cobrir os 2000ml descobertos da primeira OS. Três itens canônicos do mesmo lote, cancelamento e estorno antes do avanço: somente 4000/6000ml cobertos, OS permanece entregue, nunca finalizada. Primeiro de dois itens de outra OS não finaliza; segundo completa 5000ml.

Corridas nas duas direções sign/attach × confirm: proof vence → confirmação stale PT409 OBSERVED_CONFLICT; confirmação vence → proof 42501 SCOPE_DENIED. Holders são aguardados em idle-in-transaction e espera de lock observada; na direção inversa o holder também prende o advisory canônico da prova, instrumentação exclusivamente do harness. Alteração real os_id/lote_id/os_tipo/referencia_tipo do ledger (injetada somente por postgres local em replica) → replay 42501 REPLAY_STATE_DENIED, snapshots preservados; linhagem restaurada → replay sem escrita. Produto divergente → 42501 LINEAGE_DENIED. Falhas de montagem/expectativas/coordenação anteriores preservadas, não contadas como PASS.

## Artefatos

install.sql.review mantém writer fechado; release.sql.review continua recusando ativação para revisão independente, embora o nome histórico do erro mencione remaining matrix. PRE/POST medidos incluem delta proof mínimo; não certificam hosted. Rollback revoga confirmação e mantém sincronização segura/história. Nenhum candidato desta pasta está liberado.

EnvasePage não oferece complemento, criar embalagens ou mutações de etiquetas; consulta e impressão existentes preservadas. Confirmação frontend exige capability exata imediatamente antes do dispatch, ACK exato, ator/empresa/época atual e mesma tentativa em incerteza. Demais contratos permanecem contidos.

## Delta runtime 31/10 13:32

IDs devem ser UUIDs não nulos; revisão deve ser timestamp com calendário/horário/fuso válidos, não string vazia ou data normalizada inválida. Capability candidata acrescenta os_id/comprovante_id canônicos. A tentativa captura essas raízes da leitura inicial, confronta o preflight e o ACK; resposta de OS/prova diferente não gera sucesso. Capability antiga sem raízes falha fechada. Revisão ACK anterior à observada é incerta. Não houve aplicação hosted nem alteração do pacote independente de cancelamento de etiquetas; sua UI continua sem writer.

## Consulta envase — 31/10 13:37

EnvasePage agora remonta apenas a consulta por escopo canônico de sessão (ator/empresa/papéis/época/readiness), limpando imediatamente histórico, produtos, filtros e debounce ao trocar contexto ou ficar inativo. Histórico captura filtro/página inclusive busca antes do debounce; respostas, erros e finally só são adotados pela geração atual. Produtos usam geração independente e escopo de sessão. Paginação auxiliar verifica fence antes/depois de cada lote e não continua consulta obsoleta. Realtime/timers são aposentados por cleanup e verificam o contexto antes de recarregar. RLS permanece obrigatória e nenhuma operação foi reaberta.

Testes mounted: 7/7 em duas suítes, promises invertidas filtro/página, ARBio→FSF, inativo, unmount/timer e Ver/Imprimir preservados. Evidência local versionável em evidence/envase-scope-tests.txt; não é prova hosted/JWT/browser real.

## Atualização da lista após confirmação — 31/10 13:39

O diálogo deixou de invalidar um escopo de recurso incompatível. O pai captura a sessão da lista e o target ao abrir pelos botões desktop/mobile; após ACK físico válido, invalida exclusivamente `["entregas", captured.scope, captured.scope]` com `exact:true`. Mudança de sessão/target ou callback de modo financeiro não produz efeitos; confirmação física nunca abre financeiro. O leitor existente continua recusando respostas tardias pelo fence canônico.

Teste integrado com Entregas montada, QueryClient/cache reais e diálogo simulado: linha passa de em_rota para entregue por nova leitura; cache estrangeiro com observador ativo não é invalidado nem relido, callback tardio após troca de empresa não invalida consultas e financeiro permanece fechado. Regressão integrada: 531/531 em 34 arquivos. Primeira falha de seletor do teste preservada em evidence/list-cache-first-failed.txt; não foi falha do contrato. Evidências sintéticas não certificam sessão real, JWT/RLS ou execução hosted.

## Evidência

evidence/ contém saídas brutas .log.txt, incluindo falhas históricas preservadas sem alteração de bytes e todas as rodadas atuais. sources.json e test-results.json preservam origem e resultado sem mascaramento. frontend.diff.txt é o diff real contra b3088b47, não um relato de publicação. SHA256SUMS cobre somente arquivos versionáveis desta preparação.

## Enviar independente

send/ contém gerador extraído do prefixo de locks/linhagem revisado da confirmação, permit de imagem exata e recibo send privado. Install fechado com PRE/POST medidos; release NO-GO, rollback deny-only. Apenas separado→em_rota/status+updated_at, nenhum estoque/ledger/prova/OS/efeito financeiro/fiscal/outbox extra. Negativos foreign/CAS ausente/stale/replay divergente, revogação perfil/papel/tenant/SaaS sob espera, corrida envio-envio e cancelamento-envio PT409 e snapshots passaram. Integração PG Enviar→Confirmar e página montada/cache real passaram sem UPDATE direto. Consumidor faz capability específica, ACK estrito, guarda mesma chave em incerteza e só permite reconciliar tentativa retida; contenções genéricas continuam fechadas para demais writers. Sem browser autenticado/typecheck separado/JWT hosted; revisão, autorização e provas reais independentes ainda necessárias.