-- fiscal-tenant-catalog-reconciled-20261101 — CANDIDATO INATIVO. NÃO APLICAR.
-- Reconciliação do pacote original 80c64c38 (scripts/fiscal-tenant-catalog-20261101, NÃO instalado)
-- com o estado aplicado capturado READ ONLY em 01/11/2026 (a00/a10, policies, ACL e default ACL reais).
-- Gerado por build.py a partir de install.template.sql + capturas; não editar install.sql.review à mão.
-- Pré-requisito: fundação rbac-audit 12 arquivos (manifesto ownership-ordered-manifest.json) instalada
-- e re-capturada; fase 07 separada não é exigida nem implicada.
BEGIN;
SET LOCAL lock_timeout = '3s';

-- ---------------------------------------------------------------- PRE (fail-closed, pins completos)
DO $pre$ BEGIN
  IF current_setting('request.jwt.claims', true) IS NOT NULL AND current_setting('request.jwt.claims', true) <> '' THEN
    RAISE EXCEPTION 'PRE: must run as owner, never under a client JWT'; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
       AND table_name='produtos' AND column_name='owner_organization_id') THEN
    RAISE EXCEPTION 'PRE: catalog ownership not installed (produtos.owner_organization_id)'; END IF;
  IF to_regprocedure('platform_private.catalog_ownership_enabled()') IS NULL
     OR to_regprocedure('platform_private.catalog_reader_org()') IS NULL
     OR to_regprocedure('platform_private.h15_actor_organization()') IS NULL
     OR to_regprocedure('platform_private.has_role(uuid,public.app_role)') IS NULL
     OR to_regprocedure('platform_private.platform_actor_access_ready(uuid)') IS NULL
     OR to_regprocedure('public.is_platform_superadmin(uuid)') IS NULL
     OR to_regclass('cf_user_guards_v1.state') IS NULL THEN
    RAISE EXCEPTION 'PRE: required helpers missing'; END IF;
  IF to_regclass('platform_private.owned_fiscal_gate') IS NOT NULL
     OR to_regclass('platform_private.owned_fiscal_write_permits') IS NOT NULL THEN
    RAISE EXCEPTION 'PRE: package already installed (rerun refused)'; END IF;
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'PRE: install must run in READ COMMITTED'; END IF;
END $pre$;

-- @@PINS@@

-- ---------------------------------------------------------------- gate próprio (desligado)
CREATE TABLE platform_private.owned_fiscal_gate (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  enabled boolean NOT NULL DEFAULT false
);
INSERT INTO platform_private.owned_fiscal_gate VALUES (true, false);
REVOKE ALL ON platform_private.owned_fiscal_gate FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION platform_private.owned_fiscal_enabled() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT platform_private.catalog_ownership_enabled()
     AND COALESCE((SELECT enabled FROM platform_private.owned_fiscal_gate WHERE singleton), false) $$;

-- Ator de empresa: empresa ativa do ator real (h15) com papel exigido; nunca SA; nunca GUC/payload.
CREATE FUNCTION platform_private.owned_fiscal_actor(p_write boolean) RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_uid uuid := auth.uid(); v_org uuid;
BEGIN
  IF v_uid IS NULL OR NOT platform_private.owned_fiscal_enabled()
     OR public.is_platform_superadmin(v_uid)
     OR NOT platform_private.platform_actor_access_ready(v_uid) THEN
    RAISE EXCEPTION 'owned_fiscal_forbidden' USING ERRCODE='42501'; END IF;
  v_org := platform_private.h15_actor_organization();
  IF v_org IS NULL THEN RAISE EXCEPTION 'owned_fiscal_forbidden' USING ERRCODE='42501'; END IF;
  IF NOT (platform_private.has_role(v_uid,'administrador') OR platform_private.has_role(v_uid,'financeiro')
          OR (NOT p_write AND platform_private.has_role(v_uid,'gestor'))) THEN
    RAISE EXCEPTION 'owned_fiscal_forbidden' USING ERRCODE='42501'; END IF;
  RETURN v_org;
