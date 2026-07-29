# FASE 0 — Auditoria do Motor Unificado de Preços e Condições Comerciais

Ambiente auditado: **staging `ikaauvsflpmamgxmkhoq`** (leitura de `pg_proc`/`pg_policies`/`information_schema`) + código e migrations. Nenhuma alteração aplicada. Produção `navfzbwgwzruipouyfnk` não foi tocada.

## 1. Arquitetura atual

```text
NovoPedido.tsx / Simulador (portal parceiro)
   ├─ useCommercialPaymentPlans  -> commercial_payment_plans (SELECT direto)
   ├─ useSimulateB2BPaymentPlan  -> RPC simulate_b2b_payment_plan_secure  (não persiste)
   └─ useCreatePartnerOrder      -> RPC create_partner_order_secure
                                      ├─ partner_orders (+ campos motor)
                                      ├─ partner_order_items (+ *_snapshot)
                                      ├─ partner_order_payment_terms (snapshot do plano)
                                      └─ partner_order_payment_schedule (parcelas)
Financeiro (useB2BFinanceiro) -> RPC generate_b2b_receivable_secure
                                      ├─ accounts_receivable (origin_type='B2B_ORDER')
                                      ├─ accounts_receivable_installments (cópia 1:1 do schedule)
                                      └─ partner_order_financial_links (idempotência)
```

Fórmula oficial (idêntica nas duas RPCs): `tabela → desconto do PLANO → líquido → juros (none|simple|compound) → final`; parcelas iguais com ajuste de centavos na última, vencimentos a cada 30 dias a partir de `first_due_date`.

## 2. Última versão efetiva de cada RPC (confirmada no banco)

| RPC | Assinatura efetiva | Migration que produziu a versão vigente |
|---|---|---|
| `simulate_b2b_payment_plan_secure` | `(p_partner_id, p_payment_plan_id, p_items jsonb, p_first_due_date)` | `20260707221539_*.sql` |
| `create_partner_order_secure` | `(p_partner_id, p_observacoes, p_items, p_requested_delivery_date, p_payment_plan_id, p_first_due_date, p_installment_count)` | `20260707222533_*.sql` |
| `generate_b2b_receivable_secure` | `(p_partner_order_id)` | `20260707204247_*.sql` + patches `20260707205529`/`20260707210122` (confirmei no `pg_proc` que o bloqueio `financial_approval_rejected` está presente) |
| `convert_partner_simulation_to_order_secure` | `(p_simulation_id, ...)` — delega para `create_partner_order_secure` | `20260707204023_*.sql` |
| `approve/reject/request_adjustment/add_note_b2b_payment_terms_secure` | Fase 7 | `20260707205529_*.sql` |
| `approve_b2b_credit` | strict guard | `20260628230824_*.sql` |
| `cancel_b2b_receivable_secure` | Fase 5 | `20260617021055_*.sql` |

Todas `SECURITY DEFINER` com `search_path=public`. Sem overloads duplicados no schema.

## 3. Uso do preço específico do parceiro

Ambas as RPCs resolvem preço assim: se existir linha ativa em `partner_product_prices` para `(partner_id, product_id|microrganismo_id)`, usa **apenas `preco_tabela`**; senão deriva de `produtos`/`microrganismos` (`valor_ha_brl`, `valor_litro_brl`, `valor_dose_brl`, `dose_ml_ha`, `volume_ml`). Se nada resolver → `price_unavailable`.

## 4. `preco_final` e `desconto_percentual` são ignorados? **Sim.**

- `simulate_...` seleciona as três colunas mas usa só `v_price.preco_tabela`.
- `create_partner_order_secure` nem seleciona `preco_final`/`desconto_percentual`.
- O único desconto aplicado é `commercial_payment_plans.discount_percent`, gravado como `desconto_percentual_snapshot` no item.
- `partner_accounts.desconto_padrao` é lido nas duas RPCs em variável **morta** (`v_partner_desconto`) — não influencia preço; serve apenas como guarda de existência do parceiro.
- Consequência: a aba de preços do parceiro grava `preco_final` (calculado no client por `calcFinal()` em `usePartnerPrices.ts`, via `upsert` direto sem RPC) que **nunca é honrado** no pedido.

