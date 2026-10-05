- Plano SaaS no frontend: gate só restringe via `isPathEntitled` (src/lib/saas/featureRouteMap.ts) somado ao RoleGuard; escrita de plataforma só por RPCs `platform_*` SECURITY INVOKER — evita bypass e alertas do linter.

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

- Frontend version detection is independent of service workers: compare the explicit per-production-build HTML meta ID, with entry-script hash fallback for legacy pages; a single state manager inside AuthProvider powers reusable authenticated header controls, and navigation occurs only after an explicit user click; `/sw.js` is only a legacy cleanup worker and push uses `/push-sw.js` without app-shell caching — detects every publication without automatic reloads.

- Platform organization creation is bound to an immutable CNPJ lookup/review snapshot plus explicit CNPJ re-entry before the RPC — prevents stale-tab or autofill data from bypassing the reviewed E01 payload.

- Platform subscription changes stay in `platform_change_subscription` as SECURITY INVOKER with symmetric Superadmin read/write RLS, explicit enum conversion and row locking — preserves least privilege, auditability and concurrency safety.
