- Plano SaaS no frontend: gate só restringe via `isPathEntitled` (src/lib/saas/featureRouteMap.ts) somado ao RoleGuard e, nos portais, aninhado aos guards de vínculo (só features inequívocas); escrita de plataforma só por RPCs `platform_*` SECURITY INVOKER — evita bypass e alertas do linter.

- Escrita em organizations só por RPCs SECURITY DEFINER que emitem ticket em platform_private.authz_tickets (txid); triggers exigem o ticket — flags GUC não são fronteira de autorização.

- Convites por link usam a mesma intenção/lease/fencing server-side; entrega por e-mail passa exclusivamente pelo SMTP, enquanto o fallback manual só devolve o recovery link em resposta privada no-store e o audita sem segredo — evita fluxo paralelo e persistência de credencial.
- Convites operacionais sempre usam `https://app.cultivofarm.com.br/reset-password` definido no servidor; o `Origin` só autoriza a chamada e nunca compõe o redirect — evita fallback para localhost e open redirect.

- Global communication provider settings are accessible only to Platform Superadmins through server-side `is_platform_superadmin`; tenant admins have no UI or endpoint access, while workers retain service-role-only RPC access — preserves SaaS isolation and secret boundaries.

- Frontend version detection compares the production-build meta ID, with entry-script fallback; AuthProvider owns the controls, navigation requires a click, `/sw.js` only cleans up, and push uses `/push-sw.js` without app-shell caching.

- Platform organization creation is bound to an immutable CNPJ lookup/review snapshot plus explicit CNPJ re-entry before the RPC — prevents stale-tab or autofill data from bypassing the reviewed E01 payload.

- Commercial plans offer the global active catalog in audited DRAFTs; all runtime checks share one server-side resolver over linked published snapshots, overrides are idempotent, and payments stay OFF.

- Recovery links diagnose first-access state server-side and use exactly one password finalizer; the legacy mandatory-password screen remains a fallback barrier — prevents duplicate password definition.
- Dashboard summary RPCs derive organization from the active authenticated profile and fail closed for operational sources without deterministic tenant ownership — prevents cross-tenant aggregates.
- Tenant user administration derives organization from the authenticated profile on the server; profile identity/tenant fields are immutable to authenticated direct updates and legacy links without deterministic ownership fail closed — prevents tenant hopping and cross-tenant administration.
- Tenant operational rows use server-guarded `organization_id` or a deterministic parent chain to `h15_actor_organization()`; legacy rows without deterministic ownership remain fail-closed — prevents horizontal data leakage.
- Shared catalog writes, wipe/audits and global visual/financial settings require server-validated Platform Superadmin; wipe is transactional, idempotent, reasoned and limited to global tables.
- `configuracoes_sistema` is platform-global branding: active users may read it, but only a server-validated Platform Superadmin may mutate it or its `logos/platform/` assets.
- Fiscal Edges prove actor organization/resource before privileged operations; tenant files use private buckets and organization-prefixed paths derived server-side, with unowned legacy objects fail-closed.
- Published plan versions are content-immutable; a successor is created as a new DRAFT and publishing it closes only the predecessor's `effective_to` under a `saas_plan_version_supersede` ticket — keeps price/feature snapshots and history intact.
- Organization profile edits (legal name, trade name, e-mail) go only through `platform_update_organization_profile` with expected `updated_at`, idempotency key and immutable `organization_profile_audit`; CNPJ, status, plan and admins keep their own flows — avoids parallel write paths.
- Provisioned org-admin changes go only through `platform_*_org_admin*` RPCs (principal/edit) and the `platform-org-admin-email-change` Edge (Auth first, then service-role sync + session revoke), all audited in immutable `platform_org_admin_audit` — avoids parallel identity writes.
- Subscription transitions keep a public INVOKER wrapper over a private, server-authorized DEFINER core; version changes preserve existing trial deadlines — keeps ticket issuance private and prevents implicit trial changes.
- B2B credit read RPCs authorize through the canonical partner-scope guard before calling the service-only credit calculator — prevents role-only cross-tenant credit disclosure.
