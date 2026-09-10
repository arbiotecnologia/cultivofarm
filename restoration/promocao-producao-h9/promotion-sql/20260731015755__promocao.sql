-- ============================================================================
-- ARTEFATO DERIVADO DE PROMOÇÃO — NÃO É MIGRATION HISTÓRICA, NÃO EDITE
-- Origem      : supabase/migrations/20260731015755_beced84b-0e3f-46a8-a29d-218771555108.sql
-- SHA-256 orig: d3bca5f82342866e8c7ac716411fdeb3d2ac872bab96a186cc87115f531b18f5
-- Gerador     : restoration/promocao-producao-h9/gerar-promotion-sql.py
-- Transformação: 1 bloco(s) DO de guarda removido(s); guarda canônica de promoção prefixada
--
-- A guarda de homologação foi REMOVIDA e substituída pela guarda canônica de
-- promoção. O runner valida o ref do alvo por canal externo (API/DSN) e só
-- então executa `SET LOCAL promocao.target_ref = 'navfzbwgwzruipouyfnk'`. Nenhuma tabela
-- marcadora de homologação é consultada em produção.
-- ============================================================================
DO $promo_guard$
BEGIN
  IF coalesce(current_setting('promocao.target_ref', true), '') <> 'navfzbwgwzruipouyfnk' THEN
    RAISE EXCEPTION 'PROMO_GUARD: alvo nao confirmado (esperado %)', 'navfzbwgwzruipouyfnk'
      USING ERRCODE = '42501';
  END IF;
END
$promo_guard$;

-- ============================================================
-- FASE B parte 2 — RPCs de condições/preços (staging only)
-- ============================================================
-- [guarda de homologação removida pelo gerador de promoção]


-- Alinha vocabulário de escopo com commercial_price_rules ('producer')
ALTER TABLE public.commercial_payment_plan_assignments
  DROP CONSTRAINT IF EXISTS commercial_payment_plan_assignments_buyer_scope_check,
  DROP CONSTRAINT IF EXISTS cppa_scope_target_ck;
ALTER TABLE public.commercial_payment_plan_assignments
  ADD CONSTRAINT cppa_buyer_scope_ck CHECK (buyer_scope IN ('partner','producer','default')),
  ADD CONSTRAINT cppa_scope_target_ck CHECK (
    (buyer_scope='partner'  AND partner_id IS NOT NULL AND customer_id IS NULL) OR
    (buyer_scope='producer' AND customer_id IS NOT NULL AND partner_id IS NULL) OR
    (buyer_scope='default'  AND partner_id IS NULL AND customer_id IS NULL));

ALTER TABLE public.commercial_condition_item_prices
  DROP CONSTRAINT IF EXISTS commercial_condition_item_prices_buyer_scope_check,
  DROP CONSTRAINT IF EXISTS ccip_scope_target_ck;
ALTER TABLE public.commercial_condition_item_prices
  ADD CONSTRAINT ccip_buyer_scope_ck CHECK (buyer_scope IN ('partner','producer','default')),
  ADD CONSTRAINT ccip_scope_target_ck CHECK (
    (buyer_scope='partner'  AND partner_id IS NOT NULL AND customer_id IS NULL) OR
    (buyer_scope='producer' AND customer_id IS NOT NULL AND partner_id IS NULL) OR
    (buyer_scope='default'  AND partner_id IS NULL AND customer_id IS NULL));

