DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.fiscal_environment_marker WHERE project_ref='swzpzcwiasxmjutrmvkm') THEN RAISE EXCEPTION 'CANONICAL_REF_REQUIRED'; END IF;
 IF md5(pg_get_functiondef('public.respond_b2b_order_quote_secure(uuid,jsonb,date,integer,text)'::regprocedure)) <> 'd2a2e1457d42f14c61481ffc6feeb1fc' THEN RAISE EXCEPTION 'QUOTE_BASELINE_CHANGED'; END IF;
END $$;

ALTER TABLE public.partner_orders ADD COLUMN IF NOT EXISTS internal_origin_snapshot jsonb;
ALTER TABLE public.partner_orders ADD COLUMN IF NOT EXISTS internal_economic_snapshot jsonb;

CREATE OR REPLACE FUNCTION platform_private.b2b_internal_origin_valid(s jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT coalesce(jsonb_typeof(s)='object' AND s->>'schema_version'='1'
 AND nullif(s->>'organization_id','') IS NOT NULL
 AND s->>'organization_id'=s->>'creditor_organization_id'
 AND s->>'organization_id'=s->>'issuer_organization_id'
 AND nullif(s->>'company_settings_id','') IS NOT NULL
 AND nullif(s->>'actor_user_id','') IS NOT NULL
 AND nullif(s->>'partner_id','') IS NOT NULL,false)
$$;
REVOKE ALL ON FUNCTION platform_private.b2b_internal_origin_valid(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION platform_private.b2b_internal_origin_valid(jsonb) TO service_role;

CREATE OR REPLACE FUNCTION platform_private.b2b_internal_assert_origin(s jsonb,partner uuid,client uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid; uid uuid:=auth.uid();
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE='42501'; END IF;
 org:=public.h15_actor_organization();
 IF org IS NULL OR NOT public.fn_cc_can_prepare(uid) OR NOT public._saas_user_has_feature(uid,'pedidos_b2b') THEN RAISE EXCEPTION 'B2B_INTERNAL_ACTOR_DENIED' USING ERRCODE='42501'; END IF;
 IF NOT platform_private.b2b_internal_origin_valid(s) OR s->>'organization_id' IS DISTINCT FROM org::text OR s->>'partner_id' IS DISTINCT FROM partner::text THEN RAISE EXCEPTION 'B2B_INTERNAL_ORIGIN_DENIED' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.partner_accounts p WHERE p.id=partner AND p.commercial_owner_organization_id=org AND p.ativo IS TRUE AND p.deleted_at IS NULL
 AND (p.client_id IS NULL OR EXISTS(SELECT 1 FROM public.clientes c WHERE c.id=p.client_id AND c.organization_id=org))) THEN RAISE EXCEPTION 'B2B_INTERNAL_PARTNER_DENIED' USING ERRCODE='42501'; END IF;
 IF client IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.clientes c WHERE c.id=client AND c.organization_id=org) THEN RAISE EXCEPTION 'B2B_INTERNAL_CLIENT_DENIED' USING ERRCODE='42501'; END IF;
END $$;
REVOKE ALL ON FUNCTION platform_private.b2b_internal_assert_origin(jsonb,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION platform_private.b2b_internal_assert_origin(jsonb,uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION platform_private.b2b_internal_order_snapshot_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid; uid uuid:=auth.uid(); cs public.company_fiscal_settings; candidate_count integer; economic jsonb; terms public.partner_order_payment_terms; items jsonb; schedule jsonb;
BEGIN
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
  IF NEW.status IN ('aprovado','em_producao','produzido','aguardando_entrega','confirmado','em_separacao','enviado','entregue','faturado') THEN RAISE EXCEPTION 'B2B_INTERNAL_INITIAL_STATUS_DENIED' USING ERRCODE='42501'; END IF;
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
 IF NEW.status='aprovado' AND OLD.status IS DISTINCT FROM NEW.status THEN
  IF NOT (public.has_role(uid,'administrador'::public.app_role) OR public.has_role(uid,'gestor_comercial'::public.app_role)) OR OLD.status NOT IN ('em_analise_comercial','solicitado','rascunho') OR NEW.payment_condition_status IS DISTINCT FROM 'defined' THEN RAISE EXCEPTION 'B2B_INTERNAL_APPROVAL_DENIED' USING ERRCODE='42501'; END IF;
  SELECT * INTO terms FROM public.partner_order_payment_terms t WHERE t.id=NEW.payment_terms_id AND t.partner_order_id=NEW.id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'B2B_INTERNAL_TERMS_REQUIRED' USING ERRCODE='42501'; END IF;
  IF NEW.total IS NULL OR NEW.total::text IN ('NaN','Infinity','-Infinity') OR NEW.total<0 OR terms.final_amount IS DISTINCT FROM NEW.total OR NEW.desconto_total<0 THEN RAISE EXCEPTION 'B2B_INTERNAL_TOTAL_INVALID' USING ERRCODE='22023'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.partner_order_items i WHERE i.order_id=NEW.id) OR EXISTS(SELECT 1 FROM public.partner_order_items i WHERE i.order_id=NEW.id AND (i.quantidade IS NULL OR i.quantidade<=0 OR i.quantidade::text IN ('NaN','Infinity','-Infinity') OR i.preco_unitario IS NULL OR i.preco_unitario<0 OR i.preco_unitario::text IN ('NaN','Infinity','-Infinity') OR i.desconto_percentual IS NULL OR i.desconto_percentual<0 OR i.desconto_percentual>100 OR i.desconto_percentual::text IN ('NaN','Infinity','-Infinity'))) THEN RAISE EXCEPTION 'B2B_INTERNAL_ITEM_INVALID' USING ERRCODE='22023'; END IF;
  SELECT jsonb_agg(to_jsonb(i)-ARRAY['created_at'] ORDER BY i.id) INTO items FROM public.partner_order_items i WHERE i.order_id=NEW.id;
  SELECT jsonb_agg(to_jsonb(s)-ARRAY['created_at','status','receivable_installment_id'] ORDER BY s.installment_number,s.id) INTO schedule FROM public.partner_order_payment_schedule s WHERE s.partner_order_id=NEW.id AND s.payment_terms_id=terms.id;
  IF schedule IS NULL THEN RAISE EXCEPTION 'B2B_INTERNAL_SCHEDULE_REQUIRED' USING ERRCODE='22023'; END IF;
  economic:=jsonb_build_object('schema_version','1','origin',OLD.internal_origin_snapshot,'items',items,'terms',to_jsonb(terms)-ARRAY['updated_at','approval_status','approved_by','approved_at','approval_notes'],'schedule',schedule,'subtotal',NEW.subtotal,'discount',NEW.desconto_total,'total',NEW.total,'sealed_by',uid);
  NEW.internal_economic_snapshot:=economic;
 ELSIF NEW.status IS DISTINCT FROM OLD.status AND public.fn_b2b_status_is_operational(NEW.status) AND OLD.internal_economic_snapshot IS NULL THEN RAISE EXCEPTION 'B2B_INTERNAL_UNSEALED_OPERATION' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION platform_private.b2b_internal_order_snapshot_guard() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION platform_private.b2b_internal_order_snapshot_guard() TO service_role;
CREATE TRIGGER trg_00_b2b_internal_snapshot BEFORE INSERT OR UPDATE ON public.partner_orders FOR EACH ROW EXECUTE FUNCTION platform_private.b2b_internal_order_snapshot_guard();

CREATE OR REPLACE FUNCTION platform_private.b2b_internal_child_snapshot_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
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
  IF o.internal_origin_snapshot IS NOT NULL THEN
   PERFORM platform_private.b2b_internal_assert_origin(o.internal_origin_snapshot,o.partner_id,o.cliente_id);
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
END $$;
REVOKE ALL ON FUNCTION platform_private.b2b_internal_child_snapshot_guard() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION platform_private.b2b_internal_child_snapshot_guard() TO service_role;
CREATE TRIGGER trg_00_b2b_internal_snapshot BEFORE INSERT OR UPDATE OR DELETE ON public.partner_order_items FOR EACH ROW EXECUTE FUNCTION platform_private.b2b_internal_child_snapshot_guard();
CREATE TRIGGER trg_00_b2b_internal_snapshot BEFORE INSERT OR UPDATE OR DELETE ON public.partner_order_payment_terms FOR EACH ROW EXECUTE FUNCTION platform_private.b2b_internal_child_snapshot_guard();
CREATE TRIGGER trg_00_b2b_internal_snapshot BEFORE INSERT OR UPDATE OR DELETE ON public.partner_order_payment_schedule FOR EACH ROW EXECUTE FUNCTION platform_private.b2b_internal_child_snapshot_guard();

-- Fix Q-01 without replacing existing scope or granting callers any new privilege.
DO $$ DECLARE def text; BEGIN
 SELECT pg_get_functiondef('public.respond_b2b_order_quote_secure(uuid,jsonb,date,integer,text)'::regprocedure) INTO def;
 IF position('public.b2b_phase1_order_visible(p_partner_order_id)' IN def)=0 THEN RAISE EXCEPTION 'QUOTE_PATTERN_CHANGED'; END IF;
 def:=replace(def,'IF NOT public.b2b_phase1_order_visible(p_partner_order_id) THEN', 'IF auth.uid() IS NULL THEN RAISE EXCEPTION ''auth_required'' USING ERRCODE=''42501''; END IF; PERFORM platform_private.b2b_internal_assert_origin((SELECT internal_origin_snapshot FROM public.partner_orders WHERE id=p_order_id),(SELECT partner_id FROM public.partner_orders WHERE id=p_order_id),(SELECT cliente_id FROM public.partner_orders WHERE id=p_order_id)); IF NOT public.b2b_phase1_order_visible(p_order_id) THEN');
 EXECUTE def;
END $$;

DO $$ DECLARE s jsonb:=jsonb_build_object('schema_version','1','organization_id','A','creditor_organization_id','A','issuer_organization_id','A','company_settings_id','C','actor_user_id','U','partner_id','T'); BEGIN
 IF NOT platform_private.b2b_internal_origin_valid(s) THEN RAISE EXCEPTION 'ORIGIN_SELFTEST_POSITIVE_FAILED'; END IF;
 IF platform_private.b2b_internal_origin_valid(s||'{"issuer_organization_id":"P"}'::jsonb) OR platform_private.b2b_internal_origin_valid(s||'{"creditor_organization_id":"P"}'::jsonb) OR platform_private.b2b_internal_origin_valid(NULL) THEN RAISE EXCEPTION 'ORIGIN_SELFTEST_NEGATIVE_FAILED'; END IF;
END $$;