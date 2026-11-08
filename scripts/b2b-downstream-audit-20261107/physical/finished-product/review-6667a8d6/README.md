# Revisão 6667a8d6 — código interno versus lote do fornecedor

**INATIVO / NÃO APROVADO. Sem operação hospedada, publicação, Auth real, NF, cobrança ou envio.**

O auditor relatou UNIQUE global `lotes_codigo_lote_key`. O índice global capturado foi restaurado sem alteração. A reprodução com a transformação anterior falhou no segundo recebimento (FSF sintético) com `duplicate key value violates unique constraint "lotes_codigo_lote_key"`, mantendo o primeiro recebimento. Evidência `before.json`: 3/4, exit 1; não é teste de exploração LIVE.

## Correção mínima gerada

No gerador canônico `../assemble.py`, o código passa a ser `BUY-` concatenado ao UUID do lote gerado no servidor. O identificador global continua protegido pelo índice existente; não se remove/relaxa constraint, não se gera código no cliente, não há catch-and-retry de unique violation. `p_lote_fornecedor` permanece, com a mesma normalização preexistente, no fingerprint, snapshot do lote e metadata do ledger. Nenhuma referência externa é substituída pelo código interno.

O replay reautoriza e devolve os IDs do receipt anterior antes de criar o lote. Chave/payload divergentes continuam negados atomicamente. Recebimentos legitimamente diferentes usam chaves e referências de compra próprias; o lote externo repetido não é chave de deduplicação.

## Provas locais executadas

| Escopo | Resultado | Evidência |
|---|---:|---|
| ARBio/FSF sintéticos, mesmo lote externo, novos recebimentos e duas apresentações do mesmo produto, códigos distintos, snapshots/ledger, isolamento, replay, divergências e saldos | 14/14, exit 0 | supplier-lot.json; final-supplier.* |
| Compra/API/ACL, kg/g/L/ml, OS manual, split/cancel/merge, concorrência mesma chave, revogação após espera e rollback deny-only | 58/58, exit 0 | after.json; after.* |
| Entrada sem confirm/send, bloqueio downstream ausente, recomposição após dependências e POST exato | 16/16, exit 0 | layers.json; layers.* |

As contagens são independentes, não somadas. A regressão confirma quatro recebimentos/quatro códigos/quatro movimentos de entrada; ARBio tem 9 UN e 165 kg, com referências externas intactas e sem alteração após replay/conflitos. A concorrência de mesma chave do harness existente continua criando uma entrada mais um replay. Não foram reexecutadas as suítes UI, nulidade ou legado biológico nesta revisão; seus resultados anteriores permanecem históricos.

Restauração completa sem objetos/constraints/policies/triggers/indexes não resolvidos: `restore-2.*`. A primeira tentativa de carregamento do harness teve import circular e está preservada em `restore.*`; não foi falha do contrato. Única adaptação de infraestrutura na cópia temporária: caminho do binário PostgreSQL disponível 17.11 em lugar do antigo 17.9, sem alteração de SQL capturado. Auth/claims, catálogo e demandas são fixtures locais; preparação upstream usa replica, mas os writers de compra e downstream executam com gatilhos habilitados.

## Artefatos e limites

Candidato SHA256 `93aa96092d2e7210bfc8ae7e6741db41bd439c1ac737fc8301248ce1ff9dabbf`. Os SQL desta pasta são os novos artefatos gerados e medidos em PostgreSQL descartável. Baseline e corpos LIVE capturados permanecem pinados; POST foi medido para este hash, não reaproveitado de outra versão. `SHA256SUMS` inclui fontes e evidências. Os SQL/JSON de resultado originais no diretório pai foram preservados como histórico anterior, não representam esta revisão; o gerador e os testes canônicos receberam a correção.

Esta revisão não fecha a composição E2E do pedido B2B: `order-e2e/` continua ausente, e positivos de OS manual não certificam pedido B3→entrega. Dependências confirm/send ausentes em LIVE segundo relato continuam obrigatórias para a camada downstream. UI mantém assinatura `p_lote_fornecedor`, sem mudança operacional. Teste4/cinco títulos intocados. JWT/RLS/Storage/PostgREST/browser real, instalação e homologação continuam pendentes de revisão independente.