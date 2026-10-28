# Consumidor REAL de entrega — correção incremental local, 28/10/2026

## Resultado e fronteira

**PASS local / NO-GO operacional.** Pedido de02:12UTC executado na página `src/pages/Entregas.tsx`, no hook utilizado e no diálogo existente, não em useProductionPlanning. Nenhuma consulta ou escrita LIVE, SQL hosted, migration, GRANT, fixture/sessão, deploy/publicação, comunicação, cobrança ou fiscal real nesta rodada. Capturas anteriores permanecem históricas: A2/entrega/envase/B2B sem liberação comprovada. Código local não publicado; a mudança de tratamento de falhas deve ser revisada antes de publicação para não interromper comportamento operacional inadvertidamente.

## Reprodução concreta

`evidencias-consumidor-entrega-20261028/baseline.txt`: seis testes de regressão novos falharam antes do patch. Página e hook reais, QueryClient real com default mutation retry3, transporte/Auth simulados. Dupla chamada de onSubmit produziu **duas RPCs**; `operarEstoque` retornando `{ok:false}` resolveu criação de grupo como sucesso; erro no item2 foi repetido automaticamente até passar e executou compensação direta; três ACKs tardios (tenant/ator/epoch) continuaram sem fence. Isso é distinto da caracterização anterior de publicação do planejamento.

## Arquivos e deltas

|Arquivo|Delta e limite|
|---|---|
|`src/pages/Entregas.tsx`|Trava síncrona compartilhada entre criar/enviar/cancelar na mesma instância; retry:false; UUID/quantidade finita/itens duplicados; scope ator/tenant/roles/epoch capturado; check antes/depois awaits; timeout30s mantém lock até work terminar, sem cancelamento remoto. Queries existentes usam wrapper scoped; realtime/invalidação fenced. Criação usa UUID split retornado pela reserva. Falha expedição/itemN/estorno vira parcial/incerto, não warning/sucesso; removidas compensações best-effort de criação, nenhum writer substituto. Enviar/cancelar mantêm UPDATE existente com status esperado e ACK de linha. Cancelamento de entregue é retorno não contratado, negado. Sem movimento visível não se presume estoque conciliado. Draft/dialog permanecem, botão consulta só relê.|
|`src/hooks/useEsteiraLaboratorio.ts`|Opções locais para deferir toast/cache e usar current capturado em criar/reservar. Auditoria de reserva existente mantida, fence antes dela e após await. `reservar_estoque_item` retorna UUID conforme captura, não `{ok}`: split UUID é carregado para criar no item reservado. Demais writers/contratos não substituídos.|
|`src/lib/entregas/payloadEntrega.ts`|Criação exige objeto/success:true/UUID/replay tipado quando presente e recusa ok:false contraditório. ACK motor exige ok:true/replay boolean/ação/item/movimento UUID/campos saldo finito não negativo ou NULL/status string ou NULL conforme envelope capturado. Replay motor não exige quantidade ausente no contrato de replay; validação não comprova ledger/quantidade server-side.|
|`src/components/entregas/ConfirmarEntregaDialog.tsx`|Single-flight local/retry:false; scope inclui open/entrega; documentos scoped; uploads/RPC existentes com fences; ACK success:true, alvo exato, replay boolean, negativa recusada; timeout/quarentena, callbacks usam ID/modo capturados; invalidação somente vetor ator correspondente. Não abre ACL nem chama RPC real em testes.|
|`src/test/entregas/consumidorEntrega.test.tsx`|23 testes da página/hook reais; transporte/Auth e shell formulário simulados. QueryClient real; dupla criação, motor negativo/parcial/alheio, itemN, UUID, retry defaults, actor/tenant/epoch, cache, reserva split e ACK inválido, parcial preservada, timeout/ACK perdido, cancelamento.|
|`src/test/entregas/confirmacaoEntregaAck.test.tsx`|9 testes do diálogo real: dupla ação, ACK negativo/incompleto/alheio, tenant/epoch/entrega alterada, timeout. Sem upload real ou sessão LIVE.|
|`src/test/entregas/registroEntrega.test.ts`|Dois exemplos antigos usavam e-1; substituídos por UUID válido, sem relaxar regra.|
|`scripts/rbac-audit/build-order-flow-matrix.py`, CSV/resumo, `src/test/rbac/order-flow-coverage.test.ts`|Novo grupo PASS offline; GAP-02 atualizado mas permanece FAIL de gate/atomicidade. 9180 planejados inalterados.|
|Plano original, roadmap, AGENTS raiz/hooks e relatórios antecedentes|Checklist atualizado e regras/limites documentados; nenhum plano paralelo.|

## Testes e evidências

