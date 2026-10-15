-- =====================================================================================
-- CANDIDATO 01/02 — NÃO APLICAR sem revisão independente. Canônico obrigatório: swzpzcwiasxmjutrmvkm.
-- Fase 3: FUNDAÇÃO de ownership + CRUD de itens PRÓPRIOS, gate fail-closed (OFF).
-- Revisão 2 (após revisão independente de 0fe35743): corrige achados 1–8.
-- Ordem: 01 (este) -> 02 proposed-tenant-catalog-ownership-02-readers.sql. Gate continua OFF após ambos;
-- abrir exige migration futura que prove B2B/fiscal/produção/descendentes (ver relatório).
--
-- Garantias:
--  * owner_organization_id NULL em todo legado (NULL = global). Sem backfill.
--  * Autorização de linha privada NO TRIGGER pelo ator real (catalog_tenant_actor('mutate') = dono):
--    nenhuma GUC é fronteira de autorização. SA, service_role, anon e outra empresa são rejeitados.
--  * Dono e pai imutáveis; descendentes derivam dono do pai e rejeitam referência privada alheia.
--  * Exclusão física de privado proibida (somente arquivamento lógico).
--  * Leitura direta: RESTRICTIVE SELECT global + empresa do ator; escrita direta: RESTRICTIVE por comando.
--  * Duplicata: normalização NFD (acentos/Unicode combinado), lock consultivo COMUM a writers SA e tenant
--    (tomado no trigger raiz para qualquer INSERT/UPDATE de nome), índices legados reescopados a globais.
--  * Não altera grants (authenticated segue SELECT-only nas 5 tabelas) nem contenção aplicada.
-- Rollback: rollback-tenant-catalog-ownership.sql (preserva filtros se houver privados; ledger intacto).
-- =====================================================================================

-- ---------------------------------------------------------------- preflight fail-closed
DO $$
DECLARE v_bomb record;
BEGIN
  IF current_setting('request.jwt.claims', true) IS NOT NULL AND current_setting('request.jwt.claims', true) <> '' THEN
    RAISE EXCEPTION 'ownership_preflight_must_run_as_owner'; END IF;
  IF current_setting('server_version_num')::int < 130000 OR pg_encoding_to_char((SELECT encoding FROM pg_database WHERE datname=current_database())) <> 'UTF8' THEN
    RAISE EXCEPTION 'ownership_preflight_normalize_unsupported'; END IF;
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
  -- Índices legados auditados (serão reescopados a globais).
  IF pg_get_indexdef('public.microrganismos_nome_unique'::regclass) <> 'CREATE UNIQUE INDEX microrganismos_nome_unique ON public.microrganismos USING btree (nome)'
    OR pg_get_indexdef('public.culturas_nome_ci_uidx'::regclass) <> 'CREATE UNIQUE INDEX culturas_nome_ci_uidx ON public.culturas USING btree (lower(btrim(nome)))' THEN
    RAISE EXCEPTION 'ownership_preflight_legacy_index_drift'; END IF;
  SELECT p.id, p.ativo, p.b2b_enabled INTO v_bomb FROM public.produtos p WHERE p.id='1875527c-a65a-483b-a6c2-9122d5ec2a51';
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

-- ---------------------------------------------------------------- normalização (NFD + remoção de marcas combinantes)
-- Forma QUALIFICADA exige o literal 'NFD' (a palavra-chave NFD só vale na sintaxe especial não qualificada:
-- revisão 110c9c41 reproduziu 42703 "column nfd does not exist"). Expressão EXATA abaixo testada read-only no
-- canônico (PG 17.6/UTF8): Açúcar->acucar, Único e U+0301->unico, ÁÀÂÃÄÅ->aaaaaa, ÉÈÊË->eeee, ÍÌÎÏ->iiii,
-- ÓÒÔÕÖ->ooooo, ÚÙÛÜ->uuuu, Çç->cc, Ññ->nn, Ýÿ->yy, 28 acentos minúsculos->aaaaaaeeeeiiiiooooouuuucnyy, '   '->NULL.
CREATE FUNCTION platform_private.catalog_norm_name(p text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT SET search_path='' AS $$
  SELECT NULLIF(pg_catalog.btrim(pg_catalog.regexp_replace(
    pg_catalog.regexp_replace(pg_catalog.normalize(pg_catalog.lower(p), 'NFD'), E'[\\u0300-\\u036f]', '', 'g'),
    '[^a-z0-9]+', ' ', 'g')), '') $$;
REVOKE ALL ON FUNCTION platform_private.catalog_norm_name(text) FROM PUBLIC, anon, authenticated;
DO $$ BEGIN
  IF platform_private.catalog_norm_name('Ácido  Úmido') <> 'acido umido' OR platform_private.catalog_norm_name('ação') <> 'acao'
    OR platform_private.catalog_norm_name('Ñandu') <> 'nandu' OR platform_private.catalog_norm_name(E'cafe\u0301') <> 'cafe'
    OR platform_private.catalog_norm_name('CAFÉ') <> 'cafe' OR platform_private.catalog_norm_name('Pão/Ç') <> 'pao c'
    OR platform_private.catalog_norm_name('Açúcar') <> 'acucar' OR platform_private.catalog_norm_name('Único') <> 'unico'
    OR platform_private.catalog_norm_name(E'U\u0301nico') <> 'unico'
    OR platform_private.catalog_norm_name('ÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑÝ') <> 'aaaaaaeeeeiiiiooooouuuucny'
    OR platform_private.catalog_norm_name('áàâãäåéèêëíìîïóòôõöúùûüçñýÿ') <> 'aaaaaaeeeeiiiiooooouuuucnyy'
    OR platform_private.catalog_norm_name('  ') IS NOT NULL THEN
    RAISE EXCEPTION 'ownership_norm_selftest_failed'; END IF;
END $$;

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

-- Lock consultivo comum (tenant core E writers SA via trigger raiz).
CREATE FUNCTION platform_private.catalog_name_lock(p_entity text, p_nome text) RETURNS void
LANGUAGE sql VOLATILE SET search_path='' AS $$
  SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'cton:'||p_entity||':'||COALESCE(platform_private.catalog_norm_name(p_nome),''),0)) $$;
