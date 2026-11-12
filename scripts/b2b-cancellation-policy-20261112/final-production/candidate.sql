CREATE TABLE platform_private.b2b_cancel_policy_gate_v1(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),enabled boolean NOT NULL DEFAULT false);
REVOKE ALL ON platform_private.b2b_cancel_policy_gate_v1 FROM PUBLIC,anon,authenticated,service_role;
INSERT INTO platform_private.b2b_cancel_policy_gate_v1(singleton,enabled) VALUES(true,false);
CREATE TABLE platform_private.b2b_cancel_policy_allowlist_v1(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),actor_id uuid NOT NULL,organization_id uuid NOT NULL,invoice_id uuid NOT NULL,order_id uuid NOT NULL,synthetic boolean NOT NULL DEFAULT true,valid_from timestamptz NOT NULL DEFAULT clock_timestamp(),valid_until timestamptz NOT NULL,revoked_at timestamptz);
REVOKE ALL ON platform_private.b2b_cancel_policy_allowlist_v1 FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.rpc_b2b_forecast_cancel_residual_v1(p_order uuid, p_expected_version integer, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE po public.partner_orders;f platform_private.b2b_financial_forecasts;org uuid;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM platform_private.b2b_cancel_policy_gate_v1 WHERE singleton AND enabled) THEN RAISE EXCEPTION 'CANCEL_POLICY_DISABLED' USING ERRCODE='42501'; END IF;
 IF current_setting('transaction_isolation') IS DISTINCT FROM 'read committed' THEN
  RAISE EXCEPTION 'B2B_FORECAST_READ_COMMITTED_REQUIRED' USING ERRCODE='42501';END IF;
 org:=platform_private.c2p1_internal_actor(ARRAY['administrador','gestor_comercial']::public.app_role[]);
 IF org IS NULL THEN RAISE EXCEPTION 'B2B_FORECAST_CANCEL_ACTOR_DENIED' USING ERRCODE='42501';END IF;
 IF public._saas_user_has_feature(auth.uid(),'pedidos_b2b') IS NOT TRUE
  OR public._saas_user_has_feature(auth.uid(),'contas_receber') IS NOT TRUE THEN
  RAISE EXCEPTION 'B2B_FORECAST_FEATURE_DENIED' USING ERRCODE='42501';END IF;
 IF p_order IS NULL OR p_expected_version IS NULL OR nullif(btrim(coalesce(p_reason,'')),'') IS NULL THEN
  RAISE EXCEPTION 'B2B_FORECAST_CANCEL_REASON_REQUIRED' USING ERRCODE='22023';END IF;
 -- Canonical order: order row first, then forecast (same as approval and the bridge).
 SELECT * INTO po FROM public.partner_orders WHERE id=p_order
  AND EXISTS(SELECT 1 FROM public.partner_accounts pa WHERE pa.id=partner_orders.partner_id
   AND pa.commercial_owner_organization_id=org)
  AND platform_private.c2p1_settings_allowed(partner_id,true)
  AND platform_private.b2b_forecast_lifecycle_scope_v1('forecast_cancel',auth.uid(),org,
   partner_id,id) IS TRUE FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'B2B_FORECAST_CANCEL_ACTOR_DENIED' USING ERRCODE='42501';END IF;
 SELECT * INTO f FROM platform_private.b2b_financial_forecasts WHERE order_id=p_order AND organization_id=org FOR UPDATE;
 IF NOT FOUND OR f.partner_id IS DISTINCT FROM po.partner_id THEN
  RAISE EXCEPTION 'B2B_FORECAST_CAS_CONFLICT' USING ERRCODE='PT409';END IF;
 IF platform_private.c2p1_internal_actor(ARRAY['administrador','gestor_comercial']::public.app_role[]) IS DISTINCT FROM f.organization_id
  OR NOT platform_private.c2p1_settings_allowed(f.partner_id,true) THEN
  RAISE EXCEPTION 'B2B_FORECAST_CANCEL_ACTOR_DENIED' USING ERRCODE='42501';END IF;
 IF platform_private.b2b_forecast_lifecycle_allowed_v1('forecast_cancel',auth.uid(),org,
   po.partner_id,po.id) IS NOT TRUE THEN
  RAISE EXCEPTION 'B2B_FORECAST_PILOT_DENIED' USING ERRCODE='42501';END IF;
 IF public._saas_user_has_feature(auth.uid(),'pedidos_b2b') IS NOT TRUE
  OR public._saas_user_has_feature(auth.uid(),'contas_receber') IS NOT TRUE THEN
  RAISE EXCEPTION 'B2B_FORECAST_FEATURE_DENIED' USING ERRCODE='42501';END IF;
 IF platform_private.c2p1_internal_actor(ARRAY['administrador','gestor_comercial']::public.app_role[]) IS DISTINCT FROM org
  OR platform_private.c2p1_settings_allowed(po.partner_id,true) IS NOT TRUE THEN
  RAISE EXCEPTION 'B2B_FORECAST_CANCEL_ACTOR_DENIED' USING ERRCODE='42501';END IF;
 PERFORM 1 FROM platform_private.b2b_cancel_policy_gate_v1 WHERE singleton FOR SHARE;
 IF NOT EXISTS(SELECT 1 FROM platform_private.b2b_cancel_policy_gate_v1 WHERE singleton AND enabled) THEN RAISE EXCEPTION 'CANCEL_POLICY_DISABLED' USING ERRCODE='42501'; END IF;
 IF po.approved_at IS NULL OR po.approved_by IS NULL OR po.status::text NOT IN ('aprovado','entregue') THEN RAISE EXCEPTION 'B2B_CANCEL_ORDER_NOT_APPROVED' USING ERRCODE='PT409'; END IF;
 IF f.state IN ('cancelado_antes_nf','cancelado_residual') THEN
  IF f.version=p_expected_version+1 AND EXISTS(SELECT 1 FROM platform_private.b2b_financial_forecast_events e WHERE e.forecast_id=f.id AND e.event_type='FORECAST_CANCELED' AND e.payload->>'reason'=p_reason) THEN RETURN jsonb_build_object('forecast_id',f.id,'state',f.state,'version',f.version,'idempotentReplay',true); END IF;
  RAISE EXCEPTION 'B2B_FORECAST_CAS_CONFLICT' USING ERRCODE='PT409'; END IF;
 -- An emission/consultation still open or an authorized return awaiting close must settle first.
 IF EXISTS(SELECT 1 FROM public.fiscal_invoices i JOIN public.fiscal_sefaz_transmissions t ON t.fiscal_invoice_id=i.id
   WHERE i.partner_order_id=p_order AND t.state IN ('PENDING','SENT')) THEN
  RAISE EXCEPTION 'B2B_FORECAST_FISCAL_IN_FLIGHT' USING ERRCODE='PT409';END IF;
 IF EXISTS(SELECT 1 FROM public.fiscal_invoices i JOIN platform_private.fiscal_close_pending cp ON cp.fiscal_invoice_id=i.id
   WHERE i.partner_order_id=p_order) THEN
  RAISE EXCEPTION 'B2B_FORECAST_FISCAL_RECONCILIATION_PENDING' USING ERRCODE='PT409';END IF;
 IF f.residual_amount IS NULL OR f.residual_amount<=0 OR f.state NOT IN ('aguardando_fiscal','faturado_parcial') THEN RAISE EXCEPTION 'B2B_FORECAST_STATE_CONFLICT' USING ERRCODE='PT409'; END IF;
 RETURN platform_private.b2b_financial_forecast_cancel_residual_v1(f.id,p_expected_version,p_reason)
  ||jsonb_build_object('actor',auth.uid(),'order_id',p_order);
