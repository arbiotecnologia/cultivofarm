# Inventário estoque/entregas parciais ARBio — REVIEW_ONLY (revisor: agente Codex)

Baseline publicado `74fb2a5f7c5019933729312f1ebdcb1d158507a9`. Nenhuma operação hospedada, SQL, publicação, concessão, envio, fiscal ou cobrança nesta execução. Revisão feita pelo agente Codex, não pelo usuário.

## 1. Hashes LIVE informados × fontes locais (sem divergência; nenhuma nova captura necessária)
| Função | MD5 LIVE | Fonte local que pina o mesmo MD5 |
|---|---|---|
| rpc_finished_product_purchase_entry_v1 | 5c7fb9ce… | physical/finished-product/review-6667a8d6 (install-downstream/postflight) |
| rpc_finished_product_purchase_capability_v1 | 39b60c49… | production-rollout-posplans-20261108/62-pilot-containment-post; attempt-224/pilot-containment/03-post |
| rpc_b2b_resale_os_create_v1 | 6a249b41… | 62-pilot-containment-post |
| rpc_b2b_resale_os_availability_v1 | e9767fcb… | production-rollout-posplans-20261108-reader-rowtype-overlay/manifest |
| rpc_entrega_confirmar_manual_v1 | 9d991229… | delivery-atomic-hardening-20261030/confirmation/send (pre/post-state) |
| rpc_entrega_enviar_manual_v1 | 180a74db… | confirmation/send/install + 92-send-rollback-deny |
| rpc_entrega_operacoes_capability_v1 | 849940fb… | confirmation/send (pre/post-state) |
Conclusão: produção = pacote POSPLANOS + contenção do piloto instalados e fechados (gates false, allowlist sem concessão; envio/confirmação sem EXECUTE authenticated). Não há SQL novo a gerar para o fluxo físico.

## 2. Contratos atômicos reais (cadeia local `rebuild_current.py`, attempt-224, 57/57 PASS, 38 gatilhos)
| Etapa | Contrato | Prova local (attempt-224) |
|---|---|---|
| Compra acabado→estoque (embalagem inteira; kg/g/mL/L = conteúdo; peso só frete) | rpc_finished_product_purchase_entry_v1 (+capability) | "new physical control purchase reserve send proof confirm without manufacture"; lote sem programação/microrganismo/CQ/envase |
| OS revenda | rpc_b2b_resale_os_create_v1 (+availability) | uma OS pronta, sem produção/bioreator; CAS, replay, conflito, comprador negado; revogação após wait (papel/perfil/tenant/gate) na criação e no replay |
| Reserva | rpc_estoque_reservar_v1 origem b2b | fracionado `FINISHED_PRODUCT_WHOLE_PACK_REQUIRED`; parceiro/pedido divergente `ESTQ_REFERENCE_FORBIDDEN`; comprador negado; estoque inalterado |
| Criação da entrega | rpc_cockpit_criar_entrega_v1 | grupo + replay; split usa UUID devolvido |
| Envio | rpc_entrega_enviar_manual_v1 | em_rota + replay |
| Formulário/assinatura/anexo | rpc_entrega_formulario_gerar_v1, rpc_entrega_comprovante_anexar_v1 | geração/anexo + replays; comprador negado |
| Confirmação | rpc_entrega_confirmar_manual_v1 | entregue + replay; 1 movimentação de expedição (sem baixa dupla); 0 recebível/NF novos, delivery_no_downstream |
| Parcial / saldo | review70 | quantidade 3 entrega 1 → saldo 2 sem reserva; parcial cancelada não conclui; sobre-entrega não conclui nem reescreve snapshots; duas últimas entregas concorrentes |
| Cancelamento | rpc_entrega_cancelar_v1 | reserva liberada + estorno, três embalagens inteiras restauradas, vínculo do pedido mantido, sem recebível |
| Rollback | 89→90→94→93→92→91 deny-only | histórico (OS/movimentos/entregas/recibos) idêntico; envio/confirmação `permission denied` |
| Caminho biológico separado | fluxo agronômico manual | "manual agronomic physical flow still passes"; revenda nunca usa bioreator/CQ/envase |
Auth sintética: não é JWT, RLS nem Storage reais.

## 3. Frontend correspondente
| Etapa | Tela/adaptador | Estado |
|---|---|---|
| Compra | useFinishedProductPurchase (sonda capability) | fecha sem capability |
| OS revenda | lib/comercial/resaleOsRequest | chama o RPC; servidor nega com gate/allowlist |
| Envio/confirmação | deliverySendFlow / deliveryOperationsFlow | abre só com capability exata |
| Reserva (useEsteiraLaboratorio:495/580), recebimento/dispensa (EntregaComprovantePanel), embalagens, conferência QR, motorEstoque | `requireDeliveryOperationContract()` | **sempre fechado**; é o aviso visto em produção |
| Criação de grupo | buildGroupArgs | **rejeita OS b2b** (só padrao/agronomica sem pedido) |
Testes de tela (7 arquivos, 158/158, exit 0): `vitest-stdout.txt`, `vitest-exitcode.txt`.

## 4. Pendências reais (nenhum dado foi inventado)
1. **UI sem caminho para reservar e agrupar revenda B2B.** A capability `delivery_operations_v1` só tem `{group,cancel}` genéricos e não diz se a revenda/piloto está liberada. Abrir a UI só com esse sinal ofereceria a operação a tenants fora do piloto. Menor delta correto: uma capability server-side que derive `b2b_resale` de `resale_pilot_scope_v1` (sem lock, ator/org/operação/referência) e devolva só operações concedidas. A UI abre reserva/grupo b2b só com esse envelope exato. É SQL + frontend novos: **não implementado nesta execução**, precisa de revisão própria. Até lá a UI continua fechada (correto, sem bypass).
2. Ativação: gates false e allowlist vazia. A sessão real exige que o auditor crie concessões exatas e curtas (purchase/os_create/reserve/delivery_create/send/proof/confirm/cancel) para ator/org ARBio e referências sintéticas novas, mais EXECUTE de envio/confirmação conforme o pacote revisado. Nada disso foi feito aqui.
3. Ainda não provado: timeout de rede do cliente em reserva/grupo com resultado incerto (a chave é preservada nos adaptadores de envio/confirmação; reserva/grupo b2b não têm adaptador); JWT/RLS/Storage reais.
4. Fiscal e contabilidade continuam pendentes; PB001039 (18, boleto, comprador fictício 5c4f…) não deve ser promovido nem usado.

## 5. Roteiro de sessão real (depois da revisão; sem fiscal/contabilidade)
1. Auditor: PRE readonly (hashes da seção 1) → concessões exatas com validade ≤4h para um produto químico/fertilizante novo, pedido sintético novo e comprador sintético novo (nunca entrega 0005, PB001039 nem fixtures proibidas).
2. Compra de N embalagens inteiras → conferir físico/reservado/disponível.
3. OS de revenda → reservar M<N → criar entrega de K<M → enviar → formulário/assinatura/anexo → confirmar. Conferir pedido **não concluído**, saldo, uma expedição, zero recebível/NF.
4. Segunda entrega do saldo → confirmação → pedido concluído só com cobertura integral. Repetir requisição (replay) e simular revogação durante a espera.
5. Cancelamento de uma entrega pendente → estorno das embalagens inteiras.
6. Rollback deny-only 89→91 → conferir `permission denied` e histórico preservado. A etapa 3 da UI depende da pendência 1; antes disso, só RPC pela sessão real autenticada.
