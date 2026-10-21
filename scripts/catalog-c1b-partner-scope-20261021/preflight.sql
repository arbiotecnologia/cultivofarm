-- C1B-SCOPE preflight — SOMENTE LEITURA. Executar antes de qualquer aplicação.
-- 1) Baseline das funções (md5 esperados: b2b_actor_scope=09b184da91c59f8b1f9be72217f8c37e,
--    is_valid_b2b_partner_user=93520101987e599280460d3dadcf3a9f)
SELECT p.oid::regprocedure::text AS identity, md5(pg_get_functiondef(p.oid)) AS md5
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE (n.nspname = 'platform_private' AND p.proname = 'b2b_actor_scope')
   OR (n.nspname = 'public' AND p.proname = 'is_valid_b2b_partner_user')
ORDER BY 1;

-- 2) Modelo A populado? (esperado nesta data: 0)
SELECT count(*) FILTER (WHERE partner_account_id IS NOT NULL) AS orgs_com_parceiro, count(*) AS orgs_total
FROM public.organizations;

-- 3) Vínculos ativos e coerência tenant=fornecedor
SELECT pu.user_id, pu.partner_id, pu.papel, pu.tenant_id = pa.commercial_owner_organization_id AS tenant_eh_owner,
       p.organization_id AS profile_org, o.partner_account_id AS org_partner
FROM public.partner_users pu
JOIN public.partner_accounts pa ON pa.id = pu.partner_id
JOIN public.profiles p ON p.user_id = pu.user_id
LEFT JOIN public.organizations o ON o.id = p.organization_id
WHERE pu.revoked_at IS NULL;

-- 4) Grants atuais da função alvo (devem se preservar após CREATE OR REPLACE)
SELECT p.oid::regprocedure::text AS identity, p.proacl::text AS acl
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'platform_private' AND p.proname = 'b2b_actor_scope';
