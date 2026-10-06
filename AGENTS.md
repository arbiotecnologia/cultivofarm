- Plano SaaS no frontend: gate só restringe via `isPathEntitled` (src/lib/saas/featureRouteMap.ts) somado ao RoleGuard e, nos portais, aninhado aos guards de vínculo (só features inequívocas); escrita de plataforma só por RPCs `platform_*` SECURITY INVOKER — evita bypass e alertas do linter.

- Escrita em organizations só por RPCs SECURITY DEFINER que emitem ticket em platform_private.authz_tickets (txid); triggers exigem o ticket — flags GUC não são fronteira de autorização.

- Convites por link usam a mesma intenção/lease/fencing server-side; entrega por e-mail passa exclusivamente pelo SMTP, enquanto o fallback manual só devolve o recovery link em resposta privada no-store e o audita sem segredo — evita fluxo paralelo e persistência de credencial.
- Convites operacionais sempre usam `https://app.cultivofarm.com.br/reset-password` definido no servidor; o `Origin` só autoriza a chamada e nunca compõe o redirect — evita fallback para localhost e open redirect.

- Resultados SMTP sem resposta remota inequívoca ficam ambíguos e só podem ser reenviados após confirmação humana auditada, preservando cooldown e fencing — evita duplicação silenciosa.
- SMTP on Supabase Edge must reject ports 25 and 587 during readiness, before any claim or socket; port 465 is only structurally valid until provider support is proven.

- Global communication provider settings are accessible only to Platform Superadmins through server-side `is_platform_superadmin`; tenant admins have no UI or endpoint access, while workers retain service-role-only RPC access — preserves SaaS isolation and secret boundaries.

- Controlled SMTP test sends reuse the shared adapter but bypass only operational delivery flags after a recent equivalent connection PASS, requiring Platform Superadmin, Test Mode, exclusive fixed allowlist, explicit confirmation, rate limiting and sanitized audit — validates transport without releasing operational flows.
- SMTP provider diagnostics use the existing test function: connection mode authenticates over TLS without SMTP envelope/data and works with delivery OFF; send mode remains fixed-recipient and fully gated — separates transport readiness from real delivery.
- Native SMTP connection failures are normalized server-side to an allowlisted DNS/TCP/TLS code; raw runtime errors never reach logs, audit rows, or clients — improves diagnosis without leaking infrastructure details.
- Shared communication email sends use the same native Deno TLS/EHLO/AUTH protocol core as the SMTP probe; `SmtpLikeClient` remains the injectable consumer contract — prevents probe/send transport divergence.
- KingHost SMTPi diagnostics use only a server-side allowlisted in-memory route; persistence requires a separate explicit Superadmin action that changes only the SMTP host — prevents arbitrary host probing and silent configuration changes.

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
