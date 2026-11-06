#!/usr/bin/env python3
"""B2B_PAYMENT_METHOD_V1 — meio de pagamento escolhido pelo comprador (B3). NÃO APLICADO.

Delta mínimo e aditivo sobre o estado LIVE lido em 2026-11-06 (ref swzpzcwiasxmjutrmvkm, somente leitura):
  * public.b2b_payment_method_configs (+ histórico append-only): vínculo condição↔meio POR EMPRESA VENDEDORA, com versão/CAS.
    Planos globais (commercial_payment_plans) NÃO são alterados nem ganham colunas/escritores.
  * public.partner_order_payment_method_snapshots: snapshot imutável meio/versão/estimativa por pedido.
  * Wrappers DEFINER que REUSAM os corpos LIVE sem alterá-los:
      simulate_b2b_payment_plan_with_method_secure -> simulate_b2b_payment_plan_secure (37d4f45e)
      create_partner_order_with_method_secure      -> create_partner_order_secure (c34e7404)
    O escopo do vendedor vem de platform_private.b2b_partner_catalog_reader (bd985484); nunca do payload.
  * Constraint trigger DEFERRED em partner_orders: pedido criado por comprador externo sem snapshot de meio
    falha no COMMIT com B2B_PAYMENT_METHOD_REQUIRED (contrato antigo bloqueado com erro explícito, sem fallback 'pix').
  * Promissória/crédito existem no modelo, mas nunca ficam ativos (CHECK + writer). Boleto 1..3 só quando o plano
    tem essa quantidade e a configuração do vendedor permite; Price exige taxa explícita configurada e plano sem juros
    próprios (evita juros em dobro). Datas são ESTIMADAS (base = emissão da NF, B4); nada de vencimento definitivo.
Somente gera arquivos; nunca conecta a banco algum.
"""
import hashlib, json, pathlib, sys

HERE = pathlib.Path(__file__).resolve().parent

LIVE_PINS = {
    "public.create_partner_order_secure(uuid,text,jsonb,date,uuid,date,integer,text,text)": "c34e740473afb7a365d362db854069cb",
    "public.simulate_b2b_payment_plan_secure(uuid,uuid,jsonb,date)": "37d4f45e388ed7b38f6f397b672629ee",
    "platform_private.b2b_partner_catalog_reader(uuid)": "bd985484b69c8fa6e63a920eff518369",
    "platform_private.h15_actor_organization()": "64e10608403238a41a9baf92857ca881",
    "public.get_partner_order_payment_terms_secure(uuid)": "efb3d18c65088d7d69471fc5aa9ac859",
}
LIVE_COLS = {  # md5(string_agg(column:type ORDER BY ordinal_position))
    "payment_methods": "71f7ed4ddacf2392c9c327e64376c2be",
    "partner_order_payment_terms": "f32804287d84d6467e33757064f715fa",
    "commercial_payment_plans": "fa11d3b5c4d1737c9a5e98cdece94c55",
}

PUB = {
    "save": "public.b2b_payment_method_config_save(uuid,uuid,text,uuid,integer,integer,numeric,text,integer)",
    "list": "public.b2b_payment_method_config_list()",
    "options": "public.b2b_list_payment_method_options_secure(uuid,uuid)",
    "sim": "public.simulate_b2b_payment_plan_with_method_secure(uuid,uuid,jsonb,uuid,integer)",
    "create": "public.create_partner_order_with_method_secure(uuid,text,jsonb,date,uuid,text,text,uuid,integer)",
    "read": "public.get_partner_order_payment_method_secure(uuid)",
}
PRIV = ["platform_private.b2b_payment_method_resolve(uuid,uuid,uuid,integer,boolean)",
        "platform_private.b2b_payment_method_estimate(numeric,integer,integer,numeric,date)",
        "platform_private.b2b_payment_method_required_check()",
        "platform_private.b2b_payment_method_immutable()"]

