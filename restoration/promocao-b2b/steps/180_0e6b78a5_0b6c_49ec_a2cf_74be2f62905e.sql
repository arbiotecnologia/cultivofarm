-- PACOTE DE PROMOCAO MOTOR B2B — passo 180
-- Fase 6: administracao segura de planos comerciais
-- Origem (historico, NAO modificado): supabase/migrations/20260730014752_0e6b78a5-0b6c-49ec-a2cf-74be2f62905e.sql
-- sha256(origem) = c6b0ddcb5e5469476682c206916abe6620c3a9ec27220e9e7aa3161abe8fea72
-- Guarda de ambiente removida deste passo: a verificacao de destino e
-- centralizada e fail-closed em 000_preflight.sql (executado antes).
-- Forward-only. Nao contem fixtures, UUIDs de teste nem DROP destrutivo de dados.

-- ---------- 1) Evolucao minima do modelo ----------
ALTER TABLE public.commercial_payment_plans
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS root_plan_id uuid REFERENCES public.commercial_payment_plans(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS superseded_by_id uuid REFERENCES public.commercial_payment_plans(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS valid_from timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS valid_until timestamptz,
  ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS version_reason text,
  ADD COLUMN IF NOT EXISTS updated_by uuid;

UPDATE public.commercial_payment_plans SET root_plan_id = id WHERE root_plan_id IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cpp_validity_window_chk') THEN
    ALTER TABLE public.commercial_payment_plans
      ADD CONSTRAINT cpp_validity_window_chk
      CHECK (valid_until IS NULL OR valid_until > valid_from);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cpp_nonnegative_chk') THEN
    ALTER TABLE public.commercial_payment_plans
      ADD CONSTRAINT cpp_nonnegative_chk
      CHECK (max_days >= 0 AND months_count >= 0 AND sort_order >= 0 AND version >= 1
             AND (minimum_order_amount IS NULL OR minimum_order_amount >= 0));
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_cpp_single_default
  ON public.commercial_payment_plans ((true)) WHERE is_default;
CREATE INDEX IF NOT EXISTS idx_cpp_root_version
  ON public.commercial_payment_plans (root_plan_id, version DESC);
CREATE INDEX IF NOT EXISTS idx_cpp_validity
  ON public.commercial_payment_plans (active, valid_from, valid_until);

-- ---------- 2) Helpers canonicos ----------
CREATE OR REPLACE FUNCTION public.fn_b2b_can_admin_plans(_user_id uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user_id IS NOT NULL AND (
    public.has_role(_user_id, 'administrador'::app_role)
    OR public.has_role(_user_id, 'financeiro'::app_role)
    OR public.has_role(_user_id, 'gestor_comercial'::app_role)
  );
$$;

CREATE OR REPLACE FUNCTION public.fn_b2b_plan_selectable(_plan_id uuid, _ref timestamptz DEFAULT now())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.commercial_payment_plans p
    WHERE p.id = _plan_id
      AND p.active = true
      AND p.superseded_by_id IS NULL
      AND p.valid_from <= _ref
      AND (p.valid_until IS NULL OR p.valid_until > _ref)
  );
$$;

CREATE OR REPLACE FUNCTION public.fn_b2b_plan_referenced(_plan_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.partner_orders WHERE payment_plan_id = _plan_id)
      OR EXISTS (SELECT 1 FROM public.partner_order_payment_terms WHERE payment_plan_id = _plan_id)
      OR EXISTS (SELECT 1 FROM public.commercial_price_rules WHERE plan_id = _plan_id);
$$;

-- ---------- 3) Imutabilidade financeira + delete guard ----------
CREATE OR REPLACE FUNCTION public.tg_cpp_guard_financial_immutability()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF public.fn_b2b_plan_referenced(OLD.id) THEN
      RAISE EXCEPTION 'plan_referenced_delete_blocked';
    END IF;
    RETURN OLD;
  END IF;

  IF public.fn_b2b_plan_referenced(OLD.id) AND (
       NEW.discount_percent IS DISTINCT FROM OLD.discount_percent
    OR NEW.monthly_interest_percent IS DISTINCT FROM OLD.monthly_interest_percent
    OR NEW.interest_type IS DISTINCT FROM OLD.interest_type
    OR NEW.installment_count IS DISTINCT FROM OLD.installment_count
    OR NEW.months_count IS DISTINCT FROM OLD.months_count
    OR NEW.max_days IS DISTINCT FROM OLD.max_days
    OR NEW.pricing_mode IS DISTINCT FROM OLD.pricing_mode
    OR NEW.minimum_order_amount IS DISTINCT FROM OLD.minimum_order_amount
    OR NEW.plan_type IS DISTINCT FROM OLD.plan_type
  ) THEN
    RAISE EXCEPTION 'plan_financial_immutable_create_new_version';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_cpp_guard_financial ON public.commercial_payment_plans;
