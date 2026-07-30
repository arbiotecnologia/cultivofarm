
## 11. Prova de runtime E2E com identidades efêmeras (staging ikaauvsflpmamgxmkhoq)

Guarda de ambiente validada em todos os blocos (`_fiscal_staging_marker = ikaauvsflpmamgxmkhoq`).
Identidades efêmeras `f7probe-*@arbio-staging.invalid` criadas e **removidas ao final** (0 resíduos).

### 11.1 Segregação por papel (autenticado, via PostgREST)

| ID | Prova | Resultado |
|----|-------|-----------|
| L0 | Login dos 5 papéis (financeiro, gestor_comercial, parceiro_b2b, parceiro_b2b_tecnico, cliente_produtor) | OK |
| K1 | `rpc_b2b_partner_credit` do próprio parceiro (gestor) | 200 |
| K2 | Crédito de outro parceiro | 400 `forbidden` |
| K3 | Crédito para técnico do parceiro | 400 `forbidden` |
| K4 | Crédito para produtor | 400 `forbidden` |
| R5 | `SELECT` direto em `commercial_payment_plans` (gestor parceiro) | 403 `42501` |
| R9 | Helper interno `fn_b2b_plan_selectable` (técnico) | 403 `42501` |
| R10 | `rpc_admin_list_commercial_plans` (gestor_comercial) | 200 |
| R11 | `rpc_admin_list_commercial_plans` (parceiro) | 400 `not_authorized` |
| R1/R8 | Técnico e produtor lendo `partner_orders` / parcelas B2B | 0 linhas |

### 11.2 Guardas do motor de preços

- `PRICE_RULE_MODE_CONFLICT`: regra `fixed_item_price` recusada em plano `discount_from_base` (trigger `tg_commercial_price_rules_plan_mode_guard`).
- `enforce_cliente_id_for_produtor`: papel `cliente_produtor` sem vínculo de cliente é recusado na atribuição de role.

### 11.3 E2E de pedido (regra de preço temporária F7PROBE, removida ao final)

| ID | Prova | Resultado |
|----|-------|-----------|
| E1 | Simulação `cash_7d`, 2 L: tabela 500 → desconto 200 → final 300, `cart_hash` presente | 200 |
| E2 | `create_partner_order_secure` com hash forjado | 400 `price_changed` |
| E3 | Pedido criado com hash autoritativo (`PB-001017`, total 300) | 200 |
| E4 | Replay com a mesma `idempotency_key` devolve o mesmo pedido | 200, idêntico |
| E5 | Duas chamadas concorrentes com chaves distintas geram 2 pedidos distintos | 200/200 |
| E6 | Técnico tentando criar pedido | 400 `partner_tech_cannot_create_order` |
| E7 | `gestor_comercial` enxerga os pedidos | 200 |
| E8 | Técnico não enxerga pedidos | 0 linhas |

### 11.4 Achado material (não bloqueante do motor)

`public.commercial_price_rules` estava **vazia** no staging: os 16 itens do catálogo do parceiro retornavam `unidade_preco_principal = "sob_consulta"` mesmo com preços-base preenchidos em `produtos`. O motor está correto — falta a carga da matriz comercial. Sem ela, nenhum pedido é precificável em staging.

### 11.5 Limpeza

`partner_orders = 0`, `commercial_price_rules = 0`, `partner_order_idempotency = 0`, usuários `f7probe-%` = 0, tabela auxiliar `_f7_probe_ctx` removida.

**Status final: APTO PARA PROMOÇÃO CONTROLADA** — provas de runtime concluídas; pendência operacional: carga da matriz de preços comerciais.
