-- Captura REAL HML vrlcdwmlytukrjezrrnf (root, 2026-11-18, readonly): pg_get_functiondef dos gatilhos das tabelas tocadas pelo seed.
-- Dado de catálogo transcrito literalmente; build_seed.py extrai md5(prosrc) como pins. Não editar à mão.
CREATE OR REPLACE FUNCTION public._saas_trg_require_feature()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_key text := TG_ARGV[0];
BEGIN
  IF v_uid IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.organizations o ON o.id = p.organization_id AND o.ativo IS TRUE
    WHERE p.user_id = v_uid AND p.ativo IS TRUE AND p.organization_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'saas_context_unavailable: usuário ativo e empresa são obrigatórios'
      USING ERRCODE = '42501';
  END IF;
  IF NOT public._saas_user_has_feature(v_uid, v_key) THEN
    RAISE EXCEPTION 'saas_feature_not_entitled: funcionalidade não contratada ou assinatura indisponível'
      USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$function$
;
CREATE OR REPLACE FUNCTION public.audit_partner_order_payment_terms()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_partner_id uuid;
BEGIN
  SELECT partner_id INTO v_partner_id FROM public.partner_orders WHERE id = NEW.partner_order_id;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.partner_order_audit_logs (order_id, partner_id, usuario_id, acao, dados_anteriores, dados_novos)
    VALUES (NEW.partner_order_id, v_partner_id, auth.uid(), 'payment_terms_created', NULL, to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.partner_order_audit_logs (order_id, partner_id, usuario_id, acao, dados_anteriores, dados_novos)
    VALUES (NEW.partner_order_id, v_partner_id, auth.uid(), 'payment_terms_updated', to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.d51_5_validate_financial_tenant_links()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_new jsonb := to_jsonb(NEW);
  v_org uuid;
  v_parent_id uuid;
BEGIN
  BEGIN
    v_org := NULLIF(v_new->>'organization_id', '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'FINANCIAL_TENANT_INVALID' USING ERRCODE = '23514';
  END;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'FINANCIAL_TENANT_REQUIRED' USING ERRCODE = '23514';
  END IF;

  IF TG_TABLE_NAME = 'accounts_receivable' THEN
    v_parent_id := NULLIF(v_new->>'customer_id', '')::uuid;
    IF v_parent_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.clientes c WHERE c.id = v_parent_id AND c.organization_id = v_org
    ) THEN
      RAISE EXCEPTION 'FINANCIAL_CUSTOMER_TENANT_MISMATCH' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'accounts_receivable_installments' THEN
    v_parent_id := NULLIF(v_new->>'receivable_id', '')::uuid;
    IF v_parent_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.accounts_receivable ar WHERE ar.id = v_parent_id AND ar.organization_id = v_org
    ) THEN
      RAISE EXCEPTION 'FINANCIAL_RECEIVABLE_TENANT_MISMATCH' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'accounts_payable_installments' THEN
    v_parent_id := NULLIF(v_new->>'payable_id', '')::uuid;
    IF v_parent_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.accounts_payable ap WHERE ap.id = v_parent_id AND ap.organization_id = v_org
    ) THEN
      RAISE EXCEPTION 'FINANCIAL_PAYABLE_TENANT_MISMATCH' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'receivable_payments' THEN
    v_parent_id := NULLIF(v_new->>'installment_id', '')::uuid;
    IF v_parent_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.accounts_receivable_installments ari WHERE ari.id = v_parent_id AND ari.organization_id = v_org
    ) THEN
      RAISE EXCEPTION 'FINANCIAL_RECEIVABLE_PAYMENT_TENANT_MISMATCH' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'payable_payments' THEN
    v_parent_id := NULLIF(v_new->>'installment_id', '')::uuid;
    IF v_parent_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.accounts_payable_installments api WHERE api.id = v_parent_id AND api.organization_id = v_org
    ) THEN
      RAISE EXCEPTION 'FINANCIAL_PAYABLE_PAYMENT_TENANT_MISMATCH' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'financial_receipts' THEN
    v_parent_id := NULLIF(v_new->>'customer_id', '')::uuid;
    IF v_parent_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.clientes c WHERE c.id = v_parent_id AND c.organization_id = v_org
    ) THEN
      RAISE EXCEPTION 'FINANCIAL_RECEIPT_CUSTOMER_TENANT_MISMATCH' USING ERRCODE = '23514';
    END IF;
    v_parent_id := NULLIF(v_new->>'payment_id', '')::uuid;
    IF v_parent_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.receivable_payments rp WHERE rp.id = v_parent_id AND rp.organization_id = v_org
    ) THEN
      RAISE EXCEPTION 'FINANCIAL_RECEIPT_PAYMENT_TENANT_MISMATCH' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END
