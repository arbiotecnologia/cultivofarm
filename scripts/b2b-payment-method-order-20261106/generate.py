#!/usr/bin/env python3
"""B2B_PAYMENT_METHOD_V1 (rev. 2, após revisão independente 9c0d288) — meio de pagamento escolhido no pedido (B3). NÃO APLICADO.

Base LIVE lida em 2026-11-06 (ref swzpzcwiasxmjutrmvkm, somente leitura). Somente gera arquivos; nunca conecta a banco algum.

UMA verdade monetária: os dois RPCs com meio são GERADOS a partir dos corpos LIVE capturados por deltas exatos (âncora com
contagem exata = 1), não são wrappers:
  simulate_b2b_payment_plan_with_method_secure  <- simulate_b2b_payment_plan_secure (37d4f45e)
  create_partner_order_with_method_secure       <- create_partner_order_secure      (c34e7404)
Em ambos, depois do carrinho canônico (fn_resolve_b2b_cart) e dos juros do plano, a MESMA função privada
b2b_payment_method_schedule produz as parcelas; final_amount = soma das parcelas; juros = final - líquido. Esse valor
alimenta crédito (fn_b2b_credit_exposure), cart_hash (base LIVE + condição/meio/versão/total), terms, schedule, pedido,
ACK, idempotência (fingerprint inclui meio/versão) e o snapshot do meio. Os corpos LIVE originais não são alterados.

Autoridade/locks (ordem documentada; ver README):
  create: lock de idempotência (LIVE) -> reautorização LIVE -> resolve COM trava: config FOR SHARE -> plano FOR SHARE ->
          atribuição publicada FOR SHARE -> payment_methods FOR SHARE -> trava de embalagem (LIVE) -> trava de crédito
          (LIVE) -> resolve SEM trava (reler autoridade do comprador/vendedor) -> INSERT.
  config_save: advisory (org,plano,meio) -> reautorização (h15 + papel) -> config FOR UPDATE -> plano FOR SHARE ->
          payment_methods FOR SHARE -> CAS.
Ativação por empresa vendedora (off | pilot | enforced). O gatilho DEFERRED só exige snapshot para pedidos de parceiros
da empresa ativada (pilot: só parceiros listados); demais empresas seguem o contrato atual. Sem bypass por papel.
Seis meios no modelo; nenhum fica disponível sem configuração explícita ativa. Pagamento único (dinheiro/pix/débito) = 1;
boleto 1..3; promissória/crédito 1..36 personalizáveis; n>1 exige taxa Price explícita (pode ser 0) e plano sem juros.
Datas são ESTIMADAS (referência = data da simulação/pedido; vencimento definitivo conta da emissão da NF, B4).
"""
import hashlib, json, pathlib

HERE = pathlib.Path(__file__).resolve().parent
CAPDIR = HERE / "captured"
SOLID_CAP = HERE.parent / "b2b-solid-packaging-order-20261106" / "captured"

LIVE_PINS = {
    "public.create_partner_order_secure(uuid,text,jsonb,date,uuid,date,integer,text,text)": "c34e740473afb7a365d362db854069cb",
    "public.simulate_b2b_payment_plan_secure(uuid,uuid,jsonb,date)": "37d4f45e388ed7b38f6f397b672629ee",
    "platform_private.b2b_partner_catalog_reader(uuid)": "bd985484b69c8fa6e63a920eff518369",
    "platform_private.h15_actor_organization()": "64e10608403238a41a9baf92857ca881",
    "public.get_partner_order_payment_terms_secure(uuid)": "efb3d18c65088d7d69471fc5aa9ac859",
    "public.fn_b2b_credit_exposure(uuid,numeric,uuid)": "213ac31f3a30816ead75365b0d1fed18",
}
LIVE_COLS = {  # md5(string_agg(column:type ORDER BY ordinal_position))
    "payment_methods": "71f7ed4ddacf2392c9c327e64376c2be",
    "partner_order_payment_terms": "f32804287d84d6467e33757064f715fa",
    "commercial_payment_plans": "fa11d3b5c4d1737c9a5e98cdece94c55",
}

PUB = {
    "save": "public.b2b_payment_method_config_save(uuid,uuid,text,uuid,integer,integer,numeric,text,integer)",
    "list": "public.b2b_payment_method_config_list()",
    "activation": "public.b2b_payment_method_activation_set(text,uuid[],integer)",
    "options": "public.b2b_list_payment_method_options_secure(uuid,uuid)",
    "sim": "public.simulate_b2b_payment_plan_with_method_secure(uuid,uuid,jsonb,uuid,integer)",
    "create": "public.create_partner_order_with_method_secure(uuid,text,jsonb,date,uuid,text,text,uuid,integer)",
    "read": "public.get_partner_order_payment_method_secure(uuid)",
}
PRIV = ["platform_private.b2b_payment_method_resolve(uuid,uuid,uuid,integer,boolean)",
        "platform_private.b2b_payment_method_seller(uuid)",
        "platform_private.b2b_payment_method_schedule(numeric,numeric,integer,integer,numeric,date)",
        "platform_private.b2b_payment_method_hash(text,jsonb,numeric)",
        "platform_private.b2b_payment_method_mode(uuid)",
        "platform_private.b2b_payment_method_required_check()",
        "platform_private.b2b_payment_method_immutable()"]


def _captured(path, pin):
    t = path.read_text().rstrip("\n")
    assert pin[:8] in path.name, (path.name, pin)
    return t


def delta(src, anchor, repl, label):
    n = src.count(anchor)
    if n != 1:
        raise SystemExit(f"DELTA {label}: âncora encontrada {n} vezes (esperado 1)")
    return src.replace(anchor, repl)


def block(src, start, end, repl, label):
    if src.count(start) != 1:
        raise SystemExit(f"DELTA {label}: início encontrado {src.count(start)} vezes")
    a = src.index(start); b = src.index(end, a)
    if src.count(end, a) < 1:
        raise SystemExit(f"DELTA {label}: fim ausente")
    return src[:a] + repl + src[b + len(end):]


SCHED_CALL = ("    v_rows := platform_private.b2b_payment_method_schedule(v_net, v_final, v_installments, (v_pm->>'due_days')::integer,\n"
              "                (v_pm->>'price_monthly_rate_percent')::numeric, current_date); -- b2bpm: UMA verdade monetária\n"
              "    SELECT round(sum((r->>'amount')::numeric), 2) INTO v_final FROM jsonb_array_elements(v_rows) r;\n")


