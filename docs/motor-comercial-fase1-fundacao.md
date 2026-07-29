# Fase 1 — Fundação Canônica do Motor Unificado de Preços + Correção da Exposição de Crédito

Data: 2026-07-29 · Ambiente: **staging `ikaauvsflpmamgxmkhoq`** · Produção `navfzbwgwzruipouyfnk` **não acessada, não alterada, não deployada**

Escopo: fundação. **Nenhum fluxo de checkout foi trocado nesta fase** — `create_partner_order_secure` e
`simulate_b2b_payment_plan_secure` permanecem byte a byte iguais ao snapshot da Fase 0.1. A adoção do
motor pelo checkout é da Fase 2.

---

## 1. Ambiente e travas

Migration, harness, rollback e verify abortam se `public._fiscal_staging_marker` não retornar
`ikaauvsflpmamgxmkhoq`, com recusa explícita do ref de produção. Nenhum DSN, token, senha ou secret
foi lido, exibido ou registrado.

Migration canônica: `supabase/migrations/20260729021225_motor_b2b_fase1_fundacao_precos_credito.sql`.

---

## 2. Matriz comercial canônica — `public.commercial_price_rules`

Chave lógica: **comprador + condição + item + unidade + volume + vigência**.

| Coluna | Papel |
| --- | --- |
| `buyer_scope` | `partner` (parceiro B2B) ou `producer` (produtor direto) |
| `partner_id` / `customer_id` | identidade do comprador — exatamente um preenchido |
| `plan_id` | condição comercial (`commercial_payment_plans`); obrigatório em `fixed_item_price` |
| `product_id` / `microrganismo_id` | item — exatamente um preenchido (`num_nonnulls = 1`) |
| `unit_type` | `hectare`, `litro`, `dose`, `unidade` |
| `volume_ml` | obrigatório e > 0 em `unidade`; proibido nas demais |
| `pricing_mode` | `fixed_item_price`, `discount_from_base`, `quote_only` |
| `condition_price` | obrigatório e > 0 **apenas** em `fixed_item_price`; NULL nos demais |
| `valid_from` / `valid_until` | vigência; `valid_until >= valid_from` |
| `active` | ativação (não há hard delete no fluxo normal) |
| `motivo`, `created_by`, `updated_by`, `created_at`, `updated_at` | rastreabilidade |

**Integridade estrutural (constraints, não convenção):**

- `cpr_buyer_identity_chk` — comprador nunca ambíguo (parceiro **xor** produtor);
- `cpr_item_xor_chk` — produto **xor** microrganismo;
- `cpr_volume_chk` — volume coerente com a unidade;
- `cpr_condition_price_chk` — preço fixo sem valor é impossível; preço em modo não-fixo é impossível;
- `cpr_plan_required_chk` — preço fixo exige condição;
- `cpr_validity_chk` — vigência coerente;
- `cpr_no_overlap` — `EXCLUDE USING gist` (com `btree_gist`) impedindo **duas regras ativas
  sobrepostas** para a mesma chave lógica. Chaves nulas são normalizadas com `COALESCE` para o UUID
  nulo, de modo que a exclusão realmente vale (nulos não escapam da checagem).

Índices parciais de leitura: `idx_cpr_partner_lookup`, `idx_cpr_producer_lookup`.

**RLS e grants**

| Papel | Acesso |
| --- | --- |
| `administrador`, `financeiro`, `gestor_comercial` | leitura e escrita (`cpr_staff_all`) |
| `parceiro_b2b` (gestor) | leitura apenas das regras do próprio parceiro, via `partner_users` |
| `cliente_produtor` | leitura apenas das próprias regras, via `get_cliente_ids_for_user` |
| `parceiro_b2b_tecnico` | **sem acesso** (nenhuma policy o contempla) |
| `anon` / `PUBLIC` | **REVOKE ALL** — nenhum privilégio |

**Auditoria**: `trg_commercial_price_rules_audit` grava em `commercial_audit_log`
(`price_rule_insert` / `price_rule_update` / `price_rule_delete`) com `usuario_id`, `partner_id`,
antes e depois completos. `trg_commercial_price_rules_touch` preenche `created_by`/`updated_by`/`updated_at`.

---

## 3. Resolução canônica de preço

