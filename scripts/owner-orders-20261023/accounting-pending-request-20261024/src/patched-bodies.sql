CREATE OR REPLACE FUNCTION platform_private.c2_external_origin_assert(s jsonb, partner uuid, client uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE uid uuid:=auth.uid(); org uuid; p public.partner_accounts;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE='42501'; END IF;
 SELECT * INTO p FROM public.partner_accounts WHERE id=partner FOR SHARE;
 org:=p.commercial_owner_organization_id;
 IF NOT FOUND OR p.ativo IS NOT TRUE OR p.deleted_at IS NOT NULL OR org IS NULL
 OR NOT EXISTS(SELECT 1 FROM public.organizations o WHERE o.id=org AND o.ativo AND o.status='ativa')
 OR EXISTS(SELECT 1 FROM public.organizations o WHERE o.partner_account_id=partner)
 OR NOT platform_private.c2_external_origin_contract_valid(s)
 OR s->>'organization_id' IS DISTINCT FROM org::text OR s->>'partner_id' IS DISTINCT FROM partner::text
 THEN RAISE EXCEPTION 'C2_EXTERNAL_ORIGIN_DENIED' USING ERRCODE='42501'; END IF;
 IF client IS DISTINCT FROM p.client_id OR (client IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.clientes c WHERE c.id=client AND c.organization_id=org))
 THEN RAISE EXCEPTION 'C2_EXTERNAL_CLIENT_DENIED' USING ERRCODE='42501'; END IF;
 -- Initial writes are authorized only inside the existing canonical create transaction.
 -- Subsequent administration uses P1's active internal owner authority, never buyer roles.
 IF platform_private.has_ticket('c2_external_order_create',partner) THEN
  IF s->>'actor_user_id' IS DISTINCT FROM uid::text OR NOT platform_private.c2_owner_order_create_allowed(uid,partner)
  THEN RAISE EXCEPTION 'C2_EXTERNAL_CREATE_DENIED' USING ERRCODE='42501'; END IF;
  ELSE
  IF public.h15_actor_organization() IS DISTINCT FROM org OR NOT platform_private.c2p1_settings_allowed(partner,true)
  THEN RAISE EXCEPTION 'C2_EXTERNAL_OWNER_DENIED' USING ERRCODE='42501'; END IF;
 END IF;
