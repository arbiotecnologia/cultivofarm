- Plano SaaS no frontend: gate só restringe via `isPathEntitled` (src/lib/saas/featureRouteMap.ts) somado ao RoleGuard; escrita de plataforma só por RPCs `platform_*` SECURITY INVOKER — evita bypass e alertas do linter.

- Escrita em organizations só por RPCs SECURITY DEFINER que emitem ticket em platform_private.authz_tickets (txid); triggers exigem o ticket — flags GUC não são fronteira de autorização.
