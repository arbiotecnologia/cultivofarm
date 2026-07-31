DO $guard$
DECLARE v_ref text;
BEGIN
  SELECT project_ref INTO v_ref FROM public._fiscal_staging_marker WHERE marker='STAGING' LIMIT 1;
  IF v_ref IS NULL OR v_ref <> 'ikaauvsflpmamgxmkhoq' THEN
    RAISE EXCEPTION 'STAGING_GUARD: ambiente nao autorizado (%)', COALESCE(v_ref,'null');
  END IF;
END $guard$;

DO $run$
DECLARE
  c_admin uuid := 'b5c2ebd4-7cdf-4647-a585-6ec49f1b583a';
  c_partner uuid := '6f22d1dc-2862-4fdf-a334-cd010de06bb1';
  v_run uuid := gen_random_uuid();
  v_plans jsonb := jsonb_build_array(
    jsonb_build_object('code','HML-B2B-A','id','dd43b9b9-b908-498c-a8ac-483b39be75ec'),
    jsonb_build_object('code','HML-B2B-B','id','72b868c7-91ae-445d-b950-8e68912a515d'),
    jsonb_build_object('code','HML-B2B-C','id','5f61bf67-3aa9-4be3-98cd-f6bdc68fda10'),
    jsonb_build_object('code','HML-B2B-D','id','854bec81-20dd-48ca-a988-12c464685e10'));
  v_p jsonb; v_plan record; v_items jsonb; v_cart jsonb; v_final numeric; v_hash text;
  v_res jsonb; v_order uuid; v_ar record; v_mock1 jsonb; v_mock2 jsonb;
  v_det jsonb; v_pass boolean; v_scn text; v_gen jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', c_admin, 'role','authenticated')::text, true);

  v_items := jsonb_build_array(
    jsonb_build_object('item_tipo','produto','item_id','a98e991c-89f4-49aa-a2d6-f93cd595027f',
                       'quantidade',10,'unidade_medida','litro'),
    jsonb_build_object('item_tipo','produto','item_id','676dc92d-c1e1-4908-b51e-3748e52f493b',
                       'quantidade',5,'unidade_medida','litro'));

  FOR v_p IN SELECT * FROM jsonb_array_elements(v_plans) LOOP
    v_scn := v_p->>'code'; v_pass := false; v_det := '{}'::jsonb;
    BEGIN
      SELECT * INTO v_plan FROM public.commercial_payment_plans WHERE id = (v_p->>'id')::uuid;

      v_cart := public.fn_resolve_b2b_cart(c_partner, v_plan.id, v_items, current_date);
      v_final := CASE WHEN COALESCE((v_cart->>'quote_required')::boolean,false) THEN 0
                      ELSE public.fn_b2b_apply_interest((v_cart->>'net_amount')::numeric,
                             v_plan.interest_type, v_plan.monthly_interest_percent, v_plan.months_count) END;
      v_hash := public.fn_b2b_cart_hash(c_partner, v_plan.id, v_cart, v_final);

      v_res := public.create_partner_order_secure(
        c_partner, 'HML-B2B ' || v_scn, v_items, NULL, v_plan.id, NULL, NULL, v_hash,
        'hml-' || v_scn || '-' || left(v_run::text, 8));
      v_order := (v_res->>'order_id')::uuid;

      v_det := jsonb_build_object(
        'plan', v_scn,
        'pricing_mode', v_plan.pricing_mode,
        'quote_required', COALESCE((v_cart->>'quote_required')::boolean,false),
        'table_amount', (v_cart->>'table_amount')::numeric,
        'discount_amount', (v_cart->>'discount_amount')::numeric,
        'net_amount', (v_cart->>'net_amount')::numeric,
        'final_amount', v_final,
        'order_id', v_order,
        'order_status', (SELECT status::text FROM public.partner_orders WHERE id = v_order));

      IF v_scn = 'HML-B2B-D' THEN
        -- quote_only: pedido deve nascer em cotacao e recusar recebivel
        BEGIN
          v_gen := public.generate_b2b_receivable_secure(v_order);
          v_det := v_det || jsonb_build_object('receivable_unexpected', v_gen);
        EXCEPTION WHEN OTHERS THEN
          v_det := v_det || jsonb_build_object('receivable_refused', SQLERRM);
        END;
        v_pass := (v_det->>'order_status') = 'aguardando_cotacao'
              AND (v_det->>'receivable_refused') LIKE '%quote_required%';
      ELSE
        UPDATE public.partner_orders SET status = 'aprovado'::partner_order_status WHERE id = v_order;
        v_gen := public.generate_b2b_receivable_secure(v_order);
        SELECT * INTO v_ar FROM public.accounts_receivable
         WHERE origin_type='B2B_ORDER' AND origin_id = v_order AND status <> 'CANCELED'
         ORDER BY created_at DESC LIMIT 1;

        -- concorrencia/idempotencia: segunda geracao nao cria recebivel adicional
        BEGIN v_gen := public.generate_b2b_receivable_secure(v_order);
        EXCEPTION WHEN OTHERS THEN v_det := v_det || jsonb_build_object('regen_err', SQLERRM); END;

        v_mock1 := public.rpc_hml_fiscal_emit_mock(v_ar.id);
        v_mock2 := public.rpc_hml_fiscal_emit_mock(v_ar.id);

        v_det := v_det || jsonb_build_object(
          'receivable_id', v_ar.id,
          'receivable_total', v_ar.total_amount,
          'fiscal_required', v_ar.fiscal_invoice_required,
          'fiscal_requirement_source', v_ar.fiscal_requirement_source,
          'ar_count', (SELECT count(*) FROM public.accounts_receivable
                        WHERE origin_type='B2B_ORDER' AND origin_id=v_order AND status <> 'CANCELED'),
          'installments', (SELECT count(*) FROM public.accounts_receivable_installments
                            WHERE receivable_id = v_ar.id),
          'mock_first', v_mock1, 'mock_second', v_mock2,
          'invoice_count', (SELECT count(*) FROM public.fiscal_invoices
                             WHERE receivable_id = v_ar.id AND status <> 'CANCELED'),
          'invoice_items', (SELECT count(*) FROM public.fiscal_invoice_items
                             WHERE fiscal_invoice_id = (v_mock1->>'invoice_id')::uuid));

        v_pass := COALESCE(v_ar.fiscal_invoice_required,false)
              AND ROUND(v_ar.total_amount,2) = ROUND(v_final,2)
              AND (v_det->>'ar_count')::int = 1
              AND (v_det->>'invoice_count')::int = 1
              AND COALESCE((v_mock2->>'duplicated')::boolean,false) = true;
      END IF;

      RAISE EXCEPTION 'HMLROLLBACK';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM <> 'HMLROLLBACK' THEN
        v_pass := false;
        v_det := v_det || jsonb_build_object('error', SQLERRM);
      END IF;
    END;

    INSERT INTO public.hml_b2b_e2e_evidence(run_id, scenario, passed, details)
    VALUES (v_run, v_scn, v_pass, v_det);
  END LOOP;

  RAISE NOTICE 'HML run %', v_run;
END $run$;