TABLES = r"""
CREATE TABLE platform_private.b2b_payment_method_gate(
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton), enforced boolean NOT NULL, changed_at timestamptz NOT NULL DEFAULT now());
INSERT INTO platform_private.b2b_payment_method_gate(enforced) VALUES (true);

CREATE TABLE public.b2b_payment_method_configs(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  payment_plan_id uuid NOT NULL REFERENCES public.commercial_payment_plans(id),
  method_kind text NOT NULL CHECK (method_kind IN ('dinheiro','pix','debito','boleto','promissoria','credito')),
  payment_method_id uuid NOT NULL REFERENCES public.payment_methods(id),
  status text NOT NULL CHECK (status IN ('active','revoked')),
  version integer NOT NULL CHECK (version > 0),
  due_days integer NOT NULL CHECK (due_days BETWEEN 0 AND 365),
  max_installments integer NOT NULL CHECK (max_installments BETWEEN 1 AND 3),
  price_monthly_rate_percent numeric(9,6) CHECK (price_monthly_rate_percent IS NULL OR price_monthly_rate_percent BETWEEN 0 AND 100),
  created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT b2b_pmc_unique UNIQUE (organization_id, payment_plan_id, method_kind),
  CONSTRAINT b2b_pmc_undefined_kinds_never_active CHECK (method_kind NOT IN ('promissoria','credito') OR status = 'revoked'),
  CONSTRAINT b2b_pmc_single_payment CHECK (method_kind = 'boleto' OR (max_installments = 1 AND price_monthly_rate_percent IS NULL)),
  CONSTRAINT b2b_pmc_price_rate_explicit CHECK (max_installments = 1 OR price_monthly_rate_percent IS NOT NULL));

CREATE TABLE public.b2b_payment_method_config_versions(
  config_id uuid NOT NULL REFERENCES public.b2b_payment_method_configs(id), version integer NOT NULL,
  snapshot jsonb NOT NULL, actor_id uuid NOT NULL, recorded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (config_id, version));

CREATE TABLE public.partner_order_payment_method_snapshots(
  partner_order_id uuid PRIMARY KEY REFERENCES public.partner_orders(id),
  payment_terms_id uuid,
  organization_id uuid NOT NULL, partner_id uuid NOT NULL,
  config_id uuid NOT NULL REFERENCES public.b2b_payment_method_configs(id), config_version integer NOT NULL,
  method_kind text NOT NULL, payment_method_id uuid NOT NULL, payment_method_name_snapshot text NOT NULL,
  due_days integer NOT NULL, installment_count integer NOT NULL, price_monthly_rate_percent numeric(9,6),
  due_basis text NOT NULL DEFAULT 'nf_issue' CHECK (due_basis = 'nf_issue'),
  schedule_estimated boolean NOT NULL DEFAULT true CHECK (schedule_estimated),
  estimated_reference_date date NOT NULL, estimated_schedule jsonb NOT NULL, estimated_total numeric(14,2),
  created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE platform_private.b2b_payment_method_order_receipts(
  partner_id uuid NOT NULL, idempotency_key text NOT NULL, actor_id uuid NOT NULL, fingerprint text NOT NULL,
  order_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (partner_id, idempotency_key));

REVOKE ALL ON public.b2b_payment_method_configs, public.b2b_payment_method_config_versions,
  public.partner_order_payment_method_snapshots FROM PUBLIC, anon, authenticated;
REVOKE ALL ON platform_private.b2b_payment_method_gate, platform_private.b2b_payment_method_order_receipts FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.b2b_payment_method_configs, public.b2b_payment_method_config_versions,
  public.partner_order_payment_method_snapshots TO service_role;
ALTER TABLE public.b2b_payment_method_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.b2b_payment_method_config_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_order_payment_method_snapshots ENABLE ROW LEVEL SECURITY;
-- Sem policies para clientes: leitura e escrita somente pelos RPCs abaixo (vendedor derivado no servidor).
"""

