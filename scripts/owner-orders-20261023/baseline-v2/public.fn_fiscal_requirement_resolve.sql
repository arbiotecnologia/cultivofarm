CREATE OR REPLACE FUNCTION public.fn_fiscal_requirement_resolve(p_sales_channel text, p_operation_type text, p_uf text, p_scope_type text DEFAULT NULL::text, p_scope_id uuid DEFAULT NULL::uuid, p_ref_date date DEFAULT CURRENT_DATE)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_ex record; v_pol record;
BEGIN
  IF p_scope_type IS NOT NULL AND p_scope_id IS NOT NULL THEN
    SELECT * INTO v_ex FROM public.fiscal_requirement_exemptions
     WHERE active AND scope_type = p_scope_type AND scope_id = p_scope_id LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object('required', false, 'status','EXEMPT', 'source','exemption',
        'exemption_id', v_ex.id, 'motivo', v_ex.motivo, 'approved_by', v_ex.approved_by);
    END IF;
  END IF;

  SELECT * INTO v_pol FROM public.fiscal_operation_policies
   WHERE active AND sales_channel = p_sales_channel AND operation_type = p_operation_type
     AND (uf IS NULL OR uf = p_uf)
     AND valid_from <= p_ref_date AND (valid_until IS NULL OR valid_until >= p_ref_date)
   ORDER BY (uf IS NOT NULL) DESC, valid_from DESC LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object('required', v_pol.requires_invoice,
      'status', CASE WHEN v_pol.requires_invoice THEN 'PENDING' ELSE 'NOT_REQUIRED' END,
      'source','policy','policy_id', v_pol.id, 'document_model', v_pol.document_model);
  END IF;

  -- Fail-closed: nunca assume NOT_REQUIRED em silêncio
  RETURN jsonb_build_object('required', true, 'status','PENDING_PARAMETRIZATION',
    'source','pending_parametrization', 'policy_id', NULL,
    'motivo','Nenhuma política fiscal cadastrada para o canal/operação/UF — parametrização contábil pendente');
END $function$
