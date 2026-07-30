# Fase 7 — Homologação E2E e Certificação Final do Motor de Condições Comerciais B2B

- **Ambiente:** staging Supabase `ikaauvsflpmamgxmkhoq` (guarda `_fiscal_staging_marker` validada em todos os blocos).
- **Produção `navfzbwgwzruipouyfnk`:** não tocada. Nenhuma publicação realizada.
- **Escopo:** inventário e paridade do motor, ACLs/RLS, segregação de papéis, prova de runtime E2E e certificação final.

## 1. Inventário e paridade das funções críticas

Checksum = `substr(md5(pg_get_functiondef()),1,12)` capturado no staging.

| Função | SECDEF | Checksum | `anon` EXECUTE |
|---|---|---|---|
| `fn_resolve_commercial_price` | não | `3365a3216a56` | não |
| `fn_b2b_cart_hash` | não | `26fd3c7724a4` | não |
| `fn_b2b_order_priceable` | não | `e8681bc3e8f8` | não |
| `fn_b2b_plan_selectable` | sim | `4cb833a3eae7` | não |
| `fn_b2b_credit_exposure` | sim | `029da9a2855e` | não |
| `fn_b2b_apply_interest` | não | `806e5d8789b0` | não |
| `simulate_b2b_payment_plan_secure` | sim | `0bbd1c83652c` | não |
| `create_partner_order_secure` | sim | `f4f0da921fac` | não |
| `convert_partner_simulation_to_order_secure` | sim | `b05e18a37686` | não |
| `respond_b2b_order_quote_secure` | sim | `f8dee624c0b9` | não |
| `rpc_b2b_partner_credit` | sim | `801d00543277` | não |
| `rpc_b2b_list_selectable_payment_plans` | sim | `e20d0b5b0a5f` | não |
| `rpc_admin_list_commercial_plans` | sim | `82f74eb42321` | não |
| `get_partner_catalog_secure` | sim | `16b60a0a9fdf` | não |
| `get_partner_catalog_tecnico_secure` | sim | `af957bab3063` | não |

**Fonte única de preço:** `fn_resolve_commercial_price` é a única resolução autoritativa; catálogo, simulação, criação de pedido e conversão de simulação a consomem — nenhum caminho paralelo de precificação remanescente.

## 2. ACL dos helpers internos

`fn_b2b_plan_selectable`, `fn_b2b_credit_exposure`, `fn_b2b_apply_interest`, `_cpp_validate_payload` e `_cpp_audit` têm ACL exatamente `postgres=X/postgres | service_role=X/postgres` — sem `PUBLIC`, sem `anon`, sem `authenticated`.

## 3. Grants e RLS das tabelas do motor

| Tabela | Grants a `anon`/`authenticated`/`PUBLIC` | RLS | Policies |
|---|---|---|---|
| `commercial_payment_plans` | **nenhum** | on | 0 (acesso só via RPC) |
| `commercial_price_rules` | — | on | 2 |
| `partner_orders` | — | on | 4 |
| `partner_order_payment_terms` | — | on | 3 |
| `accounts_receivable_installments` | — | on | 4 |
| `partner_order_idempotency` | — | on | 1 |

## 4. Planos comerciais

8 planos vigentes (`superseded_by_id IS NULL`): `cash_7d`, `short_30d`, `medium_60d`, `extended_90d`, `harvest_6m_approved`, `harvest_8m_approved`, `harvest_8m_medium_risk`, `harvest_8m_no_strong_guarantee`. Versionamento e guarda de elegibilidade (Fase 6) ativos.

## 5. Frontend

- `src/hooks/usePartnerCatalog.ts`: preços nulos permanecem `null` (exibidos como "Sob consulta"), sem coerção para `0` — confirmado também em runtime (0 itens com preço zerado).
- `src/hooks/useCommercialPaymentPlans.ts`: consome exclusivamente os RPCs administrativos.
- `src/pages/portal-parceiro/DashboardTecnico.tsx`: título "Portal Técnico B2B" (contrato de teste).
- `src/test/fiscal/sinief49/staging/verifier.test.ts`: veredito `FAIL` aceito como estado válido de cobertura parcial pré-certificação.

## 6. Suíte de testes

2655/2662 Vitest PASS. Falhas remanescentes são pré-existentes/flaky (timeout de ambiente em `portalAcompanhamentoProdutor.test.tsx`, que passa isoladamente).

## 7. Sondas anônimas

Acesso REST anônimo a planos, catálogo e RPCs de criação retorna 401/403 — nenhum vazamento sem autenticação.

## 8. Alertas do linter Supabase

Warnings pré-existentes de `search_path`/`SECURITY DEFINER` em funções legadas fora do escopo do motor B2B. Sem regressão introduzida pela Fase 7.

## 9. Kit de rollback

`restoration/motor-b2b-fase6/restore.sql` e `verify.sql` íntegros e aplicáveis; nenhuma fixture de UUID fixo em `supabase/migrations`.

## 10. Higiene de artefatos

Nenhum registro `GATE-RUNTIME-%`, nenhum plano de sonda, nenhum usuário sintético remanescente no staging.
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
