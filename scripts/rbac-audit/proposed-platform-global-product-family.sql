-- =====================================================================================
-- CANDIDATO — NÃO APLICAR AUTOMATICAMENTE. Revisão independente aplicará no canônico
-- swzpzcwiasxmjutrmvkm. Este arquivo NÃO faz backfill nem altera dados de produtos:
-- todos os produtos existentes ficam com família NULL ("pendente de classificação").
--
-- Classificação explícita por FAMÍLIA de produtos globais (Platform Superadmin):
--   familia_catalogo  text NULL  ∈ {'biologico','quimico','fertilizante_adubo'}
--   classe_catalogo   text NULL  rótulo opcional, sempre coerente com a família:
--       biologico          -> biofungicida | bioinseticida | inoculante | solubilizador
--       quimico            -> fungicida | inseticida | herbicida
--       fertilizante_adubo -> (nenhuma classe homologada nesta fase; deve ser NULL)
--   CHECKs são imutáveis (lista literal) — sem dependência de tempo.
--   `tipo` (enum legado de finalidade) NÃO é removido, alterado ou usado para inferir família.
--
-- Padrões reutilizados: wrapper public SECURITY INVOKER -> platform_private SECURITY DEFINER,
-- catalog_metadata_require_actor (SA ativo/readiness/JWT fence), motivo 10..500, idempotência
-- no ledger catalog_platform_admin_audit, lock de linha + CAS em updated_at (versão monotônica
-- via catalog_touch_version, aplicada em 20261014212642), confirmação pós-UPDATE de que SOMENTE
-- familia_catalogo/classe_catalogo/updated_at mudaram e apresentações intactas, audit before/after.
-- Sem DML/grants novos para anon/authenticated nas tabelas; sem SQL dinâmico; sem limpar família.
--
-- ATENÇÃO SCRIPTS ANTERIORES: após esta migration `produtos` passa de 19 para 21 colunas.
-- Os preflights dos SQLs já aplicados (volumes 20261014203909, b2b 20261014212642) exigem 19
-- colunas e portanto FALHAM FECHADOS se reexecutados — comportamento desejado: NÃO REAPLICAR.
-- Rollback: rollback-platform-global-product-family.sql
-- =====================================================================================

