-- =====================================================================================
-- CANDIDATO — NÃO APLICAR sem revisão independente. Canônico obrigatório: swzpzcwiasxmjutrmvkm.
-- Sem backfill, sem cópia das 26 linhas de `formulacoes`, sem recadastro do Bombarbio, sem produto fictício.
--
-- Composição de produtos GLOBAIS (Platform Superadmin) em TODAS as famílias.
--   * `formulacoes` permanece a fonte CANÔNICA da receita biológica existente (volume/proporção/concentração
--     legada) e do editor/criação atuais. Este arquivo NÃO altera `formulacoes`, suas policies nem motores
--     de produção, planejamento, pedidos ou PDF.
--   * Tabelas ADITIVAS só para o que a receita não representa (justificativa):
--       - ingrediente ativo (químicos), nutriente (fertilizantes/adubos), outro componente — sem lugar em
--         `formulacoes` (microrganismo_id é NOT NULL e component_insumo_id aponta para outro produto);
--       - concentração declarada OU teor garantido de microrganismo (UFC/mL, UFC/g), à escolha explícita do
--         usuário (nenhuma chancela é inferida) — atributo distinto do volume de receita.
--         Referencia microrganismos.id (sem cópia). Proibido quando a receita já informa concentração para o
--         mesmo micro (mesma medida) e proibido em mL/L (volume pertence à receita).
--   * Conjunto por produto com situação `rascunho|completo` (completo ≠ ficha/regulatório aprovado).
--   * Unidades fechadas e matriz unidade→base validada no servidor; sem conversão UFC/kg/L/densidade.
--   * Produto sem família: somente leitura. Guard em `produtos` impede reclassificação incompatível.
--   * Mutação incrementa a versão do produto (catalog_touch_version) preservando todas as demais colunas,
--     `formulacoes` e apresentações; ledger imutável com replay/CAS/lock por produto.
--   * Sem DML direto: tabelas com RLS habilitada, sem policies e sem grants para anon/authenticated.
--
-- Após aplicar: `produtos` passa de 5 para 6 triggers. O runtime da família (20261014215550) que exige 5
-- triggers passa a falhar fechado — NÃO REAPLICAR scripts antigos.
-- Rollback preferencial (preserva dados): rollback-platform-global-product-composition.sql
-- =====================================================================================

-- ---------------------------------------------------------------- preflight fail-closed
DO $$
DECLARE v_chk text;
BEGIN
  IF current_setting('request.jwt.claims', true) IS NOT NULL AND current_setting('request.jwt.claims', true) <> '' THEN
    RAISE EXCEPTION 'composition_preflight_must_run_as_owner'; END IF;
  IF (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='produtos') <> 21
    OR (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='produtos'
        AND column_name IN ('familia_catalogo','classe_catalogo')) <> 2 THEN
    RAISE EXCEPTION 'composition_preflight_family_missing'; END IF;
  IF (SELECT count(*) FROM pg_trigger WHERE tgrelid='public.produtos'::regclass AND NOT tgisinternal) <> 5 THEN
    RAISE EXCEPTION 'composition_preflight_triggers_changed'; END IF;
  IF (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='formulacoes') <> 10
    OR (SELECT is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='formulacoes' AND column_name='microrganismo_id') <> 'NO'
    OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='formulacoes_produto_microrganismo_unique') THEN
    RAISE EXCEPTION 'composition_preflight_formulacoes_changed'; END IF;
  SELECT pg_get_constraintdef(oid) INTO v_chk FROM pg_constraint
   WHERE conrelid='public.catalog_platform_admin_audit'::regclass AND conname='catalog_platform_admin_audit_operation_check';
  IF v_chk IS NULL OR v_chk NOT LIKE '%set_global_product_family%' OR v_chk LIKE '%set_global_product_composition%' THEN
    RAISE EXCEPTION 'composition_preflight_ledger_changed'; END IF;
  IF to_regprocedure('platform_private.catalog_metadata_require_actor()') IS NULL
    OR to_regprocedure('platform_private.catalog_entity_replay(uuid,text,jsonb,text,uuid)') IS NULL
    OR to_regprocedure('platform_private.catalog_entity_audit(uuid,text,text,uuid,jsonb,jsonb,jsonb,jsonb)') IS NULL
    OR to_regprocedure('platform_private.catalog_touch_version()') IS NULL
    OR to_regprocedure('public.platform_set_global_product_family(uuid,timestamptz,text,text,text,uuid)') IS NULL THEN
    RAISE EXCEPTION 'composition_preflight_helpers_missing'; END IF;
  IF to_regclass('public.produto_composicao_conjuntos') IS NOT NULL OR to_regclass('public.produto_composicao_declaracoes') IS NOT NULL
    OR to_regprocedure('public.platform_read_global_product_composition(uuid,integer,integer)') IS NOT NULL THEN
    RAISE EXCEPTION 'composition_preflight_already_applied'; END IF;