PRIV_FNS = r"""
CREATE OR REPLACE FUNCTION platform_private.b2b_payment_method_immutable()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO '' AS $function$
BEGIN
  RAISE EXCEPTION 'b2b_payment_method_history_immutable' USING ERRCODE='42501';
END $function$;
CREATE TRIGGER b2b_pm_snapshot_immutable BEFORE UPDATE OR DELETE ON public.partner_order_payment_method_snapshots
  FOR EACH ROW EXECUTE FUNCTION platform_private.b2b_payment_method_immutable();
CREATE TRIGGER b2b_pm_versions_immutable BEFORE UPDATE OR DELETE ON public.b2b_payment_method_config_versions
  FOR EACH ROW EXECUTE FUNCTION platform_private.b2b_payment_method_immutable();
CREATE TRIGGER b2b_pm_receipts_immutable BEFORE UPDATE OR DELETE ON platform_private.b2b_payment_method_order_receipts
  FOR EACH ROW EXECUTE FUNCTION platform_private.b2b_payment_method_immutable();

-- Estimativa monetária (centavos exatos). Base = data de referência ESTIMADA da emissão da NF.
-- Pagamento único: 1 parcela em base + due_days. Boleto n>1: Price com taxa EXPLÍCITA; última parcela absorve o resíduo.
-- Meses seguintes: mesmo dia ou último dia do mês (aritmética de intervalo do PostgreSQL sobre a 1ª data).
-- Ajuste por dia útil (Paracatu-MG + nacionais) fica no B4 (calendário selado do pacote de parcelas).
CREATE OR REPLACE FUNCTION platform_private.b2b_payment_method_estimate(p_amount numeric, p_n integer, p_due_days integer, p_rate numeric, p_base date)
 RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path TO '' AS $function$
DECLARE i numeric; pmt numeric(14,2); bal numeric(14,2); int_k numeric(14,2); pr numeric(14,2); out jsonb := '[]'::jsonb; k integer; first_due date;
BEGIN
  IF p_amount IS NULL OR p_amount < 0 OR p_n IS NULL OR p_n NOT BETWEEN 1 AND 3 OR p_due_days IS NULL OR p_due_days NOT BETWEEN 0 AND 365 OR p_base IS NULL THEN
    RAISE EXCEPTION 'payment_method_estimate_invalid' USING ERRCODE='22023'; END IF;
  IF p_n > 1 AND p_rate IS NULL THEN RAISE EXCEPTION 'payment_method_price_rate_required' USING ERRCODE='22023'; END IF;
  i := COALESCE(p_rate, 0) / 100; bal := round(p_amount, 2); first_due := p_base + p_due_days;
  IF i = 0 THEN pmt := round(bal / p_n, 2); ELSE pmt := round(bal * i / (1 - power(1 + i, -p_n)), 2); END IF;
  FOR k IN 1..p_n LOOP
    int_k := round(bal * i, 2);
    IF k < p_n THEN pr := pmt - int_k; ELSE pr := bal; END IF;
    out := out || jsonb_build_array(jsonb_build_object('installment_number', k,
      'estimated_due_date', (first_due + make_interval(months => k - 1))::date,
      'amount', pr + int_k, 'principal_amount', pr, 'interest_amount', int_k));
    bal := bal - pr;
  END LOOP;
  RETURN out;
END $function$;

-- Resolve e (opcionalmente) trava a configuração dentro da transação. Vendedor SOMENTE pelo leitor canônico.
CREATE OR REPLACE FUNCTION platform_private.b2b_payment_method_resolve(p_partner_id uuid, p_plan_id uuid, p_config_id uuid, p_version integer, p_lock boolean)
 RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE v_seller uuid; c record; v_pm record; v_plan record; v_n integer;
BEGIN
  IF p_config_id IS NULL OR p_version IS NULL THEN RAISE EXCEPTION 'payment_method_required' USING ERRCODE='P0001'; END IF;
  v_seller := platform_private.b2b_partner_catalog_reader(p_partner_id);
  IF p_lock THEN
    SELECT * INTO c FROM public.b2b_payment_method_configs WHERE id = p_config_id FOR SHARE;
  ELSE
    SELECT * INTO c FROM public.b2b_payment_method_configs WHERE id = p_config_id;
  END IF;
  -- Configuração de outro vendedor/condição nega igual a inexistente (sem oráculo).
  IF NOT FOUND OR c.organization_id IS DISTINCT FROM v_seller OR c.payment_plan_id IS DISTINCT FROM p_plan_id THEN
    RAISE EXCEPTION 'payment_method_unavailable' USING ERRCODE='42501'; END IF;
  IF c.version IS DISTINCT FROM p_version THEN RAISE EXCEPTION 'payment_method_stale' USING ERRCODE='PT409'; END IF;
  IF c.status <> 'active' OR c.method_kind IN ('promissoria','credito') THEN
    RAISE EXCEPTION 'payment_method_unavailable' USING ERRCODE='PT409'; END IF;
  SELECT pm.id, pm.name, pm.active INTO v_pm FROM public.payment_methods pm WHERE pm.id = c.payment_method_id;
  IF NOT FOUND OR v_pm.active IS NOT TRUE THEN RAISE EXCEPTION 'payment_method_unavailable' USING ERRCODE='PT409'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.commercial_payment_plan_assignments a
                  WHERE a.plan_id = p_plan_id AND a.partner_id = p_partner_id AND a.buyer_scope = 'partner' AND a.status = 'published'
                    AND a.valid_from <= CURRENT_DATE AND (a.valid_until IS NULL OR a.valid_until >= CURRENT_DATE)) THEN
    RAISE EXCEPTION 'payment_method_unavailable' USING ERRCODE='PT409'; END IF;
  SELECT p.installment_count, p.monthly_interest_percent, p.active INTO v_plan FROM public.commercial_payment_plans p WHERE p.id = p_plan_id;
  IF NOT FOUND OR v_plan.active IS NOT TRUE THEN RAISE EXCEPTION 'plan_inactive' USING ERRCODE='PT409'; END IF;
  v_n := GREATEST(COALESCE(v_plan.installment_count, 1), 1);
  IF v_n > c.max_installments THEN RAISE EXCEPTION 'payment_method_installments_incompatible' USING ERRCODE='PT409'; END IF;
  IF v_n > 1 AND COALESCE(v_plan.monthly_interest_percent, 0) > 0 THEN
    RAISE EXCEPTION 'payment_method_price_interest_conflict' USING ERRCODE='PT409'; END IF;
  RETURN jsonb_build_object('config_id', c.id, 'version', c.version, 'organization_id', c.organization_id, 'method_kind', c.method_kind,
    'payment_method_id', v_pm.id, 'payment_method_name', v_pm.name, 'due_days', c.due_days, 'installment_count', v_n,
    'price_monthly_rate_percent', CASE WHEN v_n > 1 THEN c.price_monthly_rate_percent END);
END $function$;

-- Contrato antigo: comprador externo sem snapshot de meio não fecha a transação. Ator interno segue o caminho atual.
CREATE OR REPLACE FUNCTION platform_private.b2b_payment_method_required_check()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF NEW.payment_plan_id IS NULL OR v_uid IS NULL THEN RETURN NULL; END IF;
  IF NOT COALESCE((SELECT g.enforced FROM platform_private.b2b_payment_method_gate g), true) THEN RETURN NULL; END IF;
  IF public.has_role(v_uid, 'parceiro_b2b'::public.app_role) IS TRUE
     AND NOT (public.has_role(v_uid, 'administrador'::public.app_role) IS TRUE OR public.has_role(v_uid, 'financeiro'::public.app_role) IS TRUE
              OR public.has_role(v_uid, 'gestor_comercial'::public.app_role) IS TRUE)
     AND NOT EXISTS (SELECT 1 FROM public.partner_order_payment_method_snapshots s WHERE s.partner_order_id = NEW.id) THEN
    RAISE EXCEPTION 'B2B_PAYMENT_METHOD_REQUIRED' USING ERRCODE='P0001',
      HINT = 'Selecione um meio de pagamento permitido pela empresa fornecedora (contrato B2B_PAYMENT_METHOD_V1).';
  END IF;
  RETURN NULL;
END $function$;
CREATE CONSTRAINT TRIGGER b2b_payment_method_required AFTER INSERT ON public.partner_orders
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION platform_private.b2b_payment_method_required_check();
"""

