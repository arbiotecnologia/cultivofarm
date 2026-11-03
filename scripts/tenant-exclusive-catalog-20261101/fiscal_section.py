"""Seção fiscal por tenant do candidato exclusivo (11b).

Achado reproduzido no esquema REAL (harness_real.py): as policies LIVE de product_fiscal_profiles chamam
platform_private.global_product_fiscal_read_ready()/write_ready() (Superadmin global). Fechar o catálogo global sem
substituí-las quebra TODA leitura de perfil fiscal (42501 permission denied) e mantém escrita só para Superadmin.

Contrato (consumidor existente: src/lib/fiscal/ownedProductFiscal.ts):
- Dono fiscal = owner_organization_id IMUTÁVEL do produto; nunca payload/GUC/claim.
- Escrita só por public.tenant_owned_product_fiscal_save (DEFINER, search_path fixo, ator 'mutate' = dono,
  reautorização após lock, CAS por updated_at, recibo idempotente). Clientes não escrevem direto.
- Gatilho global_product_fiscal_before_write reescrito: mesmo nome/gatilho, autoriza pelo dono do produto,
  preserva imutabilidade de histórico/identidade e token CAS do servidor; nunca promove VALIDATED nem aceita
  carimbo contábil — classificação vem da contabilidade (fluxo separado, fechado).
- Leitura: produto visível pelo tenant (RLS descendente) E papel administrador/gestor/financeiro do mesmo tenant.
- Emissão, gate fiscal e flags permanecem intocados (desligados).
"""

FIELDS = ["ncm", "cest", "cfop_in_state", "cfop_interstate", "origin_code", "icms_cst", "icms_csosn", "ipi_cst",
          "pis_cst", "cofins_cst", "commercial_unit", "taxable_unit", "gtin", "taxable_gtin", "tax_benefit_code",
          "fiscal_description", "accounting_notes"]
PATTERNS = {"ncm": "^[0-9]{8}$", "cest": "^[0-9]{7}$", "cfop_in_state": "^[1-7][0-9]{3}$",
            "cfop_interstate": "^[1-7][0-9]{3}$", "origin_code": "^[0-8]$",
            "gtin": "^([0-9]{8}|[0-9]{12,14}|SEM GTIN)$", "taxable_gtin": "^([0-9]{8}|[0-9]{12,14}|SEM GTIN)$"}
RECEIPTS = "platform_private.tenant_product_fiscal_receipts"
# ator canônico normalizado: negações do catalog_tenant_actor (auth ausente, papel, plataforma) viram FISCAL_FORBIDDEN/42501
ACTOR_FN = """CREATE FUNCTION platform_private.tenant_fiscal_mutate_org() RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $f$
BEGIN
  RETURN platform_private.catalog_tenant_actor('mutate');
EXCEPTION WHEN raise_exception OR insufficient_privilege OR invalid_parameter_value THEN
  RAISE EXCEPTION 'FISCAL_FORBIDDEN' USING ERRCODE='42501';
END $f$;
REVOKE ALL ON FUNCTION platform_private.tenant_fiscal_mutate_org() FROM PUBLIC, anon, authenticated, service_role;"""


