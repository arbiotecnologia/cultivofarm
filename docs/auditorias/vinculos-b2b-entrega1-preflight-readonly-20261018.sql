-- ENTREGA 1 preflight READ-ONLY (executar no canônico swzpzcwiasxmjutrmvkm antes da candidata).
-- Tudo SELECT; qualquer divergência = NO-GO.
-- 1) Hash e corpo baseline da função alvo.
SELECT md5(pg_get_functiondef('public.can_user_access_cliente(uuid,uuid)'::regprocedure)) AS body_md5;
-- esperado: c610786fc9f6d6a44453b9e63c91e974
-- 2) ACL e segurança da função (deve permanecer idêntica após a candidata).
SELECT p.proname, pg_get_function_identity_arguments(p.oid) args, p.prosecdef, p.proacl
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='can_user_access_cliente';
-- 3) Colunas exigidas pela candidata (todas devem existir).
SELECT table_name, column_name FROM information_schema.columns
WHERE table_schema='public' AND (
  (table_name='partner_users' AND column_name IN ('user_id','partner_id','tenant_id','revoked_at')) OR
  (table_name='partner_accounts' AND column_name IN ('id','ativo','deleted_at','commercial_owner_organization_id')) OR
  (table_name='partner_user_clients' AND column_name IN ('partner_id','user_id','cliente_id','active')) OR -- SEM revoked_at (confirmado live 2026-10-18)
  (table_name='partner_technician_clients' AND column_name IN ('partner_id','technician_user_id','cliente_id','active')) OR
  (table_name='partner_clients' AND column_name IN ('partner_id','cliente_id','active'))
) ORDER BY 1,2;
-- 4) Estado de dados: vínculos que a candidata passaria a bloquear/permitir.
SELECT
  (SELECT count(*) FROM public.partner_users) pu_total,
  (SELECT count(*) FROM public.partner_users WHERE revoked_at IS NULL) pu_nao_revogados,
  (SELECT count(*) FROM public.partner_users pu JOIN public.partner_accounts pa ON pa.id=pu.partner_id
     WHERE pu.revoked_at IS NULL AND pa.ativo AND pa.deleted_at IS NULL
       AND pa.commercial_owner_organization_id IS NOT NULL
       AND pu.tenant_id = pa.commercial_owner_organization_id) pu_elegiveis_owner,
  (SELECT count(*) FROM public.partner_users pu JOIN public.partner_accounts pa ON pa.id=pu.partner_id
     WHERE pu.revoked_at IS NULL AND pa.ativo AND pa.deleted_at IS NULL
       AND pa.commercial_owner_organization_id IS NULL) pu_elegiveis_legacy,
  (SELECT count(*) FROM public.partner_user_clients) puc_total,
  (SELECT count(*) FROM public.partner_technician_clients) ptc_total;
-- 5) Policies dependentes (devem ser exatamente as 12 conhecidas; contagem e nomes).
SELECT tablename, policyname FROM pg_policies
WHERE schemaname='public' AND (qual LIKE '%can_user_access_cliente%' OR with_check LIKE '%can_user_access_cliente%')
ORDER BY 1,2;
-- 6) Callers internos da função (funções cujo corpo a referencia).
SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) args
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE pg_get_functiondef(p.oid) LIKE '%can_user_access_cliente%' AND p.proname <> 'can_user_access_cliente'
ORDER BY 1,2;