def build_create():
    s = _captured(CAPDIR / "public.create_partner_order_secure.c34e7404.live-20261106.sql", LIVE_PINS[next(k for k in LIVE_PINS if "create_partner" in k)])
    first = s.split("\n", 1)[0]
    assert first.startswith("CREATE OR REPLACE FUNCTION public.create_partner_order_secure(")
    s = delta(s, first, "CREATE OR REPLACE FUNCTION public.create_partner_order_with_method_secure(p_partner_id uuid, p_observacoes text, p_items jsonb, "
              "p_requested_delivery_date date, p_payment_plan_id uuid, p_expected_cart_hash text, p_idempotency_key text, p_method_config_id uuid, "
              "p_method_config_version integer)", "C0 assinatura")
    s = delta(s, "  v_items_canon text; v_req_fp text;\n",
              "  v_items_canon text; v_req_fp text;\n"
              "  p_first_due_date date := NULL; p_installment_count integer := NULL; -- b2bpm: cliente não define vencimento nem parcelas\n"
              "  v_pm jsonb; v_rows jsonb;\n", "C1 declarações")
    s = delta(s, "      'reqfp_v2'\n", "      'b2bpm_reqfp_v1'\n", "C2 algoritmo do fingerprint")
    s = delta(s, "      || '|items='     || v_items_canon\n",
              "      || '|items='     || v_items_canon\n"
              "      || '|pm='        || COALESCE(p_method_config_id::text,'-') || ':' || COALESCE(p_method_config_version::text,'-')\n",
              "C3 fingerprint inclui meio/versão")
    s = delta(s, "  IF v_plan.discount_percent > 40 AND NOT v_is_admin THEN RAISE EXCEPTION 'discount_exceeds_limit'; END IF;\n",
              "  IF v_plan.discount_percent > 40 AND NOT v_is_admin THEN RAISE EXCEPTION 'discount_exceeds_limit'; END IF;\n"
              "  -- b2bpm: relido APÓS o lock de idempotência e a reautorização LIVE; trava config/plano/atribuição/meio (FOR SHARE).\n"
              "  v_pm := platform_private.b2b_payment_method_resolve(p_partner_id, v_plan.id, p_method_config_id, p_method_config_version, true);\n",
              "C4 resolve com trava")
    s = delta(s, "    v_installments := GREATEST(COALESCE(p_installment_count, v_plan.installment_count, 1), 1);\n  END IF;\n",
              "    v_installments := GREATEST(COALESCE(p_installment_count, v_plan.installment_count, 1), 1);\n  END IF;\n"
              "  v_installments := (v_pm->>'installment_count')::integer; -- b2bpm: parcelas da configuração resolvida\n",
              "C5 parcelas")
    s = delta(s, "                         v_plan.monthly_interest_percent, v_plan.months_count) END;\n\n  v_hash := public.fn_b2b_cart_hash(p_partner_id, p_payment_plan_id, v_cart, v_final);\n",
              "                         v_plan.monthly_interest_percent, v_plan.months_count) END;\n"
              "  IF NOT v_quote THEN\n" + SCHED_CALL + "  END IF;\n\n"
              "  v_hash := public.fn_b2b_cart_hash(p_partner_id, p_payment_plan_id, v_cart, v_final);\n"
              "  v_hash := platform_private.b2b_payment_method_hash(v_hash, v_pm, v_final); -- b2bpm: condição/meio/versão/total\n",
              "C6 total pelas parcelas + hash")
    s = delta(s, "  v_first_due := COALESCE(p_first_due_date, current_date + v_plan.max_days);\n",
              "  v_first_due := COALESCE((v_rows->0->>'estimated_due_date')::date, current_date + (v_pm->>'due_days')::integer); -- b2bpm: ESTIMADA\n",
              "C7 primeiro vencimento estimado")
    s = delta(s, "  -- Issue only after canonical role/partner/plan/cart/hash/credit checks and idempotent replay.\n",
              "  -- b2bpm: reler autoridade do comprador/vendedor e a configuração depois das esperas de embalagem/crédito.\n"
              "  PERFORM platform_private.b2b_payment_method_resolve(p_partner_id, v_plan.id, p_method_config_id, p_method_config_version, false);\n"
              "  -- Issue only after canonical role/partner/plan/cart/hash/credit checks and idempotent replay.\n",
              "C8 revalidação final")
    s = block(s, "    IF v_installments = 1 THEN\n      INSERT INTO public.partner_order_payment_schedule(",
              "      END LOOP;\n    END IF;\n",
              "    INSERT INTO public.partner_order_payment_schedule(\n"
              "      partner_order_id, payment_terms_id, installment_number, due_date,\n"
              "      amount, principal_amount, interest_amount)\n"
              "    SELECT v_order_id, v_terms_id, (r->>'installment_number')::integer, (r->>'estimated_due_date')::date,\n"
              "           (r->>'amount')::numeric, (r->>'principal_amount')::numeric, (r->>'interest_amount')::numeric\n"
              "      FROM jsonb_array_elements(v_rows) r ORDER BY (r->>'installment_number')::integer; -- b2bpm: mesmas parcelas\n",
              "C9 cronograma = parcelas")
    s = delta(s, "'fingerprint_algo', 'reqfp_v2',", "'fingerprint_algo', 'b2bpm_reqfp_v1',", "C10 auditoria do algoritmo")
    s = delta(s, "  INSERT INTO public.partner_order_idempotency(\n",
              "  INSERT INTO public.partner_order_payment_method_snapshots(partner_order_id, payment_terms_id, organization_id, partner_id,\n"
              "    config_id, config_version, method_kind, payment_method_id, payment_method_name_snapshot, due_days, installment_count,\n"
              "    price_monthly_rate_percent, estimated_reference_date, estimated_schedule, final_amount, cart_hash, created_by)\n"
              "  VALUES (v_order_id, v_terms_id, (v_pm->>'organization_id')::uuid, p_partner_id, (v_pm->>'config_id')::uuid,\n"
              "    (v_pm->>'version')::integer, v_pm->>'method_kind', (v_pm->>'payment_method_id')::uuid, v_pm->>'payment_method_name',\n"
              "    (v_pm->>'due_days')::integer, v_installments, (v_pm->>'price_monthly_rate_percent')::numeric, current_date,\n"
              "    COALESCE(v_rows, '[]'::jsonb), CASE WHEN v_quote THEN NULL ELSE v_final END, v_hash, v_uid);\n"
              "  v_result := v_result || jsonb_build_object('payment_method_contract', 'B2B_PAYMENT_METHOD_V1',\n"
              "    'payment_method', (v_pm - 'organization_id' - 'payment_method_id') || jsonb_build_object('due_basis','nf_issue','schedule_estimated',true),\n"
              "    'schedule', COALESCE(v_rows, '[]'::jsonb), 'installment_count', v_installments, 'first_due_date', v_first_due);\n"
              "  INSERT INTO public.partner_order_idempotency(\n",
              "C11 snapshot + ACK")
    return s + ";\n"