def fiscal_sql(w, ledger):
    arr = ",".join(f"'{f}'" for f in FIELDS)
    pats = "".join(f"\n    IF v_vals ? '{k}' AND v_vals->>'{k}' IS NOT NULL AND v_vals->>'{k}' !~ '{p}' THEN RAISE EXCEPTION 'FISCAL_INVALID_FORMAT:{k}' USING ERRCODE='22023'; END IF;"
                   for k, p in PATTERNS.items())
    upd = ", ".join(f"{f} = CASE WHEN v_vals ? '{f}' THEN v_vals->>'{f}' ELSE p.{f} END" for f in FIELDS)
    ins_cols = ", ".join(FIELDS); ins_vals = ", ".join(f"v_vals->>'{f}'" for f in FIELDS)
    w(f"""-- 11b.1 perfis fiscais: policies globais (Superadmin) substituídas por tenant; registro no ledger
INSERT INTO {ledger}(step, detail)
  SELECT 'fiscal_policies_replaced', coalesce(jsonb_agg(jsonb_build_object('name', policyname, 'cmd', cmd, 'qual', qual, 'check', with_check)), '[]')
    FROM pg_policies WHERE schemaname='public' AND tablename='product_fiscal_profiles'
     AND policyname IN ('product_fiscal_profiles_read','product_fiscal_profiles_insert','product_fiscal_profiles_update');
DROP POLICY IF EXISTS product_fiscal_profiles_read ON public.product_fiscal_profiles;
DROP POLICY IF EXISTS product_fiscal_profiles_insert ON public.product_fiscal_profiles;
DROP POLICY IF EXISTS product_fiscal_profiles_update ON public.product_fiscal_profiles;
CREATE FUNCTION platform_private.tenant_fiscal_reader_org() RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $f$
DECLARE v_uid uuid := auth.uid(); v_org uuid;
BEGIN
  IF v_uid IS NULL THEN RETURN NULL; END IF;
  v_org := platform_private.catalog_tenant_actor('read_catalog');
  IF v_org IS NULL THEN RETURN NULL; END IF;
  IF NOT (platform_private.has_role(v_uid,'administrador') OR platform_private.has_role(v_uid,'gestor')
          OR platform_private.has_role(v_uid,'financeiro')) THEN RETURN NULL; END IF;
  RETURN v_org;   -- sem ramo Superadmin: catálogo exclusivo não tem leitor global
EXCEPTION WHEN invalid_text_representation OR invalid_parameter_value THEN RETURN NULL;
END $f$;
REVOKE ALL ON FUNCTION platform_private.tenant_fiscal_reader_org() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION platform_private.tenant_fiscal_reader_org() TO authenticated;
CREATE POLICY tenant_fiscal_role_read ON public.product_fiscal_profiles AS RESTRICTIVE FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.produtos z WHERE z.id = product_fiscal_profiles.product_id
                 AND z.owner_organization_id = platform_private.tenant_fiscal_reader_org()));
CREATE POLICY tenant_fiscal_no_direct_insert ON public.product_fiscal_profiles AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY tenant_fiscal_no_direct_update ON public.product_fiscal_profiles AS RESTRICTIVE FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.product_fiscal_profiles FROM anon, authenticated;
{ACTOR_FN}
-- 11b.2 gatilho reescrito (mesmo nome, mesmo gatilho a10): dono do produto, sem Superadmin, sem aprovação fabricada
CREATE OR REPLACE FUNCTION platform_private.global_product_fiscal_before_write()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE v_owner uuid; v_org uuid;
BEGIN
  SELECT p.owner_organization_id INTO v_owner FROM public.produtos p WHERE p.id = NEW.product_id;
  v_org := platform_private.tenant_fiscal_mutate_org();
  IF v_owner IS NULL OR v_org IS NULL OR v_org <> v_owner THEN RAISE EXCEPTION 'FISCAL_FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF NEW.profile_status IS DISTINCT FROM 'DRAFT' AND NEW.profile_status IS DISTINCT FROM 'BLOCKED' THEN
    RAISE EXCEPTION 'FISCAL_VALIDATION_NOT_ALLOWED' USING ERRCODE='42501'; END IF;
  IF TG_OP='UPDATE' THEN
    IF OLD.is_active IS NOT TRUE THEN RAISE EXCEPTION 'FISCAL_HISTORY_IMMUTABLE' USING ERRCODE='42501'; END IF;
    IF NEW.product_id IS DISTINCT FROM OLD.product_id OR NEW.id IS DISTINCT FROM OLD.id THEN RAISE EXCEPTION 'FISCAL_IDENTITY_IMMUTABLE'; END IF;
    IF NEW.accounting_validated_at IS DISTINCT FROM OLD.accounting_validated_at OR NEW.accounting_validated_by IS DISTINCT FROM OLD.accounting_validated_by
       OR NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'FISCAL_VALIDATION_NOT_ALLOWED' USING ERRCODE='42501'; END IF;
    NEW.updated_at := greatest(clock_timestamp(), OLD.updated_at + interval '1 microsecond');   -- token CAS do servidor
  ELSE
    IF NEW.accounting_validated_at IS NOT NULL OR NEW.accounting_validated_by IS NOT NULL THEN
      RAISE EXCEPTION 'FISCAL_VALIDATION_NOT_ALLOWED' USING ERRCODE='42501'; END IF;
    NEW.updated_at := clock_timestamp();
  END IF;
  RETURN NEW;
END $function$;
-- 11b.3 recibos idempotentes (privados)
CREATE TABLE {RECEIPTS}(
  idempotency_key uuid PRIMARY KEY, actor_id uuid NOT NULL, organization_id uuid NOT NULL REFERENCES public.organizations(id),
  product_id uuid NOT NULL, request_md5 text NOT NULL, profile_id uuid NOT NULL, profile_status text NOT NULL,
  updated_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp());
REVOKE ALL ON {RECEIPTS} FROM PUBLIC, anon, authenticated, service_role;
-- 11b.4 writer canônico (contrato do consumidor ownedProductFiscal.ts)
CREATE FUNCTION public.tenant_owned_product_fiscal_save(p_product_id uuid, p_expected_updated_at timestamptz, p_values jsonb,
  p_reason text, p_idempotency_key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $f$
DECLARE v_uid uuid := auth.uid(); v_org uuid; v_org2 uuid; v_owner uuid; v_md5 text; v_vals jsonb := '{{}}'::jsonb; k text; v jsonb;
        v_rc {RECEIPTS}%ROWTYPE; p public.product_fiscal_profiles%ROWTYPE; n public.product_fiscal_profiles%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'FISCAL_FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF p_product_id IS NULL OR p_idempotency_key IS NULL OR p_values IS NULL OR jsonb_typeof(p_values) <> 'object' THEN
    RAISE EXCEPTION 'FISCAL_INVALID_INPUT' USING ERRCODE='22023'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 10 AND 500 THEN RAISE EXCEPTION 'FISCAL_INVALID_REASON' USING ERRCODE='22023'; END IF;
  FOR k, v IN SELECT * FROM jsonb_each(p_values) LOOP
    IF NOT (k = ANY(ARRAY[{arr}])) THEN RAISE EXCEPTION 'FISCAL_FIELD_NOT_ALLOWED:%', k USING ERRCODE='22023'; END IF;
    IF jsonb_typeof(v) NOT IN ('string','null') THEN RAISE EXCEPTION 'FISCAL_INVALID_VALUE:%', k USING ERRCODE='22023'; END IF;
    IF jsonb_typeof(v) = 'string' AND length(v #>> '{{}}') > 2000 THEN RAISE EXCEPTION 'FISCAL_INVALID_VALUE:%', k USING ERRCODE='22023'; END IF;
    v_vals := v_vals || jsonb_build_object(k, nullif(btrim(v #>> '{{}}'), ''));
  END LOOP;{pats}
  v_org := platform_private.tenant_fiscal_mutate_org();
  IF v_org IS NULL THEN RAISE EXCEPTION 'FISCAL_FORBIDDEN' USING ERRCODE='42501'; END IF;
  v_md5 := md5(jsonb_build_object('p', p_product_id, 'e', p_expected_updated_at, 'v', v_vals, 'r', btrim(p_reason))::text);
  SELECT z.owner_organization_id INTO v_owner FROM public.produtos z WHERE z.id = p_product_id FOR UPDATE;
  IF NOT FOUND OR v_owner IS DISTINCT FROM v_org THEN RAISE EXCEPTION 'FISCAL_FORBIDDEN' USING ERRCODE='42501'; END IF;  -- sem oráculo de existência
  v_org2 := platform_private.tenant_fiscal_mutate_org();                                                           -- reautoriza após lock
  IF v_org2 IS DISTINCT FROM v_org THEN RAISE EXCEPTION 'FISCAL_FORBIDDEN' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_rc FROM {RECEIPTS} WHERE idempotency_key = p_idempotency_key FOR UPDATE;
  IF FOUND THEN
    IF v_rc.actor_id <> v_uid OR v_rc.organization_id <> v_org OR v_rc.product_id <> p_product_id OR v_rc.request_md5 <> v_md5 THEN
      RAISE EXCEPTION 'FISCAL_IDEMPOTENCY_CONFLICT' USING ERRCODE='PT409'; END IF;
    RETURN jsonb_build_object('success', true, 'product_id', v_rc.product_id, 'profile_id', v_rc.profile_id, 'organization_id', v_rc.organization_id,
      'profile_status', v_rc.profile_status, 'updated_at', v_rc.updated_at::text, 'idempotency_key', p_idempotency_key, 'idempotent', true);
  END IF;
  SELECT * INTO p FROM public.product_fiscal_profiles x WHERE x.product_id = p_product_id AND x.is_active FOR UPDATE;
  IF FOUND THEN
    IF p_expected_updated_at IS NULL OR p.updated_at <> p_expected_updated_at THEN RAISE EXCEPTION 'FISCAL_CAS_CONFLICT' USING ERRCODE='PT409'; END IF;
    UPDATE public.product_fiscal_profiles AS x SET {upd.replace('p.', 'x.')}, profile_status = 'DRAFT', updated_by = v_uid
     WHERE x.id = p.id RETURNING x.* INTO n;
  ELSE
    IF p_expected_updated_at IS NOT NULL THEN RAISE EXCEPTION 'FISCAL_CAS_CONFLICT' USING ERRCODE='PT409'; END IF;
    INSERT INTO public.product_fiscal_profiles(product_id, is_active, profile_status, created_by, updated_by, {ins_cols})
      VALUES (p_product_id, true, 'DRAFT', v_uid, v_uid, {ins_vals}) RETURNING * INTO n;
  END IF;
  INSERT INTO {RECEIPTS}(idempotency_key, actor_id, organization_id, product_id, request_md5, profile_id, profile_status, updated_at)
    VALUES (p_idempotency_key, v_uid, v_org, p_product_id, v_md5, n.id, n.profile_status, n.updated_at);
  RETURN jsonb_build_object('success', true, 'product_id', p_product_id, 'profile_id', n.id, 'organization_id', v_org,
    'profile_status', n.profile_status, 'updated_at', n.updated_at::text, 'idempotency_key', p_idempotency_key, 'idempotent', false);
END $f$;
REVOKE ALL ON FUNCTION public.tenant_owned_product_fiscal_save(uuid,timestamptz,jsonb,text,uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tenant_owned_product_fiscal_save(uuid,timestamptz,jsonb,text,uuid) TO authenticated;
-- v2.11: único consumidor de escrita (useSaveProductFiscalProfile) migrado para o RPC canônico; escrita direta de cliente fechada
REVOKE INSERT, UPDATE, DELETE ON public.product_fiscal_profiles FROM PUBLIC, anon, authenticated;""")