$function$
;
CREATE OR REPLACE FUNCTION public.fn_b2b_guard_credit_approval_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF (NEW.credit_approved_at IS DISTINCT FROM OLD.credit_approved_at)
     OR (NEW.credit_approved_by IS DISTINCT FROM OLD.credit_approved_by) THEN
    IF COALESCE(current_setting('arbio.b2b_credit_approval', true), 'off') <> 'on' THEN
      RAISE EXCEPTION 'credit_approval_fields_immutable: use approve_b2b_credit';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.fn_financial_audit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_old jsonb; v_new jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN v_new := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN v_old := to_jsonb(OLD); v_new := to_jsonb(NEW);
  ELSIF TG_OP = 'DELETE' THEN v_old := to_jsonb(OLD);
  END IF;

  INSERT INTO public.financial_audit_log (entity_type, entity_id, action, old_data, new_data, performed_by)
  VALUES (TG_TABLE_NAME, COALESCE((NEW).id, (OLD).id), TG_OP, v_old, v_new, auth.uid());

  RETURN COALESCE(NEW, OLD);
END $function$
;
CREATE OR REPLACE FUNCTION public.fn_generate_receivable_installments()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  i int;
  v_context platform_private.financial_initial_installments;
  v_inst jsonb;
  v_qtd int := NEW.installment_count;
  v_base numeric(14,2) := ROUND(NEW.total_amount / v_qtd, 2);
  v_acc numeric(14,2) := 0;
  v_amt numeric(14,2);
BEGIN
  IF NEW.organization_id IS NULL THEN
    RAISE EXCEPTION 'FINANCIAL_TENANT_REQUIRED' USING ERRCODE = '23514';
  END IF;
  DELETE FROM platform_private.financial_initial_installments
    WHERE transaction_id=txid_current() AND title_id=NEW.id AND kind='receivable'
    RETURNING * INTO v_context;
  IF FOUND THEN
    IF v_context.actor_id IS DISTINCT FROM auth.uid() OR v_context.organization_id IS DISTINCT FROM NEW.organization_id
       OR NEW.created_by IS DISTINCT FROM v_context.actor_id OR NEW.origin_type <> 'MANUAL'
       OR platform_private.h15_actor_organization() IS DISTINCT FROM NEW.organization_id
       OR NOT public.is_financial_staff(auth.uid()) THEN
      RAISE EXCEPTION 'FIN_INITIAL_CONTEXT_DENIED' USING ERRCODE='42501';
    END IF;
    IF jsonb_array_length(v_context.installments) <> NEW.installment_count
       OR (SELECT sum((x->>'amount')::numeric) FROM jsonb_array_elements(v_context.installments) x) IS DISTINCT FROM NEW.total_amount THEN
      RAISE EXCEPTION 'FIN_TITLE_INVALID_SUM' USING ERRCODE='23514';
    END IF;
    FOR v_inst IN SELECT * FROM jsonb_array_elements(v_context.installments) LOOP
      INSERT INTO public.accounts_receivable_installments(organization_id,receivable_id,installment_number,due_date,original_amount,net_amount,status)
        VALUES(NEW.organization_id,NEW.id,(v_inst->>'installment_number')::int,(v_inst->>'due_date')::date,
          (v_inst->>'amount')::numeric,(v_inst->>'amount')::numeric,'OPEN');
    END LOOP;
    RETURN NEW;
  END IF;
  IF NEW.origin_type='B2B_ORDER' AND EXISTS(SELECT 1 FROM public.partner_orders o WHERE o.id=NEW.origin_id AND o.c2_external_origin_snapshot IS NOT NULL) THEN
    INSERT INTO public.accounts_receivable_installments(receivable_id,installment_number,due_date,original_amount,net_amount,status,organization_id,interest_amount)
    SELECT NEW.id,s.installment_number,s.due_date,s.amount,s.amount,'OPEN',NEW.organization_id,s.interest_amount
    FROM public.partner_order_payment_schedule s JOIN public.partner_orders o ON o.id=s.partner_order_id AND o.payment_terms_id=s.payment_terms_id
    WHERE o.id=NEW.origin_id ORDER BY s.installment_number;
    IF (SELECT count(*) FROM public.accounts_receivable_installments WHERE receivable_id=NEW.id)<>v_qtd THEN RAISE EXCEPTION 'B2B_INSTALLMENT_CARDINALITY_INVALID' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END IF;
  FOR i IN 1..v_qtd LOOP
    IF i < v_qtd THEN
      v_amt := v_base;
      v_acc := v_acc + v_amt;
    ELSE
      v_amt := NEW.total_amount - v_acc;
    END IF;
    INSERT INTO public.accounts_receivable_installments
      (receivable_id, installment_number, due_date, original_amount, net_amount, status, organization_id)
    VALUES
      (NEW.id, i, (NEW.first_due_date + ((i-1) || ' months')::interval)::date, v_amt, v_amt, 'OPEN', NEW.organization_id);
  END LOOP;
  RETURN NEW;