`public.fn_resolve_commercial_price(buyer_scope, partner_id, customer_id, plan_id, product_id,
microrganismo_id, unit_type, volume_ml, ref_date)` — `STABLE`, `SECURITY INVOKER`, `search_path=public`.

Implementa exatamente a precedência de `docs/commercial-pricing-precedence.md`:

1. **`condition_fixed_price`** — regra ativa e vigente com `pricing_mode = fixed_item_price`:
   valor final = `condition_price`, **desconto do plano não é aplicado** (`plan_discount_percent = 0`);
2. **`partner_base_price`** — `partner_product_prices.preco_tabela` ativo e vigente, com desconto do plano;
3. **`catalog_base_price`** — preço canônico de `produtos`/`microrganismos` por unidade, com desconto do plano;
4. **`quote_only`** — `reason_code = QUOTE_REQUIRED`, `quote_required = true`, **sem preço**.

Regras invioláveis honradas: nunca preço fixo **e** desconto juntos; nunca desconto de parceiro
acumulado com desconto de plano; `partner_product_prices.preco_final` e `desconto_percentual` **não
participam do cálculo** (permanecem como campos legados de transição, sem remoção); nunca fallback
para zero — sem preço resolvido a função devolve `ITEM_WITHOUT_PRICE` (ou `QUOTE_REQUIRED`).

Retorno (jsonb): `ok`, `reason_code`, `quote_required`, `pricing_mode`, `price_source`, `base_price`,
`plan_discount_percent`, `unit_price`, `final_unit_price`, `currency`, `rule_id`, `plan_id`,
`valid_from`, `valid_until`, `resolved_at`.

`reason_code` possíveis: `OK`, `QUOTE_REQUIRED`, `ITEM_WITHOUT_PRICE`, `PLAN_REQUIRED`,
`PLAN_NOT_FOUND`, `PLAN_INACTIVE`, `ITEM_INVALID`, `UNIT_INVALID`, `VOLUME_REQUIRED`.

**Aritmética**: tudo em `numeric`. Um único arredondamento monetário, no preço unitário final
(`round(base * (1 - desconto/100), 2)`). Nenhum `float`, nenhum arredondamento intermediário.

**Lote**: `public.rpc_resolve_commercial_prices(p_items jsonb, p_plan_id uuid, p_ref_date date,
p_buyer jsonb)` — `SECURITY DEFINER`, resolve N itens numa chamada (sem N+1) e **deriva a identidade
do comprador no servidor**: parceiro via `partner_users`, produtor via `get_cliente_ids_for_user`;
apenas staff (admin/financeiro/gestor comercial) pode informar `p_buyer` explicitamente. Vínculo
ambíguo (multi-parceiro / multi-cliente) é recusado em vez de adivinhado. `anon` e `PUBLIC` sem
`EXECUTE`.

---

## 4. Correção da exposição de crédito

**Falha corrigida**: `rpc_b2b_partner_credit` considerava apenas parcelas de recebíveis em aberto.
Pedidos já aprovados e ainda **não faturados** não entravam na conta — o parceiro conseguia
ultrapassar o limite acumulando pedidos aprovados sem recebível gerado.

`public.fn_b2b_credit_exposure(partner_id, novo_valor, excluir_pedido)`:

```
exposicao_atual      = recebiveis_em_aberto + comprometido_nao_faturado
exposicao_projetada  = exposicao_atual + novo_pedido
credito_disponivel   = max(credit_limit - exposicao_projetada, 0)
```

- **recebíveis em aberto**: `accounts_receivable_installments` (`OPEN`/`PARTIAL`/`OVERDUE`) de
  recebíveis não cancelados do parceiro, por `original_amount - received_amount`;
- **comprometido não faturado**: `partner_orders` em `aprovado`, `em_producao`, `produzido`,
  `aguardando_entrega`, `confirmado`, `em_separacao`, `enviado`, `entregue`, com
  `receivable_generated = false` **e** sem `partner_order_financial_links` — dupla trava contra
  **dupla contagem** com o bloco anterior. Cancelados e reprovados ficam fora;
- **valor considerado**: `final_amount_with_interest` com fallback para `total` — o compromisso real,
  com juros, não o subtotal;
- `p_exclude_order_id` evita que o próprio pedido em avaliação seja contado duas vezes.

