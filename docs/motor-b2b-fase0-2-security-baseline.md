# Baseline de segurança — Motor B2B Fase 0.2

Ambiente: **staging `ikaauvsflpmamgxmkhoq`** (marker `_fiscal_staging_marker` = STAGING, conferido antes de qualquer DDL).
Produção `navfzbwgwzruipouyfnk`: **não acessada**.
Data: 2026-07-29.

Este documento registra o estado **anterior** às correções da Fase 0.2.
O rollback correspondente é `restoration/motor-b2b-fase0-2/restore-policies.sql`.

## 1. Policies capturadas (estado pré-Fase 0.2)

Todas permissivas, role `authenticated`.

### partner_order_payment_terms
| Policy | Cmd | USING / WITH CHECK |
| --- | --- | --- |
| `popt_select` | SELECT | `administrador OR financeiro OR gestor_comercial OR EXISTS(partner_orders po JOIN partner_users pu ON pu.partner_id=po.partner_id WHERE po.id=partner_order_id AND pu.user_id=auth.uid())` — **sem exigir papel `parceiro_b2b`** |
| `popt_insert` | INSERT | WITH CHECK `administrador OR financeiro OR gestor_comercial` |
| `popt_update` | UPDATE | `administrador OR financeiro OR gestor_comercial` |

### partner_order_payment_schedule
| Policy | Cmd | USING / WITH CHECK |
| --- | --- | --- |
| `pops_select` | SELECT | idêntica a `popt_select`, via `partner_order_payment_schedule.partner_order_id` |
| `pops_insert` | INSERT | WITH CHECK `administrador OR financeiro OR gestor_comercial` |
| `pops_update` | UPDATE | `administrador OR financeiro OR gestor_comercial` |

### accounts_receivable
| Policy | Cmd | USING |
| --- | --- | --- |
| `Financial staff full access` | ALL | `is_financial_staff(auth.uid())` (administrador, gestor, financeiro) |
| `ar_b2b_readers` | SELECT | `origin_type='B2B_ORDER' AND (gestor_comercial OR administrativo)` |
| `ar_partner_select_own_b2b` | SELECT | `origin_type='B2B_ORDER' AND partner_id IN (SELECT partner_id FROM partner_users WHERE user_id=auth.uid())` — **sem exigir papel `parceiro_b2b`** |
| `ar_producer_read` | SELECT | `cliente_produtor AND customer_id = ANY(get_cliente_ids_for_user(auth.uid()))` — **sem filtrar `partner_id` / `origin_type`** |

### accounts_receivable_installments
| Policy | Cmd | USING |
| --- | --- | --- |
| `Financial staff full access` | ALL | `is_financial_staff(auth.uid())` |
| `ari_b2b_readers` | SELECT | `(gestor_comercial OR administrativo) AND EXISTS(ar.id=receivable_id AND ar.origin_type='B2B_ORDER')` |
| `ari_producer_read` | SELECT | `cliente_produtor AND EXISTS(ar.id=receivable_id AND ar.customer_id=ANY(...))` — **sem validar `partner_id`/`origin_type` do pai** |

### partner_orders (inalteradas)
`Financeiro read partner_orders` (SELECT, `financeiro`), `partner_orders_select` (SELECT, admin/gestor_comercial/`parceiro_b2b AND partner_id=get_user_partner_id()`), `partner_orders_insert`, `partner_orders_update`.

### partner_order_items (inalteradas)
`partner_order_items_select/insert/update/delete` — admin/gestor_comercial e leitura do parceiro via `parceiro_b2b AND o.partner_id=get_user_partner_id()`.

### partner_users (inalteradas)
`partner_users_admin_select` (admin/gestor_comercial ou `user_id = auth.uid()`), `_insert`, `_update`, `_delete`.

## 2. GRANTs de tabela (pré-Fase 0.2)

| Tabela | ACL |
| --- | --- |
| `accounts_receivable` | `postgres`, `authenticated`, `service_role` (arwdDxtm) |
| `accounts_receivable_installments` | `postgres`, `authenticated`, `service_role` |
| `partner_order_items` | + **`anon` arwdDxtm** |
| `partner_order_payment_schedule` | + **`anon` arwdDxtm** |
| `partner_order_payment_terms` | + **`anon` arwdDxtm** |
| `partner_orders` | + **`anon` arwdDxtm** |
| `partner_users` | + **`anon` arwdDxtm** |

## 3. GRANTs das RPCs sensíveis (pré-Fase 0.2)

| Função | ACL |
| --- | --- |
| `add_b2b_payment_terms_note_secure(uuid,text)` | `=X/postgres` (PUBLIC) + `anon`, `authenticated`, `service_role` |
| `approve_b2b_payment_terms_secure(uuid,text)` | idem |
| `reject_b2b_payment_terms_secure(uuid,text)` | idem |
| `request_b2b_payment_terms_adjustment_secure(uuid,text)` | idem |

Funções auxiliares (inalteradas): `get_user_partner_id()`, `get_cliente_ids_for_user(uuid)`, `is_financial_staff(uuid)` — `postgres`, `authenticated`, `service_role`.

## 4. Índices existentes (pré-Fase 0.2)

- `partner_users`: `partner_users_user_id_key` (UNIQUE user_id), `idx_partner_users_partner`, `idx_partner_users_user`, `idx_partner_users_user_id` (duplicado histórico, não alterado).
- `partner_orders`: `pkey`, `idx_partner_orders_partner`, `idx_partner_orders_full(partner_id,status,priority,created_at)`.
- `accounts_receivable`: `pkey(id)`, `idx_ar_customer`, `idx_ar_customer_status`, `idx_ar_origin(origin_type,origin_id)`, `idx_ar_partner_b2b(partner_id) WHERE origin_type='B2B_ORDER'`.
- `accounts_receivable_installments`: `pkey`, `idx_ari_due`, `idx_ari_status`, `idx_ar_inst_due`, `idx_ar_inst_status` — **sem índice em `receivable_id`**.
- `partner_order_payment_terms`: `idx_payment_terms_order(partner_order_id)`.
- `partner_order_payment_schedule`: `idx_payment_schedule_order(partner_order_id)`, `idx_payment_schedule_due`.

## 5. Vulnerabilidades confirmadas no baseline

1. `parceiro_b2b_tecnico` lia `partner_order_payment_terms` e `partner_order_payment_schedule` apenas por existir em `partner_users`.
2. `cliente_produtor` podia ler recebível B2B (`origin_type='B2B_ORDER'`, `partner_id` preenchido) sempre que o `customer_id` do título apontasse para um cliente vinculado a ele, e as respectivas parcelas.
3. Quatro RPCs de *payment terms* com `EXECUTE` para `PUBLIC` e `anon`.
4. Tabelas financeiras B2B com GRANT direto para `anon` (mitigado por RLS, mas desnecessário).
