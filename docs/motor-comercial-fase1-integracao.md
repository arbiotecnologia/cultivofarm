# Motor Comercial B2B — Fase 1: Integração Autoritativa

Ambiente de execução: **staging `ikaauvsflpmamgxmkhoq`**. Produção `navfzbwgwzruipouyfnk` não foi tocada.

## 1. Estrutura (migration de estrutura)

- `commercial_payment_plans.pricing_mode` (`discount_from_base` | `fixed_item_price` | `quote_only`),
  default `discount_from_base` — comportamento legado preservado.
- Novo status `aguardando_cotacao` em `partner_order_status`.
- Snapshots em `partner_order_items`: `pricing_mode_snapshot`, `price_source_snapshot`,
  `base_price_snapshot`, `price_rule_id`.
- Snapshots em `partner_order_payment_terms`: `pricing_mode_snapshot`, `credit_decision_snapshot`.
- RLS de `commercial_price_rules`: leitura/escrita para `administrador` e `gestor_comercial`,
  leitura para `financeiro`; `parceiro_b2b`, técnicos e produtores sem acesso direto à tabela.
- Guarda `tg_commercial_price_rules_plan_mode_guard`: impede regra com `pricing_mode`
  divergente do plano vinculado (`PRICE_RULE_MODE_CONFLICT`).

## 2. Motor autoritativo (migration de RPC)

- `fn_resolve_commercial_price` passa a respeitar o `pricing_mode` do plano:
  - `quote_only` → `QUOTE_REQUIRED`, sem preço;
  - `fixed_item_price` → exige regra ativa, senão `PRICE_RULE_MISSING` (sem fallback de catálogo);
  - `discount_from_base` → precedência P1→P4 legada com fallback de catálogo.
- `fn_resolve_b2b_cart` centraliza a precificação em lote e a agregação do carrinho.
- `simulate_b2b_payment_plan_secure`, `create_partner_order_secure` e
  `convert_partner_simulation_to_order_secure` consomem o mesmo resolvedor —
  **preço enviado pelo front deixou de ser autoritativo**.
- `create_partner_order_secure` persiste snapshot item a item e a decisão de crédito
  (`pg_advisory_xact_lock` na mesma transação).
- `convert_partner_simulation_to_order_secure` revalida o preço na conversão e exige
  `p_confirm_price_change` quando o total diverge ou a validade expirou.
- `approve_partner_order` e `generate_b2b_receivable_secure` bloqueiam pedidos em
  `aguardando_cotacao` ou sem preço definitivo (`fn_b2b_order_priceable`).
  O corpo original da geração de recebível foi preservado em
  `generate_b2b_receivable_secure_impl` (mesma lógica, sem alteração de regra financeira).

## 3. Evidência de runtime

Harness: `supabase/tests/motor-b2b/fase1-integracao/01-integracao-harness.sql`.
Fixtures em subtransação sempre revertida; nenhum dado operacional criado ou alterado.

| Teste | Verificação | Resultado |
|-------|-------------|-----------|
| T1 | plano `quote_only` não precifica (`QUOTE_REQUIRED`, sem preço) | PASS |
| T2 | `fixed_item_price` sem regra → `PRICE_RULE_MISSING` (não cai no catálogo) | PASS |
| T3 | `fixed_item_price` com regra → preço da regra (`condition_fixed_price`) | PASS |
| T4 | `discount_from_base` preserva a precedência legada (catálogo + desconto) | PASS |
| T5 | `fn_resolve_b2b_cart` agrega corretamente (2 × 123,45 = 246,90) | PASS |
| T6 | carrinho em `quote_only` sinaliza `quote_required` | PASS |
| T7 | regra com modo divergente do plano é bloqueada | PASS |
| T8 | `generate_b2b_receivable_secure_impl` presente | PASS |
| T9 | `anon` sem SELECT em `commercial_price_rules` | PASS |

**9/9 PASS.** Typecheck OK, build OK, testes de integração RPC 4/4 PASS.

## 4. Frontend

- `useSimulateB2BPaymentPlan` expõe `pricing_mode`, `quote_required` e as linhas resolvidas.
- `NovoPedido` usa os totais retornados pelo servidor no diálogo de confirmação e trata
  pedidos sob consulta (aviso dedicado + botão "Enviar solicitação de cotação").
- `PaymentSimulationSummary` oculta valores quando o plano é sob consulta.
- `useCreatePartnerOrder` traduz `PRICE_RULE_MISSING`, `QUOTE_REQUIRED` e mudança de preço.
- `ParceiroPrecosTab` passa a explicitar que é a prioridade 2 do motor.

## 5. Pendências assumidas

- CRUD da matriz canônica (`commercial_price_rules`) e edição do `pricing_mode` por plano
  ainda não têm tela dedicada — hoje são mantidos por SQL pela equipe comercial.
- Fluxo de resposta à cotação (`aguardando_cotacao` → preço definido) não tem UI própria.
