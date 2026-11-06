# Pedido pelo parceiro B2B — AR Bio (auditoria revisável, 06/11/2026)

**NO-GO operacional.** É o mesmo plano original de nove etapas (`.lovable/plan/plano-de-correção-do-fluxo-de-pedido-b2b-por-etapas-2026-10-27.md`), não um plano novo.
Base `b8700e05c` (logout/logo) sobre o catálogo publicado em 06/11. Nesta rodada não houve SQL remoto, leitura hospedada, migração, publicação, envio, criação de usuário nem mudança de permissão.

Escopo: vendedora AR Bio, tenant `007bb519-cba0-4704-be2c-cb93ad010048`; comprador `teste4@refilinformatica.com.br`, parceiro FICTÍCIO `7e52de9a-4bed-4d1e-8200-3255a805465c`. FSF / FSF AGROSERVICE ficam fora; nenhuma outra empresa é tocada.

## Inventário por etapa (consumidor → RPC → gate → estado do pacote)
| Etapa | Consumidor (frontend) | RPC / tabela | Gate | Estado |
|---|---|---|---|---|
| Catálogo | `useMyPartner.ts:36-61`, `usePartnerCatalog.ts:70-118`, `useCatalogoVolumes.ts:77` | `get_my_commercial_partner_context/projection`, `get_partner_catalog_secure(p_catalog_v2)`, `catalogo_volumes` | contrato `C1B_DUAL_TENANT_V1` | Fence V2 aplicada em produção (relato do auditor); V1 reprovada |
| Carrinho / pedido | `PortalParceiroLayout.tsx:61-63,218-225`, `NovoPedido.tsx:372-538`, `useCreatePartnerOrder.ts:109-147` | `simulate_b2b_payment_plan_secure`, `create_partner_order_secure` | `order_capabilities = C2_OWNER_ORDER_V1/order_create`, feature `pedidos_b2b`, hash do carrinho, chave idempotente | Writer do proprietário registrado como `SELECT false` (`commercial-order-entry-20261024`, INATIVO). Estado atual não verificado |
| Cotação | `useRespondB2BQuote.ts:62-69` | `respond_b2b_order_quote_secure` | `payment_plan_required` | Capturado; não reexecutado |
| Condição / pagamento | `useCommercialPaymentPlans.ts:31-40`, `PaymentPlanSelector.tsx` | `rpc_b2b_list_selectable_payment_plans` | condição publicada e atribuída | Só condição comercial; **meio de pagamento ausente** |
| Aprovação / crédito | `usePartnerOrderActions.ts:18-67`, `useB2BFinanceiro.ts:285-330` | `approve_partner_order`, `approve_b2b_credit`, `rpc_b2b_partner_credit`, guard de crédito | trava `b2b_credit`, limite explícito | `arbio-fsf-incremental-20261029` e guard compartilhado: candidatos INATIVOS |
| Estoque / reserva | `useEsteiraLaboratorio.ts:486-609`, `motorEstoque.ts:98` | `reservar_estoque_item`, `rpc_estoque_reservar_v1`, `rpc_estoque_operar_v1` | idempotência e origem | Estoque/envase v2 relatado como instalado externamente |
| Produção / envase | `useProductionPlanning.ts:73-169` | `rpc_planejamento_publicar_v1` (`publish_planning_to_lab` sem caller direto) | `ENVASE_TRANSITION_REVIEW_PENDING` | Só biológico; químico/fertilizante **não** abre produção por inferência |
| Faturamento / recebível | `useB2BFinanceiro.ts:73-99`, `FiscalTab.tsx:31-49`, `useDeliveryFinanceReconciliation.ts:43-71` | `generate_b2b_receivable_secure`, `cancel_b2b_receivable_secure`, `fiscal_invoices` | NF autorizada; fiscal/contabilidade PENDENTE | A2 e escopo de cobrança INATIVOS; o gatilho NF não está implementado |
| Entrega / comprovante / cancelamento | `Entregas.tsx`, `deliveryOperationsFlow.ts:11-212`, `deliverySendFlow.ts`, `deliveryProofFlow.ts:22-166` | `rpc_entrega_*_capability_v1`, `rpc_cockpit_criar_entrega_v1`, `rpc_entrega_cancelar_v1`, `rpc_entrega_enviar_manual_v1`, comprovação | capacidades exatas antes do envio | Endurecimento atômico instalado (relato); grupo/cancelamento candidato NÃO autorizado |

