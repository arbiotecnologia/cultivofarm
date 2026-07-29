# Snapshot Pré-Fase 1 — Motor Comercial B2B

Data da captura: **2026-07-29**
Ambiente: staging `ikaauvsflpmamgxmkhoq` (marker `_fiscal_staging_marker` conferido)
Produção `navfzbwgwzruipouyfnk`: **não acessada**

Origem imutável do snapshot: tabela técnica
`public._motor_b2b_pre_phase1_snapshot` (staging), com colunas
`proname, identity_args, result_type, owner_name, security_definer, proconfig,
acl, obj_comment, definition, checksum_md5, captured_at, project_ref`.

Motivo do armazenamento em tabela (e não em SQL literal no repositório): o
conjunto de definições ultrapassa 60 KB e qualquer transcrição manual
introduziria risco de divergência byte a byte. O rollback é executado por
`restoration/motor-b2b-pre-phase1/restore-functions.sql`, que lê o snapshot e
valida checksum função a função.

## 1. Inventário capturado (17 objetos)

Todas as funções abaixo são `SECURITY DEFINER`, owner `postgres`,
`search_path = public`.

| Função | Assinatura (identity args) | Retorno | Bytes | Checksum MD5 |
| --- | --- | --- | ---: | --- |
| `add_b2b_payment_terms_note_secure` | `p_partner_order_id uuid, p_note text` | jsonb | 1371 | `0f3a09f6db78228f0cf7bf24a311e5f3` |
| `approve_b2b_credit` | `p_partner_order_id uuid, p_notes text` | jsonb | 2734 | `b72c50123367cad4f720051795df6082` |
| `approve_b2b_payment_terms_secure` | `p_partner_order_id uuid, p_notes text` | jsonb | 2032 | `ec30e5d8347a61baad0f4ccbba00e40e` |
| `archive_partner_simulation_secure` | `p_simulation_id uuid, p_reason text` | void | 1838 | `38ff04a92e6346edf4ac2b17f67f7dc5` |
| `audit_partner_order_payment_terms` | *(trigger)* | trigger | 909 | `3b246b5e4604ae90f7ee28c318336904` |
| `auto_reject_partner_orders_no_items` | `p_horas integer` | integer | 1170 | `72154b9e1e05d2fa2de1c3a34921965d` |
| `cancel_b2b_receivable_secure` | `p_partner_order_id uuid, p_motivo text` | jsonb | 1887 | `7d0395f6a3635b0b295e79bbe558c65d` |
| `convert_partner_simulation_to_order_secure` | `p_simulation_id uuid, p_observacoes text, p_payment_plan_id uuid, p_first_due_date date, p_installment_count integer` | uuid | 3780 | `f7b006585f3a5aa614afe58efa12c878` |
| `create_partner_order_secure` | `p_partner_id uuid, p_observacoes text, p_items jsonb, p_requested_delivery_date date, p_payment_plan_id uuid, p_first_due_date date, p_installment_count integer` | jsonb | 18259 | `e96c71fa1f65379607c51e3c6cfdfe14` |
| `generate_b2b_receivable_secure` | `p_partner_order_id uuid` | jsonb | 7627 | `d2fa5e842023ac524bfcb77cfc21276f` |
| `reject_b2b_payment_terms_secure` | `p_partner_order_id uuid, p_reason text` | jsonb | 2093 | `8b8d955d3b6fe38645ac201fb91f4a43` |
| `request_b2b_payment_terms_adjustment_secure` | `p_partner_order_id uuid, p_notes text` | jsonb | 2057 | `c18f78fa5605a85c354db69083325257` |
| `rpc_b2b_partner_credit` | `p_partner_id uuid` | jsonb | 1999 | `39983562f174f724f2128f32baf45502` |
| `simulate_b2b_payment_plan_secure` | `p_partner_id uuid, p_payment_plan_id uuid, p_items jsonb, p_first_due_date date` | jsonb | 11708 | `d11fb0bed57ff5dddf82ad53be3f5081` |
| `tg_auto_b2b_receivable` | *(trigger)* | trigger | 1333 | `b8f1cb9d7cc22b637a7999749ca85603` |
| `tg_partner_orders_credit_guard` | *(trigger)* | trigger | 2607 | `b690e309796f3a82d268a3ae26757a66` |
| `tg_partner_orders_require_items` | *(trigger)* | trigger | 539 | `b30e4b9a529bf1af522ebc2d3986d83b` |

