# FASE H4 — Auditoria e correção do fluxo Comercial/B2B

- Ambiente auditado/corrigido: **staging `ikaauvsflpmamgxmkhoq`** (via `STAGING_DSN`, read/write autorizado nesta fase)
- Produção `navfzbwgwzruipouyfnk`: **intocada** (nenhum comando executado)
- Baseline de conexão do repositório: `c75bb87f` (`.env`, `client.ts`, `types.ts` restaurados e validados)
- Kit aplicado: `restoration/homologacao-h4/30-h4-credito-e-imutabilidade.sql`
- Postcheck: `restoration/homologacao-h4/32-h4-postcheck.sql` — **8/8 PASS** (transacional, ROLLBACK)
- Vitest: **3105 passed / 4 skipped / 0 fail**

## 1. Escopo inventariado

26 tabelas comerciais e 10 objetos-núcleo: `partner_accounts`, `partner_users`,
`partner_simulations(_items)`, `partner_orders(_items, _payment_terms, _idempotency,
_audit_logs, _financial_links)`, `partner_product_prices`, `commercial_price_rules`,
`commercial_payment_plans`, `partner_financial_settings`.

RPCs núcleo auditadas: `fn_resolve_b2b_cart`, `fn_b2b_resolve_base_unit_price`,
`fn_resolve_commercial_price`, `fn_b2b_cart_hash`, `fn_b2b_apply_interest`,
`fn_b2b_credit_exposure`, `fn_b2b_plan_selectable`, `fn_b2b_order_priceable`,
`create_partner_order_secure`, `convert_partner_simulation_to_order_secure`,
`approve_b2b_credit`, `approve_partner_order`, `reject_partner_order`,
`update_partner_order_status`, `approve_b2b_payment_terms_secure`,
`generate_b2b_receivable_secure_impl`.

## 2. Pontos confirmados como conformes (evidência direta no staging)

- **Preço canônico (herdado de H3c)**: precedência `partner_product_prices` →
  `catalogo_volumes` → legado, com `price_source_snapshot` gravado por item.
- **Idempotência**: `ux_partner_order_idempotency_key (partner_id, idempotency_key)`,
  advisory lock `b2b_idem` e fingerprint `reqfp_v2` — reenvio não duplica pedido;
  payload divergente sob mesma chave é rejeitado.
- **Conversão de simulação**: chave `sim:<id>` + guarda de status impedem dupla conversão.
- **Cotação (`quote_only`)**: `approve_partner_order` bloqueia `aguardando_cotacao` e
  `fn_b2b_order_priceable` exige total > 0, termos com `final_amount > 0` e ausência de
  item `quote_only` — impossível aprovar/faturar cotação sem preço.
- **Alçada financeira**: `parceiro_b2b_tecnico` sem alçada recebe
  `forbidden_financial_terms` antes de qualquer resolução de preço; produtor direto
  bloqueado por `PRODUCER_DIRECT_NOT_ENABLED`.
- **RLS multi-tenant**: `partner_orders`, `partner_order_items`, `partner_simulations(_items)`,
  `partner_product_prices` e `partner_order_idempotency` escopados por
  `get_user_partner_id()`; técnico limitado às próprias simulações; produtor sem acesso.
- **Estados terminais**: `update_partner_order_status` bloqueia retorno de
  `reprovado/cancelado/reprovado_sem_itens` e exige pedido aprovado para etapas operacionais.

## 3. Achados corrigidos nesta fase

### H4-001 (P1) — Limite de crédito burlável por pedidos pendentes
`fn_b2b_credit_exposure` computava como comprometido apenas pedidos em
`aprovado`…`entregue`. Pedidos vivos em `pendente/solicitado/em_analise_comercial/
aguardando_aprovacao_credito/aguardando_ajuste_comercial/aguardando_itens` não
consumiam limite: N pedidos criados em sequência (ou concorrentemente) passavam
individualmente no teste e estouravam o limite ao serem aprovados — e a aprovação
comercial não reavaliava crédito.

**Correção:** novo bucket `comprometido_pendente` somado a `exposicao_atual` e
`exposicao_projetada` (respeitando `p_exclude_order_id` e a exclusão de pedidos já com
recebível/vínculo financeiro, sem dupla contagem); `approve_partner_order` passou a
reavaliar o crédito sob `pg_advisory_xact_lock('b2b_credit:<partner>')`, bloqueando com
`credit_block_on_approval: LIMIT_EXCEEDED_BLOCK|OVERDUE_BLOCK` quando não houver
aprovação de crédito prévia (`credit_approved_at`), registrando `credit_block_reason` e
o `credit_reason_code` no log de auditoria.

### H4-002 (P2→corrigido) — Edição material de itens após aprovação
`partner_order_items` permitia INSERT/UPDATE/DELETE por `administrador`/`gestor_comercial`
em qualquer status, permitindo alterar quantidade/preço de pedido já aprovado sem
retornar ao fluxo comercial. Criado o gatilho `trg_b2b_order_items_immutable`
(`fn_b2b_guard_order_items_immutable`), que rejeita mutação de itens quando
`fn_b2b_status_is_approved_or_later(status)` — erro `order_items_immutable_after_approval`.
Nenhum RPC ou tela grava itens após aprovação (verificado: `create_partner_order_secure`,
`respond_b2b_order_quote_secure` e o frontend apenas leem/gravam pré-aprovação).