`reason_code`: `OK`, `OVERDUE_BLOCK`, `NO_LIMIT_DEFINED`, `LIMIT_EXCEEDED_APPROVAL`,
`LIMIT_EXCEEDED_BLOCK`.

**Exposição segura**: `fn_b2b_credit_exposure` é interna (`EXECUTE` só para `service_role`).
`rpc_b2b_credit_exposure` é a porta autenticada: admin/financeiro/gestor comercial veem qualquer
parceiro; `parceiro_b2b` só o próprio (via `partner_users`); demais papéis recebem `forbidden`;
`anon` e `PUBLIC` sem `EXECUTE`.

**Compatibilidade**: `rpc_b2b_partner_credit(uuid)` mantém assinatura e retorno jsonb, agora como
**superset** — chaves antigas preservadas, chaves novas (`comprometido_nao_faturado`,
`exposicao_atual`, `exposicao_projetada`, `credito_disponivel`, `reason_code`) adicionadas. Nenhuma
tela existente quebra.

**Concorrência**: `tg_partner_orders_credit_guard` passou a executar
`pg_advisory_xact_lock('b2b_credit:' || partner_id)` **na mesma transação** do pedido antes de
avaliar, serializando pedidos concorrentes do mesmo parceiro. A avaliação usa
`final_amount_with_interest` (fallback `total`) e reavalia também quando o total muda em
`em_analise_comercial`, `aprovado` ou `aguardando_aprovacao_credito` — de modo que o padrão
"insere com total 0, depois grava itens e total" **não escapa** da guarda: a checagem definitiva
ocorre com o valor final, no momento em que o pedido entra em análise/aprovação. Os atalhos
legítimos de aprovação humana (`credit_approved_by`) foram preservados byte a byte.

---

## 5. Evidência runtime (23/23 PASS)

Harness: `supabase/tests/motor-b2b/fase1/01-pricing-credit-harness.sql`. Fixtures vivem em
subtransação com rollback garantido; as evidências são acumuladas em variável de memória (não
transacional) e por isso sobrevivem ao rollback. Execução real em staging:

| Caso | Descrição | Esperado | Obtido | Status |
| --- | --- | --- | --- | ---: |
| P3.1 | Catálogo, hectare, com desconto do plano | `30.00 / catalog_base_price` | idem | PASS |
| P3.2 | Catálogo, litro | `100.00` | `100.00` | PASS |
| P3.3 | Catálogo, unidade 500 ml | `50.00` | `50.00` | PASS |
| P2.1 | Preço-base do parceiro vence o catálogo | `72.00 / partner_base_price` | idem | PASS |
| P2.2 | `preco_final` legado (108,00) nunca é usado | `<> 108.00` | `72.00` | PASS |
| P1.1 | Preço fixo vence tudo e **não** recebe desconto | `82.00 / condition_fixed_price / 0` | idem | PASS |
| P1.2 | Regra vencida não se aplica | `partner_base_price` | idem | PASS |
| P1.3 | Regra inativa não se aplica | `partner_base_price` | idem | PASS |
| P4.1 | `quote_only` sem preço | `QUOTE_REQUIRED / true / null` | idem | PASS |
| C1 | Sobreposição de regras ativas bloqueada | `exclusion_violation` | idem | PASS |
| C2 | `fixed_item_price` exige `condition_price` | `check_violation` | idem | PASS |
| C3 | Comprador ambíguo bloqueado | `check_violation` | idem | PASS |
| C4 | Produto **xor** microrganismo | `check_violation` | idem | PASS |
| C5 | `unidade` exige `volume_ml` | `check_violation` | idem | PASS |
| A1 | Auditoria de regra registrada | `>= 1` | `4` | PASS |
| K1 | `exposicao_projetada = aberto + comprometido + novo` | `1000.00` | `1000.00` | PASS |
| K2 | `exposicao_atual = aberto + comprometido` (sem dupla contagem) | `0.00` | `0.00` | PASS |
| K3 | Chaves novas de exposição presentes | `true` | `true` | PASS |
| K4 | `rpc_b2b_partner_credit` mantém assinatura e devolve superset | `true` | `true` | PASS |
| S1 | `anon` sem privilégio na matriz | `false` | `false` | PASS |
| S2 | `anon` sem `EXECUTE` nas RPCs novas | `false` | `false` | PASS |
| S3 | `authenticated` sem `EXECUTE` na função interna de crédito | `false` | `false` | PASS |
| S4 | Só as 2 funções de crédito divergem do snapshot da Fase 0.1 | `2` | `2` | PASS |

