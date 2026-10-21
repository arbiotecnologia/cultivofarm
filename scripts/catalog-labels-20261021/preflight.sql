-- ============================================================================
-- PREFLIGHT SOMENTE LEITURA — candidata de rótulos por família (21/10/2026)
-- Rodar com operador aprovado no ref canônico swzpzcwiasxmjutrmvkm, confirmado
-- independentemente. Nenhuma variável de ambiente prova o destino. Não escreve.
-- ============================================================================

-- 1) Funções das quais a candidata depende (assinatura, corpo md5, ACL, owner)
SELECT p.proname, p.oid::regprocedure::text AS signature,
       pg_catalog.md5(pg_catalog.pg_get_functiondef(p.oid)) AS body_md5,
       p.proacl::text AS acl, r.rolname AS owner, p.prosecdef AS security_definer
FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
JOIN pg_catalog.pg_roles r ON r.oid = p.proowner
WHERE (n.nspname = 'platform_private' AND p.proname IN
        ('catalog_metadata_require_actor','catalog_entity_replay','catalog_entity_audit','set_global_product_family_core'))
   OR (n.nspname = 'public' AND p.proname IN
        ('platform_set_global_product_family','platform_read_global_product_catalog_by_family',
         'platform_list_catalog_labels','platform_create_catalog_label','platform_update_catalog_label','platform_set_catalog_label_active'))
ORDER BY 1, 2;

-- 2) Constraints atuais de classificação em produtos (baseline a substituir)
SELECT c.conname, pg_catalog.pg_get_constraintdef(c.oid) AS definition
FROM pg_catalog.pg_constraint c
WHERE c.conrelid = 'public.produtos'::pg_catalog.regclass
  AND c.conname IN ('produtos_familia_catalogo_check','produtos_classe_catalogo_coerente_check')
ORDER BY 1;

-- 3) Whitelist de operações do ledger de auditoria (será estendida, não afrouxada)
SELECT pg_catalog.pg_get_constraintdef(c.oid) AS audit_operation_check
FROM pg_catalog.pg_constraint c
WHERE c.conrelid = 'public.catalog_platform_admin_audit'::pg_catalog.regclass
  AND c.conname = 'catalog_platform_admin_audit_operation_check';

-- 4) A tabela canônica NÃO pode existir ainda (drift guard)
SELECT pg_catalog.to_regclass('public.catalog_family_labels') AS must_be_null;

-- 5) Triggers atuais em produtos (não remover nenhum existente)
SELECT t.tgname, p.oid::regprocedure::text AS function
FROM pg_catalog.pg_trigger t
JOIN pg_catalog.pg_proc p ON p.oid = t.tgfoid
WHERE t.tgrelid = 'public.produtos'::pg_catalog.regclass AND NOT t.tgisinternal
ORDER BY 1;

-- 6) Censo somente leitura dos rótulos em uso (para conferir a semente mínima)
SELECT familia_catalogo, classe_catalogo, pg_catalog.count(*) AS produtos
FROM public.produtos
GROUP BY 1, 2
ORDER BY 1 NULLS FIRST, 2 NULLS FIRST;

-- 7) Grants atuais em produtos (a candidata não os altera)
SELECT c.relname, c.relacl::text AS acl
FROM pg_catalog.pg_class c
WHERE c.oid = 'public.produtos'::pg_catalog.regclass;
