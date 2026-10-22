-- ============================================================================
-- POSTFLIGHT SOMENTE LEITURA — verifica instalação da candidata de rótulos v2.
-- Rodar somente após aplicação independente e aprovada da candidate.sql.review.
-- ============================================================================

-- 1) Tabela canônica presente, RLS ligada, sem policies (acesso direto negado)
SELECT c.relname, c.relrowsecurity AS rls_enabled,
       (SELECT pg_catalog.count(*) FROM pg_catalog.pg_policy pol
         WHERE pol.polrelid = c.oid) AS policy_count_must_be_zero
FROM pg_catalog.pg_class c
WHERE c.oid = 'public.catalog_family_labels'::pg_catalog.regclass;

-- 2) Grants: somente service_role; nada para anon/authenticated
SELECT c.relacl::text AS acl
FROM pg_catalog.pg_class c
WHERE c.oid = 'public.catalog_family_labels'::pg_catalog.regclass;

-- 3) Semente mínima: exatamente os 7 rótulos atuais, todos ativos
SELECT familia, pg_catalog.count(*) AS rotulos, pg_catalog.bool_and(ativo) AS todos_ativos
FROM public.catalog_family_labels
GROUP BY 1
ORDER BY 1;

-- 4) CHECK literal removido; CHECK de família preservado
SELECT c.conname
FROM pg_catalog.pg_constraint c
WHERE c.conrelid = 'public.produtos'::pg_catalog.regclass
  AND c.conname IN ('produtos_familia_catalogo_check','produtos_classe_catalogo_coerente_check')
ORDER BY 1;
-- esperado: apenas produtos_familia_catalogo_check

-- 5) Trigger de validação presente (usa helper com FOR KEY SHARE)
SELECT t.tgname, p.oid::regprocedure::text AS function, p.prosecdef AS security_definer
FROM pg_catalog.pg_trigger t
JOIN pg_catalog.pg_proc p ON p.oid = t.tgfoid
WHERE t.tgrelid = 'public.produtos'::pg_catalog.regclass
  AND t.tgname = 'produtos_catalog_family_label_validate';

-- 6) Core de classificação: mesma assinatura, corpo novo (md5 mudou vs. preflight),
--    ACL e owner PRESERVADOS ({postgres=X/postgres,authenticated=X/postgres}, postgres)
SELECT p.oid::regprocedure::text AS signature,
       pg_catalog.md5(pg_catalog.pg_get_functiondef(p.oid)) AS body_md5,
       p.proacl::text AS acl, r.rolname AS owner
FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
JOIN pg_catalog.pg_roles r ON r.oid = p.proowner
WHERE n.nspname = 'platform_private' AND p.proname = 'set_global_product_family_core';

-- 7) RPCs novas + helper: DEFINER, search_path fixo, sem EXECUTE para PUBLIC/anon
SELECT p.oid::regprocedure::text AS signature, p.prosecdef AS security_definer,
       p.proconfig::text AS config, p.proacl::text AS acl
FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
WHERE (n.nspname = 'public' AND p.proname IN
    ('platform_list_catalog_labels','platform_create_catalog_label','platform_update_catalog_label',
     'platform_set_catalog_label_active','catalog_family_labels_read'))
   OR (n.nspname = 'platform_private' AND p.proname = 'catalog_family_label_check')
ORDER BY 1;

-- 8) Whitelist de auditoria estendida com as 3 operações novas
SELECT pg_catalog.pg_get_constraintdef(c.oid) AS audit_operation_check
FROM pg_catalog.pg_constraint c
WHERE c.conrelid = 'public.catalog_platform_admin_audit'::pg_catalog.regclass
  AND c.conname = 'catalog_platform_admin_audit_operation_check';

-- 9) Leitura de exibição: usuário autenticado ativo recebe somente rótulos ATIVOS
--    (executar com sessão de leitor autorizado; esperado: sem id/updated_at/ativo)
-- SELECT public.catalog_family_labels_read('quimico');

-- 9) Correção independente do auditor: whitelist preserva a operação de composição existente
SELECT pg_catalog.pg_get_constraintdef(c.oid) LIKE '%set_global_product_composition%' AS composition_operation_preserved
FROM pg_catalog.pg_constraint c
WHERE c.conrelid = 'public.catalog_platform_admin_audit'::pg_catalog.regclass
  AND c.conname = 'catalog_platform_admin_audit_operation_check';
