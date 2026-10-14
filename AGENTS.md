- SaaS gates only restrict via isPathEntitled plus role/link guards; platform writes use platform_* INVOKER RPCs — prevents bypass.
- App.tsx snapshots never replace guards/RLS; redirects merge query/hash with target precedence — prevents broken aliases.
- Subscription keys survive remounts; tenant reads bound reconciliation/refresh, no auto-retry writes — prevents stuck UI/duplicates.

- Escrita em organizations só por RPCs SECURITY DEFINER que emitem ticket em platform_private.authz_tickets (txid); triggers exigem o ticket — flags GUC não são fronteira de autorização.

- Provisioned-admin password links use the canonical SMTP provider and existing invitation lease/fencing; operator-facing recovery links are disabled — only the account holder defines a permanent password.
- Convites operacionais sempre usam `https://app.cultivofarm.com.br/reset-password` definido no servidor; o `Origin` só autoriza a chamada e nunca compõe o redirect — evita fallback para localhost e open redirect.

- Global communication settings require server-side `is_platform_superadmin`; tenant admins have no UI/endpoint access; workers use service-role-only RPCs — preserves tenant and secret isolation.

- Frontend version detection compares the production-build meta ID, with entry-script fallback; AuthProvider owns the controls, navigation requires a click, `/sw.js` only cleans up, and push uses `/push-sw.js` without app-shell caching.

- Organization creation requires an immutable CNPJ lookup/review snapshot and CNPJ re-entry before RPC — blocks stale-tab/autofill bypass of reviewed E01.

- Commercial plans offer the global active catalog in audited DRAFTs; all runtime checks share one server-side resolver over linked published snapshots, overrides are idempotent, and payments stay OFF.

- Recovery links diagnose first-access state server-side and use exactly one password finalizer; the legacy mandatory-password screen remains a fallback barrier — prevents duplicate password definition.
- Executive RPCs deny unproven scopes family-wide; kept reads require h15. UI preserves unavailability/scoped caches and never mounts blocked actions — prevents leaks.
- Tenant admin derives org server-side, keeps identity/tenant immutable and unowned links closed. create-user uses actor bearer, compensation, fixed public Auth codes and mocked tests; a ref lock releases in finally — prevents leaks/local reentry, not distributed idempotency.
- Stock requires h15/RBAC/feature, finite positive quantities (reversal NULL), tenant refs/notices, private txid context and literal keys. Only reviewed motor/batch have client ACL; private actor/tenant/content receipts and sorted locks prevent replay leaks; helpers stay closed.
- Shared catalog writes, wipe/audits and global visual/financial settings require server-validated Platform Superadmin; wipe is transactional, idempotent, reasoned and limited to global tables.
- `configuracoes_sistema` is platform-global branding: active users may read it, but only a server-validated Platform Superadmin may mutate it or its `logos/platform/` assets.
- Published versions are immutable; successors start DRAFT. Publishing closes only predecessor `effective_to` under `saas_plan_version_supersede` ticket — preserves snapshots/history.
- Legal/trade name and email edits require `platform_update_organization_profile`, expected `updated_at`, idempotency key and immutable `organization_profile_audit`; CNPJ/status/plan/admins retain separate flows — prevents parallel writes.
- Provisioned-admin uses one sectioned dialog, existing Edges/invitation mutation and shared lock; target checks, Auth confirmation, JWT fencing, expiry/retry audits stay server-side — avoids bypass.
- Subscription transitions use a public INVOKER/private authorized DEFINER core; version changes preserve trial deadlines — protects tickets/trials.
- Auth logout/renewal clears identity/cache; reload runs outside callbacks — avoids stale roles/deadlocks.
- B2B credit RPCs use the canonical partner guard before the service-only calculator; financial settings require restrictive active-tenant policies for reads/writes — prevents cross-tenant credit access.
- B2B keeps tenant policies/private cores; titles reuse installments. Technical writes reuse active actor/partner/client assignments with zero-finance guards; headers/items use price-free RPCs — prevents leakage and duplication.
- Fixtures require real Auth, delivery OFF and ID cleanup; SQL rollback is not browser proof — avoids false PASS.
- Notifications follow supabase/AGENTS.md; mobile uses unified scoped reads/mutations — keeps counts coherent without widening access.
<!-- LOVABLE:BEGIN -->
- Desktop/mobile recovery share one form and the existing canonical redirect policy, with synchronous pending lock and account-neutral states — prevents divergent recovery and local duplicate sends.
- Storage UI and delayed file openings share an identity/tenant/role/resource generation fence; server authorization remains mandatory — prevents stale-session disclosure.
- Commercial B2B context is an actor-derived fenced RPC with exclusive role and unique partner link; unreviewed channels remain closed — prevents sibling-partner disclosure.
<!-- LOVABLE:END -->

- Portal selection/preferences require canonical ready actor/tenant; real-role contexts remain separate from legacy flags. Manual switch bypasses only preference — prevents invented roles/stale navigation.

- Wizard uses persisted prerequisites, not attachments; review uses controlled AlertDialog and a shared synchronous ref lock — prevents blocked navigation and duplicate submissions.