END
$function$
;
CREATE OR REPLACE FUNCTION public.fn_h6_guard_title_snapshot()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.total_amount IS DISTINCT FROM OLD.total_amount
     OR NEW.installment_count IS DISTINCT FROM OLD.installment_count
     OR NEW.origin_type IS DISTINCT FROM OLD.origin_type
     OR NEW.origin_id IS DISTINCT FROM OLD.origin_id
     OR NEW.issue_date IS DISTINCT FROM OLD.issue_date
     OR NEW.first_due_date IS DISTINCT FROM OLD.first_due_date
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Snapshot financeiro imutavel: valor, parcelas, origem e datas de emissao nao podem ser alterados.'
      USING ERRCODE='check_violation';
  END IF;

  IF TG_TABLE_NAME = 'accounts_receivable'
     AND (to_jsonb(NEW)->>'payment_method_id') IS DISTINCT FROM (to_jsonb(OLD)->>'payment_method_id') THEN
    RAISE EXCEPTION 'Condicao/metodo do titulo e imutavel apos a criacao: use o metodo na baixa (receivable_payments).'
      USING ERRCODE='check_violation';
  END IF;

  RETURN NEW;
END $function$
;
CREATE OR REPLACE FUNCTION public.fn_h6c_set_canonical_payment_terms()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.partner_orders
     SET payment_terms_id = NEW.id
   WHERE id = NEW.partner_order_id
     AND payment_terms_id IS NULL;
  RETURN NEW;
END
$function$
;
CREATE OR REPLACE FUNCTION public.fn_h6d_block_hard_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF public.fn_h6d_hard_delete_allowed() THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Registro financeiro (%) nao pode ser excluido: cancele pelo fluxo formal (rpc_cancel_accounts_receivable / rpc_cancel_accounts_payable).', TG_TABLE_NAME
    USING ERRCODE='check_violation';
END $function$
;
CREATE OR REPLACE FUNCTION public.guard_tenant_organization_id()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE v_org uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  v_org := public.h15_actor_organization();
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'tenant_context_required' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'INSERT' AND NEW.organization_id IS NULL THEN
    NEW.organization_id := v_org;
  END IF;
  IF NEW.organization_id IS DISTINCT FROM v_org THEN
    RAISE EXCEPTION 'tenant_scope_violation' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'tenant_immutable' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.partner_orders_audit_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_acao text;
  v_old jsonb;
  v_new jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_acao := 'order_created';
    v_new := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      v_acao := CASE WHEN NEW.status = 'cancelado' THEN 'order_cancelled' ELSE 'status_changed' END;
    ELSE
      v_acao := 'order_updated';
    END IF;
  ELSE
    RETURN NULL;
  END IF;
  INSERT INTO public.partner_order_audit_logs(order_id, partner_id, usuario_id, acao, dados_anteriores, dados_novos)
  VALUES (COALESCE(NEW.id, OLD.id), COALESCE(NEW.partner_id, OLD.partner_id), auth.uid(), v_acao, v_old, v_new);
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION platform_private.b2b_internal_child_snapshot_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE old_parent uuid; new_parent uuid; parent uuid; o public.partner_orders; before_value jsonb; after_value jsonb;
BEGIN
 IF TG_TABLE_NAME='partner_order_items' THEN
  IF TG_OP<>'INSERT' THEN old_parent:=OLD.order_id; END IF;
  IF TG_OP<>'DELETE' THEN new_parent:=NEW.order_id; END IF;
 ELSE
  IF TG_OP<>'INSERT' THEN old_parent:=OLD.partner_order_id; END IF;
  IF TG_OP<>'DELETE' THEN new_parent:=NEW.partner_order_id; END IF;
 END IF;
 FOR parent IN SELECT DISTINCT x FROM unnest(ARRAY[old_parent,new_parent]) x WHERE x IS NOT NULL ORDER BY x LOOP
  SELECT * INTO o FROM public.partner_orders WHERE id=parent FOR UPDATE;
  IF o.c2_external_origin_snapshot IS NOT NULL THEN PERFORM platform_private.c2_external_origin_assert(o.c2_external_origin_snapshot,o.partner_id,o.cliente_id); END IF;
  IF o.internal_origin_snapshot IS NOT NULL OR o.c2_external_origin_snapshot IS NOT NULL THEN
   IF o.internal_origin_snapshot IS NOT NULL THEN PERFORM platform_private.b2b_internal_assert_origin(o.internal_origin_snapshot,o.partner_id,o.cliente_id); END IF;
   IF o.status IN ('cancelado','reprovado') THEN RAISE EXCEPTION 'B2B_INTERNAL_TERMINAL_STATUS' USING ERRCODE='42501'; END IF;
   IF o.internal_economic_snapshot IS NOT NULL THEN
    IF TG_OP<>'UPDATE' THEN RAISE EXCEPTION 'B2B_INTERNAL_ECONOMICS_IMMUTABLE' USING ERRCODE='42501'; END IF;
    before_value:=to_jsonb(OLD); after_value:=to_jsonb(NEW);
    IF TG_TABLE_NAME='partner_order_payment_terms' THEN before_value:=before_value-ARRAY['updated_at','approval_status','approved_by','approved_at','approval_notes']; after_value:=after_value-ARRAY['updated_at','approval_status','approved_by','approved_at','approval_notes'];
    ELSIF TG_TABLE_NAME='partner_order_payment_schedule' THEN before_value:=before_value-ARRAY['status','receivable_installment_id']; after_value:=after_value-ARRAY['status','receivable_installment_id']; END IF;
    IF before_value IS DISTINCT FROM after_value THEN RAISE EXCEPTION 'B2B_INTERNAL_ECONOMICS_IMMUTABLE' USING ERRCODE='42501'; END IF;
   END IF;
  END IF;
 END LOOP;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $function$
