-- SELECT-only; independently verify canonical swzpzcwiasxmjutrmvkm before use.
WITH expected(signature,hash) AS (VALUES
('public.get_portal_cliente_b2b_order_detail_secure(uuid)','1de99ff32844e8c30a6de840af9d03ff'),
('public.get_portal_cliente_b2b_orders_secure(uuid)','d0e324854da714698a56fa0a225a96e0'),
('public.get_portal_cliente_b2b_simulation_detail_secure(uuid)','eedda29f646341e6396c3685caf2e2e0'),
('public.get_portal_cliente_b2b_simulations_secure(uuid)','5da67a351d34d6f1711de7c905d2c43a'))
SELECT signature,1/CASE WHEN md5(pg_get_functiondef(p.oid))=e.hash AND p.prosecdef AND p.proowner='postgres'::regrole AND has_function_privilege('authenticated',p.oid,'EXECUTE') AND NOT has_function_privilege('anon',p.oid,'EXECUTE') THEN 1 ELSE 0 END baseline_exact FROM expected e LEFT JOIN pg_proc p ON p.oid=to_regprocedure(e.signature);
SELECT 1/CASE WHEN to_regprocedure('platform_private.producer_commercial_client_scope(uuid)') IS NULL THEN 1 ELSE 0 END helper_absent;
