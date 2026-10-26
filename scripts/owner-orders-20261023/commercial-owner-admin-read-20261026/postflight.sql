-- POST — READ ONLY com ASSERTS exatos: schema, assinatura, owner, prosecdef,
-- search_path, ACL (incluindo ausência de PUBLIC/anon), md5 dos corpos e policies.
-- v3 (revisão SQL 5db): hashes REAIS dos corpos (sem placeholders) — core
-- 7a17fba499d92f00913fc25e4384c3a8, wrapper f0e65bc2546eea58ad5f5510a8a4cc12,
-- confirmados na prova descartável completa (pre→apply→post→rollback).
-- Qualquer divergência aborta => executar rollback guardado.
BEGIN TRANSACTION READ ONLY;

DO $$
DECLARE
  r_core record; r_wrap record;
BEGIN
  SELECT p.prosecdef, r.rolname AS owner, p.proacl::text AS acl, md5(p.prosrc) AS md5,
         p.proconfig AS config, pg_get_function_identity_arguments(p.oid) AS args
    INTO r_core
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace JOIN pg_roles r ON r.oid = p.proowner
   WHERE n.nspname = 'platform_private' AND p.proname = 'c2_commercial_owner_orders_core';
  SELECT p.prosecdef, r.rolname AS owner, p.proacl::text AS acl, md5(p.prosrc) AS md5,
         p.proconfig AS config, pg_get_function_identity_arguments(p.oid) AS args
    INTO r_wrap
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace JOIN pg_roles r ON r.oid = p.proowner
   WHERE n.nspname = 'public' AND p.proname = 'c2_commercial_owner_orders_projection';

  IF r_core IS NULL OR r_wrap IS NULL THEN
    RAISE EXCEPTION 'postflight_failed: função ausente';
  END IF;
  IF r_core.args IS DISTINCT FROM 'p_status text, p_partner_id uuid, p_start timestamp with time zone, p_end timestamp with time zone'
     OR r_wrap.args IS DISTINCT FROM r_core.args THEN
    RAISE EXCEPTION 'postflight_failed: assinatura divergente';
  END IF;
  IF r_core.owner IS DISTINCT FROM 'postgres' OR r_wrap.owner IS DISTINCT FROM 'postgres'
     OR r_core.prosecdef IS DISTINCT FROM true OR r_wrap.prosecdef IS DISTINCT FROM false
     OR r_core.config IS DISTINCT FROM ARRAY['search_path=""']::text[] OR r_wrap.config IS DISTINCT FROM ARRAY['search_path=""']::text[]
     OR r_core.acl IS DISTINCT FROM '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'
     OR r_wrap.acl IS DISTINCT FROM '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'
     OR r_core.acl LIKE '%anon%' OR r_wrap.acl LIKE '%anon%' THEN
    RAISE EXCEPTION 'postflight_failed: owner/prosecdef/search_path/ACL divergente';
  END IF;
  IF r_core.md5 IS DISTINCT FROM '7a17fba499d92f00913fc25e4384c3a8'
     OR r_wrap.md5 IS DISTINCT FROM 'f0e65bc2546eea58ad5f5510a8a4cc12' THEN
    RAISE EXCEPTION 'postflight_failed: corpo divergente do candidato (core=% wrapper=%)', r_core.md5, r_wrap.md5;
  END IF;

  -- Policies de partner_orders inalteradas (mesmos pins do preflight).
  IF NOT EXISTS (
    SELECT 1 FROM (
      SELECT pol.polname, pol.polpermissive,
             md5(coalesce(pg_get_expr(pol.polqual, pol.polrelid), '')) AS qm,
             md5(coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '')) AS cm
        FROM pg_policy pol
        JOIN pg_class c ON c.oid = pol.polrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relname = 'partner_orders'
    ) p
    GROUP BY ()
    HAVING count(*) = 5
       AND bool_and((polname, polpermissive, qm, cm) IN (
         ('Financeiro read partner_orders', true,  '2385c066775325c700f3e91bfe87b56c', 'd41d8cd98f00b204e9800998ecf8427e'),
         ('b2b_phase1_tenant_guard',        false, '8a5bbe26384a3d58c5383afc7babf9bc', '8a5bbe26384a3d58c5383afc7babf9bc'),
         ('partner_orders_insert',          true,  'd41d8cd98f00b204e9800998ecf8427e', 'ee2eb83861da3e7933f95335e6c6dde0'),
         ('partner_orders_select',          true,  '214c9f49dc14046e5ef64a96e8244e05', 'd41d8cd98f00b204e9800998ecf8427e'),
         ('partner_orders_update',          true,  'ee2eb83861da3e7933f95335e6c6dde0', 'ee2eb83861da3e7933f95335e6c6dde0')
       ))
  ) THEN
    RAISE EXCEPTION 'postflight_failed: policies de partner_orders alteradas';
  END IF;
END;
$$;

ROLLBACK;