;
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
;
CREATE OR REPLACE FUNCTION platform_private.c2_accounting_pending_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 -- While pending, only commercial review/quote, rejection or cancellation are possible: no approval,
 -- credit decision, economics seal, receivable, production, NF or delivery.
 -- INSERT: the canonical create may land in em_analise_comercial, aguardando_cotacao or (insufficient credit)
 -- aguardando_aprovacao_credito; nothing operational/financial may be set at creation.
 IF TG_OP='INSERT' THEN
  IF NEW.c2_external_origin_snapshot->>'contract'='C2_EXTERNAL_ORDER_REQUEST_PENDING_ACCOUNTING_V1' AND (
     NEW.status::text NOT IN ('em_analise_comercial','aguardando_cotacao','aguardando_aprovacao_credito')
     OR NEW.ready_for_production IS TRUE OR NEW.receivable_generated IS TRUE OR NEW.internal_economic_snapshot IS NOT NULL
     OR NEW.credit_approved_at IS NOT NULL OR NEW.approved_at IS NOT NULL) THEN
   RAISE EXCEPTION 'C2_ACCOUNTING_PENDING' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
 END IF;
 IF OLD.c2_external_origin_snapshot->>'contract'='C2_EXTERNAL_ORDER_REQUEST_PENDING_ACCOUNTING_V1'
    AND NEW.c2_external_origin_snapshot->>'contract'='C2_EXTERNAL_ORDER_REQUEST_PENDING_ACCOUNTING_V1' THEN
  -- aguardando_aprovacao_credito may only stay as is (no hidden credit decision) or leave to cancel/reject.
  IF NOT (NEW.status::text IN ('em_analise_comercial','aguardando_cotacao','cancelado','reprovado')
          OR (NEW.status=OLD.status AND OLD.status::text='aguardando_aprovacao_credito'))
     OR (OLD.status::text='aguardando_aprovacao_credito' AND NEW.status::text IN ('em_analise_comercial','aguardando_cotacao'))
     OR NEW.ready_for_production IS TRUE OR NEW.receivable_generated IS TRUE OR NEW.internal_economic_snapshot IS NOT NULL
     OR NEW.credit_approved_at IS DISTINCT FROM OLD.credit_approved_at OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
     -- review e1e9aa2f: no credit/financial decision field may advance by any privileged path while pending.
     OR NEW.credit_approved_by IS DISTINCT FROM OLD.credit_approved_by OR NEW.credit_approval_notes IS DISTINCT FROM OLD.credit_approval_notes
     OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
     -- review 61b28: the canonical create (same txn, private create ticket) initializes not_required -> pending/not_required;
     -- any other change (e.g. -> approved) is a financial decision and stays denied while pending.
     OR (NEW.financial_approval_status IS DISTINCT FROM OLD.financial_approval_status
         AND NOT (platform_private.has_ticket('c2_external_order_create',NEW.partner_id)
                  AND OLD.financial_approval_status='not_required' AND NEW.financial_approval_status IN ('pending','not_required'))) THEN
   RAISE EXCEPTION 'C2_ACCOUNTING_PENDING' USING ERRCODE='42501';
  END IF;
 END IF;
 RETURN NEW;