## 5. Parcelas do snapshot → contas a receber

`generate_b2b_receivable_secure`: lê `partner_order_payment_terms` mais recente (`final_amount`, `first_due_date`, `installment_count`), bloqueia `financial_approval_status` `pending`/`rejected`, garante idempotência por `partner_order_financial_links`, cria `accounts_receivable` (`origin_type='B2B_ORDER'`, `customer_id = partner_accounts.client_id`), **apaga** parcelas auto-geradas por trigger e copia `partner_order_payment_schedule` 1:1 para `accounts_receivable_installments` (`original_amount = net_amount = amount`), marcando o schedule como `generated` com `receivable_installment_id`.

## 6. Campos legados com risco de conflito

- `partner_product_prices.preco_final`, `.desconto_percentual` — gravados por trigger/UI, ignorados pelo motor.
- `partner_accounts.desconto_padrao` — exibido na UI, sem efeito.
- `partner_orders.subtotal/desconto_total/total` mantidos em paralelo a `table_amount/commercial_discount_amount/net_amount_after_discount/financial_interest_amount/final_amount_with_interest`.
- `partner_order_items.preco_unitario/desconto_percentual/subtotal` duplicam os `*_snapshot`.
- `partner_financial_settings.payment_terms_days` / `credit_limit` — não participam do cálculo (só `default_payment_method` e `billing_trigger` são usados).
- Retorno de `simulate_...` duplica `amounts.*` na raiz por retrocompatibilidade.
- `NovoPedido.tsx` soma `subtotal/total` no client (sem juros), divergindo do valor autoritativo do backend.

## 7. RLS envolvidas (todas `authenticated`)

- `commercial_payment_plans`: SELECT se `active` ou papel admin/financeiro/gestor_comercial; escrita só nesses 3 papéis.
- `partner_product_prices`: leitura admin/gestor_comercial + `ppp_self_select` (parceiro vê a própria tabela); escrita admin/gestor_comercial. Há duas policies SELECT redundantes (`ppp_select` e `partner_product_prices_select`).
- `partner_orders`/`partner_order_items`: SELECT admin, gestor_comercial, financeiro (só orders) e `parceiro_b2b` do próprio parceiro; INSERT/UPDATE apenas admin/gestor_comercial → criação real ocorre via RPC SECURITY DEFINER.
- `partner_order_payment_terms`/`_schedule`: SELECT admin/financeiro/gestor_comercial ou qualquer `partner_users` do parceiro (inclui técnico); escrita restrita aos 3 papéis internos.
- `partner_financial_settings` / `partner_order_financial_links`: internos; links também visíveis ao parceiro.
- `accounts_receivable`/`_installments`: `is_financial_staff` full; leitura B2B para gestor_comercial/administrativo; parceiro lê os próprios (`ar_partner_select_own_b2b`); produtor lê por `get_cliente_ids_for_user`.

**Ressalva:** `partner_order_payment_terms/_schedule` são legíveis por `parceiro_b2b_tecnico` (via `partner_users`), enquanto `viewerScope.ts` esconde condição de pagamento desse perfil na UI — divergência UI×RLS.

## 8. Dependências de outros módulos

- **Produção:** `useProductionPlanning` (join `partner_orders`), `recalc_partner_order_production`, `partner_order_has_production`.
- **Entrega:** `ordens_servico.partner_order_id`, `entregaDestinatario.ts`, `Entregas.tsx`, `RegistrarEntregaDialog`.
- **Financeiro/BI:** `accounts_receivable` alimenta `get_report_receivables` e DRE; qualquer mudança de valor afeta relatórios.
- **Fiscal:** sem acoplamento direto no front; `accounts_receivable.fiscal_invoice_required=false`/`NOT_REQUIRED` na geração B2B.
- **Comunicação:** `create_partner_order_secure` insere em `notificacoes_operacionais` (link `/comercial/pedidos-b2b`) para admin/gestor_comercial; `OrderMessagesPanel`, `TimelinePedidoDialog`, SLA (`check_partner_order_sla`).

