# AGENTS — fiscal-tenant-catalog-20261101

- Preparation only: never apply install/rollback hosted, publish, grant or flip gates from this package; the owner/auditor reviews and applies — prevents unreviewed fiscal writers.
- Depends on the uninstalled tenant catalog ownership package (scripts/rbac-audit/proposed-tenant-catalog-ownership*.sql); PRE aborts if `produtos.owner_organization_id` or `catalog_ownership_enabled()` is absent — never inline or fork that foundation.
- Reuse `product_fiscal_profiles` (one active profile per product); owned-item tenant is always the product's immutable owner, never a payload/GUC/claim value — single fiscal source.
- Owned writes only through `tenant_owned_product_fiscal_save` (DEFINER, fixed search_path, actor+tenant+role re-check after lock, CAS by `updated_at`, idempotent receipt); RESTRICTIVE policies keep direct client writes to global rows only and hide other tenants' owned rows — prevents cross-tenant reads/writes and Superadmin writes on tenant items.
- New profiles start DRAFT; the RPC never sets VALIDATED nor infers NCM/CFOP — classification comes from accounting.
- Own gate `owned_fiscal_gate` starts disabled; rollback is deny-only (gate false + revoke EXECUTE), never drops policies or receipts.
- Global fertilizer creation reuses `platform_create_global_product` + `platform_set_global_product_family`; no SQL here — fertilizer `tipo`/unit remain an owner decision.
- Local tests use disposable PostgreSQL with synthetic auth stubs; never report them as hosted JWT/RLS proof.
