- Plano SaaS no frontend: gate só restringe via `isPathEntitled` (src/lib/saas/featureRouteMap.ts) somado ao RoleGuard; escrita de plataforma só por RPCs `platform_*` SECURITY INVOKER — evita bypass e alertas do linter.

- Escrita em organizations só por RPCs SECURITY DEFINER que emitem ticket em platform_private.authz_tickets (txid); triggers exigem o ticket — flags GUC não são fronteira de autorização.

- Convites por link usam exclusivamente o SMTP do módulo Comunicação, com intenção/lease/fencing server-side e resposta sem action link; sem configuração válida, o fluxo falha fechado — evita vazamento de token e integração paralela.

- Provider settings are accessed only through authenticated server functions; clients receive sanitized readiness booleans and never direct table grants — preserves least privilege and secret isolation.