END $function$
CREATE OR REPLACE FUNCTION platform_private.b2b_internal_order_snapshot_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE org uuid; uid uuid:=auth.uid(); cs public.company_fiscal_settings; candidate_count integer; economic jsonb; terms public.partner_order_payment_terms; items jsonb; schedule jsonb;
BEGIN

 -- Explicit external proof; NULL internal origin alone never authorizes a legacy order.
 IF TG_OP='INSERT' AND platform_private.has_ticket('c2_external_order_create',NEW.partner_id) THEN
  IF NEW.c2_external_origin_snapshot IS NOT NULL OR NEW.internal_origin_snapshot IS NOT NULL OR NEW.internal_economic_snapshot IS NOT NULL
  THEN RAISE EXCEPTION 'B2B_INTERNAL_SNAPSHOT_SERVER_ONLY' USING ERRCODE='42501'; END IF;
  IF NOT platform_private.c2_owner_order_create_allowed(uid,NEW.partner_id) OR NEW.created_by IS DISTINCT FROM uid
  THEN RAISE EXCEPTION 'C2_EXTERNAL_CREATE_DENIED' USING ERRCODE='42501'; END IF;
  SELECT p.commercial_owner_organization_id,p.client_id INTO org,NEW.cliente_id FROM public.partner_accounts p WHERE p.id=NEW.partner_id FOR SHARE;
  SELECT count(*) INTO candidate_count FROM public.company_fiscal_settings c WHERE c.organization_id=org AND c.is_active;
  IF candidate_count>1 THEN RAISE EXCEPTION 'B2B_INTERNAL_ISSUER_AMBIGUOUS' USING ERRCODE='42501'; END IF;
  IF candidate_count=1 THEN SELECT * INTO cs FROM public.company_fiscal_settings c WHERE c.organization_id=org AND c.is_active FOR SHARE; END IF;
  IF candidate_count=1 AND cs.configuration_status='VALIDATED' AND cs.accounting_validated_at IS NOT NULL AND nullif(btrim(cs.legal_name),'') IS NOT NULL AND nullif(btrim(cs.cnpj),'') IS NOT NULL THEN
    NEW.c2_external_origin_snapshot:=jsonb_build_object('contract','C2_EXTERNAL_ORDER_ORIGIN_V1','schema_version','1','organization_id',org,'creditor_organization_id',org,'issuer_organization_id',org,'company_settings_id',cs.id,'company_configuration_version',cs.configuration_version,'issuer_legal_name',cs.legal_name,'issuer_cnpj',cs.cnpj,'actor_user_id',uid,'partner_id',NEW.partner_id);
  ELSE
   -- C2_ACCOUNTING_PENDING_V1: honest non-fiscal request; no issuer identity/attestation is copied or invented.
   NEW.c2_external_origin_snapshot:=jsonb_build_object('contract','C2_EXTERNAL_ORDER_REQUEST_PENDING_ACCOUNTING_V1','schema_version','1','organization_id',org,'creditor_organization_id',org,'actor_user_id',uid,'partner_id',NEW.partner_id,'issuer_state',CASE WHEN candidate_count=0 THEN 'NOT_CONFIGURED' ELSE coalesce(cs.configuration_status,'UNKNOWN') END,'company_settings_id',cs.id,'accounting_validated',false);
  END IF;
  PERFORM platform_private.c2_external_origin_assert(NEW.c2_external_origin_snapshot,NEW.partner_id,NEW.cliente_id);
  IF NEW.ready_for_production OR NEW.status NOT IN ('em_analise_comercial','aguardando_cotacao','aguardando_aprovacao_credito') THEN RAISE EXCEPTION 'C2_EXTERNAL_INITIAL_STATE_DENIED' USING ERRCODE='42501'; END IF;
  RETURN NEW;
 END IF;
 IF TG_OP='INSERT' AND NEW.c2_external_origin_snapshot IS NOT NULL THEN RAISE EXCEPTION 'B2B_INTERNAL_SNAPSHOT_SERVER_ONLY' USING ERRCODE='42501'; END IF;
 IF TG_OP='UPDATE' AND (OLD.c2_external_origin_snapshot IS NOT NULL OR NEW.c2_external_origin_snapshot IS NOT NULL) THEN
  IF (NEW.c2_external_origin_snapshot IS DISTINCT FROM OLD.c2_external_origin_snapshot AND NOT platform_private.c2_accounting_promotion_ok(OLD.c2_external_origin_snapshot,NEW.c2_external_origin_snapshot,NEW.id)) OR NEW.internal_origin_snapshot IS DISTINCT FROM OLD.internal_origin_snapshot OR NEW.internal_economic_snapshot IS DISTINCT FROM OLD.internal_economic_snapshot
  THEN RAISE EXCEPTION 'B2B_INTERNAL_SNAPSHOT_IMMUTABLE' USING ERRCODE='42501'; END IF;
  PERFORM platform_private.c2_external_origin_assert(OLD.c2_external_origin_snapshot,OLD.partner_id,OLD.cliente_id);
  PERFORM platform_private.c2_external_origin_assert(NEW.c2_external_origin_snapshot,NEW.partner_id,NEW.cliente_id);
  IF NEW.partner_id IS DISTINCT FROM OLD.partner_id OR NEW.cliente_id IS DISTINCT FROM OLD.cliente_id OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN RAISE EXCEPTION 'B2B_INTERNAL_IDENTITY_IMMUTABLE' USING ERRCODE='42501'; END IF;
  IF NEW.ready_for_production OR public.fn_b2b_status_is_operational(NEW.status) THEN RAISE EXCEPTION 'B2B_INTERNAL_DOWNSTREAM_UNVERIFIED' USING ERRCODE='42501'; END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND OLD.status IN ('cancelado','reprovado') THEN RAISE EXCEPTION 'B2B_INTERNAL_TERMINAL_STATUS' USING ERRCODE='42501'; END IF;
  IF OLD.internal_economic_snapshot IS NOT NULL AND (to_jsonb(NEW)-ARRAY['status','updated_at','approval_notes','estimated_delivery_date','financial_status','receivable_generated','receivable_generated_at','receivable_generated_by','future_financial_link','commercial_notes','payment_due_date','payment_method']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','updated_at','approval_notes','estimated_delivery_date','financial_status','receivable_generated','receivable_generated_at','receivable_generated_by','future_financial_link','commercial_notes','payment_due_date','payment_method']) THEN RAISE EXCEPTION 'B2B_INTERNAL_ECONOMICS_IMMUTABLE' USING ERRCODE='42501'; END IF;
 IF NEW.status='aprovado' AND OLD.status IS DISTINCT FROM NEW.status THEN
  IF NOT (public.has_role(uid,'administrador'::public.app_role) OR public.has_role(uid,'gestor_comercial'::public.app_role)) OR OLD.status NOT IN ('em_analise_comercial','solicitado','rascunho') OR NEW.payment_condition_status IS DISTINCT FROM 'defined' THEN RAISE EXCEPTION 'B2B_INTERNAL_APPROVAL_DENIED' USING ERRCODE='42501'; END IF;
  SELECT * INTO terms FROM public.partner_order_payment_terms t WHERE t.id=NEW.payment_terms_id AND t.partner_order_id=NEW.id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'B2B_INTERNAL_TERMS_REQUIRED' USING ERRCODE='42501'; END IF;
  IF NEW.total IS NULL OR NEW.total::text IN ('NaN','Infinity','-Infinity') OR NEW.total<0 OR terms.final_amount IS DISTINCT FROM NEW.total OR NEW.desconto_total<0 THEN RAISE EXCEPTION 'B2B_INTERNAL_TOTAL_INVALID' USING ERRCODE='22023'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.partner_order_items i WHERE i.order_id=NEW.id) OR EXISTS(SELECT 1 FROM public.partner_order_items i WHERE i.order_id=NEW.id AND (i.quantidade IS NULL OR i.quantidade<=0 OR i.quantidade::text IN ('NaN','Infinity','-Infinity') OR i.preco_unitario IS NULL OR i.preco_unitario<0 OR i.preco_unitario::text IN ('NaN','Infinity','-Infinity') OR i.desconto_percentual IS NULL OR i.desconto_percentual<0 OR i.desconto_percentual>100 OR i.desconto_percentual::text IN ('NaN','Infinity','-Infinity'))) THEN RAISE EXCEPTION 'B2B_INTERNAL_ITEM_INVALID' USING ERRCODE='22023'; END IF;
  SELECT jsonb_agg(to_jsonb(i)-ARRAY['created_at'] ORDER BY i.id) INTO items FROM public.partner_order_items i WHERE i.order_id=NEW.id;
  SELECT jsonb_agg(to_jsonb(s)-ARRAY['created_at','status','receivable_installment_id'] ORDER BY s.installment_number,s.id) INTO schedule FROM public.partner_order_payment_schedule s WHERE s.partner_order_id=NEW.id AND s.payment_terms_id=terms.id;
  IF schedule IS NULL THEN RAISE EXCEPTION 'B2B_INTERNAL_SCHEDULE_REQUIRED' USING ERRCODE='22023'; END IF;
 IF NEW.subtotal IS NULL OR NEW.desconto_total IS NULL OR NEW.subtotal::text IN ('NaN','Infinity','-Infinity') OR NEW.desconto_total::text IN ('NaN','Infinity','-Infinity') OR NEW.subtotal<0 OR NEW.desconto_total<0 OR NEW.desconto_total>NEW.subtotal OR terms.discount_percent_snapshot IS NULL OR terms.discount_percent_snapshot::text IN ('NaN','Infinity','-Infinity') OR terms.discount_percent_snapshot<0 OR terms.discount_percent_snapshot>100 THEN RAISE EXCEPTION 'B2B_INTERNAL_TOTAL_INVALID' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM public.partner_order_items i WHERE i.order_id=NEW.id AND (i.subtotal IS NULL OR i.subtotal<0 OR i.subtotal::text IN ('NaN','Infinity','-Infinity'))) OR (SELECT round(sum(i.subtotal),2) FROM public.partner_order_items i WHERE i.order_id=NEW.id) IS DISTINCT FROM round(terms.net_amount_after_discount,2) THEN RAISE EXCEPTION 'B2B_INTERNAL_ITEM_INVALID' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM public.partner_order_payment_schedule s WHERE s.partner_order_id=NEW.id AND (s.payment_terms_id IS DISTINCT FROM terms.id OR s.installment_number<=0 OR s.due_date IS NULL OR s.amount IS NULL OR s.principal_amount IS NULL OR s.interest_amount IS NULL OR s.amount<0 OR s.principal_amount<0 OR s.interest_amount<0 OR s.amount::text IN ('NaN','Infinity','-Infinity') OR s.principal_amount::text IN ('NaN','Infinity','-Infinity') OR s.interest_amount::text IN ('NaN','Infinity','-Infinity'))) OR (SELECT count(*) FROM public.partner_order_payment_schedule s WHERE s.partner_order_id=NEW.id) IS DISTINCT FROM terms.installment_count::bigint OR (SELECT count(DISTINCT s.installment_number) FROM public.partner_order_payment_schedule s WHERE s.partner_order_id=NEW.id) IS DISTINCT FROM terms.installment_count::bigint OR (SELECT round(sum(s.amount),2) FROM public.partner_order_payment_schedule s WHERE s.partner_order_id=NEW.id) IS DISTINCT FROM round(terms.final_amount,2) THEN RAISE EXCEPTION 'B2B_INTERNAL_SCHEDULE_INVALID' USING ERRCODE='22023'; END IF;
  economic:=jsonb_build_object('schema_version','1','origin',OLD.c2_external_origin_snapshot,'items',items,'terms',to_jsonb(terms)-ARRAY['updated_at','approval_status','approved_by','approved_at','approval_notes'],'schedule',schedule,'subtotal',NEW.subtotal,'discount',NEW.desconto_total,'total',NEW.total,'sealed_by',uid);
  NEW.internal_economic_snapshot:=economic;

 END IF;
 RETURN NEW;
 END IF;
 IF TG_OP='INSERT' THEN
  IF uid IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE='42501'; END IF;
  org:=public.h15_actor_organization();
  IF org IS NULL OR NOT public.fn_cc_can_prepare(uid) OR NOT public._saas_user_has_feature(uid,'pedidos_b2b') THEN RAISE EXCEPTION 'B2B_INTERNAL_ACTOR_DENIED' USING ERRCODE='42501'; END IF;
  -- No client/CNPJ/organizations.partner_account_id inference. All caller snapshots rejected.
  IF NEW.internal_origin_snapshot IS NOT NULL OR NEW.internal_economic_snapshot IS NOT NULL THEN RAISE EXCEPTION 'B2B_INTERNAL_SNAPSHOT_SERVER_ONLY' USING ERRCODE='42501'; END IF;
  SELECT count(*) INTO candidate_count FROM public.company_fiscal_settings c WHERE c.organization_id=org AND c.is_active IS TRUE;
  IF candidate_count<>1 THEN RAISE EXCEPTION 'B2B_INTERNAL_ISSUER_AMBIGUOUS' USING ERRCODE='42501'; END IF;
  SELECT * INTO cs FROM public.company_fiscal_settings c WHERE c.organization_id=org AND c.is_active IS TRUE FOR SHARE;
  IF cs.configuration_status IS DISTINCT FROM 'VALIDATED' OR cs.accounting_validated_at IS NULL OR nullif(btrim(cs.legal_name),'') IS NULL OR nullif(btrim(cs.cnpj),'') IS NULL THEN RAISE EXCEPTION 'B2B_INTERNAL_ISSUER_NOT_VALIDATED' USING ERRCODE='42501'; END IF;
  NEW.internal_origin_snapshot:=jsonb_build_object('schema_version','1','organization_id',org,'creditor_organization_id',org,'issuer_organization_id',org,'company_settings_id',cs.id,'company_configuration_version',cs.configuration_version,'issuer_legal_name',cs.legal_name,'issuer_cnpj',cs.cnpj,'actor_user_id',uid,'partner_id',NEW.partner_id);
  PERFORM platform_private.b2b_internal_assert_origin(NEW.internal_origin_snapshot,NEW.partner_id,NEW.cliente_id);
  IF NEW.ready_for_production IS TRUE THEN RAISE EXCEPTION 'B2B_INTERNAL_DOWNSTREAM_UNVERIFIED' USING ERRCODE='42501'; END IF; IF NEW.status IN ('aprovado','em_producao','produzido','aguardando_entrega','confirmado','em_separacao','enviado','entregue','faturado') THEN RAISE EXCEPTION 'B2B_INTERNAL_INITIAL_STATUS_DENIED' USING ERRCODE='42501'; END IF;
  RETURN NEW;
 END IF;
 IF NEW.internal_origin_snapshot IS DISTINCT FROM OLD.internal_origin_snapshot OR NEW.internal_economic_snapshot IS DISTINCT FROM OLD.internal_economic_snapshot THEN RAISE EXCEPTION 'B2B_INTERNAL_SNAPSHOT_IMMUTABLE' USING ERRCODE='42501'; END IF;
 IF OLD.internal_origin_snapshot IS NULL THEN
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('aprovado','em_producao','produzido','aguardando_entrega','confirmado','em_separacao','enviado','entregue','faturado') THEN RAISE EXCEPTION 'B2B_INTERNAL_LEGACY_ORIGIN_UNPROVEN' USING ERRCODE='42501'; END IF;
  RETURN NEW;
 END IF;
 PERFORM platform_private.b2b_internal_assert_origin(OLD.internal_origin_snapshot,OLD.partner_id,OLD.cliente_id);
 IF NEW.partner_id IS DISTINCT FROM OLD.partner_id OR NEW.cliente_id IS DISTINCT FROM OLD.cliente_id OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN RAISE EXCEPTION 'B2B_INTERNAL_IDENTITY_IMMUTABLE' USING ERRCODE='42501'; END IF;
 IF OLD.internal_economic_snapshot IS NOT NULL AND (to_jsonb(NEW)-ARRAY['status','updated_at','approval_notes','estimated_delivery_date','ready_for_production','financial_status','receivable_generated','receivable_generated_at','receivable_generated_by','future_financial_link','commercial_notes']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','updated_at','approval_notes','estimated_delivery_date','ready_for_production','financial_status','receivable_generated','receivable_generated_at','receivable_generated_by','future_financial_link','commercial_notes']) THEN RAISE EXCEPTION 'B2B_INTERNAL_ECONOMICS_IMMUTABLE' USING ERRCODE='42501'; END IF;
 IF NEW.status IS DISTINCT FROM OLD.status AND OLD.status IN ('cancelado','reprovado') THEN RAISE EXCEPTION 'B2B_INTERNAL_TERMINAL_STATUS' USING ERRCODE='42501'; END IF;
 IF NEW.ready_for_production IS TRUE THEN RAISE EXCEPTION 'B2B_INTERNAL_DOWNSTREAM_UNVERIFIED' USING ERRCODE='42501'; END IF; IF public.fn_b2b_status_is_operational(NEW.status) THEN RAISE EXCEPTION 'B2B_INTERNAL_DOWNSTREAM_UNVERIFIED' USING ERRCODE='42501'; END IF; IF NEW.ready_for_production IS TRUE AND NEW.status<>'aprovado' THEN RAISE EXCEPTION 'B2B_INTERNAL_UNSEALED_OPERATION' USING ERRCODE='42501'; END IF; IF NEW.status='aprovado' AND OLD.status IS DISTINCT FROM NEW.status THEN
  IF NOT (public.has_role(uid,'administrador'::public.app_role) OR public.has_role(uid,'gestor_comercial'::public.app_role)) OR OLD.status NOT IN ('em_analise_comercial','solicitado','rascunho') OR NEW.payment_condition_status IS DISTINCT FROM 'defined' THEN RAISE EXCEPTION 'B2B_INTERNAL_APPROVAL_DENIED' USING ERRCODE='42501'; END IF;
  SELECT * INTO terms FROM public.partner_order_payment_terms t WHERE t.id=NEW.payment_terms_id AND t.partner_order_id=NEW.id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'B2B_INTERNAL_TERMS_REQUIRED' USING ERRCODE='42501'; END IF;
  IF NEW.total IS NULL OR NEW.total::text IN ('NaN','Infinity','-Infinity') OR NEW.total<0 OR terms.final_amount IS DISTINCT FROM NEW.total OR NEW.desconto_total<0 THEN RAISE EXCEPTION 'B2B_INTERNAL_TOTAL_INVALID' USING ERRCODE='22023'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.partner_order_items i WHERE i.order_id=NEW.id) OR EXISTS(SELECT 1 FROM public.partner_order_items i WHERE i.order_id=NEW.id AND (i.quantidade IS NULL OR i.quantidade<=0 OR i.quantidade::text IN ('NaN','Infinity','-Infinity') OR i.preco_unitario IS NULL OR i.preco_unitario<0 OR i.preco_unitario::text IN ('NaN','Infinity','-Infinity') OR i.desconto_percentual IS NULL OR i.desconto_percentual<0 OR i.desconto_percentual>100 OR i.desconto_percentual::text IN ('NaN','Infinity','-Infinity'))) THEN RAISE EXCEPTION 'B2B_INTERNAL_ITEM_INVALID' USING ERRCODE='22023'; END IF;
  SELECT jsonb_agg(to_jsonb(i)-ARRAY['created_at'] ORDER BY i.id) INTO items FROM public.partner_order_items i WHERE i.order_id=NEW.id;
  SELECT jsonb_agg(to_jsonb(s)-ARRAY['created_at','status','receivable_installment_id'] ORDER BY s.installment_number,s.id) INTO schedule FROM public.partner_order_payment_schedule s WHERE s.partner_order_id=NEW.id AND s.payment_terms_id=terms.id;
  IF schedule IS NULL THEN RAISE EXCEPTION 'B2B_INTERNAL_SCHEDULE_REQUIRED' USING ERRCODE='22023'; END IF;
 IF NEW.subtotal IS NULL OR NEW.desconto_total IS NULL OR NEW.subtotal::text IN ('NaN','Infinity','-Infinity') OR NEW.desconto_total::text IN ('NaN','Infinity','-Infinity') OR NEW.subtotal<0 OR NEW.desconto_total<0 OR NEW.desconto_total>NEW.subtotal OR terms.discount_percent_snapshot IS NULL OR terms.discount_percent_snapshot::text IN ('NaN','Infinity','-Infinity') OR terms.discount_percent_snapshot<0 OR terms.discount_percent_snapshot>100 THEN RAISE EXCEPTION 'B2B_INTERNAL_TOTAL_INVALID' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM public.partner_order_items i WHERE i.order_id=NEW.id AND (i.subtotal IS NULL OR i.subtotal<0 OR i.subtotal::text IN ('NaN','Infinity','-Infinity'))) OR (SELECT round(sum(i.subtotal),2) FROM public.partner_order_items i WHERE i.order_id=NEW.id) IS DISTINCT FROM round(terms.net_amount_after_discount,2) THEN RAISE EXCEPTION 'B2B_INTERNAL_ITEM_INVALID' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM public.partner_order_payment_schedule s WHERE s.partner_order_id=NEW.id AND (s.payment_terms_id IS DISTINCT FROM terms.id OR s.installment_number<=0 OR s.due_date IS NULL OR s.amount IS NULL OR s.principal_amount IS NULL OR s.interest_amount IS NULL OR s.amount<0 OR s.principal_amount<0 OR s.interest_amount<0 OR s.amount::text IN ('NaN','Infinity','-Infinity') OR s.principal_amount::text IN ('NaN','Infinity','-Infinity') OR s.interest_amount::text IN ('NaN','Infinity','-Infinity'))) OR (SELECT count(*) FROM public.partner_order_payment_schedule s WHERE s.partner_order_id=NEW.id) IS DISTINCT FROM terms.installment_count::bigint OR (SELECT count(DISTINCT s.installment_number) FROM public.partner_order_payment_schedule s WHERE s.partner_order_id=NEW.id) IS DISTINCT FROM terms.installment_count::bigint OR (SELECT round(sum(s.amount),2) FROM public.partner_order_payment_schedule s WHERE s.partner_order_id=NEW.id) IS DISTINCT FROM round(terms.final_amount,2) THEN RAISE EXCEPTION 'B2B_INTERNAL_SCHEDULE_INVALID' USING ERRCODE='22023'; END IF;
  economic:=jsonb_build_object('schema_version','1','origin',OLD.internal_origin_snapshot,'items',items,'terms',to_jsonb(terms)-ARRAY['updated_at','approval_status','approved_by','approved_at','approval_notes'],'schedule',schedule,'subtotal',NEW.subtotal,'discount',NEW.desconto_total,'total',NEW.total,'sealed_by',uid);
  NEW.internal_economic_snapshot:=economic;
 ELSIF NEW.status IS DISTINCT FROM OLD.status AND public.fn_b2b_status_is_operational(NEW.status) AND OLD.internal_economic_snapshot IS NULL THEN RAISE EXCEPTION 'B2B_INTERNAL_UNSEALED_OPERATION' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $function$