END $$;

-- ---------------------------------------------------------------- recibos e permissões privadas
CREATE TABLE platform_private.owned_fiscal_receipts (
  idempotency_key uuid PRIMARY KEY,
  actor_id uuid NOT NULL, organization_id uuid NOT NULL, product_id uuid NOT NULL,
  request jsonb NOT NULL, receipt jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON platform_private.owned_fiscal_receipts FROM PUBLIC, anon, authenticated, service_role;

-- Prova privada one-shot: txid + ator + empresa + produto + operação. Só o writer DEFINER grava;
-- o gatilho a10 consome (DELETE ... RETURNING) e reautoriza. Nenhuma GUC participa.
CREATE TABLE platform_private.owned_fiscal_write_permits (
  txid bigint NOT NULL, product_id uuid NOT NULL,
  actor_id uuid NOT NULL, organization_id uuid NOT NULL,
  op text NOT NULL CHECK (op IN ('INSERT','UPDATE')),
  PRIMARY KEY (txid, product_id)
);
REVOKE ALL ON platform_private.owned_fiscal_write_permits FROM PUBLIC, anon, authenticated, service_role;

-- ---------------------------------------------------------------- composição com a10 (guard global preservado)
-- Ramo global (produto sem dono) = corpo capturado, inalterado. Ramo próprio exige a prova privada
-- e reautoriza o ator NESTE ponto (depois de a00 e de todos os locks do writer).
CREATE OR REPLACE FUNCTION platform_private.global_product_fiscal_before_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_owner uuid; v_permit platform_private.owned_fiscal_write_permits%ROWTYPE;
BEGIN
 SELECT p.owner_organization_id INTO v_owner FROM public.produtos p WHERE p.id = NEW.product_id;
 IF TG_OP='UPDATE' AND v_owner IS NULL THEN
  SELECT p.owner_organization_id INTO v_owner FROM public.produtos p WHERE p.id = OLD.product_id;
 END IF;
 IF v_owner IS NULL THEN
  IF NOT platform_private.global_product_fiscal_write_ready() THEN RAISE EXCEPTION 'FISCAL_FORBIDDEN' USING ERRCODE='42501'; END IF;
 ELSE
  DELETE FROM platform_private.owned_fiscal_write_permits w
   WHERE w.txid = pg_catalog.txid_current() AND w.product_id = NEW.product_id
     AND w.actor_id = auth.uid() AND w.organization_id = v_owner AND w.op = TG_OP
  RETURNING * INTO v_permit;
  IF NOT FOUND OR platform_private.owned_fiscal_actor(true) IS DISTINCT FROM v_owner THEN
   RAISE EXCEPTION 'FISCAL_FORBIDDEN' USING ERRCODE='42501'; END IF;
 END IF;
 IF TG_OP='UPDATE' THEN
  IF OLD.is_active IS NOT TRUE THEN RAISE EXCEPTION 'FISCAL_HISTORY_IMMUTABLE' USING ERRCODE='42501'; END IF;
  IF NEW.product_id IS DISTINCT FROM OLD.product_id OR NEW.id IS DISTINCT FROM OLD.id THEN RAISE EXCEPTION 'FISCAL_IDENTITY_IMMUTABLE'; END IF;
  -- Server-owned CAS token for ALL direct editor and IBS/CBS updates.
  -- Strictly newer even inside one transaction; caller timestamps are ignored.
  -- The existing AFTER fiscal audit observes this token in the same transaction.
  NEW.updated_at:=greatest(clock_timestamp(),OLD.updated_at+interval '1 microsecond');
 ELSE NEW.updated_at:=clock_timestamp(); END IF;
 RETURN NEW;
END $function$;

-- ---------------------------------------------------------------- RLS restritiva (do pacote original)
CREATE POLICY product_fiscal_profiles_owner_read ON public.product_fiscal_profiles AS RESTRICTIVE
  FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.produtos p WHERE p.id=product_id
    AND (p.owner_organization_id IS NULL OR p.owner_organization_id = platform_private.catalog_reader_org())));