END $function$
;
CREATE OR REPLACE FUNCTION platform_private.c2_external_final_state_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NEW.c2_external_origin_snapshot IS NOT NULL AND OLD.internal_economic_snapshot IS NULL AND NEW.internal_economic_snapshot IS NOT NULL AND NEW.status IS DISTINCT FROM 'aprovado' THEN
  RAISE EXCEPTION 'C2_EXTERNAL_UNFINALIZED_APPROVAL' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $function$
;
CREATE OR REPLACE FUNCTION platform_private.c2p1_settings_fence()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 IF TG_OP='DELETE' OR NOT platform_private.c2p1_settings_allowed(NEW.partner_id,true)
 OR NOT platform_private.has_ticket('c2p1_settings_write',NEW.partner_id) THEN
 RAISE EXCEPTION 'C2P1_SETTINGS_WRITE_CLOSED' USING ERRCODE='42501'; END IF;
 IF TG_OP='UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id OR NEW.partner_id IS DISTINCT FROM OLD.partner_id
 OR NEW.created_at IS DISTINCT FROM OLD.created_at) THEN
 RAISE EXCEPTION 'C2P1_IDENTITY_IMMUTABLE' USING ERRCODE='42501'; END IF;
 -- PAYMENT_CODE_MAP_V1: código armazenado -> exatamente um método ativo pelo mapa explícito.
 IF platform_private.c2p1_payment_method_name(NEW.default_payment_method) IS NULL
 OR (SELECT count(*) FROM public.payment_methods WHERE active IS TRUE
     AND name=platform_private.c2p1_payment_method_name(NEW.default_payment_method))<>1
 THEN RAISE EXCEPTION 'C2P1_PAYMENT_METHOD_INVALID' USING ERRCODE='22023'; END IF;
 IF NEW.credit_limit::text IN ('NaN','Infinity','-Infinity') OR NEW.credit_limit<0
 OR NEW.credit_alert_threshold_1::text IN ('NaN','Infinity','-Infinity')
 OR NEW.credit_alert_threshold_2::text IN ('NaN','Infinity','-Infinity')
 OR NEW.credit_alert_threshold_1 NOT BETWEEN 0 AND 100 OR NEW.credit_alert_threshold_2 NOT BETWEEN 0 AND 100
 OR NEW.credit_alert_threshold_1>NEW.credit_alert_threshold_2
 THEN RAISE EXCEPTION 'C2P1_FINANCIAL_VALUES_INVALID' USING ERRCODE='22023'; END IF;
 RETURN NEW;
END $function$
;
CREATE OR REPLACE FUNCTION platform_private.delivery_no_downstream_20261030()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 IF EXISTS(SELECT 1 FROM platform_private.delivery_context_20261030 WHERE txid=pg_catalog.txid_current()) THEN
  RAISE EXCEPTION 'DELIVERY_DOWNSTREAM_FORBIDDEN: %.%',TG_TABLE_SCHEMA,TG_TABLE_NAME USING ERRCODE='42501';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $function$
;
CREATE OR REPLACE FUNCTION platform_private.delivery_order_transition_guard_20261030()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 IF NEW.status IS DISTINCT FROM OLD.status AND EXISTS(SELECT 1 FROM platform_private.delivery_context_20261030 WHERE txid=pg_catalog.txid_current()) THEN
  RAISE EXCEPTION 'DELIVERY_B2B_TRANSITION_CLOSED' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $function$
;
CREATE OR REPLACE FUNCTION platform_private.homolog_validation_block_receivable_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$ BEGIN RAISE EXCEPTION 'HOMOLOG_VALIDATION_RECEIVABLE_BLOCKED: criacao de titulos desabilitada durante preparacao AR Bio/FSF' USING ERRCODE='42501'; END $function$
;
CREATE OR REPLACE FUNCTION public.tg_audit_partner_order_commercial()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.priority IS DISTINCT FROM OLD.priority OR NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.commercial_audit_log(usuario_id, partner_id, order_id, acao, dados_anteriores, dados_novos)
    VALUES (
      auth.uid(), NEW.partner_id, NEW.id, 'partner_orders.commercial_change',
      jsonb_build_object('status', OLD.status, 'priority', OLD.priority),
      jsonb_build_object('status', NEW.status, 'priority', NEW.priority)
    );
  END IF;
  RETURN NEW;
END $function$
;
CREATE OR REPLACE FUNCTION public.tg_auto_b2b_receivable()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_settings record;
  v_should boolean := false;