END;
$$;

-- ---------------------------------------------------------------- regras imutáveis (literais)
CREATE FUNCTION platform_private.catalog_composition_type_allowed(p_familia text, p_tipo text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT COALESCE((p_familia='biologico' AND p_tipo IN ('microrganismo','outro'))
    OR (p_familia='quimico' AND p_tipo IN ('ingrediente_ativo','outro'))
    OR (p_familia='fertilizante_adubo' AND p_tipo IN ('nutriente','outro')), false)
$$;
REVOKE ALL ON FUNCTION platform_private.catalog_composition_type_allowed(text,text) FROM PUBLIC,anon,authenticated,service_role;

-- ---------------------------------------------------------------- tabelas aditivas
CREATE TABLE public.produto_composicao_conjuntos (
  produto_id uuid PRIMARY KEY REFERENCES public.produtos(id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('rascunho','completo')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NOT NULL
);
CREATE TABLE public.produto_composicao_declaracoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id uuid NOT NULL REFERENCES public.produto_composicao_conjuntos(produto_id) ON DELETE RESTRICT,
  ordem smallint NOT NULL CHECK (ordem BETWEEN 1 AND 50),
  tipo_componente text NOT NULL CHECK (tipo_componente IN ('microrganismo','ingrediente_ativo','nutriente','outro')),
  microrganismo_id uuid NULL REFERENCES public.microrganismos(id) ON DELETE RESTRICT,
  componente_nome text NULL,
  quantidade numeric(24,6) NULL,
  unidade text NULL,
  base text NULL,
  natureza text NOT NULL CHECK (natureza IN ('teor_garantido','concentracao_declarada')),
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Identidade: micro por ID (sem nome) OU nome explícito (sem micro). IS TRUE fecha brecha de NULL.
  CONSTRAINT pcd_identidade_check CHECK ((
    (tipo_componente='microrganismo' AND microrganismo_id IS NOT NULL AND componente_nome IS NULL)
    OR (tipo_componente<>'microrganismo' AND microrganismo_id IS NULL AND componente_nome IS NOT NULL
        AND char_length(btrim(componente_nome)) BETWEEN 2 AND 160 AND componente_nome = btrim(componente_nome))) IS TRUE),
  -- Quantidade/unidade/base juntas ou todas NULL (rascunho).
  CONSTRAINT pcd_medida_conjunta_check CHECK ((quantidade IS NULL AND unidade IS NULL AND base IS NULL)
    OR (quantidade IS NOT NULL AND unidade IS NOT NULL AND base IS NOT NULL)),
  CONSTRAINT pcd_medida_check CHECK (quantidade IS NULL OR ((
    quantidade > 0 AND quantidade <> 'NaN'::numeric
    AND unidade IN ('mL/L','g/L','g/kg','%m/m','%m/v','%v/v','UFC/mL','UFC/g')
    AND ((unidade IN ('mL/L','g/L','%m/v','%v/v','UFC/mL') AND base='por_volume_produto')
      OR (unidade IN ('g/kg','%m/m','UFC/g') AND base='por_massa_produto'))
    AND ((unidade IN ('%m/m','%m/v','%v/v') AND quantidade <= 100)
      OR (unidade IN ('UFC/mL','UFC/g') AND quantidade <= 1e15)
      OR (unidade IN ('mL/L','g/L','g/kg') AND quantidade <= 1000))
    AND ((tipo_componente='microrganismo') = (unidade IN ('UFC/mL','UFC/g')))) IS TRUE)),
  CONSTRAINT pcd_ordem_unique UNIQUE (produto_id, ordem)
);
CREATE UNIQUE INDEX pcd_micro_unique ON public.produto_composicao_declaracoes (produto_id, microrganismo_id) WHERE microrganismo_id IS NOT NULL;
-- Identidade normalizada do nome (btrim+lower, igual ao cliente) independe do tipo: impede o mesmo componente como
-- ingrediente_ativo e outro (ou nutriente e outro). O CHECK de identidade já exige nome sem espaços nas pontas.
CREATE UNIQUE INDEX pcd_nome_unique ON public.produto_composicao_declaracoes (produto_id, lower(btrim(componente_nome))) WHERE componente_nome IS NOT NULL;
CREATE INDEX pcd_microrganismo_idx ON public.produto_composicao_declaracoes (microrganismo_id) WHERE microrganismo_id IS NOT NULL;
COMMENT ON TABLE public.produto_composicao_declaracoes IS 'Declarações de composição não representadas em formulacoes (ingrediente/nutriente/outro e concentração/teor UFC de micro). Não é receita, dose, ficha aprovada nem aprovação regulatória.';

-- Sem DML/SELECT direto de clientes; somente funções DEFINER.
REVOKE ALL ON public.produto_composicao_conjuntos, public.produto_composicao_declaracoes FROM PUBLIC, anon, authenticated;
ALTER TABLE public.produto_composicao_conjuntos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produto_composicao_declaracoes ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION platform_private.catalog_composition_touch() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN NEW.updated_at := GREATEST(pg_catalog.clock_timestamp(), OLD.updated_at + interval '1 microsecond'); RETURN NEW; END;
$$;
REVOKE ALL ON FUNCTION platform_private.catalog_composition_touch() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER pcc_touch BEFORE UPDATE ON public.produto_composicao_conjuntos FOR EACH ROW EXECUTE FUNCTION platform_private.catalog_composition_touch();

-- Defesa em profundidade (inclusive owner): família do produto deve aceitar o tipo de componente.
CREATE FUNCTION platform_private.catalog_composition_row_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE v_fam text;
BEGIN
  SELECT p.familia_catalogo INTO v_fam FROM public.produtos p WHERE p.id = NEW.produto_id;
  IF NOT platform_private.catalog_composition_type_allowed(v_fam, NEW.tipo_componente) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='catalog_composition_family_conflict'; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION platform_private.catalog_composition_row_guard() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER pcd_family_guard BEFORE INSERT OR UPDATE ON public.produto_composicao_declaracoes
FOR EACH ROW EXECUTE FUNCTION platform_private.catalog_composition_row_guard();

-- Guard em produtos: reclassificação incompatível com declarações existentes é negada (writer de família
-- devolve 23514; UI orienta ajustar composição antes). Sem efeito quando não há declarações.
CREATE FUNCTION platform_private.catalog_composition_family_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NEW.familia_catalogo IS DISTINCT FROM OLD.familia_catalogo AND EXISTS (
      SELECT 1 FROM public.produto_composicao_declaracoes d WHERE d.produto_id = NEW.id
        AND NOT platform_private.catalog_composition_type_allowed(NEW.familia_catalogo, d.tipo_componente)) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='catalog_composition_family_conflict'; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION platform_private.catalog_composition_family_guard() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER produtos_composicao_family_guard BEFORE UPDATE OF familia_catalogo ON public.produtos
FOR EACH ROW EXECUTE FUNCTION platform_private.catalog_composition_family_guard();

-- ---------------------------------------------------------------- ledger
ALTER TABLE public.catalog_platform_admin_audit DROP CONSTRAINT catalog_platform_admin_audit_operation_check;
ALTER TABLE public.catalog_platform_admin_audit ADD CONSTRAINT catalog_platform_admin_audit_operation_check
  CHECK (operation IN ('wipe_global_products','update_global_product_metadata','create_global_product','set_global_product_status',
    'create_global_microorganism','update_global_microorganism','set_global_microorganism_status',
    'create_global_culture','update_global_culture','set_global_culture_status',
    'create_global_volume','update_global_volume','set_global_volume_status',
    'set_global_b2b_enabled','set_global_product_family','set_global_product_composition'));
CREATE POLICY catalog_composition_audit_active_read ON public.catalog_platform_admin_audit
AS RESTRICTIVE FOR SELECT TO authenticated USING (
  operation <> 'set_global_product_composition' OR (
    auth.uid() IS NOT NULL AND public.has_role(auth.uid(),'superadmin'::public.app_role)
    AND public.is_platform_superadmin(auth.uid()) AND platform_private.platform_actor_access_ready(auth.uid())));
CREATE FUNCTION platform_private.catalog_composition_audit_immutable() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF OLD.operation = 'set_global_product_composition' OR NEW.operation = 'set_global_product_composition' THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='catalog_composition_audit_immutable'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION platform_private.catalog_composition_audit_immutable() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER catalog_composition_audit_immutable BEFORE UPDATE OR DELETE ON public.catalog_platform_admin_audit
FOR EACH ROW EXECUTE FUNCTION platform_private.catalog_composition_audit_immutable();

-- ---------------------------------------------------------------- leitor unificado (origem explícita)
-- Receita paginada (p_receita_offset); declarações SEMPRE completas (máx. 50 por CHECK de ordem) para que o
-- writer, que substitui o conjunto inteiro, nunca opere sobre lista parcial.
CREATE FUNCTION platform_private.read_global_product_composition_core(p_produto_id uuid, p_limit integer, p_receita_offset integer) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_p public.produtos%ROWTYPE; v_result jsonb;
BEGIN
  PERFORM platform_private.catalog_metadata_require_actor();
  IF p_produto_id IS NULL OR p_limit IS NULL OR p_limit < 1 OR p_limit > 50 OR p_receita_offset IS NULL OR p_receita_offset < 0 OR p_receita_offset > 10000 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_composition_invalid_query'; END IF;
  SELECT * INTO v_p FROM public.produtos WHERE id = p_produto_id;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='catalog_composition_unavailable'; END IF;
  WITH rec AS MATERIALIZED (
    SELECT f.id AS formulacao_id, f.microrganismo_id, m.nome AS micro_nome, m.ativo AS micro_ativo, f.component_insumo_id,
           ip.nome AS insumo_nome, f.volume_ml, f.proporcao, f.concentracao, f.unidade, f.e_volume_fixo
    FROM public.formulacoes f JOIN public.microrganismos m ON m.id = f.microrganismo_id
    LEFT JOIN public.produtos ip ON ip.id = f.component_insumo_id
    WHERE f.produto_id = p_produto_id ORDER BY f.created_at, f.id LIMIT p_limit + 1 OFFSET p_receita_offset
  ), dec AS MATERIALIZED (
    SELECT d.id, d.ordem::int AS ordem, d.tipo_componente, d.microrganismo_id, m.nome AS micro_nome, m.ativo AS micro_ativo,
           d.componente_nome, d.quantidade, d.unidade, d.base, d.natureza
    FROM public.produto_composicao_declaracoes d LEFT JOIN public.microrganismos m ON m.id = d.microrganismo_id
    WHERE d.produto_id = p_produto_id ORDER BY d.ordem LIMIT 51
  )
  SELECT pg_catalog.jsonb_build_object(
    'produto', pg_catalog.jsonb_build_object('id',v_p.id,'nome',v_p.nome,'familia_catalogo',v_p.familia_catalogo,'updated_at',v_p.updated_at),
    'conjunto', (SELECT pg_catalog.jsonb_build_object('status',c.status,'updated_at',c.updated_at)
                 FROM public.produto_composicao_conjuntos c WHERE c.produto_id = p_produto_id),
    'receita', COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r)) FROM (SELECT * FROM rec LIMIT p_limit) r), '[]'::jsonb),
    'receita_offset', p_receita_offset,
    'declaracoes', COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY x.ordem) FROM (SELECT * FROM dec LIMIT 50) x), '[]'::jsonb),
    'receita_has_more', (SELECT pg_catalog.count(*) > p_limit FROM rec),
    'declaracoes_has_more', (SELECT pg_catalog.count(*) > 50 FROM dec)) INTO v_result;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION platform_private.read_global_product_composition_core(uuid,integer,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION platform_private.read_global_product_composition_core(uuid,integer,integer) TO authenticated;

-- ---------------------------------------------------------------- writer (substitui o conjunto de declarações)
CREATE FUNCTION platform_private.set_global_product_composition_core(p_produto_id uuid, p_expected_updated_at timestamptz,
  p_status text, p_itens jsonb, p_reason text, p_idempotency_key uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid; v_req jsonb; v_replay jsonb; v_receipt jsonb; v_audit uuid := gen_random_uuid();
  v_op public.produtos%ROWTYPE; v_np public.produtos%ROWTYPE; v_e jsonb; v_i int := 0; v_n int;
  v_before jsonb; v_after jsonb; v_form_before text; v_form_after text; v_vol_before text; v_vol_after text;
  v_old_status text; v_keys text[] := ARRAY['base','componente_nome','microrganismo_id','natureza','ordem','quantidade','tipo_componente','unidade'];
BEGIN
  v_actor := platform_private.catalog_metadata_require_actor();
  IF p_produto_id IS NULL OR p_expected_updated_at IS NULL OR NOT pg_catalog.isfinite(p_expected_updated_at) OR p_idempotency_key IS NULL
     OR p_status IS NULL OR p_status NOT IN ('rascunho','completo')
     OR p_itens IS NULL OR pg_catalog.jsonb_typeof(p_itens) <> 'array' OR pg_catalog.jsonb_array_length(p_itens) > 50
     OR (p_status = 'completo' AND pg_catalog.jsonb_array_length(p_itens) = 0) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_composition_invalid'; END IF;
  -- Formato estrito de cada item (chaves exatas, tipos JSON, ordem 1..n sequencial). Valores finais validados pelos CHECKs.
  FOR v_e IN SELECT e FROM pg_catalog.jsonb_array_elements(p_itens) e LOOP
    v_i := v_i + 1;
    IF pg_catalog.jsonb_typeof(v_e) <> 'object'
       OR (SELECT pg_catalog.array_agg(k ORDER BY k) FROM pg_catalog.jsonb_object_keys(v_e) k) IS DISTINCT FROM v_keys
       OR pg_catalog.jsonb_typeof(v_e->'ordem') <> 'number' OR (v_e->>'ordem') <> v_i::text
       OR pg_catalog.jsonb_typeof(v_e->'quantidade') NOT IN ('number','null')
       OR pg_catalog.jsonb_typeof(v_e->'tipo_componente') <> 'string' OR pg_catalog.jsonb_typeof(v_e->'natureza') <> 'string'
       OR pg_catalog.jsonb_typeof(v_e->'microrganismo_id') NOT IN ('string','null')
       OR pg_catalog.jsonb_typeof(v_e->'componente_nome') NOT IN ('string','null')
       OR pg_catalog.jsonb_typeof(v_e->'unidade') NOT IN ('string','null') OR pg_catalog.jsonb_typeof(v_e->'base') NOT IN ('string','null')
       OR (v_e->>'microrganismo_id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' AND v_e->>'microrganismo_id' IS NOT NULL
       OR (p_status = 'completo' AND v_e->>'quantidade' IS NULL) THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_composition_invalid'; END IF;
    -- No máximo 6 casas decimais (numeric(24,6) arredondaria silenciosamente).
    IF v_e->>'quantidade' IS NOT NULL AND pg_catalog.scale((v_e->>'quantidade')::numeric) > 6 THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_composition_invalid'; END IF;
  END LOOP;
  v_req := pg_catalog.jsonb_build_object('produto_id',p_produto_id,'expected_updated_at',p_expected_updated_at,'status',p_status,
    'itens',p_itens,'reason',pg_catalog.btrim(COALESCE(p_reason,'')));
  v_replay := platform_private.catalog_entity_replay(v_actor,'set_global_product_composition',v_req,p_reason,p_idempotency_key);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;

  SELECT * INTO v_op FROM public.produtos WHERE id = p_produto_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='catalog_composition_unavailable'; END IF;
  IF v_op.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='catalog_composition_conflict'; END IF;
  IF v_op.familia_catalogo IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_composition_requires_family'; END IF;

  -- Família transacional (após lock) e regras cruzadas com a receita.
  FOR v_e IN SELECT e FROM pg_catalog.jsonb_array_elements(p_itens) e LOOP
    IF NOT platform_private.catalog_composition_type_allowed(v_op.familia_catalogo, v_e->>'tipo_componente') THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='catalog_composition_family_conflict'; END IF;
    IF v_e->>'tipo_componente' = 'microrganismo' THEN
      -- Nova associação exige micro ativo; micro já declarado (mesmo arquivado depois) pode ser mantido.
      IF NOT EXISTS (SELECT 1 FROM public.microrganismos m WHERE m.id = (v_e->>'microrganismo_id')::uuid
          AND (m.ativo OR EXISTS (SELECT 1 FROM public.produto_composicao_declaracoes d
                 WHERE d.produto_id = p_produto_id AND d.microrganismo_id = m.id))) THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_composition_micro_unavailable'; END IF;
      IF EXISTS (SELECT 1 FROM public.formulacoes f WHERE f.produto_id = p_produto_id
          AND f.microrganismo_id = (v_e->>'microrganismo_id')::uuid AND f.concentracao IS NOT NULL) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='catalog_composition_duplicate_measure'; END IF;
    END IF;
  END LOOP;

  SELECT c.status INTO v_old_status FROM public.produto_composicao_conjuntos c WHERE c.produto_id = p_produto_id FOR UPDATE;
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('ordem',d.ordem,'tipo_componente',d.tipo_componente,
      'microrganismo_id',d.microrganismo_id,'componente_nome',d.componente_nome,'quantidade',d.quantidade,'unidade',d.unidade,
      'base',d.base,'natureza',d.natureza) ORDER BY d.ordem), '[]'::jsonb) INTO v_before
    FROM public.produto_composicao_declaracoes d WHERE d.produto_id = p_produto_id;
  SELECT md5(COALESCE(string_agg(pg_catalog.to_jsonb(f)::text, ',' ORDER BY f.id), '')) INTO v_form_before FROM public.formulacoes f WHERE f.produto_id = p_produto_id;
  SELECT md5(COALESCE(string_agg(pg_catalog.to_jsonb(v)::text, ',' ORDER BY v.id), '')) INTO v_vol_before FROM public.catalogo_volumes v WHERE v.produto_id = p_produto_id;

  INSERT INTO public.produto_composicao_conjuntos (produto_id, status, updated_by) VALUES (p_produto_id, p_status, v_actor)
  ON CONFLICT (produto_id) DO UPDATE SET status = EXCLUDED.status, updated_by = EXCLUDED.updated_by;
  DELETE FROM public.produto_composicao_declaracoes d WHERE d.produto_id = p_produto_id;
  INSERT INTO public.produto_composicao_declaracoes (produto_id, ordem, tipo_componente, microrganismo_id, componente_nome, quantidade, unidade, base, natureza)
  SELECT p_produto_id, (e->>'ordem')::smallint, e->>'tipo_componente', (e->>'microrganismo_id')::uuid, e->>'componente_nome',
         (e->>'quantidade')::numeric, e->>'unidade', e->>'base', e->>'natureza'
  FROM pg_catalog.jsonb_array_elements(p_itens) e;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('ordem',d.ordem,'tipo_componente',d.tipo_componente,
      'microrganismo_id',d.microrganismo_id,'componente_nome',d.componente_nome,'quantidade',d.quantidade,'unidade',d.unidade,
      'base',d.base,'natureza',d.natureza) ORDER BY d.ordem), '[]'::jsonb) INTO v_after
    FROM public.produto_composicao_declaracoes d WHERE d.produto_id = p_produto_id;
  IF v_after = v_before AND v_old_status IS NOT DISTINCT FROM p_status THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_composition_no_change'; END IF;

  -- Versão monotônica do produto; demais colunas, receita e apresentações intactas.
  UPDATE public.produtos SET updated_at = updated_at WHERE id = p_produto_id AND updated_at = p_expected_updated_at RETURNING * INTO v_np;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='catalog_composition_confirmation_failed'; END IF;
  SELECT md5(COALESCE(string_agg(pg_catalog.to_jsonb(f)::text, ',' ORDER BY f.id), '')) INTO v_form_after FROM public.formulacoes f WHERE f.produto_id = p_produto_id;
  SELECT md5(COALESCE(string_agg(pg_catalog.to_jsonb(v)::text, ',' ORDER BY v.id), '')) INTO v_vol_after FROM public.catalogo_volumes v WHERE v.produto_id = p_produto_id;
  IF v_n <> pg_catalog.jsonb_array_length(p_itens) OR v_np.updated_at IS NULL OR v_np.updated_at <= v_op.updated_at
     OR (pg_catalog.to_jsonb(v_op) - 'updated_at') IS DISTINCT FROM (pg_catalog.to_jsonb(v_np) - 'updated_at')
     OR v_form_before IS DISTINCT FROM v_form_after OR v_vol_before IS DISTINCT FROM v_vol_after THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='catalog_composition_confirmation_failed'; END IF;

  v_receipt := pg_catalog.jsonb_build_object('produto_id',p_produto_id,'status',p_status,'itens',v_n,'updated_at',v_np.updated_at,
    'idempotency_key',p_idempotency_key,'audit_id',v_audit,'idempotent',false);
  PERFORM platform_private.catalog_entity_audit(v_actor,'set_global_product_composition',p_reason,p_idempotency_key,v_req,v_receipt,
    pg_catalog.jsonb_build_object('produto_id',p_produto_id,'status',v_old_status,'itens',v_before,'updated_at',v_op.updated_at),
    pg_catalog.jsonb_build_object('produto_id',p_produto_id,'status',p_status,'itens',v_after,'updated_at',v_np.updated_at));
  RETURN v_receipt;
