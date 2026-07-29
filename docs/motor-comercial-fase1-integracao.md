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

---

# Fase 1 — Correção consolidada final (staging `ikaauvsflpmamgxmkhoq`)

Produção `navfzbwgwzruipouyfnk` não foi acessada. Nada foi publicado ou deployado.
Nenhum pedido, item, snapshot, parcela, recebível, dado de produção, entrega,
fiscal, BI ou comunicação foi alterado.

## 1. Higiene da cadeia de migrations

Três migrations de fixture/teste (criavam `_motor_b2b_fase1_int_evidence` e
`_motor_b2b_fase1_quote_evidence`) foram retiradas de `supabase/migrations/`
para `restoration/motor-b2b-fase1-final/migrations-removidas/`. As tabelas de
evidência foram removidas do banco pela migration operacional consolidada, que
começa com guarda fail-fast de staging (`_fiscal_staging_marker`).

## 2. Produtor direto inerte até a Fase 5

- `rpc_resolve_commercial_prices`: qualquer escopo `customer`/`producer` ou
  `customer_id` informado → `PRODUCER_DIRECT_NOT_ENABLED`; `cliente_produtor`
  não passa da porta.
- `create_partner_order_secure`: produtor sem papel interno/parceiro →
  `PRODUCER_DIRECT_NOT_ENABLED`.
- `commercial_price_rules`: gatilho `trg_commercial_price_rules_producer_inert`
  recusa regra vigente de escopo produtor.
- RLS mantém a matriz invisível para técnico e produtor (asserts R7).

## 3. Hardening de crédito e dado financeiro

- `rpc_b2b_partner_credit` passou a exigir autenticação + papel
  (`administrador`/`financeiro`/`gestor_comercial`) ou vínculo real em
  `partner_users`; antes delegava sem qualquer checagem.
- `simulate_b2b_payment_plan_secure` não devolve mais bloco `credit` nem avisos
  de crédito para `parceiro_b2b_tecnico` (`financial_visible=false`).
- `anon` perdeu `EXECUTE` em todas as funções comerciais B2B.

## 4. Preço autoritativo no frontend

- A simulação devolve `cart_hash` (assinatura canônica de plano + linhas
  resolvidas + total, calculada no servidor).
- `create_partner_order_secure` recebe `p_expected_cart_hash`; divergência →
  `price_changed`, com registro em `partner_order_audit_logs`.
- `NovoPedido` bloqueia o envio sem `cart_hash` e envia sempre o hash da
  simulação; pedidos `quote_only` são gravados com totais zerados.

## 5. Cotação (`aguardando_cotacao`)

`respond_b2b_order_quote_secure` ganhou `pg_advisory_xact_lock` por pedido,
`FOR UPDATE` nos itens, recusa de linhas duplicadas (`quote_duplicate_line`),
validação de escala/limite de preço (`invalid_quote_price_scale`) e auditoria
com `dados_anteriores` (snapshot dos itens antes da resposta). Terms e
schedule são recalculados na mesma transação.

## 6. Evidência executada

Estruturais (V1–V8) e de papel/RLS (R1–R9) executados no staging:
higiene, ausência de `anon`, hash determinístico e parametrizado, produtor
inerte, crédito com papel/vínculo, cotação com lock e duplicidade, simulação
sem crédito para técnico. **17/17 asserts PASS.** Scripts versionados em
`restoration/motor-b2b-fase1-final/verify.sql` e
`supabase/tests/motor-b2b/fase1-final/01-papeis-rls-harness.sql`.

Regressão: typecheck OK, build OK (aviso pré-existente de bundle PWA),
Vitest **2587 passed / 2 failed** — as duas falhas são as regressões
pré-existentes já registradas (verificador SINIEF 49 e acompanhamento do
portal do produtor).

## 7. Rollback

`restoration/motor-b2b-fase1-final/` com `precheck.sql`, `verify.sql`,
`rollback.sql` e README. O rollback é forward-safe: remove a inércia do
produtor e recria a assinatura de 7 argumentos de `create_partner_order_secure`
sem tocar em dado operacional. Por decisão de segurança ele **não** reverte a
revogação de `anon` nem as checagens de crédito.

## 8. Status do gate — NÃO APTO (bloqueio técnico declarado)

Item 6 do escopo exige prova de concorrência com **duas sessões Postgres reais
e simultâneas** respondendo à mesma cotação/pedido. Este ambiente de execução
não oferece acesso `psql` nem duas conexões concorrentes controláveis — só há
um executor SQL transacional por chamada. A serialização foi implementada e
verificada estaticamente (`pg_advisory_xact_lock` em `create_partner_order_secure`
e em `respond_b2b_order_quote_secure`), mas **a prova empírica de concorrência
permanece UNVERIFIED**. Pelos critérios do próprio escopo, a Fase 1 não é
declarada APTO até que essa prova seja executada externamente com duas sessões
reais contra o staging.

Todos os demais itens (1–5, 7–10) estão implementados e evidenciados.
