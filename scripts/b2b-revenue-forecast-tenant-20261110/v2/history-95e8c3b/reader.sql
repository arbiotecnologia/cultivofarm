CREATE FUNCTION public.rpc_b2b_revenue_forecast_tenant_v2(p_partner_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE actor uuid:=auth.uid(); org uuid:=public.h15_actor_organization();
 i record; row jsonb; bal numeric; d int;
 b_venc numeric:=0; b30 numeric:=0; b60 numeric:=0; b90 numeric:=0; b_apos numeric:=0; n_conf int:=0;
 n_unproven int:=0; n_legacy int:=0; n_incons int:=0;
 v_res numeric:=0; v_res_n int:=0; v_f_incons int:=0; v_legacy_orders int:=0;
BEGIN
 IF actor IS NULL OR org IS NULL OR public.is_financial_staff(actor) IS NOT TRUE
  OR public._saas_user_has_feature(actor,'contas_receber') IS NOT TRUE
  OR public._saas_user_has_feature(actor,'pedidos_b2b') IS NOT TRUE THEN
  RAISE EXCEPTION 'B2B_REVENUE_FORECAST_DENIED' USING ERRCODE='42501'; END IF;
 IF p_partner_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.partner_accounts pa
   WHERE pa.id=p_partner_id AND pa.commercial_owner_organization_id=org) THEN
  RAISE EXCEPTION 'B2B_REVENUE_FORECAST_DENIED' USING ERRCODE='42501'; END IF;
 -- Títulos: candidatos do tenant; origin_type só seleciona, nunca prova. Prova = motor B4 (alocação de documento AUTORIZADO).
 FOR i IN SELECT s.id, s.status, s.due_date, a.id AS rid, a.status AS ast, a.partner_id
   FROM public.accounts_receivable_installments s JOIN public.accounts_receivable a ON a.id=s.receivable_id
  WHERE a.organization_id=org AND s.organization_id=org AND a.origin_type='B2B_ORDER'
    AND (p_partner_id IS NULL OR a.partner_id=p_partner_id) ORDER BY s.id LOOP
  IF i.ast='CANCELED' OR i.status='CANCELED' THEN CONTINUE; END IF;
  BEGIN
   row:=platform_private.b2b_proven_money_row_internal(i.id,org);
  EXCEPTION WHEN SQLSTATE '23514' OR SQLSTATE '42501' THEN n_unproven:=n_unproven+1; CONTINUE;
  END;
  IF row IS NULL THEN n_unproven:=n_unproven+1; CONTINUE; END IF;
  IF row->'monetary_origin'->>'source' IS DISTINCT FROM 'b2b_document_allocation_v1' THEN n_legacy:=n_legacy+1; CONTINUE; END IF;
  IF EXISTS (SELECT 1 FROM platform_private.b2b_allocation_reversals r WHERE r.document_id=(row->'monetary_origin'->>'document_id')::uuid)
   OR NOT EXISTS (SELECT 1 FROM public.partner_orders po JOIN public.partner_accounts pa ON pa.id=po.partner_id
        WHERE po.id=(row->'monetary_origin'->>'order_id')::uuid AND po.partner_id=i.partner_id AND pa.commercial_owner_organization_id=org)
   OR EXISTS (SELECT 1 FROM platform_private.b2b_financial_forecasts f WHERE f.order_id=(row->'monetary_origin'->>'order_id')::uuid
        AND (f.organization_id IS DISTINCT FROM org OR f.partner_id IS DISTINCT FROM i.partner_id))
   OR i.status NOT IN ('OPEN','PARTIAL','PAID','OVERDUE') OR i.due_date IS NULL THEN n_incons:=n_incons+1; CONTINUE; END IF;
  bal:=(row->>'original_amount')::numeric+(row->>'interest_amount')::numeric-(row->>'financed_interest_amount')::numeric
      +(row->>'penalty_amount')::numeric-(row->>'discount_amount')::numeric-(row->>'received_amount')::numeric;
  IF bal IS NULL OR bal<0 OR (i.status='PAID' AND bal<>0) THEN n_incons:=n_incons+1; CONTINUE; END IF;
  n_conf:=n_conf+1; d:=i.due_date-current_date;
  IF d<0 THEN b_venc:=b_venc+bal; ELSIF d<=30 THEN b30:=b30+bal; ELSIF d<=60 THEN b60:=b60+bal; ELSIF d<=90 THEN b90:=b90+bal; ELSE b_apos:=b_apos+bal; END IF;
 END LOOP;
 -- Previsão não exigível: residual vivo com pedido/parceiro/emissor coerentes.
 SELECT coalesce(sum(f.residual_amount),0), count(*) INTO v_res, v_res_n
   FROM platform_private.b2b_financial_forecasts f
   JOIN public.partner_orders po ON po.id=f.order_id AND po.partner_id=f.partner_id
   JOIN public.partner_accounts pa ON pa.id=f.partner_id AND pa.commercial_owner_organization_id=org
  WHERE f.organization_id=org AND f.residual_amount>0
    AND f.state IN ('aguardando_fiscal','emissao_em_andamento','consulta_fiscal_obrigatoria','faturado_parcial')
    AND (p_partner_id IS NULL OR f.partner_id=p_partner_id);
 SELECT count(*) INTO v_f_incons FROM platform_private.b2b_financial_forecasts f
  WHERE (p_partner_id IS NULL OR f.partner_id=p_partner_id)
    AND (f.organization_id=org OR EXISTS (SELECT 1 FROM public.partner_accounts pa WHERE pa.id=f.partner_id AND pa.commercial_owner_organization_id=org))
    AND NOT EXISTS (SELECT 1 FROM public.partner_orders po JOIN public.partner_accounts pa ON pa.id=po.partner_id
        WHERE po.id=f.order_id AND po.partner_id=f.partner_id AND pa.commercial_owner_organization_id=org AND f.organization_id=org);
 -- Legado: pedido aprovado sem previsão e sem alocação fiscal comprovada; só contagem.
 SELECT count(*) INTO v_legacy_orders FROM public.partner_orders po
   JOIN public.partner_accounts pa ON pa.id=po.partner_id AND pa.commercial_owner_organization_id=org
  WHERE po.status::text IN ('aprovado','em_producao','produzido','aguardando_entrega','confirmado','em_separacao','enviado','entregue')
    AND (p_partner_id IS NULL OR po.partner_id=p_partner_id)
    AND NOT EXISTS (SELECT 1 FROM platform_private.b2b_financial_forecasts f WHERE f.order_id=po.id)
    AND NOT EXISTS (SELECT 1 FROM platform_private.b2b_document_allocations x WHERE x.order_id=po.id AND x.organization_id=org);
 RETURN jsonb_build_object('contract','B2B_REVENUE_FORECAST_TENANT_V2','organization_id',org,'partner_id',p_partner_id,
  'forecast_residual',jsonb_build_object('amount',v_res,'orders',v_res_n,'enforceable',false,'due_dates_estimated',true,'inconsistent',v_f_incons),
  'confirmed_titles',jsonb_build_object('proof','b2b_document_allocation_v1','installments',n_conf,'vencido',b_venc,'ate_30',b30,'ate_60',b60,'ate_90',b90,'apos_90',b_apos,
    'total_aberto',b_venc+b30+b60+b90+b_apos),
  'titles_unavailable',jsonb_build_object('unproven',n_unproven,'legacy',n_legacy,'inconsistent',n_incons),
  'legacy_unproven_orders',v_legacy_orders);
END $fn$;
