-- =====================================================================================
-- CANDIDATO — NÃO APLICAR sem revisão independente. Canônico obrigatório: swzpzcwiasxmjutrmvkm.
-- Fase 1 da personalização por empresa: OCULTAR/EXIBIR itens GLOBAIS (produto, microrganismo, cultura)
-- nas NOVAS seleções e na gestão de uma empresa.
--
--  * Visibilidade é PREFERÊNCIA, não sigilo nem exclusão: não altera RLS SELECT, ativo, b2b_enabled,
--    família, fórmulas, composição, apresentações ou preços globais. Históricos/snapshots/itens vinculados
--    continuam lidos pelas consultas atuais.
--  * Exibir NÃO reativa item global inativo (rejeitado); seletor nunca devolve inativo.
--  * Empresa derivada no servidor (h15_actor_organization + organização ativa/status 'ativa'); RPCs NÃO
--    aceitam parâmetro de empresa. Platform Superadmin é negado (fora da operação de empresa).
--  * Mutação: administrador/gestor + entitlement existente `catalogo_precos`. Leitura de gestão: interseção com
--    permissões atuais + `catalogo_precos`. Seletor de cultura da visita: ator de empresa SEM gate comercial
--    (preserva o acesso efetivo atual da visita). IDs ocultos: ator de empresa, só UUIDs.
--  * CAS por `version` (inclusive primeira gravação: expected_version=0), locks transacionais em ordem fixa
--    ator+empresa+chave e depois empresa+item, idempotência por ator+empresa+chave com hash do payload, motivo obrigatório,
--    ledger imutável.
--  * Sem DML direto: tabelas com RLS habilitada, sem policies e sem grants a anon/authenticated.
--  * SEM ownership, SEM CRUD próprio, SEM backfill, SEM fixture persistente.
-- Rollback (preserva preferências e ledger; NUNCA reabre grants globais): rollback-tenant-catalog-visibility.sql
-- =====================================================================================

-- ---------------------------------------------------------------- preflight fail-closed
DO $$
BEGIN
  IF current_setting('request.jwt.claims', true) IS NOT NULL AND current_setting('request.jwt.claims', true) <> '' THEN
    RAISE EXCEPTION 'tenant_visibility_preflight_must_run_as_owner'; END IF;
  IF to_regprocedure('platform_private.h15_actor_organization()') IS NULL
    OR to_regprocedure('platform_private.platform_actor_access_ready(uuid)') IS NULL
    OR to_regprocedure('platform_private.has_role(uuid,app_role)') IS NULL
    OR to_regprocedure('public.is_platform_superadmin(uuid)') IS NULL
    OR to_regprocedure('public._saas_user_has_feature(uuid,text)') IS NULL
    OR to_regprocedure('public.can_view_catalog_internal(uuid)') IS NULL THEN
    RAISE EXCEPTION 'tenant_visibility_preflight_helpers_missing'; END IF;
  IF to_regclass('public.catalog_tenant_visibility') IS NOT NULL
    OR to_regclass('public.catalog_tenant_visibility_ledger') IS NOT NULL THEN
    RAISE EXCEPTION 'tenant_visibility_preflight_already_applied'; END IF;
  -- Contenção global preservada: authenticated só pode ter SELECT nas cinco tabelas canônicas.
  IF EXISTS (SELECT 1 FROM information_schema.role_table_grants
              WHERE table_schema='public' AND grantee IN ('authenticated','anon')
                AND table_name IN ('produtos','microrganismos','culturas','formulacoes','catalogo_volumes')
                AND privilege_type <> 'SELECT') THEN
    RAISE EXCEPTION 'tenant_visibility_preflight_global_write_grant_present'; END IF;
END;
$$;

