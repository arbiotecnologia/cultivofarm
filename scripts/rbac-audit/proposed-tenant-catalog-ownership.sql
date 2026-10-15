-- =====================================================================================
-- CANDIDATO — NÃO APLICAR sem revisão independente. Canônico obrigatório: swzpzcwiasxmjutrmvkm.
-- Fase 3 da personalização por empresa: FUNDAÇÃO de ownership + CRUD de itens PRÓPRIOS,
-- entregue DESABILITADA (gate fail-closed). Base de código 66c0f449.
--
-- Por que desabilitada: o inventário (docs/auditorias/catalogo-personalizacao-tenant.md §Fase 3)
-- encontrou ~50 funções SECURITY DEFINER e policies SELECT por papel (ex.: culturas USING true)
-- que leem produtos/microrganismos/culturas/formulacoes/catalogo_volumes SEM filtro de dono.
-- Enquanto cada leitor não filtrar `owner_organization_id IS NULL` (globais/SA/B2B/preço/fiscal)
-- ou `= empresa do ator`, NENHUMA linha privada pode existir. Este candidato garante isso:
--   * coluna owner_organization_id NULL em todas as linhas legadas (NULL = global; sem backfill);
--   * trigger rejeita owner não-NULL enquanto o gate estiver OFF e rejeita SEMPRE troca de dono;
--   * policies RESTRICTIVE de SELECT (anon/authenticated): global + própria empresa; SA = só global;
--   * descendentes (formulacoes, catalogo_volumes) herdam dono do pai e rejeitam vínculo cruzado;
--   * RPCs de CRUD próprio existem, mas falham com `catalog_ownership_disabled` até o gate abrir.
-- Abrir o gate é uma migration FUTURA separada, com preflight que prova cada leitor do mapa.
--
-- Não altera: grants (authenticated segue SELECT-only nas 5 tabelas), contenção já aplicada,
-- visibilidade (Fase 1), Bombarbio, preços, apresentações, composição, ledger de visibilidade.
-- Rollback: rollback-tenant-catalog-ownership.sql (não expõe privados nem destrói ledger).
-- =====================================================================================

-- ---------------------------------------------------------------- preflight fail-closed
DO $$
DECLARE v_bomb record;
BEGIN
  IF current_setting('request.jwt.claims', true) IS NOT NULL AND current_setting('request.jwt.claims', true) <> '' THEN
    RAISE EXCEPTION 'ownership_preflight_must_run_as_owner'; END IF;
  IF to_regprocedure('platform_private.catalog_tenant_actor(text)') IS NULL
    OR to_regprocedure('platform_private.h15_actor_organization()') IS NULL
    OR to_regprocedure('public.is_platform_superadmin(uuid)') IS NULL
    OR to_regclass('public.catalog_tenant_visibility_ledger') IS NULL THEN
    RAISE EXCEPTION 'ownership_preflight_phase1_missing'; END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
              AND table_name IN ('produtos','microrganismos','culturas','formulacoes','catalogo_volumes')
              AND column_name='owner_organization_id') THEN
    RAISE EXCEPTION 'ownership_preflight_already_applied'; END IF;
  IF EXISTS (SELECT 1 FROM information_schema.role_table_grants
              WHERE table_schema='public' AND grantee IN ('authenticated','anon')
                AND table_name IN ('produtos','microrganismos','culturas','formulacoes','catalogo_volumes')
                AND privilege_type <> 'SELECT') THEN
    RAISE EXCEPTION 'ownership_preflight_global_write_grant_present'; END IF;
  -- Invariantes Bombarbio (antes).
  SELECT p.id, p.ativo, p.b2b_enabled, p.updated_at INTO v_bomb FROM public.produtos p
   WHERE p.id='1875527c-a65a-483b-a6c2-9122d5ec2a51';
  IF v_bomb.id IS NULL OR v_bomb.ativo IS NOT TRUE OR v_bomb.b2b_enabled IS NOT TRUE THEN
    RAISE EXCEPTION 'ownership_preflight_bombarbio_drift'; END IF;
END $$;

