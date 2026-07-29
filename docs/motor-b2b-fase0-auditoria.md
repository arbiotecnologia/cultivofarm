# FASE 0 — Auditoria do Motor Unificado de Preços e Condições Comerciais (AR Bio)

> Auditoria **somente leitura**. Nenhum código de negócio, migration, rota ou tabela foi alterado.
> Ambiente auditado: **staging `ikaauvsflpmamgxmkhoq`** (`pg_proc`, `pg_policies`, `information_schema`) + código-fonte e `supabase/migrations`.
> Produção `navfzbwgwzruipouyfnk` **não foi acessada nem alterada**. Nenhum secret exposto.

---

## 1. Arquitetura atual

```text
NovoPedido.tsx / Simulador (portal parceiro)
   ├─ useCommercialPaymentPlans  -> commercial_payment_plans (SELECT direto)
   ├─ useSimulateB2BPaymentPlan  -> RPC simulate_b2b_payment_plan_secure   (não persiste)
   └─ useCreatePartnerOrder      -> RPC create_partner_order_secure
                                      ├─ partner_orders (+ campos do motor)
                                      ├─ partner_order_items (+ *_snapshot)
                                      ├─ partner_order_payment_terms (snapshot do plano)
                                      └─ partner_order_payment_schedule (parcelas)

Financeiro (useB2BFinanceiro)   -> RPC generate_b2b_receivable_secure
                                      ├─ accounts_receivable (origin_type='B2B_ORDER')
                                      ├─ accounts_receivable_installments (cópia 1:1 do schedule)
                                      └─ partner_order_financial_links (idempotência)
```

**Fórmula oficial** (idêntica em simulação e criação de pedido):

```
tabela  = Σ (preco_tabela_item × quantidade)
desconto = tabela × plano.discount_percent / 100
liquido  = tabela − desconto
final    = none     -> liquido
           simple   -> liquido × (1 + taxa/100 × meses)
           compound -> liquido × (1 + taxa/100) ^ meses
juros    = final − liquido
```

Parcelas iguais com ajuste de centavos na última; vencimentos a cada 30 dias a partir de `first_due_date`
(`first_due_date` limitado a `current_date + plano.max_days` para perfis não internos).

---

## 2. Última versão efetiva de cada RPC (confirmada no banco)

| RPC | Assinatura efetiva | Migration que produziu a versão vigente |
|---|---|---|
| `simulate_b2b_payment_plan_secure` | `(p_partner_id uuid, p_payment_plan_id uuid, p_items jsonb, p_first_due_date date)` | `20260707221539_*.sql` |
| `create_partner_order_secure` | `(p_partner_id, p_observacoes, p_items, p_requested_delivery_date, p_payment_plan_id, p_first_due_date, p_installment_count)` | `20260707222533_*.sql` |
| `generate_b2b_receivable_secure` | `(p_partner_order_id uuid)` | `20260707204247_*.sql` + patches `20260707205529` / `20260707210122` (bloqueio `financial_approval_rejected` confirmado no `pg_proc` vigente) |
| `convert_partner_simulation_to_order_secure` | delega para `create_partner_order_secure` | `20260707204023_*.sql` |
| `approve_b2b_payment_terms_secure`, `reject_b2b_payment_terms_secure`, `request_b2b_payment_terms_adjustment_secure`, `add_b2b_payment_terms_note_secure` | Fase 7 | `20260707205529_*.sql` |
| `approve_b2b_credit` | strict guard com `FOR UPDATE` | `20260628230824_*.sql` |
| `cancel_b2b_receivable_secure` | Fase 5 | `20260617021055_*.sql` |

Todas são `SECURITY DEFINER` com `SET search_path = public`. **Não há overloads duplicados** dessas funções no schema `public`.

---

## 3. Como o preço específico do parceiro é utilizado

Ambas as RPCs resolvem o preço unitário assim:

1. Se existir linha **ativa** em `partner_product_prices` para `(partner_id, product_id)` ou `(partner_id, microrganismo_id)` → usa **apenas `preco_tabela`**.
2. Caso contrário, deriva do cadastro (`produtos` / `microrganismos`) conforme a unidade pedida:
   - `hectare` → `valor_ha_brl` ou `(dose_ml_ha / 100) × dose_base`
   - `litro` → `valor_litro_brl` ou `dose_base × 10`
   - `dose` → `valor_dose_brl` (ou `valor_litro_brl / 10`)
   - `unidade` → `(volume_ml / 1000) × valor_litro_brl`
3. Se nada resolver ou o valor for ≤ 0 → exceção `price_unavailable`.

Itens inativos ou com `b2b_enabled = false` → `product_unavailable`.

---

## 4. `preco_final` e `desconto_percentual` de `partner_product_prices` são ignorados? **Sim**

- `simulate_b2b_payment_plan_secure` **seleciona** as três colunas (`preco_tabela, desconto_percentual, preco_final`) mas usa somente `preco_tabela`.
- `create_partner_order_secure` **nem seleciona** `preco_final` / `desconto_percentual` — só `preco_tabela`.
- O único desconto aplicado é `commercial_payment_plans.discount_percent`, gravado no item como `desconto_percentual_snapshot` e usado para `preco_unitario_final_snapshot`.
- `partner_accounts.desconto_padrao` é lido para a variável `v_partner_desconto` nas duas RPCs, mas **nunca é usado no cálculo** (variável morta); serve na prática apenas como guarda de existência/ativação do parceiro.

**Consequência prática:** a aba de preços do parceiro grava `preco_final` calculado no cliente (`calcFinal()` em `src/hooks/usePartnerPrices.ts`, via `upsert` direto, sem RPC) e esse valor **nunca é honrado** no pedido.

---

## 5. Como as parcelas do snapshot chegam ao contas a receber

`generate_b2b_receivable_secure(p_partner_order_id)`:

1. Autoriza `administrador | financeiro | gestor | gestor_comercial` (ou chamada de sistema com `auth.uid()` nulo).
2. Bloqueia pedidos `cancelado` / `reprovado`.
3. Lê a condição mais recente em `partner_order_payment_terms` — sem ela: `payment_terms_not_defined`.
4. Bloqueia `financial_approval_status` em `pending` ou `rejected`.
5. Idempotência por `partner_order_financial_links` (retorna o `receivable_id` existente com `duplicado: true`).
6. Cria `accounts_receivable` com `origin_type='B2B_ORDER'`, `origin_id = partner_order_id`, `customer_id = partner_accounts.client_id`, `total_amount = terms.final_amount`, `first_due_date`, `installment_count`, `fiscal_invoice_required=false` / `fiscal_invoice_status='NOT_REQUIRED'`.
7. **Apaga** parcelas geradas automaticamente por trigger e copia `partner_order_payment_schedule` **1:1** para `accounts_receivable_installments`
   (`original_amount = net_amount = schedule.amount`, `interest_amount` preservado, `status='OPEN'`).
8. Marca cada linha do schedule com `status='generated'` e `receivable_installment_id` (vínculo bidirecional).
9. Atualiza `partner_orders` (`financial_status='gerado'`, `receivable_generated*`, `payment_due_date`, `payment_method`) e registra auditoria em `partner_order_audit_logs`.

---

## 6. Campos legados que ainda podem causar conflito

| Campo | Situação |
|---|---|
| `partner_product_prices.preco_final`, `.desconto_percentual` | Gravados pela UI/trigger, **ignorados** pelo motor |
| `partner_accounts.desconto_padrao` | Exibido na UI, sem efeito no cálculo |
| `partner_orders.subtotal / desconto_total / total` | Mantidos em paralelo a `table_amount`, `commercial_discount_amount`, `net_amount_after_discount`, `financial_interest_amount`, `final_amount_with_interest` |
| `partner_order_items.preco_unitario / desconto_percentual / subtotal` | Duplicam `preco_tabela_snapshot`, `desconto_percentual_snapshot`, `preco_unitario_final_snapshot` |
| `partner_financial_settings.payment_terms_days`, `.credit_limit` | Não participam do cálculo (só `default_payment_method` e `billing_trigger` são usados) |
| Retorno de `simulate_...` | Duplica `amounts.*` também na raiz do JSON (retrocompatibilidade) |
| `NovoPedido.tsx` | Soma `subtotal` / `total` no cliente **sem juros** — diverge do valor autoritativo do backend |

