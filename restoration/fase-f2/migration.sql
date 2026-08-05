-- =====================================================================
-- FASE F2 — CADASTRO REGULATÓRIO E FISCAL AUDITÁVEL DE MICRORGANISMOS
-- Ambientes autorizados: STAGING ikaauvsflpmamgxmkhoq (esta fase)
--                        PRODUCTION navfzbwgwzruipouyfnk (promoção futura)
--
-- Princípio inegociável: esta migration NÃO classifica nada. Ela cria a
-- estrutura de evidência e o fluxo de aprovação que permitem classificar
-- com prova. Nenhum NCM, CEST, CFOP, CST, CSOSN, origem, alíquota,
-- benefício, GTIN, uCom/uTrib ou fator de conversão é inferido a partir
-- de espécie, nome comercial ou prática de mercado.
-- =====================================================================

-- ---------------------------------------------------------------------
-- GUARDA DE AMBIENTE (fail-closed)
-- ---------------------------------------------------------------------
DO $guard$
DECLARE v_marker text; v_ref text;
BEGIN
  SELECT marker, project_ref INTO v_marker, v_ref FROM public._fiscal_staging_marker;
  IF NOT ((v_marker='STAGING' AND v_ref='ikaauvsflpmamgxmkhoq')
       OR (v_marker='PRODUCTION' AND v_ref='navfzbwgwzruipouyfnk')) THEN
    RAISE EXCEPTION 'F2_ABORT: ambiente nao autorizado (%/%)', v_marker, v_ref;
  END IF;
END $guard$;