-- ---------------------------------------------------------------- tabelas aditivas
CREATE TABLE public.catalog_tenant_visibility (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  entity_type text NOT NULL CHECK (entity_type IN ('produto','microrganismo','cultura')),
  produto_id uuid NULL REFERENCES public.produtos(id) ON DELETE RESTRICT,
  microrganismo_id uuid NULL REFERENCES public.microrganismos(id) ON DELETE RESTRICT,
  cultura_id uuid NULL REFERENCES public.culturas(id) ON DELETE RESTRICT,
  hidden boolean NOT NULL,
  version integer NOT NULL CHECK (version >= 1),
  reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 5 AND 500),
  updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Exatamente uma FK real, coerente com entity_type (IS TRUE fecha brecha de NULL).
  CONSTRAINT ctv_entity_check CHECK ((
    (entity_type='produto' AND produto_id IS NOT NULL AND microrganismo_id IS NULL AND cultura_id IS NULL)
    OR (entity_type='microrganismo' AND microrganismo_id IS NOT NULL AND produto_id IS NULL AND cultura_id IS NULL)
    OR (entity_type='cultura' AND cultura_id IS NOT NULL AND produto_id IS NULL AND microrganismo_id IS NULL)) IS TRUE)
);
CREATE UNIQUE INDEX ctv_org_produto_uidx ON public.catalog_tenant_visibility (organization_id, produto_id) WHERE produto_id IS NOT NULL;
CREATE UNIQUE INDEX ctv_org_micro_uidx ON public.catalog_tenant_visibility (organization_id, microrganismo_id) WHERE microrganismo_id IS NOT NULL;
CREATE UNIQUE INDEX ctv_org_cultura_uidx ON public.catalog_tenant_visibility (organization_id, cultura_id) WHERE cultura_id IS NOT NULL;
CREATE INDEX ctv_org_hidden_idx ON public.catalog_tenant_visibility (organization_id, entity_type) WHERE hidden;
COMMENT ON TABLE public.catalog_tenant_visibility IS 'Preferência por empresa para ocultar item GLOBAL nas novas seleções/gestão. Não é sigilo, exclusão nem altera ativo/B2B/preço; históricos permanecem legíveis.';

CREATE TABLE public.catalog_tenant_visibility_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  idempotency_key uuid NOT NULL,
  payload_hash text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  before_state jsonb NULL,
  after_state jsonb NOT NULL,
  reason text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ctvl_idem_unique UNIQUE (actor_id, organization_id, idempotency_key)
);
CREATE INDEX ctvl_org_entity_idx ON public.catalog_tenant_visibility_ledger (organization_id, entity_type, entity_id, created_at DESC);

REVOKE ALL ON public.catalog_tenant_visibility, public.catalog_tenant_visibility_ledger FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.catalog_tenant_visibility, public.catalog_tenant_visibility_ledger TO service_role;
ALTER TABLE public.catalog_tenant_visibility ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_tenant_visibility_ledger ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION platform_private.catalog_tenant_visibility_ledger_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'catalog_visibility_ledger_immutable' USING ERRCODE='42501'; END; $$;
REVOKE ALL ON FUNCTION platform_private.catalog_tenant_visibility_ledger_immutable() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER ctvl_immutable BEFORE UPDATE OR DELETE ON public.catalog_tenant_visibility_ledger
  FOR EACH ROW EXECUTE FUNCTION platform_private.catalog_tenant_visibility_ledger_immutable();
CREATE TRIGGER ctvl_no_truncate BEFORE TRUNCATE ON public.catalog_tenant_visibility_ledger
  FOR EACH STATEMENT EXECUTE FUNCTION platform_private.catalog_tenant_visibility_ledger_immutable();

-- ---------------------------------------------------------------- ator de empresa (privado)
-- p_mode:
--  'mutate'          admin/gestor + catalogo_precos
--  'read_catalog'    gestão produtos/micros: can_view_catalog_internal + catalogo_precos
--  'read_management' gestão de culturas (/base-tecnica): catalogo_precos
--  'read_selection_cultura' seletor de cultura da VISITA: ator de empresa ativo, SEM gate comercial
--                    (culturas já são legíveis por qualquer authenticated via RLS 'Portal: Ler culturas';
--                    aqui é mais estreito: exige empresa ativa e nega SA). Não lê produtos nem muta.
--  'read_prefs'      IDs ocultos da própria empresa (catálogos novos); só UUIDs, sem conteúdo técnico.
CREATE FUNCTION platform_private.catalog_tenant_actor(p_mode text) RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_claims jsonb := NULLIF(current_setting('request.jwt.claims', true), '')::jsonb;
  v_org uuid;
