# Auditoria E2E somente-leitura — Demandas/Solicitações do Parceiro B2B

- Data: 2026-07-31
- Ambiente: staging `ikaauvsflpmamgxmkhoq` (somente leitura). Produção `navfzbwgwzruipouyfnk` **não acessada**. Nada publicado.
- Natureza: auditoria estática de código + consultas `SELECT` no staging. **Nenhuma** escrita, migration, seed, fixture, deploy ou alteração de configuração.
- Limite metodológico: não foram criados usuários nem executados harnesses de escrita. Itens que exigiriam mutação estão marcados **NÃO PROVADO**. `service_role` não foi usado como prova de RLS.

## Status final

**🔴 NÃO APTO** para certificar a jornada ponta a ponta do parceiro B2B.

Motivo determinante: hoje, no staging, **nenhum usuário parceiro consegue concluir compra alguma** — não há condição de pagamento elegível para nenhum parceiro (0 assignments publicados), e **nenhuma nota fiscal existe ou pode ser emitida** (0 `fiscal_invoices`, pipeline de emissão real inexistente por desenho declarado). As modalidades A, B, C e D não puderam ser exercidas.

---

## 1. Arquitetura e fluxo real

### 1.1 Superfície de rotas (src/App.tsx)

`/portal-parceiro` é protegido por `B2BRouteGuard` (`src/components/guards/B2BRouteGuard.tsx`), que resolve autorização no servidor via `get_my_available_portal_contexts()` e concede bypass legado a `administrador` e `gestor_comercial`.

| Rota | Componente |
| --- | --- |
| `/portal-parceiro/dashboard` | `DashboardRouter` |
| `/portal-parceiro/novo`, `/catalogo`, `/simulador` | **o mesmo** `NovoPedido.tsx` (1076 linhas) |
| `/portal-parceiro/pedidos` | `MeusPedidos` |
| `/portal-parceiro/solicitacoes` | `Solicitacoes` |
| `/portal-parceiro/simulacoes`, `/simulacoes-equipe` | histórico de simulações |
| `/portal-parceiro/financeiro` | `Financeiro` |
| `/comercial/solicitacoes-b2b` | `ComercialSolicitacoesB2B` (painel interno) |
| `/comercial/condicoes-pagamento` | administração de planos/condições |

Observação: catálogo, carrinho e simulador não são páginas distintas — são a mesma tela com modo (`isSimulationMode`), o que concentra estado e aumenta o risco de vazamento de condição entre modos (ver seção 6).

### 1.2 Backend consumido

- Catálogo: `get_partner_catalog_secure(p_partner_id)` (SECURITY DEFINER, EXECUTE só para `authenticated`).
- Preço base: `fn_b2b_resolve_base_unit_price(...)` — precedência `partner_product_prices` → preço de catálogo (`produtos` / `microrganismos`), com `ITEM_WITHOUT_PRICE` quando não há base. XOR de item validado (`num_nonnulls(product_id, microrganismo_id) <> 1 → ITEM_INVALID`), unidade restrita a `hectare|litro|dose|unidade`, `unidade` exige `volume_ml > 0`.
- Resolução do carrinho: `fn_resolve_b2b_cart(...)` (menciona `min_quantity`).
- Planos selecionáveis: `rpc_b2b_list_selectable_payment_plans()`.
- Checkout: `create_partner_order_secure(p_partner_id, p_observacoes, p_items, p_requested_delivery_date, p_payment_plan_id, p_first_due_date, p_installment_count, p_expected_cart_hash, p_idempotency_key)`.
- Recebível: `generate_b2b_receivable_secure` → `_impl`.
- Fiscal: `fn_fiscal_requirement_resolve(...)`, `fn_b2b_order_billing_eligibility(...)`.
- Condições configuráveis: família `rpc_cc_*` (`src/hooks/useCommercialConditions.ts`), com tabelas `commercial_payment_plan_assignments` e `commercial_condition_item_prices` acessadas somente por RPC.

O frontend **não** fornece preço definitivo: `useCreatePartnerOrder` envia apenas `item_id`, `item_tipo`, `quantidade`, `unidade_medida` e `volume_ml`, mais `expected_cart_hash` e `idempotency_key` (`src/hooks/useCreatePartnerOrder.ts:69-90`). ✅