-- ---------------------------------------------------------------- gate (OFF)
CREATE TABLE platform_private.catalog_ownership_gate (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  enabled boolean NOT NULL DEFAULT false,
  readers_certified_at timestamptz NULL,
  note text NOT NULL DEFAULT 'Fundação desabilitada; abrir somente após certificar o mapa de leitores.'
);
INSERT INTO platform_private.catalog_ownership_gate(singleton, enabled) VALUES (true, false);
REVOKE ALL ON platform_private.catalog_ownership_gate FROM PUBLIC, anon, authenticated;

CREATE FUNCTION platform_private.catalog_ownership_enabled() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT COALESCE((SELECT enabled AND readers_certified_at IS NOT NULL
                     FROM platform_private.catalog_ownership_gate WHERE singleton), false) $$;
REVOKE ALL ON FUNCTION platform_private.catalog_ownership_enabled() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------- normalização de nome (servidor)
-- lower + remoção de acentos (translate, sem depender de extensão) + colapso de espaços/pontuação.
CREATE FUNCTION platform_private.catalog_norm_name(p text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path='' AS $$
  SELECT NULLIF(btrim(regexp_replace(
    translate(lower(COALESCE(p,'')),
      'áàâãäåāéèêëēíìîïīóòôõöōúùûüūçñýÿ',
      'aaaaaaaeeeeeiiiiiooooooouuuuucnyy'),
    '[^a-z0-9]+', ' ', 'g')), '') $$;
REVOKE ALL ON FUNCTION platform_private.catalog_norm_name(text) FROM PUBLIC, anon, authenticated;

-- Empresa do ator para filtros de leitura: NULL para anon, SA ou ator sem empresa ativa (=> só global).
CREATE FUNCTION platform_private.catalog_reader_org() RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_uid uuid := auth.uid(); v_org uuid;
BEGIN
  IF v_uid IS NULL OR public.is_platform_superadmin(v_uid) THEN RETURN NULL; END IF;
  v_org := platform_private.h15_actor_organization();
  IF v_org IS NULL OR NOT EXISTS (SELECT 1 FROM public.organizations o
       WHERE o.id=v_org AND o.ativo IS TRUE AND o.status='ativa') THEN RETURN NULL; END IF;
  RETURN v_org;
END $$;
REVOKE ALL ON FUNCTION platform_private.catalog_reader_org() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform_private.catalog_reader_org() TO anon, authenticated;

-- ---------------------------------------------------------------- colunas de dono (NULL = global, sem backfill)
ALTER TABLE public.produtos         ADD COLUMN owner_organization_id uuid NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
                                    ADD COLUMN archived_at timestamptz NULL;
ALTER TABLE public.microrganismos   ADD COLUMN owner_organization_id uuid NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
                                    ADD COLUMN archived_at timestamptz NULL;
ALTER TABLE public.culturas         ADD COLUMN owner_organization_id uuid NULL REFERENCES public.organizations(id) ON DELETE RESTRICT;
ALTER TABLE public.formulacoes      ADD COLUMN owner_organization_id uuid NULL REFERENCES public.organizations(id) ON DELETE RESTRICT;
ALTER TABLE public.catalogo_volumes ADD COLUMN owner_organization_id uuid NULL REFERENCES public.organizations(id) ON DELETE RESTRICT;

-- Unicidade concorrente de nome normalizado DENTRO da empresa (globais legados não são tocados).
CREATE UNIQUE INDEX produtos_owner_norm_uq       ON public.produtos (owner_organization_id, platform_private.catalog_norm_name(nome))       WHERE owner_organization_id IS NOT NULL;
CREATE UNIQUE INDEX microrganismos_owner_norm_uq ON public.microrganismos (owner_organization_id, platform_private.catalog_norm_name(nome)) WHERE owner_organization_id IS NOT NULL;
CREATE UNIQUE INDEX culturas_owner_norm_uq       ON public.culturas (owner_organization_id, platform_private.catalog_norm_name(nome))       WHERE owner_organization_id IS NOT NULL;
-- Busca de duplicata global.
CREATE INDEX produtos_global_norm_idx       ON public.produtos (platform_private.catalog_norm_name(nome))       WHERE owner_organization_id IS NULL;
CREATE INDEX microrganismos_global_norm_idx ON public.microrganismos (platform_private.catalog_norm_name(nome)) WHERE owner_organization_id IS NULL;
CREATE INDEX culturas_global_norm_idx       ON public.culturas (platform_private.catalog_norm_name(nome))       WHERE owner_organization_id IS NULL;
CREATE INDEX formulacoes_owner_idx      ON public.formulacoes (owner_organization_id) WHERE owner_organization_id IS NOT NULL;
CREATE INDEX catalogo_volumes_owner_idx ON public.catalogo_volumes (owner_organization_id) WHERE owner_organization_id IS NOT NULL;

-- ---------------------------------------------------------------- triggers de dono
-- Raiz: dono imutável; dono não-NULL só com gate aberto E vindo do núcleo privado (GUC local de transação
-- escrita apenas pelo núcleo; não é fronteira de autorização — o núcleo já autorizou, o trigger só impede
-- caminhos laterais como SA/service_role/DML legado de criar privados).
CREATE FUNCTION platform_private.trg_catalog_owner_root() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF TG_OP='UPDATE' AND NEW.owner_organization_id IS DISTINCT FROM OLD.owner_organization_id THEN
    RAISE EXCEPTION 'catalog_owner_immutable' USING ERRCODE='42501'; END IF;
  IF TG_OP='INSERT' AND NEW.owner_organization_id IS NOT NULL THEN
    IF NOT platform_private.catalog_ownership_enabled() THEN
      RAISE EXCEPTION 'catalog_ownership_disabled' USING ERRCODE='55000'; END IF;
    IF current_setting('cultivo.catalog_owned_core', true) IS DISTINCT FROM NEW.owner_organization_id::text THEN
      RAISE EXCEPTION 'catalog_owner_forged' USING ERRCODE='42501'; END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION platform_private.trg_catalog_owner_root() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_catalog_owner_root BEFORE INSERT OR UPDATE OF owner_organization_id ON public.produtos       FOR EACH ROW EXECUTE FUNCTION platform_private.trg_catalog_owner_root();
CREATE TRIGGER trg_catalog_owner_root BEFORE INSERT OR UPDATE OF owner_organization_id ON public.microrganismos FOR EACH ROW EXECUTE FUNCTION platform_private.trg_catalog_owner_root();
CREATE TRIGGER trg_catalog_owner_root BEFORE INSERT OR UPDATE OF owner_organization_id ON public.culturas       FOR EACH ROW EXECUTE FUNCTION platform_private.trg_catalog_owner_root();

-- Descendentes: dono = dono do pai (derivado, nunca aceito do cliente); componentes só global ou mesmo dono.
CREATE FUNCTION platform_private.trg_catalog_owner_child() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_parent uuid; v_found boolean := false; v_ref uuid;
BEGIN
  IF NEW.produto_id IS NOT NULL THEN
    SELECT p.owner_organization_id, true INTO v_parent, v_found FROM public.produtos p WHERE p.id=NEW.produto_id;
  ELSIF NEW.microrganismo_id IS NOT NULL AND TG_TABLE_NAME='catalogo_volumes' THEN
    SELECT m.owner_organization_id, true INTO v_parent, v_found FROM public.microrganismos m WHERE m.id=NEW.microrganismo_id;
  END IF;
  IF TG_OP='UPDATE' AND NEW.owner_organization_id IS DISTINCT FROM OLD.owner_organization_id
     AND NEW.owner_organization_id IS DISTINCT FROM v_parent THEN
    RAISE EXCEPTION 'catalog_owner_immutable' USING ERRCODE='42501'; END IF;
  NEW.owner_organization_id := CASE WHEN v_found THEN v_parent ELSE NULL END;
  IF TG_TABLE_NAME='formulacoes' THEN
    IF NEW.microrganismo_id IS NOT NULL THEN
      SELECT m.owner_organization_id INTO v_ref FROM public.microrganismos m WHERE m.id=NEW.microrganismo_id;
      IF v_ref IS NOT NULL AND v_ref IS DISTINCT FROM NEW.owner_organization_id THEN
        RAISE EXCEPTION 'catalog_cross_owner_reference' USING ERRCODE='42501'; END IF;
    END IF;
    IF NEW.component_insumo_id IS NOT NULL THEN
      SELECT p.owner_organization_id INTO v_ref FROM public.produtos p WHERE p.id=NEW.component_insumo_id;
      IF v_ref IS NOT NULL AND v_ref IS DISTINCT FROM NEW.owner_organization_id THEN
        RAISE EXCEPTION 'catalog_cross_owner_reference' USING ERRCODE='42501'; END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION platform_private.trg_catalog_owner_child() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_catalog_owner_child BEFORE INSERT OR UPDATE ON public.formulacoes      FOR EACH ROW EXECUTE FUNCTION platform_private.trg_catalog_owner_child();
CREATE TRIGGER trg_catalog_owner_child BEFORE INSERT OR UPDATE ON public.catalogo_volumes FOR EACH ROW EXECUTE FUNCTION platform_private.trg_catalog_owner_child();

-- ---------------------------------------------------------------- RLS RESTRICTIVE (leitura direta)
-- Interseção com as policies permissivas existentes (não as substitui): global sempre; privado só da empresa
-- do ator. SA/anon => catalog_reader_org() NULL => apenas global.
CREATE POLICY catalog_owner_scope ON public.produtos         AS RESTRICTIVE FOR SELECT TO anon, authenticated
  USING (owner_organization_id IS NULL OR owner_organization_id = platform_private.catalog_reader_org());
CREATE POLICY catalog_owner_scope ON public.microrganismos   AS RESTRICTIVE FOR SELECT TO anon, authenticated
  USING (owner_organization_id IS NULL OR owner_organization_id = platform_private.catalog_reader_org());
CREATE POLICY catalog_owner_scope ON public.culturas         AS RESTRICTIVE FOR SELECT TO anon, authenticated
  USING (owner_organization_id IS NULL OR owner_organization_id = platform_private.catalog_reader_org());
CREATE POLICY catalog_owner_scope ON public.formulacoes      AS RESTRICTIVE FOR SELECT TO anon, authenticated
  USING (owner_organization_id IS NULL OR owner_organization_id = platform_private.catalog_reader_org());
CREATE POLICY catalog_owner_scope ON public.catalogo_volumes AS RESTRICTIVE FOR SELECT TO anon, authenticated
  USING (owner_organization_id IS NULL OR owner_organization_id = platform_private.catalog_reader_org());
-- Policies permissivas de escrita existentes (Staff manage culturas, volumes, formulacoes) ficam inertes:
-- grants seguem SELECT-only. Além disso, restritivas de escrita impedem DML lateral sobre privados.
CREATE POLICY catalog_owner_no_direct_write ON public.culturas AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (owner_organization_id IS NULL) WITH CHECK (owner_organization_id IS NULL);

-- ---------------------------------------------------------------- ledger imutável + idempotência
CREATE TABLE public.catalog_tenant_owned_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL,
  entity_type text NOT NULL CHECK (entity_type IN ('produto','microrganismo','cultura')),
  entity_id uuid NULL,
  operation text NOT NULL CHECK (operation IN ('create','update','archive','composition')),
  idempotency_key uuid NOT NULL,
  payload_hash text NOT NULL,
  reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 10 AND 500),
  before_state jsonb NULL,
  after_state jsonb NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (actor_id, organization_id, idempotency_key)
);
CREATE INDEX catalog_tenant_owned_ledger_org_idx ON public.catalog_tenant_owned_ledger (organization_id, created_at DESC);
REVOKE ALL ON public.catalog_tenant_owned_ledger FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.catalog_tenant_owned_ledger TO service_role;
ALTER TABLE public.catalog_tenant_owned_ledger ENABLE ROW LEVEL SECURITY;
-- Sem policies: leitura/escrita apenas via núcleo DEFINER.
CREATE FUNCTION platform_private.trg_catalog_owned_ledger_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'catalog_owned_ledger_immutable' USING ERRCODE='42501'; END $$;
CREATE TRIGGER trg_catalog_owned_ledger_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON public.catalog_tenant_owned_ledger
  FOR EACH STATEMENT EXECUTE FUNCTION platform_private.trg_catalog_owned_ledger_immutable();