BEGIN
  SELECT * INTO v_settings FROM public.partner_financial_settings WHERE partner_id = NEW.partner_id AND active = true;
  IF NOT FOUND OR NOT v_settings.auto_generate_receivable THEN RETURN NEW; END IF;
  IF NEW.receivable_generated THEN RETURN NEW; END IF;

  IF v_settings.billing_trigger = 'na_aprovacao' AND NEW.status = 'aprovado' AND OLD.status IS DISTINCT FROM 'aprovado' THEN
    v_should := true;
  ELSIF v_settings.billing_trigger = 'na_entrega' AND NEW.status = 'entregue' AND OLD.status IS DISTINCT FROM 'entregue' THEN
    v_should := true;
  ELSIF v_settings.billing_trigger = 'na_producao_finalizada' AND NEW.status = 'produzido' AND OLD.status IS DISTINCT FROM 'produzido' THEN
    v_should := true;
  END IF;

  IF v_should THEN
    BEGIN
      PERFORM public.generate_b2b_receivable_secure(NEW.id);
    EXCEPTION WHEN OTHERS THEN
      -- c2_ord_atomic_approval: sem título, a aprovação não acontece (rollback do UPDATE).
      IF v_settings.billing_trigger = 'na_aprovacao' THEN
        RAISE EXCEPTION 'B2B_APPROVAL_BILLING_FAILED: %', SQLERRM USING ERRCODE='P0001';
      END IF;
      INSERT INTO public.partner_order_audit_logs(order_id, partner_id, acao, dados_novos)
      VALUES (NEW.id, NEW.partner_id, 'financeiro_auto_falhou', jsonb_build_object('erro', SQLERRM));
    END;
  END IF;
  RETURN NEW;
END $function$
;
CREATE OR REPLACE FUNCTION public.tg_b2b_block_receivable_before_approval()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_status partner_order_status;
BEGIN
  IF NEW.partner_order_id IS NULL THEN RETURN NEW; END IF;
  SELECT status INTO v_status FROM public.partner_orders WHERE id = NEW.partner_order_id;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'order_not_found';
  END IF;
  IF NOT public.fn_b2b_status_is_approved_or_later(v_status) THEN
    RAISE EXCEPTION 'receivable_requires_approved_order: status=%', v_status
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$function$
;
CREATE OR REPLACE FUNCTION public.tg_b2b_enforce_plan_selectable()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.payment_plan_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.payment_plan_id IS NOT DISTINCT FROM OLD.payment_plan_id THEN
    RETURN NEW;
  END IF;
  IF NOT public.fn_b2b_plan_selectable(NEW.payment_plan_id) THEN
    RAISE EXCEPTION 'plan_not_selectable';
  END IF;
  RETURN NEW;
END
$function$
;
CREATE OR REPLACE FUNCTION public.tg_block_partner_order_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF public.partner_order_has_production(OLD.id) THEN
    INSERT INTO public.partner_order_audit_logs (order_id, partner_id, usuario_id, acao, dados_anteriores)
    VALUES (OLD.id, OLD.partner_id, auth.uid(), 'exclusao_bloqueada', to_jsonb(OLD));
    RAISE EXCEPTION 'Pedido com Ordem de Produção vinculada não pode ser excluído.';
  END IF;
  RETURN OLD;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.tg_block_partner_order_edit_after_op()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_locked boolean;
BEGIN
  v_locked := public.partner_order_has_production(OLD.id);
  IF NOT v_locked THEN
    RETURN NEW;
  END IF;

  -- Campos sempre permitidos
  -- status, ready_for_production, approved_by, approved_at, approval_notes,
  -- estimated_delivery_date, observacoes, updated_at, future_financial_link

  IF NEW.subtotal IS DISTINCT FROM OLD.subtotal
     OR NEW.desconto_total IS DISTINCT FROM OLD.desconto_total
     OR NEW.total IS DISTINCT FROM OLD.total
     OR NEW.partner_id IS DISTINCT FROM OLD.partner_id
     OR NEW.numero IS DISTINCT FROM OLD.numero
     OR NEW.requested_delivery_date IS DISTINCT FROM OLD.requested_delivery_date
  THEN
    INSERT INTO public.partner_order_audit_logs (order_id, partner_id, usuario_id, acao, dados_anteriores, dados_novos)
    VALUES (OLD.id, OLD.partner_id, auth.uid(), 'edicao_bloqueada',
            to_jsonb(OLD), to_jsonb(NEW));
    RAISE EXCEPTION 'Este pedido já possui Ordem de Produção vinculada e não pode mais ser alterado.';
  END IF;

  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.tg_block_pofl_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Rollback controlado: somente administrador e somente apos cancelamento
  -- canonico do recebivel (cancel_b2b_receivable_secure).
  IF COALESCE(OLD.financial_status, '') = 'cancelado'
     AND auth.uid() IS NOT NULL
     AND public.has_role(auth.uid(), 'administrador'::app_role) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Vínculo financeiro não pode ser excluído';