def build_sim():
    s = _captured(SOLID_CAP / "public.simulate_b2b_payment_plan_secure.37d4f45e.live-20261106.sql", "37d4f45e")
    first = s.split("\n", 1)[0]
    s = delta(s, first, "CREATE OR REPLACE FUNCTION public.simulate_b2b_payment_plan_with_method_secure(p_partner_id uuid, p_payment_plan_id uuid, "
              "p_items jsonb, p_method_config_id uuid, p_method_config_version integer)", "S0 assinatura")
    s = delta(s, "  v_due_i date; v_quote boolean; i integer;\n",
              "  v_due_i date; v_quote boolean; i integer;\n  p_first_due_date date := NULL; v_pm jsonb; v_rows jsonb;\n", "S1 declarações")
    s = delta(s, "  IF v_plan.discount_percent > 40 AND NOT v_is_admin THEN RAISE EXCEPTION 'discount_exceeds_limit'; END IF;\n",
              "  IF v_plan.discount_percent > 40 AND NOT v_is_admin THEN RAISE EXCEPTION 'discount_exceeds_limit'; END IF;\n"
              "  v_pm := platform_private.b2b_payment_method_resolve(p_partner_id, v_plan.id, p_method_config_id, p_method_config_version, false);\n",
              "S2 resolve")
    s = delta(s, "  v_interest := ROUND(v_final - v_net, 2);\n",
              "  v_installments := (v_pm->>'installment_count')::integer;\n  IF NOT v_quote THEN\n" + SCHED_CALL + "  END IF;\n"
              "  v_interest := ROUND(v_final - v_net, 2);\n", "S3 total pelas parcelas")
    s = delta(s, "  v_first_due := COALESCE(p_first_due_date, current_date + v_plan.max_days);\n",
              "  v_first_due := COALESCE((v_rows->0->>'estimated_due_date')::date, current_date + (v_pm->>'due_days')::integer);\n", "S4 vencimento estimado")
    s = delta(s, "  v_installments := GREATEST(COALESCE(v_plan.installment_count,1), 1);\n", "", "S5 parcelas do plano removidas")
    s = block(s, "  ELSIF v_installments = 1 THEN\n", "    END LOOP;\n  END IF;\n",
              "  ELSE\n    SELECT COALESCE(jsonb_agg(r || jsonb_build_object('due_date', r->>'estimated_due_date') ORDER BY (r->>'installment_number')::integer), '[]'::jsonb)\n"
              "      INTO v_schedule FROM jsonb_array_elements(v_rows) r;\n  END IF;\n", "S6 cronograma = parcelas")
    s = delta(s, "    'cart_hash', public.fn_b2b_cart_hash(p_partner_id, p_payment_plan_id, v_cart, v_final),\n",
              "    'cart_hash', platform_private.b2b_payment_method_hash(public.fn_b2b_cart_hash(p_partner_id, p_payment_plan_id, v_cart, v_final), v_pm, v_final),\n",
              "S7 hash")
    s = delta(s, "    'warnings', v_warnings);\n",
              "    'warnings', v_warnings,\n    'payment_method_contract', 'B2B_PAYMENT_METHOD_V1',\n"
              "    'payment_method', (v_pm - 'organization_id' - 'payment_method_id') || jsonb_build_object('due_basis','nf_issue','schedule_estimated',true),\n"
              "    'installment_count', v_installments, 'schedule_estimated', true, 'due_basis', 'nf_issue', 'estimated_reference_date', current_date);\n",
              "S8 resposta")
    return s + ";\n"


