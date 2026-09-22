BEGIN;

-- Fase Superadmin — Home provisória de plataforma.
-- Libera SOMENTE leitura das tabelas SaaS ao papel de plataforma 'superadmin'.
-- Até esta migration, a única policy de leitura era 'saas_admin_read' (administrador).
-- Nenhuma policy de INSERT/UPDATE/DELETE é criada: escrita continua exclusiva
-- de service_role / rotinas SECURITY DEFINER.

DO $$
DECLARE
  t text;
  v_tables text[] := ARRAY[
    'saas_modules','saas_features','saas_plans','saas_plan_features',
    'organization_subscriptions','organization_subscription_history'
  ];
BEGIN
  FOREACH t IN ARRAY v_tables LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = t
        AND p.polname = 'saas_platform_read'
    ) THEN
      EXECUTE format(
        'CREATE POLICY saas_platform_read ON public.%I FOR SELECT TO authenticated '
        'USING (public.is_platform_superadmin((SELECT auth.uid())))',
        t
      );
    END IF;
  END LOOP;
END $$;

-- Validação final fail-closed: as 6 tabelas precisam ter as duas policies de
-- leitura (administrador e superadmin) e nenhuma policy de escrita nova.
DO $$
DECLARE
  v_missing int;
  v_write_policies int;
BEGIN
  SELECT count(*) INTO v_missing
  FROM (
    SELECT unnest(ARRAY[
      'saas_modules','saas_features','saas_plans','saas_plan_features',
      'organization_subscriptions','organization_subscription_history'
    ]) AS t
  ) tabs
  WHERE NOT EXISTS (
    SELECT 1
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = tabs.t
      AND p.polname IN ('saas_admin_read','saas_platform_read')
    GROUP BY c.oid
    HAVING count(DISTINCT p.polname) = 2
  );

  IF v_missing > 0 THEN
    RAISE EXCEPTION 'SUPERADMIN_HOME_VALIDACAO_FALHOU: % tabela(s) sem policies de leitura completas', v_missing;
  END IF;

  -- Garantia estrutural: nenhuma policy de escrita pode existir nessas tabelas.
  SELECT count(*) INTO v_write_policies
  FROM pg_policy p
  JOIN pg_class c ON c.oid = p.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname IN (
      'saas_modules','saas_features','saas_plans','saas_plan_features',
      'organization_subscriptions','organization_subscription_history'
    )
    AND p.polcmd IN ('I','U','D','A');

  IF v_write_policies > 0 THEN
    RAISE EXCEPTION 'SUPERADMIN_HOME_VALIDACAO_FALHOU: policy de escrita inesperada nas tabelas SaaS';
  END IF;
END $$;

COMMIT;