---

## 2. Diferenciação técnica das entidades

| Conceito | Materialização real | Observação |
| --- | --- | --- |
| Demanda/solicitação do parceiro | **não existe entidade própria**; `/portal-parceiro/solicitacoes` opera sobre `partner_orders` em estados iniciais e sobre mensageria (`partner_order_messages`) | "Solicitação" é um estado do pedido, não um objeto separado |
| Solicitação do produtor | `portal_solicitacoes` (fluxo paralelo, outro portal) | não converge para `partner_orders` |
| Simulação | `partner_simulations` + `partner_simulation_items` | conversão via `convert_partner_simulation_to_order_secure`; `partner_orders.origin_simulation_id` |
| Pedido oficial | `partner_orders` (+ `partner_order_items`, `partner_order_payment_terms`) | |
| Cotação | `partner_orders.status = 'aguardando_cotacao'` + `pricing_mode_snapshot='quote_only'` nos itens | resposta via `respond_b2b_order_quote_secure` |
| Aprovado | `status='aprovado'` via `approve_partner_order` | |
| Faturamento | `fiscal_invoices` (`partner_order_id`, `debtor_partner_id`, `billing_scope`) | **0 registros** |
| Recebível | `accounts_receivable` (`origin_type='B2B_ORDER'`) + `accounts_receivable_installments` | 2 registros |

**Fluxos paralelos confirmados:** (a) solicitação do produtor × pedido do parceiro não se convertem entre si; (b) simulação do técnico × pedido do gestor são trilhas distintas ligadas apenas por `origin_simulation_id`; (c) "encaminhamento fiscal" e "emissão fiscal" são estágios distintos e o segundo não existe.

---

## 3. Modalidade por compra — resultado por cenário

`rpc_b2b_list_selectable_payment_plans()` (definição lida no staging) exige, para não-admin:

```sql
EXISTS (SELECT 1 FROM commercial_payment_plan_assignments a
        JOIN partner_users pu ON pu.partner_id = a.partner_id
        WHERE a.plan_id=p.id AND a.status='published' AND a.buyer_scope='partner'
          AND pu.user_id=v_uid AND a.valid_from<=CURRENT_DATE
          AND (a.valid_until IS NULL OR a.valid_until>=CURRENT_DATE))
```

Contagem no staging: `commercial_payment_plan_assignments = 0`.

Consulta por usuário parceiro real (réplica exata do predicado):

| user_id | parceiro | papel | planos elegíveis | preços de parceiro |
| --- | --- | --- | --- | --- |
| 79cdba52… | FSF AGROSERVICE | gestor | **0** | 5 |
| 7d894a7d… | FSF AGROSERVICE | gestor | **0** | 5 |
| 08832541… | FSF AGROSERVICE | tecnico | **0** | 5 |

Como `create_partner_order_secure` contém a barreira `payment_plan_required` (verificado por inspeção da definição), o checkout é **impossível** hoje para qualquer parceiro.

| Cenário | Resultado |
| --- | --- |
| A — à vista/antecipado (`cash_7d`) | **BLOQUEADO** — plano existe e está ativo, mas sem assignment publicado não é ofertado |
| B — prazo/parcelado (`short_30d`, `medium_60d`, `extended_90d`) | **BLOQUEADO** — idem |
| C — safra (`harvest_6m_approved`, `harvest_8m_*`) | **BLOQUEADO** — idem |
| D — quote_only | **BLOQUEADO** — os únicos planos `quote_only` no banco são resíduos de teste (`FE-QOT-*`) |

Independência entre compras: por **desenho** a modalidade é por pedido — persistida em `partner_orders.payment_plan_id` e congelada em `partner_order_payment_terms` (snapshots `plan_code_snapshot`, `pricing_mode_snapshot`, `discount_percent_snapshot`, `monthly_interest_percent_snapshot`). Não há coluna de plano fixo em `partner_accounts`. Porém a independência **NÃO PROVADA em runtime** (impossível executar A→B→C→D).