BEGIN
  IF v_uid IS NULL OR v_claims IS NULL OR v_claims->>'role' IS DISTINCT FROM 'authenticated'
     OR (v_claims->>'sub') IS DISTINCT FROM v_uid::text
     OR NULLIF(v_claims->>'exp','') IS NULL OR (v_claims->>'exp') !~ '^[0-9]{1,12}$'
     OR to_timestamp((v_claims->>'exp')::bigint) <= now()
     OR (NULLIF(v_claims->>'iat','') IS NOT NULL AND ((v_claims->>'iat') !~ '^[0-9]{1,12}$'
         OR to_timestamp((v_claims->>'iat')::bigint) > now() + interval '60 seconds')) THEN
    RAISE EXCEPTION 'catalog_visibility_auth_required' USING ERRCODE='42501';
  END IF;
  IF public.is_platform_superadmin(v_uid) THEN
    RAISE EXCEPTION 'catalog_visibility_platform_actor_denied' USING ERRCODE='42501';
  END IF;
  v_org := platform_private.h15_actor_organization();
  IF v_org IS NULL OR NOT EXISTS (SELECT 1 FROM public.organizations o WHERE o.id=v_org AND o.ativo IS TRUE AND o.status='ativa') THEN
    RAISE EXCEPTION 'catalog_visibility_tenant_unavailable' USING ERRCODE='42501';
  END IF;
  IF p_mode IN ('mutate','read_catalog','read_management') AND NOT public._saas_user_has_feature(v_uid, 'catalogo_precos') THEN
    RAISE EXCEPTION 'catalog_visibility_feature_unavailable' USING ERRCODE='42501';
  END IF;
  IF p_mode='mutate' THEN
    IF NOT (platform_private.has_role(v_uid,'administrador'::public.app_role) OR platform_private.has_role(v_uid,'gestor'::public.app_role)) THEN
      RAISE EXCEPTION 'catalog_visibility_role_denied' USING ERRCODE='42501'; END IF;
  ELSIF p_mode='read_catalog' THEN
    IF NOT public.can_view_catalog_internal(v_uid) THEN
      RAISE EXCEPTION 'catalog_visibility_role_denied' USING ERRCODE='42501'; END IF;
  ELSIF p_mode NOT IN ('read_management','read_selection_cultura','read_prefs') OR p_mode IS NULL THEN
    RAISE EXCEPTION 'catalog_visibility_mode_invalid' USING ERRCODE='22023';
  END IF;
  RETURN v_org;
END; $$;
REVOKE ALL ON FUNCTION platform_private.catalog_tenant_actor(text) FROM PUBLIC,anon,authenticated;