END;
$$;
REVOKE ALL ON FUNCTION platform_private.set_global_product_composition_core(uuid,timestamptz,text,jsonb,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION platform_private.set_global_product_composition_core(uuid,timestamptz,text,jsonb,text,uuid) TO authenticated;

-- ---------------------------------------------------------------- wrappers INVOKER
CREATE FUNCTION public.platform_read_global_product_composition(p_produto_id uuid, p_limit integer DEFAULT 50, p_receita_offset integer DEFAULT 0) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS
$$ SELECT platform_private.read_global_product_composition_core(p_produto_id,p_limit,p_receita_offset) $$;
CREATE FUNCTION public.platform_set_global_product_composition(p_produto_id uuid, p_expected_updated_at timestamptz,
  p_status text, p_itens jsonb, p_reason text, p_idempotency_key uuid) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS
$$ SELECT platform_private.set_global_product_composition_core(p_produto_id,p_expected_updated_at,p_status,p_itens,p_reason,p_idempotency_key) $$;
REVOKE ALL ON FUNCTION public.platform_read_global_product_composition(uuid,integer,integer) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.platform_set_global_product_composition(uuid,timestamptz,text,jsonb,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.platform_read_global_product_composition(uuid,integer,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_set_global_product_composition(uuid,timestamptz,text,jsonb,text,uuid) TO authenticated;