### 3.1 Poluição do catálogo de planos (defeito)

`commercial_payment_plans` contém 14 planos, dos quais **6 são resíduos do harness da Fase E**, todos `active=true` e sem `valid_until`:

`FE-FIX-1eed351a`, `FE-QOT-1eed351a`, `FE-DSC-1eed351a`, `FE-FIX-9394a6fb`, `FE-QOT-9394a6fb`, `FE-DSC-9394a6fb`.

Para `administrador`, `financeiro` e `gestor_comercial` a RPC ignora o gate de assignment — ou seja, **esses planos de teste são hoje selecionáveis por perfis internos**.

---

## 4. Produtos e microrganismos

| Requisito | Evidência | Resultado |
| --- | --- | --- |
| Ambos no mesmo fluxo | `partner_order_items.product_id` / `microrganismo_id`; `CatalogItemTipo = "produto" \| "microrganismo"` | ✅ desenho |
| XOR de item | `fn_b2b_resolve_base_unit_price`: `num_nonnulls(...) <> 1 → ITEM_INVALID` | ✅ |
| Unidade e volume | unidade em `hectare/litro/dose/unidade`; `unidade` exige `volume_ml>0` (`VOLUME_REQUIRED`) | ✅ |
| Quantidade mínima | `fn_resolve_b2b_cart` referencia `min_quantity`; `commercial_price_rules.min_quantity` existe | ✅ código / ⚠️ sem dado |
| Preço fixo × desconto sobre base | `pricing_mode` em planos e em `commercial_condition_item_prices` | ✅ desenho |
| Item sem preço | `ITEM_WITHOUT_PRICE`; catálogo devolve `preco_tabela = null` (nunca 0) — `usePartnerCatalog.ts:17-23` | ✅ |
| Snapshots de item | `produto_nome_snapshot`, `produto_codigo_snapshot`, `preco_tabela_snapshot`, `desconto_percentual_snapshot`, `preco_unitario_final_snapshot`, `pricing_mode_snapshot`, `price_source_snapshot`, `base_price_snapshot`, `condition_price_snapshot`, `plan_discount_percent_snapshot`, `unit_type_snapshot`, `volume_ml_snapshot`, `price_rule_id_snapshot` | ✅ estrutura completa |
| Carrinho misto / item inativo / sem ficha aprovada | — | **NÃO PROVADO** (0 itens de pedido no banco) |

Massa disponível: 7 produtos e 18 microrganismos, **todos com preço base de catálogo**; 5 preços específicos de parceiro em `partner_product_prices`. Portanto o bloqueio não é de preço de item — é de condição.

---

## 5. Paridade de valores

Não foi possível medir a cadeia completa: `partner_order_items = 0`, `partner_simulations = 0`, `fiscal_invoices = 0`.

O que existe (resíduo de harness, 2 pedidos sem itens):

| Pedido | Plano | Modo | Total pedido | table_amount | desconto | juros | final | AR | Parcelas |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| PB-001064 | FE-FIX-1eed351a | fixed_item_price | 1.234,50 | 1.234,50 | 0,00 | 0,00 | 1.234,50 | 1.234,50 | 2 |
| PB-001065 | FE-FIX-9394a6fb | fixed_item_price | 1.234,50 | 1.234,50 | 0,00 | 0,00 | 1.234,50 | 1.234,50 | 2 |

Paridade **pedido → payment_terms → recebível** confere nesses dois casos (total, parcelas e devedor `partner_id`). Paridade **catálogo → carrinho → simulação → nota** permanece **NÃO PROVADA**: não há itens, simulação nem nota associados.

---

## 6. Condições por compra — análise de regras