-- ---------------------------------------------------------------- núcleo privado de mutação
-- Uma única entrada; empresa e ator derivados no servidor (catalog_tenant_actor('mutate'): admin/gestor +
-- catalogo_precos, SA negado). NUNCA aceita organization_id/owner do payload.
CREATE FUNCTION platform_private.catalog_owned_mutate_core(
  p_entity_type text, p_operation text, p_entity_id uuid, p_expected_updated_at timestamptz,
  p_payload jsonb, p_reason text, p_idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_org uuid;
  v_reason text := btrim(COALESCE(p_reason,''));
  v_hash text;
  v_prev public.catalog_tenant_owned_ledger%ROWTYPE;
  v_norm text;
  v_dup record;
  v_before jsonb; v_after jsonb; v_id uuid; v_owner uuid; v_upd timestamptz; v_result jsonb;
  v_item jsonb;
BEGIN
  IF NOT platform_private.catalog_ownership_enabled() THEN
    RAISE EXCEPTION 'catalog_ownership_disabled' USING ERRCODE='55000'; END IF;
  v_org := platform_private.catalog_tenant_actor('mutate');
  IF p_entity_type NOT IN ('produto','microrganismo','cultura') OR p_operation NOT IN ('create','update','archive','composition')
     OR p_idempotency_key IS NULL OR (p_operation <> 'create' AND (p_entity_id IS NULL OR p_expected_updated_at IS NULL))
     OR (p_operation='composition' AND p_entity_type <> 'produto')
     OR jsonb_typeof(COALESCE(p_payload,'{}'::jsonb)) <> 'object'
     OR COALESCE(p_payload,'{}'::jsonb) ?| ARRAY['organization_id','owner_organization_id','id','ativo','b2b_enabled','codigo'] THEN
    RAISE EXCEPTION 'catalog_owned_invalid_payload' USING ERRCODE='22023'; END IF;
  IF char_length(v_reason) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'catalog_owned_reason_required' USING ERRCODE='22023'; END IF;
  v_hash := md5(concat_ws('|', p_entity_type, p_operation, COALESCE(p_entity_id::text,''),
                COALESCE(p_expected_updated_at::text,''), COALESCE(p_payload,'{}'::jsonb)::text, v_reason));

  -- Locks em ordem fixa: chave do ator -> nome normalizado na empresa (create/update) -> item.
  PERFORM pg_advisory_xact_lock(hashtextextended(concat_ws(':','ctok',v_uid::text,v_org::text,p_idempotency_key::text),0));
  SELECT * INTO v_prev FROM public.catalog_tenant_owned_ledger
   WHERE actor_id=v_uid AND organization_id=v_org AND idempotency_key=p_idempotency_key;
  IF FOUND THEN
    IF v_prev.payload_hash <> v_hash THEN RAISE EXCEPTION 'catalog_owned_idempotency_conflict' USING ERRCODE='22023'; END IF;
    RETURN v_prev.result || jsonb_build_object('replayed', true);
  END IF;

  IF p_operation IN ('create','update') AND p_payload ? 'nome' THEN
    v_norm := platform_private.catalog_norm_name(p_payload->>'nome');
    IF v_norm IS NULL OR char_length(btrim(p_payload->>'nome')) > 500 THEN
      RAISE EXCEPTION 'catalog_owned_invalid_payload' USING ERRCODE='22023'; END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(concat_ws(':','cton',p_entity_type,v_norm),0));
    -- Duplicata global: devolve id/ativo do GLOBAL para orientar "localizar e Exibir"; nunca ativa.
    EXECUTE format('SELECT id, ativo FROM public.%I WHERE owner_organization_id IS NULL
                     AND platform_private.catalog_norm_name(nome)=$1 ORDER BY ativo DESC, id LIMIT 1',
                   CASE p_entity_type WHEN 'produto' THEN 'produtos' WHEN 'microrganismo' THEN 'microrganismos' ELSE 'culturas' END)
      INTO v_dup USING v_norm;
    IF v_dup.id IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE='23505',
        MESSAGE = CASE WHEN v_dup.ativo THEN 'catalog_owned_duplicate_global_active' ELSE 'catalog_owned_duplicate_global_inactive' END,
        DETAIL = v_dup.id::text;
    END IF;
    -- Duplicata própria (somente a própria empresa; outras empresas nunca consultadas).
    EXECUTE format('SELECT id, true AS ativo FROM public.%I WHERE owner_organization_id=$1
                     AND platform_private.catalog_norm_name(nome)=$2 AND ($3::uuid IS NULL OR id<>$3) LIMIT 1',
                   CASE p_entity_type WHEN 'produto' THEN 'produtos' WHEN 'microrganismo' THEN 'microrganismos' ELSE 'culturas' END)
      INTO v_dup USING v_org, v_norm, p_entity_id;
    IF v_dup.id IS NOT NULL THEN
      RAISE EXCEPTION 'catalog_owned_duplicate_own' USING ERRCODE='23505', DETAIL=v_dup.id::text; END IF;
  ELSIF p_operation='create' THEN
    RAISE EXCEPTION 'catalog_owned_invalid_payload' USING ERRCODE='22023';
  END IF;

  PERFORM set_config('cultivo.catalog_owned_core', v_org::text, true);

  IF p_operation='create' THEN
    IF p_entity_type='produto' THEN
      IF NOT (p_payload->>'tipo') = ANY (ARRAY['inseticida','fungicida','solo','inoculante','solubilizador']) THEN
        RAISE EXCEPTION 'catalog_owned_invalid_payload' USING ERRCODE='22023'; END IF;
      INSERT INTO public.produtos(nome, tipo, descricao, modo_acao, funcao_completa, modo_aplicacao, ativo, b2b_enabled, owner_organization_id)
      VALUES (btrim(p_payload->>'nome'), (p_payload->>'tipo')::public.tipo_produto, p_payload->>'descricao', p_payload->>'modo_acao',
              p_payload->>'funcao_completa', p_payload->>'modo_aplicacao', true, false, v_org)
      RETURNING id, updated_at, to_jsonb(produtos.*) INTO v_id, v_upd, v_after;
    ELSIF p_entity_type='microrganismo' THEN
      IF NOT (p_payload->>'tipo') = ANY (ARRAY['bacteria','fungo','levedura','consorcio']) THEN
        RAISE EXCEPTION 'catalog_owned_invalid_payload' USING ERRCODE='22023'; END IF;
      INSERT INTO public.microrganismos(nome, tipo, nome_cientifico, descricao, ativo, b2b_enabled, owner_organization_id)
      VALUES (btrim(p_payload->>'nome'), (p_payload->>'tipo')::public.tipo_microrganismo, p_payload->>'nome_cientifico',
              p_payload->>'descricao', true, false, v_org)
      RETURNING id, updated_at, to_jsonb(microrganismos.*) INTO v_id, v_upd, v_after;
    ELSE
      INSERT INTO public.culturas(nome, descricao, ativo, owner_organization_id)
      VALUES (btrim(p_payload->>'nome'), p_payload->>'descricao', true, v_org)
      RETURNING id, updated_at, to_jsonb(culturas.*) INTO v_id, v_upd, v_after;
    END IF;
  ELSE
    -- Item precisa ser PRÓPRIO; global ou de outra empresa => mesma resposta "não encontrado" (sem oráculo).
    EXECUTE format('SELECT owner_organization_id, updated_at, to_jsonb(t.*) FROM public.%I t WHERE id=$1 FOR UPDATE',
                   CASE p_entity_type WHEN 'produto' THEN 'produtos' WHEN 'microrganismo' THEN 'microrganismos' ELSE 'culturas' END)
      INTO v_owner, v_upd, v_before USING p_entity_id;
    IF v_owner IS DISTINCT FROM v_org THEN RAISE EXCEPTION 'catalog_owned_not_found' USING ERRCODE='P0002'; END IF;
    IF v_upd IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'catalog_owned_stale' USING ERRCODE='40001'; END IF;
    v_id := p_entity_id;
    IF p_operation='update' THEN
      IF p_payload ?| ARRAY['tipo'] AND p_entity_type='cultura' THEN RAISE EXCEPTION 'catalog_owned_invalid_payload' USING ERRCODE='22023'; END IF;
      IF p_entity_type='produto' THEN
        UPDATE public.produtos SET nome=COALESCE(btrim(p_payload->>'nome'),nome),
          descricao=CASE WHEN p_payload ? 'descricao' THEN p_payload->>'descricao' ELSE descricao END,
          modo_acao=CASE WHEN p_payload ? 'modo_acao' THEN p_payload->>'modo_acao' ELSE modo_acao END,
          funcao_completa=CASE WHEN p_payload ? 'funcao_completa' THEN p_payload->>'funcao_completa' ELSE funcao_completa END,
          modo_aplicacao=CASE WHEN p_payload ? 'modo_aplicacao' THEN p_payload->>'modo_aplicacao' ELSE modo_aplicacao END,
          updated_at=clock_timestamp()
        WHERE id=v_id RETURNING updated_at, to_jsonb(produtos.*) INTO v_upd, v_after;
      ELSIF p_entity_type='microrganismo' THEN
        UPDATE public.microrganismos SET nome=COALESCE(btrim(p_payload->>'nome'),nome),
          nome_cientifico=CASE WHEN p_payload ? 'nome_cientifico' THEN p_payload->>'nome_cientifico' ELSE nome_cientifico END,
          descricao=CASE WHEN p_payload ? 'descricao' THEN p_payload->>'descricao' ELSE descricao END,
          updated_at=clock_timestamp()
        WHERE id=v_id RETURNING updated_at, to_jsonb(microrganismos.*) INTO v_upd, v_after;
      ELSE
        UPDATE public.culturas SET nome=COALESCE(btrim(p_payload->>'nome'),nome),
          descricao=CASE WHEN p_payload ? 'descricao' THEN p_payload->>'descricao' ELSE descricao END,
          updated_at=clock_timestamp()
        WHERE id=v_id RETURNING updated_at, to_jsonb(culturas.*) INTO v_upd, v_after;
      END IF;
    ELSIF p_operation='archive' THEN
      -- Exclusão LÓGICA: preserva referências/históricos/snapshots; não apaga linha.
      IF p_entity_type='produto' THEN
        UPDATE public.produtos SET ativo=false, archived_at=clock_timestamp(), updated_at=clock_timestamp()
         WHERE id=v_id RETURNING updated_at, to_jsonb(produtos.*) INTO v_upd, v_after;
      ELSIF p_entity_type='microrganismo' THEN
        UPDATE public.microrganismos SET ativo=false, archived_at=clock_timestamp(), updated_at=clock_timestamp()
         WHERE id=v_id RETURNING updated_at, to_jsonb(microrganismos.*) INTO v_upd, v_after;
      ELSE
        UPDATE public.culturas SET ativo=false, desativada_em=clock_timestamp(), desativada_por=v_uid, updated_at=clock_timestamp()
         WHERE id=v_id RETURNING updated_at, to_jsonb(culturas.*) INTO v_upd, v_after;
      END IF;
    ELSE -- composition (produto próprio): itens = [{microrganismo_id|component_insumo_id, volume_ml, proporcao}]
      IF jsonb_typeof(p_payload->'itens') <> 'array' OR jsonb_array_length(p_payload->'itens') > 50 THEN
        RAISE EXCEPTION 'catalog_owned_invalid_payload' USING ERRCODE='22023'; END IF;
      FOR v_item IN SELECT value FROM jsonb_array_elements(p_payload->'itens') LOOP
        IF ((v_item ? 'microrganismo_id') = (v_item ? 'component_insumo_id'))
           OR NOT ((v_item->>'volume_ml') ~ '^[0-9]{1,7}(\.[0-9]{1,6})?$') OR (v_item->>'volume_ml')::numeric <= 0 THEN
          RAISE EXCEPTION 'catalog_owned_invalid_payload' USING ERRCODE='22023'; END IF;
        -- Componente: ativo e global ou da própria empresa (mesma resposta para inexistente/alheio).
        IF v_item ? 'microrganismo_id' AND NOT EXISTS (SELECT 1 FROM public.microrganismos m
             WHERE m.id=(v_item->>'microrganismo_id')::uuid AND m.ativo AND (m.owner_organization_id IS NULL OR m.owner_organization_id=v_org)) THEN
          RAISE EXCEPTION 'catalog_owned_component_unavailable' USING ERRCODE='42501'; END IF;
        IF v_item ? 'component_insumo_id' AND NOT EXISTS (SELECT 1 FROM public.produtos p
             WHERE p.id=(v_item->>'component_insumo_id')::uuid AND p.ativo AND (p.owner_organization_id IS NULL OR p.owner_organization_id=v_org)) THEN
          RAISE EXCEPTION 'catalog_owned_component_unavailable' USING ERRCODE='42501'; END IF;
      END LOOP;
      SELECT jsonb_agg(to_jsonb(f.*) ORDER BY f.id) INTO v_before FROM public.formulacoes f WHERE f.produto_id=v_id;
      DELETE FROM public.formulacoes WHERE produto_id=v_id; -- somente do produto PRÓPRIO; histórico no ledger.
      INSERT INTO public.formulacoes(produto_id, microrganismo_id, component_insumo_id, volume_ml, proporcao)
      SELECT v_id, NULLIF(e->>'microrganismo_id','')::uuid, NULLIF(e->>'component_insumo_id','')::uuid,
             (e->>'volume_ml')::numeric, NULLIF(e->>'proporcao','')::numeric
        FROM jsonb_array_elements(p_payload->'itens') e;
      UPDATE public.produtos SET updated_at=clock_timestamp() WHERE id=v_id RETURNING updated_at INTO v_upd;
      SELECT jsonb_agg(to_jsonb(f.*) ORDER BY f.id) INTO v_after FROM public.formulacoes f WHERE f.produto_id=v_id;
    END IF;
  END IF;

  PERFORM set_config('cultivo.catalog_owned_core', '', true);
  v_result := jsonb_build_object('id', v_id, 'entity_type', p_entity_type, 'operation', p_operation,
                                 'updated_at', v_upd, 'origin', 'proprio', 'idempotency_key', p_idempotency_key, 'replayed', false);
  INSERT INTO public.catalog_tenant_owned_ledger(organization_id, actor_id, entity_type, entity_id, operation,
    idempotency_key, payload_hash, reason, before_state, after_state, result)
  VALUES (v_org, v_uid, p_entity_type, v_id, p_operation, p_idempotency_key, v_hash, v_reason, v_before, v_after, v_result);
  RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION platform_private.catalog_owned_mutate_core(text,text,uuid,timestamptz,jsonb,text,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION platform_private.catalog_owned_mutate_core(text,text,uuid,timestamptz,jsonb,text,uuid) TO authenticated;

-- Fachada pública INVOKER (sem parâmetro de empresa).
CREATE FUNCTION public.tenant_catalog_owned_mutate(
  p_entity_type text, p_operation text, p_entity_id uuid, p_expected_updated_at timestamptz,
  p_payload jsonb, p_reason text, p_idempotency_key uuid)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $$
  SELECT platform_private.catalog_owned_mutate_core(p_entity_type, p_operation, p_entity_id, p_expected_updated_at,
                                                    p_payload, p_reason, p_idempotency_key) $$;
REVOKE ALL ON FUNCTION public.tenant_catalog_owned_mutate(text,text,uuid,timestamptz,jsonb,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tenant_catalog_owned_mutate(text,text,uuid,timestamptz,jsonb,text,uuid) TO authenticated;

-- ---------------------------------------------------------------- invariantes pós (Bombarbio/visibilidade)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.produtos WHERE owner_organization_id IS NOT NULL)
     OR EXISTS (SELECT 1 FROM public.microrganismos WHERE owner_organization_id IS NOT NULL)
     OR EXISTS (SELECT 1 FROM public.culturas WHERE owner_organization_id IS NOT NULL)
     OR EXISTS (SELECT 1 FROM public.formulacoes WHERE owner_organization_id IS NOT NULL)
     OR EXISTS (SELECT 1 FROM public.catalogo_volumes WHERE owner_organization_id IS NOT NULL) THEN
    RAISE EXCEPTION 'ownership_post_unexpected_private_rows'; END IF;
  IF (SELECT string_agg(f.volume_ml::text,'+' ORDER BY f.volume_ml DESC) FROM public.formulacoes f
        WHERE f.produto_id='1875527c-a65a-483b-a6c2-9122d5ec2a51') IS DISTINCT FROM '334+333+333'
     AND (SELECT string_agg(round(f.volume_ml)::text,'+' ORDER BY f.volume_ml DESC) FROM public.formulacoes f
        WHERE f.produto_id='1875527c-a65a-483b-a6c2-9122d5ec2a51') IS DISTINCT FROM '334+333+333' THEN
    RAISE EXCEPTION 'ownership_post_bombarbio_recipe_drift'; END IF;
  IF platform_private.catalog_ownership_enabled() THEN RAISE EXCEPTION 'ownership_post_gate_must_be_off'; END IF;
END $$;