CREATE POLICY product_fiscal_profiles_global_insert ON public.product_fiscal_profiles AS RESTRICTIVE
  FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.produtos p WHERE p.id=product_id AND p.owner_organization_id IS NULL));
CREATE POLICY product_fiscal_profiles_global_update ON public.product_fiscal_profiles AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.produtos p WHERE p.id=product_id AND p.owner_organization_id IS NULL))
  WITH CHECK (EXISTS (SELECT 1 FROM public.produtos p WHERE p.id=product_id AND p.owner_organization_id IS NULL));

-- ---------------------------------------------------------------- validação (18 campos; sem IBS/CBS)
CREATE FUNCTION platform_private.owned_fiscal_validate(p jsonb) RETURNS void
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE k text;
  v_allowed constant text[] := ARRAY['ncm','cest','cfop_in_state','cfop_interstate','origin_code','icms_cst','icms_csosn',
    'ipi_cst','pis_cst','cofins_cst','commercial_unit','taxable_unit','gtin','taxable_gtin','tax_benefit_code',
    'fiscal_description','accounting_notes'];
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'object' THEN RAISE EXCEPTION 'owned_fiscal_invalid' USING ERRCODE='22023'; END IF;
  FOR k IN SELECT jsonb_object_keys(p) LOOP
    IF NOT k = ANY(v_allowed) OR jsonb_typeof(p->k) NOT IN ('string','null')
       OR char_length(p->>k) > 2000 THEN
      RAISE EXCEPTION 'owned_fiscal_invalid' USING ERRCODE='22023'; END IF;
  END LOOP;
  IF (p->>'ncm') IS NOT NULL AND (p->>'ncm') !~ '^[0-9]{8}$'
     OR (p->>'cest') IS NOT NULL AND (p->>'cest') !~ '^[0-9]{7}$'
     OR (p->>'cfop_in_state') IS NOT NULL AND (p->>'cfop_in_state') !~ '^[1-7][0-9]{3}$'
     OR (p->>'cfop_interstate') IS NOT NULL AND (p->>'cfop_interstate') !~ '^[1-7][0-9]{3}$'
     OR (p->>'origin_code') IS NOT NULL AND (p->>'origin_code') !~ '^[0-8]$'
     OR (p->>'gtin') IS NOT NULL AND (p->>'gtin') !~ '^([0-9]{8}|[0-9]{12,14}|SEM GTIN)$'
     OR (p->>'taxable_gtin') IS NOT NULL AND (p->>'taxable_gtin') !~ '^([0-9]{8}|[0-9]{12,14}|SEM GTIN)$' THEN
    RAISE EXCEPTION 'owned_fiscal_invalid' USING ERRCODE='22023'; END IF;
END $$;