| Requisito | Situação |
| --- | --- |
| Somente assignments publicados e vigentes | ✅ implementado no gate da RPC — e é exatamente o que hoje bloqueia tudo |
| `fixed_item_price` | ✅ suportado (`commercial_condition_item_prices.condition_price`) — **0 registros** |
| `discount_from_base` com precedência | ✅ suportado (`discount_percent` de item > desconto do plano) — sem dado para provar |
| `quote_only` sem conclusão automática | ✅ `fn_b2b_order_billing_eligibility` devolve `QUOTE_ONLY_ITEMS` e barra faturamento; `create_partner_order_secure` trata `aguardando_cotacao` |
| Mudança de plano recalcula o carrinho | ✅ `NovoPedido.tsx:314-336` refaz a simulação a cada mudança de plano/itens e mantém referência à vista |
| Plano alterado/inativado entre simulação e confirmação | ✅ protegido por `p_expected_cart_hash` (`fn_b2b_cart_hash` inclui plano, linhas e total) → `price_changed` |
| Mudança de tabela após o pedido | ✅ snapshots imutáveis em `partner_order_items` e `partner_order_payment_terms` |
| Carência à vista / prazo / safra | **NÃO PROVADO** |
| Retomada de carrinho não herda condição | **NÃO PROVADO** — `/novo`, `/catalogo` e `/simulador` compartilham o mesmo componente e o mesmo estado `selectedPlanId`; risco real, não medido |

---

## 7. Matriz de perfis (autorização)

Fonte: `pg_policies` e `has_function_privilege` no staging.

| Perfil | partner_orders | partner_order_items | payment_terms | AR | planos selecionáveis |
| --- | --- | --- | --- | --- | --- |
| `anon` | sem grant | sem grant | sem grant | sem grant | RPC levanta `not_authorized` |
| `parceiro_b2b` (gestor) | SELECT do próprio (`partner_id = get_user_partner_id()`) | SELECT via pedido próprio | SELECT escopado | SELECT escopado (`ar_partner_select_own_b2b`) | via assignment |
| `parceiro_b2b_tecnico` | **não** consta nas policies de `partner_orders` → sem leitura | idem | idem | idem | RPC exclui o papel |
| `gestor_comercial` | leitura/escrita ampla | ampla | ampla | — | admin bypass |
| `financeiro` | SELECT (`Financeiro read partner_orders`) | — | — | acesso pleno | admin bypass |
| `administrador` | pleno | pleno | pleno | pleno | admin bypass |
| produtor vinculado | `ar_producer_read` escopado; `/portal/meus-pedidos` redirecionado para o dashboard | — | — | leitura escopada | não |

- Buyer/debtor derivados no servidor: `get_user_partner_id()` nas policies, `p_partner_id` validado dentro de `create_partner_order_secure` (`forbidden_partner`). ✅
- Parceiro A × parceiro B: isolado por `partner_id = get_user_partner_id()` em todas as policies de leitura. ✅ por leitura de policy; **NÃO PROVADO** em runtime com dois JWTs reais.
- `parceiro_b2b_tecnico` não pode concluir pedido: a definição de `create_partner_order_secure` referencia o papel; a string `forbidden_financial_terms` **não** aparece na definição atual, embora `useCreatePartnerOrder.ts:116` a trate. Divergência frontend × backend — **verificar**.

### 7.1 Achados de segurança

1. **`rpc_cc_simulate_price` tem EXECUTE para `PUBLIC` e `anon`.** Mitigado internamente por `IF NOT fn_cc_can_prepare(auth.uid()) THEN RAISE 'not_authorized'`, então não há vazamento — mas viola o padrão de revogação adotado nas demais funções da família. **Ressalva.**
2. **`anon` tem SELECT/INSERT em `partner_accounts`, `partner_simulations` e `partner_simulation_items`.** As policies exigem `has_role(auth.uid(), ...)`, o que nega o anônimo na prática; ainda assim é desvio de defesa em profundidade frente ao padrão do projeto. **Ressalva.**
3. **`partner_simulation_items_select`** usa `EXISTS (SELECT 1 FROM partner_simulations s WHERE s.id = simulation_id)` sem checagem de propriedade própria; depende inteiramente da RLS aninhada de `partner_simulations`. Correto hoje, frágil por construção. **Ressalva.**
4. Tabelas completas de preço não expostas: `commercial_payment_plans` sem SELECT para `authenticated` ✅; `commercial_price_rules`, `commercial_condition_item_prices` e `commercial_payment_plan_assignments` com SELECT apenas para políticas internas (`cpr_internal_select`, `ccip_admin_read`, `cppa_admin_read`) ✅.

---

## 8. Crédito

