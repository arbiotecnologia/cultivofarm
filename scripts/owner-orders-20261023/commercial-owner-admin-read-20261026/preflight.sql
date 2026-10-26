-- PRE — READ ONLY com ASSERTS transacionais: qualquer divergência aborta (NO-GO).
-- v3 (revisão SQL 5db): unicidade de profiles.user_id verificada por NOME de coluna
-- (pg_attribute), exigindo índice válido/pronto, NÃO parcial (indpred NULL) e chave
-- única de exatamente uma coluna — a checagem anterior (indkey='1') olhava a coluna
-- física nº 1 e aceitava índice parcial/inválido.
BEGIN TRANSACTION READ ONLY;

-- 1) Alvos ausentes (nunca reaplicar/sobrescrever).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public' AND p.proname = 'c2_commercial_owner_orders_projection')
     OR EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                WHERE n.nspname = 'platform_private' AND p.proname = 'c2_commercial_owner_orders_core') THEN
    RAISE EXCEPTION 'preflight_failed: função alvo já existe';
  END IF;
END;
$$;

-- 2) Dependências pinadas: has_role (corpo + ACL), unicidade exata de profiles.user_id.
DO $$
DECLARE v_md5 text; v_acl text;
BEGIN
  SELECT md5(p.prosrc), p.proacl::text INTO v_md5, v_acl
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'platform_private' AND p.proname = 'has_role';
  IF v_md5 IS DISTINCT FROM '05f82a3d57ca71ca6d966fd6c7cf1a1b'
     OR v_acl IS DISTINCT FROM '{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}' THEN
    RAISE EXCEPTION 'preflight_failed: dependência platform_private.has_role divergente (md5=% acl=%)', v_md5, v_acl;
  END IF;
  -- Índice único EXATO sobre a coluna user_id: válido, pronto, não parcial,
  -- chave de uma única coluna real (não expressão), identificada por attname.
  IF NOT EXISTS (
    SELECT 1
      FROM pg_index i
      JOIN pg_class c ON c.oid = i.indrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'profiles'
       AND i.indisunique AND i.indisvalid AND i.indisready
       AND i.indpred IS NULL
       AND i.indnkeyatts = 1 AND i.indnatts = 1
       AND i.indkey[0] <> 0
       AND (SELECT a.attname FROM pg_attribute a
             WHERE a.attrelid = i.indrelid AND a.attnum = i.indkey[0]) = 'user_id'
  ) THEN
    RAISE EXCEPTION 'preflight_failed: profiles.user_id sem índice único exato, válido e não parcial';
  END IF;
END;
$$;

-- 3) Policies de partner_orders pinadas (nomes, permissividade, hashes qual/with_check).
DO $$
BEGIN
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
    RAISE EXCEPTION 'preflight_failed: policies de partner_orders divergem do baseline pinado';
  END IF;
END;
$$;

ROLLBACK;