END
$function$;
CREATE OR REPLACE FUNCTION public.rpc_register_receivable_payment(p_installment_id uuid, p_payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_proven jsonb; v_origin public.accounts_receivable%ROWTYPE; v_interest numeric; v_financed numeric; v_debtor uuid;
  v_uid uuid := auth.uid();
  v_org uuid := platform_private.h15_actor_organization();
  v_inst public.accounts_receivable_installments%ROWTYPE;
  v_amount numeric; v_disc numeric; v_int numeric; v_pen numeric; v_saldo numeric;
  v_pm uuid; v_ba uuid; v_pay_date date; v_notes text;
  v_has_receipt boolean; v_require_receipt boolean;
  v_payment_id uuid; v_idem text; v_fp text; v_existing record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE='insufficient_privilege';
  END IF;
  IF NOT public.is_financial_staff(v_uid) THEN
    RAISE EXCEPTION 'Sem permissão para registrar recebimento.' USING ERRCODE='insufficient_privilege';
  END IF;

  -- H6-001: idempotency_key obrigatoria (fail-closed)
  IF v_org IS NULL OR NOT EXISTS (SELECT 1 FROM public.accounts_receivable_installments WHERE id=p_installment_id AND organization_id=v_org) THEN
    RAISE EXCEPTION 'FINANCIAL_SCOPE_DENIED' USING ERRCODE='42501';
  END IF;
  IF (p_payload ? 'organization_id' AND NULLIF(p_payload->>'organization_id','')::uuid IS DISTINCT FROM v_org)
     OR (p_payload ? 'tenant_id' AND NULLIF(p_payload->>'tenant_id','')::uuid IS DISTINCT FROM v_org) THEN
    RAISE EXCEPTION 'FINANCIAL_TENANT_MISMATCH' USING ERRCODE='42501';
  END IF;
  v_idem := NULLIF(trim(p_payload->>'idempotency_key'), '');
  IF v_idem IS NULL OR length(v_idem) < 8 THEN
    RAISE EXCEPTION 'FIN_IDEMPOTENCY_REQUIRED: idempotency_key obrigatória (mín. 8 caracteres).'
      USING ERRCODE='check_violation';
  END IF;

  v_fp := public.fn_h6b_payment_fingerprint('receivable', p_installment_id, p_payload);

  -- lock determinístico por tipo + parcela + chave, ANTES da decisao de replay
  PERFORM pg_advisory_xact_lock(
    hashtextextended('fin_pay:receivable:' || p_installment_id::text || ':' || v_idem, 0));

  -- Lock title before installment, shared with fiscal cancellation.
  SELECT * INTO v_origin FROM public.accounts_receivable WHERE organization_id=v_org AND id=(SELECT receivable_id FROM public.accounts_receivable_installments WHERE id=p_installment_id AND organization_id=v_org) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FINANCIAL_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_inst FROM public.accounts_receivable_installments
   WHERE id = p_installment_id AND organization_id=v_org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Parcela não encontrada.'; END IF;

  IF auth.uid() IS DISTINCT FROM v_uid OR public.h15_actor_organization() IS DISTINCT FROM v_org OR public.is_financial_staff(v_uid) IS NOT TRUE THEN RAISE EXCEPTION 'FINANCIAL_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_origin FROM public.accounts_receivable WHERE id=v_inst.receivable_id AND organization_id=v_org;
  IF NOT FOUND THEN RAISE EXCEPTION 'FINANCIAL_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
  v_debtor:=platform_private.b2b_receivable_partner_scope(v_origin.id);
  IF v_origin.origin_type='B2B_ORDER' OR v_debtor IS NOT NULL THEN
   SELECT r INTO v_proven FROM jsonb_array_elements(public.rpc_receivable_money_projection_v1(v_inst.receivable_id,0,1000)) r WHERE r->>'id'=v_inst.id::text;
   IF v_proven IS NULL THEN RAISE EXCEPTION 'MONEY_ORIGIN_UNPROVEN' USING ERRCODE='23514'; END IF;
   v_interest:=(v_proven->>'interest_amount')::numeric;
   v_financed:=(v_proven->>'financed_interest_amount')::numeric;
  ELSE
   -- Caminho capturado para MANUAL não B2B sem parceiro; não é prova de origem B4.
   v_interest:=v_inst.interest_amount; v_financed:=0;
  END IF;
  SELECT id, request_fingerprint INTO v_existing FROM public.receivable_payments
   WHERE installment_id = p_installment_id AND idempotency_key = v_idem;
  IF v_existing.id IS NOT NULL THEN
    IF v_existing.request_fingerprint IS NOT NULL AND v_existing.request_fingerprint <> v_fp THEN
      RAISE EXCEPTION 'FIN_IDEMPOTENCY_CONFLICT: mesma idempotency_key com payload divergente.'
        USING ERRCODE='check_violation';
    END IF;
    RETURN v_existing.id;
  END IF;

  IF v_inst.status = 'CANCELED' THEN
    RAISE EXCEPTION 'Parcela cancelada.' USING ERRCODE='check_violation';
  END IF;
  IF v_inst.status = 'PAID' THEN
    RAISE EXCEPTION 'Parcela já quitada.' USING ERRCODE='check_violation';
  END IF;

  v_amount   := COALESCE((p_payload->>'amount_received')::numeric, 0);
  v_disc     := COALESCE((p_payload->>'discount_amount')::numeric, 0);
  v_int      := COALESCE((p_payload->>'interest_amount')::numeric, 0);
  v_pen      := COALESCE((p_payload->>'penalty_amount')::numeric, 0);
  v_pm       := NULLIF(p_payload->>'payment_method_id','')::uuid;
  v_ba       := NULLIF(p_payload->>'bank_account_id','')::uuid;
  v_pay_date := COALESCE((p_payload->>'payment_date')::date, (pg_catalog.now() AT TIME ZONE 'America/Sao_Paulo')::date);
  v_notes    := NULLIF(p_payload->>'notes','');
  v_has_receipt := COALESCE((p_payload->>'has_receipt')::boolean, false);

  IF v_amount::text IN ('NaN','Infinity','-Infinity') OR v_disc::text IN ('NaN','Infinity','-Infinity') OR v_int::text IN ('NaN','Infinity','-Infinity') OR v_pen::text IN ('NaN','Infinity','-Infinity') OR v_disc < 0 OR v_int < 0 OR v_pen < 0 OR v_amount <> round(v_amount,2) OR v_disc <> round(v_disc,2) OR v_int <> round(v_int,2) OR v_pen <> round(v_pen,2) THEN
 RAISE EXCEPTION 'FIN_INVALID_AMOUNT: valores monetários inválidos.' USING ERRCODE='23514';
 END IF;
 IF v_amount <= 0 THEN
    RAISE EXCEPTION 'Valor inválido.' USING ERRCODE='check_violation';
  END IF;
  IF v_pm IS NULL OR NOT EXISTS (SELECT 1 FROM public.payment_methods WHERE id = v_pm AND active) THEN
    RAISE EXCEPTION 'Forma de pagamento inválida ou inativa.' USING ERRCODE='check_violation';
  END IF;
  IF v_ba IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.bank_accounts WHERE id = v_ba AND active) THEN
    RAISE EXCEPTION 'Conta bancária inválida ou inativa.' USING ERRCODE='check_violation';
  END IF;

  v_saldo := v_inst.original_amount + (v_interest-v_financed) + COALESCE(v_inst.penalty_amount,0) - COALESCE(v_inst.discount_amount,0) - COALESCE(v_inst.received_amount,0) + v_int + v_pen - v_disc;
  IF v_amount - v_saldo > 0.005 THEN
    RAISE EXCEPTION 'Valor excede o saldo da parcela (saldo: %).', v_saldo USING ERRCODE='check_violation';
  END IF;

  SELECT require_receipt_on_receivable_payment INTO v_require_receipt
    FROM public.financial_settings LIMIT 1;
  IF COALESCE(v_require_receipt,false) AND NOT v_has_receipt THEN
    RAISE EXCEPTION 'Comprovante de recebimento é obrigatório.' USING ERRCODE='check_violation';
  END IF;

  BEGIN
    INSERT INTO public.receivable_payments (
      organization_id, installment_id, payment_date, amount_received, payment_method_id, bank_account_id,
      discount_amount, interest_amount, penalty_amount, notes, created_by,
      idempotency_key, request_fingerprint
    ) VALUES (
      v_org, p_installment_id, v_pay_date, v_amount, v_pm, v_ba,
      v_disc, v_int, v_pen, v_notes, v_uid, v_idem, v_fp
    ) RETURNING id INTO v_payment_id;
  EXCEPTION WHEN unique_violation THEN
    SELECT id, request_fingerprint INTO v_existing FROM public.receivable_payments
     WHERE installment_id = p_installment_id AND idempotency_key = v_idem;
    IF v_existing.request_fingerprint IS NOT NULL AND v_existing.request_fingerprint <> v_fp THEN
      RAISE EXCEPTION 'FIN_IDEMPOTENCY_CONFLICT: mesma idempotency_key com payload divergente.'
        USING ERRCODE='check_violation';
    END IF;
    RETURN v_existing.id;
  END;

  INSERT INTO public.financial_audit_log (entity_type, entity_id, action, new_data, performed_by)
  VALUES ('receivable_payments', v_payment_id, 'PAYMENT_REGISTERED',
    jsonb_build_object('installment_id', p_installment_id, 'amount', v_amount,
      'payment_method_id', v_pm, 'bank_account_id', v_ba, 'payment_date', v_pay_date,
      'idempotency_key', v_idem, 'request_fingerprint', v_fp), v_uid);

  RETURN v_payment_id;
