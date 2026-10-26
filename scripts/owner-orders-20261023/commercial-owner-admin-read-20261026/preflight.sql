-- PRE — READ ONLY. Executar em transação somente leitura; qualquer divergência = NO-GO.
BEGIN TRANSACTION READ ONLY;

-- 1) As funções novas ainda NÃO existem (nunca reaplicar sobre algo instalado).
SELECT count(*) AS existing_target_functions
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE (n.nspname = 'public' AND p.proname = 'c2_commercial_owner_orders_projection')
    OR (n.nspname = 'platform_private' AND p.proname = 'c2_commercial_owner_orders_core');
-- esperado: 0

-- 2) Policies de partner_orders intactas (5 policies conhecidas; este pacote não as altera).
SELECT pol.polname, pol.polpermissive
  FROM pg_policy pol
  JOIN pg_class c ON c.oid = pol.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relname = 'partner_orders'
 ORDER BY pol.polname;
-- esperado: Financeiro read partner_orders; b2b_phase1_tenant_guard (restrictive);
--           partner_orders_insert; partner_orders_select; partner_orders_update

-- 3) Dependências existem com ACL canônica.
SELECT n.nspname, p.proname, p.prosecdef, p.proacl
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE (n.nspname = 'platform_private' AND p.proname IN ('has_role'))
    OR (n.nspname = 'public' AND p.proname IN ('get_my_commercial_orders_projection'))
 ORDER BY 1, 2;

ROLLBACK;