- `fn_b2b_credit_exposure(p_partner_id, p_new_order_amount, p_exclude_order_id)` — SECURITY DEFINER, sem EXECUTE para `authenticated` (chamada apenas internamente). ✅
- `create_partner_order_secure` implementa `credit_limit_exceeded` e `credit_blocked_overdue`. ✅ código.
- Dupla contagem, liberação em rejeição/cancelamento e reavaliação pós-cotação: **NÃO PROVADO** — exigiria criação de pedidos.

## 9. Matriz de estados

Enum `partner_order_status` (22 valores) cobre: `rascunho, pendente, solicitado, em_analise_comercial, aguardando_cotacao, aguardando_aprovacao_credito, aguardando_ajuste_comercial, aguardando_itens, aprovado, reprovado, reprovado_sem_itens, em_producao, produzido, aguardando_entrega, confirmado, em_separacao, enviado, entregue, faturado, cancelado`.

Barreira de faturamento (`fn_b2b_order_billing_eligibility`, definição integral lida):

| Condição | reason_code |
| --- | --- |
| cancelado / reprovado / reprovado_sem_itens | `ORDER_CANCELED_OR_REJECTED` |
| rascunho…aguardando_cotacao | `ORDER_NOT_APPROVED` |
| aprovação financeira pendente | `FINANCIAL_APPROVAL_PENDING` |
| aprovação financeira rejeitada | `FINANCIAL_APPROVAL_REJECTED` |
| algum item `quote_only` | `QUOTE_ONLY_ITEMS` |
| item com preço final ≤ 0 | `ITEM_WITHOUT_FINAL_PRICE` |
| sem `partner_order_payment_terms` | `PAYMENT_TERMS_NOT_DEFINED` |
| `final_amount ≤ 0` | `NO_FINAL_AMOUNT` |

Fail-closed adequado e verificado por leitura. Rejeição de ação incompatível **NÃO PROVADA** em runtime.

## 10. Fiscal

`fn_fiscal_requirement_resolve` (definição integral lida) tem três saídas: `EXEMPT` (exceção ativa com motivo e `approved_by`), `PENDING`/`NOT_REQUIRED` por política, e fallback **fail-closed** `required=true, status='PENDING_PARAMETRIZATION'`. Desenho correto. ✅

Estado real do staging:

- `fiscal_operation_policies` = **0**
- `fiscal_requirement_exemptions` = 0
- `fiscal_invoices` = **0**, `fiscal_invoice_items` = **0**
- Os dois recebíveis existentes gravaram `fiscal_invoice_required = true`, `fiscal_invoice_status = 'PENDING_PARAMETRIZATION'`, `fiscal_requirement_source = 'pending_parametrization'`, `fiscal_policy_id = NULL` — o fail-closed **funciona de verdade** e o defeito anterior de `false` hardcoded está corrigido.

### 10.1 Emissão fiscal real — situação exata

**Não existe pipeline de emissão real de NF-e/NFS-e.** Evidência direta no repositório:

- `supabase/functions/fiscal-preflight/index.ts`: "Nenhum caminho promove emissão"; `emissionEnabled: false`, `provider="NONE"`, `production=false`.
- `supabase/functions/fase-e-runtime-harness/index.ts`: o próprio harness marca `SKIP` para "emissão fiscal real (NF-e/NFS-e) para pedido B2B", com motivo "sem pipeline de emissão B2B e sem parametrização tributária real (regime/UF/CFOP/NCM/CST/CSOSN)".
- Nenhuma Edge Function de transmissão a SEFAZ/prefeitura entre as 31 existentes.

Portanto **"encaminhado ao fiscal" ≠ "nota emitida"**, e no estado atual nem sequer há encaminhamento efetivo: sem política fiscal cadastrada, todo pedido cai em `PENDING_PARAMETRIZATION`.

### 10.2 Lacunas de parametrização fiscal