END $function$;
CREATE OR REPLACE FUNCTION platform_private.b2b_fiscal_invoice_bridge_v1(p_invoice uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE inv public.fiscal_invoices; po public.partner_orders; tx public.fiscal_sefaz_transmissions;
 org uuid; items jsonb; snapshot_items jsonb; canonical_snapshot jsonb; digest_snapshot jsonb; digest text; result jsonb;
 existing platform_private.b2b_authorized_documents; saved platform_private.b2b_fiscal_invoice_snapshots;
BEGIN
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'B2B_READ_COMMITTED_REQUIRED' USING ERRCODE='0A000'; END IF;
 SELECT * INTO inv FROM public.fiscal_invoices WHERE id=p_invoice FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'FISCAL_INVOICE_NOT_FOUND' USING ERRCODE='42501'; END IF;
 IF inv.normalized_status IS DISTINCT FROM 'AUTHORIZED' THEN
  RETURN jsonb_build_object('success',true,'skipped',true,'reason',coalesce(inv.normalized_status,inv.status),'receivable_id',NULL);
 END IF;
 -- Nenhum vínculo B2B: preserva o fluxo fiscal existente. Qualquer vínculo parcial,
 -- item de pedido ou documento B4 existente torna a nota B2B e falha fechado se inválida.
 IF inv.partner_order_id IS NULL AND inv.debtor_partner_id IS NULL
  AND NOT EXISTS(SELECT 1 FROM public.fiscal_invoice_items i WHERE i.fiscal_invoice_id=inv.id AND i.partner_order_item_id IS NOT NULL)
  AND NOT EXISTS(SELECT 1 FROM platform_private.b2b_authorized_documents d WHERE d.id=inv.id) THEN
  RETURN jsonb_build_object('success',true,'skipped',true,'reason','NON_B2B','receivable_id',NULL);
 END IF;
 IF inv.partner_order_id IS NULL OR inv.debtor_partner_id IS NULL THEN
  RAISE EXCEPTION 'B2B_FISCAL_ORDER_SCOPE_INVALID' USING ERRCODE='42501';
 END IF;
 IF inv.invoice_type='NFSE' THEN RAISE EXCEPTION 'B2B_FISCAL_NFSE_CALLBACK_UNPROVEN' USING ERRCODE='42501'; END IF;
 IF inv.invoice_type IS DISTINCT FROM 'NFE' OR inv.authorized_at IS NULL OR inv.issue_date IS NULL
  OR inv.environment IS DISTINCT FROM 'HOMOLOGATION' OR coalesce(inv.access_key,'')!~'^[0-9]{44}$'
 THEN RAISE EXCEPTION 'B2B_FISCAL_CONFIRMATION_UNPROVEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO saved FROM platform_private.b2b_fiscal_invoice_snapshots WHERE invoice_id=inv.id;
 IF saved.invoice_id IS NOT NULL THEN
  SELECT * INTO tx FROM public.fiscal_sefaz_transmissions t
  WHERE t.id=saved.transmission_id AND t.fiscal_invoice_id=inv.id AND t.state='SUCCEEDED' AND t.outcome='AUTHORIZED'
   AND coalesce(t.protocol_c_stat,t.c_stat) IN ('100','150') AND t.ch_nfe=inv.access_key AND t.n_prot IS NOT NULL AND t.ambiente_retorno='2'
  FOR UPDATE;
 ELSE
  SELECT * INTO tx FROM public.fiscal_sefaz_transmissions t
  WHERE t.fiscal_invoice_id=inv.id AND t.state='SUCCEEDED' AND t.outcome='AUTHORIZED'
   AND coalesce(t.protocol_c_stat,t.c_stat) IN ('100','150') AND t.ch_nfe=inv.access_key AND t.n_prot IS NOT NULL AND t.ambiente_retorno='2'
  ORDER BY t.completed_at ASC NULLS LAST,t.id ASC LIMIT 1 FOR UPDATE;
 END IF;
 IF tx.id IS NULL OR NOT EXISTS(SELECT 1 FROM public.fiscal_xml_runs r
   WHERE r.fiscal_invoice_id=inv.id AND r.signed_path IS NOT NULL AND (r.access_key IS NULL OR r.access_key=inv.access_key))
 THEN RAISE EXCEPTION 'B2B_FISCAL_CONFIRMATION_UNPROVEN' USING ERRCODE='42501'; END IF;
 SELECT c.organization_id INTO org FROM public.company_fiscal_settings c
 WHERE c.id=inv.company_settings_id AND c.is_active IS TRUE;
 IF org IS NULL OR inv.organization_id IS DISTINCT FROM org THEN RAISE EXCEPTION 'B2B_FISCAL_TENANT_MISMATCH' USING ERRCODE='42501'; END IF;
 SELECT * INTO po FROM public.partner_orders WHERE id=inv.partner_order_id FOR UPDATE;
 IF po.id IS NULL OR po.partner_id IS DISTINCT FROM inv.debtor_partner_id OR NOT EXISTS(
   SELECT 1 FROM public.partner_accounts pa WHERE pa.id=po.partner_id AND pa.commercial_owner_organization_id=org AND pa.ativo IS TRUE AND pa.deleted_at IS NULL
 ) THEN RAISE EXCEPTION 'B2B_FISCAL_ORDER_SCOPE_INVALID' USING ERRCODE='42501'; END IF;
 SELECT jsonb_agg(jsonb_build_object('item_id',x.partner_order_item_id,'quantity',x.quantity,
   'commercial_unit',x.commercial_unit,'taxable_quantity',x.taxable_quantity,'taxable_unit',x.taxable_unit) ORDER BY x.partner_order_item_id),
 jsonb_agg(jsonb_build_object('item_id',x.partner_order_item_id,'quantity',x.quantity,
   'commercial_unit',x.commercial_unit,'taxable_quantity',x.taxable_quantity,'taxable_unit',x.taxable_unit,'net_value',x.net_value) ORDER BY x.partner_order_item_id)
 INTO items,snapshot_items FROM (
   SELECT i.partner_order_item_id,sum(i.quantity) quantity,i.commercial_unit,sum(i.taxable_quantity) taxable_quantity,i.taxable_unit,sum(i.net_value) net_value
   FROM public.fiscal_invoice_items i WHERE i.fiscal_invoice_id=inv.id
    GROUP BY i.partner_order_item_id,i.commercial_unit,i.taxable_unit
 ) x;
 IF items IS NULL OR jsonb_array_length(items)=0 OR EXISTS(
   SELECT 1 FROM public.fiscal_invoice_items i LEFT JOIN public.partner_order_items oi ON oi.id=i.partner_order_item_id AND oi.order_id=po.id
   WHERE i.fiscal_invoice_id=inv.id AND (i.partner_order_item_id IS NULL OR oi.id IS NULL OR i.quantity IS NULL OR i.quantity<=0
    OR i.taxable_quantity IS NULL OR i.taxable_quantity<=0 OR i.commercial_unit IS NULL OR i.taxable_unit IS NULL OR i.net_value IS NULL OR i.net_value<0)
 ) OR (SELECT sum(i.net_value) FROM public.fiscal_invoice_items i WHERE i.fiscal_invoice_id=inv.id) IS DISTINCT FROM inv.total_amount
 THEN RAISE EXCEPTION 'B2B_FISCAL_ITEMS_UNPROVEN' USING ERRCODE='23514'; END IF;
 canonical_snapshot:=jsonb_build_object(
  'invoice_id',inv.id,'invoice_type',inv.invoice_type,'access_key',inv.access_key,'authorized_at',inv.authorized_at,
  'environment',inv.environment,'organization_id',inv.organization_id,'company_settings_id',inv.company_settings_id,
  'partner_order_id',inv.partner_order_id,'debtor_partner_id',inv.debtor_partner_id,'debtor_customer_id',inv.debtor_customer_id,
  'issue_date',inv.issue_date,'total_amount',inv.total_amount,'provider_reference',inv.provider_reference,
  'provider_status_raw',inv.provider_status_raw,'tax_authority_notes',inv.tax_authority_notes,
  'transmission_id',tx.id,'protocol',tx.n_prot,'transmission_c_stat',coalesce(tx.protocol_c_stat,tx.c_stat),
  'transmission_outcome',tx.outcome,'transmission_environment',tx.ambiente_retorno,'items',snapshot_items);
 -- O ID identifica a evidência original, mas não a identidade fiscal do evento.
 -- Nova confirmação da mesma chave/protocolo não altera digest nem referência.
 digest_snapshot:=canonical_snapshot-'transmission_id';
 digest:=encode(extensions.digest(convert_to(digest_snapshot::text,'UTF8'),'sha256'),'hex');
 SELECT * INTO existing FROM platform_private.b2b_authorized_documents WHERE id=inv.id;
 -- Uma confirmação divergente é negada pelo H12 no próprio callback; ela não
 -- contamina nem substitui a referência original usada por replays diretos.
 IF existing.id IS NOT NULL AND (saved.invoice_id IS NULL OR saved.source_digest IS DISTINCT FROM digest OR saved.snapshot IS DISTINCT FROM canonical_snapshot
   OR (existing.organization_id,existing.partner_id,existing.order_id,existing.kind,existing.issue_date,existing.event_key,existing.source_digest,existing.items,existing.state)
   IS DISTINCT FROM (org,po.partner_id,po.id,inv.invoice_type,inv.issue_date,'fiscal_invoice:'||inv.id::text,digest,items,'AUTHORIZED'))
 THEN RAISE EXCEPTION 'FISCAL_REPLAY_DIVERGENCE' USING ERRCODE='PT409'; END IF;
 -- Closed replay proves immutable fiscal evidence AND exact persisted allocation/title/event.
 -- No allocator dispatch with the event-sign actor: it is not a buyer/commercial actor.
 IF existing.id IS NOT NULL AND EXISTS(
  SELECT 1 FROM platform_private.b2b_document_allocations a
  JOIN public.accounts_receivable r ON r.id=a.receivable_id
  JOIN platform_private.b2b_financial_forecasts f ON f.order_id=po.id AND f.organization_id=org AND f.partner_id=po.partner_id
  JOIN platform_private.b2b_financial_forecast_events fe ON fe.forecast_id=f.id AND fe.event_type='FISCAL_CONFIRMED' AND fe.event_reference=inv.id::text AND fe.payload->>'receivable_id'=inv.receivable_id::text
  WHERE a.document_id=inv.id AND a.organization_id=org AND a.order_id=po.id AND a.source_digest=digest AND a.items=existing.items
   AND r.id=inv.receivable_id AND r.organization_id=org AND r.origin_id=po.id AND r.origin_type='B2B_ORDER' AND r.partner_id=po.partner_id AND r.b2b_document_id=inv.id
   AND NOT EXISTS(SELECT 1 FROM platform_private.b2b_allocation_reversals z WHERE z.document_id=inv.id)
 ) THEN
  INSERT INTO platform_private.b2b_fiscal_service_permits(transaction_id,invoice_id,document_id,organization_id,order_id,partner_id) VALUES(txid_current(),inv.id,inv.id,org,po.id,po.partner_id);
  PERFORM platform_private.b2b_integration_dependencies();
  DELETE FROM platform_private.b2b_fiscal_service_permits WHERE transaction_id=txid_current() AND invoice_id=inv.id;
  RETURN jsonb_build_object('success',true,'invoice_id',inv.id,'receivable_id',inv.receivable_id,'replayed',true,'closed_evidence_verified',true); END IF;
 IF existing.id IS NULL THEN
  INSERT INTO platform_private.b2b_fiscal_invoice_snapshots(invoice_id,transmission_id,protocol,source_digest,snapshot)
  VALUES(inv.id,tx.id,tx.n_prot,digest,canonical_snapshot);
  INSERT INTO platform_private.b2b_authorized_documents(id,organization_id,partner_id,order_id,kind,issue_date,event_key,source_digest,items,state)
  VALUES(inv.id,org,po.partner_id,po.id,inv.invoice_type,inv.issue_date,'fiscal_invoice:'||inv.id::text,digest,items,'AUTHORIZED');
 END IF;
 PERFORM 1 FROM platform_private.b2b_financial_forecasts WHERE order_id=po.id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM platform_private.b2b_financial_forecasts f WHERE f.order_id=po.id
  AND f.state IN ('cancelado_antes_nf','cancelado_residual')
  AND NOT EXISTS(SELECT 1 FROM platform_private.b2b_financial_forecast_events e
    WHERE e.forecast_id=f.id AND e.event_type='FISCAL_CONFIRMED' AND e.event_reference=inv.id::text)) THEN
  RAISE EXCEPTION 'B2B_FORECAST_RESIDUAL_CANCELED' USING ERRCODE='PT409';END IF;
 INSERT INTO platform_private.b2b_fiscal_service_permits(transaction_id,invoice_id,document_id,organization_id,order_id,partner_id)
 VALUES(txid_current(),inv.id,inv.id,org,po.id,po.partner_id);
 result:=platform_private.b2b_allocate_document(inv.id);
 PERFORM platform_private.b2b_financial_forecast_reconcile_fiscal_v1(inv.id,(result->>'receivable_id')::uuid);
 UPDATE public.fiscal_invoices SET receivable_id=(result->>'receivable_id')::uuid,updated_at=now() WHERE id=inv.id;
 INSERT INTO public.fiscal_audit_log(table_name,record_id,action,old_values,new_values,changed_by)
 VALUES('fiscal_invoices',inv.id,'UPDATE',jsonb_build_object('receivable_id',inv.receivable_id),
   jsonb_build_object('operation','B2B_RECEIVABLE_RECONCILED','receivable_id',result->>'receivable_id','document_id',inv.id,'replayed',result->>'replayed','source_digest',digest),NULL);
 DELETE FROM platform_private.b2b_fiscal_service_permits WHERE transaction_id=txid_current() AND invoice_id=inv.id;
 RETURN result||jsonb_build_object('invoice_id',inv.id,'skipped',false,'source_digest',digest);