END $function$
;
CREATE OR REPLACE FUNCTION public.tg_governance_audit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_partner uuid;
BEGIN
  v_partner := CASE WHEN TG_TABLE_NAME='partner_financial_settings' THEN COALESCE(NEW.partner_id, OLD.partner_id) ELSE NULL END;
  INSERT INTO financial_governance_audit_log(usuario_id, partner_id, acao, dados_anteriores, dados_novos)
  VALUES (auth.uid(), v_partner,
    TG_TABLE_NAME || '_' || lower(TG_OP),
    CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) END,
    CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) END);
  RETURN COALESCE(NEW, OLD);
END;$function$
;
CREATE OR REPLACE FUNCTION public.tg_notify_payment_terms_pending()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_should_notify boolean := false;
  v_msg text;
BEGIN
  IF NEW.requires_financial_approval IS DISTINCT FROM true
     OR NEW.financial_approval_status IS DISTINCT FROM 'pending' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_should_notify := true;
  ELSE
    -- Só notifica quando entra em pending vindo de outro estado
    IF COALESCE(OLD.requires_financial_approval, false) = false
       OR COALESCE(OLD.financial_approval_status, 'not_required') <> 'pending' THEN
      v_should_notify := true;
    END IF;
  END IF;

  IF NOT v_should_notify THEN
    RETURN NEW;
  END IF;

  v_msg := format('Pedido B2B %s aguarda aprovação da condição de pagamento.', COALESCE(NEW.numero,''));

  PERFORM public._notify_role(
    'financeiro'::app_role,
    'b2b_payment_terms_pending',
    'Aprovação financeira pendente',
    v_msg,
    '/comercial/pedidos-b2b'
  );
  PERFORM public._notify_role(
    'administrador'::app_role,
    'b2b_payment_terms_pending',
    'Aprovação financeira pendente',
    v_msg,
    '/comercial/pedidos-b2b'
  );
  PERFORM public._notify_role(
    'gestor_comercial'::app_role,
    'b2b_payment_terms_pending',
    'Aprovação financeira pendente',
    v_msg,
    '/comercial/pedidos-b2b'
  );

  -- Notifica também o criador do pedido, se identificado
  IF NEW.created_by IS NOT NULL THEN
    INSERT INTO public.notificacoes_operacionais(usuario_id, tipo, titulo, mensagem, link, lido)
    VALUES (
      NEW.created_by,
      'b2b_payment_terms_pending',
      'Aprovação financeira pendente',
      v_msg,
      '/comercial/pedidos-b2b',
      false
    );
  END IF;

  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.tg_partner_orders_credit_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v jsonb;
  v_amount numeric(14,2);
  v_should_check boolean := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status NOT IN ('rascunho') THEN v_should_check := true; END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.credit_approved_by IS NOT NULL
       AND NEW.status = 'em_analise_comercial'
       AND OLD.status = 'aguardando_aprovacao_credito'
       AND NEW.total IS NOT DISTINCT FROM OLD.total THEN
      NEW.credit_block_reason := NULL;
      RETURN NEW;
    END IF;

    IF NEW.credit_approved_by IS NOT NULL AND OLD.credit_approved_by IS NULL THEN
      NEW.credit_block_reason := NULL;
      RETURN NEW;
    END IF;

    IF OLD.credit_approved_by IS NOT NULL
       AND NEW.status = 'aprovado'
       AND OLD.status = 'em_analise_comercial'
       AND NEW.total IS NOT DISTINCT FROM OLD.total THEN
      RETURN NEW;
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status
       AND NEW.status IN ('em_analise_comercial','aprovado') THEN
      v_should_check := true;
    ELSIF (NEW.total IS DISTINCT FROM OLD.total
        OR NEW.final_amount_with_interest IS DISTINCT FROM OLD.final_amount_with_interest)
       AND NEW.status IN ('em_analise_comercial','aprovado','aguardando_aprovacao_credito') THEN
      v_should_check := true;
    END IF;
  END IF;

  IF NOT v_should_check THEN RETURN NEW; END IF;

  -- Serializa a avaliacao de credito por parceiro dentro da transacao corrente.
  PERFORM pg_advisory_xact_lock(hashtextextended('b2b_credit:' || NEW.partner_id::text, 0));

  v_amount := ROUND(COALESCE(NEW.final_amount_with_interest, NEW.total, 0), 2);
  v := public.fn_b2b_credit_exposure(NEW.partner_id, v_amount, NEW.id);

  IF (v->>'block_if_overdue')::boolean AND (v->>'tem_vencidos')::boolean THEN
    NEW.status := 'aguardando_aprovacao_credito';
    NEW.credit_block_reason := 'inadimplencia';
    RETURN NEW;
  END IF;

  IF COALESCE((v->>'credit_limit')::numeric,0) > 0
     AND (v->>'exposicao_projetada')::numeric > (v->>'credit_limit')::numeric THEN
    NEW.status := 'aguardando_aprovacao_credito';
    NEW.credit_block_reason := CASE
      WHEN (v->>'credit_limit_action') = 'approval_required' THEN 'limite_excedido'
      ELSE 'limite_excedido_bloqueado'
    END;
  END IF;

  RETURN NEW;
