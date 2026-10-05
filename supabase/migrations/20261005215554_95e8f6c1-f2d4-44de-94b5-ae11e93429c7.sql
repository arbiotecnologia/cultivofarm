CREATE OR REPLACE FUNCTION public.h15_fiscal_audit_access(p_table text, p_record uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
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