## 4. Evidência comportamental (postcheck 8/8)

| # | Cenário | Resultado |
|---|---------|-----------|
| T1 | Parceiro sem pedidos → exposição 0 | PASS |
| T2 | Pedido 800 em análise entra em `comprometido_pendente` | PASS |
| T3 | Novo pedido 500 com limite 1000 → `LIMIT_EXCEEDED_BLOCK` | PASS |
| T4 | `p_exclude_order_id` continua honrado | PASS |
| T5 | Pedido cancelado libera limite | PASS |
| T7 | Item gravável antes da aprovação | PASS |
| T6 | UPDATE de item após aprovação bloqueado | PASS |
| T8 | DELETE de item após aprovação bloqueado | PASS |

## 5. Reabertura H4b — H4-003 reclassificado para P1 (auditoria independente)

A auditoria independente executada diretamente no staging após o GATE H4 **reabriu o gate**.
A redação anterior tratava H4-003 como “P2, cenário não exercitado, não bloqueante” — isso
estava **incorreto** e foi corrigido: tratava-se de uma quebra de invariante de autorização
financeira server-side (P1).

### H4-003 (P1) — `approve_partner_order` não era fail-closed em `LIMIT_EXCEEDED_APPROVAL`

Os 5 `partner_financial_settings` existentes usam `credit_limit_action='block'`, por isso o
postcheck H4 nunca exerceu `approval_required`. Na reavaliação de crédito da aprovação
comercial, apenas `LIMIT_EXCEEDED_BLOCK` e `OVERDUE_BLOCK` bloqueavam: um pedido acima do
limite em `em_analise_comercial` sem `credit_approved_at` (por correção administrativa,
importação, RPC futura ou transição indevida) podia ser aprovado com
`reason_code='LIMIT_EXCEEDED_APPROVAL'`.

**Correção (kit `restoration/homologacao-h4/40-h4b-credit-approval-failclosed.sql`,
migration `20260910000000_h4b_credit_approval_failclosed.sql`):**

- `approve_partner_order`, sob o advisory lock já existente: com `credit_approved_at IS NULL`,
  `OVERDUE_BLOCK`/`LIMIT_EXCEEDED_BLOCK` → `credit_block_on_approval`;
  `LIMIT_EXCEEDED_APPROVAL` → nova exceção estável `credit_approval_required`, sem aprovar e
  sem `ready_for_production = true`.
- Com `credit_approved_at IS NOT NULL` a aprovação segue, preservando a decisão financeira
  formal já auditada mesmo com exposição acima do limite em modo `approval_required`.
- Novo gatilho `trg_b2b_guard_credit_approval_fields`
  (`fn_b2b_guard_credit_approval_fields`): `credit_approved_at/by` só podem ser gravados
  dentro de `approve_b2b_credit` (marcador transacional `arbio.b2b_credit_approval`) — erro
  `credit_approval_fields_immutable`. Mudança de status não substitui a aprovação de crédito.
- `create_partner_order_secure` e o fluxo normal de `approve_b2b_credit` permanecem inalterados.

### Postcheck H4b (`restoration/homologacao-h4/42-h4b-postcheck.sql`) — 7/7 PASS

Fixture sintética com `credit_limit_action='approval_required'`, limite baixo e pedido
priceable (itens + `partner_order_payment_terms`), tudo em transação com ROLLBACK.

| # | Cenário | Resultado |
|---|---------|-----------|
| A1 | Acima do limite sem `credit_approved_at` → `credit_approval_required` | PASS |
| A2 | Pedido permanece não aprovado e `ready_for_production=false` | PASS |
| A3 | Gravação direta de `credit_approved_at/by` bloqueada | PASS |
| B1 | `aguardando_aprovacao_credito` → `approve_b2b_credit` grava crédito formal | PASS |
| B2 | Com crédito formal, aprovação comercial é permitida | PASS |
| C | `credit_limit_action='block'` continua bloqueando (`LIMIT_EXCEEDED_BLOCK`) | PASS |
| D | Pedido dentro do limite continua aprovável | PASS |

Rollback integral: zero resíduos (`partner_accounts LIKE 'H4B%'` = 0).
Produção `navfzbwgwzruipouyfnk` intocada.

## 6. Ressalvas remanescentes (P2/P3, não bloqueantes)

- **H4-004 (P3)** — `partner_orders` não possui índice parcial dedicado para o bucket
  pendente; volume atual (3 pedidos) não justifica.
- Herdadas de H1/H3: ressalvas P2/P3 já registradas nos respectivos relatórios.

## 7. GATE H4 (reemitido após H4b)

**H4 — APROVADA COM RESSALVAS.** Nenhum P0/P1 aberto: H4-001 (P1), H4-002 (P2) e H4-003
(P1, reaberto pela auditoria independente) corrigidos e reprovados por teste comportamental
no staging (8/8 + 7/7 PASS); ressalvas remanescentes apenas P2/P3. Não iniciar H5 sem
autorização.