TABLES = r"""
CREATE TABLE platform_private.b2b_payment_method_activation(
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id),
  mode text NOT NULL CHECK (mode IN ('off','pilot','enforced')),
  pilot_partner_ids uuid[] NOT NULL DEFAULT '{}',
  version integer NOT NULL CHECK (version > 0), updated_by uuid NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT b2bpma_pilot_shape CHECK ((mode = 'pilot') = (cardinality(pilot_partner_ids) > 0)));
CREATE TABLE platform_private.b2b_payment_method_activation_history(
  organization_id uuid NOT NULL, version integer NOT NULL, snapshot jsonb NOT NULL, actor_id uuid NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (organization_id, version));

CREATE TABLE public.b2b_payment_method_configs(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  payment_plan_id uuid NOT NULL REFERENCES public.commercial_payment_plans(id),
  method_kind text NOT NULL CHECK (method_kind IN ('dinheiro','pix','debito','boleto','promissoria','credito')),
  payment_method_id uuid NOT NULL REFERENCES public.payment_methods(id),
  status text NOT NULL CHECK (status IN ('active','revoked')),
  version integer NOT NULL CHECK (version > 0),
  due_days integer NOT NULL CHECK (due_days BETWEEN 0 AND 365),
  max_installments integer NOT NULL CHECK (max_installments BETWEEN 1 AND 36),
  price_monthly_rate_percent numeric(9,6) CHECK (price_monthly_rate_percent IS NULL OR price_monthly_rate_percent BETWEEN 0 AND 100),
  created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT b2b_pmc_unique UNIQUE (organization_id, payment_plan_id, method_kind),
  CONSTRAINT b2b_pmc_single_payment CHECK (method_kind NOT IN ('dinheiro','pix','debito') OR (max_installments = 1 AND price_monthly_rate_percent IS NULL)),
  CONSTRAINT b2b_pmc_boleto_max3 CHECK (method_kind <> 'boleto' OR max_installments <= 3),
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
  estimated_reference_date date NOT NULL, estimated_schedule jsonb NOT NULL, final_amount numeric(14,2), cart_hash text NOT NULL,
  created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now());

REVOKE ALL ON public.b2b_payment_method_configs, public.b2b_payment_method_config_versions,
  public.partner_order_payment_method_snapshots FROM PUBLIC, anon, authenticated;
REVOKE ALL ON platform_private.b2b_payment_method_activation, platform_private.b2b_payment_method_activation_history FROM PUBLIC, anon, authenticated;
ALTER TABLE public.b2b_payment_method_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.b2b_payment_method_config_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_order_payment_method_snapshots ENABLE ROW LEVEL SECURITY;
-- Sem policies para clientes: leitura e escrita somente pelos RPCs abaixo (empresa derivada no servidor).
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
CREATE TRIGGER b2b_pm_activation_history_immutable BEFORE UPDATE OR DELETE ON platform_private.b2b_payment_method_activation_history
  FOR EACH ROW EXECUTE FUNCTION platform_private.b2b_payment_method_immutable();

-- Parcelas em centavos exatos. n>1 com taxa explícita: Price sobre o LÍQUIDO (o plano não pode ter juros próprios);
-- última parcela absorve o resíduo do principal. Caso contrário: total do plano (juros LIVE) dividido como no corpo LIVE.
-- 1ª data = base + due_days; seguintes no mesmo dia ou último dia do mês. ESTIMATIVA: dia útil/NF ficam no B4.
CREATE OR REPLACE FUNCTION platform_private.b2b_payment_method_schedule(p_net numeric, p_plan_final numeric, p_n integer, p_due_days integer, p_rate numeric, p_base date)
 RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path TO '' AS $function$
DECLARE i numeric; pmt numeric(14,2); bal numeric(14,2); it numeric(14,2); pr numeric(14,2); amt numeric(14,2); acc numeric(14,2) := 0;
  out jsonb := '[]'::jsonb; k integer; first_due date; price boolean;
BEGIN
  IF p_net IS NULL OR p_net < 0 OR p_plan_final IS NULL OR p_plan_final < 0 OR p_n IS NULL OR p_n NOT BETWEEN 1 AND 36
     OR p_due_days IS NULL OR p_due_days NOT BETWEEN 0 AND 365 OR p_base IS NULL OR (p_rate IS NOT NULL AND (p_rate < 0 OR p_rate > 100)) THEN
    RAISE EXCEPTION 'payment_method_schedule_invalid' USING ERRCODE='22023'; END IF;
  price := p_n > 1 AND p_rate IS NOT NULL;
  IF price AND round(p_plan_final, 2) <> round(p_net, 2) THEN RAISE EXCEPTION 'payment_method_price_interest_conflict' USING ERRCODE='PT409'; END IF;
  first_due := p_base + p_due_days;
  IF price THEN
    i := p_rate / 100; bal := round(p_net, 2);
    IF i = 0 THEN pmt := round(bal / p_n, 2); ELSE pmt := round(bal * i / (1 - power(1 + i, -p_n)), 2); END IF;
    FOR k IN 1..p_n LOOP
      it := round(bal * i, 2);
      IF k < p_n THEN pr := pmt - it; ELSE pr := bal; END IF;
      out := out || jsonb_build_array(jsonb_build_object('installment_number', k,
        'estimated_due_date', (first_due + make_interval(months => k - 1))::date, 'amount', pr + it, 'principal_amount', pr, 'interest_amount', it));
      bal := bal - pr;
    END LOOP;
  ELSE
    amt := round(p_plan_final / p_n, 2);
    FOR k IN 1..p_n LOOP
      IF k = p_n THEN amt := round(p_plan_final - acc, 2); END IF;
      acc := acc + amt;
      pr := CASE WHEN p_plan_final = 0 THEN 0 ELSE round(amt * (p_net / p_plan_final), 2) END;
      out := out || jsonb_build_array(jsonb_build_object('installment_number', k,
        'estimated_due_date', (first_due + make_interval(months => k - 1))::date, 'amount', amt, 'principal_amount', pr, 'interest_amount', amt - pr));
    END LOOP;
  END IF;
  RETURN out;
END $function$;

CREATE OR REPLACE FUNCTION platform_private.b2b_payment_method_hash(p_base text, p_pm jsonb, p_total numeric)
 RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO '' AS $function$
  SELECT encode(pg_catalog.sha256(convert_to('b2bpm_hash_v1|' || p_base || '|cfg=' || (p_pm->>'config_id') || '|v=' || (p_pm->>'version')
    || '|kind=' || (p_pm->>'method_kind') || '|n=' || (p_pm->>'installment_count') || '|due=' || (p_pm->>'due_days')
    || '|rate=' || COALESCE(p_pm->>'price_monthly_rate_percent', '-') || '|total=' || to_char(round(p_total, 2), 'FM9999999999990.00'), 'UTF8')), 'hex')
$function$;

-- Empresa vendedora do pedido: comprador externo -> leitor canônico; ator interno -> própria empresa (h15), que precisa
-- ser a dona comercial do parceiro. Nunca do payload.
CREATE OR REPLACE FUNCTION platform_private.b2b_payment_method_seller(p_partner_id uuid)
 RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE v_uid uuid := auth.uid(); v_org uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE='42501'; END IF;
  IF public.has_role(v_uid,'administrador'::public.app_role) IS TRUE OR public.has_role(v_uid,'gestor_comercial'::public.app_role) IS TRUE
     OR public.has_role(v_uid,'financeiro'::public.app_role) IS TRUE THEN
    v_org := platform_private.h15_actor_organization();
    IF v_org IS NULL OR NOT EXISTS (SELECT 1 FROM public.partner_accounts a WHERE a.id = p_partner_id AND a.commercial_owner_organization_id = v_org AND a.ativo IS TRUE) THEN
      RAISE EXCEPTION 'forbidden_partner' USING ERRCODE='42501'; END IF;
    RETURN v_org;
  END IF;
  RETURN platform_private.b2b_partner_catalog_reader(p_partner_id);
END $function$;

CREATE OR REPLACE FUNCTION platform_private.b2b_payment_method_mode(p_partner_id uuid)
 RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $function$
  SELECT CASE WHEN g.mode = 'enforced' OR (g.mode = 'pilot' AND p_partner_id = ANY (g.pilot_partner_ids)) THEN 'required' ELSE 'legacy' END
    FROM public.partner_accounts a LEFT JOIN platform_private.b2b_payment_method_activation g ON g.organization_id = a.commercial_owner_organization_id
   WHERE a.id = p_partner_id
$function$;

-- Resolve a configuração; com p_lock trava config -> plano -> atribuição -> meio (FOR SHARE), relendo depois de cada espera.
CREATE OR REPLACE FUNCTION platform_private.b2b_payment_method_resolve(p_partner_id uuid, p_plan_id uuid, p_config_id uuid, p_version integer, p_lock boolean)
 RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE v_seller uuid; c record; v_pm record; v_plan record; v_n integer; v_asg boolean;
BEGIN
  IF p_config_id IS NULL OR p_version IS NULL THEN RAISE EXCEPTION 'payment_method_required' USING ERRCODE='P0001'; END IF;
  v_seller := platform_private.b2b_payment_method_seller(p_partner_id);
  IF p_lock THEN
    SELECT * INTO c FROM public.b2b_payment_method_configs WHERE id = p_config_id FOR SHARE;
  ELSE
    SELECT * INTO c FROM public.b2b_payment_method_configs WHERE id = p_config_id;
  END IF;
  IF NOT FOUND OR c.organization_id IS DISTINCT FROM v_seller OR c.payment_plan_id IS DISTINCT FROM p_plan_id THEN
    RAISE EXCEPTION 'payment_method_unavailable' USING ERRCODE='42501'; END IF;
  IF c.version IS DISTINCT FROM p_version THEN RAISE EXCEPTION 'payment_method_stale' USING ERRCODE='PT409'; END IF;
  IF c.status <> 'active' THEN RAISE EXCEPTION 'payment_method_unavailable' USING ERRCODE='PT409'; END IF;
  IF p_lock THEN
    SELECT p.installment_count, p.monthly_interest_percent, p.active, p.max_days INTO v_plan FROM public.commercial_payment_plans p WHERE p.id = p_plan_id FOR SHARE;
    v_asg := EXISTS (SELECT 1 FROM (SELECT 1 FROM public.commercial_payment_plan_assignments a
                  WHERE a.plan_id = p_plan_id AND a.partner_id = p_partner_id AND a.buyer_scope = 'partner' AND a.status = 'published'
                    AND a.valid_from <= CURRENT_DATE AND (a.valid_until IS NULL OR a.valid_until >= CURRENT_DATE) FOR SHARE) x);
    SELECT pm.id, pm.name, pm.active INTO v_pm FROM public.payment_methods pm WHERE pm.id = c.payment_method_id FOR SHARE;
  ELSE
    SELECT p.installment_count, p.monthly_interest_percent, p.active, p.max_days INTO v_plan FROM public.commercial_payment_plans p WHERE p.id = p_plan_id;
    v_asg := EXISTS (SELECT 1 FROM public.commercial_payment_plan_assignments a
                  WHERE a.plan_id = p_plan_id AND a.partner_id = p_partner_id AND a.buyer_scope = 'partner' AND a.status = 'published'
                    AND a.valid_from <= CURRENT_DATE AND (a.valid_until IS NULL OR a.valid_until >= CURRENT_DATE));
    SELECT pm.id, pm.name, pm.active INTO v_pm FROM public.payment_methods pm WHERE pm.id = c.payment_method_id;
  END IF;
  IF v_plan.active IS NOT TRUE THEN RAISE EXCEPTION 'plan_inactive' USING ERRCODE='PT409'; END IF;
  IF NOT v_asg THEN RAISE EXCEPTION 'payment_method_unavailable' USING ERRCODE='PT409'; END IF;
  IF v_pm.id IS NULL OR v_pm.active IS NOT TRUE THEN RAISE EXCEPTION 'payment_method_unavailable' USING ERRCODE='PT409'; END IF;
  v_n := GREATEST(COALESCE(v_plan.installment_count, 1), 1);
  IF v_n > c.max_installments THEN RAISE EXCEPTION 'payment_method_installments_incompatible' USING ERRCODE='PT409'; END IF;
  IF v_n > 1 AND COALESCE(v_plan.monthly_interest_percent, 0) > 0 THEN RAISE EXCEPTION 'payment_method_price_interest_conflict' USING ERRCODE='PT409'; END IF;
  IF c.due_days > COALESCE(v_plan.max_days, 0) THEN RAISE EXCEPTION 'payment_method_due_exceeds_plan' USING ERRCODE='PT409'; END IF;
  RETURN jsonb_build_object('config_id', c.id, 'version', c.version, 'organization_id', c.organization_id, 'method_kind', c.method_kind,
    'payment_method_id', v_pm.id, 'payment_method_name', v_pm.name, 'due_days', c.due_days, 'installment_count', v_n,
    'price_monthly_rate_percent', CASE WHEN v_n > 1 THEN c.price_monthly_rate_percent END);
END $function$;

-- Exigência por empresa ativada: pedido sem snapshot de meio não fecha a transação (qualquer ator; sem bypass por papel).
CREATE OR REPLACE FUNCTION platform_private.b2b_payment_method_required_check()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
BEGIN
  IF NEW.payment_plan_id IS NULL THEN RETURN NULL; END IF;
  IF platform_private.b2b_payment_method_mode(NEW.partner_id) IS DISTINCT FROM 'required' THEN RETURN NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.partner_order_payment_method_snapshots s WHERE s.partner_order_id = NEW.id) THEN
    RAISE EXCEPTION 'B2B_PAYMENT_METHOD_REQUIRED' USING ERRCODE='P0001',
      HINT = 'Selecione um meio de pagamento permitido pela empresa fornecedora (contrato B2B_PAYMENT_METHOD_V1).';
  END IF;
  RETURN NULL;
END $function$;
CREATE CONSTRAINT TRIGGER b2b_payment_method_required AFTER INSERT ON public.partner_orders
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION platform_private.b2b_payment_method_required_check();
"""

