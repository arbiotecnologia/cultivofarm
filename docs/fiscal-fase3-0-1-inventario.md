# Fase Fiscal 3.0.1 — Inventário do Schema Real

Fonte-de-verdade única para o verificador de types, o harness RLS e o
backfill. Compilado a partir das duas migrations aplicadas
(`20260721000000_fiscal_fase2_fundacao.sql`,
`20260721010000_fiscal_fase2_1_hardening.sql`) e da migration corretiva
`20260722000000_fiscal_fase3_0_1_integridade.sql`.

## Tabelas

### `public.company_fiscal_settings`
- `id uuid PK`
- `cnpj text NULL`, `legal_name text NULL`, `trade_name text NULL`
- `fiscal_environment text NOT NULL DEFAULT 'NOT_CONFIGURED'`
- `fiscal_provider text NOT NULL DEFAULT 'NONE'`
- `configuration_status text NOT NULL DEFAULT 'DRAFT'`
- `nfe_enabled boolean NOT NULL DEFAULT false`
- `nfse_enabled boolean NOT NULL DEFAULT false`
- `production_enabled boolean NOT NULL DEFAULT false`
- índice único: `ux_company_fiscal_settings_active_singleton`
- policies: read (admin/gestor/financeiro), write (admin)

### `public.product_fiscal_profiles`
- `id uuid PK`, `product_id uuid NOT NULL`
- `ncm text NULL`, `cfop_in_state text NULL`, `cfop_interstate text NULL`
- `profile_status text NOT NULL DEFAULT 'DRAFT'`
- índice: `ux_product_fiscal_profiles_active` (product_id) WHERE is_active
- **FK (3.0.1)**: `product_id → produtos(id) ON DELETE RESTRICT`
- policies: read (admin/gestor/financeiro), write (admin/financeiro)

### `public.service_fiscal_profiles`
- `id uuid PK`, `service_id uuid NULL`, `source_reference text NULL`
- `lc116_item text NULL`, `cnae text NULL`, `profile_status text NOT NULL`
- CHECK: `service_id IS NOT NULL OR source_reference IS NOT NULL`
- **Sem FK** (catálogo canônico ausente)
- **Índices únicos parciais (3.0.1)**:
  - `ux_service_fiscal_profiles_service_active`
  - `ux_service_fiscal_profiles_source_ref_active`
- `source_reference` documentada como transitória
- policies: read/write iguais a product

### `public.customer_fiscal_profiles`
- `id uuid PK`, `customer_id uuid NOT NULL`
- `taxpayer_indicator text NULL`
- `fiscal_municipality_ibge_code text NULL`, `profile_status text NOT NULL`
- índice único: `ux_customer_fiscal_profiles_customer` (customer_id)
- **FK (3.0.1)**: `customer_id → clientes(id) ON DELETE RESTRICT`
- policies: read/write iguais a product

### `public.fiscal_invoices`
Colunas relevantes (subset auditado):
- `id uuid PK`, `status text NOT NULL`
- `company_cnpj text NULL`, `document_model text NULL`, `environment text NULL`
- `series text NULL`, `invoice_number` NULL, `access_key text NULL`
- `document_origin text NULL`, `provider text NULL`, `provider_reference text NULL`
- `normalized_status text NULL`, `reconciliation_status text NULL`
- FKs internas: `parent_invoice_id`, `substitution_invoice_id` (RESTRICT)
- Constraints CHECK para document_model/origin/environment/normalized_status/reconciliation_status
- Índices únicos parciais: `ux_fi_env_doc_model_series_number_company`,
  `ux_fi_provider_env_model_ref`, `ux_fi_access_key`, `ux_fi_idempotency_key`
- policies históricas: `is_financial_staff`, `fi_staff_all`, `fi_producer_read`
  (admin/gestor/financeiro + cliente_produtor apenas próprio documento)

### `public.fiscal_invoice_items`
- `id uuid PK`, `fiscal_invoice_id uuid NOT NULL → fiscal_invoices ON DELETE CASCADE`
- UNIQUE (fiscal_invoice_id, item_sequence)
- policies: read (admin/gestor/financeiro — **administrativo REMOVIDO na 2.1**),
  write (admin/financeiro)

### `public.fiscal_events`
- `id uuid PK`
- `fiscal_invoice_id uuid` **NOT NULL após 3.0.1 se banco limpo** (FK RESTRICT)
- `event_type text NOT NULL` (enum via CHECK)
- `event_source text NOT NULL DEFAULT 'INTERNAL'`
- `request_snapshot jsonb NULL`, `response_snapshot jsonb NULL`
- `error_code text NULL`, `error_message text NULL`, `notes text NULL` (3.0.1)
- `performed_by uuid NULL`, `created_at timestamptz NOT NULL DEFAULT now()`
- policies: read (admin/gestor/financeiro), **escrita direta DENY**
  (revogada na 2.1; só via RPC `rpc_fiscal_event_manual` ou trigger)

### `public.fiscal_idempotency_keys`
- `id uuid PK`, `idempotency_key text NOT NULL UNIQUE`
- `fiscal_invoice_id uuid NULL → fiscal_invoices ON DELETE SET NULL`
- policies: read (admin), escrita via API DENY

### `public.fiscal_audit_log`
- `id uuid PK`, `table_name text NOT NULL`, `record_id uuid NULL`
- `action text NOT NULL` (INSERT/UPDATE/DELETE via CHECK)
- `changed_by uuid NULL`, `changed_at timestamptz NOT NULL DEFAULT now()`
- `old_values jsonb NULL`, `new_values jsonb NULL`
- Escrita apenas via trigger `fiscal_audit_trigger` (SECURITY DEFINER),
  toda escrita direta DENY
- policies: read (admin), write DENY

## Views (todas `security_invoker=true`)

| View | Colunas mínimas | Escopo pós-3.0.1 |
| --- | --- | --- |
| `v_fiscal_company_readiness` | `id, configuration_status, ...` | staff financeiro (herança) |
| `v_product_fiscal_readiness` | `product_id, profile_status` | staff financeiro |
| `v_service_fiscal_readiness` | `id, service_id, source_reference, profile_status` | staff financeiro |
| `v_customer_fiscal_readiness` | `customer_id, profile_status` | staff financeiro |
| `v_fiscal_document_reconciliation_pending` | `fiscal_invoice_id, reconciliation_status, ...` | **filtro explícito has_role em 3.0.1** |

## RPC

`public.rpc_fiscal_event_manual(p_invoice_id uuid, p_event_type text, p_notes text)
RETURNS uuid` — SECURITY DEFINER, GRANT EXECUTE a `authenticated`, REVOKE de
`public, anon`. Whitelisting: admin/gestor/financeiro. Validações 3.0.1:
`p_invoice_id NOT NULL`, `EXISTS` em fiscal_invoices, `event_type` em allowlist.
`p_notes` gravado em `fiscal_events.notes` (coluna aditiva).

## Função de mascaramento

`public.mask_sensitive_jsonb(v jsonb) RETURNS jsonb` — IMMUTABLE.
**Realmente recursiva** (3.0.1): percorre objetos e arrays; correspondência
`position(lower(key) ILIKE '%<termo>%')` para 18 termos sensíveis. Preserva
primitivos, `null`, objetos e arrays vazios.