**Limpeza confirmada pós-execução**: `commercial_price_rules` = 0 linhas,
`commercial_audit_log` com `price_rule_%` = 0, fixture de `partner_product_prices` = 0,
tabela técnica de evidência removida. Nenhum dado operacional criado, alterado ou removido.

---

## 6. Rollback e verificação

- `restoration/motor-b2b-fase1/restore-fase1.sql` — atômico: derruba as 4 funções novas, os 2
  triggers e a tabela `commercial_price_rules` (objeto novo, sem dado operacional) e **restaura
  byte a byte** `rpc_b2b_partner_credit` e `tg_partner_orders_credit_guard` a partir de
  `public._motor_b2b_pre_phase1_snapshot`, com assert de checksum MD5 função a função. Nunca toca
  pedidos, itens, snapshots, parcelas ou recebíveis.
- `restoration/motor-b2b-fase1/verify-fase1.sql` — 12 asserts read-only do estado endurecido
  (tabela, RLS, 3 policies, ausência de `anon`, `cpr_no_overlap`, 6 checks, 2 índices, 4 funções,
  ACLs das RPCs, função interna restrita, guarda com advisory lock, divergência do snapshot = 2).

---

## 7. Correções residuais da Fase 0.2 aplicadas nesta execução

- Os harnesses `supabase/tests/motor-b2b/fase0-2/01-rls-rpc-harness.sql` e `02-rollback-cycle.sql`
  não criam mais a tabela `public._motor_b2b_fase0_2_evidence`: passaram a usar **tabela TEMP**, com
  `DROP` defensivo ao final. Não deixam mais artefato no schema `public`.
- `docs/motor-b2b-fase0-2-hardening-rls.md` §9 deixou de afirmar "suíte completa verde": registra
  agora **2587 aprovados e 2 falhas preexistentes** em `verify-fiscal-types-sinief49`, anteriores e
  alheias ao hardening.

---

## 8. Pendências e riscos residuais

1. **Checkout ainda não usa o motor.** `create_partner_order_secure` e
   `simulate_b2b_payment_plan_secure` continuam lendo `partner_product_prices.preco_tabela`
   diretamente. Enquanto a Fase 2 não os migrar para `fn_resolve_commercial_price`, as Prioridades 1
   e 4 **não afetam pedidos reais** — a matriz existe, é auditada e é consultável, mas não é
   autoritativa no fluxo de compra.
2. **`price_source` ainda não é persistido** em `partner_order_items`. A gravação do snapshot de
   origem do preço no item é da Fase 2.
3. **K1/K2 com base zerada.** O staging não possui pedidos B2B nem recebíveis de parceiro no momento
   da execução, então a igualdade da fórmula foi provada estruturalmente contra o cálculo
   independente (ambos 0 + novo pedido). Um cenário com pedido aprovado real deve ser exercitado na
   homologação da Fase 2.
4. **Multi-parceiro / multi-cliente** é recusado explicitamente pela RPC de lote em vez de
   arbitrado; suporte real depende da evolução de `get_user_partner_id()`, já registrada como dívida
   na Fase 0.2.
5. **Produção não aplicada** — todo o conteúdo desta fase vive apenas em staging.
6. Índices duplicados `idx_partner_users_user` / `idx_partner_users_user_id` seguem pendentes
   (herança da Fase 0.2).

---

## 9. Validações de código

- `tsgo` typecheck: sem erros.
- Vitest: **2587 aprovados, 2 falhas preexistentes** em `src/test/fiscal/sinief49/staging/verifier.test.ts`
  (`verify-fiscal-types-sinief49`), anteriores a esta fase e sem relação com o motor comercial.
- Lint: indisponível no projeto.

---

## 10. Status

**FUNDAÇÃO APLICADA E PROVADA EM STAGING — APTA PARA A FASE 2.**
23/23 casos runtime PASS, rollback fiel com assert de checksum, `anon` sem qualquer privilégio,
nenhuma alteração no fluxo de checkout, produção intocada.