## Bloqueios, em ordem
1. **B1 (servidor, estado não verificado):** sem `order_capabilities.contract = C2_OWNER_ORDER_V1` com `order_create = true`, mais a feature `pedidos_b2b`, o comprador vê só o catálogo, sem carrinho. A última captura é `SELECT false`. Prova: a leitura da projeção pelo próprio comprador, em sessão real, sem SQL do assistente.
2. **B2 (primeiro bloqueio provado localmente):** nenhum sólido entra no pedido. As tabelas `product_packagings`, `product_sale_units` e o preço por embalagem em centavos existem no catálogo, mas `NovoPedido` precifica só por `volume_ml × preço/L / 1000`. Além disso, `create_partner_order_secure` e `simulate_b2b_payment_plan_secure` não aceitam `packaging_id`. Assim, fertilizante sólido e pedido misto não podem ser pedidos. O pedido do biológico líquido não é afetado.
3. **B3:** o comprador escolhe a condição comercial, não o meio de pagamento (Pix, dinheiro, débito, boleto Price, promissória ou crédito). A regra de 31/10 continua não implementada.
4. **B4:** recebível só com NF autorizada. O gatilho não existe; fiscal e contabilidade estão PENDENTES; emissão, transmissão, cobrança e envios ficam OFF.

## Patch mínimo proposto para B2 (não aplicado; precisa de SQL revisado)
- Servidor: um item de pedido com `packaging_id` e quantidade inteira maior que 0. O preço é resolvido no servidor pelo preço vigente da embalagem, do mesmo dono do tenant. O snapshot grava código, versão, `peso_liquido_kg`, `unidade_conteudo` e preço. Combinar `volume_ml` com `packaging_id` é rejeitado, assim como quantidade fracionária. Corpos capturados com pin md5, pre/post e rollback que apenas nega.
- Frontend: só depois dos tipos regenerados com o contrato. O diálogo oferece apenas embalagens ativas com preço vigente; o peso fica só para frete; o carrinho envia `packaging_id`, nunca preço.
- Evidência antes: `src/test/comercial/partnerOrderFlowArbio.audit.test.ts` (B2/B3 BLOCKED, 9/9 PASS). Depois: esses testes devem falhar e ser substituídos por testes positivos e negativos do novo contrato. Captura viva, JWT e RLS: NOT RUN.

## Dados de teste mínimos (o proprietário cria pelo fluxo autorizado; o assistente não cria nada)
Prefixo `TESTE-PED-20261106-` em nomes e códigos, sempre no tenant AR Bio:
- Biológico líquido: 1 produto com volume de 1 L.
- Químico líquido: 1 produto, que **não** abre produção nem envase.
- Fertilizante sólido: 1 produto `solo`/kg com uma embalagem de 25 kg (bloqueado por B2).
- Pedido misto: biológico + químico (+ sólido depois de B2).
- Condições: Pix à vista com 1 parcela em D+N configurado; boleto Price até 3. Promissória e crédito só se o administrador configurar, sem taxa inventada.
- Entrega com referência física fictícia `TESTE-PED-20261106-ENT`.

Antes de criar, revisar os gatilhos: guard de crédito, gerador de OS, comunicação (OFF), cobrança/fiscal (OFF).

Limpeza reversível: registrar os IDs criados; arquivar ou inativar produtos, embalagens e condições; cancelar pedidos pelo fluxo canônico, sem DELETE; nunca apagar histórico, ledger ou recibo. Não tocar as fixtures proibidas `d7edc250…`, lote `5fa6d35b…` e OS `c909c862…`.