REVOKE ALL ON FUNCTION platform_private.catalog_name_lock(text,text) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------- colunas de dono (NULL = global, sem backfill)
ALTER TABLE public.produtos         ADD COLUMN owner_organization_id uuid NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
                                    ADD COLUMN archived_at timestamptz NULL;
ALTER TABLE public.microrganismos   ADD COLUMN owner_organization_id uuid NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
                                    ADD COLUMN archived_at timestamptz NULL;
ALTER TABLE public.culturas         ADD COLUMN owner_organization_id uuid NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
                                    ADD COLUMN archived_at timestamptz NULL;
ALTER TABLE public.formulacoes      ADD COLUMN owner_organization_id uuid NULL REFERENCES public.organizations(id) ON DELETE RESTRICT;
ALTER TABLE public.catalogo_volumes ADD COLUMN owner_organization_id uuid NULL REFERENCES public.organizations(id) ON DELETE RESTRICT;

-- Índices legados reescopados: unicidade global preservada SÓ entre globais (cria antes de remover).
CREATE UNIQUE INDEX microrganismos_nome_global_uq ON public.microrganismos (nome) WHERE owner_organization_id IS NULL;
CREATE UNIQUE INDEX culturas_nome_ci_global_uq   ON public.culturas (lower(btrim(nome))) WHERE owner_organization_id IS NULL;
ALTER TABLE public.microrganismos DROP CONSTRAINT IF EXISTS microrganismos_nome_unique;
DROP INDEX IF EXISTS public.microrganismos_nome_unique;
DROP INDEX IF EXISTS public.culturas_nome_ci_uidx;
-- codigo (produtos_codigo_key, microrganismos_codigo_key/_uniq) mantido global: gerado por trigger, nunca aceito do
-- cliente (payload proíbe 'codigo'); não colide por nome. Sequência compartilhada documentada como risco P3.

CREATE UNIQUE INDEX produtos_owner_norm_uq       ON public.produtos (owner_organization_id, platform_private.catalog_norm_name(nome))       WHERE owner_organization_id IS NOT NULL;
CREATE UNIQUE INDEX microrganismos_owner_norm_uq ON public.microrganismos (owner_organization_id, platform_private.catalog_norm_name(nome)) WHERE owner_organization_id IS NOT NULL;
CREATE UNIQUE INDEX culturas_owner_norm_uq       ON public.culturas (owner_organization_id, platform_private.catalog_norm_name(nome))       WHERE owner_organization_id IS NOT NULL;
CREATE INDEX produtos_global_norm_idx       ON public.produtos (platform_private.catalog_norm_name(nome))       WHERE owner_organization_id IS NULL;
CREATE INDEX microrganismos_global_norm_idx ON public.microrganismos (platform_private.catalog_norm_name(nome)) WHERE owner_organization_id IS NULL;
CREATE INDEX culturas_global_norm_idx       ON public.culturas (platform_private.catalog_norm_name(nome))       WHERE owner_organization_id IS NULL;
CREATE INDEX produtos_owner_list_idx        ON public.produtos (owner_organization_id, nome, id)       WHERE owner_organization_id IS NOT NULL;
CREATE INDEX microrganismos_owner_list_idx  ON public.microrganismos (owner_organization_id, nome, id) WHERE owner_organization_id IS NOT NULL;
CREATE INDEX culturas_owner_list_idx        ON public.culturas (owner_organization_id, nome, id)       WHERE owner_organization_id IS NOT NULL;
CREATE INDEX formulacoes_owner_idx      ON public.formulacoes (owner_organization_id) WHERE owner_organization_id IS NOT NULL;
CREATE INDEX catalogo_volumes_owner_idx ON public.catalogo_volumes (owner_organization_id) WHERE owner_organization_id IS NOT NULL;

-- ---------------------------------------------------------------- autorização de linha privada (sem GUC)
CREATE FUNCTION platform_private.catalog_assert_owner_actor(p_owner uuid) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NOT platform_private.catalog_ownership_enabled() THEN
    RAISE EXCEPTION 'catalog_ownership_disabled' USING ERRCODE='55000'; END IF;
  -- Lança 42501 para anon/service_role (sem auth.uid), SA, outra role, sem catalogo_precos ou empresa inativa.
  IF platform_private.catalog_tenant_actor('mutate') IS DISTINCT FROM p_owner THEN
    RAISE EXCEPTION 'catalog_owner_forged' USING ERRCODE='42501'; END IF;
END $$;
REVOKE ALL ON FUNCTION platform_private.catalog_assert_owner_actor(uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------- trigger raiz
CREATE FUNCTION platform_private.trg_catalog_owner_root() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_entity text := CASE TG_TABLE_NAME WHEN 'produtos' THEN 'produto' WHEN 'microrganismos' THEN 'microrganismo' ELSE 'cultura' END;
        v_hit boolean;
BEGIN
  IF TG_OP='DELETE' THEN
    IF OLD.owner_organization_id IS NOT NULL THEN
      RAISE EXCEPTION 'catalog_owned_physical_delete_forbidden' USING ERRCODE='42501'; END IF;
    RETURN OLD;
  END IF;
  IF TG_OP='UPDATE' AND NEW.owner_organization_id IS DISTINCT FROM OLD.owner_organization_id THEN
    RAISE EXCEPTION 'catalog_owner_immutable' USING ERRCODE='42501'; END IF;
  IF NEW.owner_organization_id IS NOT NULL THEN
    PERFORM platform_private.catalog_assert_owner_actor(NEW.owner_organization_id);
  END IF;
  -- Lock comum por nome normalizado: serializa writers SA (globais) e tenant (próprios).
  IF TG_OP='INSERT' OR NEW.nome IS DISTINCT FROM OLD.nome THEN
    PERFORM platform_private.catalog_name_lock(v_entity, NEW.nome);
    IF NEW.owner_organization_id IS NOT NULL THEN
      EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I WHERE owner_organization_id IS NULL
                        AND platform_private.catalog_norm_name(nome)=platform_private.catalog_norm_name($1))', TG_TABLE_NAME)
        INTO v_hit USING NEW.nome;
      IF v_hit THEN RAISE EXCEPTION 'catalog_owned_duplicate_global' USING ERRCODE='23505'; END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION platform_private.trg_catalog_owner_root() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_catalog_owner_root BEFORE INSERT OR UPDATE OR DELETE ON public.produtos       FOR EACH ROW EXECUTE FUNCTION platform_private.trg_catalog_owner_root();