CREATE OR REPLACE FUNCTION public.approve_partner_order(p_order_id uuid, p_approval_notes text DEFAULT NULL::text, p_estimated_delivery_date date DEFAULT NULL::date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_pid uuid; v_prev partner_order_status; v_partner_user uuid; v_numero text;
  v_final_status partner_order_status; v_final_ready boolean; v_block text;
  v_amount numeric(14,2); v_credit_ok timestamptz; v_credit jsonb; v_reason text;
BEGIN

  IF NOT (public.b2b_phase1_order_visible(p_order_id) OR EXISTS (
    SELECT 1 FROM public.partner_orders po WHERE po.id=p_order_id
      AND platform_private.c2p1_settings_allowed(po.partner_id,true))) THEN RAISE EXCEPTION 'b2b_phase1_scope_denied' USING ERRCODE='42501'; END IF;
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  IF NOT (has_role(v_uid,'administrador') OR has_role(v_uid,'gestor_comercial')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT partner_id, status, numero,
         ROUND(COALESCE(final_amount_with_interest, total, 0),2), credit_approved_at
    INTO v_pid, v_prev, v_numero, v_amount, v_credit_ok
    FROM public.partner_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found'; END IF;
  IF EXISTS(SELECT 1 FROM public.partner_orders WHERE id=p_order_id AND c2_external_origin_snapshot->>'contract'='C2_EXTERNAL_ORDER_REQUEST_PENDING_ACCOUNTING_V1') THEN RAISE EXCEPTION 'C2_ACCOUNTING_PENDING' USING ERRCODE='42501'; END IF;

  IF v_prev = 'aguardando_cotacao' THEN
    RAISE EXCEPTION 'quote_required: defina o preco da cotacao antes de aprovar';
  END IF;
  IF NOT public.fn_b2b_order_priceable(p_order_id) THEN
    RAISE EXCEPTION 'order_not_priceable_quote_required';
  END IF;

  IF v_prev IN ('aprovado','reprovado','cancelado') THEN
    RAISE EXCEPTION 'already_processed: pedido já está em status %', v_prev;
  END IF;

  IF v_prev = 'aguardando_aprovacao_credito' THEN
    RAISE EXCEPTION 'credit_pending: aprove o crédito antes da análise comercial';
  END IF;

  IF v_prev NOT IN ('em_analise_comercial','solicitado','rascunho') THEN
    RAISE EXCEPTION 'invalid_status_transition: %', v_prev;
  END IF;

  -- H4-001/H4-003: reavaliar credito na aprovacao, com lock por parceiro.
  -- C2 single credit lock domain: same bigint key as create_partner_order_secure and tg_partner_orders_credit_guard.
  PERFORM pg_advisory_xact_lock(hashtextextended('b2b_credit:' || v_pid::text, 0));
  -- Re-validate authority after a possible wait (READ COMMITTED: each statement sees revocations committed meanwhile).
  IF NOT (has_role(v_uid,'administrador') OR has_role(v_uid,'gestor_comercial')) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF NOT (public.b2b_phase1_order_visible(p_order_id) OR EXISTS (SELECT 1 FROM public.partner_orders po WHERE po.id=p_order_id
      AND platform_private.c2p1_settings_allowed(po.partner_id,true))) THEN RAISE EXCEPTION 'b2b_phase1_scope_denied' USING ERRCODE='42501'; END IF;
  v_credit := public.fn_b2b_credit_exposure(v_pid, 0, NULL);
  v_reason := COALESCE(v_credit->>'reason_code','OK');

  IF v_credit_ok IS NULL THEN
    IF v_reason IN ('LIMIT_EXCEEDED_BLOCK','OVERDUE_BLOCK') THEN
      UPDATE public.partner_orders
         SET credit_block_reason = v_reason, updated_at = now()
       WHERE id = p_order_id;
      RAISE EXCEPTION 'credit_block_on_approval: %', v_reason;
    ELSIF v_reason = 'LIMIT_EXCEEDED_APPROVAL' THEN
      -- fail-closed: exige aprovacao financeira formal (approve_b2b_credit).
      UPDATE public.partner_orders
         SET credit_block_reason = v_reason, updated_at = now()
       WHERE id = p_order_id;
      RAISE EXCEPTION 'credit_approval_required: %', v_reason;
    END IF;
  END IF;

  UPDATE public.partner_orders
     SET status = 'aprovado', approved_by = v_uid, approved_at = now(),
         approval_notes = NULLIF(p_approval_notes,''),
         estimated_delivery_date = COALESCE(p_estimated_delivery_date, estimated_delivery_date),
         ready_for_production = CASE WHEN c2_external_origin_snapshot IS NOT NULL THEN false ELSE true END, updated_at = now()
   WHERE id = p_order_id AND status = v_prev;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'concurrent_update: status do pedido mudou durante a aprovação';
  END IF;

  SELECT status, ready_for_production, credit_block_reason
    INTO v_final_status, v_final_ready, v_block
    FROM public.partner_orders WHERE id = p_order_id;

  IF v_final_status <> 'aprovado' OR (v_final_ready IS NOT TRUE AND NOT EXISTS(SELECT 1 FROM public.partner_orders WHERE id=p_order_id AND c2_external_origin_snapshot IS NOT NULL AND internal_economic_snapshot IS NOT NULL)) THEN
    RAISE EXCEPTION 'credit_block: %', COALESCE(v_block, 'aprovacao_credito_pendente');
  END IF;

  INSERT INTO public.partner_order_audit_logs(order_id, partner_id, usuario_id, acao, dados_anteriores, dados_novos)
  VALUES (p_order_id, v_pid, v_uid, 'approved',
          jsonb_build_object('status', v_prev),
          jsonb_build_object('status','aprovado','approval_notes',p_approval_notes,
                             'estimated_delivery_date',p_estimated_delivery_date,
                             'credit_reason_code', v_reason));

  FOR v_partner_user IN SELECT r FROM platform_private.c2_order_partner_recipients(v_pid) r LOOP -- c2_ord_recipients
    INSERT INTO public.notificacoes_operacionais(usuario_id, tipo, titulo, mensagem, link)
    VALUES (v_partner_user, 'pedido_b2b_aprovado',
            'Pedido ' || v_numero || ' aprovado',
            CASE WHEN EXISTS(SELECT 1 FROM public.partner_orders WHERE id=p_order_id AND c2_external_origin_snapshot IS NOT NULL)
            THEN 'Seu pedido recebeu aprovação comercial. Planejamento de produção ainda não liberado.'
            ELSE 'Seu pedido foi aprovado e seguirá para planejamento de produção.' END,
            '/portal-parceiro/pedidos');
  END LOOP;
END
$function$
CREATE OR REPLACE FUNCTION public.generate_b2b_receivable_secure(p_partner_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE='42501'; END IF;

  IF auth.uid() IS NULL THEN
    IF pg_trigger_depth()=0 THEN RAISE EXCEPTION 'b2b_phase1_scope_denied' USING ERRCODE='42501'; END IF;
  ELSIF NOT (public.b2b_phase1_order_visible(p_partner_order_id) OR EXISTS (
    SELECT 1 FROM public.partner_orders po WHERE po.id=p_partner_order_id
      AND platform_private.c2p1_settings_allowed(po.partner_id,true))) THEN RAISE EXCEPTION 'b2b_phase1_scope_denied' USING ERRCODE='42501'; END IF;
  IF NOT (pg_trigger_depth() > 0 or public.has_role(auth.uid(), 'administrador'::public.app_role)
      or public.has_role(auth.uid(), 'gestor'::public.app_role)
      or public.has_role(auth.uid(), 'financeiro'::public.app_role)) THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;
 IF EXISTS(SELECT 1 FROM public.partner_orders WHERE id=p_partner_order_id AND internal_origin_snapshot IS NOT NULL) THEN RAISE EXCEPTION 'B2B_INTERNAL_DOWNSTREAM_UNVERIFIED' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM public.partner_orders WHERE id=p_partner_order_id AND c2_external_origin_snapshot->>'contract'='C2_EXTERNAL_ORDER_REQUEST_PENDING_ACCOUNTING_V1') THEN RAISE EXCEPTION 'C2_ACCOUNTING_PENDING' USING ERRCODE='42501'; END IF;
  IF p_partner_order_id IS NULL THEN
    RAISE EXCEPTION 'partner_order_id_required' USING ERRCODE='P0001';
  END IF;

  -- Canonical row-before-receipt order, matching approval and its billing trigger.
  PERFORM 1 FROM public.partner_orders WHERE id=p_partner_order_id FOR UPDATE;

  -- Serializa concorrencia real (clique duplo / chamadas simultaneas).
  -- Chave unica bigint: assinatura pg_advisory_xact_lock(bigint).
  PERFORM pg_advisory_xact_lock(
    hashtextextended('b2b_receivable:' || p_partner_order_id::text, 0)
  );

  IF NOT public.fn_b2b_order_priceable(p_partner_order_id) THEN
    RAISE EXCEPTION 'order_not_priceable_quote_required' USING ERRCODE='P0001';
  END IF;

  RETURN public.generate_b2b_receivable_secure_impl(p_partner_order_id);
END $function$
CREATE OR REPLACE FUNCTION platform_private.c2_owner_order_create_allowed(_uid uuid, _partner uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE c jsonb;
BEGIN
  -- c2_ord_writer_v1: nunca confia em parâmetro de uid que não seja o JWT atual.
  IF _uid IS NULL OR _partner IS NULL OR auth.uid() IS DISTINCT FROM _uid THEN RETURN false; END IF;
  -- Gestor B2B vigente (user_roles canônico; revogação remove a linha). Técnico isolado nunca compra.
  IF NOT public.has_role(_uid,'parceiro_b2b'::public.app_role) THEN RETURN false; END IF;
  c := platform_private.b2b_commercial_context();
  IF c IS NULL OR c->>'contract' <> 'C2_MULTIPROFILE_V1' OR c->>'mode' <> 'commercial_owner'
     OR (c->>'partner_id')::uuid IS DISTINCT FROM _partner OR COALESCE((c->>'manager')::boolean,false) IS NOT TRUE THEN
    RETURN false;
  END IF;
  -- Cliente comercial = sem organização própria; tenant dono ativo e coerente com perfil/vínculo.
  IF EXISTS (SELECT 1 FROM public.organizations o WHERE o.partner_account_id = _partner) THEN RETURN false; END IF;
  IF NOT COALESCE(platform_private.b2b_phase1_partner_visible(_partner,true),false) THEN RETURN false; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.partner_users pu
      JOIN public.partner_accounts pa ON pa.id = pu.partner_id
      JOIN public.profiles p ON p.user_id = pu.user_id
      JOIN public.organizations o ON o.id = pa.commercial_owner_organization_id
     WHERE pu.user_id = _uid AND pu.partner_id = _partner
       AND pu.revoked_at IS NULL AND (pu.valid_from IS NULL OR pu.valid_from <= now())
       AND pa.ativo AND pa.deleted_at IS NULL AND o.ativo AND o.status = 'ativa'
       AND (o.partner_account_id IS NULL OR o.partner_account_id = _partner)
       AND p.ativo AND p.organization_id = pu.tenant_id AND pu.tenant_id = o.id
       AND (c->>'tenant_id')::uuid = o.id
       AND public.is_valid_b2b_partner_user(_uid, pa.id)) THEN
    RETURN false;
  END IF;
  RETURN EXISTS (SELECT 1 FROM platform_private.entitlements_for_user(_uid) e WHERE e.feature_key = 'pedidos_b2b')
     AND EXISTS (SELECT 1 FROM platform_private.entitlements_for_user(_uid) e WHERE e.feature_key = 'catalogo_precos');
END $function$
