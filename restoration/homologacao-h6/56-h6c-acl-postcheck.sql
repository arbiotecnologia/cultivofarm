-- H6c (ACL) POSTCHECK — somente leitura. Staging ikaauvsflpmamgxmkhoq.
-- Uso: psql "$STAGING_DSN" -v ON_ERROR_STOP=1 -f restoration/homologacao-h6/56-h6c-acl-postcheck.sql
\pset pager off
WITH f AS (
  SELECT p.oid, p.proname, p.prosecdef, coalesce(array_to_string(p.proconfig,','),'') AS cfg
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.oid::regprocedure::text IN (
       'fn_entrega_valor_faturavel_v1(uuid)',
       'fn_entrega_guard_faturamento_v1(uuid,numeric)',
       'fn_h6b_reconciliacao_valor_faturavel()')
), t AS (
  SELECT 'H6C-A01 anon sem EXECUTE nos helpers' AS gate,
         NOT bool_or(has_function_privilege('anon', oid, 'EXECUTE')) AS ok FROM f
  UNION ALL SELECT 'H6C-A02 authenticated sem EXECUTE nos helpers',
         NOT bool_or(has_function_privilege('authenticated', oid, 'EXECUTE')) FROM f
  UNION ALL SELECT 'H6C-A03 PUBLIC sem EXECUTE nos helpers',
         NOT EXISTS (SELECT 1 FROM f, pg_proc p, aclexplode(p.proacl) a
                      WHERE p.oid = f.oid AND a.grantee = 0)
  UNION ALL SELECT 'H6C-A04 service_role mantem EXECUTE',
         bool_and(has_function_privilege('service_role', oid, 'EXECUTE')) FROM f
  UNION ALL SELECT 'H6C-A05 helpers seguem SECURITY DEFINER',
         bool_and(prosecdef) FROM f
  UNION ALL SELECT 'H6C-A06 search_path explicito nos helpers',
         bool_and(cfg ILIKE '%search_path=public%') FROM f
  UNION ALL SELECT 'H6C-A07 as 3 funcoes existem',
         (SELECT count(*) = 3 FROM f)
  UNION ALL SELECT 'H6C-A08 fluxo canonico intacto (guard chamado pelo gerador de AR)',
         (SELECT prosrc ILIKE '%fn_entrega_guard_faturamento_v1%'
            FROM pg_proc WHERE proname = 'fn_generate_receivable_from_entrega' LIMIT 1)
  UNION ALL SELECT 'H6C-A09 gerador de AR e SECURITY DEFINER com search_path',
         (SELECT prosecdef AND coalesce(array_to_string(proconfig,','),'') ILIKE '%search_path%'
            FROM pg_proc WHERE proname = 'fn_generate_receivable_from_entrega' LIMIT 1)
  UNION ALL SELECT 'H6C-A10 helpers pertencem ao owner definer (postgres)',
         (SELECT bool_and(r.rolname = 'postgres') FROM f JOIN pg_proc p ON p.oid = f.oid
            JOIN pg_roles r ON r.oid = p.proowner)
  UNION ALL SELECT 'H6C-A11 idempotencia H6b preservada',
         (SELECT prosrc ILIKE '%FIN_IDEMPOTENCY_CONFLICT%'
            FROM pg_proc WHERE proname = 'rpc_register_receivable_payment' LIMIT 1)
  UNION ALL SELECT 'H6C-A12 valor faturavel canonico preservado',
         (SELECT prosrc ILIKE '%valor_faturavel%'
            FROM pg_proc WHERE proname = 'fn_generate_receivable_from_entrega' LIMIT 1)
)
SELECT gate, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS status FROM t ORDER BY gate;