CREATE TRIGGER trg_catalog_owner_root BEFORE INSERT OR UPDATE OR DELETE ON public.microrganismos FOR EACH ROW EXECUTE FUNCTION platform_private.trg_catalog_owner_root();
CREATE TRIGGER trg_catalog_owner_root BEFORE INSERT OR UPDATE OR DELETE ON public.culturas       FOR EACH ROW EXECUTE FUNCTION platform_private.trg_catalog_owner_root();

-- ---------------------------------------------------------------- triggers descendentes (um por tabela)
-- Funções separadas: nenhum ramo acessa campo inexistente na outra tabela (revisão 110c9c41, achado C).
-- Dono sempre derivado do pai; pai e dono imutáveis; refs privadas alheias rejeitadas; globais seguem livres
-- (somente o caminho já autorizado de SA/produção existente, que nunca toca privados).
CREATE FUNCTION platform_private.trg_catalog_owner_child_formulacoes() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_parent uuid; v_ref uuid;
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') AND OLD.owner_organization_id IS NOT NULL THEN
    PERFORM platform_private.catalog_assert_owner_actor(OLD.owner_organization_id); END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  IF TG_OP='UPDATE' THEN
    IF NEW.produto_id IS DISTINCT FROM OLD.produto_id OR NEW.microrganismo_id IS DISTINCT FROM OLD.microrganismo_id
       OR NEW.component_insumo_id IS DISTINCT FROM OLD.component_insumo_id THEN
      RAISE EXCEPTION 'catalog_parent_immutable' USING ERRCODE='42501'; END IF;
    IF NEW.owner_organization_id IS DISTINCT FROM OLD.owner_organization_id THEN
      RAISE EXCEPTION 'catalog_owner_immutable' USING ERRCODE='42501'; END IF;
  END IF;
  SELECT p.owner_organization_id INTO v_parent FROM public.produtos p WHERE p.id=NEW.produto_id;
  IF TG_OP='INSERT' AND NEW.owner_organization_id IS NOT NULL AND NEW.owner_organization_id IS DISTINCT FROM v_parent THEN
    RAISE EXCEPTION 'catalog_owner_forged' USING ERRCODE='42501'; END IF;
  NEW.owner_organization_id := v_parent;
  IF v_parent IS NOT NULL THEN PERFORM platform_private.catalog_assert_owner_actor(v_parent); END IF;
  IF NEW.microrganismo_id IS NOT NULL THEN
    SELECT m.owner_organization_id INTO v_ref FROM public.microrganismos m WHERE m.id=NEW.microrganismo_id;
    IF v_ref IS NOT NULL AND v_ref IS DISTINCT FROM v_parent THEN
      RAISE EXCEPTION 'catalog_cross_owner_reference' USING ERRCODE='42501'; END IF;
  END IF;
  IF NEW.component_insumo_id IS NOT NULL THEN
    SELECT p.owner_organization_id INTO v_ref FROM public.produtos p WHERE p.id=NEW.component_insumo_id;
    IF v_ref IS NOT NULL AND v_ref IS DISTINCT FROM v_parent THEN
      RAISE EXCEPTION 'catalog_cross_owner_reference' USING ERRCODE='42501'; END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION platform_private.trg_catalog_owner_child_formulacoes() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_catalog_owner_child BEFORE INSERT OR UPDATE OR DELETE ON public.formulacoes
  FOR EACH ROW EXECUTE FUNCTION platform_private.trg_catalog_owner_child_formulacoes();

CREATE FUNCTION platform_private.trg_catalog_owner_child_volumes() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_parent uuid;
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') AND OLD.owner_organization_id IS NOT NULL THEN
    PERFORM platform_private.catalog_assert_owner_actor(OLD.owner_organization_id); END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  IF TG_OP='UPDATE' THEN
    IF NEW.produto_id IS DISTINCT FROM OLD.produto_id OR NEW.microrganismo_id IS DISTINCT FROM OLD.microrganismo_id
       OR NEW.item_tipo IS DISTINCT FROM OLD.item_tipo THEN
      RAISE EXCEPTION 'catalog_parent_immutable' USING ERRCODE='42501'; END IF;
    IF NEW.owner_organization_id IS DISTINCT FROM OLD.owner_organization_id THEN
      RAISE EXCEPTION 'catalog_owner_immutable' USING ERRCODE='42501'; END IF;
  END IF;
  IF NEW.produto_id IS NOT NULL THEN
    SELECT p.owner_organization_id INTO v_parent FROM public.produtos p WHERE p.id=NEW.produto_id;
  ELSIF NEW.microrganismo_id IS NOT NULL THEN
    SELECT m.owner_organization_id INTO v_parent FROM public.microrganismos m WHERE m.id=NEW.microrganismo_id;
  END IF;
  IF TG_OP='INSERT' AND NEW.owner_organization_id IS NOT NULL AND NEW.owner_organization_id IS DISTINCT FROM v_parent THEN
    RAISE EXCEPTION 'catalog_owner_forged' USING ERRCODE='42501'; END IF;
  NEW.owner_organization_id := v_parent;
  IF v_parent IS NOT NULL THEN PERFORM platform_private.catalog_assert_owner_actor(v_parent); END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION platform_private.trg_catalog_owner_child_volumes() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_catalog_owner_child BEFORE INSERT OR UPDATE OR DELETE ON public.catalogo_volumes
  FOR EACH ROW EXECUTE FUNCTION platform_private.trg_catalog_owner_child_volumes();

-- Regressão obrigatória do achado C (executada no próprio DDL, como owner, desfeita por exceção controlada):
-- UPDATE no-op de linha GLOBAL existente nas duas tabelas não pode falhar por campo inexistente.
DO $$
BEGIN
  BEGIN
    UPDATE public.formulacoes SET volume_ml=volume_ml WHERE id=(SELECT id FROM public.formulacoes ORDER BY id LIMIT 1);
    UPDATE public.catalogo_volumes SET ordem=ordem WHERE id=(SELECT id FROM public.catalogo_volumes ORDER BY id LIMIT 1);
    RAISE EXCEPTION 'ownership_child_selftest_ok';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'ownership_child_selftest_ok' THEN RAISE; END IF;
  END;
