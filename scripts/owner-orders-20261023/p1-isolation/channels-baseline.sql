CREATE OR REPLACE FUNCTION public.rpc_cc_archive_assignment(p_id uuid, p_motivo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.fn_cc_can_publish(auth.uid()) THEN RAISE EXCEPTION 'not_authorized_publish'; END IF;
  IF p_motivo IS NULL OR length(btrim(p_motivo)) = 0 THEN RAISE EXCEPTION 'motivo_required'; END IF;
  UPDATE public.commercial_payment_plan_assignments
     SET status='archived', archived_by=auth.uid(), archived_at=now(), updated_by=auth.uid()
   WHERE id=p_id AND status <> 'archived';
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid_transition'; END IF;
  PERFORM public.fn_cc_audit('assignment',p_id,'archive',NULL,NULL,p_motivo);
END $function$
;

CREATE OR REPLACE FUNCTION public.rpc_cc_bulk_adjust_apply(p_ids uuid[], p_percent numeric, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_count int;
BEGIN
  IF NOT public.fn_cc_can_prepare(auth.uid()) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF p_motivo IS NULL OR length(btrim(p_motivo))=0 THEN RAISE EXCEPTION 'motivo_required'; END IF;
  UPDATE public.commercial_condition_item_prices i
     SET condition_price = CASE WHEN i.pricing_mode='fixed_item_price'
                                THEN round(i.condition_price*(1+p_percent/100.0),2) ELSE i.condition_price END,
         discount_percent = CASE WHEN i.pricing_mode='discount_from_base'
                                 THEN LEAST(100,GREATEST(0,round(i.discount_percent+p_percent,4))) ELSE i.discount_percent END,
         motivo = p_motivo, updated_by = auth.uid()
   WHERE i.id = ANY(p_ids) AND i.status IN ('draft','pending_approval');
  GET DIAGNOSTICS v_count = ROW_COUNT;
  PERFORM public.fn_cc_audit('bulk_adjust',NULL,'apply',NULL,
    jsonb_build_object('percent',p_percent,'rows',v_count),p_motivo);
  RETURN jsonb_build_object('updated', v_count);
END $function$
;

CREATE OR REPLACE FUNCTION public.rpc_cc_bulk_adjust_preview(p_ids uuid[], p_percent numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v jsonb;
BEGIN
  IF NOT public.fn_cc_can_prepare(auth.uid()) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id',i.id,'pricing_mode',i.pricing_mode,
           'current_price',i.condition_price,'current_discount',i.discount_percent,
           'new_price', CASE WHEN i.pricing_mode='fixed_item_price'
                             THEN round(i.condition_price*(1+p_percent/100.0),2) END,
           'new_discount', CASE WHEN i.pricing_mode='discount_from_base'
                                THEN LEAST(100,GREATEST(0,round(i.discount_percent+p_percent,4))) END)),'[]'::jsonb)
    INTO v FROM public.commercial_condition_item_prices i
   WHERE i.id = ANY(p_ids) AND i.status IN ('draft','pending_approval');
  RETURN jsonb_build_object('preview', v);
END $function$
;

CREATE OR REPLACE FUNCTION public.rpc_cc_validate_matrix(p_plan_id uuid, p_buyer_scope text, p_partner_id uuid DEFAULT NULL::uuid, p_customer_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_missing jsonb; v_drafts int; v_quote int;
BEGIN
  IF NOT public.fn_cc_can_prepare(auth.uid()) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('tipo',tipo,'id',id,'nome',nome)),'[]'::jsonb) INTO v_missing
  FROM (
    SELECT 'produto' tipo, p.id, p.nome FROM public.produtos p
     WHERE COALESCE(p.ativo,true)
       AND NOT EXISTS (SELECT 1 FROM public.commercial_condition_item_prices i
            WHERE i.plan_id=p_plan_id AND i.product_id=p.id AND i.buyer_scope=p_buyer_scope
              AND i.partner_id IS NOT DISTINCT FROM p_partner_id
              AND i.customer_id IS NOT DISTINCT FROM p_customer_id
              AND i.status IN ('draft','pending_approval','published'))
    UNION ALL
    SELECT 'microrganismo', m.id, m.nome FROM public.microrganismos m
     WHERE COALESCE(m.ativo,true)
       AND NOT EXISTS (SELECT 1 FROM public.commercial_condition_item_prices i
            WHERE i.plan_id=p_plan_id AND i.microrganismo_id=m.id AND i.buyer_scope=p_buyer_scope
              AND i.partner_id IS NOT DISTINCT FROM p_partner_id
              AND i.customer_id IS NOT DISTINCT FROM p_customer_id
              AND i.status IN ('draft','pending_approval','published'))
  ) s;
  SELECT count(*) FILTER (WHERE status='draft'), count(*) FILTER (WHERE pricing_mode='quote_only')
    INTO v_drafts, v_quote
  FROM public.commercial_condition_item_prices
   WHERE plan_id=p_plan_id AND buyer_scope=p_buyer_scope
     AND partner_id IS NOT DISTINCT FROM p_partner_id
     AND customer_id IS NOT DISTINCT FROM p_customer_id;
  RETURN jsonb_build_object('ok', jsonb_array_length(v_missing)=0,
    'missing_items', v_missing, 'draft_count', COALESCE(v_drafts,0), 'quote_only_count', COALESCE(v_quote,0));
