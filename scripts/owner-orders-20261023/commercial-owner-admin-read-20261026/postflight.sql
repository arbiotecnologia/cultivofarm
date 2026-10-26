-- POST — READ ONLY. Verifica instalação exata; qualquer divergência = rollback guardado.
BEGIN TRANSACTION READ ONLY;

-- 1) Funções instaladas com owner postgres, securuty mode e ACL esperados.
SELECT n.nspname AS schema, p.proname, p.prosecdef, r.rolname AS owner,
       p.proacl, md5(p.prosrc) AS body_md5
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  JOIN pg_roles r ON r.oid = p.proowner
 WHERE (n.nspname = 'public' AND p.proname = 'c2_commercial_owner_orders_projection')
    OR (n.nspname = 'platform_private' AND p.proname = 'c2_commercial_owner_orders_core')
 ORDER BY 1, 2;
-- esperado: 2 linhas; owner postgres; core prosecdef=true, wrapper prosecdef=false;
--           ACL {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres};
--           body_md5 iguais aos registrados em expected.json.

-- 2) Policies de partner_orders inalteradas (mesmas 5, mesmos qual/with_check).
SELECT pol.polname, pol.polpermissive,
       md5(coalesce(pg_get_expr(pol.polqual, pol.polrelid), '')) AS qual_md5,
       md5(coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '')) AS check_md5
  FROM pg_policy pol
  JOIN pg_class c ON c.oid = pol.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relname = 'partner_orders'
 ORDER BY pol.polname;

-- 3) Nenhuma grant extra vazou para anon/PUBLIC.
SELECT p.proname, p.proacl
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE p.proname LIKE 'c2_commercial_owner_orders%'
   AND (p.proacl::text LIKE '%anon%' OR p.proacl IS NULL);

ROLLBACK;
