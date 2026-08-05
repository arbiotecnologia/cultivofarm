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
-- O bucket 'fiscal-regulatorio' (privado) é provisionado pela API de
-- Storage, fora desta migration. Aqui apenas exigimos que ele exista e
-- seja privado: fail-closed se não estiver.
-- =====================================================================
DO $bucket$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id='fiscal-regulatorio' AND NOT public) THEN
    RAISE EXCEPTION 'F2_ABORT: bucket privado fiscal-regulatorio ausente ou publico';
  END IF;
END $bucket$;

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
  v_dossier := (to_jsonb(COALESCE(NEW, OLD)) ->> 'dossier_id')::uuid;
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

-- =====================================================================
-- SEÇÃO 12 — RPCs DE PREPARO (administrador/gestor)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.rpc_regulatory_dossier_ensure_draft(p_microorganism_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $fn$
DECLARE v_id uuid; v_next int;
BEGIN
  IF NOT public.fn_regulatory_can_prepare() THEN
    RAISE EXCEPTION 'REGULATORY_FORBIDDEN' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.microrganismos WHERE id = p_microorganism_id) THEN
    RAISE EXCEPTION 'REGULATORY_MICROORGANISM_NOT_FOUND' USING ERRCODE='22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('regulatory_dossier:'||p_microorganism_id::text, 0));

  SELECT id INTO v_id FROM public.microorganism_regulatory_dossiers
   WHERE microorganism_id = p_microorganism_id
     AND status IN ('DRAFT','PENDING_REVIEW') AND deleted_at IS NULL
   LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  SELECT coalesce(max(version),0)+1 INTO v_next
    FROM public.microorganism_regulatory_dossiers WHERE microorganism_id = p_microorganism_id;

  INSERT INTO public.microorganism_regulatory_dossiers
    (microorganism_id, version, status, created_by, updated_by)
  VALUES (p_microorganism_id, v_next, 'DRAFT', auth.uid(), auth.uid())
  RETURNING id INTO v_id;

  INSERT INTO public.microorganism_regulatory_checklist (dossier_id, item_key, state)
  SELECT v_id, k, 'PENDING' FROM unnest(ARRAY[
    'FINALIDADE_REGULATORIA','CEPA','FORMULACAO','GARANTIA_ROTULO','REGISTRO_MAPA',
    'TITULAR_FABRICANTE','NCM_CEST_TIPI','GTIN','UNIDADE_CONVERSAO','ORIGEM',
    'CFOP','TRIBUTACAO']) k
  ON CONFLICT (dossier_id, item_key) DO NOTHING;

  RETURN v_id;
END $fn$;

