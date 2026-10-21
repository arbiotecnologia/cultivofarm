-- C1B-SCOPE postflight v2 — SOMENTE LEITURA. Executar após aplicação pelo auditor.
-- 1) is_valid_b2b_partner_user intocada (md5 esperado 93520101987e599280460d3dadcf3a9f)
SELECT p.oid::regprocedure::text AS identity, md5(pg_get_functiondef(p.oid)) AS md5
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'is_valid_b2b_partner_user';

-- 2) Assinatura e grants da função alterada preservados; definição mudou do baseline
SELECT p.oid::regprocedure::text AS identity, p.proacl::text AS acl,
       md5(pg_get_functiondef(p.oid)) <> '09b184da91c59f8b1f9be72217f8c37e' AS definicao_mudou
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'platform_private' AND p.proname = 'b2b_actor_scope';

-- 3) Escopo do padrão teste4: esperado profile_ok=t,
--    org_partner=user_partner=7e52de9a-4bed-4d1e-8200-3255a805465c, count=1, partner_valid=t
SELECT * FROM platform_private.b2b_actor_scope('beb25695-3957-48b0-aff8-6316520ea189');

-- 4) Entitlement catalogo_precos para o mesmo ator (impedimento separado se faltar)
SELECT EXISTS (SELECT 1 FROM platform_private.entitlements_for_user('beb25695-3957-48b0-aff8-6316520ea189') e
               WHERE e.feature_key = 'catalogo_precos') AS has_catalog;

-- 5) Verificação de rollback (executar SOMENTE se o rollback for aplicado):
--    md5(pg_get_functiondef) de platform_private.b2b_actor_scope(uuid) deve voltar a
--    '09b184da91c59f8b1f9be72217f8c37e' e o escopo de teste4 deve voltar a org_partner NULL.