## 2. GRANTs capturados

| Grupo | Funções | ACL |
| --- | --- | --- |
| **Com EXECUTE para `anon`** (herança de default privileges) | `add_b2b_payment_terms_note_secure`, `approve_b2b_payment_terms_secure`, `reject_b2b_payment_terms_secure`, `request_b2b_payment_terms_adjustment_secure`, `audit_partner_order_payment_terms` | `=X/postgres postgres=X/postgres anon=X/postgres authenticated=X/postgres service_role=X/postgres` |
| **Sem `anon`** | demais RPCs de negócio | `postgres=X/postgres authenticated=X/postgres service_role=X/postgres` |
| **Somente serviço** | `tg_partner_orders_credit_guard` | `postgres=X/postgres service_role=X/postgres` |

> Observação de segurança para a Fase 1: as quatro RPCs de *payment terms* e o
> trigger de auditoria mantêm `EXECUTE` para `anon` e para `PUBLIC`. Todas
> abortam com `auth_required` quando `auth.uid()` é nulo, portanto não há
> exposição efetiva hoje, mas o `REVOKE` de `anon`/`PUBLIC` deve ser incluído no
> hardening da Fase 1 (não aplicado nesta subfase para não alterar assinaturas
> nem comportamento).

## 3. Dependências diretas mapeadas

- `create_partner_order_secure` → `has_role`, `get_user_partner_id`,
  `rpc_b2b_partner_credit`, `commercial_payment_plans`, `partner_accounts`,
  `partner_product_prices`, `produtos`, `microrganismos`,
  `partner_order_payment_terms`, `partner_order_payment_schedule`,
  `partner_order_audit_logs`, `partner_orders` (+ 13 triggers).
- `generate_b2b_receivable_secure` → `partner_order_payment_terms`,
  `partner_order_payment_schedule`, `partner_accounts`,
  `partner_financial_settings`, `financial_categories`, `payment_methods`,
  `accounts_receivable`, `accounts_receivable_installments`,
  `partner_order_financial_links`.
- `tg_partner_orders_credit_guard` → `rpc_b2b_partner_credit` →
  `partner_financial_settings`, `accounts_receivable(_installments)`.
- `tg_auto_b2b_receivable` (AFTER UPDATE OF status em `partner_orders`) →
  `generate_b2b_receivable_secure`.

## 4. Migrations de origem (efetivas)

As versões vigentes vêm das migrations de julho/2026 (Fases 11 e 16 do módulo
comercial), notadamente `20260707221539` (simulate) e `20260707222533`
(create_partner_order), conforme apurado na Fase 0
(`docs/motor-b2b-fase0-auditoria.md`). O snapshot em banco é a fonte autoritativa
de rollback, pois reflete o estado **real** aplicado, e não a última migration
teoricamente vencedora.

## 5. Como restaurar

```bash
# 1. Conferir divergências (read-only)
psql "$PGURL_STAGING" -v ON_ERROR_STOP=1 \
  -f restoration/motor-b2b-pre-phase1/verify-restoration.sql

# 2. Restaurar tudo, atômico, com assert de checksum
psql "$PGURL_STAGING" --single-transaction -v ON_ERROR_STOP=1 \
  -f restoration/motor-b2b-pre-phase1/restore-functions.sql

# 3. Reconferir
psql "$PGURL_STAGING" -v ON_ERROR_STOP=1 \
  -f restoration/motor-b2b-pre-phase1/verify-restoration.sql
```

Ambos os scripts abortam imediatamente se o `project_ref` não for
`ikaauvsflpmamgxmkhoq`, e recusam explicitamente `navfzbwgwzruipouyfnk`.
Nenhum secret é lido ou registrado — a URL de conexão vem do ambiente do operador.
