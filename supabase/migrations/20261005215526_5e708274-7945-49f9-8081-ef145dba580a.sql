-- D51.5 P1 Fiscal — tenant isolation and least privilege.
-- Canonical target: swzpzcwiasxmjutrmvkm. No data mutation/backfill.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.fiscal_environment_marker
    WHERE project_ref = 'swzpzcwiasxmjutrmvkm'
      AND production_emission_allowed IS FALSE
  ) THEN
    RAISE EXCEPTION 'D51_5_P1_CANONICAL_GATE';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.h15_user_organization(p_user uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT p.organization_id
  FROM public.profiles p
  JOIN public.organizations o ON o.id = p.organization_id AND o.ativo IS TRUE
  WHERE p.user_id = p_user AND p.ativo IS TRUE;
$$;
REVOKE ALL ON FUNCTION public.h15_user_organization(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.h15_user_organization(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.h15_service_actor_invoice_access(p_actor uuid, p_invoice uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT p_actor IS NOT NULL
    AND public.h15_user_organization(p_actor) IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.fiscal_invoices i
      JOIN public.company_fiscal_settings c ON c.id = i.company_settings_id
      WHERE i.id = p_invoice
        AND i.organization_id = public.h15_user_organization(p_actor)
        AND c.organization_id = public.h15_user_organization(p_actor)
        AND c.is_active IS TRUE
    );
$$;
REVOKE ALL ON FUNCTION public.h15_service_actor_invoice_access(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.h15_service_actor_invoice_access(uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.h15_service_actor_run_access(p_actor uuid, p_run uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.fiscal_xml_runs r
    WHERE r.id = p_run
      AND public.h15_service_actor_invoice_access(p_actor, r.fiscal_invoice_id)
  );
$$;
REVOKE ALL ON FUNCTION public.h15_service_actor_run_access(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.h15_service_actor_run_access(uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.h15_service_actor_event_access(p_actor uuid, p_event uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.fiscal_events e
    WHERE e.id = p_event
      AND e.organization_id = public.h15_user_organization(p_actor)
      AND public.h15_service_actor_invoice_access(p_actor, e.fiscal_invoice_id)
  );
$$;
REVOKE ALL ON FUNCTION public.h15_service_actor_event_access(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.h15_service_actor_event_access(uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.h15_service_actor_company_access(p_actor uuid, p_company uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT p_actor IS NOT NULL
    AND public.h15_user_organization(p_actor) IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.company_fiscal_settings c
      WHERE c.id = p_company
        AND c.organization_id = public.h15_user_organization(p_actor)
        AND c.is_active IS TRUE
    );
$$;
REVOKE ALL ON FUNCTION public.h15_service_actor_company_access(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.h15_service_actor_company_access(uuid,uuid) TO service_role;

-- ACCESS_MAP parity: gestor reads fiscal documents but cannot mutate them.
ALTER POLICY fi_staff_insert ON public.fiscal_invoices
WITH CHECK (
  (public.has_role(auth.uid(), 'administrador'::public.app_role)
   OR public.has_role(auth.uid(), 'financeiro'::public.app_role))
  AND public.h15_company_access(company_settings_id)
  AND organization_id = public.h15_actor_organization()
);
ALTER POLICY fi_staff_update ON public.fiscal_invoices
USING (
  (public.has_role(auth.uid(), 'administrador'::public.app_role)
   OR public.has_role(auth.uid(), 'financeiro'::public.app_role))
  AND public.h15_company_access(company_settings_id)
  AND organization_id = public.h15_actor_organization()
)
WITH CHECK (
  (public.has_role(auth.uid(), 'administrador'::public.app_role)
   OR public.has_role(auth.uid(), 'financeiro'::public.app_role))
  AND public.h15_company_access(company_settings_id)
  AND organization_id = public.h15_actor_organization()
);

-- Customer fiscal profiles inherit deterministic tenant ownership from clientes.
ALTER POLICY customer_fiscal_profiles_read ON public.customer_fiscal_profiles
USING (
  (public.has_role(auth.uid(), 'administrador'::public.app_role)
   OR public.has_role(auth.uid(), 'gestor'::public.app_role)
   OR public.has_role(auth.uid(), 'financeiro'::public.app_role))
  AND EXISTS (
    SELECT 1 FROM public.clientes c
    WHERE c.id = customer_id
      AND c.organization_id = public.h15_actor_organization()
  )
);
ALTER POLICY customer_fiscal_profiles_insert ON public.customer_fiscal_profiles
WITH CHECK (
  (public.has_role(auth.uid(), 'administrador'::public.app_role)
   OR public.has_role(auth.uid(), 'financeiro'::public.app_role))
  AND EXISTS (
    SELECT 1 FROM public.clientes c
    WHERE c.id = customer_id
      AND c.organization_id = public.h15_actor_organization()
  )
);
ALTER POLICY customer_fiscal_profiles_update ON public.customer_fiscal_profiles
USING (
  (public.has_role(auth.uid(), 'administrador'::public.app_role)
   OR public.has_role(auth.uid(), 'financeiro'::public.app_role))
  AND EXISTS (
    SELECT 1 FROM public.clientes c
    WHERE c.id = customer_id
      AND c.organization_id = public.h15_actor_organization()
  )
)
WITH CHECK (
  (public.has_role(auth.uid(), 'administrador'::public.app_role)
   OR public.has_role(auth.uid(), 'financeiro'::public.app_role))
  AND EXISTS (
    SELECT 1 FROM public.clientes c
    WHERE c.id = customer_id
      AND c.organization_id = public.h15_actor_organization()
  )
);

-- Product/service fiscal profiles are global catalog metadata. Tenant users may
-- read them according to ACCESS_MAP; only Platform Superadmin may mutate them.
ALTER POLICY product_fiscal_profiles_insert ON public.product_fiscal_profiles
WITH CHECK (public.is_platform_superadmin(auth.uid()));
ALTER POLICY product_fiscal_profiles_update ON public.product_fiscal_profiles
USING (public.is_platform_superadmin(auth.uid()))
WITH CHECK (public.is_platform_superadmin(auth.uid()));
ALTER POLICY service_fiscal_profiles_insert ON public.service_fiscal_profiles
WITH CHECK (public.is_platform_superadmin(auth.uid()));
ALTER POLICY service_fiscal_profiles_update ON public.service_fiscal_profiles
USING (public.is_platform_superadmin(auth.uid()))
WITH CHECK (public.is_platform_superadmin(auth.uid()));

CREATE OR REPLACE FUNCTION public.h15_fiscal_audit_access(p_table text, p_record uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF public.h15_actor_organization() IS NULL OR p_record IS NULL THEN RETURN false; END IF;
  RETURN CASE p_table
    WHEN 'company_fiscal_settings' THEN public.h15_company_access(p_record)
    WHEN 'fiscal_invoices' THEN public.h15_invoice_access(p_record)
    WHEN 'fiscal_events' THEN EXISTS (SELECT 1 FROM public.fiscal_events e WHERE e.id=p_record AND public.h15_invoice_access(e.fiscal_invoice_id))
    WHEN 'fiscal_xml_runs' THEN EXISTS (SELECT 1 FROM public.fiscal_xml_runs r WHERE r.id=p_record AND public.h15_invoice_access(r.fiscal_invoice_id))
    WHEN 'fiscal_sefaz_transmissions' THEN EXISTS (SELECT 1 FROM public.fiscal_sefaz_transmissions t WHERE t.id=p_record AND public.h15_invoice_access(t.fiscal_invoice_id))
    WHEN 'fiscal_protocoled_documents' THEN EXISTS (SELECT 1 FROM public.fiscal_protocoled_documents d WHERE d.id=p_record AND public.h15_invoice_access(d.fiscal_invoice_id))
    WHEN 'fiscal_certificates' THEN EXISTS (SELECT 1 FROM public.fiscal_certificates c WHERE c.id=p_record AND public.h15_company_access(c.company_settings_id))
    ELSE false
  END;
END;
$$;
REVOKE ALL ON FUNCTION public.h15_fiscal_audit_access(text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.h15_fiscal_audit_access(text,uuid) TO authenticated, service_role;

ALTER POLICY fiscal_audit_log_read ON public.fiscal_audit_log
USING (
  public.has_role(auth.uid(), 'administrador'::public.app_role)
  AND public.h15_fiscal_audit_access(table_name, record_id)
);

COMMENT ON FUNCTION public.h15_service_actor_invoice_access(uuid,uuid) IS 'D51.5 P1: service-only tenant proof for fiscal Edge Functions after JWT validation.';
COMMENT ON FUNCTION public.h15_service_actor_run_access(uuid,uuid) IS 'D51.5 P1: service-only XML run ownership proof.';
COMMENT ON FUNCTION public.h15_service_actor_event_access(uuid,uuid) IS 'D51.5 P1: service-only fiscal event ownership proof.';
COMMENT ON FUNCTION public.h15_service_actor_company_access(uuid,uuid) IS 'D51.5 P1: service-only company ownership proof.';