-- ---------------------------------------------------------------- preflight fail-closed
DO $$
DECLARE v_chk text;
BEGIN
  IF current_setting('request.jwt.claims', true) IS NOT NULL AND current_setting('request.jwt.claims', true) <> '' THEN
    RAISE EXCEPTION 'family_preflight_must_run_as_owner';
  END IF;
  IF (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='produtos') <> 19
    OR EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='produtos'
               AND column_name IN ('familia_catalogo','classe_catalogo')) THEN
    RAISE EXCEPTION 'family_preflight_column_count_changed';
  END IF;
  IF (SELECT count(*) FROM pg_trigger WHERE tgrelid='public.produtos'::regclass AND NOT tgisinternal) <> 5
    OR (SELECT count(*) FROM pg_trigger t WHERE t.tgrelid='public.produtos'::regclass AND t.tgname='update_produtos_updated_at'
         AND NOT t.tgisinternal AND t.tgfoid='platform_private.catalog_touch_version()'::regprocedure) <> 1 THEN
    RAISE EXCEPTION 'family_preflight_triggers_changed';
  END IF;
  SELECT pg_get_constraintdef(oid) INTO v_chk FROM pg_constraint
   WHERE conrelid='public.catalog_platform_admin_audit'::regclass AND conname='catalog_platform_admin_audit_operation_check';
  IF v_chk IS NULL OR v_chk NOT LIKE '%set_global_b2b_enabled%' OR v_chk LIKE '%set_global_product_family%' THEN
    RAISE EXCEPTION 'family_preflight_ledger_changed';
  END IF;
  IF to_regprocedure('platform_private.catalog_metadata_require_actor()') IS NULL
    OR to_regprocedure('platform_private.catalog_entity_replay(uuid,text,jsonb,text,uuid)') IS NULL
    OR to_regprocedure('platform_private.catalog_entity_audit(uuid,text,text,uuid,jsonb,jsonb,jsonb,jsonb)') IS NULL
    OR to_regprocedure('public.platform_read_global_product_catalog(text,integer,integer)') IS NULL THEN
    RAISE EXCEPTION 'family_preflight_helpers_missing';
  END IF;
  IF to_regprocedure('public.platform_read_global_product_catalog_by_family(text,text,text,integer,integer)') IS NOT NULL
    OR to_regprocedure('public.platform_set_global_product_family(uuid,timestamptz,text,text,text,uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'family_preflight_already_applied';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.role_table_grants WHERE table_schema='public'
      AND table_name='produtos' AND grantee IN ('anon','authenticated','PUBLIC')
      AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE')) THEN
    RAISE EXCEPTION 'family_preflight_client_dml_present';
  END IF;
END;
$$;

-- ---------------------------------------------------------------- colunas aditivas nullable (sem default, sem backfill)
ALTER TABLE public.produtos ADD COLUMN familia_catalogo text NULL;
ALTER TABLE public.produtos ADD COLUMN classe_catalogo text NULL;
ALTER TABLE public.produtos ADD CONSTRAINT produtos_familia_catalogo_check
  CHECK (familia_catalogo IS NULL OR familia_catalogo IN ('biologico','quimico','fertilizante_adubo'));
ALTER TABLE public.produtos ADD CONSTRAINT produtos_classe_catalogo_coerente_check CHECK (
  classe_catalogo IS NULL
  OR (familia_catalogo = 'biologico' AND classe_catalogo IN ('biofungicida','bioinseticida','inoculante','solubilizador'))
  OR (familia_catalogo = 'quimico'   AND classe_catalogo IN ('fungicida','inseticida','herbicida')));
COMMENT ON COLUMN public.produtos.familia_catalogo IS 'Família do catálogo global (classificação explícita por Platform Superadmin; NULL = pendente). Não derivar de tipo/nome/composição.';
COMMENT ON COLUMN public.produtos.classe_catalogo IS 'Rótulo opcional coerente com familia_catalogo; nunca mistura biológico e químico.';
CREATE INDEX produtos_familia_catalogo_idx ON public.produtos (familia_catalogo, (pg_catalog.lower(nome)), id);

-- ---------------------------------------------------------------- ledger: whitelist + leitura SA + imutável
ALTER TABLE public.catalog_platform_admin_audit DROP CONSTRAINT catalog_platform_admin_audit_operation_check;
ALTER TABLE public.catalog_platform_admin_audit ADD CONSTRAINT catalog_platform_admin_audit_operation_check
  CHECK (operation IN ('wipe_global_products','update_global_product_metadata','create_global_product','set_global_product_status',
    'create_global_microorganism','update_global_microorganism','set_global_microorganism_status',
    'create_global_culture','update_global_culture','set_global_culture_status',
    'create_global_volume','update_global_volume','set_global_volume_status',
    'set_global_b2b_enabled','set_global_product_family'));

CREATE POLICY catalog_family_audit_active_read ON public.catalog_platform_admin_audit
AS RESTRICTIVE FOR SELECT TO authenticated USING (
  operation <> 'set_global_product_family' OR (
    auth.uid() IS NOT NULL AND public.has_role(auth.uid(),'superadmin'::public.app_role)
    AND public.is_platform_superadmin(auth.uid()) AND platform_private.platform_actor_access_ready(auth.uid())));

CREATE FUNCTION platform_private.catalog_family_audit_immutable() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF OLD.operation = 'set_global_product_family' OR NEW.operation = 'set_global_product_family' THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='catalog_family_audit_immutable';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION platform_private.catalog_family_audit_immutable() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER catalog_family_audit_immutable BEFORE UPDATE OR DELETE ON public.catalog_platform_admin_audit
FOR EACH ROW EXECUTE FUNCTION platform_private.catalog_family_audit_immutable();

-- ---------------------------------------------------------------- leitor paginado por família/revisão
-- p_familia obrigatório; p_revisao: 'todos' = família OU pendente (NULL), 'pendentes' = somente NULL.
-- Projeção mínima (sem preço/dose/composição/ficha/tenant); uma consulta, sem N+1.
CREATE FUNCTION platform_private.read_global_product_catalog_by_family_core(
  p_familia text, p_revisao text, p_search text, p_limit integer, p_offset integer) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_search text; v_result jsonb;
BEGIN
  PERFORM platform_private.catalog_metadata_require_actor();
  IF p_familia IS NULL OR p_familia NOT IN ('biologico','quimico','fertilizante_adubo')
     OR p_revisao IS NULL OR p_revisao NOT IN ('todos','pendentes')
     OR p_limit IS NULL OR p_limit < 1 OR p_limit > 50
     OR p_offset IS NULL OR p_offset < 0 OR p_offset > 1000000
     OR p_search IS NULL OR pg_catalog.char_length(p_search) > 120 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='platform_catalog_invalid_query';
  END IF;
  v_search := pg_catalog.lower(pg_catalog.btrim(p_search));
  WITH bounded AS MATERIALIZED (
    SELECT p.id, p.codigo, p.nome, p.tipo, COALESCE(p.ativo,false) AS ativo, p.b2b_enabled, p.updated_at,
           p.familia_catalogo, p.classe_catalogo
    FROM public.produtos p
    WHERE (p.familia_catalogo IS NULL OR (p_revisao = 'todos' AND p.familia_catalogo = p_familia))
      AND (v_search = ''
       OR pg_catalog.strpos(pg_catalog.lower(p.nome), v_search) > 0
       OR pg_catalog.strpos(pg_catalog.lower(COALESCE(p.codigo, '')), v_search) > 0)
    ORDER BY (p.familia_catalogo IS NULL) DESC, pg_catalog.lower(p.nome) COLLATE "C", p.id
    LIMIT (p_limit + 1) OFFSET p_offset
  ), page AS (
    SELECT * FROM bounded b ORDER BY (b.familia_catalogo IS NULL) DESC, pg_catalog.lower(b.nome) COLLATE "C", b.id LIMIT p_limit
  )
  SELECT pg_catalog.jsonb_build_object(
    'items', COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r)
      ORDER BY (r.familia_catalogo IS NULL) DESC, pg_catalog.lower(r.nome) COLLATE "C", r.id) FROM page r), '[]'::jsonb),
    'has_more', (SELECT pg_catalog.count(*) > p_limit FROM bounded)
  ) INTO v_result;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION platform_private.read_global_product_catalog_by_family_core(text,text,text,integer,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION platform_private.read_global_product_catalog_by_family_core(text,text,text,integer,integer) TO authenticated;

-- ---------------------------------------------------------------- writer
CREATE FUNCTION platform_private.set_global_product_family_core(p_id uuid, p_expected_updated_at timestamptz,
  p_familia text, p_classe text, p_reason text, p_idempotency_key uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid; v_req jsonb; v_replay jsonb; v_receipt jsonb; v_audit uuid := gen_random_uuid();
  v_op public.produtos%ROWTYPE; v_np public.produtos%ROWTYPE; v_old jsonb; v_new jsonb;
  v_vols_before jsonb; v_vols_after jsonb; v_classe text := NULLIF(pg_catalog.btrim(COALESCE(p_classe,'')), '');
BEGIN
  v_actor := platform_private.catalog_metadata_require_actor();
  IF p_id IS NULL OR p_expected_updated_at IS NULL OR p_idempotency_key IS NULL
     OR p_familia IS NULL OR p_familia NOT IN ('biologico','quimico','fertilizante_adubo')
     OR NOT (v_classe IS NULL
       OR (p_familia='biologico' AND v_classe IN ('biofungicida','bioinseticida','inoculante','solubilizador'))
       OR (p_familia='quimico'   AND v_classe IN ('fungicida','inseticida','herbicida'))) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_family_invalid';
  END IF;
  v_req := pg_catalog.jsonb_build_object('id',p_id,'expected_updated_at',p_expected_updated_at,
    'familia_catalogo',p_familia,'classe_catalogo',v_classe,'reason',pg_catalog.btrim(COALESCE(p_reason,'')));
  v_replay := platform_private.catalog_entity_replay(v_actor,'set_global_product_family',v_req,p_reason,p_idempotency_key);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;

  SELECT * INTO v_op FROM public.produtos WHERE id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='catalog_family_unavailable'; END IF;
  IF v_op.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='catalog_family_conflict'; END IF;
  IF v_op.familia_catalogo IS NOT DISTINCT FROM p_familia AND v_op.classe_catalogo IS NOT DISTINCT FROM v_classe THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_family_no_change'; END IF;
  v_old := pg_catalog.to_jsonb(v_op);
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(cv) ORDER BY cv.id),'[]'::jsonb) INTO v_vols_before
    FROM public.catalogo_volumes cv WHERE cv.produto_id=p_id;

  UPDATE public.produtos SET familia_catalogo=p_familia, classe_catalogo=v_classe
   WHERE id=p_id AND updated_at=p_expected_updated_at RETURNING * INTO v_np;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='catalog_family_confirmation_failed'; END IF;
  v_new := pg_catalog.to_jsonb(v_np);
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(cv) ORDER BY cv.id),'[]'::jsonb) INTO v_vols_after
    FROM public.catalogo_volumes cv WHERE cv.produto_id=p_id;
  -- Somente família/classe/versão mudam (ativo, B2B, preços, dose, tipo, código, owner intactos).
  IF v_np.familia_catalogo IS DISTINCT FROM p_familia OR v_np.classe_catalogo IS DISTINCT FROM v_classe
    OR v_np.updated_at IS NULL OR v_np.updated_at <= v_op.updated_at
    OR (v_old - ARRAY['familia_catalogo','classe_catalogo','updated_at']) IS DISTINCT FROM (v_new - ARRAY['familia_catalogo','classe_catalogo','updated_at'])
    OR v_vols_before IS DISTINCT FROM v_vols_after THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='catalog_family_confirmation_failed'; END IF;

  v_receipt := pg_catalog.jsonb_build_object('id',p_id,'familia_catalogo',p_familia,'classe_catalogo',v_classe,
    'updated_at',v_np.updated_at,'idempotency_key',p_idempotency_key,'audit_id',v_audit,'idempotent',false);
  PERFORM platform_private.catalog_entity_audit(v_actor,'set_global_product_family',p_reason,p_idempotency_key,v_req,v_receipt,
    pg_catalog.jsonb_build_object('id',p_id,'familia_catalogo',v_op.familia_catalogo,'classe_catalogo',v_op.classe_catalogo,'updated_at',v_op.updated_at),
    pg_catalog.jsonb_build_object('id',p_id,'familia_catalogo',p_familia,'classe_catalogo',v_classe,'updated_at',v_np.updated_at));
  RETURN v_receipt;