1. Zero `fiscal_operation_policies` (canal/operação/UF).
2. Zero perfis fiscais efetivos exercitados (`product_fiscal_profiles`, `microorganism`/`service`, `customer_fiscal_profiles`) para o canal B2B.
3. CFOP/NCM/CST/CSOSN e regime tributário por UF não parametrizados.
4. Sem provedor de emissão configurado, sem ambiente de homologação ligado ao fluxo B2B.
5. `NOT_REQUIRED` só é alcançável por política explícita ou exceção com motivo/autoria — correto, mas nunca exercido.

## 11. Financeiro

- Recebível nasce uma vez: guarda procedural por `partner_orders.receivable_generated` dentro de `generate_b2b_receivable_secure_impl`. ⚠️
- **Não existe índice único para B2B**: o único índice de unicidade é `ux_ar_one_per_delivery ON accounts_receivable(origin_id) WHERE origin_type='DELIVERY' AND status<>'CANCELED'`. Não há equivalente para `origin_type='B2B_ORDER'`, e a função **não usa advisory lock** (verificado: `pg_advisory` ausente da definição). Sob concorrência real, duas chamadas simultâneas podem gerar dois recebíveis para o mesmo pedido. **Risco aberto.**
- Devedor: `partner_id` gravado corretamente nos dois recebíveis; `customer_id` nulo (compra do parceiro, não do produtor). ✅
- Parcelas: 2 parcelas coerentes com `installment_count` do snapshot em ambos os casos. ✅
- Faturamento parcial, juros/desconto preservados, cancelamento com auditoria: **NÃO PROVADO**.

## 12. Concorrência e idempotência

- `create_partner_order_secure` usa `pg_advisory` lock, `idempotency_key` e `cart_hash` (verificado na definição).
- `ux_partner_order_idempotency_key (partner_id, idempotency_key)` existe. ✅
- `partner_order_idempotency` tem **0 linhas** — nenhum tráfego atual.
- Duplo clique, chamadas simultâneas e dois carrinhos independentes: **NÃO PROVADO** nesta auditoria (exigiria escrita). Há evidência histórica de fases anteriores, mas ela não foi reexecutada aqui.
- Geração de recebível: **sem lock** (ver item 11).

## 13. UI/UX

- Condição é etapa obrigatória: `NovoPedido.tsx:423` bloqueia com "Selecione uma condição de pagamento antes de finalizar o pedido."; `:959` mostra "Selecione uma condição para continuar.". ✅
- Estados de erro mapeados por código no `useCreatePartnerOrder.ts:99-125` — cobre `credit_blocked_overdue`, `below_minimum_order_amount`, `QUOTE_REQUIRED`, `price_changed`, `cart_hash_required`, `idempotency_conflict`, `credit_limit_exceeded`, `PRICE_RULE_MISSING`, entre outros. ✅
- Técnico não vê valores: catálogo devolve preço `null` para `parceiro_b2b_tecnico` (documentado em `usePartnerCatalog.ts:17-23`); `scopeCan.financialStatus`/`discountDetails` negam ao escopo `parceiro_tecnico` (`viewerScope.ts`). ✅
- **Estado atual visível ao parceiro**: lista de condições vazia, sem mensagem específica de "nenhuma condição publicada para o seu parceiro". O usuário encontra um beco sem saída silencioso. **Defeito de UX.**
- Desktop/mobile e retomada de carrinho: **NÃO PROVADO** (não houve execução de navegador autenticado).

## 14. Testes

Existentes e relevantes: `src/test/motorCondicoesComerciaisB2B.test.ts`, `motorB2BRpcIntegration.test.ts`, `comercialSolicitacoesB2B.test.tsx`, `portalParceiroSolicitacoes.test.tsx`, `portalParceiroSimulador.contract.test.ts`, `portalB2BUsuariosClientes.contract.test.ts`, `b2bTecnicoCampo.permissions.test.ts`; E2E `e2e/reservar-estoque-b2b.spec.ts`, `e2e/rbac-admin-vs-nao-admin.spec.ts`; harness `supabase/functions/fase-e-runtime-harness`.

Ficam pendentes de **execução controlada com escrita** (fora deste escopo):

