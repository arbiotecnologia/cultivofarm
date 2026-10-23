-- READ ONLY. Abortar se ref != swzpzcwiasxmjutrmvkm.
BEGIN READ ONLY;
SELECT n.nspname||'.'||p.proname AS fn, md5(pg_get_functiondef(p.oid)) AS h,
       array_to_string(p.proacl, ',') AS acl, p.prosecdef
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE (n.nspname, p.proname) IN (('public','generate_b2b_receivable_secure_impl'),
   ('platform_private','b2b_commercial_partner_projection'),('public','create_partner_order_secure'),
   ('public','simulate_b2b_payment_plan_secure'),('platform_private','assert_b2b_partner_scope'),
   ('public','approve_partner_order'),('public','cancel_b2b_receivable_secure'));
-- Esperado: impl 60be0fb3…, projection 136b4d59…; cancel_b2b_receivable_secure fechado
-- (B2B_FINANCIAL_CONTRACT_UNAVAILABLE). Clientes comerciais com tenant ambíguo:
SELECT pa.id, (SELECT count(*) FROM organizations o WHERE o.partner_account_id = pa.id) AS own_org,
       pa.commercial_owner_organization_id IS NOT NULL AS has_owner
  FROM partner_accounts pa
 WHERE pa.commercial_owner_organization_id IS NOT NULL
   AND (SELECT count(*) FROM organizations o WHERE o.partner_account_id = pa.id) > 0;  -- deve ser vazio ou revisado
-- Títulos B2B já existentes por cliente comercial (não devem duplicar):
SELECT count(*) FROM partner_order_financial_links l JOIN partner_accounts pa ON pa.id = l.partner_id
 WHERE pa.commercial_owner_organization_id IS NOT NULL;
ROLLBACK;