AUTH_CFG = """  v_org := platform_private.h15_actor_organization();
  IF v_org IS NULL OR public.is_platform_superadmin(v_uid) IS NOT FALSE
     OR NOT (public.has_role(v_uid,'administrador'::public.app_role) IS TRUE OR public.has_role(v_uid,'financeiro'::public.app_role) IS TRUE)
     OR public.has_role(v_uid,'parceiro_b2b'::public.app_role) IS NOT FALSE OR public.has_role(v_uid,'parceiro_b2b_tecnico'::public.app_role) IS NOT FALSE THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
"""

PUB_FNS = r"""
-- Escritor do VENDEDOR. Ordem: advisory -> reautorização -> linha FOR UPDATE -> plano/meio FOR SHARE -> CAS.
CREATE OR REPLACE FUNCTION public.b2b_payment_method_config_save(p_config_id uuid, p_payment_plan_id uuid, p_method_kind text, p_payment_method_id uuid,
  p_due_days integer, p_max_installments integer, p_price_monthly_rate_percent numeric, p_status text, p_expected_version integer)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE v_uid uuid := auth.uid(); v_org uuid; c record; v_row public.b2b_payment_method_configs;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE='42501'; END IF;
""" + AUTH_CFG + r"""  IF p_status NOT IN ('active','revoked') OR p_expected_version IS NULL OR p_expected_version < 0 OR p_method_kind IS NULL OR p_payment_plan_id IS NULL THEN
    RAISE EXCEPTION 'payment_method_config_invalid' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('b2b_pmc:' || v_org::text || ':' || p_payment_plan_id::text || ':' || p_method_kind, 0));
  -- Reautoriza DEPOIS da espera (papel/perfil/empresa podem ter mudado).
""" + AUTH_CFG.replace("  v_org := platform_private.h15_actor_organization();\n", "  IF platform_private.h15_actor_organization() IS DISTINCT FROM v_org THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;\n") + r"""  IF p_config_id IS NULL THEN
    IF p_expected_version <> 0 THEN RAISE EXCEPTION 'payment_method_config_stale' USING ERRCODE='PT409'; END IF;
    IF EXISTS (SELECT 1 FROM public.b2b_payment_method_configs x WHERE x.organization_id = v_org AND x.payment_plan_id = p_payment_plan_id AND x.method_kind = p_method_kind) THEN
      RAISE EXCEPTION 'payment_method_config_stale' USING ERRCODE='PT409'; END IF;
  ELSE
    SELECT * INTO c FROM public.b2b_payment_method_configs x WHERE x.id = p_config_id AND x.organization_id = v_org FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
    IF c.payment_plan_id IS DISTINCT FROM p_payment_plan_id OR c.method_kind IS DISTINCT FROM p_method_kind THEN
      RAISE EXCEPTION 'payment_method_config_identity_immutable' USING ERRCODE='P0001'; END IF;
    IF c.version <> p_expected_version THEN RAISE EXCEPTION 'payment_method_config_stale' USING ERRCODE='PT409'; END IF;
  END IF;
  IF p_status = 'active' THEN
    PERFORM 1 FROM public.commercial_payment_plans p WHERE p.id = p_payment_plan_id AND p.active IS TRUE AND p.superseded_by_id IS NULL FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'plan_inactive' USING ERRCODE='P0001'; END IF;
    PERFORM 1 FROM public.payment_methods pm WHERE pm.id = p_payment_method_id AND pm.active IS TRUE FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'payment_method_catalog_unavailable' USING ERRCODE='P0001'; END IF;
  END IF;
  IF p_config_id IS NULL THEN
    INSERT INTO public.b2b_payment_method_configs(organization_id, payment_plan_id, method_kind, payment_method_id, status, version, due_days,
      max_installments, price_monthly_rate_percent, created_by, updated_by)
    VALUES (v_org, p_payment_plan_id, p_method_kind, p_payment_method_id, p_status, 1, p_due_days, p_max_installments, p_price_monthly_rate_percent, v_uid, v_uid)
    RETURNING * INTO v_row;
  ELSE
    UPDATE public.b2b_payment_method_configs SET payment_method_id = p_payment_method_id, status = p_status, version = c.version + 1,
      due_days = p_due_days, max_installments = p_max_installments, price_monthly_rate_percent = p_price_monthly_rate_percent,
      updated_by = v_uid, updated_at = now()
     WHERE id = c.id RETURNING * INTO v_row;
  END IF;
  INSERT INTO public.b2b_payment_method_config_versions(config_id, version, snapshot, actor_id) VALUES (v_row.id, v_row.version, to_jsonb(v_row), v_uid);
  RETURN jsonb_build_object('contract','B2B_PAYMENT_METHOD_V1','config', to_jsonb(v_row));
END $function$;

-- Ativação por empresa: off -> pilot (parceiros listados da própria empresa) -> enforced. Só administrador; exige config ativa.
CREATE OR REPLACE FUNCTION public.b2b_payment_method_activation_set(p_mode text, p_pilot_partner_ids uuid[], p_expected_version integer)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE v_uid uuid := auth.uid(); v_org uuid; g record; v_row platform_private.b2b_payment_method_activation; v_ids uuid[];
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE='42501'; END IF;
  v_org := platform_private.h15_actor_organization();
  IF v_org IS NULL OR public.is_platform_superadmin(v_uid) IS NOT FALSE OR public.has_role(v_uid,'administrador'::public.app_role) IS NOT TRUE
     OR public.has_role(v_uid,'parceiro_b2b'::public.app_role) IS NOT FALSE THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  IF p_mode NOT IN ('off','pilot','enforced') OR p_expected_version IS NULL OR p_expected_version < 0 THEN
    RAISE EXCEPTION 'payment_method_activation_invalid' USING ERRCODE='22023'; END IF;
  v_ids := CASE WHEN p_mode = 'pilot' THEN (SELECT COALESCE(array_agg(DISTINCT x ORDER BY x), '{}') FROM unnest(COALESCE(p_pilot_partner_ids,'{}')) x) ELSE '{}' END;
  PERFORM pg_advisory_xact_lock(hashtextextended('b2b_pma:' || v_org::text, 0));
  IF platform_private.h15_actor_organization() IS DISTINCT FROM v_org OR public.has_role(v_uid,'administrador'::public.app_role) IS NOT TRUE THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  SELECT * INTO g FROM platform_private.b2b_payment_method_activation WHERE organization_id = v_org FOR UPDATE;
  IF COALESCE(g.version, 0) <> p_expected_version THEN RAISE EXCEPTION 'payment_method_activation_stale' USING ERRCODE='PT409'; END IF;
  IF p_mode = 'pilot' AND (cardinality(v_ids) = 0 OR EXISTS (SELECT 1 FROM unnest(v_ids) x WHERE NOT EXISTS (
       SELECT 1 FROM public.partner_accounts a WHERE a.id = x AND a.commercial_owner_organization_id = v_org AND a.ativo IS TRUE))) THEN
    RAISE EXCEPTION 'payment_method_pilot_partner_invalid' USING ERRCODE='42501'; END IF;
  IF p_mode <> 'off' AND NOT EXISTS (SELECT 1 FROM public.b2b_payment_method_configs x WHERE x.organization_id = v_org AND x.status = 'active') THEN
    RAISE EXCEPTION 'payment_method_activation_requires_config' USING ERRCODE='P0001'; END IF;
  INSERT INTO platform_private.b2b_payment_method_activation(organization_id, mode, pilot_partner_ids, version, updated_by)
  VALUES (v_org, p_mode, v_ids, COALESCE(g.version, 0) + 1, v_uid)
  ON CONFLICT (organization_id) DO UPDATE SET mode = EXCLUDED.mode, pilot_partner_ids = EXCLUDED.pilot_partner_ids, version = EXCLUDED.version,
    updated_by = EXCLUDED.updated_by, updated_at = now()
  RETURNING * INTO v_row;
  INSERT INTO platform_private.b2b_payment_method_activation_history(organization_id, version, snapshot, actor_id) VALUES (v_org, v_row.version, to_jsonb(v_row), v_uid);
  RETURN jsonb_build_object('contract','B2B_PAYMENT_METHOD_V1','activation', to_jsonb(v_row) - 'updated_by');
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
  RETURN jsonb_build_object('contract','B2B_PAYMENT_METHOD_V1','organization_id', v_org,
    'can_edit', public.has_role(v_uid,'administrador'::public.app_role) IS TRUE OR public.has_role(v_uid,'financeiro'::public.app_role) IS TRUE,
    'can_activate', public.has_role(v_uid,'administrador'::public.app_role) IS TRUE,
    'activation', COALESCE((SELECT to_jsonb(g) - 'updated_by' FROM platform_private.b2b_payment_method_activation g WHERE g.organization_id = v_org),
                           jsonb_build_object('mode','off','pilot_partner_ids','[]'::jsonb,'version',0)),
    'configs', COALESCE((SELECT jsonb_agg(to_jsonb(x) - 'created_by' - 'updated_by' ORDER BY x.payment_plan_id, x.method_kind) FROM public.b2b_payment_method_configs x WHERE x.organization_id = v_org), '[]'::jsonb),
    'catalog', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', pm.id, 'name', pm.name) ORDER BY pm.name) FROM public.payment_methods pm WHERE pm.active IS TRUE), '[]'::jsonb),
    'plans', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'code', p.code, 'installment_count', p.installment_count,
               'max_days', p.max_days, 'monthly_interest_percent', p.monthly_interest_percent) ORDER BY p.name)
               FROM public.commercial_payment_plans p WHERE p.active IS TRUE AND p.superseded_by_id IS NULL), '[]'::jsonb),
    'partners', COALESCE((SELECT jsonb_agg(a.id ORDER BY a.id) FROM public.partner_accounts a WHERE a.commercial_owner_organization_id = v_org AND a.ativo IS TRUE), '[]'::jsonb));
END $function$;

-- Opções no pedido (comprador do parceiro ou ator interno do vendedor). mode=legacy: empresa não ativada (contrato atual).
CREATE OR REPLACE FUNCTION public.b2b_list_payment_method_options_secure(p_partner_id uuid, p_payment_plan_id uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE v_seller uuid; v_opts jsonb := '[]'::jsonb; c record; r jsonb; v_reason text;
BEGIN
  IF auth.uid() IS NULL OR p_payment_plan_id IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE='42501'; END IF;
  IF public.has_role(auth.uid(),'parceiro_b2b_tecnico'::public.app_role) IS TRUE AND NOT (public.has_role(auth.uid(),'parceiro_b2b'::public.app_role) IS TRUE
     OR public.has_role(auth.uid(),'administrador'::public.app_role) IS TRUE OR public.has_role(auth.uid(),'gestor_comercial'::public.app_role) IS TRUE
     OR public.has_role(auth.uid(),'financeiro'::public.app_role) IS TRUE) THEN RAISE EXCEPTION 'forbidden_financial_terms' USING ERRCODE='42501'; END IF;
  v_seller := platform_private.b2b_payment_method_seller(p_partner_id);
  FOR c IN SELECT x.id, x.version, x.method_kind FROM public.b2b_payment_method_configs x
            WHERE x.organization_id = v_seller AND x.payment_plan_id = p_payment_plan_id AND x.status = 'active' ORDER BY x.method_kind LOOP
    BEGIN
      r := platform_private.b2b_payment_method_resolve(p_partner_id, p_payment_plan_id, c.id, c.version, false);
      v_opts := v_opts || jsonb_build_array((r - 'organization_id' - 'payment_method_id') || jsonb_build_object('available', true));
    EXCEPTION WHEN SQLSTATE 'PT409' THEN
      GET STACKED DIAGNOSTICS v_reason = MESSAGE_TEXT;
      IF v_reason IN ('payment_method_installments_incompatible','payment_method_price_interest_conflict','payment_method_due_exceeds_plan') THEN
        v_opts := v_opts || jsonb_build_array(jsonb_build_object('config_id', c.id, 'version', c.version, 'available', false, 'reason', v_reason, 'method_kind', c.method_kind));
      ELSIF v_reason IN ('payment_method_unavailable','plan_inactive') THEN NULL;
      ELSE RAISE; END IF;
    END;
  END LOOP;
  RETURN jsonb_build_object('contract','B2B_PAYMENT_METHOD_V1','partner_id', p_partner_id,'payment_plan_id', p_payment_plan_id,
    'mode', platform_private.b2b_payment_method_mode(p_partner_id), 'due_basis','nf_issue','options', v_opts);
END $function$;
"""

