- SaaS gates only restrict via isPathEntitled plus role/link guards; platform writes use platform_* INVOKER RPCs — prevents bypass.
- App.tsx snapshots never replace guards/RLS; redirects merge query/hash with target precedence — prevents broken aliases.
- Subscription keys survive remounts; tenant reads bound reconciliation/refresh, no auto-retry writes — prevents stuck UI/duplicates.

- Escrita em organizations só por RPCs SECURITY DEFINER que emitem ticket em platform_private.authz_tickets (txid); triggers exigem o ticket — flags GUC não são fronteira de autorização.

- Provisioned-admin password links use the canonical SMTP provider and existing invitation lease/fencing; operator-facing recovery links are disabled — only the account holder defines a permanent password.
- Convites operacionais sempre usam `https://app.cultivofarm.com.br/reset-password` definido no servidor; o `Origin` só autoriza a chamada e nunca compõe o redirect — evita fallback para localhost e open redirect.

- Global communication provider settings are accessible only to Platform Superadmins through server-side `is_platform_superadmin`; tenant admins have no UI or endpoint access, while workers retain service-role-only RPC access — preserves SaaS isolation and secret boundaries.

- Frontend version detection compares the production-build meta ID, with entry-script fallback; AuthProvider owns the controls, navigation requires a click, `/sw.js` only cleans up, and push uses `/push-sw.js` without app-shell caching.

- Platform organization creation is bound to an immutable CNPJ lookup/review snapshot plus explicit CNPJ re-entry before the RPC — prevents stale-tab or autofill data from bypassing the reviewed E01 payload.

- Commercial plans offer the global active catalog in audited DRAFTs; all runtime checks share one server-side resolver over linked published snapshots, overrides are idempotent, and payments stay OFF.

- Recovery links diagnose first-access state server-side and use exactly one password finalizer; the legacy mandatory-password screen remains a fallback barrier — prevents duplicate password definition.
- Dashboard summary RPCs derive organization from the active authenticated profile and fail closed for operational sources without deterministic tenant ownership — prevents cross-tenant aggregates.
- Tenant administration derives organization server-side; identity/tenant fields are immutable and unowned links fail closed. create-user uses actor bearer and compensates errors; mocked entrypoint tests avoid production — prevents tenant hopping and stale-credential bypass.
- Tenant operational rows use server-guarded `organization_id` or a deterministic parent chain to `h15_actor_organization()`; legacy rows without deterministic ownership remain fail-closed — prevents horizontal data leakage.
- Shared catalog writes, wipe/audits and global visual/financial settings require server-validated Platform Superadmin; wipe is transactional, idempotent, reasoned and limited to global tables.
- `configuracoes_sistema` is platform-global branding: active users may read it, but only a server-validated Platform Superadmin may mutate it or its `logos/platform/` assets.
- Fiscal Edges prove actor organization/resource before privileged operations; tenant files use private buckets and organization-prefixed paths derived server-side, with unowned legacy objects fail-closed.
- Published plan versions are content-immutable; a successor is created as a new DRAFT and publishing it closes only the predecessor's `effective_to` under a `saas_plan_version_supersede` ticket — keeps price/feature snapshots and history intact.
- Organization profile edits (legal name, trade name, e-mail) go only through `platform_update_organization_profile` with expected `updated_at`, idempotency key and immutable `organization_profile_audit`; CNPJ, status, plan and admins keep their own flows — avoids parallel write paths.
- Provisioned-admin management uses one dialog with internal sections, existing Edges/invitation mutation and a shared lock; private target checks, Auth confirmation, JWT fencing, expiry and audited retries remain server-side — prevents duplicate paths and authorization bypass.
- Subscription transitions keep a public INVOKER wrapper over a private, server-authorized DEFINER core; version changes preserve existing trial deadlines — keeps ticket issuance private and prevents implicit trial changes.
- B2B credit RPCs authorize through the canonical partner-scope guard before the service-only calculator, and direct financial-settings access has a restrictive active-tenant policy including writes — prevents role-only cross-tenant credit disclosure and modification.
- B2B keeps tenant policies/private cores; titles reuse installments. Technical writes reuse active actor/partner/client assignments with zero-finance guards; headers/items use price-free RPCs — prevents leakage and duplication.
- B2B preflight requires real Auth and ID-scoped cleanup before fixtures; secret-free manifests prevent false RLS proof.