-- ---------- helpers de alçada ----------
CREATE OR REPLACE FUNCTION public.fn_cc_can_prepare(p_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p_uid IS NOT NULL AND (
    public.has_role(p_uid,'administrador'::app_role) OR
    public.has_role(p_uid,'financeiro'::app_role) OR
    public.has_role(p_uid,'gestor_comercial'::app_role));
$$;

CREATE OR REPLACE FUNCTION public.fn_cc_can_publish(p_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p_uid IS NOT NULL AND (
    public.has_role(p_uid,'administrador'::app_role) OR
    public.has_role(p_uid,'financeiro'::app_role));
$$;

CREATE OR REPLACE FUNCTION public.fn_cc_audit(p_entity text, p_entity_id uuid, p_action text,
  p_before jsonb, p_after jsonb, p_motivo text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.commercial_condition_audit_log(entity, entity_id, action, actor_id, before_data, after_data, motivo)
  VALUES (p_entity, p_entity_id, p_action, auth.uid(), p_before, p_after, p_motivo);
$$;

-- ---------- assignments ----------
CREATE OR REPLACE FUNCTION public.rpc_cc_list_assignments(p_status text DEFAULT NULL)
RETURNS SETOF public.commercial_payment_plan_assignments
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.fn_cc_can_prepare(auth.uid()) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  RETURN QUERY SELECT * FROM public.commercial_payment_plan_assignments a
    WHERE (p_status IS NULL OR a.status = p_status)
    ORDER BY a.created_at DESC;
END $$;

CREATE OR REPLACE FUNCTION public.rpc_cc_upsert_assignment(
  p_id uuid, p_plan_id uuid, p_buyer_scope text, p_partner_id uuid, p_customer_id uuid,
  p_valid_from date, p_valid_until date, p_motivo text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
END $$;

CREATE OR REPLACE FUNCTION public.rpc_cc_submit_assignment(p_id uuid, p_motivo text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.fn_cc_can_prepare(auth.uid()) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  UPDATE public.commercial_payment_plan_assignments
     SET status='pending_approval', submitted_by=auth.uid(), submitted_at=now(), updated_by=auth.uid()
   WHERE id=p_id AND status='draft';
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid_transition'; END IF;
  PERFORM public.fn_cc_audit('assignment',p_id,'submit',NULL,NULL,p_motivo);
END $$;

CREATE OR REPLACE FUNCTION public.rpc_cc_publish_assignment(p_id uuid, p_motivo text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.fn_cc_can_publish(auth.uid()) THEN RAISE EXCEPTION 'not_authorized_publish'; END IF;
  UPDATE public.commercial_payment_plan_assignments
     SET status='published', published_by=auth.uid(), published_at=now(), updated_by=auth.uid()
   WHERE id=p_id AND status IN ('draft','pending_approval');
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid_transition'; END IF;
  PERFORM public.fn_cc_audit('assignment',p_id,'publish',NULL,NULL,p_motivo);
END $$;

CREATE OR REPLACE FUNCTION public.rpc_cc_archive_assignment(p_id uuid, p_motivo text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.fn_cc_can_publish(auth.uid()) THEN RAISE EXCEPTION 'not_authorized_publish'; END IF;
  IF p_motivo IS NULL OR length(btrim(p_motivo)) = 0 THEN RAISE EXCEPTION 'motivo_required'; END IF;
  UPDATE public.commercial_payment_plan_assignments
     SET status='archived', archived_by=auth.uid(), archived_at=now(), updated_by=auth.uid()
   WHERE id=p_id AND status <> 'archived';
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid_transition'; END IF;
  PERFORM public.fn_cc_audit('assignment',p_id,'archive',NULL,NULL,p_motivo);
END $$;

-- ---------- matriz de itens ----------
CREATE OR REPLACE FUNCTION public.rpc_cc_list_item_prices(
  p_plan_id uuid DEFAULT NULL, p_status text DEFAULT NULL, p_assignment_id uuid DEFAULT NULL)
RETURNS SETOF public.commercial_condition_item_prices
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.fn_cc_can_prepare(auth.uid()) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  RETURN QUERY SELECT * FROM public.commercial_condition_item_prices i
   WHERE (p_plan_id IS NULL OR i.plan_id = p_plan_id)
     AND (p_status IS NULL OR i.status = p_status)
     AND (p_assignment_id IS NULL OR i.assignment_id = p_assignment_id)
   ORDER BY i.updated_at DESC;
END $$;

CREATE OR REPLACE FUNCTION public.rpc_cc_upsert_item_price(
  p_id uuid, p_assignment_id uuid, p_plan_id uuid, p_buyer_scope text,
  p_partner_id uuid, p_customer_id uuid, p_product_id uuid, p_microrganismo_id uuid,
  p_unit_type text, p_volume_ml numeric, p_min_quantity numeric,
  p_pricing_mode text, p_condition_price numeric, p_discount_percent numeric,
  p_valid_from date, p_valid_until date, p_is_exception boolean, p_motivo text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_before jsonb;
BEGIN
  IF NOT public.fn_cc_can_prepare(auth.uid()) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF p_is_exception AND (p_motivo IS NULL OR length(btrim(p_motivo))=0) THEN
    RAISE EXCEPTION 'motivo_required_for_exception';
  END IF;
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
       SET assignment_id=p_assignment_id, plan_id=p_plan_id, buyer_scope=p_buyer_scope,
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
END $$;

CREATE OR REPLACE FUNCTION public.rpc_cc_delete_item_price(p_id uuid, p_motivo text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_before jsonb;
BEGIN
  IF NOT public.fn_cc_can_prepare(auth.uid()) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  SELECT to_jsonb(i) INTO v_before FROM public.commercial_condition_item_prices i WHERE i.id=p_id;
  IF v_before IS NULL THEN RAISE EXCEPTION 'item_price_not_found'; END IF;
  IF (v_before->>'status') <> 'draft' THEN RAISE EXCEPTION 'only_draft_can_be_deleted'; END IF;
  DELETE FROM public.commercial_condition_item_prices WHERE id=p_id;
  PERFORM public.fn_cc_audit('item_price',p_id,'delete',v_before,NULL,p_motivo);
END $$;

-- Validação: itens ativos sem preço para o plano/escopo
CREATE OR REPLACE FUNCTION public.rpc_cc_validate_matrix(
  p_plan_id uuid, p_buyer_scope text, p_partner_id uuid DEFAULT NULL, p_customer_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
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
END $$;

-- Publicação: projeta rascunhos em commercial_price_rules (fonte canônica do carrinho)
CREATE OR REPLACE FUNCTION public.rpc_cc_publish_item_prices(p_ids uuid[], p_motivo text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
       pricing_mode,condition_price,currency,valid_from,valid_until,active,motivo,created_by,updated_by)
    VALUES (r.buyer_scope,r.partner_id,r.customer_id,r.plan_id,r.product_id,r.microrganismo_id,
       r.unit_type,r.volume_ml,r.pricing_mode,
       CASE WHEN r.pricing_mode='fixed_item_price' THEN r.condition_price ELSE NULL END,
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
END $$;

-- Copiar tabela padrão (escopo default -> parceiro/produtor, sempre em rascunho)
CREATE OR REPLACE FUNCTION public.rpc_cc_copy_default_table(
  p_plan_id uuid, p_target_scope text, p_partner_id uuid, p_customer_id uuid, p_motivo text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
END $$;

-- Reajuste em massa (prévia e aplicação em rascunho)
CREATE OR REPLACE FUNCTION public.rpc_cc_bulk_adjust_preview(
  p_ids uuid[], p_percent numeric)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
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
END $$;

CREATE OR REPLACE FUNCTION public.rpc_cc_bulk_adjust_apply(
  p_ids uuid[], p_percent numeric, p_motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
END $$;

-- Simulação server-side (usa o mesmo resolvedor do carrinho)
CREATE OR REPLACE FUNCTION public.rpc_cc_simulate_price(
  p_buyer_scope text, p_partner_id uuid, p_customer_id uuid, p_plan_id uuid,
  p_product_id uuid, p_microrganismo_id uuid, p_unit_type text,
  p_volume_ml numeric DEFAULT NULL, p_ref_date date DEFAULT CURRENT_DATE)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.fn_cc_can_prepare(auth.uid()) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  RETURN public.fn_resolve_commercial_price(p_buyer_scope,p_partner_id,p_customer_id,p_plan_id,
    p_product_id,p_microrganismo_id,p_unit_type,p_volume_ml,p_ref_date);
END $$;

-- Histórico
CREATE OR REPLACE FUNCTION public.rpc_cc_history(p_entity text DEFAULT NULL, p_entity_id uuid DEFAULT NULL, p_limit int DEFAULT 100)
RETURNS SETOF public.commercial_condition_audit_log
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.fn_cc_can_prepare(auth.uid()) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  RETURN QUERY SELECT * FROM public.commercial_condition_audit_log l
    WHERE (p_entity IS NULL OR l.entity=p_entity)
      AND (p_entity_id IS NULL OR l.entity_id=p_entity_id)
    ORDER BY l.created_at DESC LIMIT LEAST(COALESCE(p_limit,100),500);
END $$;

-- ---------- elegibilidade: plano exige assignment publicado ----------
CREATE OR REPLACE FUNCTION public.rpc_b2b_list_selectable_payment_plans()
RETURNS TABLE(id uuid, code text, name text, description text, plan_type text, max_days integer,
  months_count numeric, installment_count integer, discount_percent numeric, monthly_interest_percent numeric,
  interest_type text, pricing_mode text, minimum_order_amount numeric, requires_credit_approval boolean,
  requires_guarantee boolean, requires_financial_approval boolean, is_default boolean, sort_order integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_uid uuid := auth.uid(); v_admin boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authorized'; END IF;
  v_admin := public.has_role(v_uid,'administrador'::app_role)
          OR public.has_role(v_uid,'financeiro'::app_role)
          OR public.has_role(v_uid,'gestor_comercial'::app_role);
  IF NOT (v_admin OR public.has_role(v_uid,'parceiro_b2b'::app_role)) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  RETURN QUERY
  SELECT p.id, p.code, p.name, p.description, p.plan_type::text,
         p.max_days, p.months_count, p.installment_count,
         p.discount_percent, p.monthly_interest_percent,
         p.interest_type::text, p.pricing_mode::text, p.minimum_order_amount,
         p.requires_credit_approval, p.requires_guarantee, p.requires_financial_approval,
         p.is_default, p.sort_order
  FROM public.commercial_payment_plans p
  WHERE p.active = true
    AND p.superseded_by_id IS NULL
    AND p.valid_from <= now()
    AND (p.valid_until IS NULL OR p.valid_until > now())
    AND (
      v_admin
      OR EXISTS (
        SELECT 1
          FROM public.commercial_payment_plan_assignments a
          JOIN public.partner_users pu ON pu.partner_id = a.partner_id
         WHERE a.plan_id = p.id
           AND a.status = 'published'
           AND a.buyer_scope = 'partner'
           AND pu.user_id = v_uid
           AND a.valid_from <= CURRENT_DATE
           AND (a.valid_until IS NULL OR a.valid_until >= CURRENT_DATE)
      )
    )
  ORDER BY p.sort_order, p.name;
END
$function$;

ALTER FUNCTION public.rpc_b2b_list_selectable_payment_plans() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.rpc_b2b_list_selectable_payment_plans() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_b2b_list_selectable_payment_plans() TO authenticated;

-- Grants das novas RPCs: somente authenticated (alçada checada dentro)
DO $$
DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
            WHERE n.nspname='public' AND (p.proname LIKE 'rpc_cc\_%' OR p.proname LIKE 'fn_cc\_%')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f.sig);
  END LOOP;
END$$;