END $function$
;
CREATE OR REPLACE FUNCTION public.tg_partner_orders_require_items()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count int;
BEGIN
  IF NEW.status = 'aprovado' AND (OLD.status IS DISTINCT FROM 'aprovado') THEN
    SELECT count(*) INTO v_count
      FROM public.partner_order_items
     WHERE order_id = NEW.id;
    IF v_count = 0 THEN
      RAISE EXCEPTION 'no_items: pedido sem itens — não pode ser aprovado';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.tg_pfs_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN NEW.updated_at = now(); RETURN NEW; END $function$
;
CREATE OR REPLACE FUNCTION public.tg_pofl_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN NEW.updated_at = now(); RETURN NEW; END $function$
;
CREATE OR REPLACE FUNCTION public.tg_recalc_risk_on_ar_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_partner uuid;
BEGIN
  SELECT ar.partner_id INTO v_partner
  FROM public.accounts_receivable ar
  WHERE ar.id = COALESCE(NEW.receivable_id, OLD.receivable_id)
    AND ar.origin_type = 'B2B_ORDER';
  IF v_partner IS NOT NULL THEN
    PERFORM public.recalc_partner_risk_score(v_partner);
  END IF;
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.tg_refresh_engagement()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.refresh_partner_engagement(COALESCE(NEW.partner_id, OLD.partner_id));
  RETURN COALESCE(NEW, OLD);
END $function$
;
CREATE OR REPLACE FUNCTION public.tg_sync_b2b_financial_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_link record;
  v_new text;
BEGIN
  SELECT * INTO v_link FROM public.partner_order_financial_links WHERE receivable_id = NEW.id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  v_new := CASE NEW.status
    WHEN 'PAID' THEN 'recebido'
    WHEN 'PARTIAL' THEN 'parcial'
    WHEN 'OVERDUE' THEN 'vencido'
    WHEN 'CANCELED' THEN 'cancelado'
    ELSE 'gerado'
  END;

  UPDATE public.partner_orders SET financial_status = v_new WHERE id = v_link.partner_order_id;
  UPDATE public.partner_order_financial_links SET financial_status = v_new WHERE id = v_link.id;

  INSERT INTO public.partner_order_audit_logs(order_id, partner_id, acao, dados_novos)
  VALUES (v_link.partner_order_id, v_link.partner_id, 'financeiro_status_alterado',
    jsonb_build_object('ar_status', NEW.status, 'novo', v_new));

  RETURN NEW;
END $function$
;
CREATE OR REPLACE FUNCTION public.trg_partner_order_timeline()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.production_timeline_events(partner_order_id, event_type, event_at, actor_id, meta)
    VALUES (NEW.id, 'pedido_criado', NEW.created_at, NEW.created_by, '{}'::jsonb);
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'aprovado' THEN
      INSERT INTO public.production_timeline_events(partner_order_id, event_type, event_at, meta)
      VALUES (NEW.id, 'pedido_aprovado', now(), '{}'::jsonb);
    ELSIF NEW.status = 'em_producao' THEN
      INSERT INTO public.production_timeline_events(partner_order_id, event_type, event_at, meta)
      VALUES (NEW.id, 'producao_iniciada', now(), '{}'::jsonb);
    ELSIF NEW.status IN ('produzido','aguardando_entrega') THEN
      INSERT INTO public.production_timeline_events(partner_order_id, event_type, event_at, meta)
      VALUES (NEW.id, 'producao_finalizada', now(), '{}'::jsonb);
    ELSIF NEW.status = 'entregue' THEN
      INSERT INTO public.production_timeline_events(partner_order_id, event_type, event_at, meta)
      VALUES (NEW.id, 'entrega_realizada', now(), '{}'::jsonb);
    END IF;
  END IF;
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.trg_partner_order_to_planning_fn()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.ready_for_production = true AND (OLD.ready_for_production IS DISTINCT FROM NEW.ready_for_production) THEN
    INSERT INTO public.production_planning (partner_order_id, partner_id, status, created_by)
    VALUES (NEW.id, NEW.partner_id, 'aguardando_planejamento', NEW.approved_by)
    ON CONFLICT (partner_order_id) DO NOTHING;

    INSERT INTO public.production_timeline_events (partner_order_id, event_type, actor_id, meta)
    VALUES (NEW.id, 'planejamento_criado', NEW.approved_by, jsonb_build_object('approved_at', NEW.approved_at));
  END IF;
  RETURN NEW;
END $function$
;
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $function$
;
