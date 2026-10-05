DO $audit$
DECLARE
  v_a record;
  v_b record;
  v_count integer;
  v_client_b uuid;
BEGIN
  SELECT p.user_id, p.organization_id
    INTO v_a
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.user_id
   WHERE p.ativo IS TRUE
     AND p.organization_id IS NOT NULL
     AND ur.role = 'administrador'
   ORDER BY p.created_at
   LIMIT 1;

  SELECT p.user_id, p.organization_id
    INTO v_b
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.user_id
   WHERE p.ativo IS TRUE
     AND p.organization_id IS NOT NULL
     AND p.organization_id <> v_a.organization_id
     AND ur.role = 'administrador'
   ORDER BY p.created_at
   LIMIT 1;

  IF v_a.user_id IS NULL OR v_b.user_id IS NULL THEN
    RAISE EXCEPTION 'P0A_AB_FIXTURE_UNAVAILABLE';
  END IF;

  SELECT id INTO v_client_b FROM public.clientes WHERE organization_id = v_b.organization_id LIMIT 1;

  PERFORM set_config('request.jwt.claim.sub', v_a.user_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  SELECT count(*) INTO v_count FROM public.financial_receipts WHERE organization_id = v_b.organization_id;
  IF v_count <> 0 THEN RAISE EXCEPTION 'P0A_RECEIPTS_CROSS_TENANT_READ:%', v_count; END IF;

  SELECT count(*) INTO v_count FROM public.accounts_receivable WHERE organization_id = v_b.organization_id;
  IF v_count <> 0 THEN RAISE EXCEPTION 'P0A_AR_CROSS_TENANT_READ:%', v_count; END IF;

  SELECT count(*) INTO v_count FROM public.accounts_payable WHERE organization_id = v_b.organization_id;
  IF v_count <> 0 THEN RAISE EXCEPTION 'P0A_AP_CROSS_TENANT_READ:%', v_count; END IF;

  SELECT count(*) INTO v_count FROM public.financial_report_exports WHERE organization_id = v_b.organization_id;
  IF v_count <> 0 THEN RAISE EXCEPTION 'P0A_EXPORT_CROSS_TENANT_READ:%', v_count; END IF;

  SELECT count(*) INTO v_count
    FROM public.cliente_documentos cd
    JOIN public.clientes c ON c.id = cd.cliente_id
   WHERE c.organization_id = v_b.organization_id;
  IF v_count <> 0 THEN RAISE EXCEPTION 'P0A_CLIENT_DOC_CROSS_TENANT_READ:%', v_count; END IF;

  SELECT count(*) INTO v_count
    FROM storage.objects
   WHERE bucket_id IN ('financial-reports','financial-receipts')
     AND (storage.foldername(name))[1] = v_b.organization_id::text;
  IF v_count <> 0 THEN RAISE EXCEPTION 'P0A_FINANCIAL_STORAGE_CROSS_TENANT_READ:%', v_count; END IF;

  IF public.financial_storage_object_permitted('financial-reports', v_b.organization_id::text || '/forged/report.pdf') THEN
    RAISE EXCEPTION 'P0A_REPORT_FORGED_PATH_ALLOWED';
  END IF;
  IF public.financial_storage_object_permitted('financial-receipts', v_b.organization_id::text || '/2026/forged.pdf') THEN
    RAISE EXCEPTION 'P0A_RECEIPT_FORGED_PATH_ALLOWED';
  END IF;
  IF v_client_b IS NOT NULL AND public.cliente_storage_object_permitted(v_b.organization_id::text || '/clientes/' || v_client_b::text || '/forged.pdf') THEN
    RAISE EXCEPTION 'P0A_CLIENT_FORGED_PATH_ALLOWED';
  END IF;

  EXECUTE 'RESET ROLE';
END
$audit$;