## 9. Dívidas técnicas / riscos

1. **Alto** — preço específico do parceiro parcialmente ignorado: UI promete desconto por produto que o motor descarta.
2. **Alto** — cálculo duplicado no front (`calcFinal`, totais do carrinho) sem paridade com backend.
3. **Médio** — colunas legadas duplicadas podem ser lidas por telas/relatórios antigos e mostrar valores sem juros.
4. **Médio** — divergência UI×RLS para `parceiro_b2b_tecnico`.
5. **Médio** — produtor direto não existe: `create_partner_order_secure` exige `partner_id` obrigatório.
6. **Baixo** — policies SELECT redundantes; `desconto_padrao` morto; patches por manipulação de `prosrc` dificultam rastreio.

## 10. Produtor direto sem reativar a visão de pedidos B2B

Caminho proposto (Fase 1+), sem fluxo paralelo: manter o mesmo motor, adicionando resolução de titular no RPC (parceiro **ou** cliente) com `cliente_id` opcional, mantendo `partner_id` obrigatório apenas no fluxo B2B; expor ao produtor exclusivamente rotas `/app/*` já reservadas a `cliente_produtor` e a nova origem de pedido, mantendo `viewerScope="produtor"` (que já oculta desconto, condição de pagamento e notas internas) e **sem** reabilitar `/comercial/pedidos-b2b` nem as listagens B2B removidas.

## 11. Plano de migração (proposto para Fase 1, não executado)

1. Definir a regra oficial de precedência preço/desconto (decisão de negócio).
2. Migration única e idempotente que atualiza `simulate_...` e `create_partner_order_secure` para honrar `partner_product_prices` conforme a regra, mantendo assinatura e retornos atuais.
3. Front: eliminar `calcFinal` como fonte de verdade e passar a exibir sempre o retorno da simulação.
4. Alinhar RLS de `payment_terms/_schedule` ao `viewerScope` do técnico.
5. Marcar colunas legadas como deprecadas em documentação (sem remover).
6. Só então tratar produtor direto.

## 12. Rollback

Cada passo é reversível por migration inversa (`CREATE OR REPLACE` restaurando o corpo capturado hoje de `pg_proc` — recomendo salvar o snapshot em `restoration/motor-b2b-fase0/`), e nenhum passo altera schema físico nem apaga dados. Rollback de front é reversão de commit.

## 13. Matriz de testes

| # | Cenário | Esperado |
|---|---|---|
| T1 | Item com `partner_product_prices` ativo | preço conforme regra definida |
| T2 | Item sem preço de parceiro | fallback `produtos/microrganismos` |
| T3 | Sem preço em nenhum lugar | `price_unavailable` |
| T4 | 4 cenários oficiais de juros (0/1,5%/2%/safra) | paridade SQL × Vitest |
| T5 | Soma de parcelas | igual a `final_amount` (centavos na última) |
| T6 | Geração de recebível duas vezes | idempotente |
| T7 | `financial_approval_status` pending/rejected | bloqueio |
| T8 | Parceiro tenta plano de outro parceiro | `forbidden_partner` |
| T9 | Técnico parceiro cria pedido | `partner_tech_cannot_create_order` |
| T10 | Desconto > 40% por não-admin | `discount_exceeds_limit` |
| T11 | RLS por papel nas 10 tabelas | matriz `scripts/rbac-audit` |
| T12 | Produtor não acessa rotas/pedidos B2B | 403/rota ausente |

## 14. Status

**APTO COM RESSALVAS** para iniciar a Fase 1. Ressalvas obrigatórias antes de codificar: (a) decisão de negócio sobre precedência entre `partner_product_prices` e `commercial_payment_plans.discount_percent`; (b) snapshot dos corpos atuais das RPCs para rollback; (c) trabalho restrito a staging.