-- ---------------------------------------------------------------- núcleo de mutação (privado DEFINER)
CREATE FUNCTION platform_private.catalog_tenant_set_visibility_core(
  p_entity_type text, p_entity_id uuid, p_hidden boolean, p_expected_version integer, p_reason text, p_idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_org uuid;
  v_reason text := btrim(COALESCE(p_reason,''));
  v_hash text;
  v_prev public.catalog_tenant_visibility%ROWTYPE;
  v_ledger public.catalog_tenant_visibility_ledger%ROWTYPE;
  v_ativo boolean;
  v_new_version integer;
  v_result jsonb;
BEGIN
  v_org := platform_private.catalog_tenant_actor('mutate');
  IF p_entity_type IS NULL OR p_entity_type NOT IN ('produto','microrganismo','cultura') OR p_entity_id IS NULL
     OR p_hidden IS NULL OR p_idempotency_key IS NULL OR p_expected_version IS NULL OR p_expected_version < 0 THEN
    RAISE EXCEPTION 'catalog_visibility_invalid_payload' USING ERRCODE='22023'; END IF;
  IF char_length(v_reason) NOT BETWEEN 5 AND 500 THEN
    RAISE EXCEPTION 'catalog_visibility_reason_required' USING ERRCODE='22023'; END IF;
  v_hash := md5(concat_ws('|', p_entity_type, p_entity_id::text, p_hidden::text, p_expected_version::text, v_reason));

  -- Ordem fixa de locks: (1) ator+empresa+chave — serializa replay/conflito da MESMA chave mesmo em itens
  -- distintos; (2) empresa+item — serializa primeira gravação/CAS. Sempre nesta ordem (sem deadlock cruzado).
  PERFORM pg_advisory_xact_lock(hashtextextended(concat_ws(':','ctvk',v_uid::text,v_org::text,p_idempotency_key::text),0));
  PERFORM pg_advisory_xact_lock(hashtextextended(concat_ws(':','ctv',v_org::text,p_entity_type,p_entity_id::text),0));

  SELECT * INTO v_ledger FROM public.catalog_tenant_visibility_ledger
   WHERE actor_id=v_uid AND organization_id=v_org AND idempotency_key=p_idempotency_key;
  IF FOUND THEN
    IF v_ledger.payload_hash <> v_hash THEN
      RAISE EXCEPTION 'catalog_visibility_idempotency_conflict' USING ERRCODE='22023'; END IF;
    RETURN v_ledger.result || jsonb_build_object('replayed', true);
  END IF;

  -- Item global existente; inativo não pode ser exibido (preferência não reativa).
  IF p_entity_type='produto' THEN SELECT ativo INTO v_ativo FROM public.produtos WHERE id=p_entity_id;
  ELSIF p_entity_type='microrganismo' THEN SELECT ativo INTO v_ativo FROM public.microrganismos WHERE id=p_entity_id;
  ELSE SELECT ativo INTO v_ativo FROM public.culturas WHERE id=p_entity_id; END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'catalog_visibility_item_not_found' USING ERRCODE='P0002'; END IF;
  IF v_ativo IS NOT TRUE AND p_hidden IS FALSE THEN
    RAISE EXCEPTION 'catalog_visibility_item_inactive' USING ERRCODE='22023'; END IF;

  SELECT * INTO v_prev FROM public.catalog_tenant_visibility
   WHERE organization_id=v_org AND entity_type=p_entity_type
     AND COALESCE(produto_id,microrganismo_id,cultura_id)=p_entity_id FOR UPDATE;
  IF COALESCE(v_prev.version,0) <> p_expected_version THEN
    RAISE EXCEPTION 'catalog_visibility_version_conflict' USING ERRCODE='40001'; END IF;
  IF v_prev.id IS NOT NULL AND v_prev.hidden = p_hidden THEN
    RAISE EXCEPTION 'catalog_visibility_no_change' USING ERRCODE='22023'; END IF;
  IF v_prev.id IS NULL AND p_hidden IS FALSE THEN
    RAISE EXCEPTION 'catalog_visibility_no_change' USING ERRCODE='22023'; END IF;

  v_new_version := p_expected_version + 1;
  IF v_prev.id IS NULL THEN
    INSERT INTO public.catalog_tenant_visibility(organization_id,entity_type,produto_id,microrganismo_id,cultura_id,hidden,version,reason,updated_by)
    VALUES (v_org,p_entity_type,
      CASE WHEN p_entity_type='produto' THEN p_entity_id END,
      CASE WHEN p_entity_type='microrganismo' THEN p_entity_id END,
      CASE WHEN p_entity_type='cultura' THEN p_entity_id END,
      p_hidden,v_new_version,v_reason,v_uid);
  ELSE
    UPDATE public.catalog_tenant_visibility SET hidden=p_hidden, version=v_new_version, reason=v_reason,
      updated_by=v_uid, updated_at=now()
     WHERE id=v_prev.id AND version=p_expected_version;
    IF NOT FOUND THEN RAISE EXCEPTION 'catalog_visibility_version_conflict' USING ERRCODE='40001'; END IF;
  END IF;

  v_result := jsonb_build_object('entity_type',p_entity_type,'entity_id',p_entity_id,'hidden',p_hidden,
    'version',v_new_version,'replayed',false);
  INSERT INTO public.catalog_tenant_visibility_ledger(organization_id,actor_id,idempotency_key,payload_hash,entity_type,entity_id,
    before_state,after_state,reason,result)
  VALUES (v_org,v_uid,p_idempotency_key,v_hash,p_entity_type,p_entity_id,
    CASE WHEN v_prev.id IS NULL THEN NULL ELSE jsonb_build_object('hidden',v_prev.hidden,'version',v_prev.version) END,
    jsonb_build_object('hidden',p_hidden,'version',v_new_version),v_reason,v_result);
  RETURN v_result;
END; $$;
REVOKE ALL ON FUNCTION platform_private.catalog_tenant_set_visibility_core(text,uuid,boolean,integer,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION platform_private.catalog_tenant_set_visibility_core(text,uuid,boolean,integer,text,uuid) TO authenticated;

-- ---------------------------------------------------------------- núcleo de leitura da gestão (privado DEFINER)
-- Devolve somente preferências da empresa do ator para os IDs pedidos (máx. 500) — sobreposição à lista atual.
CREATE FUNCTION platform_private.catalog_tenant_read_visibility_core(p_entity_type text, p_ids uuid[])
RETURNS TABLE(entity_id uuid, hidden boolean, version integer, updated_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_org uuid;
BEGIN
  IF p_entity_type IS NULL OR p_entity_type NOT IN ('produto','microrganismo','cultura') THEN
    RAISE EXCEPTION 'catalog_visibility_invalid_payload' USING ERRCODE='22023'; END IF;
  v_org := platform_private.catalog_tenant_actor(CASE WHEN p_entity_type='cultura' THEN 'read_management' ELSE 'read_catalog' END);
  IF p_ids IS NULL OR cardinality(p_ids) > 500 OR array_position(p_ids, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'catalog_visibility_invalid_payload' USING ERRCODE='22023'; END IF;
  RETURN QUERY SELECT COALESCE(v.produto_id,v.microrganismo_id,v.cultura_id), v.hidden, v.version, v.updated_at
    FROM public.catalog_tenant_visibility v
   WHERE v.organization_id=v_org AND v.entity_type=p_entity_type
     AND COALESCE(v.produto_id,v.microrganismo_id,v.cultura_id) = ANY(p_ids);
END; $$;
REVOKE ALL ON FUNCTION platform_private.catalog_tenant_read_visibility_core(text,uuid[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION platform_private.catalog_tenant_read_visibility_core(text,uuid[]) TO authenticated;

-- ---------------------------------------------------------------- núcleo do seletor de NOVAS seleções (privado DEFINER)
-- Paginado e filtrado no servidor: página = somente globais ATIVOS e NÃO ocultos na empresa (in_page=true).
-- p_include_ids (máx. 50) devolve o valor já vinculado ao formulário MESMO fora da página/busca, sem duplicar a
-- página; selectable = ativo E visível (item visível nunca é rebaixado; oculto/inativo aparece só para leitura).
CREATE FUNCTION platform_private.catalog_tenant_selection_core(
  p_entity_type text, p_search text, p_limit integer, p_offset integer, p_include_ids uuid[])
RETURNS TABLE(id uuid, nome text, ativo boolean, hidden boolean, selectable boolean, in_page boolean, total bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_org uuid; v_q text := NULLIF(btrim(COALESCE(p_search,'')),'');
BEGIN
  IF p_entity_type IS NULL OR p_entity_type NOT IN ('produto','microrganismo','cultura')
     OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 100000
     OR (v_q IS NOT NULL AND char_length(v_q) > 80)
     OR (p_include_ids IS NOT NULL AND (cardinality(p_include_ids) > 50 OR array_position(p_include_ids, NULL) IS NOT NULL)) THEN
    RAISE EXCEPTION 'catalog_visibility_invalid_payload' USING ERRCODE='22023'; END IF;
  v_org := platform_private.catalog_tenant_actor(CASE WHEN p_entity_type='cultura' THEN 'read_selection_cultura' ELSE 'read_catalog' END);
  RETURN QUERY
  WITH base AS (
    SELECT p.id, p.nome::text AS nome, p.ativo FROM public.produtos p WHERE p_entity_type='produto'
    UNION ALL SELECT m.id, m.nome::text, m.ativo FROM public.microrganismos m WHERE p_entity_type='microrganismo'
    UNION ALL SELECT c.id, c.nome::text, c.ativo FROM public.culturas c WHERE p_entity_type='cultura'
  ), marked AS (
    SELECT b.*, COALESCE(v.hidden,false) AS hidden FROM base b
      LEFT JOIN public.catalog_tenant_visibility v ON v.organization_id=v_org AND v.entity_type=p_entity_type
       AND COALESCE(v.produto_id,v.microrganismo_id,v.cultura_id)=b.id
  ), page AS (
    SELECT m.*, count(*) OVER () AS total FROM marked m
     WHERE m.ativo IS TRUE AND m.hidden IS FALSE
       AND (v_q IS NULL OR m.nome ILIKE '%' || replace(replace(replace(v_q,'\','\\'),'%','\%'),'_','\_') || '%')
     ORDER BY m.nome, m.id LIMIT p_limit OFFSET p_offset
  )
  SELECT pg.id, pg.nome, pg.ativo, pg.hidden, true, true, pg.total FROM page pg
  UNION ALL
  SELECT m.id, m.nome, m.ativo, m.hidden, (m.ativo IS TRUE AND m.hidden IS FALSE), false, NULL::bigint FROM marked m
   WHERE p_include_ids IS NOT NULL AND m.id = ANY(p_include_ids) AND m.id NOT IN (SELECT pg2.id FROM page pg2);
END; $$;
REVOKE ALL ON FUNCTION platform_private.catalog_tenant_selection_core(text,text,integer,integer,uuid[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION platform_private.catalog_tenant_selection_core(text,text,integer,integer,uuid[]) TO authenticated;

-- ---------------------------------------------------------------- IDs ocultos da empresa (privado DEFINER)
-- Só UUIDs da própria empresa; consumidores de catálogo NOVO excluem no servidor (filtro da consulta).
CREATE FUNCTION platform_private.catalog_tenant_hidden_ids_core(p_entity_type text)
RETURNS TABLE(entity_id uuid) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_org uuid;
BEGIN
  IF p_entity_type IS NULL OR p_entity_type NOT IN ('produto','microrganismo','cultura') THEN
    RAISE EXCEPTION 'catalog_visibility_invalid_payload' USING ERRCODE='22023'; END IF;
  v_org := platform_private.catalog_tenant_actor('read_prefs');
  RETURN QUERY SELECT COALESCE(v.produto_id,v.microrganismo_id,v.cultura_id) FROM public.catalog_tenant_visibility v
   WHERE v.organization_id=v_org AND v.entity_type=p_entity_type AND v.hidden
   ORDER BY 1 LIMIT 301; -- cliente rejeita >300 de forma explícita
END; $$;
REVOKE ALL ON FUNCTION platform_private.catalog_tenant_hidden_ids_core(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION platform_private.catalog_tenant_hidden_ids_core(text) TO authenticated;

-- ---------------------------------------------------------------- wrappers públicos INVOKER (sem parâmetro de empresa)
CREATE FUNCTION public.tenant_catalog_set_visibility(
  p_entity_type text, p_entity_id uuid, p_hidden boolean, p_expected_version integer, p_reason text, p_idempotency_key uuid)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $$
  SELECT platform_private.catalog_tenant_set_visibility_core(p_entity_type,p_entity_id,p_hidden,p_expected_version,p_reason,p_idempotency_key)
$$;
CREATE FUNCTION public.tenant_catalog_read_visibility(p_entity_type text, p_ids uuid[])
RETURNS TABLE(entity_id uuid, hidden boolean, version integer, updated_at timestamptz)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT * FROM platform_private.catalog_tenant_read_visibility_core(p_entity_type,p_ids)
$$;
CREATE FUNCTION public.tenant_catalog_selection_page(
  p_entity_type text, p_search text, p_limit integer, p_offset integer, p_include_ids uuid[] DEFAULT NULL)
RETURNS TABLE(id uuid, nome text, ativo boolean, hidden boolean, selectable boolean, in_page boolean, total bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT * FROM platform_private.catalog_tenant_selection_core(p_entity_type,p_search,p_limit,p_offset,p_include_ids)
$$;
CREATE FUNCTION public.tenant_catalog_hidden_ids(p_entity_type text)
RETURNS TABLE(entity_id uuid) LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT * FROM platform_private.catalog_tenant_hidden_ids_core(p_entity_type)
$$;
REVOKE ALL ON FUNCTION public.tenant_catalog_hidden_ids(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tenant_catalog_hidden_ids(text) TO authenticated;
REVOKE ALL ON FUNCTION public.tenant_catalog_set_visibility(text,uuid,boolean,integer,text,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.tenant_catalog_read_visibility(text,uuid[]) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.tenant_catalog_selection_page(text,text,integer,integer,uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tenant_catalog_set_visibility(text,uuid,boolean,integer,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tenant_catalog_read_visibility(text,uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tenant_catalog_selection_page(text,text,integer,integer,uuid[]) TO authenticated;
-- USAGE em platform_private já é exigido pelos wrappers INVOKER existentes (composição/família); não ampliado aqui.
