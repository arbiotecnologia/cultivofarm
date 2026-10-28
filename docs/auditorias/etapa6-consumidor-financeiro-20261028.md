# Etapa 6 — consumidor financeiro seguro (28/10/2026)

## Resultado e limite operacional

Patch local no diálogo existente, sem SQL hosted, consulta LIVE, migration, GRANT, publicação, fixture, sessão, envio fiscal ou mudança de writers OS/entrega. **Não é liberação de cobrança.** A2 permanece inativa e o leitor canônico pré-cobrança `fn_entrega_valor_faturavel_v1` tem ACL capturada postgres/service_role, não authenticated. A assinatura em types não concede EXECUTE.

Por isso o frontend não chama generate/mark nem upsert fiscal neste recorte. Não se inventou capability/RPC A2, nem flag cliente que pudesse autorizar dispatch. A opção permitida pelo proprietário — implementar estados seguros e manter operação bloqueada — foi adotada. O caminho fiscal manual também não tem autoridade/replay integral atual comprovado: **retentativa fiscal não implementada**, somente releitura e navegação ao título existente. Não há transmissão fiscal.

## Arquivos e diferenças

- `src/components/financeiro/ConfirmarEntregaFinanceiroDialog.tsx`: remove a sequência gerar título→fiscal em transações separadas e sucesso/erro global enganoso; mantém formulário existente para revisão, sem dispatch. Método ativo obrigatório, categoria RECEITA (não AMBOS), catálogos via wrapper scoped existente, cache em erro/pendência oculto. Total local é explicitamente estimativa, não preço/valor canônico. Agenda editável somente revisão, nunca enviada para substituir parcelas. Remove montagem `DocumentosPanel` DELIVERY, cujo canal não é autorizado pelas regras de anexos financeiros. Sem upload/cleanup de objetos. Draft não reseta em reconsulta/erro no mesmo contexto; troca ator/tenant/roles/epoch remonta e descarta contexto anterior. Abertura do título depende de leitura autorizada fresca, não `entrega.receivable_id` recebida por prop.
- `src/hooks/useDeliveryFinanceReconciliation.ts`: hook focado no consumidor, reutiliza `useStorageAccessScope`/`useScopedPortalQuery` e cliente Supabase canônico, **somente SELECT**. Read entrega por id/org e título por origem DELIVERY/org, limite 2; verifica UUID, origem, cliente, ponteiro, valor positivo finito, status/fiscal flag tipados. Types SDK antigos omitem organization_id: boundary limitada decodifica resposta runtime usando colunas capturadas, sem regenerar types/cliente. `retry:false`, hide-error-cache e ticket para reconsulta; invalidação exata apenas da própria consulta, cercas após cada await e cancel/remove do cache antigo.
- `src/test/financeiro/deliveryFinanceReconciliation.test.tsx`: 14 testes do diálogo/hook reais, QueryClient real, Auth/SDK simulados; primitivas Select simplificadas. Fixtures apenas em memória, sem banco.
- `src/test/entregas/creationContracts.offline.test.ts`: 5 testes de especificação estática/validação existente; não alteram escritores nem ACL.
- Plano original por etapas, roadmap e regra AGENTS atualizados; não foi criado outro plano.

## Estados efetivos

| Estado | Evidência/ação |
|---|---|
| rejeitado | Revisão bloqueada localmente por contrato indisponível; **não** alegar rejeição SQL de uma mutação não enviada |
| resposta incerta | Consulta pendente/negada/inconsistente ou nenhum título visível; ausência não prova rollback nem autoriza retry |
| recebível confirmado | SELECT autorizado encontra título válido para a entrega/empresa/cliente; mostra valor persistido |
| fiscal pendente | Título confirmado exige fiscal e não está ISSUED; não finge rollback financeiro, não gera segunda cobrança |

ACK perdido é recuperado lendo origem e conferindo ponteiro/cliente. Falha fiscal já persistida mantém título visível. PT409/42501 testados são **erros de releitura simulados**, não erro de uma mutação efetivamente exercitada. Sem dispatcher ativo, testes negativos demonstram zero chamadas RPC, não atomicidade do backend.

## Contratos OS/entrega — especificação, não migração