END;
$$;
REVOKE ALL ON FUNCTION platform_private.set_global_product_family_core(uuid,timestamptz,text,text,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION platform_private.set_global_product_family_core(uuid,timestamptz,text,text,text,uuid) TO authenticated;

-- ---------------------------------------------------------------- wrappers INVOKER
CREATE FUNCTION public.platform_read_global_product_catalog_by_family(p_familia text, p_revisao text DEFAULT 'todos',
  p_search text DEFAULT '', p_limit integer DEFAULT 50, p_offset integer DEFAULT 0) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS
$$ SELECT platform_private.read_global_product_catalog_by_family_core(p_familia,p_revisao,p_search,p_limit,p_offset) $$;
CREATE FUNCTION public.platform_set_global_product_family(p_id uuid, p_expected_updated_at timestamptz,
  p_familia text, p_classe text, p_reason text, p_idempotency_key uuid) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS
$$ SELECT platform_private.set_global_product_family_core(p_id,p_expected_updated_at,p_familia,p_classe,p_reason,p_idempotency_key) $$;
REVOKE ALL ON FUNCTION public.platform_read_global_product_catalog_by_family(text,text,text,integer,integer) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.platform_set_global_product_family(uuid,timestamptz,text,text,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.platform_read_global_product_catalog_by_family(text,text,text,integer,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_set_global_product_family(uuid,timestamptz,text,text,text,uuid) TO authenticated;