PUB_FNS = r"""
-- Escritor do VENDEDOR: empresa sempre do ator (h15), papéis internos; CAS por versão; histórico append-only.
CREATE OR REPLACE FUNCTION public.b2b_payment_method_config_save(p_config_id uuid, p_payment_plan_id uuid, p_method_kind text, p_payment_method_id uuid,
  p_due_days integer, p_max_installments integer, p_price_monthly_rate_percent numeric, p_status text, p_expected_version integer)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE v_uid uuid := auth.uid(); v_org uuid; c record; v_row public.b2b_payment_method_configs;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE='42501'; END IF;
  IF public.is_platform_superadmin(v_uid) IS NOT FALSE THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  v_org := platform_private.h15_actor_organization();
  IF v_org IS NULL OR NOT (public.has_role(v_uid,'administrador'::public.app_role) IS TRUE OR public.has_role(v_uid,'financeiro'::public.app_role) IS TRUE)
     OR public.has_role(v_uid,'parceiro_b2b'::public.app_role) IS NOT FALSE OR public.has_role(v_uid,'parceiro_b2b_tecnico'::public.app_role) IS NOT FALSE THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  IF p_status NOT IN ('active','revoked') OR p_expected_version IS NULL OR p_expected_version < 0 THEN
    RAISE EXCEPTION 'payment_method_config_invalid' USING ERRCODE='22023'; END IF;
  IF p_method_kind IN ('promissoria','credito') AND p_status = 'active' THEN
    RAISE EXCEPTION 'payment_method_kind_not_defined' USING ERRCODE='P0001'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.payment_methods pm WHERE pm.id = p_payment_method_id AND pm.active IS TRUE) THEN
    RAISE EXCEPTION 'payment_method_catalog_unavailable' USING ERRCODE='P0001'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('b2b_pmc:' || v_org::text || ':' || COALESCE(p_payment_plan_id::text,'-') || ':' || COALESCE(p_method_kind,'-'), 0));
  IF p_config_id IS NULL THEN
    IF p_expected_version <> 0 THEN RAISE EXCEPTION 'payment_method_config_stale' USING ERRCODE='PT409'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.commercial_payment_plans p WHERE p.id = p_payment_plan_id AND p.active IS TRUE AND p.superseded_by_id IS NULL) THEN
      RAISE EXCEPTION 'plan_inactive' USING ERRCODE='P0001'; END IF;
    IF EXISTS (SELECT 1 FROM public.b2b_payment_method_configs x WHERE x.organization_id = v_org AND x.payment_plan_id = p_payment_plan_id AND x.method_kind = p_method_kind) THEN
      RAISE EXCEPTION 'payment_method_config_stale' USING ERRCODE='PT409'; END IF;
    INSERT INTO public.b2b_payment_method_configs(organization_id, payment_plan_id, method_kind, payment_method_id, status, version, due_days,
      max_installments, price_monthly_rate_percent, created_by, updated_by)
    VALUES (v_org, p_payment_plan_id, p_method_kind, p_payment_method_id, p_status, 1, p_due_days, p_max_installments, p_price_monthly_rate_percent, v_uid, v_uid)
    RETURNING * INTO v_row;
  ELSE
    SELECT * INTO c FROM public.b2b_payment_method_configs x WHERE x.id = p_config_id AND x.organization_id = v_org FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
    IF c.payment_plan_id IS DISTINCT FROM p_payment_plan_id OR c.method_kind IS DISTINCT FROM p_method_kind THEN
      RAISE EXCEPTION 'payment_method_config_identity_immutable' USING ERRCODE='P0001'; END IF;
    IF c.version <> p_expected_version THEN RAISE EXCEPTION 'payment_method_config_stale' USING ERRCODE='PT409'; END IF;
    UPDATE public.b2b_payment_method_configs SET payment_method_id = p_payment_method_id, status = p_status, version = c.version + 1,
      due_days = p_due_days, max_installments = p_max_installments, price_monthly_rate_percent = p_price_monthly_rate_percent,
      updated_by = v_uid, updated_at = now()
     WHERE id = c.id RETURNING * INTO v_row;
  END IF;
  INSERT INTO public.b2b_payment_method_config_versions(config_id, version, snapshot, actor_id) VALUES (v_row.id, v_row.version, to_jsonb(v_row), v_uid);
  RETURN jsonb_build_object('contract','B2B_PAYMENT_METHOD_V1','config', to_jsonb(v_row));
END $function$;

CREATE OR REPLACE FUNCTION public.b2b_payment_method_config_list()
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE v_uid uuid := auth.uid(); v_org uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE='42501'; END IF;
  v_org := platform_private.h15_actor_organization();
  IF v_org IS NULL OR public.is_platform_superadmin(v_uid) IS NOT FALSE
     OR NOT (public.has_role(v_uid,'administrador'::public.app_role) IS TRUE OR public.has_role(v_uid,'financeiro'::public.app_role) IS TRUE
             OR public.has_role(v_uid,'gestor_comercial'::public.app_role) IS TRUE)
     OR public.has_role(v_uid,'parceiro_b2b'::public.app_role) IS NOT FALSE THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  RETURN jsonb_build_object('contract','B2B_PAYMENT_METHOD_V1','configs',
    COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.payment_plan_id, x.method_kind) FROM public.b2b_payment_method_configs x WHERE x.organization_id = v_org), '[]'::jsonb));
END $function$;

-- Leitor do COMPRADOR: só meios ativos configurados pelo vendedor resolvido pelo leitor canônico, para condição publicada ao parceiro.
CREATE OR REPLACE FUNCTION public.b2b_list_payment_method_options_secure(p_partner_id uuid, p_payment_plan_id uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE v_seller uuid; v_opts jsonb := '[]'::jsonb; c record; r jsonb; v_reason text;
BEGIN
  IF auth.uid() IS NULL OR p_payment_plan_id IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE='42501'; END IF;
  v_seller := platform_private.b2b_partner_catalog_reader(p_partner_id);
  FOR c IN SELECT x.id, x.version FROM public.b2b_payment_method_configs x
            WHERE x.organization_id = v_seller AND x.payment_plan_id = p_payment_plan_id AND x.status = 'active'
              AND x.method_kind NOT IN ('promissoria','credito') ORDER BY x.method_kind LOOP
    BEGIN
      r := platform_private.b2b_payment_method_resolve(p_partner_id, p_payment_plan_id, c.id, c.version, false);
      v_opts := v_opts || jsonb_build_array(r - 'organization_id' || jsonb_build_object('available', true));
    EXCEPTION WHEN SQLSTATE 'PT409' THEN
      GET STACKED DIAGNOSTICS v_reason = MESSAGE_TEXT;
      IF v_reason IN ('payment_method_installments_incompatible','payment_method_price_interest_conflict') THEN
        v_opts := v_opts || jsonb_build_array(jsonb_build_object('config_id', c.id, 'version', c.version, 'available', false, 'reason', v_reason,
          'method_kind', (SELECT x.method_kind FROM public.b2b_payment_method_configs x WHERE x.id = c.id)));
      ELSIF v_reason = 'payment_method_unavailable' THEN NULL; -- meio inativo/condição não publicada: omitido
      ELSE RAISE; END IF;
    END;
  END LOOP;
  RETURN jsonb_build_object('contract','B2B_PAYMENT_METHOD_V1','partner_id', p_partner_id,'payment_plan_id', p_payment_plan_id,
    'due_basis','nf_issue','options', v_opts);
END $function$;

CREATE OR REPLACE FUNCTION public.simulate_b2b_payment_plan_with_method_secure(p_partner_id uuid, p_payment_plan_id uuid, p_items jsonb,
  p_method_config_id uuid, p_method_config_version integer)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE m jsonb; v jsonb; v_est jsonb := '[]'::jsonb; v_total numeric(14,2);
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE='42501'; END IF;
  m := platform_private.b2b_payment_method_resolve(p_partner_id, p_payment_plan_id, p_method_config_id, p_method_config_version, false);
  v := public.simulate_b2b_payment_plan_secure(p_partner_id, p_payment_plan_id, p_items, NULL);
  IF NOT COALESCE((v->>'quote_required')::boolean, false) THEN
    v_est := platform_private.b2b_payment_method_estimate((v->>'final_amount')::numeric, (m->>'installment_count')::integer,
      (m->>'due_days')::integer, (m->>'price_monthly_rate_percent')::numeric, CURRENT_DATE);
    SELECT sum((e->>'amount')::numeric) INTO v_total FROM jsonb_array_elements(v_est) e;
  END IF;
  RETURN v || jsonb_build_object('payment_method_contract','B2B_PAYMENT_METHOD_V1', 'payment_method', m - 'organization_id',
    'due_basis','nf_issue','schedule_estimated', true,'estimated_reference_date', CURRENT_DATE,
    'estimated_schedule', v_est,'estimated_total', v_total);
END $function$;

CREATE OR REPLACE FUNCTION public.create_partner_order_with_method_secure(p_partner_id uuid, p_observacoes text, p_items jsonb,
  p_requested_delivery_date date, p_payment_plan_id uuid, p_expected_cart_hash text, p_idempotency_key text,
  p_method_config_id uuid, p_method_config_version integer)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE v_uid uuid := auth.uid(); v_key text; m jsonb; v_fp text; v_rc record; v_res jsonb; v_order uuid; v_terms record; v_est jsonb := '[]'::jsonb;
  v_total numeric(14,2); s record;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE='42501'; END IF;
  IF p_method_config_id IS NULL OR p_method_config_version IS NULL THEN RAISE EXCEPTION 'payment_method_required' USING ERRCODE='P0001'; END IF;
  v_key := NULLIF(btrim(COALESCE(p_idempotency_key,'')),'');
  IF v_key IS NULL OR p_partner_id IS NULL THEN RAISE EXCEPTION 'idempotency_key_required' USING ERRCODE='P0001'; END IF;
  -- Mesmo lock determinístico do corpo LIVE (reentrante na transação): repetição/concorrência serializam aqui.
  PERFORM pg_advisory_xact_lock(hashtextextended('b2b_idem:' || p_partner_id::text || ':' || v_key, 0));
  m := platform_private.b2b_payment_method_resolve(p_partner_id, p_payment_plan_id, p_method_config_id, p_method_config_version, true);
  v_fp := encode(sha256(convert_to('b2bpm_v1|config=' || (m->>'config_id') || '|v=' || (m->>'version') || '|kind=' || (m->>'method_kind')
                 || '|n=' || (m->>'installment_count'), 'UTF8')), 'hex');
  SELECT * INTO v_rc FROM platform_private.b2b_payment_method_order_receipts r WHERE r.partner_id = p_partner_id AND r.idempotency_key = v_key;
  IF FOUND AND (v_rc.actor_id IS DISTINCT FROM v_uid OR v_rc.fingerprint IS DISTINCT FROM v_fp) THEN
    RAISE EXCEPTION 'idempotency_conflict' USING ERRCODE='PT409'; END IF;
  v_res := public.create_partner_order_secure(p_partner_id, p_observacoes, p_items, p_requested_delivery_date, p_payment_plan_id,
                                              NULL, NULL, p_expected_cart_hash, v_key);
  v_order := (v_res->>'id')::uuid;
  IF v_order IS NULL THEN RAISE EXCEPTION 'order_reply_invalid' USING ERRCODE='P0001'; END IF;
  IF v_rc.order_id IS NOT NULL THEN
    IF v_rc.order_id IS DISTINCT FROM v_order THEN RAISE EXCEPTION 'idempotency_conflict' USING ERRCODE='PT409'; END IF;
  ELSE
    IF EXISTS (SELECT 1 FROM public.partner_order_payment_method_snapshots x WHERE x.partner_order_id = v_order) THEN
      RAISE EXCEPTION 'idempotency_conflict' USING ERRCODE='PT409'; END IF;
    IF (SELECT count(*) FROM public.partner_order_payment_terms t WHERE t.partner_order_id = v_order) > 1 THEN
      RAISE EXCEPTION 'payment_terms_ambiguous' USING ERRCODE='P0001'; END IF;
    SELECT t.id, t.final_amount, t.installment_count INTO v_terms FROM public.partner_order_payment_terms t WHERE t.partner_order_id = v_order;
    IF v_terms.id IS NOT NULL THEN
      IF v_terms.installment_count IS DISTINCT FROM (m->>'installment_count')::integer THEN
        RAISE EXCEPTION 'payment_method_installments_incompatible' USING ERRCODE='PT409'; END IF;
      v_est := platform_private.b2b_payment_method_estimate(v_terms.final_amount, (m->>'installment_count')::integer,
        (m->>'due_days')::integer, (m->>'price_monthly_rate_percent')::numeric, CURRENT_DATE);
      SELECT sum((e->>'amount')::numeric) INTO v_total FROM jsonb_array_elements(v_est) e;
    END IF;
    INSERT INTO public.partner_order_payment_method_snapshots(partner_order_id, payment_terms_id, organization_id, partner_id, config_id, config_version,
      method_kind, payment_method_id, payment_method_name_snapshot, due_days, installment_count, price_monthly_rate_percent,
      estimated_reference_date, estimated_schedule, estimated_total, created_by)
    VALUES (v_order, v_terms.id, (m->>'organization_id')::uuid, p_partner_id, (m->>'config_id')::uuid, (m->>'version')::integer,
      m->>'method_kind', (m->>'payment_method_id')::uuid, m->>'payment_method_name', (m->>'due_days')::integer, (m->>'installment_count')::integer,
      (m->>'price_monthly_rate_percent')::numeric, CURRENT_DATE, v_est, v_total, v_uid);
    INSERT INTO platform_private.b2b_payment_method_order_receipts(partner_id, idempotency_key, actor_id, fingerprint, order_id)
    VALUES (p_partner_id, v_key, v_uid, v_fp, v_order);
  END IF;
  SELECT * INTO s FROM public.partner_order_payment_method_snapshots x WHERE x.partner_order_id = v_order;
  RETURN v_res || jsonb_build_object('payment_method_contract','B2B_PAYMENT_METHOD_V1','payment_method', jsonb_build_object(
    'config_id', s.config_id, 'version', s.config_version, 'method_kind', s.method_kind, 'payment_method_name', s.payment_method_name_snapshot,
    'due_days', s.due_days, 'installment_count', s.installment_count, 'due_basis', s.due_basis, 'schedule_estimated', s.schedule_estimated,
    'estimated_schedule', s.estimated_schedule, 'estimated_total', s.estimated_total));
END $function$;

-- Leitura do snapshot do pedido: reaproveita EXATAMENTE as portas do leitor de condição instalado (efb3d18c).
CREATE OR REPLACE FUNCTION public.get_partner_order_payment_method_secure(p_order_id uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE s record;
BEGIN
  PERFORM public.get_partner_order_payment_terms_secure(p_order_id);
  SELECT * INTO s FROM public.partner_order_payment_method_snapshots x WHERE x.partner_order_id = p_order_id;
  RETURN jsonb_build_object('contract','B2B_PAYMENT_METHOD_V1','order_id', p_order_id,'present', FOUND,
    'payment_method', CASE WHEN FOUND THEN jsonb_build_object('method_kind', s.method_kind, 'payment_method_name', s.payment_method_name_snapshot,
      'config_version', s.config_version, 'due_days', s.due_days, 'installment_count', s.installment_count, 'due_basis', s.due_basis,
      'schedule_estimated', s.schedule_estimated, 'estimated_reference_date', s.estimated_reference_date,
      'estimated_schedule', s.estimated_schedule, 'estimated_total', s.estimated_total) END);
END $function$;
"""