Capturas `scripts/os-delivery-reopening-20261027/live/` e consumidores `OrdensServico.tsx`/`useEsteiraLaboratorio.ts`:

| Operação | Contrato exato existente | Disponibilidade/aceite |
|---|---|---|
| OS manual | INSERT ordens_servico: id, cliente_id, fazenda_id, talhao_id, tipo_item, produto_id/microrganismo_id, modo_aplicacao, area_hectares, volume_total_ml, data_programada, prioridade | Sem RPC manual equivalente recuperada; writer intacto |
| Aprovar OS | rpc_aprovar_os_v1(p_os_id uuid,p_origem text) → jsonb | ACL authenticated capturada; não ampliar origem B2B |
| Programar OS | rpc_programar_os_v1(p_os_id uuid,p_origem text,p_data_programada date default NULL) → jsonb | Já existente; preservar guards |
| Criar entrega | rpc_cockpit_criar_entrega_v1(p_os_id uuid,p_origem text,p_estoque_produto_id uuid,p_quantidade numeric,p_dados jsonb default {}) → jsonb | Wrapper contido; payload whitelist; volume/status server-owned, success+entrega_id/replay |
| Confirmar cockpit | rpc_cockpit_confirmar_entrega_v1(p_entrega_id uuid,p_os_id uuid,p_origem text,p_recebedor jsonb default {}) → jsonb | Diferente do wrapper principal; não trocar automaticamente |
| Confirmar principal | rpc_entrega_confirmar_v1(p_entrega_id uuid,p_recebedor jsonb,p_opcoes jsonb default {}) → jsonb | EXECUTE authenticated ausente na captura |
| Cancelar | rpc_entrega_cancelar_v1(p_entrega_id uuid,p_motivo text) → jsonb | Não substituir UPDATE direto por wrapper fechado |

Os 5 testes novos verificam INSERT manual mantido, assinatura capturada, whitelist sem autoridade volume/status, resposta inválida/replay e barreira release ainda presente. Não são prova de chamada PG. Próximo aceite backend: atomicidade reserva/criação/expedição por item/grupo, falha item N/expedição sem sucesso aparente, contrato em_rota/cancelar/retorno, origem B2B/onfarm e revogação. Nada disso foi reaberto por estes testes.

## Validação realizada

`bun run test -- src/test/financeiro/deliveryFinanceReconciliation.test.tsx src/test/entregas/creationContracts.offline.test.ts src/test/entregas/registroEntrega.test.ts src/test/financeiro/partnerSettings.integration.test.tsx src/test/financeiro/contasReceber.test.ts`

**61/61 PASS, 5 arquivos**: 14 novos financeiros, 5 novos contratos, 42 regressões existentes. Cobertura: UUID inválido, método ausente/inativo, AMBOS oculto, dupla revisão/reconsulta, ACK perdido via registro, fiscal ERROR, PT409/42501 e draft, cache confirmado→erro, origem alheia, tenant/actor/epoch durante leitura e tenant durante invalidação. Nenhum warning act novo; warnings React Router Future Flag permanecem.

Typecheck automático inicialmente encontrou types organization_id antigos; boundary corrigida e log posterior build OK. Não executados build/typecheck manuais nem PostgreSQL/fixtures/Supabase. Nenhum teste autenticado browser real: proprietário proibiu tocar sessões, e produção permanece contida. QueryClient/jsdom não é JWT/RLS.

## Riscos e pendências

- Exposição BOLA dos corpos financeiros LIVE não é corrigida por UI: revisão/implantação A2 independente continua necessária.
- Valor pré-cobrança canônico indisponível ao browser; valor persistido do título não é cotação autorizada.
- Agenda arbitrária não tem contrato instalado seguro; manter generator/snapshots e rejeição atômica A2, sem DELETE/reinsert.
- Não existe envio financeiro ou retomada fiscal neste patch; futura ativação exige prova servidor e tratamento real de ACK/commit, não remover bloqueio local para testar produção.
- Hooks/query keys globais de outras telas não foram certificados nem invalidados em massa. Este consumidor isola apenas seus próprios caches; demais consumidores devem reler por contratos atuais.
- Envase, composição A2/engine/motor/ledger, B2B/onfarm, JWT A/B, contabilidade/fiscal reais e SU-518022 continuam pendentes. Sem publicação automática nem alegação de homologação real.