END $function$;
CREATE OR REPLACE FUNCTION public.rpc_fiscal_invoice_apply_authorization_v1(_invoice_id uuid, _access_key text, _protocol text, _dh_recbto timestamp with time zone, _c_stat text, _x_motivo text, _transmission_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_inv public.fiscal_invoices%ROWTYPE; v_xml uuid; v_bridge jsonb; v_tx public.fiscal_sefaz_transmissions%ROWTYPE; v_saved platform_private.b2b_fiscal_invoice_snapshots%ROWTYPE;
BEGIN
  IF nullif(btrim(coalesce(_protocol,'')),'') IS NULL
     OR coalesce(_access_key,'') !~ '^[0-9]{44}$'
     OR _c_stat NOT IN ('100','150') OR _transmission_id IS NULL OR _dh_recbto IS NULL THEN
    RAISE EXCEPTION 'FISCAL_AUTHORIZATION_PAYLOAD_INVALID';
  END IF;

  SELECT * INTO v_inv FROM public.fiscal_invoices WHERE id = _invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FISCAL_INVOICE_NOT_FOUND'; END IF;
  IF coalesce(v_inv.environment,'HOMOLOGATION') = 'PRODUCTION' THEN
    RAISE EXCEPTION 'FISCAL_PRODUCTION_ENDPOINT_BLOCKED';
  END IF;

  SELECT * INTO v_tx FROM public.fiscal_sefaz_transmissions
   WHERE id=_transmission_id AND fiscal_invoice_id=_invoice_id FOR UPDATE;
  IF NOT FOUND OR v_tx.state IS DISTINCT FROM 'SUCCEEDED'
    OR v_tx.outcome IS DISTINCT FROM 'AUTHORIZED' OR coalesce(v_tx.protocol_c_stat,v_tx.c_stat) IS DISTINCT FROM _c_stat
    OR v_tx.ch_nfe IS DISTINCT FROM _access_key OR v_tx.n_prot IS DISTINCT FROM _protocol
    OR v_tx.ambiente_retorno IS DISTINCT FROM '2' THEN
    RAISE EXCEPTION 'FISCAL_AUTHORIZATION_TRANSMISSION_MISMATCH';
  END IF;

  -- Evidencia assinada e retorno protocolado sao obrigatorios tambem no replay.
  SELECT r.id INTO v_xml
    FROM public.fiscal_xml_runs r
   WHERE r.fiscal_invoice_id = _invoice_id
     AND r.signed_path IS NOT NULL
     AND (r.access_key IS NULL OR r.access_key = _access_key)
   ORDER BY coalesce(r.signed_at, r.updated_at) DESC LIMIT 1;
  IF v_xml IS NULL THEN RAISE EXCEPTION 'FISCAL_SIGNED_XML_REQUIRED'; END IF;

  -- A valid historical authorization cannot resurrect a finally cancelled invoice.
  IF v_inv.normalized_status='CANCELED' THEN
    SELECT * INTO v_saved FROM platform_private.b2b_fiscal_invoice_snapshots WHERE invoice_id=v_inv.id;
    IF v_saved.invoice_id IS NULL OR v_saved.transmission_id IS DISTINCT FROM v_tx.id OR v_saved.protocol IS DISTINCT FROM _protocol OR v_saved.snapshot->>'access_key' IS DISTINCT FROM _access_key OR v_saved.snapshot->>'transmission_c_stat' IS DISTINCT FROM _c_stat THEN RAISE EXCEPTION 'FISCAL_REPLAY_DIVERGENCE' USING ERRCODE='PT409'; END IF;
    IF NOT EXISTS(SELECT 1 FROM public.fiscal_events e JOIN public.fiscal_sefaz_transmissions ct ON ct.id=e.sefaz_transmission_id WHERE e.fiscal_invoice_id=v_inv.id AND e.event_type='SEFAZ_EVENT_REGISTERED' AND e.sefaz_event_code='110111' AND e.sefaz_c_stat IN ('135','155') AND ct.fiscal_invoice_id=v_inv.id AND ct.outcome='EVENT_REGISTERED' AND ct.state='SUCCEEDED' AND ct.ch_nfe=v_inv.access_key AND ct.n_prot=e.sefaz_n_prot) THEN RAISE EXCEPTION 'FISCAL_CANCEL_UNPROVEN' USING ERRCODE='PT409'; END IF;
    RETURN jsonb_build_object('invoiceId',v_inv.id,'applied',false,'normalizedStatus','CANCELED','receivableId',v_inv.receivable_id,'historicalAuthorizationVerified',true);
  END IF;
  -- Idempotente: documento ja autorizado nunca e reescrito, mas a ponte revalida o snapshot.
  IF v_inv.normalized_status = 'AUTHORIZED' THEN
    IF coalesce(v_inv.access_key,'') <> _access_key THEN
      RAISE EXCEPTION 'FISCAL_AUTHORIZATION_CONFLICT: documento ja autorizado com outra chave.';
    END IF;
    SELECT * INTO v_saved FROM platform_private.b2b_fiscal_invoice_snapshots WHERE invoice_id=v_inv.id;
    IF v_saved.invoice_id IS NOT NULL AND (
      v_saved.protocol IS DISTINCT FROM _protocol
      OR v_saved.snapshot->>'access_key' IS DISTINCT FROM _access_key
      OR v_saved.snapshot->>'transmission_c_stat' IS DISTINCT FROM _c_stat
      OR v_saved.snapshot->>'transmission_environment' IS DISTINCT FROM v_tx.ambiente_retorno
    ) THEN RAISE EXCEPTION 'FISCAL_REPLAY_DIVERGENCE' USING ERRCODE='PT409'; END IF;
    v_bridge := platform_private.b2b_fiscal_invoice_bridge_v1(v_inv.id);
    RETURN jsonb_build_object('invoiceId', v_inv.id, 'applied', false,
      'normalizedStatus', v_inv.normalized_status,
      'reconciliationStatus', v_inv.reconciliation_status,
      'receivableId', v_bridge->>'receivable_id', 'b2bReplay', v_bridge->>'replayed',
      'b2bSkipped', v_bridge->>'skipped', 'b2bReason', v_bridge->>'reason');
  END IF;

  UPDATE public.fiscal_invoices
     SET status = 'ISSUED',
         normalized_status = 'AUTHORIZED',
         access_key = _access_key,
         authorized_at = coalesce(_dh_recbto, now()),
         provider_status_raw = coalesce(_c_stat, provider_status_raw),
         tax_authority_notes = coalesce(_x_motivo, tax_authority_notes),
         -- xml_document_id NAO e sobrescrito aqui: o nfeProc protocolado ainda
         -- nao e gerado/armazenado pelo transporte (gate documentado).
         reconciliation_status = 'PENDING',
         updated_at = now()
   WHERE id = _invoice_id;

  INSERT INTO public.fiscal_audit_log (table_name, record_id, action, old_values, new_values, changed_by)
  VALUES ('fiscal_invoices', _invoice_id, 'UPDATE',
          jsonb_build_object('normalizedStatus', v_inv.normalized_status, 'status', v_inv.status),
          jsonb_build_object('normalizedStatus','AUTHORIZED','status','ISSUED',
                             'accessKey', _access_key, 'protocol', _protocol,
                             'transmissionId', _transmission_id,
                             'signedXmlRunId', v_xml,
                             'protocoledXmlStored', false), NULL);

  v_bridge := platform_private.b2b_fiscal_invoice_bridge_v1(_invoice_id);
  RETURN jsonb_build_object('invoiceId', _invoice_id, 'applied', true,
    'receivableId', v_bridge->>'receivable_id', 'b2bReplay', v_bridge->>'replayed',
    'b2bSkipped', v_bridge->>'skipped', 'b2bReason', v_bridge->>'reason',
    'normalizedStatus','AUTHORIZED',
    'reconciliationStatus','PENDING',
    'signedXmlRunId', v_xml,
    'protocoledXmlStored', false);
END $function$;
CREATE OR REPLACE FUNCTION public.rpc_b2b_cancel_residual_capability_v1(p_order uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE org uuid;po public.partner_orders;f platform_private.b2b_financial_forecasts;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM platform_private.b2b_cancel_policy_gate_v1 WHERE singleton AND enabled) THEN RETURN jsonb_build_object('available',false); END IF;
 org:=platform_private.c2p1_internal_actor(ARRAY['administrador','gestor_comercial']::public.app_role[]);
 IF org IS NULL OR public._saas_user_has_feature(auth.uid(),'pedidos_b2b') IS NOT TRUE OR public._saas_user_has_feature(auth.uid(),'contas_receber') IS NOT TRUE THEN RETURN jsonb_build_object('available',false); END IF;
 SELECT * INTO po FROM public.partner_orders WHERE id=p_order AND EXISTS(SELECT 1 FROM public.partner_accounts pa WHERE pa.id=partner_id AND pa.commercial_owner_organization_id=org AND pa.ativo IS TRUE AND pa.deleted_at IS NULL);
 IF NOT FOUND OR po.approved_by IS NULL OR po.approved_at IS NULL OR po.status::text NOT IN ('aprovado','entregue') OR platform_private.c2p1_settings_allowed(po.partner_id,true) IS NOT TRUE OR platform_private.b2b_forecast_lifecycle_scope_v1('forecast_cancel',auth.uid(),org,po.partner_id,po.id) IS NOT TRUE THEN RETURN jsonb_build_object('available',false); END IF;
 SELECT * INTO f FROM platform_private.b2b_financial_forecasts WHERE order_id=po.id AND organization_id=org AND partner_id=po.partner_id;
 IF NOT FOUND OR f.residual_amount IS NULL OR f.residual_amount<=0 OR f.state NOT IN ('aguardando_fiscal','faturado_parcial') OR EXISTS(SELECT 1 FROM public.fiscal_invoices i JOIN platform_private.fiscal_close_pending cp ON cp.fiscal_invoice_id=i.id WHERE i.partner_order_id=po.id) OR EXISTS(SELECT 1 FROM public.fiscal_invoices i JOIN public.fiscal_sefaz_transmissions t ON t.fiscal_invoice_id=i.id WHERE i.partner_order_id=po.id AND t.state IN ('PENDING','SENT')) THEN RETURN jsonb_build_object('available',false); END IF;
 RETURN jsonb_build_object('available',true,'order_id',po.id,'version',f.version,'residual_amount',f.residual_amount);
END $fn$;
REVOKE ALL ON FUNCTION public.rpc_b2b_cancel_residual_capability_v1(uuid) FROM PUBLIC,anon,service_role;
REVOKE ALL ON FUNCTION public.rpc_b2b_cancel_residual_capability_v1(uuid) FROM authenticated;
CREATE OR REPLACE FUNCTION platform_private.b2b_cancel_confirmed_fiscal_v1(p_tx uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE t public.fiscal_sefaz_transmissions;e public.fiscal_events;i public.fiscal_invoices;r public.accounts_receivable;paid boolean;actor_org uuid;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM platform_private.b2b_cancel_policy_gate_v1 WHERE singleton AND enabled) THEN RETURN jsonb_build_object('final',false,'code','CANCEL_POLICY_DISABLED'); END IF;
 IF current_setting('transaction_isolation') IS DISTINCT FROM 'read committed' THEN RAISE EXCEPTION 'CANCEL_READ_COMMITTED_REQUIRED' USING ERRCODE='42501'; END IF;
 SELECT * INTO t FROM public.fiscal_sefaz_transmissions WHERE id=p_tx;
 IF NOT FOUND OR t.service<>'NFeRecepcaoEvento4' OR t.fiscal_event_id IS NULL THEN RETURN jsonb_build_object('final',false,'code','NOT_LINKED_CANCEL'); END IF;
 actor_org:=public.h15_actor_organization();
 IF actor_org IS NULL OR public.fn_fiscal_can_operate(auth.uid()) IS NOT TRUE THEN RAISE EXCEPTION 'FISCAL_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO i FROM public.fiscal_invoices WHERE id=t.fiscal_invoice_id AND organization_id=actor_org;
 IF NOT FOUND THEN RAISE EXCEPTION 'FISCAL_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM platform_private.b2b_cancel_policy_allowlist_v1 g WHERE g.actor_id=auth.uid() AND g.organization_id=i.organization_id AND g.invoice_id=i.id AND g.order_id=i.partner_order_id AND g.revoked_at IS NULL AND g.valid_from<=clock_timestamp() AND g.valid_until>clock_timestamp() AND g.synthetic) THEN RETURN jsonb_build_object('final',false,'code','CANCEL_POLICY_SCOPE_DENIED'); END IF;
 SELECT * INTO e FROM public.fiscal_events WHERE id=t.fiscal_event_id AND organization_id=i.organization_id AND fiscal_invoice_id=i.id;
 IF NOT FOUND OR e.event_type<>'SEFAZ_CANCELLATION_PREPARED' OR e.sefaz_event_code<>'110111' OR e.sefaz_access_key IS DISTINCT FROM i.access_key THEN RETURN jsonb_build_object('final',false,'code','NOT_LINKED_CANCEL'); END IF;
 -- 136 is registration without final linkage: consultation remains necessary.
 IF t.state<>'SUCCEEDED' OR t.outcome<>'EVENT_REGISTERED' OR t.c_stat NOT IN ('135','155') OR nullif(btrim(t.n_prot),'') IS NULL OR t.ch_nfe IS DISTINCT FROM i.access_key OR t.ambiente_retorno IS DISTINCT FROM '2' THEN RETURN jsonb_build_object('final',false,'code','FISCAL_CANCEL_NOT_FINAL'); END IF;
 IF NOT EXISTS(SELECT 1 FROM public.fiscal_events x WHERE x.related_event_id=e.id AND x.sefaz_transmission_id=t.id AND x.organization_id=i.organization_id AND x.fiscal_invoice_id=i.id AND x.event_type='SEFAZ_EVENT_REGISTERED' AND x.sefaz_c_stat=t.c_stat AND x.sefaz_n_prot=t.n_prot AND x.sefaz_access_key=i.access_key AND x.sefaz_event_code='110111' AND x.sefaz_seq_evento=e.sefaz_seq_evento) THEN RETURN jsonb_build_object('final',false,'code','FISCAL_CANCEL_UNPROVEN'); END IF;
 PERFORM 1 FROM public.fiscal_invoices WHERE id=i.id FOR UPDATE;
 IF public.h15_actor_organization() IS DISTINCT FROM actor_org OR public.fn_fiscal_can_operate(auth.uid()) IS NOT TRUE THEN RAISE EXCEPTION 'FISCAL_FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM platform_private.b2b_cancel_policy_gate_v1 WHERE singleton FOR SHARE;
 IF NOT EXISTS(SELECT 1 FROM platform_private.b2b_cancel_policy_gate_v1 WHERE singleton AND enabled) THEN RETURN jsonb_build_object('final',false,'code','CANCEL_POLICY_DISABLED'); END IF;
 SELECT * INTO i FROM public.fiscal_invoices WHERE id=i.id;
 PERFORM 1 FROM platform_private.b2b_cancel_policy_allowlist_v1 g WHERE g.actor_id=auth.uid() AND g.organization_id=i.organization_id AND g.invoice_id=i.id AND g.order_id=i.partner_order_id FOR SHARE;
 IF NOT EXISTS(SELECT 1 FROM platform_private.b2b_cancel_policy_allowlist_v1 g WHERE g.actor_id=auth.uid() AND g.organization_id=i.organization_id AND g.invoice_id=i.id AND g.order_id=i.partner_order_id AND g.revoked_at IS NULL AND g.valid_from<=clock_timestamp() AND g.valid_until>clock_timestamp() AND g.synthetic) THEN RETURN jsonb_build_object('final',false,'code','CANCEL_POLICY_SCOPE_DENIED'); END IF;
 IF i.normalized_status NOT IN ('AUTHORIZED','CANCELED') OR EXISTS(SELECT 1 FROM platform_private.fiscal_close_pending p WHERE p.fiscal_invoice_id=i.id AND p.error_code='FISCAL_AUTHORIZATION_CLOSE_PENDING') THEN RETURN jsonb_build_object('final',false,'code','FISCAL_AUTHORIZATION_RECONCILIATION_PENDING'); END IF;
 IF i.partner_order_id IS NULL OR i.debtor_partner_id IS NULL OR i.receivable_id IS NULL THEN RETURN jsonb_build_object('final',false,'code','FISCAL_CANCEL_TITLE_LINK_UNPROVEN'); END IF;
 IF NOT EXISTS(SELECT 1 FROM public.partner_orders po JOIN public.partner_accounts pa ON pa.id=po.partner_id WHERE po.id=i.partner_order_id AND po.partner_id=i.debtor_partner_id AND pa.commercial_owner_organization_id=i.organization_id) THEN RAISE EXCEPTION 'FISCAL_CANCEL_LINK_MISMATCH' USING ERRCODE='42501'; END IF;
 SELECT * INTO r FROM public.accounts_receivable WHERE id=i.receivable_id AND organization_id=i.organization_id AND b2b_document_id=i.id AND origin_type='B2B_ORDER' AND origin_id=i.partner_order_id AND partner_id=i.debtor_partner_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'FISCAL_CANCEL_LINK_MISMATCH' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.accounts_receivable_installments WHERE receivable_id=r.id ORDER BY id FOR UPDATE;
 IF public.h15_actor_organization() IS DISTINCT FROM actor_org OR public.fn_fiscal_can_operate(auth.uid()) IS NOT TRUE OR NOT EXISTS(SELECT 1 FROM public.partner_accounts pa WHERE pa.id=i.debtor_partner_id AND pa.commercial_owner_organization_id=i.organization_id AND pa.ativo IS TRUE AND pa.deleted_at IS NULL) THEN RAISE EXCEPTION 'FISCAL_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT EXISTS(SELECT 1 FROM public.receivable_payments p JOIN public.accounts_receivable_installments x ON x.id=p.installment_id WHERE x.receivable_id=r.id) OR EXISTS(SELECT 1 FROM public.accounts_receivable_installments x WHERE x.receivable_id=r.id AND (x.received_amount IS NULL OR x.received_amount<>0 OR x.status='PAID')) INTO paid;
 IF i.normalized_status<>'CANCELED' THEN UPDATE public.fiscal_invoices SET status='CANCELED',normalized_status='CANCELED',canceled_at=clock_timestamp(),cancel_reason=e.sefaz_reason,reconciliation_status=CASE WHEN paid THEN 'REQUIRES_REVIEW' ELSE 'RECONCILED' END WHERE id=i.id; END IF;
 IF paid THEN RETURN jsonb_build_object('final',true,'financialReconciliationRequired',true,'code','FISCAL_CANCEL_PAYMENT_REVIEW'); END IF;
 IF r.status='CANCELED' THEN RETURN jsonb_build_object('final',true,'financialReconciliationRequired',false,'idempotentReplay',true); END IF;
 IF r.status NOT IN ('OPEN','OVERDUE') OR EXISTS(SELECT 1 FROM public.accounts_receivable_installments x WHERE x.receivable_id=r.id AND (x.organization_id IS DISTINCT FROM i.organization_id OR x.status NOT IN ('OPEN','OVERDUE') OR x.discount_amount IS NULL OR x.discount_amount<>0)) OR NOT EXISTS(SELECT 1 FROM public.accounts_receivable_installments WHERE receivable_id=r.id) THEN RAISE EXCEPTION 'FISCAL_CANCEL_FINANCIAL_STATE_UNDECIDED' USING ERRCODE='PT409'; END IF;
 UPDATE public.accounts_receivable_installments SET status='CANCELED' WHERE receivable_id=r.id;
 UPDATE public.accounts_receivable SET status='CANCELED' WHERE id=r.id;
 INSERT INTO public.financial_audit_log(entity_type,entity_id,action,performed_by,reason,new_data) VALUES('accounts_receivable',r.id,'AR_CANCELED',auth.uid(),e.sefaz_reason,jsonb_build_object('source','FINAL_FISCAL_CANCELLATION','invoice_id',i.id,'transmission_id',t.id));
 RETURN jsonb_build_object('final',true,'financialReconciliationRequired',false,'idempotentReplay',false);
END $fn$;
REVOKE ALL ON FUNCTION platform_private.b2b_cancel_confirmed_fiscal_v1(uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.rpc_fiscal_sefaz_transmit_record_v1(_transmission_id uuid, _state text, _patch jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_row     public.fiscal_sefaz_transmissions;
  v_cur     public.fiscal_sefaz_transmissions;
  v_cstat   text;
  v_prot    text;
  v_outcome text;
  v_close_error text := NULL;
  v_cancel jsonb := NULL;
  v_invoice_id uuid;
BEGIN
  IF _state NOT IN ('SENT','SUCCEEDED','FAILED','BLOCKED') THEN
    RAISE EXCEPTION 'FISCAL_TRANSMISSION_STATE_INVALID';
  END IF;

  SELECT * INTO v_cur FROM public.fiscal_sefaz_transmissions WHERE id = _transmission_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'FISCAL_TRANSMISSION_NOT_FOUND'; END IF;
  IF v_cur.service='NFeRecepcaoEvento4' AND v_cur.fiscal_event_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.fiscal_invoices i WHERE i.id=v_cur.fiscal_invoice_id AND i.organization_id=public.h15_actor_organization() AND public.fn_fiscal_can_operate(auth.uid()) IS TRUE) THEN RAISE EXCEPTION 'FISCAL_FORBIDDEN' USING ERRCODE='42501'; END IF;
  v_invoice_id := v_cur.fiscal_invoice_id;
  IF v_invoice_id IS NOT NULL THEN
    PERFORM 1 FROM public.fiscal_invoices WHERE id=v_invoice_id FOR UPDATE;
  END IF;
  SELECT * INTO v_cur FROM public.fiscal_sefaz_transmissions WHERE id = _transmission_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FISCAL_TRANSMISSION_NOT_FOUND'; END IF;
  IF v_cur.fiscal_invoice_id IS DISTINCT FROM v_invoice_id THEN
    RAISE EXCEPTION 'FISCAL_TRANSMISSION_LINK_CHANGED' USING ERRCODE='PT409';
  END IF;

  v_cstat := coalesce(_patch->>'protocolCStat', _patch->>'cStat', v_cur.protocol_c_stat, v_cur.c_stat);
  v_prot  := coalesce(_patch->>'nProt', v_cur.n_prot);

  IF _state IN ('FAILED','BLOCKED') THEN
    v_outcome := 'TRANSPORT_ERROR';
  ELSIF _state = 'SENT' THEN
    v_outcome := 'PENDING';
  ELSIF v_cstat IN ('100','150') AND v_prot IS NOT NULL THEN
    v_outcome := 'AUTHORIZED';
  ELSIF v_cstat IN ('135','136','155') THEN
    v_outcome := 'EVENT_REGISTERED';
  ELSIF v_cstat IN ('103','105','104','106','107','108','109','111','128') THEN
    v_outcome := CASE WHEN v_cur.service = 'NFeStatusServico4'
                      THEN 'SERVICE_INFO' ELSE 'PROCESSING' END;
  ELSE
    v_outcome := 'REJECTED';
  END IF;

  IF v_cur.outcome = 'AUTHORIZED' AND v_outcome IS DISTINCT FROM 'AUTHORIZED' THEN
    RETURN jsonb_build_object(
      'transmissionId',v_cur.id,'state',v_cur.state,'outcome',v_cur.outcome,
      'cStat',v_cur.c_stat,'protocolCStat',coalesce(v_cur.protocol_c_stat,v_cur.c_stat),
      'xMotivo',v_cur.x_motivo,'chNFe',v_cur.ch_nfe,'nProt',v_cur.n_prot,'nRec',v_cur.n_rec,
      'reconciliationPending',EXISTS(SELECT 1 FROM platform_private.fiscal_close_pending cp WHERE cp.transmission_id=v_cur.id),
      'reconciliationCode',(SELECT cp.error_code FROM platform_private.fiscal_close_pending cp WHERE cp.transmission_id=v_cur.id));
  END IF;
  IF v_cur.outcome = 'AUTHORIZED' AND (
    v_cur.ch_nfe IS DISTINCT FROM coalesce(_patch->>'chNFe',v_cur.ch_nfe)
    OR v_cur.n_prot IS DISTINCT FROM v_prot
    OR coalesce(v_cur.protocol_c_stat,v_cur.c_stat) IS DISTINCT FROM v_cstat
  ) THEN RAISE EXCEPTION 'FISCAL_AUTHORIZATION_REPLAY_CONFLICT' USING ERRCODE='PT409'; END IF;

  IF v_cur.state IN ('SUCCEEDED','FAILED','BLOCKED') THEN
    -- A guarda canonica torna a transmissao terminal imutavel. O replay exato
    -- reutiliza a evidencia; somente o fechamento documental pode ser retentado.
    v_row := v_cur;
  ELSE
    UPDATE public.fiscal_sefaz_transmissions SET
    state            = _state,
    outcome          = v_outcome,
    c_stat           = coalesce(_patch->>'cStat', c_stat),
    protocol_c_stat  = CASE WHEN _patch ? 'protocolCStat' THEN _patch->>'protocolCStat'
                            WHEN _patch->>'cStat' IN ('100','150') THEN _patch->>'cStat'
                            ELSE protocol_c_stat END,
    x_motivo         = coalesce(_patch->>'xMotivo', x_motivo),
    ch_nfe           = coalesce(_patch->>'chNFe', ch_nfe),
    n_prot           = coalesce(_patch->>'nProt', n_prot),
    n_rec            = coalesce(_patch->>'nRec', n_rec),
    ambiente_retorno = coalesce(_patch->>'tpAmb', ambiente_retorno),
    dh_recbto        = coalesce((_patch->>'dhRecbto')::timestamptz, dh_recbto),
    error_code       = coalesce(_patch->>'errorCode', error_code),
    response_summary = coalesce(_patch->'responseSummary', response_summary),
    completed_at     = CASE WHEN _state IN ('SUCCEEDED','FAILED','BLOCKED')
                            THEN now() ELSE completed_at END
  WHERE id = _transmission_id
  RETURNING * INTO v_row;
  END IF;

  IF v_row.ambiente_retorno IS NOT NULL AND v_row.ambiente_retorno <> '2' THEN
    RAISE EXCEPTION 'FISCAL_PRODUCTION_ENDPOINT_BLOCKED';
  END IF;

  IF v_row.service = 'NFeRecepcaoEvento4' AND v_row.fiscal_event_id IS NOT NULL
     AND _state = 'SUCCEEDED' AND v_cstat IS NOT NULL THEN
    BEGIN
      PERFORM public.rpc_fiscal_event_sefaz_reconcile_v1(
        v_row.fiscal_event_id, v_row.id, v_cstat,
        coalesce(_patch->>'xMotivo', ''), v_row.n_prot, v_row.dh_recbto);
      v_cancel:=platform_private.b2b_cancel_confirmed_fiscal_v1(v_row.id);
      IF v_cancel->>'code' IN ('FISCAL_AUTHORIZATION_RECONCILIATION_PENDING','FISCAL_CANCEL_TITLE_LINK_UNPROVEN') THEN v_close_error:='FISCAL_EVENT_RECONCILIATION_PENDING'; END IF;
    EXCEPTION WHEN OTHERS THEN
      v_close_error := 'FISCAL_EVENT_RECONCILIATION_PENDING';
    END;
  END IF;

  -- H13: o fechamento documental nao pode descartar o retorno ja recebido.
  IF v_row.outcome = 'AUTHORIZED' AND v_row.fiscal_invoice_id IS NOT NULL
     AND v_row.ch_nfe IS NOT NULL AND v_row.n_prot IS NOT NULL THEN
    BEGIN
      PERFORM public.rpc_fiscal_invoice_apply_authorization_v1(
        v_row.fiscal_invoice_id, v_row.ch_nfe, v_row.n_prot, v_row.dh_recbto,
        coalesce(v_row.protocol_c_stat,v_row.c_stat), v_row.x_motivo, v_row.id);
    EXCEPTION WHEN OTHERS THEN
      v_close_error := 'FISCAL_AUTHORIZATION_CLOSE_PENDING';
    END;
  END IF;

  IF v_close_error IS NOT NULL THEN
    INSERT INTO platform_private.fiscal_close_pending(transmission_id,fiscal_invoice_id,error_code)
    VALUES(v_row.id,v_row.fiscal_invoice_id,v_close_error)
    ON CONFLICT(transmission_id) DO UPDATE SET fiscal_invoice_id=EXCLUDED.fiscal_invoice_id,
      error_code=EXCLUDED.error_code,last_error_at=now(),attempts=platform_private.fiscal_close_pending.attempts+1;
  ELSIF v_cancel->>'final'='true' THEN
    DELETE FROM platform_private.fiscal_close_pending WHERE transmission_id=v_row.id AND error_code='FISCAL_EVENT_RECONCILIATION_PENDING';
  ELSIF v_row.outcome = 'AUTHORIZED' THEN
    DELETE FROM platform_private.fiscal_close_pending
     WHERE transmission_id=v_row.id AND error_code='FISCAL_AUTHORIZATION_CLOSE_PENDING';
  END IF;

  RETURN jsonb_build_object(
    'cancellation',v_cancel,
    'transmissionId', v_row.id, 'state', v_row.state, 'outcome', v_row.outcome,
    'cStat', v_row.c_stat, 'protocolCStat', coalesce(v_row.protocol_c_stat,v_row.c_stat), 'xMotivo', v_row.x_motivo,
    'chNFe', v_row.ch_nfe, 'nProt', v_row.n_prot, 'nRec', v_row.n_rec,
    'reconciliationPending',EXISTS(SELECT 1 FROM platform_private.fiscal_close_pending cp WHERE cp.transmission_id=v_row.id),
    'reconciliationCode',(SELECT cp.error_code FROM platform_private.fiscal_close_pending cp WHERE cp.transmission_id=v_row.id));
END $function$;

REVOKE EXECUTE ON FUNCTION public.rpc_b2b_forecast_cancel_residual_v1(uuid,integer,text) FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE platform_private.b2b_cancel_policy_gate_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_private.b2b_cancel_policy_allowlist_v1 ENABLE ROW LEVEL SECURITY;
