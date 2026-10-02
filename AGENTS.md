- Plano SaaS no frontend: gate só restringe via `isPathEntitled` (src/lib/saas/featureRouteMap.ts) somado ao RoleGuard; escrita de plataforma só por RPCs `platform_*` SECURITY INVOKER — evita bypass e alertas do linter.

- Escrita em organizations só por RPCs SECURITY DEFINER que emitem ticket em platform_private.authz_tickets (txid); triggers exigem o ticket — flags GUC não são fronteira de autorização.

- Convites por link usam exclusivamente o SMTP do módulo Comunicação, com intenção/lease/fencing server-side e resposta sem action link; sem configuração válida, o fluxo falha fechado — evita vazamento de token e integração paralela.

- Global communication provider settings are accessible only to Platform Superadmins through server-side `is_platform_superadmin`; tenant admins have no UI or endpoint access, while workers retain service-role-only RPC access — preserves SaaS isolation and secret boundaries.

- Controlled SMTP tests reuse the shared communication adapter and require Platform Superadmin authorization, rate limiting, full readiness, test mode, and the fixed gate recipient before any socket; responses expose only allowlisted codes — prevents tenant privilege bypass and diagnostic leakage.

- PWA version recovery is centralized in `src/pwa/registerSW.ts`: stale Vite chunks clear only app-shell runtime caches and trigger one guarded reload — prevents mixed deployments without removing offline support.

- Platform organization creation is bound to an immutable CNPJ lookup/review snapshot plus explicit CNPJ re-entry before the RPC — prevents stale-tab or autofill data from bypassing the reviewed E01 payload.