CREATE TRIGGER trg_cpp_guard_financial
  BEFORE UPDATE OR DELETE ON public.commercial_payment_plans
  FOR EACH ROW EXECUTE FUNCTION public.tg_cpp_guard_financial_immutability();

-- ---------- 4) Validacao autoritativa nas RPCs operacionais ----------
DO $patch$
DECLARE r record; d text;
BEGIN
  FOR r IN
    SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('simulate_b2b_payment_plan_secure','create_partner_order_secure',
                        'convert_partner_simulation_to_order_secure','respond_b2b_order_quote_secure')
  LOOP
    d := pg_get_functiondef(r.oid);
    IF position('fn_b2b_plan_selectable' IN d) = 0
       AND position('RAISE EXCEPTION ''plan_not_found''' IN d) > 0 THEN
      d := regexp_replace(
        d,
        'RAISE EXCEPTION ''plan_not_found''; END IF;',
        'RAISE EXCEPTION ''plan_not_found''; END IF; IF NOT public.fn_b2b_plan_selectable(v_plan.id) THEN RAISE EXCEPTION ''plan_not_selectable''; END IF;'
      );
      EXECUTE d;
    END IF;
  END LOOP;
END
$patch$;

-- ---------- 5) RPCs administrativas ----------
CREATE OR REPLACE FUNCTION public._cpp_validate_payload(p jsonb)
RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE v_disc numeric; v_int numeric; v_inst integer; v_months numeric; v_days integer;
BEGIN
  IF coalesce(btrim(p->>'name'),'') = '' THEN RAISE EXCEPTION 'plan_name_required'; END IF;
  IF coalesce(btrim(p->>'code'),'') = '' THEN RAISE EXCEPTION 'plan_code_required'; END IF;
  IF coalesce(p->>'plan_type','') NOT IN ('cash','short_term','medium_term','extended_term','harvest','custom')
    THEN RAISE EXCEPTION 'plan_type_invalid'; END IF;
  IF coalesce(p->>'interest_type','') NOT IN ('none','simple','compound')
    THEN RAISE EXCEPTION 'interest_type_invalid'; END IF;
  IF coalesce(p->>'pricing_mode','discount_from_base') NOT IN ('discount_from_base','fixed_item_price','quote_only')
    THEN RAISE EXCEPTION 'pricing_mode_invalid'; END IF;

  v_disc := coalesce((p->>'discount_percent')::numeric, 0);
  v_int  := coalesce((p->>'monthly_interest_percent')::numeric, 0);
  v_inst := coalesce((p->>'installment_count')::integer, 1);
  v_months := coalesce((p->>'months_count')::numeric, 0);
  v_days := coalesce((p->>'max_days')::integer, 0);

  IF v_disc < 0 OR v_disc > 100 THEN RAISE EXCEPTION 'discount_out_of_range'; END IF;
  IF v_int < 0 OR v_int > 100 THEN RAISE EXCEPTION 'interest_out_of_range'; END IF;
  IF v_inst < 1 OR v_inst > 60 THEN RAISE EXCEPTION 'installment_out_of_range'; END IF;
  IF v_months < 0 OR v_months > 60 THEN RAISE EXCEPTION 'months_out_of_range'; END IF;
  IF v_days < 0 OR v_days > 1095 THEN RAISE EXCEPTION 'max_days_out_of_range'; END IF;
  IF (p ? 'minimum_order_amount') AND p->>'minimum_order_amount' IS NOT NULL
     AND (p->>'minimum_order_amount')::numeric < 0 THEN RAISE EXCEPTION 'minimum_order_amount_invalid'; END IF;
  IF (p ? 'valid_until') AND p->>'valid_until' IS NOT NULL
     AND (p->>'valid_until')::timestamptz <= coalesce((p->>'valid_from')::timestamptz, now())
     THEN RAISE EXCEPTION 'validity_window_invalid'; END IF;