---

## 7. RLS envolvidas (todas para o papel `authenticated`)

- **`commercial_payment_plans`** — `cpp_select`: `active = true` OU `administrador|financeiro|gestor_comercial`; INSERT/UPDATE/DELETE restritos a esses três papéis.
- **`partner_product_prices`** — leitura `administrador|gestor_comercial`, mais `ppp_self_select` (`parceiro_b2b` vê a própria tabela); escrita `administrador|gestor_comercial`. *Há duas policies SELECT redundantes*: `ppp_select` e `partner_product_prices_select`.
- **`partner_orders`** — SELECT: `administrador`, `gestor_comercial`, `financeiro` (policy própria) e `parceiro_b2b` do próprio parceiro; INSERT/UPDATE apenas `administrador|gestor_comercial` (criação real ocorre via RPC `SECURITY DEFINER`).
- **`partner_order_items`** — SELECT via `EXISTS` no pedido pai (mesma regra); escrita restrita a `administrador|gestor_comercial`.
- **`partner_order_payment_terms` / `partner_order_payment_schedule`** — SELECT `administrador|financeiro|gestor_comercial` **ou qualquer usuário em `partner_users` do parceiro** (inclui `parceiro_b2b_tecnico`); INSERT/UPDATE só internos.
- **`partner_financial_settings`** — leitura/escrita `administrador|financeiro|gestor|gestor_comercial`; leitura extra para `gestor_comercial|administrativo`.
- **`partner_order_financial_links`** — ALL para internos; SELECT para o parceiro dono e para `gestor_comercial|administrativo`.
- **`accounts_receivable`** — ALL `is_financial_staff`; SELECT B2B para `gestor_comercial|administrativo`; `ar_partner_select_own_b2b` (parceiro via `partner_users`); `ar_producer_read` (`cliente_produtor` por `get_cliente_ids_for_user`).
- **`accounts_receivable_installments`** — ALL `is_financial_staff`; `ari_b2b_readers`; `ari_producer_read` (por `customer_id` do recebível).

> **Ressalva de segurança (não crítica):** `partner_order_payment_terms` e `partner_order_payment_schedule` são legíveis por `parceiro_b2b_tecnico` no banco, enquanto `src/components/pedidos-b2b/viewerScope.ts` oculta condição de pagamento para esse perfil na UI. Divergência UI × RLS a alinhar na Fase 1.

---

## 8. Dependências de outros módulos

- **Produção** — `useProductionPlanning` (join em `partner_orders`), `recalc_partner_order_production`, `partner_order_has_production`, `production_order_link`.
- **Entrega** — `ordens_servico.partner_order_id`, `src/lib/entregaDestinatario.ts`, `src/pages/Entregas.tsx`, `RegistrarEntregaDialog.tsx`.
- **Financeiro / BI** — `accounts_receivable` e suas parcelas alimentam `get_report_receivables`, DRE e relatórios executivos; qualquer mudança de valor no motor reflete diretamente nesses painéis.
- **Fiscal** — sem acoplamento no frontend; a geração B2B cria recebível com `fiscal_invoice_required = false` / `NOT_REQUIRED`, ou seja, hoje o pedido B2B **não dispara** documento fiscal automaticamente.
- **Comunicação** — `create_partner_order_secure` insere em `notificacoes_operacionais` (tipo `pedido_b2b_novo`, link `/comercial/pedidos-b2b`) para `administrador` e `gestor_comercial`; além de `OrderMessagesPanel`, `TimelinePedidoDialog` e SLA (`check_partner_order_sla`, `partner_order_sla_status`).

---

## 9. Dívidas técnicas e riscos

