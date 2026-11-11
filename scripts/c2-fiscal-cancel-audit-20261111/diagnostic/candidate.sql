CREATE OR REPLACE FUNCTION public.fn_fiscal_invoice_eligibility(_source_type text, _source_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  reasons jsonb := '[]'::jsonb;
  po public.partner_orders%ROWTYPE;
  ent public.entregas%ROWTYPE;
  st text;
  v_order_id uuid;
  v_debtor uuid;
  n_items int := 0; n_quote int := 0; n_no_snapshot int := 0;
  canceled boolean := false;
  allowed text[];
  v_actor_org uuid;
  v_owner_org uuid;
  v_econ jsonb; v_ev jsonb; v_diag jsonb; v_com boolean; v_credit boolean;
BEGIN
  PERFORM public.h15_require_staff();
  v_actor_org := public.h15_actor_organization();

  IF _source_type IS NULL OR _source_id IS NULL THEN
    RETURN jsonb_build_object('eligible', false, 'reasons',
      jsonb_build_array(jsonb_build_object('code','FISCAL_SOURCE_MISSING','severity','BLOCK',
        'message','Origem fiscal (pedido/entrega) obrigatoria.')));
  END IF;

  IF _source_type = 'PARTNER_ORDER' THEN
    SELECT * INTO po FROM public.partner_orders WHERE id = _source_id;
    IF po.id IS NOT NULL THEN
      SELECT pa.commercial_owner_organization_id INTO v_owner_org FROM public.partner_accounts pa WHERE pa.id = po.partner_id;
    END IF;
    -- Escopo vendedor: inexistente e de outra empresa respondem igual, sem IDs.
    IF po.id IS NULL OR v_owner_org IS NULL OR v_owner_org IS DISTINCT FROM v_actor_org THEN
      RETURN jsonb_build_object('eligible',false,'reasons',jsonb_build_array(jsonb_build_object('code','FISCAL_ORDER_NOT_FOUND','severity','BLOCK','message','Pedido inexistente.')),'sourceType',_source_type,'orderId',NULL::uuid,'debtorPartnerId',NULL::uuid,'has_canceled_history',false);
    ELSE
      v_order_id := po.id;
      st := po.status::text;
      allowed := public.fn_fiscal_billing_allowed_order_status();

      IF st = 'cancelado' THEN
        reasons := reasons || jsonb_build_object('code','FISCAL_ORDER_CANCELED','severity','BLOCK','message','Pedido cancelado; emissao bloqueada.');
      ELSIF st IN ('reprovado','reprovado_sem_itens') THEN
        reasons := reasons || jsonb_build_object('code','FISCAL_ORDER_REJECTED','severity','BLOCK','message','Pedido reprovado; emissao bloqueada.');
      ELSIF st = 'aguardando_cotacao' THEN
        reasons := reasons || jsonb_build_object('code','FISCAL_ORDER_QUOTE_PENDING','severity','BLOCK','message','Pedido aguardando cotacao; emissao bloqueada.');
      ELSIF st = 'faturado' THEN
        reasons := reasons || jsonb_build_object('code','FISCAL_ORDER_ALREADY_INVOICED','severity','BLOCK','message','Pedido ja faturado.');
      ELSIF NOT (st = ANY (allowed)) THEN
        reasons := reasons || jsonb_build_object('code','FISCAL_ORDER_STATUS_NOT_BILLABLE','severity','BLOCK',
          'message','Status do pedido nao habilitado para faturamento: '||st);
      END IF;

      -- Aprovacao comercial obrigatoria.
      IF po.approved_at IS NULL OR po.approved_by IS NULL THEN
        reasons := reasons || jsonb_build_object('code','FISCAL_ORDER_COMMERCIAL_APPROVAL_MISSING','severity','BLOCK',
          'message','Pedido sem aprovacao comercial registrada.');
      END IF;

      -- Aprovacao financeira quando exigida.
      IF coalesce(po.requires_financial_approval,false)
         AND coalesce(po.financial_approval_status,'pending') <> 'approved' THEN
        reasons := reasons || jsonb_build_object('code','FISCAL_ORDER_FINANCIAL_APPROVAL_MISSING','severity','BLOCK',
          'message','Pedido exige aprovacao financeira e ela nao foi concedida.');
      END IF;

      -- Condicao de pagamento aceita/definida.
      IF coalesce(po.payment_condition_status,'') NOT IN ('defined','accepted','aceita') THEN
        reasons := reasons || jsonb_build_object('code','FISCAL_ORDER_PAYMENT_CONDITION_NOT_ACCEPTED','severity','BLOCK',
          'message','Condicao de pagamento nao aceita/definida.');
      END IF;

      -- Devedor correto: parceiro B2B, nunca o produtor final vinculado.
      IF po.partner_id IS NULL THEN
        reasons := reasons || jsonb_build_object('code','FISCAL_DEBTOR_UNRESOLVED','severity','BLOCK',
          'message','Parceiro devedor do pedido nao identificado.');
      ELSE
        v_debtor := po.partner_id;
      END IF;

      -- Snapshot de preco/condicao e ausencia de itens sob consulta.
      SELECT count(*),
             count(*) FILTER (WHERE coalesce(pricing_mode_snapshot,'') = 'quote_only'),
             count(*) FILTER (WHERE preco_unitario_final_snapshot IS NULL
                                 OR price_source_snapshot IS NULL)
        INTO n_items, n_quote, n_no_snapshot
        FROM public.partner_order_items WHERE order_id = _source_id;

      IF n_items = 0 THEN
        reasons := reasons || jsonb_build_object('code','FISCAL_ORDER_NO_ITEMS','severity','BLOCK','message','Pedido sem itens.');
      END IF;
      IF n_quote > 0 THEN
        reasons := reasons || jsonb_build_object('code','FISCAL_QUOTE_ONLY_BLOCKED','severity','BLOCK',
          'message','Pedido possui itens sob consulta (quote_only); emissao bloqueada sem efeito colateral.');
      END IF;
      IF n_no_snapshot > 0 THEN
        reasons := reasons || jsonb_build_object('code','FISCAL_PRICE_SNAPSHOT_MISSING','severity','BLOCK',
          'message','Itens sem snapshot de preco/condicao comercial.');
      END IF;
    END IF;

  ELSIF _source_type = 'ENTREGA' THEN
    SELECT * INTO ent FROM public.entregas WHERE id = _source_id;
    -- Escopo vendedor: inexistente e de outra empresa respondem igual, sem IDs.
    IF ent.id IS NULL OR ent.organization_id IS NULL OR ent.organization_id IS DISTINCT FROM v_actor_org THEN
      RETURN jsonb_build_object('eligible',false,'reasons',jsonb_build_array(jsonb_build_object('code','FISCAL_DELIVERY_NOT_FOUND','severity','BLOCK','message','Entrega inexistente.')),'sourceType',_source_type,'orderId',NULL::uuid,'debtorPartnerId',NULL::uuid,'has_canceled_history',false);
    ELSE
      IF ent.cancelada_em IS NOT NULL OR coalesce(ent.status::text,'') = 'cancelada'
         OR coalesce(ent.financial_status,'') = 'CANCELED' THEN
        reasons := reasons || jsonb_build_object('code','FISCAL_DELIVERY_CANCELED','severity','BLOCK','message','Entrega cancelada.');
      END IF;
      IF NOT (coalesce(ent.status::text,'') = ANY (public.fn_fiscal_billing_allowed_delivery_status())) THEN
        reasons := reasons || jsonb_build_object('code','FISCAL_DELIVERY_NOT_COMPLETED','severity','BLOCK',
          'message','Entrega nao concluida/aceita. Status atual: '||coalesce(ent.status::text,'-'));
      END IF;
      IF ent.recebimento_confirmado_em IS NULL AND ent.confirmada_em IS NULL AND ent.entregue_em IS NULL THEN
        reasons := reasons || jsonb_build_object('code','FISCAL_DELIVERY_RECEIPT_MISSING','severity','BLOCK',
          'message','Entrega sem aceite/recebimento registrado.');
      END IF;
      IF ent.partner_order_id IS NULL THEN
        reasons := reasons || jsonb_build_object('code','FISCAL_DELIVERY_ORDER_LINK_MISSING','severity','BLOCK',
          'message','Entrega sem vinculo inequivoco a pedido B2B.');
      ELSE
        v_order_id := ent.partner_order_id;
        SELECT o.partner_id, o.status::text, pa.commercial_owner_organization_id INTO v_debtor, st, v_owner_org
          FROM public.partner_orders o LEFT JOIN public.partner_accounts pa ON pa.id = o.partner_id WHERE o.id = ent.partner_order_id;
        IF v_owner_org IS NULL OR v_owner_org IS DISTINCT FROM ent.organization_id THEN
          -- Pedido vinculado ausente/de outra empresa: nega sem expor seus IDs.
          reasons := reasons || jsonb_build_object('code','FISCAL_DELIVERY_TENANT_MISMATCH','severity','BLOCK',
            'message','Entrega e pedido vinculado nao pertencem a mesma empresa vendedora.');
          v_order_id := NULL; v_debtor := NULL; st := NULL;
        END IF;
        IF v_debtor IS NULL THEN
          reasons := reasons || jsonb_build_object('code','FISCAL_DEBTOR_UNRESOLVED','severity','BLOCK',
            'message','Parceiro devedor da entrega nao identificado.');
        END IF;
        IF st IS NULL OR NOT (st = ANY (public.fn_fiscal_billing_allowed_order_status())) THEN
          reasons := reasons || jsonb_build_object('code','FISCAL_ORDER_STATUS_NOT_BILLABLE','severity','BLOCK',
            'message','Pedido vinculado a entrega nao esta habilitado para faturamento: '||coalesce(st,'-'));
        END IF;
      END IF;
    END IF;

  ELSE
    reasons := reasons || jsonb_build_object('code','FISCAL_SOURCE_TYPE_UNSUPPORTED','severity','BLOCK',
      'message','Escopo fiscal nao suportado nesta fase: '||_source_type);
  END IF;

  -- Duplicidade fiscal: documento vivo para a mesma origem.
  IF EXISTS (SELECT 1 FROM (SELECT * FROM public.fiscal_invoices WHERE public.h15_company_access(company_settings_id)) fi
             WHERE fi.source_type = _source_type AND fi.source_id = _source_id
               AND fi.document_model = 'NFE'
               AND fi.status NOT IN ('CANCELED','REJECTED')
               AND fi.access_key IS NOT NULL) THEN
    reasons := reasons || jsonb_build_object('code','FISCAL_DUPLICATE_DOCUMENT','severity','BLOCK',
      'message','Ja existe documento fiscal vigente para esta origem.');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM (SELECT * FROM public.fiscal_invoices WHERE public.h15_company_access(company_settings_id)) fi
    WHERE fi.source_type = _source_type AND fi.source_id = _source_id
      AND fi.document_model = 'NFE' AND fi.status = 'CANCELED') INTO canceled;

  -- Diagnostic only: canonical pilot reader owns viewer authorization; no new read authority.
  IF _source_type='PARTNER_ORDER' AND po.c2_external_origin_snapshot->>'contract'='C2_EXTERNAL_ORDER_REQUEST_PENDING_ACCOUNTING_V1' THEN
    v_diag:=jsonb_build_object('available',false,'commercial_explicit',NULL::boolean,'credit_explicit',NULL::boolean,
      'operational_commercial_registered',po.approved_at IS NOT NULL AND po.approved_by IS NOT NULL,
      'accounting_pending',true,'operational_blocked',true,'fiscal_blocked',true);
    BEGIN
      v_econ:=public.c2_pilot_economic_state_v1(po.id);
      IF (v_econ->>'available')::boolean IS TRUE AND v_econ->'evidence' IS NOT NULL AND v_econ->'evidence'<>'null'::jsonb THEN
        v_ev:=v_econ->'evidence';
        SELECT coalesce(bool_or(a.kind='commercial'),false),coalesce(bool_or(a.kind='credit'),false)
          INTO v_com,v_credit
          FROM platform_private.c2_pilot_econ_approvals_v1 a
          JOIN platform_private.c2_pilot_econ_allowlist_v1 g ON g.id=a.allowlist_id
          JOIN public.profiles ap ON ap.user_id=a.actor_id
          JOIN public.organizations ao ON ao.id=a.organization_id
          WHERE a.order_id=po.id AND a.organization_id=v_owner_org AND a.partner_id=po.partner_id
            AND a.approved_at IS NOT NULL AND a.actor_id IS NOT NULL
            AND a.evidence_hash=v_ev->>'evidence_hash' AND a.evidence=v_ev
            AND g.order_id=a.order_id AND g.organization_id=a.organization_id AND g.partner_id=a.partner_id
            AND g.actor_id=a.actor_id AND g.kind=a.kind AND g.revoked_at IS NULL
            AND g.valid_from<=clock_timestamp() AND g.valid_until>clock_timestamp()
            AND ap.ativo IS TRUE AND ap.organization_id=a.organization_id AND ao.ativo IS TRUE
            AND public.has_role(a.actor_id,a.actor_role::public.app_role);
        v_diag:=v_diag||jsonb_build_object('available',true,'commercial_explicit',v_com,'credit_explicit',v_credit);
      END IF;
    EXCEPTION WHEN insufficient_privilege THEN NULL; -- unavailable is not absence
    END;
  END IF;
  RETURN jsonb_build_object(
    'eligible', jsonb_array_length(reasons) = 0,
    'reasons', reasons,
    'sourceType', _source_type,
    'orderId', v_order_id,
    'debtorPartnerId', v_debtor,
    'has_canceled_history', canceled)||CASE WHEN v_diag IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('economicDiagnosis',v_diag) END;
END $function$