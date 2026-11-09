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
  IF NEW.ready_for_production OR (public.fn_b2b_status_is_operational(NEW.status) AND platform_private.b2b_resale_delivery_status_transition_valid_v1(OLD,NEW) IS NOT TRUE) THEN RAISE EXCEPTION 'B2B_INTERNAL_DOWNSTREAM_UNVERIFIED' USING ERRCODE='42501'; END IF;
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