DENY_TMPL = """CREATE OR REPLACE FUNCTION {sig_args}
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
BEGIN
  RAISE EXCEPTION 'b2b_payment_method_rolled_back' USING ERRCODE='42501';
END $function$;
"""
DENY_SIGS = {
    "save": "public.b2b_payment_method_config_save(p_config_id uuid, p_payment_plan_id uuid, p_method_kind text, p_payment_method_id uuid, p_due_days integer, p_max_installments integer, p_price_monthly_rate_percent numeric, p_status text, p_expected_version integer)",
    "list": "public.b2b_payment_method_config_list()",
    "options": "public.b2b_list_payment_method_options_secure(p_partner_id uuid, p_payment_plan_id uuid)",
    "sim": "public.simulate_b2b_payment_plan_with_method_secure(p_partner_id uuid, p_payment_plan_id uuid, p_items jsonb, p_method_config_id uuid, p_method_config_version integer)",
    "create": "public.create_partner_order_with_method_secure(p_partner_id uuid, p_observacoes text, p_items jsonb, p_requested_delivery_date date, p_payment_plan_id uuid, p_expected_cart_hash text, p_idempotency_key text, p_method_config_id uuid, p_method_config_version integer)",
    "read": "public.get_partner_order_payment_method_secure(p_order_id uuid)",
}


