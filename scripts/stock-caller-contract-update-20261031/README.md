# Atualização dos contratos de teste de estoque — base b3cac5ff

Somente testes locais. Nada foi implantado, publicado ou executado em banco hospedado. Release continua NO-GO.

## Reprodução (evidence/first-failed.log.txt): 5 falhas, 26 aprovados
| # | Teste antigo | Causa | Cobertura substituta |
|---|---|---|---|
| 1 | 28C "Entregas.tsx mantém operarEstoque…" (estático) | Entregas não usa mais o motor legado | Exige ausência de `operarEstoque`/`rpc_estoque_operar_v1`/escrita direta em `estoque_produto`, e uso de `runAtomicGroup` (chave `grupoId`, org, OS, tipo, CAS da OS), `runAtomicCancel` (CAS + org) e `dispatchSend` |
| 2 | 28B "Entregas.tsx usa o motor canônico…" (estático) | idem | Exige ausência de `operarEstoque`/`entrega-expedicao`/`entrega-estorno`, import do fluxo atômico, chave `grupoId` e cancelamento atômico |
| 3 | compat "mantém nome, parâmetros…" (runtime) | `expedicao` é negada pela contenção intencional | Mesmo contrato exato da RPC com ação não-entrega (`ajuste`) + controle negativo: `expedicao`, `entrega`, `estorno_expedicao` (qtd NULL) e `referencia_tipo: entrega` falham com a mensagem de contenção e **zero chamadas RPC** |
| 4 | compat "preserva quantidade NULL do estorno…" (runtime) | `estorno_expedicao` é negado pela contenção | NULL + payload `{}` preservados em `cancelamento_reserva`; estorno de entrega coberto no controle negativo do item 3 |
| 5 | compat "expedição automática envia o tipo…" (estático) | trecho `entregas.registrarEntrega` não existe mais | Runtime: `buildGroupArgs` vincula OS/chave/CAS exatos; OnFarm, B2B e origem não agronômica falham antes de qualquer RPC; capability fechada não chama o writer. Estático: Entregas passa `osId, osTipo` e revisões observadas da OS e dos lotes |

Nenhum skip, nenhuma constante alterada, nenhuma contenção simulada fora, nenhum writer legado reaberto. Não houve bug de produto: as falhas eram asserções desatualizadas.

## Resultados
- Após a correção (focused.log.txt): 36/36.
- Regressão entrega/envase/etiquetas/estoque (regression.log.txt): 50 arquivos, 717 testes.
- Typecheck separado `tsgo -p tsconfig.app.json` (typecheck.log.txt): exit 0. Build automático: OK.
- Timeout/recarga/duas abas da retenção de envio já cobertos em `deliverySendPersistMount.test.tsx` (jsdom). Navegador real, JWT/RLS/Storage e banco hospedado **não** foram executados nem certificados.

## Rodada 2 (revisão a2ac119)
- O negativo anterior usava `capability: 1`, que é um envelope malformado e só prova a recusa por schema. Agora há dois negativos separados: envelope malformado e envelope válido `{capability:"delivery_operations_v1",group:false,cancel:false}`. Os dois exigem exatamente uma chamada `CAPABILITY_RPC` e nenhuma `GROUP_RPC`.
- Controle positivo: envelope válido com `group:true` e ACK canônico com org, OS e itens. Despacha `GROUP_RPC` com os argumentos exatos de `buildGroupArgs`, com a mesma `p_request_key` e o mesmo `p_os_observed`, e um único `onDispatch`. Resultado: `confirmed`. Parse e contenção são os reais, sem mock.
- focused-r2: 39/39. typecheck-r2: exit 0.
- Regressão em paralelo: r2 teve 1 falha (`consumidorEntrega`: botão "Cancelar" não encontrado), r3 teve 1 falha (`registrarEntregaMetadataSubmit`: tempo limite de 5000 ms). Em cada rodada falhou um teste diferente, e os dois arquivos passaram 3/3 isoladamente (logs `*-isolated-*`). Instabilidade de tempo sob carga, sem relação com esta mudança, que alterou só os testes de estoque. Não foi corrigida e fica registrada como pendência.
- Regressão serial r4 (`--no-file-parallelism`): 50 arquivos, 720/720.
- Os logs da rodada 1 foram preservados sem alteração.