1. A→B→C→D sequenciais para o mesmo parceiro, com assignments publicados.
2. Carrinho misto produto + microrganismo com todas as unidades e `min_quantity`.
3. Paridade numérica catálogo→…→parcelas com valores não triviais (desconto + juros compostos).
4. Concorrência de checkout (mesma chave e chaves distintas) e de geração de recebível.
5. Isolamento parceiro A × B com dois JWTs reais (nunca `service_role`).
6. Faturamento parcial e bloqueio de dupla nota sobre a mesma quantidade.
7. Liberação de crédito em rejeição/cancelamento.

---

## 15. Bloqueios obrigatórios

| # | Bloqueio | Evidência | Severidade |
| --- | --- | --- | --- |
| B1 | Nenhum assignment publicado → nenhum parceiro tem condição elegível → checkout impossível | `commercial_payment_plan_assignments = 0`; consulta por usuário: 0 planos para os 3 usuários parceiros | 🔴 crítico |
| B2 | Emissão fiscal real inexistente | `fiscal_invoices = 0`; `fiscal-preflight` com `emissionEnabled:false`, `provider:"NONE"`; harness marca SKIP | 🔴 crítico |
| B3 | Nenhuma política fiscal cadastrada → todo recebível nasce `PENDING_PARAMETRIZATION` | `fiscal_operation_policies = 0` | 🔴 crítico |
| B4 | Recebível B2B sem índice único nem advisory lock | só `ux_ar_one_per_delivery`; `pg_advisory` ausente de `generate_b2b_receivable_secure_impl` | 🟠 alto |
| B5 | 6 planos de teste `FE-*` ativos e selecionáveis por perfis internos | `commercial_payment_plans` | 🟠 alto |
| B6 | Matriz de preços vazia (`commercial_price_rules`, `commercial_condition_item_prices` = 0) | contagens | 🟠 alto |
| B7 | Pedidos residuais do harness sem itens (`partner_order_items = 0` com 2 pedidos e 2 recebíveis) | contagens | 🟡 médio |
| B8 | `forbidden_financial_terms` tratado no frontend mas ausente do backend atual | definição de `create_partner_order_secure` | 🟡 médio |

## 16. Melhorias recomendadas

1. Publicar assignments por parceiro e popular a matriz de preços (pré-requisito de qualquer certificação).
2. Índice único parcial `accounts_receivable(origin_id) WHERE origin_type='B2B_ORDER' AND status<>'CANCELED'` e advisory lock por pedido na geração de recebível.
3. Higienizar planos `FE-*` (desativar/versionar, nunca deletar histórico).
4. Revogar EXECUTE de `PUBLIC`/`anon` em `rpc_cc_simulate_price`; revogar grants de `anon` em `partner_accounts` e `partner_simulations*`.
5. Reforçar `partner_simulation_items_select` com checagem explícita de `partner_id`/`created_by`.
6. UX: estado vazio explícito quando não houver condição publicada, com orientação de contato comercial.
7. Alinhar o contrato de erro do técnico (`forbidden_financial_terms`) entre RPC e frontend.
8. Separar catálogo, carrinho e simulador em estados isolados, ou provar por teste que a condição não sobrevive à troca de modo.
9. Definir e documentar o roadmap de emissão fiscal real (provedor, homologação, CFOP/NCM/CST/CSOSN por UF), mantendo o fail-closed.

## 17. Impacto e rollback

Esta auditoria é **somente leitura**: nenhum objeto foi criado, alterado ou removido; nenhuma migration, seed, deploy ou publicação ocorreu. **Impacto: nenhum. Rollback: não aplicável.** O único artefato produzido é este documento.

Para as correções recomendadas, o padrão de rollback continua o do projeto: migrations forward-only com precheck/postcheck e script `rollback-forward-safe.sql`, exclusivamente em staging até nova autorização.

---

## Conclusão

**🔴 NÃO APTO.** A arquitetura está sólida e as barreiras server-side (cart_hash, idempotência, fail-closed fiscal, snapshots, escopo por parceiro) estão corretamente desenhadas e verificadas por leitura. Mas a jornada real do parceiro está interrompida na escolha da condição de pagamento, a matriz de preços está vazia, e não existe emissão fiscal real — apenas encaminhamento, e nem esse é efetivo sem política fiscal cadastrada. Nenhuma das quatro modalidades pôde ser exercida.