READ_FN = r"""
CREATE OR REPLACE FUNCTION public.get_partner_order_payment_method_secure(p_order_id uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE s record;
BEGIN
  PERFORM public.get_partner_order_payment_terms_secure(p_order_id);  -- mesmas portas do leitor de condição instalado
  SELECT * INTO s FROM public.partner_order_payment_method_snapshots x WHERE x.partner_order_id = p_order_id;
  RETURN jsonb_build_object('contract','B2B_PAYMENT_METHOD_V1','order_id', p_order_id,'present', FOUND,
    'payment_method', CASE WHEN FOUND THEN jsonb_build_object('method_kind', s.method_kind, 'payment_method_name', s.payment_method_name_snapshot,
      'config_version', s.config_version, 'due_days', s.due_days, 'installment_count', s.installment_count, 'price_monthly_rate_percent', s.price_monthly_rate_percent,
      'due_basis', s.due_basis, 'schedule_estimated', s.schedule_estimated, 'estimated_reference_date', s.estimated_reference_date,
      'schedule', s.estimated_schedule, 'final_amount', s.final_amount) END);
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
    "activation": "public.b2b_payment_method_activation_set(p_mode text, p_pilot_partner_ids uuid[], p_expected_version integer)",
    "options": "public.b2b_list_payment_method_options_secure(p_partner_id uuid, p_payment_plan_id uuid)",
    "sim": "public.simulate_b2b_payment_plan_with_method_secure(p_partner_id uuid, p_payment_plan_id uuid, p_items jsonb, p_method_config_id uuid, p_method_config_version integer)",
    "create": "public.create_partner_order_with_method_secure(p_partner_id uuid, p_observacoes text, p_items jsonb, p_requested_delivery_date date, p_payment_plan_id uuid, p_expected_cart_hash text, p_idempotency_key text, p_method_config_id uuid, p_method_config_version integer)",
    "read": "public.get_partner_order_payment_method_secure(p_order_id uuid)",
}


def pins_block(label, pins, cols):
    s = ""
    for k, v in pins.items():
        cmp = f"md5(pg_get_functiondef('{k}'::regprocedure)) <> '{v}'" if len(v) == 32 else f"left(md5(pg_get_functiondef('{k}'::regprocedure)), {len(v)}) <> '{v}'"
        s += f"  IF to_regprocedure('{k}') IS NULL OR {cmp} THEN RAISE EXCEPTION '{label}: {k} divergente'; END IF;\n"
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
          f"THEN RAISE EXCEPTION '{label}: trigger de exigência ausente'; END IF;\n")
    return s


def fn_pins(label, md):
    return "".join(f"  IF to_regprocedure('{sig}') IS NULL OR md5(pg_get_functiondef('{sig}'::regprocedure)) <> '{md[k]}' THEN RAISE EXCEPTION '{label}: {sig} divergente'; END IF;\n"
                   for k, sig in PUB.items())


def build(pins=LIVE_PINS, cols=LIVE_COLS, fn_md5=None, deny_md5=None):
    absent = ("  IF to_regclass('public.b2b_payment_method_configs') IS NOT NULL OR to_regclass('platform_private.b2b_payment_method_activation') IS NOT NULL"
              f" OR to_regprocedure('{PUB['create']}') IS NOT NULL THEN RAISE EXCEPTION 'já instalado'; END IF;\n")
    grants = "".join(f"REVOKE ALL ON FUNCTION {s} FROM PUBLIC, anon;\nGRANT EXECUTE ON FUNCTION {s} TO authenticated;\n" for s in PUB.values())
    grants += "".join(f"REVOKE ALL ON FUNCTION {s} FROM PUBLIC, anon, authenticated;\n" for s in PRIV)
    md = fn_md5 or {}
    pre = ("-- 01 PRE (somente leitura). Ref canônico swzpzcwiasxmjutrmvkm conferido FORA do SQL antes de rodar.\nDO $$ BEGIN\n"
           + pins_block("PRE", pins, cols) + absent + "  RAISE NOTICE 'PRE_OK';\nEND $$;\n")
    inst = ("-- 02 INSTALL (REVISÁVEL; NÃO APLICAR sem autorização). Não altera corpos LIVE, planos, condições, PB-001036 ou configurações.\n"
            "-- Nenhuma empresa fica ativada: sem linha em b2b_payment_method_activation todos seguem o contrato atual.\n"
            "BEGIN;\nSET LOCAL lock_timeout = '3s';\nDO $$ BEGIN\n" + pins_block("INSTALL", pins, cols) + absent + "END $$;\n"
            + TABLES + PRIV_FNS + PUB_FNS + build_sim() + build_create() + READ_FN + grants
            + "DO $$ BEGIN\n" + pins_block("INSTALL_POST", pins, cols) + (fn_pins("INSTALL_POST", md) if md else "") + acl_block("INSTALL_POST")
            + "  IF EXISTS (SELECT 1 FROM platform_private.b2b_payment_method_activation) THEN RAISE EXCEPTION 'INSTALL_POST: ativação inesperada'; END IF;\n"
            + "END $$;\nCOMMIT;\n")
    post = ("-- 03 POST (somente leitura).\nDO $$ BEGIN\n" + pins_block("POST", pins, cols) + (fn_pins("POST", md) if md else "") + acl_block("POST")
            + "  RAISE NOTICE 'POST_OK';\nEND $$;\n")
    deny = "".join(DENY_TMPL.format(sig_args=s) for s in DENY_SIGS.values())
    revoke = "".join(f"REVOKE ALL ON FUNCTION {s} FROM PUBLIC, anon, authenticated;\n" for s in PUB.values())
    rb = ("-- 04 ROLLBACK deny-only: RPCs novos passam a negar; gatilho, ativações, tabelas, snapshots e histórico PERMANECEM.\n"
          "-- Empresas não ativadas seguem o contrato atual; empresas já ativadas ficam bloqueadas (nega, nunca reabre fallback).\n"
          "BEGIN;\nDO $$ BEGIN\n" + (fn_pins("ROLLBACK", md) if md else "") + "END $$;\n" + deny + revoke
          + "DO $$ BEGIN\n" + (fn_pins("ROLLBACK_POST", deny_md5) if deny_md5 else "") + acl_block("ROLLBACK_POST", deny=True) + "END $$;\nCOMMIT;\n")
    return {"01-pre.sql.readonly": pre, "02-install.sql.review": inst, "03-post.sql.readonly": post, "04-rollback-deny.sql.review": rb}


if __name__ == "__main__":
    p = HERE / "fn-md5.json"
    fm = json.loads(p.read_text()) if p.exists() else {}
    files = build( fn_md5=fm.get("install"), deny_md5=fm.get("deny"))
    for n, t in files.items(): (HERE / n).write_text(t)
    meta = {n: hashlib.md5(t.encode()).hexdigest() for n, t in files.items()}
    (HERE / "generated-md5.json").write_text(json.dumps(meta, indent=2) + "\n"); print(json.dumps(meta, indent=2))
