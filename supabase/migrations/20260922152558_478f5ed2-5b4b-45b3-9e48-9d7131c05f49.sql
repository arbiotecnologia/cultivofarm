BEGIN;

-- ============================================================================
-- GATE S0→S1 — Hardening mínimo de autorização (sem alteração de dados)
-- Alvo: Supabase canônico CultivoFarm. Transacional e reversível.
-- ============================================================================

-- 1) Rotinas internas não devem ser chamáveis diretamente por sessões de cliente.
--    `insert_partner_catalog_access_log_internal` não valida auth.uid(): exposta a
--    `authenticated` permitiria forjar registros de auditoria B2B com user_id/partner_id
--    arbitrários. O wrapper seguro `log_partner_catalog_access_secure` (SECURITY DEFINER,
--    valida auth.uid() e papel) e `assign_b2b_user_client_secure` continuam chamando-a
--    normalmente, pois executam como owner.
DO $$
BEGIN
  IF to_regprocedure('public.insert_partner_catalog_access_log_internal(text,uuid,uuid,uuid,uuid,uuid,uuid,jsonb)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.insert_partner_catalog_access_log_internal(text,uuid,uuid,uuid,uuid,uuid,uuid,jsonb)
      FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.insert_partner_catalog_access_log_internal(text,uuid,uuid,uuid,uuid,uuid,uuid,jsonb)
      TO service_role;
  END IF;
END $$;

-- 2) `rpc_create_operational_notification_secure` já falha para quem não é service_role,
--    mas o EXECUTE concedido a `authenticated` divergia da intenção documentada
--    (REVOKE ALL ... FROM PUBLIC, anon, authenticated). Restaura o contrato.
DO $$
BEGIN
  IF to_regprocedure('public.rpc_create_operational_notification_secure(uuid,text,text,text,text)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.rpc_create_operational_notification_secure(uuid,text,text,text,text)
      FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_create_operational_notification_secure(uuid,text,text,text,text)
      TO service_role;
  END IF;
END $$;

-- 3) Defesa em profundidade no `profiles`: as policies de UPDATE não tinham WITH CHECK.
--    A trigger `guard_profile_sensitive_fields` já bloqueia alteração de
--    user_id/cliente_id/organization_id/ativo por não-admin, e
--    `h15_profile_organization_guard` bloqueia organization_id. O WITH CHECK adiciona
--    a barreira na própria policy, sem alterar nenhum fluxo legítimo.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname='public' AND c.relname='profiles' AND p.polname='Users can update own profile'
  ) THEN
    EXECUTE $q$
      ALTER POLICY "Users can update own profile" ON public.profiles
        USING ((SELECT auth.uid()) = user_id)
        WITH CHECK ((SELECT auth.uid()) = user_id)
    $q$;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname='public' AND c.relname='profiles' AND p.polname='Admins can update all profiles'
  ) THEN
    EXECUTE $q$
      ALTER POLICY "Admins can update all profiles" ON public.profiles
        USING (public.has_role((SELECT auth.uid()), 'administrador'::public.app_role))
        WITH CHECK (public.has_role((SELECT auth.uid()), 'administrador'::public.app_role))
    $q$;
  END IF;
END $$;

-- 4) Validação pós-aplicação — falha fechada se qualquer item não ficar como esperado.
DO $$
DECLARE v_fail text := '';
BEGIN
  IF has_function_privilege('authenticated',
      'public.insert_partner_catalog_access_log_internal(text,uuid,uuid,uuid,uuid,uuid,uuid,jsonb)'::regprocedure, 'EXECUTE') THEN
    v_fail := v_fail || 'insert_partner_catalog_access_log_internal ainda executável por authenticated; ';
  END IF;
  IF has_function_privilege('authenticated',
      'public.rpc_create_operational_notification_secure(uuid,text,text,text,text)'::regprocedure, 'EXECUTE') THEN
    v_fail := v_fail || 'rpc_create_operational_notification_secure ainda executável por authenticated; ';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname='profiles'
      AND p.polname IN ('Users can update own profile','Admins can update all profiles')
      AND p.polwithcheck IS NULL
  ) THEN
    v_fail := v_fail || 'policy de UPDATE em profiles sem WITH CHECK; ';
  END IF;
  IF v_fail <> '' THEN
    RAISE EXCEPTION 'GATE_S0_S1_VALIDACAO_FALHOU: %', v_fail;
  END IF;
END $$;

COMMIT;