-- Object rollback only; intentionally does NOT restore excessive authenticated record privilege.
BEGIN;
CREATE OR REPLACE FUNCTION public.rpc_fiscal_tax_preview_v1(p_invoice_id uuid, p_items jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  inv public.fiscal_invoices%ROWTYPE;
  emit public.company_fiscal_settings%ROWTYPE;
  dest public.customer_fiscal_profiles%ROWTYPE;
  it record; ov jsonb; rule public.fiscal_tax_rules%ROWTYPE;
  ctx jsonb; res jsonb; item_taxes jsonb; out_items jsonb := '[]'::jsonb;
  ref_date date; kinds text[]; k text;
  v_prod numeric; v_icms_own numeric; v_ipi numeric; v_base_st numeric; v_st_val numeric;
  v_inputs jsonb; v_manual text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.fn_fiscal_can_operate() THEN
    RAISE EXCEPTION 'FISCAL_FORBIDDEN: perfil sem permissao para simular tributos.' USING ERRCODE = '42501';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'items_array_required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO inv FROM public.fiscal_invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'FISCAL_INVOICE_NOT_FOUND: %', p_invoice_id; END IF;
  IF inv.status <> 'DRAFT' THEN
    RAISE EXCEPTION 'FISCAL_INVOICE_NOT_DRAFT: preview disponivel apenas em rascunho (status=%)', inv.status;
  END IF;

  SELECT * INTO emit FROM public.company_fiscal_settings WHERE is_active ORDER BY updated_at DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'FISCAL_EMITTER_NOT_CONFIGURED: emitente nao cadastrado.'; END IF;
  IF coalesce(emit.nfe_environment_code,'2') = '1' THEN
    RAISE EXCEPTION 'FISCAL_PRODUCTION_BLOCKED: ambiente de producao bloqueado.';
  END IF;

  SELECT * INTO dest FROM public.customer_fiscal_profiles WHERE customer_id = inv.customer_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'FISCAL_RECIPIENT_PROFILE_MISSING: perfil fiscal do destinatario nao cadastrado.'; END IF;

  ref_date := coalesce(inv.issue_date, current_date);

  FOR it IN SELECT * FROM public.fiscal_invoice_items WHERE fiscal_invoice_id = p_invoice_id ORDER BY item_sequence
  LOOP
    SELECT e INTO ov FROM jsonb_array_elements(p_items) e
     WHERE (e->>'item_sequence')::int = it.item_sequence LIMIT 1;

    v_inputs := coalesce(ov->'tax_input_snapshot', it.tax_input_snapshot, '{}'::jsonb);
    IF NOT public.fn_fiscal_tax_input_valid(v_inputs) THEN
      RAISE EXCEPTION 'tax_input_snapshot_invalid:%', it.item_sequence USING ERRCODE = '22023';
    END IF;

    v_prod := public.fn_fiscal_round(coalesce(
      nullif(ov->>'gross_value','')::numeric,
      it.gross_value, it.quantity * it.unit_value));

    -- FASE C3/C4: encargos vem SEMPRE dos valores canonicos ja rateados pelo
    -- servidor no rascunho; o cliente nao e autoridade de rateio.
    res := public.fn_fiscal_compute_item_taxes_v1(
      emit, dest, coalesce(inv.direction,'OUT'), inv.sales_channel, ref_date, it.ncm_snapshot,
      v_prod,
      public.fn_fiscal_round(coalesce(nullif(ov->>'discount_value','')::numeric, it.discount_value, 0)),
      public.fn_fiscal_round(coalesce(it.freight_value,0)),
      public.fn_fiscal_round(coalesce(it.insurance_value,0)),
      public.fn_fiscal_round(coalesce(it.other_value,0)),
      v_inputs, auth.uid());
    item_taxes := res->'taxes';

    out_items := out_items || jsonb_build_object(
      'itemSequence', it.item_sequence,
      'description', it.description,
      'taxOrder', res->'taxOrder',
      'policy', res->'policy',
      'chained', res->'chained',
      'itemTotals', res->'itemTotals',
      'components', jsonb_build_object(
        'produto', v_prod,
        'desconto', public.fn_fiscal_round(coalesce(nullif(ov->>'discount_value','')::numeric, it.discount_value, 0)),
        'frete', public.fn_fiscal_round(coalesce(it.freight_value,0)),
        'seguro', public.fn_fiscal_round(coalesce(it.insurance_value,0)),
        'outras', public.fn_fiscal_round(coalesce(it.other_value,0))),
      'taxes', item_taxes);
  END LOOP;

  RETURN jsonb_build_object(
    'engineVersion','F3.4',
    'preview', true,
    'persisted', false,
    'items', out_items);
END $function$
;
COMMIT;