def pins_block(label, pins, cols):
    s = "".join(f"  IF to_regprocedure('{k}') IS NULL OR md5(pg_get_functiondef('{k}'::regprocedure)) <> '{v}' THEN RAISE EXCEPTION '{label}: {k} divergente'; END IF;\n"
                for k, v in pins.items())
    s += "".join(f"  IF (SELECT md5(string_agg(column_name||':'||data_type, ',' ORDER BY ordinal_position)) FROM information_schema.columns "
                 f"WHERE table_schema='public' AND table_name='{t}') IS DISTINCT FROM '{v}' THEN RAISE EXCEPTION '{label}: colunas de {t} divergentes'; END IF;\n"
                 for t, v in cols.items())
    return s


def acl_block(label, deny=False):
    s = ""
    for sig in PUB.values():
        s += (f"  IF EXISTS (SELECT 1 FROM pg_proc p, aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a WHERE p.oid='{sig}'::regprocedure "
              f"AND a.privilege_type='EXECUTE' AND a.grantee IN (0, 'anon'::regrole::oid{', ' + chr(39) + 'authenticated' + chr(39) + '::regrole::oid' if deny else ''})) "
              f"THEN RAISE EXCEPTION '{label}: EXECUTE indevido em {sig}'; END IF;\n")
        if not deny:
            s += f"  IF NOT has_function_privilege('authenticated', '{sig}', 'EXECUTE') THEN RAISE EXCEPTION '{label}: authenticated sem EXECUTE em {sig}'; END IF;\n"
    for sig in PRIV:
        s += (f"  IF EXISTS (SELECT 1 FROM pg_proc p, aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a WHERE p.oid='{sig}'::regprocedure "
              f"AND a.privilege_type='EXECUTE' AND a.grantee IN (0, 'anon'::regrole::oid, 'authenticated'::regrole::oid)) THEN RAISE EXCEPTION '{label}: helper privado exposto {sig}'; END IF;\n")
    for t in ("public.b2b_payment_method_configs", "public.b2b_payment_method_config_versions", "public.partner_order_payment_method_snapshots"):
        s += (f"  IF has_table_privilege('authenticated', '{t}', 'SELECT,INSERT,UPDATE,DELETE') OR has_table_privilege('anon', '{t}', 'SELECT') "
              f"OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid='{t}'::regclass) THEN RAISE EXCEPTION '{label}: tabela {t} exposta'; END IF;\n")
    s += (f"  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.partner_orders'::regclass AND tgname='b2b_payment_method_required' AND tgdeferrable AND tginitdeferred AND tgenabled='O') "
          f"THEN RAISE EXCEPTION '{label}: trigger de exigência ausente'; END IF;\n"
          f"  IF (SELECT enforced FROM platform_private.b2b_payment_method_gate) IS NOT TRUE THEN RAISE EXCEPTION '{label}: gate não exigente'; END IF;\n")
    return s


