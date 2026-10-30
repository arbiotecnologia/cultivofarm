# Implementação atômica de entrega — recorte separado, não liberado

## Resultado da avaliação

Reutilizar os contratos canônicos, mas não compor cegamente as RPCs legadas capturadas. `public.rpc_entrega_cancelar_v1(uuid,text)` (MD5 `f830c6c718e2b44a1ded06a19a04557a`) **já executa estorno+reserva+status numa única transação**; está fechado ao cliente na captura e exige hardening de autorização, não invenção de um cancelador atômico ausente. `rpc_cockpit_criar_entrega_v1` (MD5 `a4d47ccf5d116141ed46e9de9ea7eeaa`) cria individualmente e não torna o grupo multitem transacional. A alternativa segura executada é a contenção frontend antes da primeira mutação. Nenhum SQL novo aplicado ou gerado, nenhum teste PG alegado nesta rodada.

## Objetos e impactos que impedem implementação mínima independente

1. `rpc_cockpit_criar_entrega_v1`: replay OS+item não compara quantidade/dados da operação inteira nem retorna receipt/fingerprint do grupo; reservar um split em transação anterior perde atomicidade.
2. `rpc_entrega_cancelar_v1`: SECURITY DEFINER checa uid/has_role somente antes do advisory; SELECT da entrega apenas por ID, sem organização; replay de cancelada anterior à reautorização. Exigir tenant/permissão explicitamente após advisory/linha e antes de replay/efeitos, com nova validação depois de waits transitivos, preservando a transação existente. Chamadas `rpc_estoque_operar_v1` e `rpc_cockpit_cancelar_reserva_v1` não exigem ACK filho positivo antes do sucesso; GUC `app.entrega_cancelamento_id` não pode ser ticket autorizador. Não tem CAS de versão observada nem receipt da composição inteira. Existência/atomicidade não certificam autoridade ou segurança transitiva.
3. `fn_entrega_confirmar_engine_v1`: contexto GUC `fn_estoque_ctx_open` e UPDATE/INSERT de estoque legados não comprovam contexto privado da pilha stock instalada; avanço `enviar_entrega` negativo não aborta necessariamente antes de confirmar sucesso.
4. `_rpc_avancar_esteira_laboratorio_internal`: retorna envelope negativo por integridade/status; wrapper precisa negar atomicamente todos os negativos, não ignorá-los.
5. `stock_motor_context`, guards de estoque e ledger append-only: nova composição deve herdar exatamente actor/tenant/origem/txid/ticket e revalidar após cada espera; nunca forjar contexto pelo navegador/GUC.
6. Triggers de `entregas` sincronizam planning/partner_order/financeiro e validações; alterar um wrapper sem restaurar e testar a pilha inteira não comprova rollback integral. Fiscal/contabilidade/A2 não autorizados a abrir transativamente.

Esses objetos **não são impossíveis de capturar**; foram identificados por catálogo. A limitação é a inexistência de contrato integrado revisado/instalado que satisfaça todos os itens, e não permissão administrativa faltante. Não se alega ensaio de stack completa.

## Critérios da implementação revisável futura

- Uma única transação reserva/split/cria/expede grupo, locks ordenados e autorização interna canônica fresca após advisory/linha; finitude/quantidade/ref/tenant/CQ/lot e origens demonstradas no servidor.
- Idempotency key/fingerprint de payload e receipt privados imutáveis por ator/tenant/ação, CAS de versão observada; replay exato sem nova auditoria; mismatch nega, timeout recupera por leitura sem redispatch.
- Preservar o cancelamento/estorno transacional existente, endurecendo autoridade fresca pós-lock, tenant e replay, propriedade de cada movimento, ACK filho estrito e negação de expedição órfã; retorno de entregue separado/fechado até contrato próprio.
- Capturar schema/types/ACL/RLS/FK e todos os triggers/guards reais por leitura, restaurar em PG descartável sem stubs ou simplificações; testar rollback itemN, ACK negativo, spoof GUC, revogação pós-lock, concorrência/replay e zero título/dispatch financeiro/fiscal.
- Candidato pinado com PRE/POST e rollback deny-only; preservar snapshots/histórico/ACL e não liberar helpers ou billing. API JWT/RLS será uma prova distinta somente para operações autorizadas, não cobrança/NF obrigatória.

Não entregar wrapper meramente sintático como contrato pronto. A versão atual segura não depende desses itens para negar dispatch; eles bloqueiam a **reabertura operacional**, não a correção de contenção já testada.