CREATE OR REPLACE FUNCTION public.get_b2b_seller_finance_order_review_v1(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_org uuid := public.h15_actor_organization();
  v_order public.partner_orders%ROWTYPE;
  v_terms public.partner_order_payment_terms%ROWTYPE;
  v_reserved boolean;
  v_accounting_pending boolean;
  v_code text;
BEGIN
  SELECT * INTO v_order FROM public.partner_orders WHERE id=p_order_id;
  -- Same external seller-Financeiro authority as the installed reject writer; no other caller.
  IF v_uid IS NULL OR NOT FOUND OR v_order.c2_external_origin_snapshot IS NULL
    OR platform_private.platform_actor_access_ready(v_uid) IS NOT TRUE
    OR public.is_platform_superadmin(v_uid) IS TRUE
    OR EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=v_uid AND role IN ('parceiro_b2b','parceiro_b2b_tecnico','cliente_produtor','superadmin'))
    OR v_org IS DISTINCT FROM '007bb519-cba0-4704-be2c-cb93ad010048'::uuid
    OR platform_private.c2p1_internal_actor(ARRAY['financeiro']::public.app_role[]) IS DISTINCT FROM v_org
    OR public._saas_user_has_feature(v_uid,'pedidos_b2b') IS NOT TRUE
    OR NOT EXISTS(SELECT 1 FROM public.partner_accounts pa JOIN public.organizations o ON o.id=pa.commercial_owner_organization_id
      WHERE pa.id=v_order.partner_id AND pa.commercial_owner_organization_id=v_org AND pa.ativo IS TRUE AND pa.deleted_at IS NULL AND o.ativo IS TRUE AND o.status='ativa')
    OR v_order.internal_origin_snapshot IS NOT NULL
    -- Review 051e9d14: canonical external-origin contract must validate BEFORE any detail is read or returned.
    OR platform_private.c2_external_origin_contract_valid(v_order.c2_external_origin_snapshot) IS NOT TRUE
    OR v_order.c2_external_origin_snapshot->>'organization_id' IS DISTINCT FROM v_org::text
    OR v_order.c2_external_origin_snapshot->>'partner_id' IS DISTINCT FROM v_order.partner_id::text
    OR v_order.c2_external_origin_snapshot->>'actor_user_id' IS DISTINCT FROM v_order.created_by::text
    OR NOT EXISTS(SELECT 1 FROM public.partner_users pu JOIN public.profiles p ON p.user_id=pu.user_id
      WHERE pu.user_id=v_order.created_by AND pu.partner_id=v_order.partner_id AND pu.tenant_id=v_org
        AND pu.revoked_at IS NULL AND (pu.valid_from IS NULL OR pu.valid_from<=clock_timestamp())
        AND p.ativo IS TRUE AND p.organization_id=v_org AND public.is_valid_b2b_partner_user(pu.user_id,pu.partner_id)) THEN
    RAISE EXCEPTION 'B2B_SELLER_FINANCE_REVIEW_DENIED' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_terms FROM public.partner_order_payment_terms
    WHERE id=v_order.payment_terms_id AND partner_order_id=v_order.id;
  v_accounting_pending := v_order.c2_external_origin_snapshot->>'contract'='C2_EXTERNAL_ORDER_REQUEST_PENDING_ACCOUNTING_V1'
    AND (v_order.c2_external_origin_snapshot->>'accounting_validated')='false';
  v_reserved := EXISTS(SELECT 1 FROM public.estoque_produto s WHERE s.reservado_para_partner_order_id=v_order.id
      OR s.reservado_para_os_id IN (SELECT id FROM public.ordens_servico WHERE partner_order_id=v_order.id))
    OR EXISTS(SELECT 1 FROM public.estoque_movimentacoes m
      WHERE (m.acao='reserva' OR coalesce(m.reservado_posterior,0)>coalesce(m.reservado_anterior,0))
      AND (m.os_id IN (SELECT id FROM public.ordens_servico WHERE partner_order_id=v_order.id)
        OR m.metadata->>'partner_order_id'=v_order.id::text));
  -- Ordered like the writer's state predicate; first blocking reason wins. Accounting pending is informative:
  -- the canonical validator accepts it and the writer may reject pending terms; no fiscal/receivable effect.
  v_code := CASE
    WHEN v_terms.id IS NULL THEN 'terms_absent'
    WHEN v_terms.approval_status='not_required' THEN 'terms_not_required'
    WHEN v_terms.approval_status IS DISTINCT FROM 'pending' OR v_terms.approved_by IS NOT NULL OR v_terms.approved_at IS NOT NULL THEN 'terms_decided'
    WHEN v_order.approved_by IS NOT NULL OR v_order.approved_at IS NOT NULL
      OR public.fn_b2b_status_is_approved_or_later(v_order.status) THEN 'commercial_approved'
    WHEN v_order.status::text IN ('cancelado','reprovado') THEN 'order_closed'
    WHEN v_reserved THEN 'reserved'
    ELSE 'eligible' END;
  RETURN jsonb_build_object(
    'contract','B2B_SELLER_FINANCE_ORDER_REVIEW_V1','order_id',v_order.id,'numero',v_order.numero,
    'status',v_order.status,'origin','external_partner','created_at',v_order.created_at,
    'accounting_pending',v_accounting_pending,
    'header_financial',jsonb_build_object('financial_approval_status',v_order.financial_approval_status,
      'requires_financial_approval',v_order.requires_financial_approval),
    'items',coalesce((SELECT jsonb_agg(jsonb_build_object('id',i.id,'produto_nome',i.produto_nome_snapshot,
      'produto_codigo',i.produto_codigo_snapshot,'embalagem',i.packaging_codigo_snapshot,'quantidade',i.quantidade,
      'unidade',i.unidade_medida,'preco_unitario',i.preco_unitario,'subtotal',i.subtotal) ORDER BY i.created_at,i.id)
      FROM public.partner_order_items i WHERE i.order_id=v_order.id),'[]'::jsonb),
    'terms',CASE WHEN v_terms.id IS NULL THEN NULL ELSE jsonb_build_object('id',v_terms.id,
      'plan_name_snapshot',v_terms.plan_name_snapshot,'plan_code_snapshot',v_terms.plan_code_snapshot,
      'installment_count',v_terms.installment_count,'table_amount',v_terms.table_amount,
      'final_amount',v_terms.final_amount,'approval_status',v_terms.approval_status,
      'approved_at',v_terms.approved_at,'approval_notes',v_terms.approval_notes) END,
    'reject_eligible',v_code='eligible','reject_block_reason',CASE WHEN v_code='eligible' THEN NULL ELSE v_code END,
    'terms_review_path',CASE WHEN v_terms.approval_status='not_required' THEN 'new_order_with_financial_approval_plan' ELSE NULL END);
END;
$function$;
