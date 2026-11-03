# Consolidação ffrg/ffx — original mantido, sondas de acesso verificadas

## Versão final e decisões

O hook `src/hooks/useTenantProducts.ts` permanece **byte a byte idêntico ao commit500b8b148**, com useScopedPortalQuery/useStorageAccessScope, abortSignal e lateACKguard. A sobrescrita pelo hook básico fe2 está supersedida; não existe alteração funcional adicional nesta rodada.

P0002 segue tratado como ausente; os testes de produtos preservam isolamento, ACK e idempotência por escopo. O patch final de produtos anterior está em `../fe2-reconciliation/original-final.patch`; não aplicar o hook básico upstream.

## Auditoria solicitada de login e contexto

| Arquivo | Dispatch efetivo | Resultado |
|---|---|---|
| src/hooks/useAuth.tsx | rpc.call(supabase, get_my_commercial_partner_context); demais RPCs como métodos do cliente | Receiver preservado |
| src/lib/authz/internalContextProbe.ts | rpc.call(supabase, internal_actor_context_v1) | Receiver preservado |
| src/lib/authz/producerContextProbe.ts | rpc.call(supabase, h15_actor_organization/get_cliente_ids_for_user), supabase.from(clientes), h15 final | Receiver preservado |

Extração de referência não significa perda de this quando existe `.call(supabase, ...)`. O relatório inicial de busca desses três arquivos como risco é supersedido por esta auditoria do dispatch real. Não há correção funcional necessária nem patch de login inventado.

Cinco testes novos usam Supabase SDK real com fetch sintético, sem mock de rpc: contexto interno positivo e tenant divergente, backend recusado sem fallback, cadeia produtor com h15 final e parâmetros exatos, tenant divergente sem leitura de clientes, e linhas reais do dispatch B2B de useAuth (apenas cast TS removido para execução) com resposta positiva/403. Teste do dispatch useAuth não é login end-to-end nem montagem do AuthProvider.

## Evidências

- 25/25 focados finais (5 novos +12 produtos +8 contratos).
- Separação financeira 5/5; originais continuam byte a byte da base9d3a9424.
- Hook500b8 diff vazio; build automático OK.
- Primeira execução: 24 PASS/1 FAIL por regex do teste que terminava no ponto e vírgula interno do tipo TS. Corrigido somente o harness, log original preservado; não era falha runtime nem receiver.
- Regressão anterior final177/2878 continua histórica; não foi repetida inteira para esta alteração exclusivamente de testes. Typecheck separado não executado por restrição do ambiente.

## Relatos externos e gate atual

O auditor reportou negativa AR Bio→FSF API/REST e POST intacto, além dos resultados FSF já registrados; não foram executados novamente pelo agente. Publicação aguarda **reteste final do espelho exato500b8 + testes** no isolado. Nenhum JWT/browser/SQL hosted, publicação, financeiro, fiscal ou SMTP executado/aberto aqui.

`auth-receiver-tests.patch` contém apenas o novo teste para espelhamento; não modificar useAuth/internalContextProbe/producerContextProbe, binding ou o hook de produtos a partir dele.