CREATE OR REPLACE FUNCTION public.rpc_regulatory_dossier_update_draft(p_dossier_id uuid, p_patch jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $fn$
DECLARE v_status text; v_row public.microorganism_regulatory_dossiers;
BEGIN
  IF NOT public.fn_regulatory_can_prepare() THEN
    RAISE EXCEPTION 'REGULATORY_FORBIDDEN' USING ERRCODE='42501';
  END IF;
  SELECT status INTO v_status FROM public.microorganism_regulatory_dossiers
   WHERE id = p_dossier_id AND deleted_at IS NULL FOR UPDATE;
  IF v_status IS NULL THEN RAISE EXCEPTION 'REGULATORY_DOSSIER_NOT_FOUND' USING ERRCODE='22023'; END IF;
  IF v_status NOT IN ('DRAFT','PENDING_REVIEW') THEN
    RAISE EXCEPTION 'REGULATORY_DOSSIER_NOT_EDITABLE' USING ERRCODE='55006';
  END IF;

  UPDATE public.microorganism_regulatory_dossiers d SET
    strain_code = coalesce(p_patch->>'strain_code', d.strain_code),
    strain_name = coalesce(p_patch->>'strain_name', d.strain_name),
    regulatory_category = coalesce(p_patch->>'regulatory_category', d.regulatory_category),
    formulation = coalesce(p_patch->>'formulation', d.formulation),
    label_guarantee = coalesce(p_patch->>'label_guarantee', d.label_guarantee),
    guarantee_unit = coalesce(p_patch->>'guarantee_unit', d.guarantee_unit),
    mapa_registration_number = coalesce(p_patch->>'mapa_registration_number', d.mapa_registration_number),
    mapa_holder = coalesce(p_patch->>'mapa_holder', d.mapa_holder),
    mapa_manufacturer = coalesce(p_patch->>'mapa_manufacturer', d.mapa_manufacturer),
    mapa_status = coalesce(p_patch->>'mapa_status', d.mapa_status),
    mapa_valid_until = coalesce((p_patch->>'mapa_valid_until')::date, d.mapa_valid_until),
    mapa_not_applicable_reason = coalesce(p_patch->>'mapa_not_applicable_reason', d.mapa_not_applicable_reason),
    effective_from = coalesce((p_patch->>'effective_from')::date, d.effective_from),
    effective_to = coalesce((p_patch->>'effective_to')::date, d.effective_to),
    -- Qualquer edição de conteúdo invalida aprovações já dadas
    technical_review_status = CASE WHEN d.technical_review_status='APPROVED' THEN 'PENDING' ELSE d.technical_review_status END,
    regulatory_review_status = CASE WHEN d.regulatory_review_status='APPROVED' THEN 'PENDING' ELSE d.regulatory_review_status END,
    fiscal_review_status = CASE WHEN d.fiscal_review_status='APPROVED' THEN 'PENDING' ELSE d.fiscal_review_status END,
    updated_by = auth.uid()
  WHERE d.id = p_dossier_id
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END $fn$;

CREATE OR REPLACE FUNCTION public.rpc_regulatory_presentation_upsert(
  p_dossier_id uuid, p_volume_ml integer, p_patch jsonb DEFAULT '{}'::jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $fn$
DECLARE v_id uuid; v_status text; v_units boolean; v_gtin boolean;
BEGIN
  IF NOT public.fn_regulatory_can_prepare() THEN
    RAISE EXCEPTION 'REGULATORY_FORBIDDEN' USING ERRCODE='42501';
  END IF;
  SELECT status INTO v_status FROM public.microorganism_regulatory_dossiers
   WHERE id = p_dossier_id AND deleted_at IS NULL FOR UPDATE;
  IF v_status IS NULL THEN RAISE EXCEPTION 'REGULATORY_DOSSIER_NOT_FOUND' USING ERRCODE='22023'; END IF;
  IF v_status NOT IN ('DRAFT','PENDING_REVIEW') THEN
    RAISE EXCEPTION 'REGULATORY_DOSSIER_NOT_EDITABLE' USING ERRCODE='55006';
  END IF;

  -- Confirmações são sempre explícitas: nunca inferidas de preenchimento
  v_units := coalesce((p_patch->>'units_confirmed')::boolean, false);
  v_gtin  := coalesce((p_patch->>'gtin_confirmed')::boolean, false);

  INSERT INTO public.microorganism_regulatory_presentations AS p
    (dossier_id, volume_ml, label, catalog_volume_id, created_by, updated_by)
  VALUES (p_dossier_id, p_volume_ml,
          coalesce(p_patch->>'label', (p_volume_ml/1000.0)::text||' L'),
          nullif(p_patch->>'catalog_volume_id','')::uuid, auth.uid(), auth.uid())
  ON CONFLICT (dossier_id, volume_ml) DO UPDATE SET
    label = coalesce(EXCLUDED.label, p.label),
    updated_by = auth.uid()
  RETURNING p.id INTO v_id;

  UPDATE public.microorganism_regulatory_presentations SET
    commercial_unit = coalesce(p_patch->>'commercial_unit', commercial_unit),
    taxable_unit = coalesce(p_patch->>'taxable_unit', taxable_unit),
    conversion_factor = coalesce((p_patch->>'conversion_factor')::numeric, conversion_factor),
    gtin = CASE WHEN coalesce((p_patch->>'gtin_absent')::boolean,false) THEN NULL
                ELSE coalesce(nullif(p_patch->>'gtin',''), gtin) END,
    gtin_absent = coalesce((p_patch->>'gtin_absent')::boolean, gtin_absent),
    units_confirmed = v_units,
    units_confirmed_by = CASE WHEN v_units THEN auth.uid() ELSE NULL END,
    units_confirmed_at = CASE WHEN v_units THEN now() ELSE NULL END,
    gtin_confirmed = v_gtin,
    gtin_confirmed_by = CASE WHEN v_gtin THEN auth.uid() ELSE NULL END,
    gtin_confirmed_at = CASE WHEN v_gtin THEN now() ELSE NULL END,
    updated_by = auth.uid()
  WHERE id = v_id;

  RETURN v_id;
END $fn$;

CREATE OR REPLACE FUNCTION public.rpc_regulatory_ncm_candidate_add(
  p_dossier_id uuid, p_ncm text, p_justification text,
  p_cest text DEFAULT NULL, p_confidence text DEFAULT 'LOW',
  p_source_key text DEFAULT NULL, p_source_url text DEFAULT NULL,
  p_consulted_at date DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $fn$
DECLARE v_id uuid; v_status text; v_source uuid;
BEGIN
  IF NOT public.fn_regulatory_can_prepare() THEN
    RAISE EXCEPTION 'REGULATORY_FORBIDDEN' USING ERRCODE='42501';
  END IF;
  SELECT status INTO v_status FROM public.microorganism_regulatory_dossiers
   WHERE id = p_dossier_id AND deleted_at IS NULL;
  IF v_status IS NULL THEN RAISE EXCEPTION 'REGULATORY_DOSSIER_NOT_FOUND' USING ERRCODE='22023'; END IF;
  IF v_status NOT IN ('DRAFT','PENDING_REVIEW') THEN
    RAISE EXCEPTION 'REGULATORY_DOSSIER_NOT_EDITABLE' USING ERRCODE='55006';
  END IF;
  SELECT id INTO v_source FROM public.fiscal_official_sources WHERE source_key = p_source_key;

  INSERT INTO public.microorganism_ncm_candidates
    (dossier_id, ncm, cest, justification, confidence, source_id, source_url, consulted_at, created_by)
  VALUES (p_dossier_id, p_ncm, p_cest, p_justification, coalesce(p_confidence,'LOW'),
          v_source, p_source_url, p_consulted_at, auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END $fn$;

CREATE OR REPLACE FUNCTION public.rpc_regulatory_ncm_candidate_decide(
  p_candidate_id uuid, p_approve boolean, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $fn$
DECLARE v_dossier uuid; v_status text; v_row public.microorganism_ncm_candidates;
BEGIN
  -- Aprovar candidato de NCM é ato contábil/fiscal
  IF NOT public.fn_regulatory_can_approve('FISCAL') THEN
    RAISE EXCEPTION 'REGULATORY_FORBIDDEN' USING ERRCODE='42501';
  END IF;
  IF nullif(btrim(coalesce(p_reason,'')),'') IS NULL THEN
    RAISE EXCEPTION 'REGULATORY_JUSTIFICATION_REQUIRED' USING ERRCODE='22023';
  END IF;

  SELECT dossier_id INTO v_dossier FROM public.microorganism_ncm_candidates
   WHERE id = p_candidate_id FOR UPDATE;
  IF v_dossier IS NULL THEN RAISE EXCEPTION 'REGULATORY_CANDIDATE_NOT_FOUND' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('regulatory_dossier_ncm:'||v_dossier::text, 0));

  SELECT status INTO v_status FROM public.microorganism_regulatory_dossiers WHERE id = v_dossier FOR UPDATE;
  IF v_status NOT IN ('DRAFT','PENDING_REVIEW') THEN
    RAISE EXCEPTION 'REGULATORY_DOSSIER_NOT_EDITABLE' USING ERRCODE='55006';
  END IF;

  UPDATE public.microorganism_ncm_candidates
     SET status = CASE WHEN p_approve THEN 'APPROVED' ELSE 'REJECTED' END,
         decided_by = auth.uid(), decided_at = now(), decision_reason = p_reason
   WHERE id = p_candidate_id
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END $fn$;

CREATE OR REPLACE FUNCTION public.rpc_regulatory_checklist_set(
  p_dossier_id uuid, p_item_key text, p_state text,
  p_justification text DEFAULT NULL, p_evidence_document_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $fn$
DECLARE v_status text; v_row public.microorganism_regulatory_checklist;
BEGIN
  IF NOT public.fn_regulatory_can_prepare() THEN
    RAISE EXCEPTION 'REGULATORY_FORBIDDEN' USING ERRCODE='42501';
  END IF;
  IF p_state = 'NOT_APPLICABLE' AND nullif(btrim(coalesce(p_justification,'')),'') IS NULL THEN
    RAISE EXCEPTION 'REGULATORY_JUSTIFICATION_REQUIRED' USING ERRCODE='22023';
  END IF;
  SELECT status INTO v_status FROM public.microorganism_regulatory_dossiers
   WHERE id = p_dossier_id AND deleted_at IS NULL;
  IF v_status IS NULL THEN RAISE EXCEPTION 'REGULATORY_DOSSIER_NOT_FOUND' USING ERRCODE='22023'; END IF;
  IF v_status NOT IN ('DRAFT','PENDING_REVIEW') THEN
    RAISE EXCEPTION 'REGULATORY_DOSSIER_NOT_EDITABLE' USING ERRCODE='55006';
  END IF;

  INSERT INTO public.microorganism_regulatory_checklist AS c
    (dossier_id, item_key, state, justification, evidence_document_id, decided_by, decided_at)
  VALUES (p_dossier_id, p_item_key, p_state, p_justification, p_evidence_document_id,
          CASE WHEN p_state='PENDING' THEN NULL ELSE auth.uid() END,
          CASE WHEN p_state='PENDING' THEN NULL ELSE now() END)
  ON CONFLICT (dossier_id, item_key) DO UPDATE SET
    state = EXCLUDED.state,
    justification = EXCLUDED.justification,
    evidence_document_id = EXCLUDED.evidence_document_id,
    decided_by = EXCLUDED.decided_by,
    decided_at = EXCLUDED.decided_at
  RETURNING * INTO v_row;

  -- Mudança de checklist invalida aprovações já concedidas
  UPDATE public.microorganism_regulatory_dossiers SET
    technical_review_status = CASE WHEN technical_review_status='APPROVED' THEN 'PENDING' ELSE technical_review_status END,
    regulatory_review_status = CASE WHEN regulatory_review_status='APPROVED' THEN 'PENDING' ELSE regulatory_review_status END,
    fiscal_review_status = CASE WHEN fiscal_review_status='APPROVED' THEN 'PENDING' ELSE fiscal_review_status END,
    updated_by = auth.uid()
  WHERE id = p_dossier_id;

  RETURN to_jsonb(v_row);
END $fn$;

CREATE OR REPLACE FUNCTION public.rpc_regulatory_document_register(
  p_dossier_id uuid, p_doc_type text, p_title text, p_storage_path text, p_content_sha256 text,
  p_issuer text DEFAULT NULL, p_issued_at date DEFAULT NULL, p_valid_until date DEFAULT NULL,
  p_source_key text DEFAULT NULL, p_source_url text DEFAULT NULL,
  p_consulted_at date DEFAULT NULL, p_doc_version text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $fn$
DECLARE v_id uuid; v_status text; v_source uuid;
BEGIN
  IF NOT public.fn_regulatory_can_prepare() THEN
    RAISE EXCEPTION 'REGULATORY_FORBIDDEN' USING ERRCODE='42501';
  END IF;
  SELECT status INTO v_status FROM public.microorganism_regulatory_dossiers
   WHERE id = p_dossier_id AND deleted_at IS NULL;
  IF v_status IS NULL THEN RAISE EXCEPTION 'REGULATORY_DOSSIER_NOT_FOUND' USING ERRCODE='22023'; END IF;
  IF v_status NOT IN ('DRAFT','PENDING_REVIEW') THEN
    RAISE EXCEPTION 'REGULATORY_DOSSIER_NOT_EDITABLE' USING ERRCODE='55006';
  END IF;
  SELECT id INTO v_source FROM public.fiscal_official_sources WHERE source_key = p_source_key;

  INSERT INTO public.microorganism_regulatory_documents
    (dossier_id, doc_type, title, storage_path, content_sha256, issuer, issued_at, valid_until,
     source_id, source_url, consulted_at, doc_version, uploaded_by)
  VALUES (p_dossier_id, p_doc_type, p_title, p_storage_path, lower(p_content_sha256),
          p_issuer, p_issued_at, p_valid_until, v_source, p_source_url, p_consulted_at,
          p_doc_version, auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END $fn$;

-- =====================================================================
-- SEÇÃO 13 — WORKFLOW: SUBMISSÃO, REVISÃO, PUBLICAÇÃO, BLOQUEIO
-- =====================================================================
CREATE OR REPLACE FUNCTION public.rpc_regulatory_dossier_submit(p_dossier_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $fn$
DECLARE v_status text; v_row public.microorganism_regulatory_dossiers;
BEGIN
  IF NOT public.fn_regulatory_can_prepare() THEN
    RAISE EXCEPTION 'REGULATORY_FORBIDDEN' USING ERRCODE='42501';
  END IF;
  SELECT status INTO v_status FROM public.microorganism_regulatory_dossiers
   WHERE id = p_dossier_id AND deleted_at IS NULL FOR UPDATE;
  IF v_status IS NULL THEN RAISE EXCEPTION 'REGULATORY_DOSSIER_NOT_FOUND' USING ERRCODE='22023'; END IF;
  IF v_status <> 'DRAFT' THEN
    RAISE EXCEPTION 'REGULATORY_INVALID_TRANSITION' USING ERRCODE='55006';
  END IF;
  UPDATE public.microorganism_regulatory_dossiers
     SET status = 'PENDING_REVIEW', updated_by = auth.uid()
   WHERE id = p_dossier_id RETURNING * INTO v_row;
  RETURN to_jsonb(v_row);
END $fn$;

CREATE OR REPLACE FUNCTION public.rpc_regulatory_review_decide(
  p_dossier_id uuid, p_layer text, p_decision text, p_justification text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $fn$
DECLARE v_status text; v_row public.microorganism_regulatory_dossiers;
BEGIN
  IF p_layer NOT IN ('TECHNICAL','REGULATORY','FISCAL') THEN
    RAISE EXCEPTION 'REGULATORY_INVALID_LAYER' USING ERRCODE='22023';
  END IF;
  IF p_decision NOT IN ('APPROVED','REJECTED') THEN
    RAISE EXCEPTION 'REGULATORY_INVALID_DECISION' USING ERRCODE='22023';
  END IF;
  IF NOT public.fn_regulatory_can_approve(p_layer) THEN
    RAISE EXCEPTION 'REGULATORY_FORBIDDEN' USING ERRCODE='42501';
  END IF;
  IF nullif(btrim(coalesce(p_justification,'')),'') IS NULL THEN
    RAISE EXCEPTION 'REGULATORY_JUSTIFICATION_REQUIRED' USING ERRCODE='22023';
  END IF;

  SELECT status INTO v_status FROM public.microorganism_regulatory_dossiers
   WHERE id = p_dossier_id AND deleted_at IS NULL FOR UPDATE;
  IF v_status IS NULL THEN RAISE EXCEPTION 'REGULATORY_DOSSIER_NOT_FOUND' USING ERRCODE='22023'; END IF;
  IF v_status <> 'PENDING_REVIEW' THEN
    RAISE EXCEPTION 'REGULATORY_INVALID_TRANSITION' USING ERRCODE='55006';
  END IF;

  UPDATE public.microorganism_regulatory_dossiers SET
    technical_review_status = CASE WHEN p_layer='TECHNICAL' THEN p_decision ELSE technical_review_status END,
    technical_review_by = CASE WHEN p_layer='TECHNICAL' THEN auth.uid() ELSE technical_review_by END,
    technical_review_at = CASE WHEN p_layer='TECHNICAL' THEN now() ELSE technical_review_at END,
    technical_review_notes = CASE WHEN p_layer='TECHNICAL' THEN p_justification ELSE technical_review_notes END,
    regulatory_review_status = CASE WHEN p_layer='REGULATORY' THEN p_decision ELSE regulatory_review_status END,
    regulatory_review_by = CASE WHEN p_layer='REGULATORY' THEN auth.uid() ELSE regulatory_review_by END,
    regulatory_review_at = CASE WHEN p_layer='REGULATORY' THEN now() ELSE regulatory_review_at END,
    regulatory_review_notes = CASE WHEN p_layer='REGULATORY' THEN p_justification ELSE regulatory_review_notes END,
    fiscal_review_status = CASE WHEN p_layer='FISCAL' THEN p_decision ELSE fiscal_review_status END,
    fiscal_review_by = CASE WHEN p_layer='FISCAL' THEN auth.uid() ELSE fiscal_review_by END,
    fiscal_review_at = CASE WHEN p_layer='FISCAL' THEN now() ELSE fiscal_review_at END,
    fiscal_review_notes = CASE WHEN p_layer='FISCAL' THEN p_justification ELSE fiscal_review_notes END,
    status = CASE WHEN p_decision='REJECTED' THEN 'DRAFT' ELSE status END,
    updated_by = auth.uid()
  WHERE id = p_dossier_id RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END $fn$;

CREATE OR REPLACE FUNCTION public.rpc_regulatory_dossier_publish(p_dossier_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $fn$
DECLARE
  d public.microorganism_regulatory_dossiers;
  v_cand public.microorganism_ncm_candidates;
  v_pending int; v_docs int; v_snapshot jsonb; v_sha text;
BEGIN
  IF NOT public.fn_regulatory_can_prepare() THEN
    RAISE EXCEPTION 'REGULATORY_FORBIDDEN' USING ERRCODE='42501';
  END IF;

  SELECT * INTO d FROM public.microorganism_regulatory_dossiers
   WHERE id = p_dossier_id AND deleted_at IS NULL FOR UPDATE;
  IF d.id IS NULL THEN RAISE EXCEPTION 'REGULATORY_DOSSIER_NOT_FOUND' USING ERRCODE='22023'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('regulatory_publish:'||d.microorganism_id::text, 0));

  IF d.status <> 'PENDING_REVIEW' THEN
    RAISE EXCEPTION 'REGULATORY_INVALID_TRANSITION' USING ERRCODE='55006';
  END IF;
  IF d.technical_review_status <> 'APPROVED'
     OR d.regulatory_review_status <> 'APPROVED'
     OR d.fiscal_review_status <> 'APPROVED' THEN
    RAISE EXCEPTION 'REGULATORY_APPROVALS_INCOMPLETE' USING ERRCODE='55006';
  END IF;

  SELECT count(*) INTO v_pending FROM public.microorganism_regulatory_checklist
   WHERE dossier_id = p_dossier_id AND state = 'PENDING';
  IF v_pending > 0 THEN
    RAISE EXCEPTION 'REGULATORY_CHECKLIST_INCOMPLETE: % item(ns) pendente(s)', v_pending USING ERRCODE='55006';
  END IF;

  SELECT count(*) INTO v_docs FROM public.microorganism_regulatory_documents
   WHERE dossier_id = p_dossier_id AND deleted_at IS NULL AND doc_type IN ('ROTULO','LAUDO');
  IF v_docs = 0 THEN
    RAISE EXCEPTION 'REGULATORY_EVIDENCE_DOCUMENT_MISSING' USING ERRCODE='55006';
  END IF;

  SELECT * INTO v_cand FROM public.microorganism_ncm_candidates
   WHERE dossier_id = p_dossier_id AND status = 'APPROVED';
  IF v_cand.id IS NULL THEN
    RAISE EXCEPTION 'REGULATORY_NCM_NOT_APPROVED' USING ERRCODE='55006';
  END IF;

  IF EXISTS (SELECT 1 FROM public.microorganism_regulatory_presentations
              WHERE dossier_id = p_dossier_id AND (NOT units_confirmed OR NOT gtin_confirmed)) THEN
    RAISE EXCEPTION 'REGULATORY_PRESENTATION_NOT_CONFIRMED' USING ERRCODE='55006';
  END IF;

  PERFORM set_config('app.regulatory_formal_op','on', true);

  UPDATE public.microorganism_regulatory_dossiers
     SET status = 'VALIDATED',
         published_ncm = v_cand.ncm,
         published_cest = v_cand.cest,
         published_ncm_candidate_id = v_cand.id,
         published_at = now(), published_by = auth.uid(),
         effective_from = coalesce(effective_from, current_date),
         updated_by = auth.uid()
   WHERE id = p_dossier_id RETURNING * INTO d;

  v_snapshot := jsonb_build_object(
    'dossier', to_jsonb(d),
    'presentations', coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.volume_ml)
                               FROM public.microorganism_regulatory_presentations p
                               WHERE p.dossier_id = p_dossier_id),'[]'::jsonb),
    'documents', coalesce((SELECT jsonb_agg(jsonb_build_object(
                              'id',x.id,'doc_type',x.doc_type,'title',x.title,
                              'content_sha256',x.content_sha256,'issued_at',x.issued_at,
                              'valid_until',x.valid_until,'source_url',x.source_url) ORDER BY x.id)
                           FROM public.microorganism_regulatory_documents x
                           WHERE x.dossier_id = p_dossier_id AND x.deleted_at IS NULL),'[]'::jsonb),
    'checklist', coalesce((SELECT jsonb_agg(jsonb_build_object(
                              'item_key',c.item_key,'state',c.state,'justification',c.justification)
                              ORDER BY c.item_key)
                           FROM public.microorganism_regulatory_checklist c
                           WHERE c.dossier_id = p_dossier_id),'[]'::jsonb),
    'ncm_candidate', to_jsonb(v_cand));
  v_sha := encode(digest(v_snapshot::text,'sha256'),'hex');

  INSERT INTO public.microorganism_regulatory_publication_snapshots
    (dossier_id, microorganism_id, version, snapshot, snapshot_sha256, published_by)
  VALUES (p_dossier_id, d.microorganism_id, d.version, v_snapshot, v_sha, auth.uid());

  PERFORM set_config('app.regulatory_formal_op','', true);
  RETURN jsonb_build_object('dossier_id', p_dossier_id, 'status', d.status, 'snapshot_sha256', v_sha);
END $fn$;

CREATE OR REPLACE FUNCTION public.rpc_regulatory_dossier_block(p_dossier_id uuid, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $fn$
DECLARE v_row public.microorganism_regulatory_dossiers;
BEGIN
  IF NOT public.fn_regulatory_can_prepare() THEN
    RAISE EXCEPTION 'REGULATORY_FORBIDDEN' USING ERRCODE='42501';
  END IF;
  IF nullif(btrim(coalesce(p_reason,'')),'') IS NULL THEN
    RAISE EXCEPTION 'REGULATORY_JUSTIFICATION_REQUIRED' USING ERRCODE='22023';
  END IF;
  PERFORM set_config('app.regulatory_formal_op','on', true);
  UPDATE public.microorganism_regulatory_dossiers
     SET status = 'BLOCKED', blocked_reason = p_reason, updated_by = auth.uid()
   WHERE id = p_dossier_id AND deleted_at IS NULL RETURNING * INTO v_row;
  PERFORM set_config('app.regulatory_formal_op','', true);
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'REGULATORY_DOSSIER_NOT_FOUND' USING ERRCODE='22023'; END IF;
  RETURN to_jsonb(v_row);
END $fn$;

CREATE OR REPLACE FUNCTION public.rpc_regulatory_dossier_new_version(p_microorganism_id uuid, p_reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $fn$
DECLARE v_id uuid; v_next int;
BEGIN
  IF NOT public.fn_regulatory_can_prepare() THEN
    RAISE EXCEPTION 'REGULATORY_FORBIDDEN' USING ERRCODE='42501';
  END IF;
  IF nullif(btrim(coalesce(p_reason,'')),'') IS NULL THEN
    RAISE EXCEPTION 'REGULATORY_JUSTIFICATION_REQUIRED' USING ERRCODE='22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('regulatory_dossier:'||p_microorganism_id::text, 0));

  IF EXISTS (SELECT 1 FROM public.microorganism_regulatory_dossiers
              WHERE microorganism_id = p_microorganism_id
                AND status IN ('DRAFT','PENDING_REVIEW') AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'REGULATORY_OPEN_VERSION_EXISTS' USING ERRCODE='55006';
  END IF;

  SELECT coalesce(max(version),0)+1 INTO v_next
    FROM public.microorganism_regulatory_dossiers WHERE microorganism_id = p_microorganism_id;

  INSERT INTO public.microorganism_regulatory_dossiers
    (microorganism_id, version, status, created_by, updated_by, blocked_reason)
  VALUES (p_microorganism_id, v_next, 'DRAFT', auth.uid(), auth.uid(), NULL)
  RETURNING id INTO v_id;

  INSERT INTO public.microorganism_regulatory_checklist (dossier_id, item_key, state)
  SELECT v_id, k, 'PENDING' FROM unnest(ARRAY[
    'FINALIDADE_REGULATORIA','CEPA','FORMULACAO','GARANTIA_ROTULO','REGISTRO_MAPA',
    'TITULAR_FABRICANTE','NCM_CEST_TIPI','GTIN','UNIDADE_CONVERSAO','ORIGEM',
    'CFOP','TRIBUTACAO']) k;

  RETURN v_id;
END $fn$;

DO $g$
DECLARE r record;
BEGIN
  FOR r IN SELECT p.oid::regprocedure::text AS sig FROM pg_proc p
           JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE n.nspname='public' AND p.proname LIKE 'rpc_regulatory_%'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
  END LOOP;
END $g$;

-- =====================================================================
-- SEÇÃO 14 — SNAPSHOT DE FATOS REGULATÓRIOS PARA O GATE
-- Apenas fatos agregados (contagens e estados). Nenhum conteúdo de
-- documento é exposto por aqui.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.fn_microorganism_regulatory_facts(p_microorganism_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $fn$
  WITH d AS (
    SELECT * FROM public.microorganism_regulatory_dossiers
     WHERE microorganism_id = p_microorganism_id AND deleted_at IS NULL
     ORDER BY (status='VALIDATED') DESC, version DESC
     LIMIT 1)
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM d) THEN NULL ELSE (
    SELECT jsonb_build_object(
      'dossier_id', d.id,
      'version', d.version,
      'status', d.status,
      'blocked_reason', d.blocked_reason,
      'regulatory_category', d.regulatory_category,
      'strain', coalesce(nullif(btrim(coalesce(d.strain_code,'')),''), nullif(btrim(coalesce(d.strain_name,'')),'')),
      'formulation', nullif(btrim(coalesce(d.formulation,'')),''),
      'label_guarantee', nullif(btrim(coalesce(d.label_guarantee,'')),''),
      'mapa_status', d.mapa_status,
      'mapa_registration_number', nullif(btrim(coalesce(d.mapa_registration_number,'')),''),
      'mapa_holder', nullif(btrim(coalesce(d.mapa_holder,'')),''),
      'mapa_valid_until', d.mapa_valid_until,
      'mapa_not_applicable_reason', nullif(btrim(coalesce(d.mapa_not_applicable_reason,'')),''),
      'published_ncm', d.published_ncm,
      'published_cest', d.published_cest,
      'effective_from', d.effective_from,
      'effective_to', d.effective_to,
      'review_technical', d.technical_review_status,
      'review_regulatory', d.regulatory_review_status,
      'review_fiscal', d.fiscal_review_status,
      'has_label_document', EXISTS (SELECT 1 FROM public.microorganism_regulatory_documents x
                                     WHERE x.dossier_id=d.id AND x.deleted_at IS NULL AND x.doc_type='ROTULO'),
      'has_report_document', EXISTS (SELECT 1 FROM public.microorganism_regulatory_documents x
                                     WHERE x.dossier_id=d.id AND x.deleted_at IS NULL AND x.doc_type IN ('LAUDO','CERTIFICADO_ANALISE')),
      'expired_documents', (SELECT count(*) FROM public.microorganism_regulatory_documents x
                             WHERE x.dossier_id=d.id AND x.deleted_at IS NULL
                               AND x.valid_until IS NOT NULL AND x.valid_until < current_date),
      'ncm_approved', EXISTS (SELECT 1 FROM public.microorganism_ncm_candidates c
                               WHERE c.dossier_id=d.id AND c.status='APPROVED'),
      'ncm_candidates', (SELECT count(*) FROM public.microorganism_ncm_candidates c WHERE c.dossier_id=d.id),
      'checklist_total', (SELECT count(*) FROM public.microorganism_regulatory_checklist c WHERE c.dossier_id=d.id),
      'checklist_pending', coalesce((SELECT jsonb_agg(c.item_key ORDER BY c.item_key)
                                      FROM public.microorganism_regulatory_checklist c
                                      WHERE c.dossier_id=d.id AND c.state='PENDING'),'[]'::jsonb),
      'checklist_not_applicable', coalesce((SELECT jsonb_agg(jsonb_build_object(
                                      'item_key',c.item_key,'justification',c.justification) ORDER BY c.item_key)
                                      FROM public.microorganism_regulatory_checklist c
                                      WHERE c.dossier_id=d.id AND c.state='NOT_APPLICABLE'),'[]'::jsonb),
      'checklist_confirmed', (SELECT count(*) FROM public.microorganism_regulatory_checklist c
                               WHERE c.dossier_id=d.id AND c.state='CONFIRMED'),
      'presentations_total', (SELECT count(*) FROM public.microorganism_regulatory_presentations p WHERE p.dossier_id=d.id),
      'presentations_units_unconfirmed', (SELECT count(*) FROM public.microorganism_regulatory_presentations p
                                           WHERE p.dossier_id=d.id AND NOT p.units_confirmed),
      'presentations_gtin_unconfirmed', (SELECT count(*) FROM public.microorganism_regulatory_presentations p
                                          WHERE p.dossier_id=d.id AND NOT p.gtin_confirmed))
    FROM d) END;
$fn$;

REVOKE ALL ON FUNCTION public.fn_microorganism_regulatory_facts(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_microorganism_regulatory_facts(uuid) TO authenticated, service_role;

-- =====================================================================
-- SEÇÃO 15 — EVOLUÇÃO DO GATE CANÔNICO (motor único, sem paralelo)
-- REGULATORY_EVIDENCE_NOT_IMPLEMENTED deixa de existir e dá lugar a
-- pendências regulatórias específicas e acionáveis.
-- =====================================================================
DROP FUNCTION IF EXISTS public.fn_fiscal_item_profile_gate_eval(
  text,text,boolean,text,timestamptz,text,text,text,text,text,text,text,text,text,text,text,text);

CREATE OR REPLACE FUNCTION public.fn_fiscal_item_profile_gate_eval(
  p_scope text, p_crt text, p_is_active boolean, p_profile_status text,
  p_accounting_validated_at timestamptz, p_accounting_notes text,
  p_fiscal_description text, p_commercial_unit text, p_taxable_unit text,
  p_ncm text, p_origin_code text, p_cfop_in_state text, p_cfop_interstate text,
  p_icms_cst text, p_icms_csosn text, p_pis_cst text, p_cofins_cst text,
  p_regulatory jsonb DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'pg_catalog','pg_temp'
AS $function$
DECLARE
  v_p jsonb := '[]'::jsonb;   -- pendências técnicas
  v_reg jsonb := '[]'::jsonb; -- pendências regulatórias
  v_na jsonb := '[]'::jsonb;  -- itens declarados NÃO APLICÁVEIS (com justificativa)
  v_notes text := lower(coalesce(p_accounting_notes, ''));
  v_synthetic boolean;
  v_technical_ready boolean;
  v_regulatory_ready boolean;
  v_has_cst boolean := nullif(btrim(coalesce(p_icms_cst,'')),'') IS NOT NULL;
  v_has_csosn boolean := nullif(btrim(coalesce(p_icms_csosn,'')),'') IS NOT NULL;
  v_pend_count int;
BEGIN
  -- ---------------- Camada REGULATÓRIA (Fase F2) ----------------
  IF p_regulatory IS NULL OR p_regulatory = 'null'::jsonb THEN
    v_reg := jsonb_build_array(jsonb_build_object(
      'code','REGULATORY_DOSSIER_MISSING','field','microorganism_regulatory_dossiers','layer','REGULATORY',
      'message','Sem dossie regulatorio cadastrado para o item.'));
  ELSE
    v_na := coalesce(p_regulatory->'checklist_not_applicable','[]'::jsonb);

    IF coalesce(p_regulatory->>'status','') = 'BLOCKED' THEN
      v_reg := v_reg || jsonb_build_array(jsonb_build_object(
        'code','REGULATORY_DOSSIER_BLOCKED','field','status','layer','REGULATORY',
        'message', coalesce(p_regulatory->>'blocked_reason','Dossie regulatorio bloqueado.')));
    ELSIF coalesce(p_regulatory->>'status','') <> 'VALIDATED' THEN
      v_reg := v_reg || jsonb_build_array(jsonb_build_object(
        'code','REGULATORY_DOSSIER_NOT_PUBLISHED','field','status','layer','REGULATORY',
        'message','Dossie regulatorio em '||coalesce(p_regulatory->>'status','?')||'; exigido VALIDATED.'));
    END IF;

    IF p_regulatory->>'regulatory_category' IS NULL THEN
      v_reg := v_reg || jsonb_build_array(jsonb_build_object(
        'code','REGULATORY_CATEGORY_MISSING','field','regulatory_category','layer','REGULATORY',
        'message','Finalidade/categoria regulatoria nao definida (nao pode ser presumida pela especie).'));
    END IF;
    IF p_regulatory->>'strain' IS NULL THEN
      v_reg := v_reg || jsonb_build_array(jsonb_build_object(
        'code','REGULATORY_STRAIN_MISSING','field','strain_code','layer','REGULATORY',
        'message','Cepa/estirpe nao informada.'));
    END IF;
    IF p_regulatory->>'formulation' IS NULL THEN
      v_reg := v_reg || jsonb_build_array(jsonb_build_object(
        'code','REGULATORY_FORMULATION_MISSING','field','formulation','layer','REGULATORY',
        'message','Formulacao/apresentacao nao informada.'));
    END IF;
    IF p_regulatory->>'label_guarantee' IS NULL THEN
      v_reg := v_reg || jsonb_build_array(jsonb_build_object(
        'code','REGULATORY_LABEL_GUARANTEE_MISSING','field','label_guarantee','layer','REGULATORY',
        'message','Composicao/garantia de rotulo nao informada.'));
    END IF;

    -- MAPA: MISSING x NOT_APPLICABLE justificado x vencido
    IF coalesce(p_regulatory->>'mapa_status','') = 'NOT_APPLICABLE' THEN
      v_na := v_na || jsonb_build_array(jsonb_build_object(
        'item_key','REGISTRO_MAPA','justification', p_regulatory->>'mapa_not_applicable_reason'));
    ELSIF p_regulatory->>'mapa_registration_number' IS NULL THEN
      v_reg := v_reg || jsonb_build_array(jsonb_build_object(
        'code','REGULATORY_MAPA_REGISTRATION_MISSING','field','mapa_registration_number','layer','REGULATORY',
        'message','Registro MAPA/SIPEAGRO ausente e sem declaracao justificada de nao aplicabilidade.'));
    ELSIF coalesce(p_regulatory->>'mapa_status','') IN ('EXPIRED','SUSPENDED') THEN
      v_reg := v_reg || jsonb_build_array(jsonb_build_object(
        'code','REGULATORY_MAPA_REGISTRATION_INVALID','field','mapa_status','layer','REGULATORY',
        'message','Registro MAPA em situacao '||(p_regulatory->>'mapa_status')||'.'));
    ELSIF (p_regulatory->>'mapa_valid_until') IS NOT NULL
          AND (p_regulatory->>'mapa_valid_until')::date < current_date THEN
      v_reg := v_reg || jsonb_build_array(jsonb_build_object(
        'code','REGULATORY_MAPA_REGISTRATION_INVALID','field','mapa_valid_until','layer','REGULATORY',
        'message','Registro MAPA com validade expirada.'));
    END IF;
    IF p_regulatory->>'mapa_holder' IS NULL AND coalesce(p_regulatory->>'mapa_status','') <> 'NOT_APPLICABLE' THEN
      v_reg := v_reg || jsonb_build_array(jsonb_build_object(
        'code','REGULATORY_HOLDER_MISSING','field','mapa_holder','layer','REGULATORY',
        'message','Titular/fabricante do registro nao informado.'));
    END IF;

    -- Documentos de evidência
    IF coalesce((p_regulatory->>'has_label_document')::boolean,false) IS NOT TRUE THEN
      v_reg := v_reg || jsonb_build_array(jsonb_build_object(
        'code','REGULATORY_LABEL_DOCUMENT_MISSING','field','documents','layer','REGULATORY',
        'message','Rotulo nao anexado ao dossie.'));
    END IF;
    IF coalesce((p_regulatory->>'has_report_document')::boolean,false) IS NOT TRUE THEN
      v_reg := v_reg || jsonb_build_array(jsonb_build_object(
        'code','REGULATORY_REPORT_DOCUMENT_MISSING','field','documents','layer','REGULATORY',
        'message','Laudo/certificado de analise nao anexado ao dossie.'));
    END IF;
    IF coalesce((p_regulatory->>'expired_documents')::int,0) > 0 THEN
      v_reg := v_reg || jsonb_build_array(jsonb_build_object(
        'code','REGULATORY_DOCUMENT_EXPIRED','field','documents','layer','REGULATORY',
        'message',(p_regulatory->>'expired_documents')||' documento(s) com validade expirada.'));
    END IF;

    -- Aprovações separadas
    IF coalesce(p_regulatory->>'review_technical','PENDING') <> 'APPROVED' THEN
      v_reg := v_reg || jsonb_build_array(jsonb_build_object(
        'code','REGULATORY_TECHNICAL_APPROVAL_MISSING','field','technical_review_status','layer','REGULATORY',
        'message','Revisao tecnica nao aprovada.'));
    END IF;
    IF coalesce(p_regulatory->>'review_regulatory','PENDING') <> 'APPROVED' THEN
      v_reg := v_reg || jsonb_build_array(jsonb_build_object(
        'code','REGULATORY_RESPONSIBLE_APPROVAL_MISSING','field','regulatory_review_status','layer','REGULATORY',
        'message','Revisao do responsavel tecnico (regulatoria) nao aprovada.'));
    END IF;
    IF coalesce(p_regulatory->>'review_fiscal','PENDING') <> 'APPROVED' THEN
      v_reg := v_reg || jsonb_build_array(jsonb_build_object(
        'code','REGULATORY_FISCAL_APPROVAL_MISSING','field','fiscal_review_status','layer','REGULATORY',
        'message','Revisao contabil/fiscal nao aprovada.'));
    END IF;

    -- Checklist
    v_pend_count := jsonb_array_length(coalesce(p_regulatory->'checklist_pending','[]'::jsonb));
    IF v_pend_count > 0 THEN
      v_reg := v_reg || jsonb_build_array(jsonb_build_object(
        'code','REGULATORY_CHECKLIST_INCOMPLETE','field','checklist','layer','REGULATORY',
        'message', v_pend_count||' item(ns) de checklist pendente(s).',
        'items', p_regulatory->'checklist_pending'));
    END IF;

    -- NCM aprovado e coerente com o perfil fiscal
    IF coalesce((p_regulatory->>'ncm_approved')::boolean,false) IS NOT TRUE THEN
      v_reg := v_reg || jsonb_build_array(jsonb_build_object(
        'code','REGULATORY_NCM_NOT_APPROVED','field','microorganism_ncm_candidates','layer','REGULATORY',
        'message','Nenhum candidato de NCM aprovado; sugestao nunca vale como codigo aprovado.'));
    ELSIF nullif(btrim(coalesce(p_ncm,'')),'') IS NOT NULL
          AND p_regulatory->>'published_ncm' IS NOT NULL
          AND p_regulatory->>'published_ncm' <> btrim(p_ncm) THEN
      v_reg := v_reg || jsonb_build_array(jsonb_build_object(
        'code','REGULATORY_NCM_DIVERGES_FROM_PROFILE','field','ncm','layer','REGULATORY',
        'message','NCM do perfil fiscal diverge do NCM publicado no dossie.'));
    END IF;

    -- Apresentações: unidades e GTIN exigem confirmação explícita
    IF coalesce((p_regulatory->>'presentations_total')::int,0) = 0 THEN
      v_reg := v_reg || jsonb_build_array(jsonb_build_object(
        'code','REGULATORY_PRESENTATION_MISSING','field','presentations','layer','REGULATORY',
        'message','Nenhuma apresentacao cadastrada.'));
    ELSE
      IF coalesce((p_regulatory->>'presentations_units_unconfirmed')::int,0) > 0 THEN
        v_reg := v_reg || jsonb_build_array(jsonb_build_object(
          'code','REGULATORY_UNITS_NOT_CONFIRMED','field','presentations.units','layer','REGULATORY',
          'message',(p_regulatory->>'presentations_units_unconfirmed')||' apresentacao(oes) sem uCom/uTrib/fator confirmados.'));
      END IF;
      IF coalesce((p_regulatory->>'presentations_gtin_unconfirmed')::int,0) > 0 THEN
        v_reg := v_reg || jsonb_build_array(jsonb_build_object(
          'code','REGULATORY_GTIN_NOT_DECLARED','field','presentations.gtin','layer','REGULATORY',
          'message',(p_regulatory->>'presentations_gtin_unconfirmed')||' apresentacao(oes) sem GTIN confirmado nem declaracao SEM GTIN.'));
      END IF;
    END IF;
  END IF;

  -- ---------------- Camada TÉCNICA (Fase F1, inalterada) ----------------
  IF p_profile_status IS NULL THEN
    RETURN jsonb_build_object(
      'scope', p_scope, 'ready', false, 'technical_ready', false, 'regulatory_ready', false,
      'status', 'NOT_READY', 'quarantined', false, 'profile_present', false,
      'not_applicable', v_na,
      'pendencies', jsonb_build_array(jsonb_build_object(
        'code','PROFILE_MISSING','field','profile_status','layer','TECHNICAL',
        'message','Item sem perfil fiscal cadastrado.')) || v_reg);
  END IF;

  v_synthetic := v_notes LIKE '%sintetic%'
              OR v_notes LIKE '%sintétic%'
              OR v_notes LIKE '%homologacao%'
              OR v_notes LIKE '%homologação%'
              OR v_notes LIKE '%hml-b2b%'
              OR v_notes LIKE '%test_only%'
              OR v_notes LIKE '%quarentena%';

  IF coalesce(p_is_active, false) IS NOT TRUE THEN
    v_p := v_p || jsonb_build_array(jsonb_build_object(
      'code','PROFILE_INACTIVE','field','is_active','layer','TECHNICAL','message','Perfil fiscal inativo.'));
  END IF;

  IF p_profile_status = 'BLOCKED' THEN
    v_p := v_p || jsonb_build_array(jsonb_build_object(
      'code','PROFILE_QUARANTINED','field','profile_status','layer','TECHNICAL',
      'message','Perfil fiscal em quarentena (BLOCKED).'));
  ELSIF p_profile_status <> 'VALIDATED' THEN
    v_p := v_p || jsonb_build_array(jsonb_build_object(
      'code','PROFILE_NOT_PUBLISHED','field','profile_status','layer','TECHNICAL',
      'message','Perfil fiscal nao publicado (exigido VALIDATED).'));
  END IF;

  IF p_accounting_validated_at IS NULL THEN
    v_p := v_p || jsonb_build_array(jsonb_build_object(
      'code','ACCOUNTING_NOT_VALIDATED','field','accounting_validated_at','layer','TECHNICAL',
      'message','Sem validacao contabil preliminar registrada.'));
  END IF;

  IF v_synthetic THEN
    v_p := v_p || jsonb_build_array(jsonb_build_object(
      'code','PROFILE_SYNTHETIC','field','accounting_notes','layer','TECHNICAL',
      'message','Classificacao sintetica de homologacao; nao utilizavel em faturamento.'));
  END IF;

  IF nullif(btrim(coalesce(p_fiscal_description,'')),'') IS NULL THEN
    v_p := v_p || jsonb_build_array(jsonb_build_object('code','MISSING_FISCAL_DESCRIPTION','field','fiscal_description','layer','TECHNICAL','message','Descricao fiscal ausente.'));
  END IF;
  IF nullif(btrim(coalesce(p_commercial_unit,'')),'') IS NULL THEN
    v_p := v_p || jsonb_build_array(jsonb_build_object('code','MISSING_COMMERCIAL_UNIT','field','commercial_unit','layer','TECHNICAL','message','Unidade comercial ausente.'));
  END IF;
  IF nullif(btrim(coalesce(p_taxable_unit,'')),'') IS NULL THEN
    v_p := v_p || jsonb_build_array(jsonb_build_object('code','MISSING_TAXABLE_UNIT','field','taxable_unit','layer','TECHNICAL','message','Unidade tributavel ausente.'));
  END IF;
  IF nullif(btrim(coalesce(p_ncm,'')),'') IS NULL THEN
    v_p := v_p || jsonb_build_array(jsonb_build_object('code','MISSING_NCM','field','ncm','layer','TECHNICAL','message','NCM ausente.'));
  ELSIF p_accounting_validated_at IS NULL OR v_synthetic THEN
    v_p := v_p || jsonb_build_array(jsonb_build_object(
      'code','NCM_NOT_ACCOUNTING_REVIEWED','field','ncm','layer','TECHNICAL',
      'message','NCM sem revisao contabil preliminar (validacao contabil ausente ou perfil sintetico). Nao afirma nem substitui evidencia regulatoria.'));
  END IF;
  IF nullif(btrim(coalesce(p_origin_code,'')),'') IS NULL THEN
    v_p := v_p || jsonb_build_array(jsonb_build_object('code','MISSING_ORIGIN_CODE','field','origin_code','layer','TECHNICAL','message','Codigo de origem ausente.'));
  END IF;
  IF nullif(btrim(coalesce(p_cfop_in_state,'')),'') IS NULL THEN
    v_p := v_p || jsonb_build_array(jsonb_build_object('code','MISSING_CFOP_IN_STATE','field','cfop_in_state','layer','TECHNICAL','message','CFOP interno ausente.'));
  END IF;
  IF nullif(btrim(coalesce(p_cfop_interstate,'')),'') IS NULL THEN
    v_p := v_p || jsonb_build_array(jsonb_build_object('code','MISSING_CFOP_INTERSTATE','field','cfop_interstate','layer','TECHNICAL','message','CFOP interestadual ausente.'));
  END IF;
  IF nullif(btrim(coalesce(p_pis_cst,'')),'') IS NULL THEN
    v_p := v_p || jsonb_build_array(jsonb_build_object('code','MISSING_PIS_CST','field','pis_cst','layer','TECHNICAL','message','CST de PIS ausente.'));
  END IF;
  IF nullif(btrim(coalesce(p_cofins_cst,'')),'') IS NULL THEN
    v_p := v_p || jsonb_build_array(jsonb_build_object('code','MISSING_COFINS_CST','field','cofins_cst','layer','TECHNICAL','message','CST de COFINS ausente.'));
  END IF;

  IF v_has_cst AND v_has_csosn THEN
    v_p := v_p || jsonb_build_array(jsonb_build_object(
      'code','CST_AND_CSOSN_CONFLICT','field','icms_cst,icms_csosn','layer','TECHNICAL',
      'message','CST e CSOSN preenchidos simultaneamente; mutuamente exclusivos.'));
  END IF;

  IF nullif(btrim(coalesce(p_crt,'')),'') IS NULL THEN
    v_p := v_p || jsonb_build_array(jsonb_build_object(
      'code','TAX_REGIME_UNKNOWN','field','company_fiscal_settings.crt','layer','TECHNICAL',
      'message','CRT do emitente nao configurado.'));
  ELSIF p_crt = '3' THEN
    IF v_has_csosn THEN
      v_p := v_p || jsonb_build_array(jsonb_build_object(
        'code','CSOSN_NOT_ALLOWED_FOR_CRT3','field','icms_csosn','layer','TECHNICAL',
        'message','CSOSN e exclusivo do Simples Nacional; emitente em CRT 3 (Regime Normal).'));
    END IF;
    IF NOT v_has_cst THEN
      v_p := v_p || jsonb_build_array(jsonb_build_object(
        'code','CST_REQUIRED_FOR_CRT3','field','icms_cst','layer','TECHNICAL',
        'message','CST de ICMS obrigatorio para CRT 3.'));
    END IF;
  ELSIF p_crt IN ('1','2') THEN
    IF v_has_cst THEN
      v_p := v_p || jsonb_build_array(jsonb_build_object(
        'code','CST_NOT_ALLOWED_FOR_SIMPLES','field','icms_cst','layer','TECHNICAL',
        'message','CST de ICMS nao se aplica a emitente do Simples Nacional.'));
    END IF;
    IF NOT v_has_csosn THEN
      v_p := v_p || jsonb_build_array(jsonb_build_object(
        'code','CSOSN_REQUIRED_FOR_SIMPLES','field','icms_csosn','layer','TECHNICAL',
        'message','CSOSN obrigatorio para CRT 1/2.'));
    END IF;
  ELSE
    v_p := v_p || jsonb_build_array(jsonb_build_object(
      'code','TAX_REGIME_UNKNOWN','field','company_fiscal_settings.crt','layer','TECHNICAL',
      'message','CRT do emitente com valor nao reconhecido.'));
  END IF;

  v_technical_ready := (jsonb_array_length(v_p) = 0);
  v_regulatory_ready := (jsonb_array_length(v_reg) = 0);

  RETURN jsonb_build_object(
    'scope', p_scope,
    'ready', (v_technical_ready AND v_regulatory_ready),
    'technical_ready', v_technical_ready,
    'regulatory_ready', v_regulatory_ready,
    'status', CASE WHEN (v_technical_ready AND v_regulatory_ready) THEN 'READY' ELSE 'NOT_READY' END,
    'quarantined', (p_profile_status = 'BLOCKED'),
    'profile_present', true,
    'not_applicable', v_na,
    'pendencies', v_p || v_reg);
END
$function$;

REVOKE ALL ON FUNCTION public.fn_fiscal_item_profile_gate_eval(
  text,text,boolean,text,timestamptz,text,text,text,text,text,text,text,text,text,text,text,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_fiscal_item_profile_gate_eval(
  text,text,boolean,text,timestamptz,text,text,text,text,text,text,text,text,text,text,text,text,jsonb)
  TO authenticated, service_role;

-- =====================================================================
-- SEÇÃO 16 — VIEW DE PRONTIDÃO PASSA A CONSIDERAR O DOSSIÊ
-- =====================================================================
DROP VIEW IF EXISTS public.v_microorganism_fiscal_readiness;
CREATE VIEW public.v_microorganism_fiscal_readiness
WITH (security_invoker = true) AS
SELECT
  m.id AS microorganism_id,
  m.codigo,
  m.nome,
  m.ativo,
  sel.id AS profile_id,
  sel.profile_status,
  sel.is_active AS profile_is_active,
  (g.gate ->> 'ready')::boolean AS fiscally_ready,
  (g.gate ->> 'technical_ready')::boolean AS minimally_classified,
  (g.gate ->> 'regulatory_ready')::boolean AS regulatory_ready,
  sel.accounting_validated_at IS NOT NULL AS accounting_validated,
  (g.gate ->> 'quarantined')::boolean AS quarantined,
  reg.facts -> 'dossier_id' AS dossier_id,
  reg.facts ->> 'status' AS dossier_status,
  g.gate -> 'pendencies' AS pendencies,
  g.gate -> 'not_applicable' AS not_applicable,
  g.gate
FROM public.microrganismos m
LEFT JOIN LATERAL (
  SELECT mfp.* FROM public.microorganism_fiscal_profiles mfp
  WHERE mfp.microorganism_id = m.id
  ORDER BY (mfp.is_active AND mfp.profile_status = 'VALIDATED') DESC,
           mfp.is_active DESC, mfp.updated_at DESC NULLS LAST,
           mfp.created_at DESC NULLS LAST, mfp.id DESC
  LIMIT 1) sel ON true
CROSS JOIN LATERAL (SELECT public.fn_microorganism_regulatory_facts(m.id) AS facts) reg
CROSS JOIN LATERAL (
  SELECT public.fn_fiscal_item_profile_gate_eval(
    'MICROORGANISM', public.fn_fiscal_company_crt(), sel.is_active, sel.profile_status,
    sel.accounting_validated_at, sel.accounting_notes, sel.fiscal_description,
    sel.commercial_unit, sel.taxable_unit, sel.ncm, sel.origin_code, sel.cfop_in_state,
    sel.cfop_interstate, sel.icms_cst, sel.icms_csosn, sel.pis_cst, sel.cofins_cst,
    reg.facts) AS gate) g;

REVOKE ALL ON public.v_microorganism_fiscal_readiness FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.v_microorganism_fiscal_readiness TO authenticated, service_role;

-- =====================================================================
-- SEÇÃO 17 — LEITURA CONSOLIDADA PARA A UI
-- =====================================================================
CREATE OR REPLACE FUNCTION public.rpc_microorganism_regulatory_overview()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $fn$
DECLARE v jsonb;
BEGIN
  IF NOT public.fn_regulatory_can_read() THEN
    RAISE EXCEPTION 'REGULATORY_FORBIDDEN' USING ERRCODE='42501';
  END IF;
  SELECT coalesce(jsonb_agg(x ORDER BY x->>'codigo'),'[]'::jsonb) INTO v FROM (
    SELECT jsonb_build_object(
      'microorganism_id', m.id,
      'codigo', m.codigo,
      'nome', m.nome,
      'tipo', m.tipo,
      'ativo', m.ativo,
      'concentracao_label', m.concentracao_label,
      'facts', f.facts,
      'checklist_total', coalesce((f.facts->>'checklist_total')::int, 0),
      'checklist_confirmed', coalesce((f.facts->>'checklist_confirmed')::int, 0),
      'checklist_pending', coalesce(jsonb_array_length(coalesce(f.facts->'checklist_pending','[]'::jsonb)),0),
      'progress_pct', CASE WHEN coalesce((f.facts->>'checklist_total')::int,0) = 0 THEN 0
                           ELSE round(100.0 * (coalesce((f.facts->>'checklist_total')::int,0)
                                - jsonb_array_length(coalesce(f.facts->'checklist_pending','[]'::jsonb)))
                                / coalesce((f.facts->>'checklist_total')::int,1)) END,
      'dossier_status', coalesce(f.facts->>'status','NONE'),
      'profile_status', r.profile_status,
      'fiscally_ready', coalesce(r.fiscally_ready,false),
      'technical_ready', coalesce(r.minimally_classified,false),
      'regulatory_ready', coalesce(r.regulatory_ready,false),
      'quarantined', coalesce(r.quarantined,false),
      'pendencies', coalesce(r.pendencies,'[]'::jsonb),
      'not_applicable', coalesce(r.not_applicable,'[]'::jsonb)) AS x
    FROM public.microrganismos m
    LEFT JOIN public.v_microorganism_fiscal_readiness r ON r.microorganism_id = m.id
    CROSS JOIN LATERAL (SELECT public.fn_microorganism_regulatory_facts(m.id) AS facts) f
    WHERE m.ativo
  ) s;
  RETURN v;
END $fn$;

CREATE OR REPLACE FUNCTION public.rpc_regulatory_dossier_detail(p_microorganism_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $fn$
DECLARE v_d public.microorganism_regulatory_dossiers; v jsonb;
BEGIN
  IF NOT public.fn_regulatory_can_read() THEN
    RAISE EXCEPTION 'REGULATORY_FORBIDDEN' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_d FROM public.microorganism_regulatory_dossiers
   WHERE microorganism_id = p_microorganism_id AND deleted_at IS NULL
   ORDER BY (status='VALIDATED') DESC, version DESC LIMIT 1;
  IF v_d.id IS NULL THEN RETURN NULL; END IF;

  SELECT jsonb_build_object(
    'dossier', to_jsonb(v_d),
    'presentations', coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.volume_ml)
       FROM public.microorganism_regulatory_presentations p WHERE p.dossier_id=v_d.id),'[]'::jsonb),
    'ncm_candidates', coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.created_at)
       FROM public.microorganism_ncm_candidates c WHERE c.dossier_id=v_d.id),'[]'::jsonb),
    'documents', coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.uploaded_at)
       FROM public.microorganism_regulatory_documents x WHERE x.dossier_id=v_d.id AND x.deleted_at IS NULL),'[]'::jsonb),
    'checklist', coalesce((SELECT jsonb_agg(to_jsonb(k) ORDER BY k.item_key)
       FROM public.microorganism_regulatory_checklist k WHERE k.dossier_id=v_d.id),'[]'::jsonb),
    'history', coalesce((SELECT jsonb_agg(jsonb_build_object(
         'action',a.action,'changed_at',a.changed_at,'changed_by',a.changed_by,'table_name',a.table_name)
         ORDER BY a.changed_at DESC)
       FROM public.fiscal_audit_log a
       WHERE a.table_name LIKE 'microorganism_%' AND a.record_id = v_d.id),'[]'::jsonb),
    'snapshots', coalesce((SELECT jsonb_agg(jsonb_build_object(
         'version',s.version,'published_at',s.published_at,'snapshot_sha256',s.snapshot_sha256)
         ORDER BY s.version DESC)
       FROM public.microorganism_regulatory_publication_snapshots s WHERE s.dossier_id=v_d.id),'[]'::jsonb),
    'gate', (SELECT r.gate FROM public.v_microorganism_fiscal_readiness r
              WHERE r.microorganism_id = p_microorganism_id)
  ) INTO v;
  RETURN v;
END $fn$;

DO $g$
DECLARE r record;
BEGIN
  FOR r IN SELECT p.oid::regprocedure::text AS sig FROM pg_proc p
           JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE n.nspname='public'
             AND p.proname IN ('rpc_microorganism_regulatory_overview','rpc_regulatory_dossier_detail')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
  END LOOP;
END $g$;

-- =====================================================================
-- SEÇÃO 18 — SEED ESTRUTURAL (SEM INVENTAR DADO REGULATÓRIO)
-- Cria um dossiê DRAFT + checklist para cada microrganismo ativo e
-- importa as apresentações já existentes em catalogo_volumes SEM
-- confirmar unidades nem GTIN. Nenhum campo regulatório é preenchido.
-- =====================================================================
DO $seed$
DECLARE r record; v_dossier uuid; v_next int;
BEGIN
  FOR r IN SELECT id FROM public.microrganismos WHERE ativo ORDER BY codigo LOOP
    SELECT id INTO v_dossier FROM public.microorganism_regulatory_dossiers
     WHERE microorganism_id = r.id AND deleted_at IS NULL
     ORDER BY version DESC LIMIT 1;

    IF v_dossier IS NULL THEN
      SELECT coalesce(max(version),0)+1 INTO v_next
        FROM public.microorganism_regulatory_dossiers WHERE microorganism_id = r.id;
      INSERT INTO public.microorganism_regulatory_dossiers (microorganism_id, version, status)
      VALUES (r.id, v_next, 'DRAFT')
      RETURNING id INTO v_dossier;
    END IF;

    INSERT INTO public.microorganism_regulatory_checklist (dossier_id, item_key, state)
    SELECT v_dossier, k, 'PENDING' FROM unnest(ARRAY[
      'FINALIDADE_REGULATORIA','CEPA','FORMULACAO','GARANTIA_ROTULO','REGISTRO_MAPA',
      'TITULAR_FABRICANTE','NCM_CEST_TIPI','GTIN','UNIDADE_CONVERSAO','ORIGEM',
      'CFOP','TRIBUTACAO']) k
    ON CONFLICT (dossier_id, item_key) DO NOTHING;

    INSERT INTO public.microorganism_regulatory_presentations
      (dossier_id, catalog_volume_id, volume_ml, label, origin_note)
    SELECT v_dossier, cv.id, cv.volume_ml::int,
           coalesce(nullif(btrim(cv.rotulo),''), (cv.volume_ml/1000)::text || ' L'),
           'CATALOGO_A_CONFIRMAR_FISCALMENTE'
      FROM public.catalogo_volumes cv
     WHERE cv.item_tipo = 'microrganismo' AND cv.microrganismo_id = r.id AND cv.ativo
    ON CONFLICT (dossier_id, volume_ml) DO NOTHING;
  END LOOP;
END $seed$;

-- Fontes oficiais mínimas para citação obrigatória em candidatos de NCM.
-- Apenas referências normativas; nenhuma classificação é derivada delas.
INSERT INTO public.fiscal_official_sources (source_key, authority, name, url, notes)
VALUES
  ('TIPI','Receita Federal do Brasil','Tabela TIPI',
   'https://www.gov.br/receitafederal/pt-br','Ancora para enquadramento de NCM.'),
  ('MAPA_SIPEAGRO','Ministerio da Agricultura e Pecuaria','SIPEAGRO - registro de produtos e estabelecimentos',
   'https://sistemas.agricultura.gov.br','Ancora para registro/ato regulatorio.'),
  ('CONFAZ_CEST','CONFAZ','Convenio ICMS 142/2018 - Anexos CEST',
   'https://www.confaz.fazenda.gov.br','Ancora para CEST e substituicao tributaria.')
ON CONFLICT (source_key) DO NOTHING;
