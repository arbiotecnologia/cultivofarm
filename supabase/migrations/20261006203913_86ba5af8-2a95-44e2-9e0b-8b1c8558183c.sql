-- Rollback: desativar definições (UPDATE saas_limit_definitions SET active=false WHERE key IN (...)) e recriar as funções a partir das definições anteriores; forward-fix preferível.

-- ===== B. Gate central de escopo de parceiro =====
CREATE OR REPLACE FUNCTION platform_private.assert_b2b_partner_scope(_uid uuid, _partner uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE s record;
BEGIN
  IF _uid IS NULL OR auth.uid() IS NULL OR _uid <> auth.uid() THEN
    RAISE EXCEPTION 'auth_required' USING ERRCODE='42501';
  END IF;
  IF _partner IS NULL OR NOT EXISTS (SELECT 1 FROM public.partner_accounts pa
       WHERE pa.id = _partner AND pa.ativo = true AND pa.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'partner_not_found' USING ERRCODE='42501';
  END IF;
  IF public.is_platform_superadmin(_uid) THEN RETURN; END IF;
  IF public.has_role(_uid,'parceiro_b2b_tecnico'::app_role) THEN
    RAISE EXCEPTION 'forbidden_financial_terms' USING ERRCODE='42501';
  END IF;
  SELECT * INTO s FROM platform_private.b2b_actor_scope(_uid);
  IF NOT s.profile_ok THEN RAISE EXCEPTION 'inactive_scope' USING ERRCODE='42501'; END IF;
  IF s.org_partner IS DISTINCT FROM _partner OR NOT s.partner_valid THEN
    RAISE EXCEPTION 'forbidden_partner' USING ERRCODE='42501';
  END IF;
  IF public.has_role(_uid,'parceiro_b2b'::app_role) THEN
    IF s.user_partner_count <> 1 OR s.user_partner IS DISTINCT FROM _partner THEN
      RAISE EXCEPTION 'forbidden_partner' USING ERRCODE='42501';
    END IF;
    RETURN;
  END IF;
  IF NOT (public.has_role(_uid,'administrador'::app_role) OR public.has_role(_uid,'financeiro'::app_role)
          OR public.has_role(_uid,'gestor_comercial'::app_role)) THEN
    RAISE EXCEPTION 'forbidden_role' USING ERRCODE='42501';
  END IF;
END $$;
REVOKE ALL ON FUNCTION platform_private.assert_b2b_partner_scope(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION platform_private.assert_b2b_partner_scope(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.rpc_cc_simulate_price(p_buyer_scope text, p_partner_id uuid, p_customer_id uuid, p_plan_id uuid, p_product_id uuid, p_microrganismo_id uuid, p_unit_type text, p_volume_ml numeric DEFAULT NULL::numeric, p_ref_date date DEFAULT CURRENT_DATE, p_quantity numeric DEFAULT NULL::numeric)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $function$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE='42501'; END IF;
  IF NOT (public.is_platform_superadmin(v_uid) OR public.fn_cc_can_prepare(v_uid)) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE='42501';
  END IF;
  IF COALESCE(p_buyer_scope,'partner') <> 'partner' OR p_customer_id IS NOT NULL THEN
    RAISE EXCEPTION 'PRODUCER_DIRECT_NOT_ENABLED' USING ERRCODE='P0001';
  END IF;
  PERFORM platform_private.assert_b2b_partner_scope(v_uid, p_partner_id);
  RETURN public.fn_resolve_commercial_price('partner', p_partner_id, NULL, p_plan_id,
    p_product_id, p_microrganismo_id, p_unit_type, p_volume_ml, p_ref_date, p_quantity);
END $function$;
REVOKE ALL ON FUNCTION public.rpc_cc_simulate_price(text,uuid,uuid,uuid,uuid,uuid,text,numeric,date,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_cc_simulate_price(text,uuid,uuid,uuid,uuid,uuid,text,numeric,date,numeric) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.rpc_resolve_commercial_prices(p_items jsonb, p_plan_id uuid, p_ref_date date DEFAULT CURRENT_DATE, p_buyer jsonb DEFAULT NULL::jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $function$
DECLARE
  v_uid uuid := auth.uid(); v_partner uuid; s record;
  v_item jsonb; v_res jsonb; v_out jsonb := '[]'::jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE='42501'; END IF;
  IF COALESCE(p_buyer->>'buyer_scope','partner') <> 'partner' OR NULLIF(p_buyer->>'customer_id','') IS NOT NULL THEN
    RAISE EXCEPTION 'PRODUCER_DIRECT_NOT_ENABLED' USING ERRCODE='P0001';
  END IF;
  IF public.has_role(v_uid,'parceiro_b2b'::app_role) AND NOT public.is_platform_superadmin(v_uid) THEN
    -- parceiro: o partner_id do cliente é ignorado; usa o vínculo do servidor.
    SELECT * INTO s FROM platform_private.b2b_actor_scope(v_uid);
    v_partner := s.user_partner;
  ELSE
    v_partner := NULLIF(p_buyer->>'partner_id','')::uuid;
    IF v_partner IS NULL AND NOT public.is_platform_superadmin(v_uid) THEN
      SELECT * INTO s FROM platform_private.b2b_actor_scope(v_uid);
      v_partner := s.org_partner;
    END IF;
  END IF;
  IF v_partner IS NULL THEN RAISE EXCEPTION 'buyer_required' USING ERRCODE='42501'; END IF;
  PERFORM platform_private.assert_b2b_partner_scope(v_uid, v_partner);

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_items,'[]'::jsonb)) LOOP
    v_res := public.fn_resolve_commercial_price('partner', v_partner, NULL, p_plan_id,
      NULLIF(v_item->>'product_id','')::uuid, NULLIF(v_item->>'microrganismo_id','')::uuid,
      v_item->>'unit_type', NULLIF(v_item->>'volume_ml','')::numeric,
      COALESCE(p_ref_date, current_date), NULLIF(v_item->>'quantity','')::numeric);
    v_out := v_out || jsonb_build_array(v_res || jsonb_build_object('item_ref', v_item->>'item_ref'));
  END LOOP;
  RETURN jsonb_build_object('buyer_scope','partner','plan_id',p_plan_id,
                            'ref_date',COALESCE(p_ref_date,current_date),'items',v_out);
END $function$;
REVOKE ALL ON FUNCTION public.rpc_resolve_commercial_prices(jsonb,uuid,date,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_resolve_commercial_prices(jsonb,uuid,date,jsonb) TO authenticated, service_role;

-- Wrappers equivalentes que aceitam partner_id: injeta o gate central (idempotente).
DO $do$
DECLARE
  r record; v_def text; v_new text;
  v_anchor text := 'IF v_uid IS NULL THEN RAISE EXCEPTION ''auth_required''; END IF;';
BEGIN
  FOR r IN SELECT p.oid, p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname IN ('simulate_b2b_payment_plan_secure','create_partner_order_secure')
  LOOP
    v_def := pg_get_functiondef(r.oid);
    IF position('assert_b2b_partner_scope' IN v_def) > 0 THEN CONTINUE; END IF;
    IF (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor) <> 1 THEN
      RAISE EXCEPTION 'anchor_not_unique in %', r.proname;
    END IF;
    v_new := replace(v_def, v_anchor, v_anchor || E'\n  PERFORM platform_private.assert_b2b_partner_scope(v_uid, p_partner_id);');
    EXECUTE v_new;
  END LOOP;

  SELECT p.oid INTO r FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'convert_partner_simulation_to_order_secure';
  v_def := pg_get_functiondef(r.oid);
  IF position('assert_b2b_partner_scope' IN v_def) = 0 THEN
    v_anchor := 'v_partner_id := v_sim.partner_id;';
    IF (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor) <> 1 THEN
      RAISE EXCEPTION 'anchor_not_unique in convert';
    END IF;
    EXECUTE replace(v_def, v_anchor, v_anchor || E'\n  PERFORM platform_private.assert_b2b_partner_scope(v_uid, v_partner_id);');
  END IF;
END $do$;

-- ===== A. Definições globais de limites (sem valores comerciais) =====
INSERT INTO public.saas_limit_definitions (key, name, description, category, unit, value_type, application) VALUES
 ('ordens_producao_mes','Ordens de produção por mês','Quantidade de ordens de produção criadas pela empresa no mês civil.','criacoes_mensais','ordens/mês','integer','Contagem de ordens_servico por organization_id e created_at no mês.'),
 ('lotes_mes','Lotes por mês','Quantidade de lotes de produção criados pela empresa no mês civil.','criacoes_mensais','lotes/mês','integer','Contagem de lotes por organization_id e created_at no mês.'),
 ('envases_mes','Envases por mês','Quantidade de registros de envase criados pela empresa no mês civil.','criacoes_mensais','envases/mês','integer','Contagem de envase por organization_id e created_at no mês.'),
 ('contas_receber_mes','Títulos a receber por mês','Quantidade de títulos de contas a receber lançados pela empresa no mês civil.','criacoes_mensais','títulos/mês','integer','Contagem de accounts_receivable por organization_id e created_at no mês.'),
 ('contas_pagar_mes','Títulos a pagar por mês','Quantidade de títulos de contas a pagar lançados pela empresa no mês civil.','criacoes_mensais','títulos/mês','integer','Contagem de accounts_payable por organization_id e created_at no mês.'),
 ('documentos_fiscais_mes','Documentos fiscais por mês','Quantidade de documentos fiscais (NF-e/NFS-e) criados pela empresa no mês civil.','emissoes_mensais','documentos/mês','integer','Contagem de fiscal_invoices por organization_id e created_at no mês.')
ON CONFLICT (key) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, category = EXCLUDED.category,
  unit = EXCLUDED.unit, value_type = EXCLUDED.value_type, application = EXCLUDED.application, updated_at = now();

INSERT INTO public.saas_feature_limit_definitions (feature_id, limit_definition_id, required)
SELECT f.id, l.id, false
  FROM (VALUES ('ordens_producao','ordens_producao_mes'),('lotes_qualidade','lotes_mes'),('envase','envases_mes'),
               ('contas_receber','contas_receber_mes'),('contas_pagar','contas_pagar_mes'),
               ('emissao_nfe_nfse','documentos_fiscais_mes')) v(fk, lk)
  JOIN public.saas_features f ON f.key = v.fk
  JOIN public.saas_limit_definitions l ON l.key = v.lk
ON CONFLICT (feature_id, limit_definition_id) DO NOTHING;

-- Catálogo de limites: leitura só para Platform Superadmin (policies existentes); sem escrita direta por clientes.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.saas_limit_definitions, public.saas_feature_limit_definitions FROM anon, authenticated;
REVOKE ALL ON public.saas_limit_definitions, public.saas_feature_limit_definitions FROM anon;