END
$$;

CREATE OR REPLACE FUNCTION public._cpp_audit(_acao text, _plan_id uuid, _old jsonb, _new jsonb, _motivo text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.commercial_audit_log (usuario_id, acao, dados_anteriores, dados_novos)
  VALUES (
    auth.uid(),
    _acao,
    _old,
    coalesce(_new, '{}'::jsonb) || jsonb_build_object('plan_id', _plan_id, 'motivo', _motivo, 'origem', 'admin_planos_b2b')
  );
END
$$;

CREATE OR REPLACE FUNCTION public.rpc_admin_list_commercial_plans(
  p_search text DEFAULT NULL,
  p_status text DEFAULT 'all',
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid, code text, name text, description text, plan_type text, version integer,
  root_plan_id uuid, superseded_by_id uuid, valid_from timestamptz, valid_until timestamptz,
  is_default boolean, active boolean, sort_order integer, max_days integer, months_count numeric,
  installment_count integer, discount_percent numeric, monthly_interest_percent numeric,
  interest_type text, pricing_mode text, minimum_order_amount numeric,
  requires_credit_approval boolean, requires_guarantee boolean, requires_financial_approval boolean,
  is_referenced boolean, selectable boolean, total_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_limit integer := least(greatest(coalesce(p_limit,20),1),100);
        v_offset integer := greatest(coalesce(p_offset,0),0);
BEGIN
  IF NOT public.fn_b2b_can_admin_plans() THEN RAISE EXCEPTION 'not_authorized'; END IF;
  RETURN QUERY
  WITH base AS (
    SELECT p.* FROM public.commercial_payment_plans p
    WHERE (p_search IS NULL OR btrim(p_search) = ''
           OR p.name ILIKE '%'||btrim(p_search)||'%' OR p.code ILIKE '%'||btrim(p_search)||'%')
      AND (coalesce(p_status,'all') = 'all'
           OR (p_status = 'active' AND p.active)
           OR (p_status = 'inactive' AND NOT p.active))
  ), counted AS (SELECT count(*)::bigint c FROM base)
  SELECT b.id, b.code, b.name, b.description, b.plan_type, b.version,
         b.root_plan_id, b.superseded_by_id, b.valid_from, b.valid_until,
         b.is_default, b.active, b.sort_order, b.max_days, b.months_count,
         b.installment_count, b.discount_percent, b.monthly_interest_percent,
         b.interest_type, b.pricing_mode, b.minimum_order_amount,
         b.requires_credit_approval, b.requires_guarantee, b.requires_financial_approval,
         public.fn_b2b_plan_referenced(b.id), public.fn_b2b_plan_selectable(b.id),
         (SELECT c FROM counted)
  FROM base b
  ORDER BY b.sort_order ASC, b.code ASC, b.version DESC
  LIMIT v_limit OFFSET v_offset;
END
$$;

CREATE OR REPLACE FUNCTION public.rpc_admin_create_commercial_plan(p_payload jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.fn_b2b_can_admin_plans() THEN RAISE EXCEPTION 'not_authorized'; END IF;
  PERFORM public._cpp_validate_payload(p_payload);

  INSERT INTO public.commercial_payment_plans (
    name, code, description, plan_type, max_days, months_count, installment_count,
    discount_percent, monthly_interest_percent, interest_type, requires_credit_approval,
    requires_guarantee, requires_financial_approval, minimum_order_amount, pricing_mode,
    active, sort_order, created_by, updated_by, valid_from, valid_until, version, version_reason
  ) VALUES (
    btrim(p_payload->>'name'), upper(btrim(p_payload->>'code')), nullif(btrim(coalesce(p_payload->>'description','')),''),
    p_payload->>'plan_type', coalesce((p_payload->>'max_days')::integer,0),
    coalesce((p_payload->>'months_count')::numeric,0), coalesce((p_payload->>'installment_count')::integer,1),
    coalesce((p_payload->>'discount_percent')::numeric,0), coalesce((p_payload->>'monthly_interest_percent')::numeric,0),
    coalesce(p_payload->>'interest_type','compound'), coalesce((p_payload->>'requires_credit_approval')::boolean,false),
    coalesce((p_payload->>'requires_guarantee')::boolean,false), coalesce((p_payload->>'requires_financial_approval')::boolean,false),
    nullif(p_payload->>'minimum_order_amount','')::numeric, coalesce(p_payload->>'pricing_mode','discount_from_base'),
    coalesce((p_payload->>'active')::boolean,true), coalesce((p_payload->>'sort_order')::integer,0),
    auth.uid(), auth.uid(), coalesce(nullif(p_payload->>'valid_from','')::timestamptz, now()),
    nullif(p_payload->>'valid_until','')::timestamptz, 1, nullif(btrim(coalesce(p_payload->>'motivo','')),'')
  ) RETURNING id INTO v_id;

  UPDATE public.commercial_payment_plans SET root_plan_id = v_id WHERE id = v_id;
  PERFORM public._cpp_audit('commercial_plan_created', v_id, NULL, p_payload, p_payload->>'motivo');
  RETURN v_id;
END
$$;

CREATE OR REPLACE FUNCTION public.rpc_admin_version_commercial_plan(
  p_plan_id uuid, p_payload jsonb, p_motivo text DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_old public.commercial_payment_plans%ROWTYPE; v_new_id uuid; v_next integer; v_code text;
BEGIN
  IF NOT public.fn_b2b_can_admin_plans() THEN RAISE EXCEPTION 'not_authorized'; END IF;
  PERFORM public._cpp_validate_payload(p_payload);

  SELECT * INTO v_old FROM public.commercial_payment_plans WHERE id = p_plan_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'plan_not_found'; END IF;
  IF v_old.superseded_by_id IS NOT NULL THEN RAISE EXCEPTION 'plan_already_superseded'; END IF;

  SELECT coalesce(max(version),0) + 1 INTO v_next
    FROM public.commercial_payment_plans WHERE root_plan_id = coalesce(v_old.root_plan_id, v_old.id);
  v_code := upper(btrim(coalesce(nullif(p_payload->>'code',''), v_old.code)));
  IF v_code = v_old.code THEN v_code := v_code || '-V' || v_next; END IF;

  INSERT INTO public.commercial_payment_plans (
    name, code, description, plan_type, max_days, months_count, installment_count,
    discount_percent, monthly_interest_percent, interest_type, requires_credit_approval,
    requires_guarantee, requires_financial_approval, minimum_order_amount, pricing_mode,
    active, sort_order, created_by, updated_by, valid_from, valid_until,
    version, root_plan_id, version_reason
  ) VALUES (
    btrim(coalesce(nullif(p_payload->>'name',''), v_old.name)), v_code,
    coalesce(nullif(btrim(coalesce(p_payload->>'description','')),''), v_old.description),
    coalesce(nullif(p_payload->>'plan_type',''), v_old.plan_type),
    coalesce((p_payload->>'max_days')::integer, v_old.max_days),
    coalesce((p_payload->>'months_count')::numeric, v_old.months_count),
    coalesce((p_payload->>'installment_count')::integer, v_old.installment_count),
    coalesce((p_payload->>'discount_percent')::numeric, v_old.discount_percent),
    coalesce((p_payload->>'monthly_interest_percent')::numeric, v_old.monthly_interest_percent),
    coalesce(nullif(p_payload->>'interest_type',''), v_old.interest_type),
    coalesce((p_payload->>'requires_credit_approval')::boolean, v_old.requires_credit_approval),
    coalesce((p_payload->>'requires_guarantee')::boolean, v_old.requires_guarantee),
    coalesce((p_payload->>'requires_financial_approval')::boolean, v_old.requires_financial_approval),
    coalesce(nullif(p_payload->>'minimum_order_amount','')::numeric, v_old.minimum_order_amount),
    coalesce(nullif(p_payload->>'pricing_mode',''), v_old.pricing_mode),
    true, v_old.sort_order, auth.uid(), auth.uid(),
    coalesce(nullif(p_payload->>'valid_from','')::timestamptz, now()),
    nullif(p_payload->>'valid_until','')::timestamptz,
    v_next, coalesce(v_old.root_plan_id, v_old.id), nullif(btrim(coalesce(p_motivo,'')),'')
  ) RETURNING id INTO v_new_id;

  UPDATE public.commercial_payment_plans
     SET superseded_by_id = v_new_id, active = false, is_default = false,
         valid_until = coalesce(valid_until, now()), updated_by = auth.uid()
   WHERE id = p_plan_id;

  PERFORM public._cpp_audit('commercial_plan_versioned', v_new_id, to_jsonb(v_old), p_payload || jsonb_build_object('version', v_next, 'previous_plan_id', p_plan_id), p_motivo);
  RETURN v_new_id;
END
$$;

CREATE OR REPLACE FUNCTION public.rpc_admin_update_commercial_plan_metadata(
  p_plan_id uuid, p_name text DEFAULT NULL, p_description text DEFAULT NULL, p_sort_order integer DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_old public.commercial_payment_plans%ROWTYPE;
BEGIN
  IF NOT public.fn_b2b_can_admin_plans() THEN RAISE EXCEPTION 'not_authorized'; END IF;
  SELECT * INTO v_old FROM public.commercial_payment_plans WHERE id = p_plan_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'plan_not_found'; END IF;
  IF p_sort_order IS NOT NULL AND p_sort_order < 0 THEN RAISE EXCEPTION 'sort_order_invalid'; END IF;
  IF p_name IS NOT NULL AND btrim(p_name) = '' THEN RAISE EXCEPTION 'plan_name_required'; END IF;

  UPDATE public.commercial_payment_plans
     SET name = coalesce(btrim(p_name), name),
         description = coalesce(p_description, description),
         sort_order = coalesce(p_sort_order, sort_order),
         updated_by = auth.uid()
   WHERE id = p_plan_id;

  PERFORM public._cpp_audit('commercial_plan_metadata_updated', p_plan_id, to_jsonb(v_old),
    jsonb_build_object('name', p_name, 'description', p_description, 'sort_order', p_sort_order), NULL);
END
$$;

CREATE OR REPLACE FUNCTION public.rpc_admin_set_commercial_plan_active(
  p_plan_id uuid, p_active boolean, p_motivo text DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_old public.commercial_payment_plans%ROWTYPE;
BEGIN
  IF NOT public.fn_b2b_can_admin_plans() THEN RAISE EXCEPTION 'not_authorized'; END IF;
  SELECT * INTO v_old FROM public.commercial_payment_plans WHERE id = p_plan_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'plan_not_found'; END IF;
  IF p_active AND v_old.superseded_by_id IS NOT NULL THEN RAISE EXCEPTION 'plan_superseded_cannot_activate'; END IF;

  UPDATE public.commercial_payment_plans
     SET active = p_active,
         is_default = CASE WHEN p_active THEN is_default ELSE false END,
         updated_by = auth.uid()
   WHERE id = p_plan_id;

  PERFORM public._cpp_audit(CASE WHEN p_active THEN 'commercial_plan_activated' ELSE 'commercial_plan_deactivated' END,
    p_plan_id, to_jsonb(v_old), jsonb_build_object('active', p_active), p_motivo);
END
$$;

CREATE OR REPLACE FUNCTION public.rpc_admin_set_default_commercial_plan(p_plan_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_old public.commercial_payment_plans%ROWTYPE;
BEGIN
  IF NOT public.fn_b2b_can_admin_plans() THEN RAISE EXCEPTION 'not_authorized'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('cpp_default_plan'));
  SELECT * INTO v_old FROM public.commercial_payment_plans WHERE id = p_plan_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'plan_not_found'; END IF;
  IF NOT public.fn_b2b_plan_selectable(p_plan_id) THEN RAISE EXCEPTION 'plan_not_selectable'; END IF;

  UPDATE public.commercial_payment_plans SET is_default = false, updated_by = auth.uid()
   WHERE is_default AND id <> p_plan_id;
  UPDATE public.commercial_payment_plans SET is_default = true, updated_by = auth.uid()
   WHERE id = p_plan_id;

  PERFORM public._cpp_audit('commercial_plan_set_default', p_plan_id, to_jsonb(v_old), jsonb_build_object('is_default', true), NULL);
END
$$;

CREATE OR REPLACE FUNCTION public.rpc_admin_reorder_commercial_plans(p_orders jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_item jsonb;
BEGIN
  IF NOT public.fn_b2b_can_admin_plans() THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF jsonb_typeof(p_orders) <> 'array' THEN RAISE EXCEPTION 'orders_payload_invalid'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('cpp_reorder'));

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_orders) LOOP
    IF (v_item->>'sort_order')::integer < 0 THEN RAISE EXCEPTION 'sort_order_invalid'; END IF;
    UPDATE public.commercial_payment_plans
       SET sort_order = (v_item->>'sort_order')::integer, updated_by = auth.uid()
     WHERE id = (v_item->>'id')::uuid;
  END LOOP;

  PERFORM public._cpp_audit('commercial_plan_reordered', NULL, NULL, jsonb_build_object('orders', p_orders), NULL);
END
$$;

-- ---------- 6) Grants / RLS ----------
REVOKE ALL ON public.commercial_payment_plans FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE ON public.commercial_payment_plans FROM authenticated;
GRANT SELECT ON public.commercial_payment_plans TO authenticated;
GRANT ALL ON public.commercial_payment_plans TO service_role;

DO $g$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.fn_b2b_can_admin_plans(uuid)',
    'public.fn_b2b_plan_selectable(uuid, timestamptz)',
    'public.fn_b2b_plan_referenced(uuid)',
    'public._cpp_validate_payload(jsonb)',
    'public._cpp_audit(text, uuid, jsonb, jsonb, text)',
    'public.rpc_admin_list_commercial_plans(text, text, integer, integer)',
    'public.rpc_admin_create_commercial_plan(jsonb)',
    'public.rpc_admin_version_commercial_plan(uuid, jsonb, text)',
    'public.rpc_admin_update_commercial_plan_metadata(uuid, text, text, integer)',
    'public.rpc_admin_set_commercial_plan_active(uuid, boolean, text)',
    'public.rpc_admin_set_default_commercial_plan(uuid)',
    'public.rpc_admin_reorder_commercial_plans(jsonb)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', fn);
  END LOOP;

  FOREACH fn IN ARRAY ARRAY[
    'public.fn_b2b_can_admin_plans(uuid)',
    'public.fn_b2b_plan_selectable(uuid, timestamptz)',
    'public.fn_b2b_plan_referenced(uuid)',
    'public.rpc_admin_list_commercial_plans(text, text, integer, integer)',
    'public.rpc_admin_create_commercial_plan(jsonb)',
    'public.rpc_admin_version_commercial_plan(uuid, jsonb, text)',
    'public.rpc_admin_update_commercial_plan_metadata(uuid, text, text, integer)',
    'public.rpc_admin_set_commercial_plan_active(uuid, boolean, text)',
    'public.rpc_admin_set_default_commercial_plan(uuid)',
    'public.rpc_admin_reorder_commercial_plans(jsonb)'
  ] LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', fn);
  END LOOP;
END
$g$;