-- ---------------------------------------------------------------- writer canônico
-- Ordem de locks: chave → cf_user_guards_v1.state (mesmo singleton de a00) → produto FOR SHARE →
-- produto advisory → perfil FOR UPDATE → profile do ator FOR SHARE. Reautoriza após CADA espera.
CREATE FUNCTION public.tenant_owned_product_fiscal_save(p_product_id uuid, p_expected_updated_at timestamptz,
  p_values jsonb, p_reason text, p_idempotency_key uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_uid uuid := auth.uid(); v_org uuid; v_owner uuid; v_prof public.product_fiscal_profiles%ROWTYPE;
  v_req jsonb; v_old platform_private.owned_fiscal_receipts%ROWTYPE; v_receipt jsonb; v_found boolean;
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    -- snapshot de transação não enxergaria revogação concorrente
    RAISE EXCEPTION 'owned_fiscal_isolation_unsupported' USING ERRCODE='42501'; END IF;
  v_org := platform_private.owned_fiscal_actor(true);
  IF p_product_id IS NULL OR p_idempotency_key IS NULL OR p_reason IS NULL
     OR char_length(btrim(p_reason)) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'owned_fiscal_invalid' USING ERRCODE='22023'; END IF;
  PERFORM platform_private.owned_fiscal_validate(p_values);
  v_req := jsonb_build_object('product_id',p_product_id,'expected',p_expected_updated_at,'values',p_values,'reason',btrim(p_reason));

  PERFORM pg_advisory_xact_lock(hashtextextended('owned-fiscal:'||p_idempotency_key::text,0));
  IF platform_private.owned_fiscal_actor(true) IS DISTINCT FROM v_org THEN
    RAISE EXCEPTION 'owned_fiscal_forbidden' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_old FROM platform_private.owned_fiscal_receipts WHERE idempotency_key=p_idempotency_key;
  IF FOUND THEN
    IF v_old.actor_id<>v_uid OR v_old.organization_id<>v_org OR v_old.request IS DISTINCT FROM v_req THEN
      RAISE EXCEPTION 'owned_fiscal_key_conflict' USING ERRCODE='PT409'; END IF;
    RETURN v_old.receipt || '{"idempotent":true}'::jsonb;
  END IF;

  PERFORM 1 FROM cf_user_guards_v1.state WHERE singleton FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FISCAL_GATE_UNAVAILABLE' USING ERRCODE='PT503'; END IF;
  IF platform_private.owned_fiscal_actor(true) IS DISTINCT FROM v_org THEN
    RAISE EXCEPTION 'owned_fiscal_forbidden' USING ERRCODE='42501'; END IF;

  SELECT owner_organization_id INTO v_owner FROM public.produtos WHERE id=p_product_id FOR SHARE;
  IF NOT FOUND OR v_owner IS NULL OR v_owner<>v_org THEN
    RAISE EXCEPTION 'owned_fiscal_forbidden' USING ERRCODE='42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('owned-fiscal-product:'||p_product_id::text,0));
  IF platform_private.owned_fiscal_actor(true) IS DISTINCT FROM v_org THEN
    RAISE EXCEPTION 'owned_fiscal_forbidden' USING ERRCODE='42501'; END IF;

  SELECT * INTO v_prof FROM public.product_fiscal_profiles
   WHERE product_id=p_product_id AND is_active IS TRUE FOR UPDATE;
  v_found := FOUND;
  -- reautorização obrigatória depois da espera pelo lock do perfil (revisão independente)
  IF platform_private.owned_fiscal_actor(true) IS DISTINCT FROM v_org THEN
    RAISE EXCEPTION 'owned_fiscal_forbidden' USING ERRCODE='42501'; END IF;
  -- serializa com revogação de profile em andamento e reautoriza novamente
  PERFORM 1 FROM public.profiles WHERE user_id=v_uid FOR SHARE;
  IF platform_private.owned_fiscal_actor(true) IS DISTINCT FROM v_org THEN
    RAISE EXCEPTION 'owned_fiscal_forbidden' USING ERRCODE='42501'; END IF;

  IF v_found THEN
    IF p_expected_updated_at IS NULL OR v_prof.updated_at IS DISTINCT FROM p_expected_updated_at THEN
      RAISE EXCEPTION 'owned_fiscal_stale' USING ERRCODE='PT409'; END IF;
    INSERT INTO platform_private.owned_fiscal_write_permits VALUES (pg_catalog.txid_current(), p_product_id, v_uid, v_org, 'UPDATE');
    UPDATE public.product_fiscal_profiles SET
      ncm=p_values->>'ncm', cest=p_values->>'cest', cfop_in_state=p_values->>'cfop_in_state',
      cfop_interstate=p_values->>'cfop_interstate', origin_code=p_values->>'origin_code',
      icms_cst=p_values->>'icms_cst', icms_csosn=p_values->>'icms_csosn', ipi_cst=p_values->>'ipi_cst',
      pis_cst=p_values->>'pis_cst', cofins_cst=p_values->>'cofins_cst', commercial_unit=p_values->>'commercial_unit',
      taxable_unit=p_values->>'taxable_unit', gtin=p_values->>'gtin', taxable_gtin=p_values->>'taxable_gtin',
      tax_benefit_code=p_values->>'tax_benefit_code', fiscal_description=p_values->>'fiscal_description',
      accounting_notes=p_values->>'accounting_notes',
      profile_status=CASE WHEN v_prof.profile_status='BLOCKED' THEN 'BLOCKED' ELSE 'DRAFT' END,
      accounting_validated_at=NULL, accounting_validated_by=NULL, updated_by=v_uid
    WHERE id=v_prof.id RETURNING * INTO v_prof;
    IF NOT FOUND THEN RAISE EXCEPTION 'owned_fiscal_stale' USING ERRCODE='PT409'; END IF;
  ELSE
    IF p_expected_updated_at IS NOT NULL THEN
      RAISE EXCEPTION 'owned_fiscal_stale' USING ERRCODE='PT409'; END IF;
    INSERT INTO platform_private.owned_fiscal_write_permits VALUES (pg_catalog.txid_current(), p_product_id, v_uid, v_org, 'INSERT');
    INSERT INTO public.product_fiscal_profiles (product_id,is_active,profile_status,ncm,cest,cfop_in_state,cfop_interstate,
      origin_code,icms_cst,icms_csosn,ipi_cst,pis_cst,cofins_cst,commercial_unit,taxable_unit,gtin,taxable_gtin,
      tax_benefit_code,fiscal_description,accounting_notes,created_by,updated_by)
    VALUES (p_product_id,true,'DRAFT',p_values->>'ncm',p_values->>'cest',p_values->>'cfop_in_state',p_values->>'cfop_interstate',
      p_values->>'origin_code',p_values->>'icms_cst',p_values->>'icms_csosn',p_values->>'ipi_cst',p_values->>'pis_cst',
      p_values->>'cofins_cst',p_values->>'commercial_unit',p_values->>'taxable_unit',p_values->>'gtin',p_values->>'taxable_gtin',
      p_values->>'tax_benefit_code',p_values->>'fiscal_description',p_values->>'accounting_notes',v_uid,v_uid)
    RETURNING * INTO v_prof;
  END IF;
  IF EXISTS (SELECT 1 FROM platform_private.owned_fiscal_write_permits WHERE txid=pg_catalog.txid_current()) THEN
    RAISE EXCEPTION 'owned_fiscal_permit_not_consumed' USING ERRCODE='42501'; END IF;

  v_receipt := jsonb_build_object('success',true,'product_id',p_product_id,'profile_id',v_prof.id,
    'organization_id',v_org,'profile_status',v_prof.profile_status,'updated_at',v_prof.updated_at,
    'idempotency_key',p_idempotency_key,'idempotent',false);
  INSERT INTO platform_private.owned_fiscal_receipts VALUES (p_idempotency_key,v_uid,v_org,p_product_id,v_req,v_receipt,now());
  RETURN v_receipt;
END $$;

-- ---------------------------------------------------------------- leitor da empresa
CREATE FUNCTION public.tenant_owned_product_fiscal_list(p_limit integer, p_offset integer) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_org uuid;
BEGIN
  v_org := platform_private.owned_fiscal_actor(false);
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 OR p_offset IS NULL OR p_offset < 0 THEN
    RAISE EXCEPTION 'owned_fiscal_invalid' USING ERRCODE='22023'; END IF;
  RETURN jsonb_build_object('organization_id',v_org,
    'total',(SELECT count(*) FROM public.produtos WHERE owner_organization_id=v_org),
    'items',COALESCE((SELECT jsonb_agg(r ORDER BY r->>'nome', r->>'product_id') FROM (
      SELECT jsonb_build_object('product_id',p.id,'nome',p.nome,'codigo',p.codigo,'familia',p.familia_catalogo,
        'profile', (SELECT to_jsonb(f) - ARRAY['created_by','updated_by','accounting_validated_by']
                      FROM public.product_fiscal_profiles f WHERE f.product_id=p.id AND f.is_active IS TRUE)) r
      FROM public.produtos p WHERE p.owner_organization_id=v_org
      ORDER BY p.nome, p.id LIMIT p_limit OFFSET p_offset) s),'[]'::jsonb));
END $$;

-- ---------------------------------------------------------------- ACL explícita (default ACL real concede a anon/authenticated/service_role)
DO $acl$ DECLARE s text; BEGIN
  FOREACH s IN ARRAY ARRAY[
    'platform_private.owned_fiscal_enabled()','platform_private.owned_fiscal_actor(boolean)',
    'platform_private.owned_fiscal_validate(jsonb)',
    'public.tenant_owned_product_fiscal_save(uuid,timestamp with time zone,jsonb,text,uuid)',
    'public.tenant_owned_product_fiscal_list(integer,integer)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role', s);
  END LOOP;
END $acl$;
-- GRANT EXECUTE a authenticated: SOMENTE em etapa separada autorizada, após POST e prova JWT real.

-- ---------------------------------------------------------------- POST verificável
DO $post$ DECLARE r record; BEGIN
  FOR r IN SELECT p.oid::regprocedure::text AS sig, p.proacl FROM pg_proc p
     WHERE p.oid IN ('platform_private.owned_fiscal_enabled()'::regprocedure,'platform_private.owned_fiscal_actor(boolean)'::regprocedure,
       'platform_private.owned_fiscal_validate(jsonb)'::regprocedure,
       'public.tenant_owned_product_fiscal_save(uuid,timestamp with time zone,jsonb,text,uuid)'::regprocedure,
       'public.tenant_owned_product_fiscal_list(integer,integer)'::regprocedure) LOOP
    IF has_function_privilege('anon', r.sig, 'EXECUTE') OR has_function_privilege('authenticated', r.sig, 'EXECUTE')
       OR has_function_privilege('service_role', r.sig, 'EXECUTE')
       OR r.proacl IS NULL OR cardinality(r.proacl) <> 1 THEN
      RAISE EXCEPTION 'POST: ACL not closed for %: %', r.sig, r.proacl; END IF;
  END LOOP;
  IF (SELECT array_agg(a::text) FROM pg_proc p, unnest(p.proacl) a
       WHERE p.oid='platform_private.global_product_fiscal_before_write()'::regprocedure) IS DISTINCT FROM
     (SELECT array_agg(a::text) FROM unnest(ARRAY[@@A10_ACL@@]) a) THEN
    RAISE EXCEPTION 'POST: a10 ACL changed'; END IF;
  IF has_table_privilege('authenticated','platform_private.owned_fiscal_write_permits','INSERT')
     OR has_table_privilege('service_role','platform_private.owned_fiscal_write_permits','INSERT') THEN
    RAISE EXCEPTION 'POST: permit table writable by client'; END IF;
  IF (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='product_fiscal_profiles') <> 7 THEN
    RAISE EXCEPTION 'POST: policy count'; END IF;
  IF (SELECT count(*) FROM pg_trigger WHERE tgrelid='public.product_fiscal_profiles'::regclass AND NOT tgisinternal AND tgenabled='O') <> 3 THEN
    RAISE EXCEPTION 'POST: trigger set changed'; END IF;
  IF (SELECT enabled FROM platform_private.owned_fiscal_gate WHERE singleton) IS NOT FALSE THEN
    RAISE EXCEPTION 'POST: gate must stay disabled'; END IF;
END $post$;

COMMIT;