-- =====================================================================
-- SEÇÃO 0 — BUCKET PRIVADO DE EVIDÊNCIA REGULATÓRIA
-- =====================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('fiscal-regulatorio', 'fiscal-regulatorio', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- =====================================================================
-- SEÇÃO 1 — HELPERS DE AUTORIZAÇÃO
-- Preparo: administrador, gestor.
-- Aprovação fiscal: financeiro (contabilidade) ou administrador.
-- Aprovação regulatória/técnica: tecnico_agronomo (responsável técnico)
--                                ou administrador.
-- Leitura interna: os papéis acima. Parceiro/produtor NUNCA leem.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.fn_regulatory_can_read(_uid uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
  SELECT _uid IS NOT NULL AND (
    public.has_role(_uid,'administrador'::app_role)
    OR public.has_role(_uid,'gestor'::app_role)
    OR public.has_role(_uid,'financeiro'::app_role)
    OR public.has_role(_uid,'tecnico_agronomo'::app_role));
$$;

CREATE OR REPLACE FUNCTION public.fn_regulatory_can_prepare(_uid uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
  SELECT _uid IS NOT NULL AND (
    public.has_role(_uid,'administrador'::app_role)
    OR public.has_role(_uid,'gestor'::app_role));
$$;

CREATE OR REPLACE FUNCTION public.fn_regulatory_can_approve(_layer text, _uid uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
  SELECT _uid IS NOT NULL AND CASE _layer
    WHEN 'FISCAL' THEN public.has_role(_uid,'financeiro'::app_role)
                     OR public.has_role(_uid,'administrador'::app_role)
    WHEN 'REGULATORY' THEN public.has_role(_uid,'tecnico_agronomo'::app_role)
                        OR public.has_role(_uid,'administrador'::app_role)
    WHEN 'TECHNICAL' THEN public.has_role(_uid,'tecnico_agronomo'::app_role)
                       OR public.has_role(_uid,'administrador'::app_role)
    ELSE false END;
$$;

REVOKE ALL ON FUNCTION public.fn_regulatory_can_read(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_regulatory_can_prepare(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_regulatory_can_approve(text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_regulatory_can_read(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_regulatory_can_prepare(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_regulatory_can_approve(text,uuid) TO authenticated, service_role;

-- =====================================================================
-- SEÇÃO 2 — CATÁLOGO DE FONTES OFICIAIS
-- Referências normativas citáveis. Nenhuma delas é interpretada
-- automaticamente; servem de âncora de auditoria para cada afirmação.
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.fiscal_official_sources (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key   text NOT NULL UNIQUE,
  authority    text NOT NULL,
  name         text NOT NULL,
  url          text NOT NULL,
  doc_version  text,
  consulted_at date,
  notes        text,
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  created_by   uuid,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fos_url_chk CHECK (url ~ '^https://')
);

GRANT SELECT ON public.fiscal_official_sources TO authenticated;
GRANT ALL ON public.fiscal_official_sources TO service_role;
ALTER TABLE public.fiscal_official_sources ENABLE ROW LEVEL SECURITY;

-- =====================================================================
-- SEÇÃO 3 — DOSSIÊ REGULATÓRIO (1:N versionado por microrganismo)
--
-- Decisão de modelagem: NÃO generalizamos produto_conformidade_perfis.
-- Aquela tabela é escopada a produtos (FK produto_id -> produtos, ON
-- DELETE CASCADE), orientada a texto de rótulo/conservação/uso e sem
-- fluxo de tripla aprovação, candidatos de NCM, apresentações ou
-- documentos com hash. Generalizá-la exigiria afrouxar sua FK e seu
-- CHECK de escopo, degradando garantias já em produção. Criamos
-- estrutura normalizada específica e mantemos compatibilidade
-- conceitual (mesmos estados de ciclo de vida e mesma ideia de versão
-- vigente).
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.microorganism_regulatory_dossiers (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  microorganism_id   uuid NOT NULL REFERENCES public.microrganismos(id) ON DELETE RESTRICT,
  version            integer NOT NULL,
  status             text NOT NULL DEFAULT 'DRAFT',
  effective_from     date,
  effective_to       date,

  -- Identidade regulatória (tudo opcional: só é preenchido com prova)
  strain_code        text,
  strain_name        text,
  regulatory_category text,
  formulation        text,
  label_guarantee    text,
  guarantee_unit     text,

  -- Registro MAPA / SIPEAGRO
  mapa_registration_number text,
  mapa_holder              text,
  mapa_manufacturer        text,
  mapa_status              text,
  mapa_valid_until         date,
  mapa_not_applicable_reason text,

  -- Classificação publicada (só após as três aprovações)
  published_ncm      text,
  published_cest     text,
  published_ncm_candidate_id uuid,

  -- Revisões separadas
  technical_review_status  text NOT NULL DEFAULT 'PENDING',
  technical_review_by      uuid,
  technical_review_at      timestamptz,
  technical_review_notes   text,
  regulatory_review_status text NOT NULL DEFAULT 'PENDING',
  regulatory_review_by     uuid,
  regulatory_review_at     timestamptz,
  regulatory_review_notes  text,
  fiscal_review_status     text NOT NULL DEFAULT 'PENDING',
  fiscal_review_by         uuid,
  fiscal_review_at         timestamptz,
  fiscal_review_notes      text,

  published_at   timestamptz,
  published_by   uuid,
  blocked_reason text,

  deleted_at     timestamptz,
  deleted_by     uuid,
  deleted_reason text,

  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,

  CONSTRAINT mrd_version_chk  CHECK (version >= 1),
  CONSTRAINT mrd_status_chk   CHECK (status IN ('DRAFT','PENDING_REVIEW','VALIDATED','BLOCKED')),
  CONSTRAINT mrd_vigencia_chk CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to > effective_from),
  CONSTRAINT mrd_ncm_chk      CHECK (published_ncm IS NULL OR published_ncm ~ '^[0-9]{8}$'),
  CONSTRAINT mrd_cest_chk     CHECK (published_cest IS NULL OR published_cest ~ '^[0-9]{7}$'),
  CONSTRAINT mrd_category_chk CHECK (regulatory_category IS NULL OR regulatory_category IN
      ('INOCULANTE','BIOFERTILIZANTE','FERTILIZANTE','CONDICIONADOR_SOLO',
       'AGENTE_BIOLOGICO_CONTROLE','REMINERALIZADOR','SUBSTRATO','OUTRO_A_DEFINIR')),
  CONSTRAINT mrd_mapa_status_chk CHECK (mapa_status IS NULL OR mapa_status IN
      ('ACTIVE','SUSPENDED','EXPIRED','IN_PROCESS','NOT_APPLICABLE')),
  CONSTRAINT mrd_mapa_na_chk CHECK (mapa_status <> 'NOT_APPLICABLE'
       OR nullif(btrim(coalesce(mapa_not_applicable_reason,'')),'') IS NOT NULL),
  CONSTRAINT mrd_review_status_chk CHECK (
       technical_review_status  IN ('PENDING','APPROVED','REJECTED')
   AND regulatory_review_status IN ('PENDING','APPROVED','REJECTED')
   AND fiscal_review_status     IN ('PENDING','APPROVED','REJECTED')),
  CONSTRAINT mrd_published_requires_reviews CHECK (
       status <> 'VALIDATED'
    OR (technical_review_status='APPROVED' AND regulatory_review_status='APPROVED'
        AND fiscal_review_status='APPROVED' AND published_at IS NOT NULL)),
  CONSTRAINT mrd_blocked_reason_chk CHECK (status <> 'BLOCKED'
       OR nullif(btrim(coalesce(blocked_reason,'')),'') IS NOT NULL),
  CONSTRAINT mrd_soft_delete_chk CHECK ((deleted_at IS NULL) = (deleted_by IS NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS mrd_uq_micro_version
  ON public.microorganism_regulatory_dossiers (microorganism_id, version);
-- Exatamente uma versão publicada por microrganismo
CREATE UNIQUE INDEX IF NOT EXISTS mrd_uq_published_per_micro
  ON public.microorganism_regulatory_dossiers (microorganism_id)
  WHERE status = 'VALIDATED' AND deleted_at IS NULL;
-- Um único rascunho/revisão aberto por microrganismo (evita corrida)
CREATE UNIQUE INDEX IF NOT EXISTS mrd_uq_open_per_micro
  ON public.microorganism_regulatory_dossiers (microorganism_id)
  WHERE status IN ('DRAFT','PENDING_REVIEW') AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS mrd_idx_micro ON public.microorganism_regulatory_dossiers (microorganism_id);

GRANT SELECT, INSERT, UPDATE ON public.microorganism_regulatory_dossiers TO authenticated;
GRANT ALL ON public.microorganism_regulatory_dossiers TO service_role;
ALTER TABLE public.microorganism_regulatory_dossiers ENABLE ROW LEVEL SECURITY;

-- =====================================================================
-- SEÇÃO 4 — APRESENTAÇÕES (catálogo a confirmar fiscalmente)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.microorganism_regulatory_presentations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dossier_id   uuid NOT NULL REFERENCES public.microorganism_regulatory_dossiers(id) ON DELETE CASCADE,
  catalog_volume_id uuid REFERENCES public.catalogo_volumes(id) ON DELETE SET NULL,
  volume_ml    integer NOT NULL,
  label        text NOT NULL,
  origin_note  text NOT NULL DEFAULT 'CATALOGO_A_CONFIRMAR_FISCALMENTE',

  commercial_unit   text,
  taxable_unit      text,
  conversion_factor numeric(18,6),
  units_confirmed   boolean NOT NULL DEFAULT false,
  units_confirmed_by uuid,
  units_confirmed_at timestamptz,

  gtin            text,
  gtin_absent     boolean NOT NULL DEFAULT false,
  gtin_confirmed  boolean NOT NULL DEFAULT false,
  gtin_confirmed_by uuid,
  gtin_confirmed_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,

  CONSTRAINT mrp_volume_chk CHECK (volume_ml > 0),
  CONSTRAINT mrp_factor_chk CHECK (conversion_factor IS NULL OR conversion_factor > 0),
  CONSTRAINT mrp_gtin_format_chk CHECK (gtin IS NULL OR gtin ~ '^[0-9]{8}$|^[0-9]{12}$|^[0-9]{13}$|^[0-9]{14}$'),
  -- GTIN válido OU declaração explícita "SEM GTIN"; nunca os dois, nunca nenhum quando confirmado
  CONSTRAINT mrp_gtin_exclusive_chk CHECK (NOT (gtin_absent AND gtin IS NOT NULL)),
  CONSTRAINT mrp_gtin_confirm_chk CHECK (NOT gtin_confirmed OR (gtin IS NOT NULL OR gtin_absent)),
  CONSTRAINT mrp_units_confirm_chk CHECK (NOT units_confirmed OR (
       nullif(btrim(coalesce(commercial_unit,'')),'') IS NOT NULL
   AND nullif(btrim(coalesce(taxable_unit,'')),'') IS NOT NULL
   AND conversion_factor IS NOT NULL)),
  CONSTRAINT mrp_units_confirm_actor_chk CHECK ((units_confirmed) = (units_confirmed_by IS NOT NULL)),
  CONSTRAINT mrp_gtin_confirm_actor_chk CHECK ((gtin_confirmed) = (gtin_confirmed_by IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS mrp_uq_dossier_volume
  ON public.microorganism_regulatory_presentations (dossier_id, volume_ml);

GRANT SELECT, INSERT, UPDATE ON public.microorganism_regulatory_presentations TO authenticated;
GRANT ALL ON public.microorganism_regulatory_presentations TO service_role;
ALTER TABLE public.microorganism_regulatory_presentations ENABLE ROW LEVEL SECURITY;

-- =====================================================================
-- SEÇÃO 5 — CANDIDATOS DE NCM (sugestão nunca é código aprovado)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.microorganism_ncm_candidates (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dossier_id    uuid NOT NULL REFERENCES public.microorganism_regulatory_dossiers(id) ON DELETE CASCADE,
  ncm           text NOT NULL,
  cest          text,
  justification text NOT NULL,
  confidence    text NOT NULL DEFAULT 'LOW',
  source_id     uuid REFERENCES public.fiscal_official_sources(id) ON DELETE SET NULL,
  source_url    text,
  consulted_at  date,
  status        text NOT NULL DEFAULT 'PROPOSED',
  decided_by    uuid,
  decided_at    timestamptz,
  decision_reason text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid,

  CONSTRAINT mnc_ncm_chk  CHECK (ncm ~ '^[0-9]{8}$'),
  CONSTRAINT mnc_cest_chk CHECK (cest IS NULL OR cest ~ '^[0-9]{7}$'),
  CONSTRAINT mnc_conf_chk CHECK (confidence IN ('LOW','MEDIUM','HIGH')),
  CONSTRAINT mnc_status_chk CHECK (status IN ('PROPOSED','REJECTED','APPROVED')),
  CONSTRAINT mnc_justification_chk CHECK (length(btrim(justification)) >= 20),
  CONSTRAINT mnc_url_chk CHECK (source_url IS NULL OR source_url ~ '^https://'),
  CONSTRAINT mnc_decision_chk CHECK ((status = 'PROPOSED') = (decided_at IS NULL)),
  CONSTRAINT mnc_decision_actor_chk CHECK ((decided_at IS NULL) = (decided_by IS NULL))
);

-- Somente um candidato aprovado por dossiê
CREATE UNIQUE INDEX IF NOT EXISTS mnc_uq_approved_per_dossier
  ON public.microorganism_ncm_candidates (dossier_id) WHERE status = 'APPROVED';
CREATE INDEX IF NOT EXISTS mnc_idx_dossier ON public.microorganism_ncm_candidates (dossier_id);

GRANT SELECT, INSERT, UPDATE ON public.microorganism_ncm_candidates TO authenticated;
GRANT ALL ON public.microorganism_ncm_candidates TO service_role;
ALTER TABLE public.microorganism_ncm_candidates ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.microorganism_regulatory_dossiers
  DROP CONSTRAINT IF EXISTS mrd_published_candidate_fk;
ALTER TABLE public.microorganism_regulatory_dossiers
  ADD CONSTRAINT mrd_published_candidate_fk
  FOREIGN KEY (published_ncm_candidate_id)
  REFERENCES public.microorganism_ncm_candidates(id) ON DELETE RESTRICT;

-- =====================================================================
-- SEÇÃO 6 — DOCUMENTOS DE EVIDÊNCIA (bucket privado + hash)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.microorganism_regulatory_documents (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dossier_id     uuid NOT NULL REFERENCES public.microorganism_regulatory_dossiers(id) ON DELETE CASCADE,
  doc_type       text NOT NULL,
  title          text NOT NULL,
  storage_bucket text NOT NULL DEFAULT 'fiscal-regulatorio',
  storage_path   text NOT NULL,
  content_sha256 text NOT NULL,
  issuer         text,
  issued_at      date,
  valid_until    date,
  source_id      uuid REFERENCES public.fiscal_official_sources(id) ON DELETE SET NULL,
  source_url     text,
  consulted_at   date,
  doc_version    text,
  uploaded_by    uuid,
  uploaded_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at     timestamptz,
  deleted_by     uuid,

  CONSTRAINT mrdoc_type_chk CHECK (doc_type IN
      ('ROTULO','LAUDO','FICHA_TECNICA','ATO_REGISTRO','CERTIFICADO_ANALISE','PARECER_CONTABIL','OUTRO')),
  CONSTRAINT mrdoc_bucket_chk CHECK (storage_bucket = 'fiscal-regulatorio'),
  CONSTRAINT mrdoc_sha_chk CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT mrdoc_path_chk CHECK (storage_path ~ '^[A-Za-z0-9._/-]+$'),
  CONSTRAINT mrdoc_url_chk CHECK (source_url IS NULL OR source_url ~ '^https://'),
  CONSTRAINT mrdoc_validade_chk CHECK (valid_until IS NULL OR issued_at IS NULL OR valid_until >= issued_at),
  CONSTRAINT mrdoc_soft_delete_chk CHECK ((deleted_at IS NULL) = (deleted_by IS NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS mrdoc_uq_hash
  ON public.microorganism_regulatory_documents (dossier_id, content_sha256) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS mrdoc_uq_path
  ON public.microorganism_regulatory_documents (storage_bucket, storage_path) WHERE deleted_at IS NULL;

GRANT SELECT, INSERT, UPDATE ON public.microorganism_regulatory_documents TO authenticated;
GRANT ALL ON public.microorganism_regulatory_documents TO service_role;
ALTER TABLE public.microorganism_regulatory_documents ENABLE ROW LEVEL SECURITY;

-- =====================================================================
-- SEÇÃO 7 — CHECKLIST EXPLÍCITO (MISSING x NOT_APPLICABLE)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.microorganism_regulatory_checklist (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dossier_id    uuid NOT NULL REFERENCES public.microorganism_regulatory_dossiers(id) ON DELETE CASCADE,
  item_key      text NOT NULL,
  state         text NOT NULL DEFAULT 'PENDING',
  justification text,
  evidence_document_id uuid REFERENCES public.microorganism_regulatory_documents(id) ON DELETE SET NULL,
  decided_by    uuid,
  decided_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT mrc_item_chk CHECK (item_key IN (
    'FINALIDADE_REGULATORIA','CEPA','FORMULACAO','GARANTIA_ROTULO','REGISTRO_MAPA',
    'TITULAR_FABRICANTE','NCM_CEST_TIPI','GTIN','UNIDADE_CONVERSAO','ORIGEM',
    'CFOP','TRIBUTACAO')),
  CONSTRAINT mrc_state_chk CHECK (state IN ('PENDING','CONFIRMED','NOT_APPLICABLE')),
  -- NOT_APPLICABLE nunca é silencioso: exige justificativa
  CONSTRAINT mrc_na_chk CHECK (state <> 'NOT_APPLICABLE'
       OR nullif(btrim(coalesce(justification,'')),'') IS NOT NULL),
  CONSTRAINT mrc_decided_chk CHECK ((state = 'PENDING') OR decided_by IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS mrc_uq_dossier_item
  ON public.microorganism_regulatory_checklist (dossier_id, item_key);

GRANT SELECT, INSERT, UPDATE ON public.microorganism_regulatory_checklist TO authenticated;
GRANT ALL ON public.microorganism_regulatory_checklist TO service_role;
ALTER TABLE public.microorganism_regulatory_checklist ENABLE ROW LEVEL SECURITY;

-- =====================================================================
-- SEÇÃO 8 — SNAPSHOT IMUTÁVEL DE PUBLICAÇÃO
-- A futura NF-e referencia o snapshot, não recalcula o histórico.
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.microorganism_regulatory_publication_snapshots (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dossier_id       uuid NOT NULL REFERENCES public.microorganism_regulatory_dossiers(id) ON DELETE RESTRICT,
  microorganism_id uuid NOT NULL REFERENCES public.microrganismos(id) ON DELETE RESTRICT,
  version          integer NOT NULL,
  snapshot         jsonb NOT NULL,
  snapshot_sha256  text NOT NULL,
  published_at     timestamptz NOT NULL DEFAULT now(),
  published_by     uuid,
  CONSTRAINT mrps_sha_chk CHECK (snapshot_sha256 ~ '^[0-9a-f]{64}$')
);
CREATE UNIQUE INDEX IF NOT EXISTS mrps_uq_dossier_version
  ON public.microorganism_regulatory_publication_snapshots (dossier_id, version);

GRANT SELECT ON public.microorganism_regulatory_publication_snapshots TO authenticated;
GRANT ALL ON public.microorganism_regulatory_publication_snapshots TO service_role;
ALTER TABLE public.microorganism_regulatory_publication_snapshots ENABLE ROW LEVEL SECURITY;

-- =====================================================================
-- SEÇÃO 9 — RLS
-- Escrita direta é fechada: toda mutação ocorre por RPC SECURITY DEFINER
-- com verificação de papel e trilha de auditoria.
-- =====================================================================
DO $rls$
DECLARE r record;
BEGIN
  FOR r IN SELECT unnest(ARRAY[
    'fiscal_official_sources','microorganism_regulatory_dossiers',
    'microorganism_regulatory_presentations','microorganism_ncm_candidates',
    'microorganism_regulatory_documents','microorganism_regulatory_checklist',
    'microorganism_regulatory_publication_snapshots']) AS t
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.t||'_sel', r.t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.t||'_ins', r.t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.t||'_upd', r.t);
  END LOOP;
END $rls$;

CREATE POLICY fiscal_official_sources_sel ON public.fiscal_official_sources
  FOR SELECT TO authenticated USING (public.fn_regulatory_can_read());

CREATE POLICY microorganism_regulatory_dossiers_sel ON public.microorganism_regulatory_dossiers
  FOR SELECT TO authenticated USING (public.fn_regulatory_can_read());
CREATE POLICY microorganism_regulatory_presentations_sel ON public.microorganism_regulatory_presentations
  FOR SELECT TO authenticated USING (public.fn_regulatory_can_read());
CREATE POLICY microorganism_ncm_candidates_sel ON public.microorganism_ncm_candidates
  FOR SELECT TO authenticated USING (public.fn_regulatory_can_read());
CREATE POLICY microorganism_regulatory_documents_sel ON public.microorganism_regulatory_documents
  FOR SELECT TO authenticated USING (public.fn_regulatory_can_read());
CREATE POLICY microorganism_regulatory_checklist_sel ON public.microorganism_regulatory_checklist
  FOR SELECT TO authenticated USING (public.fn_regulatory_can_read());
CREATE POLICY microorganism_regulatory_publication_snapshots_sel
  ON public.microorganism_regulatory_publication_snapshots
  FOR SELECT TO authenticated USING (public.fn_regulatory_can_read());

-- Nenhuma policy de INSERT/UPDATE/DELETE para authenticated: RLS fecha a
-- escrita direta e obriga o uso dos RPCs auditados.

-- =====================================================================
-- SEÇÃO 10 — RLS DE STORAGE (bucket privado, por papel)
-- =====================================================================
DROP POLICY IF EXISTS fiscal_regulatorio_read ON storage.objects;
DROP POLICY IF EXISTS fiscal_regulatorio_insert ON storage.objects;
DROP POLICY IF EXISTS fiscal_regulatorio_update ON storage.objects;
DROP POLICY IF EXISTS fiscal_regulatorio_delete ON storage.objects;

CREATE POLICY fiscal_regulatorio_read ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'fiscal-regulatorio' AND public.fn_regulatory_can_read());
CREATE POLICY fiscal_regulatorio_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'fiscal-regulatorio' AND public.fn_regulatory_can_prepare());
CREATE POLICY fiscal_regulatorio_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'fiscal-regulatorio' AND public.fn_regulatory_can_prepare())
  WITH CHECK (bucket_id = 'fiscal-regulatorio' AND public.fn_regulatory_can_prepare());
CREATE POLICY fiscal_regulatorio_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'fiscal-regulatorio' AND public.fn_regulatory_can_prepare());

-- =====================================================================
-- SEÇÃO 11 — AUDITORIA old/new E IMUTABILIDADE DO PUBLICADO
-- =====================================================================
CREATE OR REPLACE FUNCTION public.regulatory_audit_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $fn$
DECLARE v_actor uuid; v_id uuid;
BEGIN
  BEGIN v_actor := auth.uid(); EXCEPTION WHEN OTHERS THEN v_actor := NULL; END;
  IF TG_OP = 'DELETE' THEN
    v_id := OLD.id;
    INSERT INTO public.fiscal_audit_log(table_name, record_id, action, changed_by, old_values)
    VALUES (TG_TABLE_NAME, v_id, 'DELETE', v_actor, public.mask_sensitive_jsonb(to_jsonb(OLD)));
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.fiscal_audit_log(table_name, record_id, action, changed_by, old_values, new_values)
    VALUES (TG_TABLE_NAME, NEW.id, 'UPDATE', v_actor,
            public.mask_sensitive_jsonb(to_jsonb(OLD)), public.mask_sensitive_jsonb(to_jsonb(NEW)));
    RETURN NEW;
  ELSE
    INSERT INTO public.fiscal_audit_log(table_name, record_id, action, changed_by, new_values)
    VALUES (TG_TABLE_NAME, NEW.id, 'INSERT', v_actor, public.mask_sensitive_jsonb(to_jsonb(NEW)));
    RETURN NEW;
  END IF;
END $fn$;

CREATE OR REPLACE FUNCTION public.regulatory_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public','pg_temp' AS $fn$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $fn$;

-- Versão publicada é imutável fora do fluxo formal (RPC define a GUC)
CREATE OR REPLACE FUNCTION public.regulatory_block_published_edit()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public','pg_temp' AS $fn$
BEGIN
  IF coalesce(current_setting('app.regulatory_formal_op', true),'') = 'on' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'VALIDATED' THEN
    RAISE EXCEPTION 'REGULATORY_PUBLISHED_IMMUTABLE'
      USING ERRCODE='55006',
            HINT='Versao publicada so muda por rpc_regulatory_dossier_new_version ou rpc_regulatory_dossier_block.';
  END IF;
  RETURN NEW;
END $fn$;

-- Filhos de um dossiê publicado também não mudam informalmente
CREATE OR REPLACE FUNCTION public.regulatory_block_published_child_edit()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public','pg_temp' AS $fn$
DECLARE v_status text; v_dossier uuid;
BEGIN
  IF coalesce(current_setting('app.regulatory_formal_op', true),'') = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  v_dossier := COALESCE(NEW, OLD);
  EXECUTE format('SELECT ($1).%I', 'dossier_id') INTO v_dossier USING COALESCE(NEW, OLD);
  SELECT status INTO v_status FROM public.microorganism_regulatory_dossiers WHERE id = v_dossier;
  IF v_status = 'VALIDATED' THEN
    RAISE EXCEPTION 'REGULATORY_PUBLISHED_IMMUTABLE' USING ERRCODE='55006';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $fn$;

CREATE OR REPLACE FUNCTION public.regulatory_snapshot_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public','pg_temp' AS $fn$
BEGIN
  RAISE EXCEPTION 'REGULATORY_SNAPSHOT_IMMUTABLE' USING ERRCODE='55006';
END $fn$;

DO $trg$
DECLARE r record;
BEGIN
  FOR r IN SELECT unnest(ARRAY[
    'microorganism_regulatory_dossiers','microorganism_regulatory_presentations',
    'microorganism_ncm_candidates','microorganism_regulatory_documents',
    'microorganism_regulatory_checklist','fiscal_official_sources',
    'microorganism_regulatory_publication_snapshots']) AS t
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_regulatory_audit_%1$s ON public.%1$I', r.t);
    EXECUTE format('CREATE TRIGGER trg_regulatory_audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON public.%1$I
                    FOR EACH ROW EXECUTE FUNCTION public.regulatory_audit_trigger()', r.t);
  END LOOP;

  FOR r IN SELECT unnest(ARRAY[
    'microorganism_regulatory_dossiers','microorganism_regulatory_presentations',
    'microorganism_regulatory_checklist','fiscal_official_sources']) AS t
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_regulatory_touch_%1$s ON public.%1$I', r.t);
    EXECUTE format('CREATE TRIGGER trg_regulatory_touch_%1$s BEFORE UPDATE ON public.%1$I
                    FOR EACH ROW EXECUTE FUNCTION public.regulatory_touch_updated_at()', r.t);
  END LOOP;

  FOR r IN SELECT unnest(ARRAY[
    'microorganism_regulatory_presentations','microorganism_ncm_candidates',
    'microorganism_regulatory_documents','microorganism_regulatory_checklist']) AS t
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_regulatory_child_lock_%1$s ON public.%1$I', r.t);
    EXECUTE format('CREATE TRIGGER trg_regulatory_child_lock_%1$s BEFORE INSERT OR UPDATE OR DELETE ON public.%1$I
                    FOR EACH ROW EXECUTE FUNCTION public.regulatory_block_published_child_edit()', r.t);
  END LOOP;
END $trg$;

DROP TRIGGER IF EXISTS trg_regulatory_published_lock ON public.microorganism_regulatory_dossiers;
CREATE TRIGGER trg_regulatory_published_lock
  BEFORE UPDATE ON public.microorganism_regulatory_dossiers
  FOR EACH ROW EXECUTE FUNCTION public.regulatory_block_published_edit();

DROP TRIGGER IF EXISTS trg_regulatory_snapshot_lock ON public.microorganism_regulatory_publication_snapshots;
CREATE TRIGGER trg_regulatory_snapshot_lock
  BEFORE UPDATE OR DELETE ON public.microorganism_regulatory_publication_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.regulatory_snapshot_immutable();