- Baseline: **0PASS/6FAIL**, evidência local acima; falhas de proteção reproduzidas, não exploração JWT.
- Finais: **328/328 em22 arquivos**: `bun run test -- src/test/entregas src/test/cockpit-laboratorio/refinamentos.test.tsx src/test/cockpit-laboratorio/consultaOnly.test.tsx src/test/cockpit-laboratorio/cacheScope.test.tsx src/test/financeiro/deliveryFinanceReconciliation.test.tsx src/test/rbac/order-flow-coverage.test.ts`. Log `evidencias-consumidor-entrega-20261028/vitest.txt`.
- **32 testes novos** (23página +9diálogo). Reexecuções parciais não somadas.320/620 anteriores não representam esta execução; os188PG são históricos **NOT RUN nesta rodada**.
- Build/typecheck automáticos: última entrada observada build OK após alterações; nenhum comando manual proibido. Erros intermediários de imports/assinaturas enquanto arquivos estavam em edição foram resolvidos. Registre timestamp final no complemento de encerramento.
- Warnings Router Future Flags e DialogDescription presentes nos testes; a11y visual/foco browser real NÃO certificado. Nenhum runner hosted/legado foi executado.

## Revisão independente

Subauditores investigaram os contratos e revisaram o código efetivo (git diff pode aparecer vazio por checkpoints gerenciados). Encontraram: timeout liberava trava antes do work concluir; ausência de movimento no cancelamento não prova ausência de expedição; envelope motor incompleto; reserva retorna UUID split, não pode exigir igualdade original; timeout do diálogo ausente. Corrigidos localmente com regressões. A recomendação de mutex multiaba/module novo não foi adotada: fora do recorte e sem contrato durável; limite declarado abaixo. Reserva não recebeu falso ACK ok:true: captura `current-extra-20261028.json` confirma RETURNS uuid e RETURN v_new_id. Revisão final posterior das correções registrada em complemento.

## Matriz de aceite desta rodada

|Cenário|Estado|Evidência|
|---|---|---|
|Dupla ação na mesma página/dialog, ACKs negativos/incompletos, tarde após escopo|PASS sintético|32 testes novos, página/hook/dialog reais|
|Expedição parcial/itemN/cancelamento parcial sem sucesso falso|PASS sintético|Sem compensação automática; sem claim rollback|
|QueryClient defaults retry3 não provocam retry, cache correto|PASS sintético|Transportes e QueryClient reais locais|
|Grupo entrega atômico/CAS/retorno/durable ACK|BLOCKED|Nenhum contrato equivalente instalado/homologado|
|A2/envase/autoridade B2B/onfarm/ledger integral|BLOCKED|Capturas anteriores; não liberados|
|9180combinações A/B/C/perfis/planos/Storage|6120BLOCKED +3060NOT RUN|JWT real PASS0; não promover mocks|
|PG desta rodada/JWT/sessões/fixtures/browser autenticado/mobile produção|NOT RUN|Proibido forçar operações;188PG históricos|

## Riscos e próximos gates exatos

1. **P0/BLOCKED** contratos grupo/retorno/status-CAS e motor/ledger/triggers completos, reautorização após locks, A2/envase/B2B/onfarm, PRE/POST contemporâneos e rollback deny-only; todos os oito gates do relatório Etapas5/6 continuam obrigatórios.
2. **P1/BLOCKED** cancelamento e estorno são duas transações; pode persistir cancelada antes do estorno. O patch reporta esse fato e não simula rollback. Ausência de movimento no SELECT não é prova de ausência sob RLS; falta endpoint reconciliável para aceitar conclusão.
3. **P1/BLOCKED** quarentena/lock são em memória por mount; não cobrem outra aba/reload/outros consumidores da esteira. Timeout não cancela pedido aceito servidor. Releitura do botão NÃO retira quarentena nem autoriza reenvio: falta receipt/CAS servidor. Revogação que ocorre sem render/monitor check permanece dependente servidor.
4. **P1/BLOCKED** validar quantidade motor e vínculo entrega-movimento exige autoridade server-side; ACK somente contrato de transporte. Reserva split foi preservada, mas saldo/vínculos pós-split reais dependem de RLS/JWT.
5. Revisão independente do pacote local e homologação funcional controlada autorizadas separadamente, com A/B/C/anon, waits/revogação, timeout, Storage, itemN, parcial/cancelamento e caches; nunca chamar RPC fechada para forçar PASS.
6. Publicação somente após dependências comprovadas/contratos homologados e autorização específica; depois gate obrigatório final do plano original. Fiscal/contabilidade reais e SU-518022 pendentes.

**Não há GO, instalação ou homologação real nesta entrega.**