| # | Severidade | Item |
|---|---|---|
| D1 | **Alta** | Preço específico do parceiro parcialmente ignorado: a UI promete desconto por produto que o motor descarta |
| D2 | **Alta** | Cálculo duplicado no frontend (`calcFinal`, totais do carrinho) sem paridade com o backend |
| D3 | Média | Colunas legadas duplicadas podem ser lidas por telas/relatórios antigos e exibir valores sem juros |
| D4 | Média | Divergência UI × RLS para `parceiro_b2b_tecnico` em `payment_terms` / `payment_schedule` |
| D5 | Média | Produtor direto inexistente: `create_partner_order_secure` exige `partner_id` obrigatório |
| D6 | Baixa | Policies SELECT redundantes em `partner_product_prices`; `desconto_padrao` morto; patches via manipulação de `prosrc` dificultam rastreio histórico |

---

## 10. Como incluir produtor direto sem reativar a visualização de pedidos B2B removida

Caminho proposto (Fase 1+), **sem criar fluxo paralelo**:

1. Manter o mesmo motor e as mesmas RPCs; adicionar resolução de **titular** (parceiro **ou** cliente) com `cliente_id` opcional, mantendo `partner_id` obrigatório apenas na origem B2B.
2. Expor ao produtor **exclusivamente** rotas `/app/*` já reservadas a `cliente_produtor` em `src/lib/permissions.ts` — sem reabilitar `/comercial/pedidos-b2b` nem as listagens B2B removidas.
3. Reaproveitar `viewerScope = "produtor"` (`viewerScope.ts`), que já oculta desconto, condição de pagamento, status financeiro e notas internas.
4. RLS: nova origem lida por `get_cliente_ids_for_user`, como já ocorre em `ar_producer_read` — nenhuma policy B2B existente é afrouxada.

---

## 11. Plano de migração (Fase 1 — não executado)

1. Decisão de negócio: regra oficial de precedência entre `partner_product_prices` e `commercial_payment_plans.discount_percent`.
2. Migration única e idempotente atualizando `simulate_b2b_payment_plan_secure` e `create_partner_order_secure` para honrar a regra definida, **mantendo assinatura e contrato de retorno atuais**.
3. Frontend: eliminar `calcFinal` como fonte de verdade; passar a exibir sempre o retorno da simulação.
4. Alinhar RLS de `payment_terms` / `payment_schedule` ao `viewerScope` do técnico.
5. Documentar colunas legadas como deprecadas (**sem remover**).
6. Só então tratar o produtor direto.

---

## 12. Rollback

- Antes de qualquer alteração, capturar o corpo vigente das RPCs com `restoration/motor-b2b-fase0/capture-rpc-snapshot.sql` e guardar o resultado como script de restauração.
- Cada passo é revertido por `CREATE OR REPLACE FUNCTION` com o corpo capturado — nenhum passo altera schema físico nem remove dados.
- Rollback de frontend = reversão de commit.

---

## 13. Matriz de testes

| # | Cenário | Esperado |
|---|---|---|
| T1 | Item com linha ativa em `partner_product_prices` | preço conforme a regra oficial definida |
| T2 | Item sem preço de parceiro | fallback para `produtos` / `microrganismos` |
| T3 | Sem preço em nenhuma fonte | `price_unavailable` |
| T4 | 4 cenários oficiais de juros (0 / 1,5% / 2% / safra 8m) | paridade SQL × Vitest |
| T5 | Soma das parcelas | igual a `final_amount` (centavos na última) |
| T6 | Gerar recebível duas vezes | idempotente (`duplicado: true`) |
| T7 | `financial_approval_status` `pending` / `rejected` | bloqueio na geração |
| T8 | Parceiro simula/cria para outro parceiro | `forbidden_partner` |
| T9 | `parceiro_b2b_tecnico` cria pedido | `partner_tech_cannot_create_order` |
| T10 | Plano com desconto > 40% por não-admin | `discount_exceeds_limit` |
| T11 | Matriz RLS por papel nas 10 tabelas | `scripts/rbac-audit` |
| T12 | Produtor acessa rotas/pedidos B2B | negado / rota ausente |

---

## 14. Status

### **APTO COM RESSALVAS** para iniciar a Fase 1

Ressalvas obrigatórias antes de escrever qualquer código:

1. Decisão de negócio sobre a precedência entre preço/desconto do parceiro e desconto do plano comercial (item 4).
2. Snapshot dos corpos atuais das RPCs registrado para rollback (item 12).
3. Todo o trabalho restrito ao staging `ikaauvsflpmamgxmkhoq`.