END $$;

-- Visibilidade (Fase 1) só se aplica a GLOBAIS: preferência sobre item privado é rejeitada.
CREATE FUNCTION platform_private.trg_catalog_visibility_global_only() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF (NEW.produto_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.produtos WHERE id=NEW.produto_id AND owner_organization_id IS NOT NULL))
    OR (NEW.microrganismo_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.microrganismos WHERE id=NEW.microrganismo_id AND owner_organization_id IS NOT NULL))
    OR (NEW.cultura_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.culturas WHERE id=NEW.cultura_id AND owner_organization_id IS NOT NULL)) THEN
    RAISE EXCEPTION 'catalog_visibility_item_not_found' USING ERRCODE='P0002'; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION platform_private.trg_catalog_visibility_global_only() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_catalog_visibility_global_only BEFORE INSERT OR UPDATE ON public.catalog_tenant_visibility
  FOR EACH ROW EXECUTE FUNCTION platform_private.trg_catalog_visibility_global_only();

-- ---------------------------------------------------------------- RLS RESTRICTIVE
-- SELECT: global + empresa do ator (SA/anon só global). Escrita: por comando, só globais via DML direto
-- (privados apenas pelo núcleo DEFINER, que roda como owner). SELECT nunca é restringido pelas policies de escrita.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['produtos','microrganismos','culturas','formulacoes','catalogo_volumes'] LOOP
    EXECUTE format('CREATE POLICY catalog_owner_scope ON public.%I AS RESTRICTIVE FOR SELECT TO anon, authenticated
      USING (owner_organization_id IS NULL OR owner_organization_id = platform_private.catalog_reader_org())', t);
    EXECUTE format('CREATE POLICY catalog_owner_no_direct_insert ON public.%I AS RESTRICTIVE FOR INSERT TO anon, authenticated
      WITH CHECK (owner_organization_id IS NULL)', t);
    EXECUTE format('CREATE POLICY catalog_owner_no_direct_update ON public.%I AS RESTRICTIVE FOR UPDATE TO anon, authenticated
      USING (owner_organization_id IS NULL) WITH CHECK (owner_organization_id IS NULL)', t);
    EXECUTE format('CREATE POLICY catalog_owner_no_direct_delete ON public.%I AS RESTRICTIVE FOR DELETE TO anon, authenticated
      USING (owner_organization_id IS NULL)', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------- ledger imutável
CREATE TABLE public.catalog_tenant_owned_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL,
  entity_type text NOT NULL CHECK (entity_type IN ('produto','microrganismo','cultura')),
  entity_id uuid NOT NULL,
  operation text NOT NULL CHECK (operation IN ('create','update','archive','restore','composition')),
  idempotency_key uuid NOT NULL,
  payload_hash text NOT NULL,
  reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 10 AND 500),
  before_state jsonb NULL,
  after_state jsonb NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (actor_id, organization_id, idempotency_key)
);
CREATE INDEX catalog_tenant_owned_ledger_org_idx ON public.catalog_tenant_owned_ledger (organization_id, created_at DESC);
CREATE INDEX catalog_tenant_owned_ledger_entity_idx ON public.catalog_tenant_owned_ledger (organization_id, entity_type, entity_id);
REVOKE ALL ON public.catalog_tenant_owned_ledger FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.catalog_tenant_owned_ledger TO service_role;
ALTER TABLE public.catalog_tenant_owned_ledger ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION platform_private.trg_catalog_owned_ledger_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'catalog_owned_ledger_immutable' USING ERRCODE='42501'; END $$;
CREATE TRIGGER trg_catalog_owned_ledger_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON public.catalog_tenant_owned_ledger
  FOR EACH STATEMENT EXECUTE FUNCTION platform_private.trg_catalog_owned_ledger_immutable();

-- ---------------------------------------------------------------- núcleo de mutação
-- Whitelist por entidade/operação; NULLs rejeitados com IS NOT TRUE; arquivados só aceitam 'restore'.
CREATE FUNCTION platform_private.catalog_owned_allowed_keys(p_entity text, p_operation text) RETURNS text[]
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT CASE
    WHEN p_operation IN ('archive','restore') THEN ARRAY[]::text[]
    WHEN p_operation='composition' THEN ARRAY['itens']
    WHEN p_entity='produto' AND p_operation='create' THEN ARRAY['nome','tipo','descricao','modo_acao','funcao_completa','modo_aplicacao','familia_catalogo','classe_catalogo']
    WHEN p_entity='produto' THEN ARRAY['nome','descricao','modo_acao','funcao_completa','modo_aplicacao','familia_catalogo','classe_catalogo']
    WHEN p_entity='microrganismo' AND p_operation='create' THEN ARRAY['nome','tipo','nome_cientifico','descricao']
    WHEN p_entity='microrganismo' THEN ARRAY['nome','nome_cientifico','descricao']
    WHEN p_entity='cultura' THEN ARRAY['nome','descricao']
  END $$;
REVOKE ALL ON FUNCTION platform_private.catalog_owned_allowed_keys(text,text) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION platform_private.catalog_owned_mutate_core(
  p_entity_type text, p_operation text, p_entity_id uuid, p_expected_updated_at timestamptz,
  p_payload jsonb, p_reason text, p_idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_org uuid;
  v_payload jsonb := COALESCE(p_payload, '{}'::jsonb);
  v_reason text := btrim(COALESCE(p_reason,''));
  v_table text;
  v_allowed text[];
  v_key text; v_val jsonb;
  v_hash text;
  v_prev public.catalog_tenant_owned_ledger%ROWTYPE;
  v_norm text; v_dup record;
  v_before jsonb; v_after jsonb; v_id uuid; v_owner uuid; v_upd timestamptz; v_archived timestamptz; v_result jsonb;
  v_item jsonb; v_fam text; v_cls text;
BEGIN
  IF NOT platform_private.catalog_ownership_enabled() THEN
    RAISE EXCEPTION 'catalog_ownership_disabled' USING ERRCODE='55000'; END IF;
  v_org := platform_private.catalog_tenant_actor('mutate');
  IF (p_entity_type IN ('produto','microrganismo','cultura')) IS NOT TRUE
     OR (p_operation IN ('create','update','archive','restore','composition')) IS NOT TRUE
     OR p_idempotency_key IS NULL OR jsonb_typeof(v_payload) <> 'object'
     OR (p_operation='create' AND (p_entity_id IS NOT NULL OR p_expected_updated_at IS NOT NULL))
     OR (p_operation<>'create' AND (p_entity_id IS NULL OR p_expected_updated_at IS NULL))
     OR (p_operation='composition' AND p_entity_type<>'produto') THEN
    RAISE EXCEPTION 'catalog_owned_invalid_payload' USING ERRCODE='22023'; END IF;
  v_allowed := platform_private.catalog_owned_allowed_keys(p_entity_type, p_operation);
  FOR v_key, v_val IN SELECT key, value FROM jsonb_each(v_payload) LOOP
    IF NOT v_key = ANY (v_allowed) THEN RAISE EXCEPTION 'catalog_owned_invalid_payload' USING ERRCODE='22023'; END IF;
    IF v_key <> 'itens' AND jsonb_typeof(v_val) NOT IN ('string','null') THEN
      RAISE EXCEPTION 'catalog_owned_invalid_payload' USING ERRCODE='22023'; END IF;
    IF v_key IN ('nome','tipo') AND jsonb_typeof(v_val) <> 'string' THEN
      RAISE EXCEPTION 'catalog_owned_invalid_payload' USING ERRCODE='22023'; END IF;
    IF jsonb_typeof(v_val)='string' AND char_length(v_val #>> '{}') > (CASE WHEN v_key='nome' THEN 500 ELSE 10000 END) THEN
      RAISE EXCEPTION 'catalog_owned_invalid_payload' USING ERRCODE='22023'; END IF;
  END LOOP;
  IF p_operation='create' AND (NOT v_payload ? 'nome' OR (p_entity_type<>'cultura' AND NOT v_payload ? 'tipo')) THEN
    RAISE EXCEPTION 'catalog_owned_invalid_payload' USING ERRCODE='22023'; END IF;
  IF p_operation='update' AND v_payload = '{}'::jsonb THEN RAISE EXCEPTION 'catalog_owned_noop' USING ERRCODE='22023'; END IF;
  IF p_operation='composition' AND (jsonb_typeof(v_payload->'itens') IS DISTINCT FROM 'array'
       OR jsonb_array_length(v_payload->'itens') NOT BETWEEN 1 AND 50) THEN
    RAISE EXCEPTION 'catalog_owned_invalid_payload' USING ERRCODE='22023'; END IF;
  -- Família/classe opcionais com coerência explícita (NULL = pendente; nunca derivadas de tipo/nome).
  IF p_entity_type='produto' AND (v_payload ? 'familia_catalogo' OR v_payload ? 'classe_catalogo') THEN
    v_fam := v_payload->>'familia_catalogo'; v_cls := v_payload->>'classe_catalogo';
    IF (v_fam IS NULL AND v_cls IS NOT NULL)
       OR (v_fam IS NOT NULL AND v_fam NOT IN ('biologico','quimico','fertilizante_adubo'))
       OR (v_cls IS NOT NULL AND NOT ((v_fam='biologico' AND v_cls IN ('biofungicida','bioinseticida','inoculante','solubilizador'))
                                   OR (v_fam='quimico' AND v_cls IN ('fungicida','inseticida','herbicida')))) THEN
      RAISE EXCEPTION 'catalog_owned_invalid_payload' USING ERRCODE='22023'; END IF;
  END IF;
  IF char_length(v_reason) NOT BETWEEN 10 AND 500 THEN RAISE EXCEPTION 'catalog_owned_reason_required' USING ERRCODE='22023'; END IF;
  v_table := CASE p_entity_type WHEN 'produto' THEN 'produtos' WHEN 'microrganismo' THEN 'microrganismos' ELSE 'culturas' END;
  v_hash := md5(concat_ws('|', p_entity_type, p_operation, COALESCE(p_entity_id::text,''),
                COALESCE(p_expected_updated_at::text,''), v_payload::text, v_reason));

  -- Locks: chave do ator -> nome normalizado (comum com SA) -> linha.
  PERFORM pg_advisory_xact_lock(hashtextextended(concat_ws(':','ctok',v_uid::text,v_org::text,p_idempotency_key::text),0));
  SELECT * INTO v_prev FROM public.catalog_tenant_owned_ledger
   WHERE actor_id=v_uid AND organization_id=v_org AND idempotency_key=p_idempotency_key;
  IF FOUND THEN
    IF v_prev.payload_hash <> v_hash THEN RAISE EXCEPTION 'catalog_owned_idempotency_conflict' USING ERRCODE='22023'; END IF;
    RETURN v_prev.result || jsonb_build_object('replayed', true);
  END IF;

  IF v_payload ? 'nome' THEN
    v_norm := platform_private.catalog_norm_name(v_payload->>'nome');
    IF v_norm IS NULL THEN RAISE EXCEPTION 'catalog_owned_invalid_payload' USING ERRCODE='22023'; END IF;
    PERFORM platform_private.catalog_name_lock(p_entity_type, v_payload->>'nome');
    EXECUTE format('SELECT id, ativo FROM public.%I WHERE owner_organization_id IS NULL
                     AND platform_private.catalog_norm_name(nome)=$1 ORDER BY ativo DESC NULLS LAST, id LIMIT 1', v_table)
      INTO v_dup USING v_norm;
    IF v_dup.id IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE='23505',
        MESSAGE = CASE WHEN v_dup.ativo IS TRUE THEN 'catalog_owned_duplicate_global_active' ELSE 'catalog_owned_duplicate_global_inactive' END,
        DETAIL = v_dup.id::text;
    END IF;
    EXECUTE format('SELECT id FROM public.%I WHERE owner_organization_id=$1
                     AND platform_private.catalog_norm_name(nome)=$2 AND ($3::uuid IS NULL OR id<>$3) LIMIT 1', v_table)
      INTO v_dup USING v_org, v_norm, p_entity_id;
    IF v_dup.id IS NOT NULL THEN RAISE EXCEPTION 'catalog_owned_duplicate_own' USING ERRCODE='23505', DETAIL=v_dup.id::text; END IF;
  END IF;

  IF p_operation='create' THEN
    IF p_entity_type='produto' THEN
      IF (v_payload->>'tipo' IN ('inseticida','fungicida','solo','inoculante','solubilizador')) IS NOT TRUE THEN
        RAISE EXCEPTION 'catalog_owned_invalid_payload' USING ERRCODE='22023'; END IF;
      INSERT INTO public.produtos(nome, tipo, descricao, modo_acao, funcao_completa, modo_aplicacao, familia_catalogo, classe_catalogo,
                                  ativo, b2b_enabled, owner_organization_id)
      VALUES (btrim(v_payload->>'nome'), (v_payload->>'tipo')::public.tipo_produto, v_payload->>'descricao', v_payload->>'modo_acao',
              v_payload->>'funcao_completa', v_payload->>'modo_aplicacao', v_fam, v_cls, true, false, v_org)
      RETURNING id, updated_at, to_jsonb(produtos.*) INTO v_id, v_upd, v_after;
    ELSIF p_entity_type='microrganismo' THEN
      IF (v_payload->>'tipo' IN ('bacteria','fungo','levedura','consorcio')) IS NOT TRUE THEN
        RAISE EXCEPTION 'catalog_owned_invalid_payload' USING ERRCODE='22023'; END IF;
      INSERT INTO public.microrganismos(nome, tipo, nome_cientifico, descricao, ativo, b2b_enabled, owner_organization_id)
      VALUES (btrim(v_payload->>'nome'), (v_payload->>'tipo')::public.tipo_microrganismo, v_payload->>'nome_cientifico',
              v_payload->>'descricao', true, false, v_org)
      RETURNING id, updated_at, to_jsonb(microrganismos.*) INTO v_id, v_upd, v_after;
    ELSE
      INSERT INTO public.culturas(nome, descricao, ativo, owner_organization_id)
      VALUES (btrim(v_payload->>'nome'), v_payload->>'descricao', true, v_org)
      RETURNING id, updated_at, to_jsonb(culturas.*) INTO v_id, v_upd, v_after;
    END IF;
  ELSE
    -- Global, inexistente ou de outra empresa => mesma resposta (sem oráculo).
    EXECUTE format('SELECT owner_organization_id, updated_at, archived_at, to_jsonb(t.*) FROM public.%I t WHERE id=$1 FOR UPDATE', v_table)
      INTO v_owner, v_upd, v_archived, v_before USING p_entity_id;
    IF v_owner IS DISTINCT FROM v_org THEN RAISE EXCEPTION 'catalog_owned_not_found' USING ERRCODE='P0002'; END IF;
    IF v_upd IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'catalog_owned_stale' USING ERRCODE='40001'; END IF;
    IF p_operation='restore' AND v_archived IS NULL THEN RAISE EXCEPTION 'catalog_owned_noop' USING ERRCODE='22023'; END IF;
    IF p_operation<>'restore' AND v_archived IS NOT NULL THEN RAISE EXCEPTION 'catalog_owned_archived' USING ERRCODE='55000'; END IF;
    v_id := p_entity_id;
    IF p_operation='update' THEN
      IF p_entity_type='produto' THEN
        UPDATE public.produtos SET
          nome=CASE WHEN v_payload ? 'nome' THEN btrim(v_payload->>'nome') ELSE nome END,
          descricao=CASE WHEN v_payload ? 'descricao' THEN v_payload->>'descricao' ELSE descricao END,
          modo_acao=CASE WHEN v_payload ? 'modo_acao' THEN v_payload->>'modo_acao' ELSE modo_acao END,
          funcao_completa=CASE WHEN v_payload ? 'funcao_completa' THEN v_payload->>'funcao_completa' ELSE funcao_completa END,
          modo_aplicacao=CASE WHEN v_payload ? 'modo_aplicacao' THEN v_payload->>'modo_aplicacao' ELSE modo_aplicacao END,
          familia_catalogo=CASE WHEN v_payload ? 'familia_catalogo' OR v_payload ? 'classe_catalogo' THEN v_fam ELSE familia_catalogo END,
          classe_catalogo=CASE WHEN v_payload ? 'familia_catalogo' OR v_payload ? 'classe_catalogo' THEN v_cls ELSE classe_catalogo END,
          updated_at=clock_timestamp()
        WHERE id=v_id RETURNING to_jsonb(produtos.*) INTO v_after;
      ELSIF p_entity_type='microrganismo' THEN
        UPDATE public.microrganismos SET
          nome=CASE WHEN v_payload ? 'nome' THEN btrim(v_payload->>'nome') ELSE nome END,
          nome_cientifico=CASE WHEN v_payload ? 'nome_cientifico' THEN v_payload->>'nome_cientifico' ELSE nome_cientifico END,
          descricao=CASE WHEN v_payload ? 'descricao' THEN v_payload->>'descricao' ELSE descricao END,
          updated_at=clock_timestamp()
        WHERE id=v_id RETURNING to_jsonb(microrganismos.*) INTO v_after;
      ELSE
        UPDATE public.culturas SET
          nome=CASE WHEN v_payload ? 'nome' THEN btrim(v_payload->>'nome') ELSE nome END,
          descricao=CASE WHEN v_payload ? 'descricao' THEN v_payload->>'descricao' ELSE descricao END,
          updated_at=clock_timestamp()
        WHERE id=v_id RETURNING to_jsonb(culturas.*) INTO v_after;
      END IF;
      -- No-op coerente: nada mudou além de updated_at => rejeita e a transação desfaz o carimbo.
      IF (v_after - 'updated_at') = (v_before - 'updated_at') THEN RAISE EXCEPTION 'catalog_owned_noop' USING ERRCODE='22023'; END IF;
    ELSIF p_operation IN ('archive','restore') THEN
      EXECUTE format('UPDATE public.%I SET ativo=$2, archived_at=$3, updated_at=clock_timestamp() WHERE id=$1 RETURNING to_jsonb(%I.*)', v_table, v_table)
        INTO v_after USING v_id, p_operation='restore', CASE WHEN p_operation='archive' THEN clock_timestamp() END;
    ELSE -- composição própria: receita biológica em formulacoes OU declaração química/fertilizante
      FOR v_item IN SELECT value FROM jsonb_array_elements(v_payload->'itens') LOOP
        IF jsonb_typeof(v_item) <> 'object' OR (v_item - ARRAY['microrganismo_id','component_insumo_id','volume_ml','proporcao']) <> '{}'::jsonb
           OR ((v_item ? 'microrganismo_id') = (v_item ? 'component_insumo_id'))
           OR jsonb_typeof(v_item->'volume_ml') IS DISTINCT FROM 'number' OR (v_item->>'volume_ml')::numeric <= 0
           OR (v_item->>'volume_ml')::numeric > 1000000 OR scale((v_item->>'volume_ml')::numeric) > 6
           OR (v_item ? 'proporcao' AND jsonb_typeof(v_item->'proporcao') NOT IN ('number','null'))
           -- NULL/ausente aceito; presente só em [0.000001, 100] (testado: 50/100/0.000001 ok; 101/-1/0 rejeitados)
           OR ((v_item->>'proporcao')::numeric BETWEEN 0.000001 AND 100) IS FALSE
           OR (jsonb_typeof(v_item->'proporcao')='number' AND scale((v_item->>'proporcao')::numeric) > 6)
           OR (v_item ? 'microrganismo_id' AND (v_item->>'microrganismo_id') !~ '^[0-9a-f-]{36}$')
           OR (v_item ? 'component_insumo_id' AND (v_item->>'component_insumo_id') !~ '^[0-9a-f-]{36}$') THEN
          RAISE EXCEPTION 'catalog_owned_invalid_payload' USING ERRCODE='22023'; END IF;
        IF v_item ? 'microrganismo_id' AND NOT EXISTS (SELECT 1 FROM public.microrganismos m
             WHERE m.id=(v_item->>'microrganismo_id')::uuid AND m.ativo IS TRUE AND (m.owner_organization_id IS NULL OR m.owner_organization_id=v_org)) THEN
          RAISE EXCEPTION 'catalog_owned_component_unavailable' USING ERRCODE='42501'; END IF;
        IF v_item ? 'component_insumo_id' AND ((v_item->>'component_insumo_id')::uuid = v_id OR NOT EXISTS (SELECT 1 FROM public.produtos p
             WHERE p.id=(v_item->>'component_insumo_id')::uuid AND p.ativo IS TRUE AND (p.owner_organization_id IS NULL OR p.owner_organization_id=v_org))) THEN
          RAISE EXCEPTION 'catalog_owned_component_unavailable' USING ERRCODE='42501'; END IF;
      END LOOP;
      IF (SELECT count(DISTINCT COALESCE(e->>'microrganismo_id', e->>'component_insumo_id')) FROM jsonb_array_elements(v_payload->'itens') e)
         <> jsonb_array_length(v_payload->'itens') THEN RAISE EXCEPTION 'catalog_owned_invalid_payload' USING ERRCODE='22023'; END IF;
      SELECT pg_catalog.jsonb_build_object(
        'formulacoes', COALESCE((SELECT jsonb_agg(to_jsonb(f.*) ORDER BY f.id) FROM public.formulacoes f WHERE f.produto_id=v_id),'[]'::jsonb),
        'conjunto', (SELECT to_jsonb(c.*) FROM public.produto_composicao_conjuntos c WHERE c.produto_id=v_id),
        'declaracoes', COALESCE((SELECT jsonb_agg(to_jsonb(d.*) ORDER BY d.ordem,d.id) FROM public.produto_composicao_declaracoes d WHERE d.produto_id=v_id),'[]'::jsonb)
      ) INTO v_before;
      IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_payload->'itens') e WHERE e ? 'component_insumo_id') THEN
        -- formulacoes.microrganismo_id é NOT NULL no schema real. Químicos/fertilizantes reutilizam o
        -- modelo global de declarações; nunca se fabrica microrganismo para satisfazer a constraint.
        DELETE FROM public.formulacoes WHERE produto_id=v_id;
        INSERT INTO public.produto_composicao_conjuntos(produto_id,status,updated_by)
          VALUES (v_id,'draft',v_uid)
          ON CONFLICT (produto_id) DO UPDATE SET status='draft',updated_by=v_uid,updated_at=clock_timestamp();
        DELETE FROM public.produto_composicao_declaracoes WHERE produto_id=v_id;
        INSERT INTO public.produto_composicao_declaracoes(produto_id,ordem,tipo_componente,componente_nome,quantidade,unidade,base,natureza)
        SELECT v_id, row_number() OVER ()::smallint, 'insumo', p.nome, (e->>'proporcao')::numeric,
               '%', 'produto', CASE WHEN v_fam='fertilizante_adubo' THEN 'fertilizante' ELSE 'quimico' END
          FROM jsonb_array_elements(v_payload->'itens') e
          JOIN public.produtos p ON p.id=(e->>'component_insumo_id')::uuid;
      ELSE
        DELETE FROM public.produto_composicao_declaracoes WHERE produto_id=v_id;
        DELETE FROM public.produto_composicao_conjuntos WHERE produto_id=v_id;
        DELETE FROM public.formulacoes WHERE produto_id=v_id;
        INSERT INTO public.formulacoes(produto_id, microrganismo_id, volume_ml, proporcao)
        SELECT v_id, (e->>'microrganismo_id')::uuid, (e->>'volume_ml')::numeric, NULLIF(e->>'proporcao','')::numeric
          FROM jsonb_array_elements(v_payload->'itens') e;
      END IF;
      UPDATE public.produtos SET updated_at=clock_timestamp() WHERE id=v_id;
      SELECT pg_catalog.jsonb_build_object(
        'formulacoes', COALESCE((SELECT jsonb_agg(to_jsonb(f.*) ORDER BY f.id) FROM public.formulacoes f WHERE f.produto_id=v_id),'[]'::jsonb),
        'conjunto', (SELECT to_jsonb(c.*) FROM public.produto_composicao_conjuntos c WHERE c.produto_id=v_id),
        'declaracoes', COALESCE((SELECT jsonb_agg(to_jsonb(d.*) ORDER BY d.ordem,d.id) FROM public.produto_composicao_declaracoes d WHERE d.produto_id=v_id),'[]'::jsonb)
      ) INTO v_after;
    END IF;
    EXECUTE format('SELECT updated_at FROM public.%I WHERE id=$1', v_table) INTO v_upd USING v_id;
  END IF;

  v_result := jsonb_build_object('id', v_id, 'entity_type', p_entity_type, 'operation', p_operation,
                                 'updated_at', v_upd, 'origin', 'proprio', 'idempotency_key', p_idempotency_key, 'replayed', false);
  INSERT INTO public.catalog_tenant_owned_ledger(organization_id, actor_id, entity_type, entity_id, operation,
    idempotency_key, payload_hash, reason, before_state, after_state, result)
  VALUES (v_org, v_uid, p_entity_type, v_id, p_operation, p_idempotency_key, v_hash, v_reason, v_before, v_after, v_result);
  RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION platform_private.catalog_owned_mutate_core(text,text,uuid,timestamptz,jsonb,text,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION platform_private.catalog_owned_mutate_core(text,text,uuid,timestamptz,jsonb,text,uuid) TO authenticated;

CREATE FUNCTION public.tenant_catalog_owned_mutate(
  p_entity_type text, p_operation text, p_entity_id uuid, p_expected_updated_at timestamptz,
  p_payload jsonb, p_reason text, p_idempotency_key uuid)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $$
  SELECT platform_private.catalog_owned_mutate_core(p_entity_type, p_operation, p_entity_id, p_expected_updated_at,
                                                    p_payload, p_reason, p_idempotency_key) $$;
REVOKE ALL ON FUNCTION public.tenant_catalog_owned_mutate(text,text,uuid,timestamptz,jsonb,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tenant_catalog_owned_mutate(text,text,uuid,timestamptz,jsonb,text,uuid) TO authenticated;

-- Leitor paginado de PRÓPRIOS da empresa do ator (gestão), sem parâmetro de empresa.
CREATE FUNCTION platform_private.catalog_owned_list_core(p_entity_type text, p_search text, p_limit integer, p_offset integer, p_include_archived boolean)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_org uuid; v_q text := COALESCE(platform_private.catalog_norm_name(p_search),''); v_items jsonb; v_n int;
BEGIN
  IF (p_entity_type IN ('produto','microrganismo','cultura')) IS NOT TRUE OR (p_limit BETWEEN 1 AND 50) IS NOT TRUE
     OR (p_offset BETWEEN 0 AND 100000) IS NOT TRUE OR p_include_archived IS NULL OR char_length(COALESCE(p_search,'')) > 120 THEN
    RAISE EXCEPTION 'catalog_owned_invalid_payload' USING ERRCODE='22023'; END IF;
  v_org := platform_private.catalog_tenant_actor('read_catalog');
  EXECUTE format('SELECT COALESCE(jsonb_agg(jsonb_build_object(''id'',id,''nome'',nome,''ativo'',ativo,''archived_at'',archived_at,
      ''updated_at'',updated_at,''origin'',''proprio'') ORDER BY nome,id),''[]''::jsonb), count(*)
    FROM (SELECT id,nome,ativo,archived_at,updated_at FROM public.%I WHERE owner_organization_id=$1
           AND ($2 OR archived_at IS NULL) AND ($3='''' OR strpos(platform_private.catalog_norm_name(nome),$3)>0)
           ORDER BY nome,id LIMIT $4+1 OFFSET $5) s',
    CASE p_entity_type WHEN 'produto' THEN 'produtos' WHEN 'microrganismo' THEN 'microrganismos' ELSE 'culturas' END)
    INTO v_items, v_n USING v_org, p_include_archived, v_q, p_limit, p_offset;
  RETURN jsonb_build_object('items', CASE WHEN v_n>p_limit THEN v_items - p_limit ELSE v_items END, 'has_more', v_n>p_limit);
END $$;
REVOKE ALL ON FUNCTION platform_private.catalog_owned_list_core(text,text,integer,integer,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION platform_private.catalog_owned_list_core(text,text,integer,integer,boolean) TO authenticated;
CREATE FUNCTION public.tenant_catalog_owned_list(p_entity_type text, p_search text, p_limit integer, p_offset integer, p_include_archived boolean)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT platform_private.catalog_owned_list_core(p_entity_type, p_search, p_limit, p_offset, p_include_archived) $$;
REVOKE ALL ON FUNCTION public.tenant_catalog_owned_list(text,text,integer,integer,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tenant_catalog_owned_list(text,text,integer,integer,boolean) TO authenticated;

-- ---------------------------------------------------------------- invariantes pós
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.produtos WHERE owner_organization_id IS NOT NULL)
     OR EXISTS (SELECT 1 FROM public.microrganismos WHERE owner_organization_id IS NOT NULL)
     OR EXISTS (SELECT 1 FROM public.culturas WHERE owner_organization_id IS NOT NULL)
     OR EXISTS (SELECT 1 FROM public.formulacoes WHERE owner_organization_id IS NOT NULL)
     OR EXISTS (SELECT 1 FROM public.catalogo_volumes WHERE owner_organization_id IS NOT NULL) THEN
    RAISE EXCEPTION 'ownership_post_unexpected_private_rows'; END IF;
  IF (SELECT string_agg(round(f.volume_ml)::text,'+' ORDER BY f.volume_ml DESC) FROM public.formulacoes f
        WHERE f.produto_id='1875527c-a65a-483b-a6c2-9122d5ec2a51') IS DISTINCT FROM '334+333+333' THEN
    RAISE EXCEPTION 'ownership_post_bombarbio_recipe_drift'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.catalogo_volumes WHERE produto_id='1875527c-a65a-483b-a6c2-9122d5ec2a51'
                  AND volume_ml=1000 AND preco_brl=180 AND ativo) THEN
    RAISE EXCEPTION 'ownership_post_bombarbio_price_drift'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.catalog_tenant_visibility WHERE produto_id='1875527c-a65a-483b-a6c2-9122d5ec2a51'
                  AND hidden IS FALSE AND version=4) THEN
    RAISE EXCEPTION 'ownership_post_visibility_drift'; END IF;
  IF platform_private.catalog_ownership_enabled() THEN RAISE EXCEPTION 'ownership_post_gate_must_be_off'; END IF;
END $$;