END $function$
;

CREATE OR REPLACE FUNCTION public.rpc_cc_copy_default_table(p_plan_id uuid, p_target_scope text, p_partner_id uuid, p_customer_id uuid, p_motivo text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_count int;
BEGIN
  IF NOT public.fn_cc_can_prepare(auth.uid()) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF p_target_scope NOT IN ('partner','producer') THEN RAISE EXCEPTION 'invalid_target_scope'; END IF;

  INSERT INTO public.commercial_condition_item_prices
    (plan_id,buyer_scope,partner_id,customer_id,product_id,microrganismo_id,unit_type,volume_ml,
     min_quantity,pricing_mode,condition_price,discount_percent,currency,valid_from,valid_until,
     status,motivo,created_by,updated_by)
  SELECT d.plan_id, p_target_scope,
         CASE WHEN p_target_scope='partner' THEN p_partner_id END,
         CASE WHEN p_target_scope='producer' THEN p_customer_id END,
         d.product_id, d.microrganismo_id, d.unit_type, d.volume_ml, d.min_quantity,
         d.pricing_mode, d.condition_price, d.discount_percent, d.currency,
         GREATEST(d.valid_from, CURRENT_DATE), d.valid_until, 'draft',
         COALESCE(p_motivo,'copia_tabela_padrao'), auth.uid(), auth.uid()
    FROM public.commercial_condition_item_prices d
   WHERE d.plan_id = p_plan_id AND d.buyer_scope='default' AND d.status <> 'archived'
     AND NOT EXISTS (
       SELECT 1 FROM public.commercial_condition_item_prices x
        WHERE x.plan_id=d.plan_id AND x.buyer_scope=p_target_scope
          AND x.partner_id IS NOT DISTINCT FROM CASE WHEN p_target_scope='partner' THEN p_partner_id END
          AND x.customer_id IS NOT DISTINCT FROM CASE WHEN p_target_scope='producer' THEN p_customer_id END
          AND x.product_id IS NOT DISTINCT FROM d.product_id
          AND x.microrganismo_id IS NOT DISTINCT FROM d.microrganismo_id
          AND x.unit_type = d.unit_type
          AND x.volume_ml IS NOT DISTINCT FROM d.volume_ml
          AND x.status <> 'archived');
  GET DIAGNOSTICS v_count = ROW_COUNT;
  PERFORM public.fn_cc_audit('bulk_adjust',NULL,'copy_default',NULL,
    jsonb_build_object('plan_id',p_plan_id,'scope',p_target_scope,'rows',v_count),p_motivo);
  RETURN jsonb_build_object('copied', v_count);
END $function$
;

CREATE OR REPLACE FUNCTION public.rpc_cc_delete_item_price(p_id uuid, p_motivo text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_before jsonb;
BEGIN
  IF NOT public.fn_cc_can_prepare(auth.uid()) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  SELECT to_jsonb(i) INTO v_before FROM public.commercial_condition_item_prices i WHERE i.id=p_id;
  IF v_before IS NULL THEN RAISE EXCEPTION 'item_price_not_found'; END IF;
  IF (v_before->>'status') <> 'draft' THEN RAISE EXCEPTION 'only_draft_can_be_deleted'; END IF;
  DELETE FROM public.commercial_condition_item_prices WHERE id=p_id;
  PERFORM public.fn_cc_audit('item_price',p_id,'delete',v_before,NULL,p_motivo);
END $function$
;

CREATE OR REPLACE FUNCTION public.rpc_cc_history(p_entity text DEFAULT NULL::text, p_entity_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 100)
 RETURNS SETOF commercial_condition_audit_log
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.fn_cc_can_prepare(auth.uid()) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  RETURN QUERY SELECT * FROM public.commercial_condition_audit_log l
    WHERE (p_entity IS NULL OR l.entity=p_entity)
      AND (p_entity_id IS NULL OR l.entity_id=p_entity_id)
    ORDER BY l.created_at DESC LIMIT LEAST(COALESCE(p_limit,100),500);
END $function$
;

CREATE OR REPLACE FUNCTION public.rpc_cc_list_assignments(p_status text DEFAULT NULL::text)
 RETURNS SETOF commercial_payment_plan_assignments
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.fn_cc_can_prepare(auth.uid()) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  RETURN QUERY SELECT * FROM public.commercial_payment_plan_assignments a
    WHERE (p_status IS NULL OR a.status = p_status)
    ORDER BY a.created_at DESC;
END $function$
;

CREATE OR REPLACE FUNCTION public.rpc_cc_list_item_prices(p_plan_id uuid DEFAULT NULL::uuid, p_status text DEFAULT NULL::text, p_assignment_id uuid DEFAULT NULL::uuid)
 RETURNS SETOF commercial_condition_item_prices
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.fn_cc_can_prepare(auth.uid()) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  RETURN QUERY SELECT * FROM public.commercial_condition_item_prices i
   WHERE (p_plan_id IS NULL OR i.plan_id = p_plan_id)
     AND (p_status IS NULL OR i.status = p_status)
     AND (p_assignment_id IS NULL OR i.assignment_id = p_assignment_id)
   ORDER BY i.updated_at DESC;
END $function$
;

CREATE OR REPLACE FUNCTION public.rpc_cc_publish_assignment(p_id uuid, p_motivo text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.fn_cc_can_publish(auth.uid()) THEN RAISE EXCEPTION 'not_authorized_publish'; END IF;
  UPDATE public.commercial_payment_plan_assignments
     SET status='published', published_by=auth.uid(), published_at=now(), updated_by=auth.uid()
   WHERE id=p_id AND status IN ('draft','pending_approval');
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid_transition'; END IF;
  PERFORM public.fn_cc_audit('assignment',p_id,'publish',NULL,NULL,p_motivo);
END $function$
;

CREATE OR REPLACE FUNCTION public.rpc_cc_publish_item_prices(p_ids uuid[], p_motivo text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r record; v_rule uuid; v_count int := 0;
BEGIN
  IF NOT public.fn_cc_can_publish(auth.uid()) THEN RAISE EXCEPTION 'not_authorized_publish'; END IF;
  IF p_ids IS NULL OR array_length(p_ids,1) IS NULL THEN RAISE EXCEPTION 'no_items'; END IF;

  FOR r IN SELECT * FROM public.commercial_condition_item_prices
            WHERE id = ANY(p_ids) AND status IN ('draft','pending_approval') FOR UPDATE
  LOOP
    IF r.buyer_scope = 'default' THEN RAISE EXCEPTION 'default_scope_not_publishable'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.commercial_payment_plan_assignments a
                    WHERE a.status='published' AND a.plan_id=r.plan_id
                      AND a.buyer_scope=r.buyer_scope
                      AND a.partner_id IS NOT DISTINCT FROM r.partner_id
                      AND a.customer_id IS NOT DISTINCT FROM r.customer_id) THEN
      RAISE EXCEPTION 'assignment_not_published';
    END IF;

    UPDATE public.commercial_price_rules
       SET active=false, updated_by=auth.uid(), updated_at=now()
     WHERE active
       AND plan_id = r.plan_id AND buyer_scope = r.buyer_scope
       AND partner_id IS NOT DISTINCT FROM r.partner_id
       AND customer_id IS NOT DISTINCT FROM r.customer_id
       AND product_id IS NOT DISTINCT FROM r.product_id
       AND microrganismo_id IS NOT DISTINCT FROM r.microrganismo_id
       AND unit_type = r.unit_type
       AND volume_ml IS NOT DISTINCT FROM r.volume_ml;

    INSERT INTO public.commercial_price_rules
      (buyer_scope,partner_id,customer_id,plan_id,product_id,microrganismo_id,unit_type,volume_ml,
       pricing_mode,condition_price,discount_percent,min_quantity,currency,valid_from,valid_until,active,motivo,
       created_by,updated_by)
    VALUES (r.buyer_scope,r.partner_id,r.customer_id,r.plan_id,r.product_id,r.microrganismo_id,
       r.unit_type,r.volume_ml,r.pricing_mode,
       CASE WHEN r.pricing_mode='fixed_item_price' THEN r.condition_price ELSE NULL END,
       CASE WHEN r.pricing_mode='discount_from_base' THEN r.discount_percent ELSE NULL END,
       COALESCE(r.min_quantity,0),
       COALESCE(r.currency,'BRL'),r.valid_from,r.valid_until,true,
       COALESCE(p_motivo, r.motivo), auth.uid(), auth.uid())
    RETURNING id INTO v_rule;

    UPDATE public.commercial_condition_item_prices
       SET status='published', published_by=auth.uid(), published_at=now(),
           published_rule_id=v_rule, updated_by=auth.uid()
     WHERE id = r.id;

    PERFORM public.fn_cc_audit('item_price', r.id, 'publish', to_jsonb(r),
      jsonb_build_object('price_rule_id', v_rule), p_motivo);
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('published', v_count);
END $function$
;

CREATE OR REPLACE FUNCTION public.rpc_cc_submit_assignment(p_id uuid, p_motivo text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.fn_cc_can_prepare(auth.uid()) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  UPDATE public.commercial_payment_plan_assignments
     SET status='pending_approval', submitted_by=auth.uid(), submitted_at=now(), updated_by=auth.uid()
   WHERE id=p_id AND status='draft';
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid_transition'; END IF;
  PERFORM public.fn_cc_audit('assignment',p_id,'submit',NULL,NULL,p_motivo);
END $function$
;

CREATE OR REPLACE FUNCTION public.rpc_cc_upsert_assignment(p_id uuid, p_plan_id uuid, p_buyer_scope text, p_partner_id uuid, p_customer_id uuid, p_valid_from date, p_valid_until date, p_motivo text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_id uuid; v_before jsonb;
BEGIN
  IF NOT public.fn_cc_can_prepare(auth.uid()) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF p_id IS NULL THEN
    INSERT INTO public.commercial_payment_plan_assignments
      (plan_id,buyer_scope,partner_id,customer_id,valid_from,valid_until,motivo,created_by,updated_by)
    VALUES (p_plan_id,p_buyer_scope,p_partner_id,p_customer_id,
            COALESCE(p_valid_from,CURRENT_DATE),p_valid_until,p_motivo,auth.uid(),auth.uid())
    RETURNING id INTO v_id;
    PERFORM public.fn_cc_audit('assignment',v_id,'create',NULL,
      to_jsonb((SELECT a FROM public.commercial_payment_plan_assignments a WHERE a.id=v_id)),p_motivo);
  ELSE
    SELECT to_jsonb(a) INTO v_before FROM public.commercial_payment_plan_assignments a WHERE a.id=p_id;
    IF v_before IS NULL THEN RAISE EXCEPTION 'assignment_not_found'; END IF;
    IF (v_before->>'status') <> 'draft' THEN RAISE EXCEPTION 'assignment_not_editable'; END IF;
    UPDATE public.commercial_payment_plan_assignments
       SET plan_id=p_plan_id, buyer_scope=p_buyer_scope, partner_id=p_partner_id, customer_id=p_customer_id,
           valid_from=COALESCE(p_valid_from,valid_from), valid_until=p_valid_until,
           motivo=p_motivo, updated_by=auth.uid()
     WHERE id=p_id RETURNING id INTO v_id;
    PERFORM public.fn_cc_audit('assignment',v_id,'update',v_before,
      to_jsonb((SELECT a FROM public.commercial_payment_plan_assignments a WHERE a.id=v_id)),p_motivo);
  END IF;
  RETURN v_id;
END $function$
;

CREATE OR REPLACE FUNCTION public.rpc_cc_upsert_item_price(p_id uuid, p_assignment_id uuid, p_plan_id uuid, p_buyer_scope text, p_partner_id uuid, p_customer_id uuid, p_product_id uuid, p_microrganismo_id uuid, p_unit_type text, p_volume_ml numeric, p_min_quantity numeric, p_pricing_mode text, p_condition_price numeric, p_discount_percent numeric, p_valid_from date, p_valid_until date, p_is_exception boolean, p_motivo text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_id uuid; v_before jsonb;
BEGIN
  IF NOT public.fn_cc_can_prepare(auth.uid()) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF p_is_exception AND (p_motivo IS NULL OR length(btrim(p_motivo))=0) THEN
    RAISE EXCEPTION 'motivo_required_for_exception';
  END IF;
  PERFORM public.fn_cc_validate_item_input(p_plan_id, p_pricing_mode, p_condition_price, p_discount_percent);

  IF p_id IS NULL THEN
    INSERT INTO public.commercial_condition_item_prices
      (assignment_id,plan_id,buyer_scope,partner_id,customer_id,product_id,microrganismo_id,
       unit_type,volume_ml,min_quantity,pricing_mode,condition_price,discount_percent,
       valid_from,valid_until,is_exception,motivo,created_by,updated_by)
    VALUES (p_assignment_id,p_plan_id,p_buyer_scope,p_partner_id,p_customer_id,p_product_id,p_microrganismo_id,
       p_unit_type,p_volume_ml,COALESCE(p_min_quantity,0),p_pricing_mode,p_condition_price,p_discount_percent,
       COALESCE(p_valid_from,CURRENT_DATE),p_valid_until,COALESCE(p_is_exception,false),p_motivo,auth.uid(),auth.uid())
    RETURNING id INTO v_id;
    PERFORM public.fn_cc_audit('item_price',v_id,'create',NULL,
      to_jsonb((SELECT i FROM public.commercial_condition_item_prices i WHERE i.id=v_id)),p_motivo);
  ELSE
    SELECT to_jsonb(i) INTO v_before FROM public.commercial_condition_item_prices i WHERE i.id=p_id;
    IF v_before IS NULL THEN RAISE EXCEPTION 'item_price_not_found'; END IF;
    IF (v_before->>'status') NOT IN ('draft','pending_approval') THEN RAISE EXCEPTION 'item_price_not_editable'; END IF;
    UPDATE public.commercial_condition_item_prices
       SET assignment_id=[REDACTED] plan_id=p_plan_id, buyer_scope=p_buyer_scope,
           partner_id=p_partner_id, customer_id=p_customer_id, product_id=p_product_id,
           microrganismo_id=p_microrganismo_id, unit_type=p_unit_type, volume_ml=p_volume_ml,
           min_quantity=COALESCE(p_min_quantity,0), pricing_mode=p_pricing_mode,
           condition_price=p_condition_price, discount_percent=p_discount_percent,
           valid_from=COALESCE(p_valid_from,valid_from), valid_until=p_valid_until,
           is_exception=COALESCE(p_is_exception,false), motivo=p_motivo, updated_by=auth.uid()
     WHERE id=p_id RETURNING id INTO v_id;
    PERFORM public.fn_cc_audit('item_price',v_id,'update',v_before,
      to_jsonb((SELECT i FROM public.commercial_condition_item_prices i WHERE i.id=v_id)),p_motivo);
  END IF;
  RETURN v_id;
END $function$
;

CREATE OR REPLACE FUNCTION public.fn_cc_audit(p_entity text, p_entity_id uuid, p_action text, p_before jsonb, p_after jsonb, p_motivo text)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  INSERT INTO public.commercial_condition_audit_log(entity, entity_id, action, actor_id, before_data, after_data, motivo)
  VALUES (p_entity, p_entity_id, p_action, auth.uid(), p_before, p_after, p_motivo);
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_cc_simulate_price(p_buyer_scope text, p_partner_id uuid, p_customer_id uuid, p_plan_id uuid, p_product_id uuid, p_microrganismo_id uuid, p_unit_type text, p_volume_ml numeric DEFAULT NULL::numeric, p_ref_date date DEFAULT CURRENT_DATE, p_quantity numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_uid uuid := auth.uid(); v_org uuid;
BEGIN
 IF v_uid IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE='42501'; END IF;
 v_org := public.h15_actor_organization();
 IF v_org IS NULL THEN RAISE EXCEPTION 'ACTIVE_TENANT_REQUIRED' USING ERRCODE='42501'; END IF;
 IF NOT public.fn_cc_can_prepare(v_uid) OR NOT public._saas_user_has_feature(v_uid,'catalogo_precos') THEN
  RAISE EXCEPTION 'not_authorized' USING ERRCODE='42501';
 END IF;
 IF COALESCE(p_buyer_scope,'partner') <> 'partner' OR p_customer_id IS NOT NULL THEN
  RAISE EXCEPTION 'PRODUCER_DIRECT_NOT_ENABLED' USING ERRCODE='P0001';
 END IF;
 -- Only commercial ownership proves internal A. CNPJ, tenant P and user links never authorize here.
 IF p_partner_id IS NULL OR NOT EXISTS (
  SELECT 1 FROM public.partner_accounts pa
  WHERE pa.id=p_partner_id AND pa.commercial_owner_organization_id=v_org
   AND pa.ativo IS TRUE AND pa.deleted_at IS NULL
   AND (pa.client_id IS NULL OR EXISTS (
    SELECT 1 FROM public.clientes c WHERE c.id=pa.client_id AND c.organization_id=v_org
   ))
 ) THEN RAISE EXCEPTION 'COMMERCIAL_PARTNER_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
 IF p_quantity IS NOT NULL AND (p_quantity <= 0 OR p_quantity::text IN ('NaN','Infinity','-Infinity')) THEN
  RAISE EXCEPTION 'QUANTITY_INVALID' USING ERRCODE='22023';
 END IF;
 IF p_volume_ml IS NOT NULL AND (p_volume_ml <= 0 OR p_volume_ml::text IN ('NaN','Infinity','-Infinity')) THEN
  RAISE EXCEPTION 'VOLUME_INVALID' USING ERRCODE='22023';
 END IF;
 -- Read-only canonical resolver; no order, credit, receivable, snapshot or fiscal writes.
 RETURN public.fn_resolve_commercial_price('partner',p_partner_id,NULL,p_plan_id,
  p_product_id,p_microrganismo_id,p_unit_type,p_volume_ml,p_ref_date,p_quantity);
END $function$
;

CREATE OR REPLACE FUNCTION public.fn_resolve_commercial_price(p_buyer_scope text, p_partner_id uuid, p_customer_id uuid, p_plan_id uuid, p_product_id uuid, p_microrganismo_id uuid, p_unit_type text, p_volume_ml numeric, p_ref_date date DEFAULT CURRENT_DATE, p_quantity numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_plan record; v_rule record; v_quote record;
  v_mode text; v_base numeric(18,6); v_src text; v_unit numeric(14,2);
  v_disc numeric(9,4) := 0; v_disc_src text := 'plan';
  v_ref date := COALESCE(p_ref_date, current_date);
  v_minq numeric(14,3) := 0;
BEGIN
  IF num_nonnulls(p_product_id, p_microrganismo_id) <> 1 THEN
    RETURN jsonb_build_object('ok',false,'reason_code','ITEM_INVALID','quote_required',false);
  END IF;
  IF p_unit_type IS NULL OR p_unit_type NOT IN ('hectare','litro','dose','unidade') THEN
    RETURN jsonb_build_object('ok',false,'reason_code','UNIT_INVALID','quote_required',false);
  END IF;
  IF p_unit_type = 'unidade' AND COALESCE(p_volume_ml,0) <= 0 THEN
    RETURN jsonb_build_object('ok',false,'reason_code','VOLUME_REQUIRED','quote_required',false);
  END IF;
  IF p_plan_id IS NULL THEN
    RETURN jsonb_build_object('ok',false,'reason_code','PLAN_REQUIRED','quote_required',false);
  END IF;
  IF p_quantity IS NOT NULL AND p_quantity <= 0 THEN
    RETURN jsonb_build_object('ok',false,'reason_code','QUANTITY_INVALID','quote_required',false);
  END IF;

  SELECT * INTO v_plan FROM public.commercial_payment_plans WHERE id = p_plan_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok',false,'reason_code','PLAN_NOT_FOUND','quote_required',false);
  END IF;
  IF NOT v_plan.active THEN
    RETURN jsonb_build_object('ok',false,'reason_code','PLAN_INACTIVE','quote_required',false);
  END IF;

  v_mode := COALESCE(v_plan.pricing_mode,'discount_from_base');

  IF v_mode = 'quote_only' THEN
    RETURN jsonb_build_object('ok',false,'reason_code','QUOTE_REQUIRED','quote_required',true,
      'pricing_mode','quote_only','price_source','quote_only','plan_id',p_plan_id,'currency','BRL',
      'base_price',NULL,'plan_discount_percent',NULL,'unit_price',NULL,'final_unit_price',NULL,
      'resolved_at', now());
  END IF;

  SELECT * INTO v_rule
  FROM public.commercial_price_rules r
  WHERE r.active
    AND r.pricing_mode = v_mode
    AND r.unit_type = p_unit_type
    AND r.volume_ml IS NOT DISTINCT FROM (CASE WHEN p_unit_type='unidade' THEN p_volume_ml ELSE NULL END)
    AND r.product_id IS NOT DISTINCT FROM p_product_id
    AND r.microrganismo_id IS NOT DISTINCT FROM p_microrganismo_id
    AND r.valid_from <= v_ref
    AND (r.valid_until IS NULL OR r.valid_until >= v_ref)
    AND ( (p_buyer_scope='partner'  AND r.buyer_scope='partner'  AND r.partner_id  = p_partner_id)
       OR (p_buyer_scope='producer' AND r.buyer_scope='producer' AND r.customer_id = p_customer_id) )
    AND (r.plan_id IS NULL OR r.plan_id = p_plan_id)
    AND ( NOT EXISTS (SELECT 1 FROM public.commercial_condition_item_prices ip
                       WHERE ip.published_rule_id = r.id)
          OR EXISTS (SELECT 1 FROM public.commercial_payment_plan_assignments a
                      WHERE a.status = 'published'
                        AND a.plan_id = r.plan_id
                        AND a.buyer_scope = r.buyer_scope
                        AND a.partner_id IS NOT DISTINCT FROM r.partner_id
                        AND a.customer_id IS NOT DISTINCT FROM r.customer_id
                        AND a.valid_from <= v_ref
                        AND (a.valid_until IS NULL OR a.valid_until >= v_ref)) )
  ORDER BY (r.plan_id IS NOT NULL) DESC, r.valid_from DESC
  LIMIT 1;

  SELECT * INTO v_quote
  FROM public.commercial_price_rules r
  WHERE r.active AND r.pricing_mode = 'quote_only'
    AND r.unit_type = p_unit_type
    AND r.volume_ml IS NOT DISTINCT FROM (CASE WHEN p_unit_type='unidade' THEN p_volume_ml ELSE NULL END)
    AND r.product_id IS NOT DISTINCT FROM p_product_id
    AND r.microrganismo_id IS NOT DISTINCT FROM p_microrganismo_id
    AND r.valid_from <= v_ref
    AND (r.valid_until IS NULL OR r.valid_until >= v_ref)
    AND ( (p_buyer_scope='partner'  AND r.buyer_scope='partner'  AND r.partner_id  = p_partner_id)
       OR (p_buyer_scope='producer' AND r.buyer_scope='producer' AND r.customer_id = p_customer_id) )
    AND (r.plan_id IS NULL OR r.plan_id = p_plan_id)
    AND ( NOT EXISTS (SELECT 1 FROM public.commercial_condition_item_prices ip
                       WHERE ip.published_rule_id = r.id)
          OR EXISTS (SELECT 1 FROM public.commercial_payment_plan_assignments a
                      WHERE a.status = 'published'
                        AND a.plan_id = r.plan_id
                        AND a.buyer_scope = r.buyer_scope
                        AND a.partner_id IS NOT DISTINCT FROM r.partner_id
                        AND a.customer_id IS NOT DISTINCT FROM r.customer_id
                        AND a.valid_from <= v_ref
                        AND (a.valid_until IS NULL OR a.valid_until >= v_ref)) )
  LIMIT 1;

  IF v_quote.id IS NOT NULL THEN
    RETURN jsonb_build_object('ok',false,'reason_code','QUOTE_REQUIRED','quote_required',true,
      'pricing_mode','quote_only','price_source','quote_only','rule_id',v_quote.id,'plan_id',p_plan_id,
      'currency','BRL','base_price',NULL,'plan_discount_percent',NULL,
      'unit_price',NULL,'final_unit_price',NULL,'resolved_at', now());
  END IF;

  v_minq := COALESCE(v_rule.min_quantity, 0);
  IF v_minq > 0 THEN
    IF p_quantity IS NULL THEN
      RETURN jsonb_build_object('ok',false,'reason_code','QUANTITY_REQUIRED','quote_required',false,
        'min_quantity', v_minq, 'rule_id', v_rule.id, 'plan_id', p_plan_id, 'resolved_at', now());
    ELSIF p_quantity < v_minq THEN
      RETURN jsonb_build_object('ok',false,'reason_code','MIN_QUANTITY_NOT_MET','quote_required',false,
        'min_quantity', v_minq, 'quantity', p_quantity, 'rule_id', v_rule.id,
        'plan_id', p_plan_id, 'resolved_at', now());
    END IF;
  END IF;

  IF v_mode = 'fixed_item_price' THEN
    IF v_rule.id IS NULL THEN
      RETURN jsonb_build_object('ok',false,'reason_code','PRICE_RULE_MISSING','quote_required',false,
        'pricing_mode','fixed_item_price','price_source',NULL,'plan_id',p_plan_id,'currency','BRL',
        'base_price',NULL,'plan_discount_percent',NULL,'unit_price',NULL,'final_unit_price',NULL,
        'resolved_at', now());
    END IF;
    v_unit := round(v_rule.condition_price, 2);
    RETURN jsonb_build_object('ok',true,'reason_code','OK','quote_required',false,
      'pricing_mode','fixed_item_price','price_source','condition_fixed_price',
      'base_price', v_unit, 'condition_price', v_unit, 'plan_discount_percent', 0,
      'discount_source','none','min_quantity', v_minq,
      'unit_price', v_unit, 'final_unit_price', v_unit,
      'currency','BRL','rule_id',v_rule.id,'plan_id',p_plan_id,
      'valid_from',v_rule.valid_from,'valid_until',v_rule.valid_until,'resolved_at', now());
  END IF;

  v_disc := COALESCE(v_plan.discount_percent, 0);
  IF v_rule.id IS NOT NULL AND v_rule.discount_percent IS NOT NULL THEN
    v_disc := v_rule.discount_percent;
    v_disc_src := 'item_rule';
  END IF;

  IF p_buyer_scope = 'partner' THEN
    SELECT ppp.preco_tabela INTO v_base
    FROM public.partner_product_prices ppp
    WHERE ppp.partner_id = p_partner_id
      AND ppp.ativo
      AND ppp.product_id IS NOT DISTINCT FROM p_product_id
      AND ppp.microrganismo_id IS NOT DISTINCT FROM p_microrganismo_id
      AND (ppp.valid_from IS NULL OR ppp.valid_from <= v_ref)
      AND (ppp.valid_until IS NULL OR ppp.valid_until >= v_ref)
    ORDER BY ppp.is_current DESC, ppp.valid_from DESC NULLS LAST
    LIMIT 1;
    IF COALESCE(v_base,0) > 0 THEN v_src := 'partner_base_price'; ELSE v_base := NULL; END IF;
  END IF;

  -- H3b: fonte canonica de preco comercial = catalogo_volumes (apresentacao ativa).
  IF v_base IS NULL THEN
    v_base := public.fn_catalogo_preco_canonico(p_product_id, p_microrganismo_id, p_unit_type, p_volume_ml);
    IF COALESCE(v_base,0) > 0 THEN v_src := 'catalog_volume_price'; ELSE v_base := NULL; END IF;
  END IF;

  -- Fallback legado documentado: mestre produtos/microrganismos (nao canonico).
  IF v_base IS NULL THEN
    IF p_product_id IS NOT NULL THEN
      SELECT CASE p_unit_type
               WHEN 'hectare' THEN COALESCE(NULLIF(pr.valor_ha_brl,0), (pr.dose_ml_ha/100.0) * pr.valor_dose_brl)
               WHEN 'litro'   THEN COALESCE(NULLIF(pr.valor_litro_brl,0), pr.valor_dose_brl * 10)
               WHEN 'dose'    THEN COALESCE(NULLIF(pr.valor_dose_brl,0), pr.valor_litro_brl / 10)
               WHEN 'unidade' THEN (p_volume_ml / 1000.0) * COALESCE(NULLIF(pr.valor_litro_brl,0), pr.valor_dose_brl*10)
             END
        INTO v_base
      FROM public.produtos pr WHERE pr.id = p_product_id;
    ELSE
      SELECT CASE p_unit_type
               WHEN 'hectare' THEN (mo.dose_ml_ha/100.0) * mo.valor_dose_brl
               WHEN 'litro'   THEN COALESCE(NULLIF(mo.valor_litro_brl,0), mo.valor_dose_brl * 10)
               WHEN 'dose'    THEN COALESCE(NULLIF(mo.valor_dose_brl,0), mo.valor_litro_brl / 10)
               WHEN 'unidade' THEN (p_volume_ml / 1000.0) * COALESCE(NULLIF(mo.valor_litro_brl,0), mo.valor_dose_brl*10)
             END
        INTO v_base
      FROM public.microrganismos mo WHERE mo.id = p_microrganismo_id;
    END IF;
    IF COALESCE(v_base,0) > 0 THEN v_src := 'catalog_base_price'; ELSE v_base := NULL; END IF;
  END IF;

  IF v_base IS NULL THEN
    RETURN jsonb_build_object('ok',false,'reason_code','ITEM_WITHOUT_PRICE','quote_required',false,
      'pricing_mode','discount_from_base','price_source',NULL,'plan_id',p_plan_id,'currency','BRL',
      'base_price',NULL,'plan_discount_percent',v_disc,'unit_price',NULL,'final_unit_price',NULL,
      'rule_id', v_rule.id, 'resolved_at', now());
  END IF;

  v_unit := round(v_base * (1 - v_disc/100.0), 2);
  IF v_unit <= 0 THEN
    RETURN jsonb_build_object('ok',false,'reason_code','ITEM_WITHOUT_PRICE','quote_required',false,
      'pricing_mode','discount_from_base','currency','BRL','plan_id',p_plan_id,'resolved_at', now());
  END IF;

  RETURN jsonb_build_object('ok',true,'reason_code','OK','quote_required',false,
    'pricing_mode','discount_from_base','price_source',v_src,
    'base_price', round(v_base,2), 'condition_price', NULL, 'plan_discount_percent', v_disc,
    'discount_source', v_disc_src, 'min_quantity', v_minq,
    'unit_price', v_unit, 'final_unit_price', v_unit,
    'currency','BRL','rule_id',v_rule.id,'plan_id',p_plan_id,
    'valid_from',v_rule.valid_from,'valid_until',v_rule.valid_until,'resolved_at', now());
END $function$
;