def fn_pins(label, md):
    return "".join(f"  IF to_regprocedure('{sig}') IS NULL OR md5(pg_get_functiondef('{sig}'::regprocedure)) <> '{md[k]}' THEN RAISE EXCEPTION '{label}: {sig} divergente'; END IF;\n"
                   for k, sig in PUB.items())


def build(pins=LIVE_PINS, cols=LIVE_COLS, fn_md5=None, deny_md5=None):
    absent = ("  IF to_regclass('public.b2b_payment_method_configs') IS NOT NULL OR to_regclass('platform_private.b2b_payment_method_gate') IS NOT NULL"
              f" OR to_regprocedure('{PUB['create']}') IS NOT NULL THEN RAISE EXCEPTION 'já instalado'; END IF;\n")
    grants = "".join(f"REVOKE ALL ON FUNCTION {s} FROM PUBLIC, anon;\nGRANT EXECUTE ON FUNCTION {s} TO authenticated;\n" for s in PUB.values())
    grants += "".join(f"REVOKE ALL ON FUNCTION {s} FROM PUBLIC, anon, authenticated;\n" for s in PRIV)
    md = fn_md5 or {}
    pre = ("-- 01 PRE (somente leitura). Ref canônico swzpzcwiasxmjutrmvkm conferido FORA do SQL antes de rodar.\nDO $$ BEGIN\n"
           + pins_block("PRE", pins, cols) + absent + "  RAISE NOTICE 'PRE_OK';\nEND $$;\n")
    inst = ("-- 02 INSTALL (REVISÁVEL; NÃO APLICAR sem autorização). Não altera corpos LIVE, planos, condições, PB-001036 ou configurações.\n"
            "BEGIN;\nSET LOCAL lock_timeout = '3s';\nDO $$ BEGIN\n" + pins_block("INSTALL", pins, cols) + absent + "END $$;\n"
            + TABLES + PRIV_FNS + PUB_FNS + grants
            + "DO $$ BEGIN\n" + pins_block("INSTALL_POST", pins, cols) + (fn_pins("INSTALL_POST", md) if md else "") + acl_block("INSTALL_POST") + "END $$;\nCOMMIT;\n")
    post = ("-- 03 POST (somente leitura).\nDO $$ BEGIN\n" + pins_block("POST", pins, cols) + (fn_pins("POST", md) if md else "") + acl_block("POST")
            + "  RAISE NOTICE 'POST_OK';\nEND $$;\n")
    deny = "".join(DENY_TMPL.format(sig_args=s) for s in DENY_SIGS.values())
    revoke = "".join(f"REVOKE ALL ON FUNCTION {s} FROM PUBLIC, anon, authenticated;\n" for s in PUB.values())
    rb = ("-- 04 ROLLBACK deny-only: RPCs novos passam a negar; trigger/gate de exigência, tabelas, snapshots e histórico PERMANECEM.\n"
          "-- Efeito: comprador externo não cria pedido (nem pelo contrato antigo) até nova revisão. Nunca reabre fallback.\n"
          "BEGIN;\nDO $$ BEGIN\n" + (fn_pins("ROLLBACK", md) if md else "") + "END $$;\n" + deny + revoke
          + "UPDATE platform_private.b2b_payment_method_gate SET enforced = true, changed_at = now();\n"
          + "DO $$ BEGIN\n" + (fn_pins("ROLLBACK_POST", deny_md5) if deny_md5 else "") + acl_block("ROLLBACK_POST", deny=True) + "END $$;\nCOMMIT;\n")
    return {"01-pre.sql.readonly": pre, "02-install.sql.review": inst, "03-post.sql.readonly": post, "04-rollback-deny.sql.review": rb}


if __name__ == "__main__":
    # md5 dos corpos instalados é medido no PG descartável (pg_get_functiondef) e gravado em fn-md5.json pelo teste.
    p = HERE / "fn-md5.json"
    fm = json.loads(p.read_text()) if p.exists() else {}
    files = build(fn_md5=fm.get("install"), deny_md5=fm.get("deny"))
    for n, t in files.items(): (HERE / n).write_text(t)
    meta = {n: hashlib.md5(t.encode()).hexdigest() for n, t in files.items()}
    (HERE / "generated-md5.json").write_text(json.dumps(meta, indent=2) + "\n"); print(json.dumps(meta, indent=2))
