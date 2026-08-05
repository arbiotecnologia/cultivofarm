-- =====================================================================
-- FASE F2 — CORREÇÃO PÓS-AUDITORIA INDEPENDENTE
-- Base auditada: commit 9d6c63d959900bd06d74721382232058cc368d61
-- Ambiente: STAGING ikaauvsflpmamgxmkhoq
-- PRODUÇÃO navfzbwgwzruipouyfnk NÃO ACESSADA.
-- Migration idempotente. Nenhum harness de teste embutido.
--
-- Achados corrigidos:
--   1) Storage sem escopo de registro (path canônico + estado + papel)
--   2) NCM sem fonte oficial obrigatória
--   3) GTIN sem dígito verificador GS1
--   4) Tipos canônicos (fora do SQL — regeneração a partir do staging)
--   5) Segregação de funções (mesma pessoa aprovando várias camadas)
--
-- Nenhum dado regulatório é inventado: nenhum candidato de NCM é criado,
-- nenhuma confirmação é presumida, nenhum dossiê é publicado.
-- =====================================================================

-- =====================================================================
-- SEÇÃO 1 — GTIN: DÍGITO VERIFICADOR GS1 (achado 3)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.fn_gtin_is_valid(_gtin text)
RETURNS boolean
LANGUAGE plpgsql IMMUTABLE
AS $fn$
DECLARE
  v text;
  v_len int;
  i int;
  v_sum int := 0;
  v_weight int;
  v_check int;
BEGIN
  IF _gtin IS NULL THEN RETURN false; END IF;
  v := btrim(_gtin);
  IF v !~ '^[0-9]+$' THEN RETURN false; END IF;
  v_len := length(v);
  IF v_len NOT IN (8, 12, 13, 14) THEN RETURN false; END IF;

  -- GS1: da direita para a esquerda, ignorando o dígito verificador,
  -- pesos alternados 3,1,3,1...
  FOR i IN REVERSE (v_len - 1)..1 LOOP
    v_weight := CASE WHEN ((v_len - 1 - i) % 2) = 0 THEN 3 ELSE 1 END;
    v_sum := v_sum + (substr(v, i, 1))::int * v_weight;
  END LOOP;

  v_check := (10 - (v_sum % 10)) % 10;
  RETURN v_check = (substr(v, v_len, 1))::int;
END $fn$;

COMMENT ON FUNCTION public.fn_gtin_is_valid(text) IS
  'Fase F2 correcao: valida GTIN-8/12/13/14 pelo digito verificador GS1 (mod 10). Comprimento sozinho nao prova validade.';

REVOKE ALL ON FUNCTION public.fn_gtin_is_valid(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_gtin_is_valid(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_gtin_is_valid(text) TO authenticated, service_role;

ALTER TABLE public.microorganism_regulatory_presentations
  ADD COLUMN IF NOT EXISTS gtin_absent_reason text,
  ADD COLUMN IF NOT EXISTS gtin_absent_by uuid,
  ADD COLUMN IF NOT EXISTS gtin_absent_at timestamptz;

ALTER TABLE public.microorganism_regulatory_presentations
  DROP CONSTRAINT IF EXISTS mrp_gtin_checkdigit_chk;
ALTER TABLE public.microorganism_regulatory_presentations
  ADD CONSTRAINT mrp_gtin_checkdigit_chk
  CHECK (gtin IS NULL OR public.fn_gtin_is_valid(gtin));

ALTER TABLE public.microorganism_regulatory_presentations
  DROP CONSTRAINT IF EXISTS mrp_gtin_absent_reason_chk;
ALTER TABLE public.microorganism_regulatory_presentations
  ADD CONSTRAINT mrp_gtin_absent_reason_chk
  CHECK (NOT gtin_absent
         OR (length(btrim(coalesce(gtin_absent_reason, ''))) >= 20
             AND gtin_absent_by IS NOT NULL));

ALTER TABLE public.microorganism_regulatory_presentations
  DROP CONSTRAINT IF EXISTS mrp_gtin_mutual_chk;
ALTER TABLE public.microorganism_regulatory_presentations
  ADD CONSTRAINT mrp_gtin_mutual_chk
  CHECK (NOT (gtin_absent AND gtin IS NOT NULL));

-- =====================================================================
-- SEÇÃO 2 — FONTE OFICIAL DE NCM (achado 2)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.fn_fiscal_official_url_allowlisted(_url text)
RETURNS boolean
LANGUAGE sql IMMUTABLE
AS $fn$
  SELECT _url IS NOT NULL
     AND lower(_url) ~ '^https://([a-z0-9-]+\.)*gov\.br(/|$)';
$fn$;

COMMENT ON FUNCTION public.fn_fiscal_official_url_allowlisted(text) IS
  'Fase F2 correcao: allowlist de dominios oficiais (.gov.br) para fundamentar candidato de NCM. URL arbitraria nao e fonte.';

REVOKE ALL ON FUNCTION public.fn_fiscal_official_url_allowlisted(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_fiscal_official_url_allowlisted(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_fiscal_official_url_allowlisted(text) TO authenticated, service_role;

ALTER TABLE public.microorganism_ncm_candidates
  ADD COLUMN IF NOT EXISTS official_description text,
  ADD COLUMN IF NOT EXISTS table_version        text,
  ADD COLUMN IF NOT EXISTS table_reference_date date;

ALTER TABLE public.microorganism_ncm_candidates
  DROP CONSTRAINT IF EXISTS mnc_source_required_chk;
ALTER TABLE public.microorganism_ncm_candidates
  ADD CONSTRAINT mnc_source_required_chk
  CHECK (
    (source_id IS NOT NULL OR public.fn_fiscal_official_url_allowlisted(source_url))
    AND consulted_at IS NOT NULL
    AND length(btrim(justification)) >= 20
  );

ALTER TABLE public.microorganism_ncm_candidates
  DROP CONSTRAINT IF EXISTS mnc_approved_evidence_chk;
ALTER TABLE public.microorganism_ncm_candidates
  ADD CONSTRAINT mnc_approved_evidence_chk
  CHECK (
    status <> 'APPROVED'
    OR (source_id IS NOT NULL
        AND length(btrim(coalesce(official_description, ''))) >= 10
        AND nullif(btrim(coalesce(table_version, '')), '') IS NOT NULL
        AND table_reference_date IS NOT NULL)
  );

CREATE OR REPLACE FUNCTION public.fn_regulatory_ncm_source_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $fn$
DECLARE v_active boolean;
BEGIN
  IF NEW.source_id IS NOT NULL THEN
    SELECT is_active INTO v_active FROM public.fiscal_official_sources WHERE id = NEW.source_id;
    IF coalesce(v_active, false) IS NOT TRUE THEN
      RAISE EXCEPTION 'REGULATORY_NCM_SOURCE_INACTIVE' USING ERRCODE = '22023';
    END IF;
  ELSIF NOT public.fn_fiscal_official_url_allowlisted(NEW.source_url) THEN
    RAISE EXCEPTION 'REGULATORY_NCM_SOURCE_NOT_OFFICIAL' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_regulatory_ncm_source_guard ON public.microorganism_ncm_candidates;
CREATE TRIGGER trg_regulatory_ncm_source_guard
  BEFORE INSERT OR UPDATE ON public.microorganism_ncm_candidates
  FOR EACH ROW EXECUTE FUNCTION public.fn_regulatory_ncm_source_guard();

CREATE OR REPLACE FUNCTION public.fn_regulatory_published_candidate_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $fn$
DECLARE v_dossier uuid; v_status text; v_ncm text;
BEGIN
  IF NEW.published_ncm_candidate_id IS NULL THEN RETURN NEW; END IF;
  SELECT dossier_id, status, ncm INTO v_dossier, v_status, v_ncm
    FROM public.microorganism_ncm_candidates WHERE id = NEW.published_ncm_candidate_id;
  IF v_dossier IS NULL THEN
    RAISE EXCEPTION 'REGULATORY_CANDIDATE_NOT_FOUND' USING ERRCODE = '22023';
  END IF;
  IF v_dossier <> NEW.id THEN
    RAISE EXCEPTION 'REGULATORY_CANDIDATE_DOSSIER_MISMATCH' USING ERRCODE = '22023';
  END IF;
  IF v_status <> 'APPROVED' THEN
    RAISE EXCEPTION 'REGULATORY_CANDIDATE_NOT_APPROVED' USING ERRCODE = '22023';
  END IF;
  IF NEW.published_ncm IS DISTINCT FROM v_ncm THEN
    RAISE EXCEPTION 'REGULATORY_CANDIDATE_NCM_MISMATCH' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_regulatory_published_candidate_guard ON public.microorganism_regulatory_dossiers;
CREATE CONSTRAINT TRIGGER trg_regulatory_published_candidate_guard
  AFTER INSERT OR UPDATE ON public.microorganism_regulatory_dossiers
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.fn_regulatory_published_candidate_guard();

CREATE OR REPLACE FUNCTION public.fn_regulatory_candidate_publication_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $fn$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = 'APPROVED' AND NEW.status <> 'APPROVED'
     AND EXISTS (SELECT 1 FROM public.microorganism_regulatory_dossiers
                  WHERE published_ncm_candidate_id = OLD.id) THEN
    RAISE EXCEPTION 'REGULATORY_CANDIDATE_PUBLISHED_IMMUTABLE' USING ERRCODE = '55006';
  END IF;
  IF TG_OP = 'DELETE'
     AND EXISTS (SELECT 1 FROM public.microorganism_regulatory_dossiers
                  WHERE published_ncm_candidate_id = OLD.id) THEN
    RAISE EXCEPTION 'REGULATORY_CANDIDATE_PUBLISHED_IMMUTABLE' USING ERRCODE = '55006';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $fn$;

DROP TRIGGER IF EXISTS trg_regulatory_candidate_publication_guard ON public.microorganism_ncm_candidates;
CREATE TRIGGER trg_regulatory_candidate_publication_guard
  BEFORE UPDATE OR DELETE ON public.microorganism_ncm_candidates
  FOR EACH ROW EXECUTE FUNCTION public.fn_regulatory_candidate_publication_guard();

-- =====================================================================
-- SEÇÃO 3 — SEGREGAÇÃO DE FUNÇÕES (achado 5)
-- =====================================================================
ALTER TABLE public.microorganism_regulatory_dossiers
  ADD COLUMN IF NOT EXISTS sod_override_active boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sod_override_by     uuid,
  ADD COLUMN IF NOT EXISTS sod_override_at     timestamptz,
  ADD COLUMN IF NOT EXISTS sod_override_reason text;

ALTER TABLE public.microorganism_regulatory_dossiers
  DROP CONSTRAINT IF EXISTS mrd_sod_override_chk;
ALTER TABLE public.microorganism_regulatory_dossiers
  ADD CONSTRAINT mrd_sod_override_chk
  CHECK (NOT sod_override_active
         OR (sod_override_by IS NOT NULL
             AND sod_override_at IS NOT NULL
             AND length(btrim(coalesce(sod_override_reason, ''))) >= 40));

CREATE OR REPLACE FUNCTION public.rpc_regulatory_sod_override(
  p_dossier_id uuid, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $fn$
DECLARE v_row public.microorganism_regulatory_dossiers;
BEGIN
  IF NOT public.has_role(auth.uid(), 'administrador'::app_role) THEN
    RAISE EXCEPTION 'REGULATORY_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 40 THEN
    RAISE EXCEPTION 'REGULATORY_OVERRIDE_JUSTIFICATION_WEAK' USING ERRCODE = '22023';
  END IF;

  UPDATE public.microorganism_regulatory_dossiers
     SET sod_override_active = true,
         sod_override_by = auth.uid(),
         sod_override_at = now(),
         sod_override_reason = p_reason,
         updated_by = auth.uid()
   WHERE id = p_dossier_id AND deleted_at IS NULL AND status IN ('DRAFT', 'PENDING_REVIEW')
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'REGULATORY_DOSSIER_NOT_FOUND' USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_build_object('dossier_id', v_row.id, 'sod_override_active', true);
END $fn$;

CREATE OR REPLACE FUNCTION public.rpc_regulatory_review_decide(
  p_dossier_id uuid, p_layer text, p_decision text, p_justification text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $fn$
DECLARE
  d public.microorganism_regulatory_dossiers;
  v_row public.microorganism_regulatory_dossiers;
  v_uid uuid := auth.uid();
BEGIN
  IF p_layer NOT IN ('TECHNICAL', 'REGULATORY', 'FISCAL') THEN
    RAISE EXCEPTION 'REGULATORY_INVALID_LAYER' USING ERRCODE = '22023';
  END IF;
  IF p_decision NOT IN ('APPROVED', 'REJECTED') THEN
    RAISE EXCEPTION 'REGULATORY_INVALID_DECISION' USING ERRCODE = '22023';
  END IF;
  IF NOT public.fn_regulatory_can_approve(p_layer) THEN
    RAISE EXCEPTION 'REGULATORY_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF nullif(btrim(coalesce(p_justification, '')), '') IS NULL THEN
    RAISE EXCEPTION 'REGULATORY_JUSTIFICATION_REQUIRED' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO d FROM public.microorganism_regulatory_dossiers
   WHERE id = p_dossier_id AND deleted_at IS NULL FOR UPDATE;
  IF d.id IS NULL THEN RAISE EXCEPTION 'REGULATORY_DOSSIER_NOT_FOUND' USING ERRCODE = '22023'; END IF;
  IF d.status <> 'PENDING_REVIEW' THEN
    RAISE EXCEPTION 'REGULATORY_INVALID_TRANSITION' USING ERRCODE = '55006';
  END IF;

  -- Segregação: a mesma identidade não acumula camadas no mesmo dossiê,
  -- salvo override emergencial de administrador (auditado e sinalizado).
  IF p_decision = 'APPROVED' AND NOT d.sod_override_active THEN
    IF (p_layer <> 'TECHNICAL'  AND d.technical_review_status  = 'APPROVED' AND d.technical_review_by  = v_uid)
    OR (p_layer <> 'REGULATORY' AND d.regulatory_review_status = 'APPROVED' AND d.regulatory_review_by = v_uid)
    OR (p_layer <> 'FISCAL'     AND d.fiscal_review_status     = 'APPROVED' AND d.fiscal_review_by     = v_uid) THEN
      RAISE EXCEPTION 'REGULATORY_SEGREGATION_OF_DUTIES'
        USING ERRCODE = '42501',
              HINT = 'A mesma pessoa nao pode aprovar mais de uma camada do mesmo dossie. Em emergencia use rpc_regulatory_sod_override (administrador, justificativa forte, auditada).';
    END IF;
  END IF;

  UPDATE public.microorganism_regulatory_dossiers SET
    technical_review_status  = CASE WHEN p_layer = 'TECHNICAL' THEN p_decision ELSE technical_review_status END,
    technical_review_by      = CASE WHEN p_layer = 'TECHNICAL' THEN v_uid ELSE technical_review_by END,
    technical_review_at      = CASE WHEN p_layer = 'TECHNICAL' THEN now() ELSE technical_review_at END,
    technical_review_notes   = CASE WHEN p_layer = 'TECHNICAL' THEN p_justification ELSE technical_review_notes END,
    regulatory_review_status = CASE WHEN p_layer = 'REGULATORY' THEN p_decision ELSE regulatory_review_status END,
    regulatory_review_by     = CASE WHEN p_layer = 'REGULATORY' THEN v_uid ELSE regulatory_review_by END,
    regulatory_review_at     = CASE WHEN p_layer = 'REGULATORY' THEN now() ELSE regulatory_review_at END,
    regulatory_review_notes  = CASE WHEN p_layer = 'REGULATORY' THEN p_justification ELSE regulatory_review_notes END,
    fiscal_review_status     = CASE WHEN p_layer = 'FISCAL' THEN p_decision ELSE fiscal_review_status END,
    fiscal_review_by         = CASE WHEN p_layer = 'FISCAL' THEN v_uid ELSE fiscal_review_by END,
    fiscal_review_at         = CASE WHEN p_layer = 'FISCAL' THEN now() ELSE fiscal_review_at END,
    fiscal_review_notes      = CASE WHEN p_layer = 'FISCAL' THEN p_justification ELSE fiscal_review_notes END,
    -- Rejeição nunca publica: dossiê volta para DRAFT
    status = CASE WHEN p_decision = 'REJECTED' THEN 'DRAFT' ELSE status END,
    updated_by = v_uid
  WHERE id = p_dossier_id RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END $fn$;

-- =====================================================================
-- SEÇÃO 4 — STORAGE COM ESCOPO DE REGISTRO (achado 1)
-- Path canônico: dossiers/<dossier_id>/<document_id-or-uuid>/<arquivo>
-- =====================================================================
CREATE OR REPLACE FUNCTION public.fn_regulatory_storage_path_ok(_name text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $fn$
  SELECT _name IS NOT NULL
     AND _name ~ '^dossiers/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[A-Za-z0-9][A-Za-z0-9._-]{0,119}$';
$fn$;

CREATE OR REPLACE FUNCTION public.fn_regulatory_storage_dossier_id(_name text)
RETURNS uuid LANGUAGE sql IMMUTABLE AS $fn$
  SELECT CASE WHEN public.fn_regulatory_storage_path_ok(_name)
              THEN substring(_name FROM 10 FOR 36)::uuid END;
$fn$;

CREATE OR REPLACE FUNCTION public.fn_regulatory_storage_can_read(_name text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $fn$
  SELECT public.fn_regulatory_can_read()
     AND EXISTS (SELECT 1 FROM public.microorganism_regulatory_dossiers d
                  WHERE d.id = public.fn_regulatory_storage_dossier_id(_name));
$fn$;

CREATE OR REPLACE FUNCTION public.fn_regulatory_storage_can_write(_name text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $fn$
  SELECT public.fn_regulatory_can_prepare()
     AND EXISTS (
       SELECT 1 FROM public.microorganism_regulatory_dossiers d
        WHERE d.id = public.fn_regulatory_storage_dossier_id(_name)
          AND d.deleted_at IS NULL
          AND d.status IN ('DRAFT', 'PENDING_REVIEW'))
     AND NOT EXISTS (
       SELECT 1 FROM public.microorganism_regulatory_publication_snapshots s
        WHERE s.dossier_id = public.fn_regulatory_storage_dossier_id(_name));
$fn$;

CREATE OR REPLACE FUNCTION public.fn_regulatory_storage_can_delete(_name text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $fn$
  SELECT public.fn_regulatory_storage_can_write(_name)
     AND NOT EXISTS (
       SELECT 1 FROM public.microorganism_regulatory_documents x
        WHERE x.storage_bucket = 'fiscal-regulatorio'
          AND x.storage_path = _name
          AND x.deleted_at IS NULL);
$fn$;

DO $sg$
DECLARE r record;
BEGIN
  FOR r IN SELECT unnest(ARRAY[
    'public.fn_regulatory_storage_path_ok(text)',
    'public.fn_regulatory_storage_dossier_id(text)',
    'public.fn_regulatory_storage_can_read(text)',
    'public.fn_regulatory_storage_can_write(text)',
    'public.fn_regulatory_storage_can_delete(text)']) AS sig
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
  END LOOP;
END $sg$;

DROP POLICY IF EXISTS fiscal_regulatorio_read ON storage.objects;
DROP POLICY IF EXISTS fiscal_regulatorio_insert ON storage.objects;
DROP POLICY IF EXISTS fiscal_regulatorio_update ON storage.objects;
DROP POLICY IF EXISTS fiscal_regulatorio_delete ON storage.objects;

CREATE POLICY fiscal_regulatorio_read ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'fiscal-regulatorio' AND public.fn_regulatory_storage_can_read(name));

CREATE POLICY fiscal_regulatorio_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'fiscal-regulatorio' AND public.fn_regulatory_storage_can_write(name));

CREATE POLICY fiscal_regulatorio_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'fiscal-regulatorio' AND public.fn_regulatory_storage_can_delete(name))
  WITH CHECK (bucket_id = 'fiscal-regulatorio' AND public.fn_regulatory_storage_can_write(name));

CREATE POLICY fiscal_regulatorio_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'fiscal-regulatorio' AND public.fn_regulatory_storage_can_delete(name));

CREATE TABLE IF NOT EXISTS public.regulatory_storage_cleanup_queue (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id    uuid NOT NULL REFERENCES public.microorganism_regulatory_documents(id) ON DELETE CASCADE,
  dossier_id     uuid NOT NULL REFERENCES public.microorganism_regulatory_dossiers(id) ON DELETE CASCADE,
  storage_bucket text NOT NULL DEFAULT 'fiscal-regulatorio',
  storage_path   text NOT NULL,
  state          text NOT NULL DEFAULT 'PENDING',
  reason         text NOT NULL,
  requested_by   uuid,
  requested_at   timestamptz NOT NULL DEFAULT now(),
  confirmed_by   uuid,
  confirmed_at   timestamptz,
  CONSTRAINT rscq_state_chk CHECK (state IN ('PENDING', 'DONE', 'FAILED')),
  CONSTRAINT rscq_reason_chk CHECK (length(btrim(reason)) >= 10)
);
CREATE UNIQUE INDEX IF NOT EXISTS rscq_uq_pending_path
  ON public.regulatory_storage_cleanup_queue (storage_bucket, storage_path) WHERE state = 'PENDING';

REVOKE ALL ON public.regulatory_storage_cleanup_queue FROM PUBLIC;
REVOKE ALL ON public.regulatory_storage_cleanup_queue FROM anon;
GRANT SELECT ON public.regulatory_storage_cleanup_queue TO authenticated;
GRANT ALL ON public.regulatory_storage_cleanup_queue TO service_role;
ALTER TABLE public.regulatory_storage_cleanup_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS regulatory_storage_cleanup_queue_sel ON public.regulatory_storage_cleanup_queue;
CREATE POLICY regulatory_storage_cleanup_queue_sel ON public.regulatory_storage_cleanup_queue
  FOR SELECT TO authenticated USING (public.fn_regulatory_can_read());

DROP TRIGGER IF EXISTS trg_regulatory_audit_regulatory_storage_cleanup_queue ON public.regulatory_storage_cleanup_queue;
CREATE TRIGGER trg_regulatory_audit_regulatory_storage_cleanup_queue
  AFTER INSERT OR UPDATE OR DELETE ON public.regulatory_storage_cleanup_queue
  FOR EACH ROW EXECUTE FUNCTION public.regulatory_audit_trigger();

CREATE OR REPLACE FUNCTION public.rpc_regulatory_document_register(
  p_dossier_id uuid, p_doc_type text, p_title text, p_storage_path text, p_content_sha256 text,
  p_issuer text DEFAULT NULL, p_issued_at date DEFAULT NULL, p_valid_until date DEFAULT NULL,
  p_source_key text DEFAULT NULL, p_source_url text DEFAULT NULL,
  p_consulted_at date DEFAULT NULL, p_doc_version text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp','storage' AS $fn$
DECLARE
  v_id uuid; v_status text; v_source uuid;
  v_owner uuid; v_metadata jsonb; v_found boolean;
BEGIN
  IF NOT public.fn_regulatory_can_prepare() THEN
    RAISE EXCEPTION 'REGULATORY_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  SELECT status INTO v_status FROM public.microorganism_regulatory_dossiers
   WHERE id = p_dossier_id AND deleted_at IS NULL FOR UPDATE;
  IF v_status IS NULL THEN RAISE EXCEPTION 'REGULATORY_DOSSIER_NOT_FOUND' USING ERRCODE = '22023'; END IF;
  IF v_status NOT IN ('DRAFT', 'PENDING_REVIEW') THEN
    RAISE EXCEPTION 'REGULATORY_DOSSIER_NOT_EDITABLE' USING ERRCODE = '55006';
  END IF;

  IF NOT public.fn_regulatory_storage_path_ok(p_storage_path) THEN
    RAISE EXCEPTION 'REGULATORY_STORAGE_PATH_INVALID'
      USING ERRCODE = '22023',
            HINT = 'Use dossiers/<dossier_id>/<uuid>/<arquivo>.';
  END IF;
  IF public.fn_regulatory_storage_dossier_id(p_storage_path) <> p_dossier_id THEN
    RAISE EXCEPTION 'REGULATORY_STORAGE_PATH_OUT_OF_SCOPE' USING ERRCODE = '42501';
  END IF;

  -- O objeto precisa existir no bucket privado com dono compatível.
  -- Nenhum conteúdo é lido nem exposto: apenas metadados de controle.
  SELECT true, o.owner, o.metadata INTO v_found, v_owner, v_metadata
    FROM storage.objects o
   WHERE o.bucket_id = 'fiscal-regulatorio' AND o.name = p_storage_path;
  IF NOT coalesce(v_found, false) THEN
    RAISE EXCEPTION 'REGULATORY_STORAGE_OBJECT_MISSING' USING ERRCODE = '22023';
  END IF;
  IF v_owner IS NOT NULL AND NOT public.fn_regulatory_can_prepare(v_owner) THEN
    RAISE EXCEPTION 'REGULATORY_STORAGE_OWNER_MISMATCH' USING ERRCODE = '42501';
  END IF;
  IF coalesce((v_metadata ->> 'size')::bigint, 0) <= 0 THEN
    RAISE EXCEPTION 'REGULATORY_STORAGE_OBJECT_EMPTY' USING ERRCODE = '22023';
  END IF;

  SELECT id INTO v_source FROM public.fiscal_official_sources
   WHERE source_key = p_source_key AND is_active;

  INSERT INTO public.microorganism_regulatory_documents
    (dossier_id, doc_type, title, storage_path, content_sha256, issuer, issued_at, valid_until,
     source_id, source_url, consulted_at, doc_version, uploaded_by)
  VALUES (p_dossier_id, p_doc_type, p_title, p_storage_path, lower(p_content_sha256),
          p_issuer, p_issued_at, p_valid_until, v_source, p_source_url, p_consulted_at,
          p_doc_version, auth.uid())
  RETURNING id INTO v_id;

  RETURN v_id;
END $fn$;

CREATE OR REPLACE FUNCTION public.rpc_regulatory_document_soft_delete(
  p_document_id uuid, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $fn$
DECLARE v_doc public.microorganism_regulatory_documents; v_status text;
BEGIN
  IF NOT public.fn_regulatory_can_prepare() THEN
    RAISE EXCEPTION 'REGULATORY_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 10 THEN
    RAISE EXCEPTION 'REGULATORY_JUSTIFICATION_REQUIRED' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_doc FROM public.microorganism_regulatory_documents
   WHERE id = p_document_id FOR UPDATE;
  IF v_doc.id IS NULL THEN RAISE EXCEPTION 'REGULATORY_DOCUMENT_NOT_FOUND' USING ERRCODE = '22023'; END IF;
  IF v_doc.deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object('document_id', v_doc.id, 'already_deleted', true);
  END IF;

  SELECT status INTO v_status FROM public.microorganism_regulatory_dossiers
   WHERE id = v_doc.dossier_id FOR UPDATE;
  IF v_status NOT IN ('DRAFT', 'PENDING_REVIEW') THEN
    RAISE EXCEPTION 'REGULATORY_DOSSIER_NOT_EDITABLE' USING ERRCODE = '55006';
  END IF;
  IF EXISTS (SELECT 1 FROM public.microorganism_regulatory_publication_snapshots
              WHERE dossier_id = v_doc.dossier_id) THEN
    RAISE EXCEPTION 'REGULATORY_PUBLISHED_IMMUTABLE' USING ERRCODE = '55006';
  END IF;

  UPDATE public.microorganism_regulatory_documents
     SET deleted_at = now(), deleted_by = auth.uid()
   WHERE id = p_document_id;

  INSERT INTO public.regulatory_storage_cleanup_queue
    (document_id, dossier_id, storage_bucket, storage_path, reason, requested_by)
  VALUES (v_doc.id, v_doc.dossier_id, v_doc.storage_bucket, v_doc.storage_path, p_reason, auth.uid())
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object(
    'document_id', v_doc.id,
    'storage_bucket', v_doc.storage_bucket,
    'storage_path', v_doc.storage_path,
    'cleanup_required', true);
END $fn$;

CREATE OR REPLACE FUNCTION public.rpc_regulatory_storage_cleanup_confirm(
  p_document_id uuid, p_success boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp','storage' AS $fn$
DECLARE v_row public.regulatory_storage_cleanup_queue; v_exists boolean; v_state text;
BEGIN
  IF NOT public.fn_regulatory_can_prepare() THEN
    RAISE EXCEPTION 'REGULATORY_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row FROM public.regulatory_storage_cleanup_queue
   WHERE document_id = p_document_id AND state = 'PENDING' FOR UPDATE;
  IF v_row.id IS NULL THEN
    RETURN jsonb_build_object('document_id', p_document_id, 'pending', false);
  END IF;

  SELECT EXISTS (SELECT 1 FROM storage.objects o
                  WHERE o.bucket_id = v_row.storage_bucket AND o.name = v_row.storage_path)
    INTO v_exists;

  v_state := CASE WHEN p_success AND NOT v_exists THEN 'DONE' ELSE 'FAILED' END;

  UPDATE public.regulatory_storage_cleanup_queue
     SET state = v_state, confirmed_by = auth.uid(), confirmed_at = now()
   WHERE id = v_row.id;

  RETURN jsonb_build_object('document_id', p_document_id,
                            'object_still_present', v_exists, 'state', v_state);
END $fn$;

-- =====================================================================
-- SEÇÃO 5 — APRESENTAÇÃO COM GTIN VALIDADO NO MOTOR
-- =====================================================================
CREATE OR REPLACE FUNCTION public.rpc_regulatory_presentation_upsert(
  p_dossier_id uuid, p_volume_ml integer, p_patch jsonb DEFAULT '{}'::jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $fn$
DECLARE
  v_id uuid; v_status text; v_units boolean; v_gtin_conf boolean;
  v_absent boolean; v_gtin text; v_absent_reason text;
BEGIN
  IF NOT public.fn_regulatory_can_prepare() THEN
    RAISE EXCEPTION 'REGULATORY_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  SELECT status INTO v_status FROM public.microorganism_regulatory_dossiers
   WHERE id = p_dossier_id AND deleted_at IS NULL FOR UPDATE;
  IF v_status IS NULL THEN RAISE EXCEPTION 'REGULATORY_DOSSIER_NOT_FOUND' USING ERRCODE = '22023'; END IF;
  IF v_status NOT IN ('DRAFT', 'PENDING_REVIEW') THEN
    RAISE EXCEPTION 'REGULATORY_DOSSIER_NOT_EDITABLE' USING ERRCODE = '55006';
  END IF;

  v_units         := coalesce((p_patch ->> 'units_confirmed')::boolean, false);
  v_gtin_conf     := coalesce((p_patch ->> 'gtin_confirmed')::boolean, false);
  v_absent        := coalesce((p_patch ->> 'gtin_absent')::boolean, false);
  v_gtin          := nullif(btrim(coalesce(p_patch ->> 'gtin', '')), '');
  v_absent_reason := nullif(btrim(coalesce(p_patch ->> 'gtin_absent_reason', '')), '');

  IF v_absent AND v_gtin IS NOT NULL THEN
    RAISE EXCEPTION 'REGULATORY_GTIN_MUTUALLY_EXCLUSIVE' USING ERRCODE = '22023';
  END IF;
  IF v_absent AND (v_absent_reason IS NULL OR length(v_absent_reason) < 20) THEN
    RAISE EXCEPTION 'REGULATORY_GTIN_ABSENCE_JUSTIFICATION_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF v_gtin IS NOT NULL AND NOT public.fn_gtin_is_valid(v_gtin) THEN
    RAISE EXCEPTION 'REGULATORY_GTIN_CHECK_DIGIT_INVALID' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.microorganism_regulatory_presentations AS p
    (dossier_id, volume_ml, label, catalog_volume_id, created_by, updated_by)
  VALUES (p_dossier_id, p_volume_ml,
          coalesce(p_patch ->> 'label', (p_volume_ml / 1000.0)::text || ' L'),
          nullif(p_patch ->> 'catalog_volume_id', '')::uuid, auth.uid(), auth.uid())
  ON CONFLICT (dossier_id, volume_ml) DO UPDATE SET
    label = coalesce(EXCLUDED.label, p.label),
    updated_by = auth.uid()
  RETURNING p.id INTO v_id;

  UPDATE public.microorganism_regulatory_presentations SET
    commercial_unit    = coalesce(p_patch ->> 'commercial_unit', commercial_unit),
    taxable_unit       = coalesce(p_patch ->> 'taxable_unit', taxable_unit),
    conversion_factor  = coalesce((p_patch ->> 'conversion_factor')::numeric, conversion_factor),
    gtin               = CASE WHEN v_absent THEN NULL ELSE coalesce(v_gtin, gtin) END,
    gtin_absent        = v_absent,
    gtin_absent_reason = CASE WHEN v_absent THEN v_absent_reason ELSE NULL END,
    gtin_absent_by     = CASE WHEN v_absent THEN auth.uid() ELSE NULL END,
    gtin_absent_at     = CASE WHEN v_absent THEN now() ELSE NULL END,
    units_confirmed    = v_units,
    units_confirmed_by = CASE WHEN v_units THEN auth.uid() ELSE NULL END,
    units_confirmed_at = CASE WHEN v_units THEN now() ELSE NULL END,
    gtin_confirmed     = v_gtin_conf,
    gtin_confirmed_by  = CASE WHEN v_gtin_conf THEN auth.uid() ELSE NULL END,
    gtin_confirmed_at  = CASE WHEN v_gtin_conf THEN now() ELSE NULL END,
    updated_by = auth.uid()
  WHERE id = v_id;

  RETURN v_id;
END $fn$;

-- =====================================================================
-- SEÇÃO 6 — NCM: RPCs COM FONTE OFICIAL OBRIGATÓRIA
-- =====================================================================
CREATE OR REPLACE FUNCTION public.rpc_regulatory_ncm_candidate_add(
  p_dossier_id uuid, p_ncm text, p_justification text,
  p_cest text DEFAULT NULL, p_confidence text DEFAULT 'LOW',
  p_source_key text DEFAULT NULL, p_source_url text DEFAULT NULL,
  p_consulted_at date DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $fn$
DECLARE v_id uuid; v_status text; v_source uuid;
BEGIN
  IF NOT public.fn_regulatory_can_prepare() THEN
    RAISE EXCEPTION 'REGULATORY_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  SELECT status INTO v_status FROM public.microorganism_regulatory_dossiers
   WHERE id = p_dossier_id AND deleted_at IS NULL;
  IF v_status IS NULL THEN RAISE EXCEPTION 'REGULATORY_DOSSIER_NOT_FOUND' USING ERRCODE = '22023'; END IF;
  IF v_status NOT IN ('DRAFT', 'PENDING_REVIEW') THEN
    RAISE EXCEPTION 'REGULATORY_DOSSIER_NOT_EDITABLE' USING ERRCODE = '55006';
  END IF;

  IF length(btrim(coalesce(p_justification, ''))) < 20 THEN
    RAISE EXCEPTION 'REGULATORY_JUSTIFICATION_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF p_consulted_at IS NULL THEN
    RAISE EXCEPTION 'REGULATORY_NCM_CONSULTED_AT_REQUIRED' USING ERRCODE = '22023';
  END IF;

  SELECT id INTO v_source FROM public.fiscal_official_sources
   WHERE source_key = p_source_key AND is_active;

  IF v_source IS NULL AND NOT public.fn_fiscal_official_url_allowlisted(p_source_url) THEN
    RAISE EXCEPTION 'REGULATORY_NCM_SOURCE_REQUIRED'
      USING ERRCODE = '22023',
            HINT = 'Informe fonte oficial cadastrada e ativa (source_key) ou URL oficial allowlisted (.gov.br).';
  END IF;

  INSERT INTO public.microorganism_ncm_candidates
    (dossier_id, ncm, cest, justification, confidence, source_id, source_url, consulted_at, created_by)
  VALUES (p_dossier_id, p_ncm, p_cest, p_justification, coalesce(p_confidence, 'LOW'),
          v_source, p_source_url, p_consulted_at, auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END $fn$;

DROP FUNCTION IF EXISTS public.rpc_regulatory_ncm_candidate_decide(uuid, boolean, text);

CREATE OR REPLACE FUNCTION public.rpc_regulatory_ncm_candidate_decide(
  p_candidate_id uuid, p_approve boolean, p_reason text,
  p_official_description text DEFAULT NULL,
  p_table_version text DEFAULT NULL,
  p_table_reference_date date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $fn$
DECLARE v_cand public.microorganism_ncm_candidates; v_status text; v_row public.microorganism_ncm_candidates;
BEGIN
  IF NOT public.fn_regulatory_can_approve('FISCAL') THEN
    RAISE EXCEPTION 'REGULATORY_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF nullif(btrim(coalesce(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'REGULATORY_JUSTIFICATION_REQUIRED' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_cand FROM public.microorganism_ncm_candidates
   WHERE id = p_candidate_id FOR UPDATE;
  IF v_cand.id IS NULL THEN RAISE EXCEPTION 'REGULATORY_CANDIDATE_NOT_FOUND' USING ERRCODE = '22023'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('regulatory_dossier_ncm:' || v_cand.dossier_id::text, 0));

  SELECT status INTO v_status FROM public.microorganism_regulatory_dossiers
   WHERE id = v_cand.dossier_id FOR UPDATE;
  IF v_status NOT IN ('DRAFT', 'PENDING_REVIEW') THEN
    RAISE EXCEPTION 'REGULATORY_DOSSIER_NOT_EDITABLE' USING ERRCODE = '55006';
  END IF;

  IF p_approve THEN
    IF v_cand.source_id IS NULL THEN
      RAISE EXCEPTION 'REGULATORY_NCM_OFFICIAL_SOURCE_REQUIRED'
        USING ERRCODE = '22023',
              HINT = 'URL avulsa nao basta: cadastre a fonte oficial em fiscal_official_sources.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.fiscal_official_sources
                    WHERE id = v_cand.source_id AND is_active) THEN
      RAISE EXCEPTION 'REGULATORY_NCM_SOURCE_INACTIVE' USING ERRCODE = '22023';
    END IF;
    IF length(btrim(coalesce(p_official_description, ''))) < 10
       OR nullif(btrim(coalesce(p_table_version, '')), '') IS NULL
       OR p_table_reference_date IS NULL THEN
      RAISE EXCEPTION 'REGULATORY_NCM_OFFICIAL_DESCRIPTION_REQUIRED'
        USING ERRCODE = '22023',
              HINT = 'Informe a descricao oficial do NCM e a versao/data da tabela consultada.';
    END IF;
  END IF;

  UPDATE public.microorganism_ncm_candidates
     SET status = CASE WHEN p_approve THEN 'APPROVED' ELSE 'REJECTED' END,
         decided_by = auth.uid(), decided_at = now(), decision_reason = p_reason,
         official_description = CASE WHEN p_approve THEN p_official_description ELSE official_description END,
         table_version = CASE WHEN p_approve THEN p_table_version ELSE table_version END,
         table_reference_date = CASE WHEN p_approve THEN p_table_reference_date ELSE table_reference_date END
   WHERE id = p_candidate_id
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END $fn$;

-- =====================================================================
-- SEÇÃO 7 — PUBLICAÇÃO: TRÊS IDENTIDADES + ESCOPO DO CANDIDATO
-- =====================================================================
CREATE OR REPLACE FUNCTION public.rpc_regulatory_dossier_publish(p_dossier_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $fn$
DECLARE
  d public.microorganism_regulatory_dossiers;
  v_cand public.microorganism_ncm_candidates;
  v_pending int; v_docs int; v_distinct int; v_snapshot jsonb; v_sha text;
BEGIN
  IF NOT public.fn_regulatory_can_prepare() THEN
    RAISE EXCEPTION 'REGULATORY_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO d FROM public.microorganism_regulatory_dossiers
   WHERE id = p_dossier_id AND deleted_at IS NULL FOR UPDATE;
  IF d.id IS NULL THEN RAISE EXCEPTION 'REGULATORY_DOSSIER_NOT_FOUND' USING ERRCODE = '22023'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('regulatory_publish:' || d.microorganism_id::text, 0));

  -- Idempotência sob concorrência: re-leitura após o lock
  SELECT * INTO d FROM public.microorganism_regulatory_dossiers
   WHERE id = p_dossier_id AND deleted_at IS NULL FOR UPDATE;
  IF d.status = 'VALIDATED' THEN
    SELECT snapshot_sha256 INTO v_sha
      FROM public.microorganism_regulatory_publication_snapshots
     WHERE dossier_id = p_dossier_id ORDER BY version DESC LIMIT 1;
    RETURN jsonb_build_object('dossier_id', p_dossier_id, 'status', d.status,
                              'snapshot_sha256', v_sha, 'idempotent', true);
  END IF;
  IF d.status <> 'PENDING_REVIEW' THEN
    RAISE EXCEPTION 'REGULATORY_INVALID_TRANSITION' USING ERRCODE = '55006';
  END IF;

  IF d.technical_review_status <> 'APPROVED'
     OR d.regulatory_review_status <> 'APPROVED'
     OR d.fiscal_review_status <> 'APPROVED' THEN
    RAISE EXCEPTION 'REGULATORY_APPROVALS_INCOMPLETE' USING ERRCODE = '55006';
  END IF;

  SELECT count(DISTINCT x) INTO v_distinct
    FROM unnest(ARRAY[d.technical_review_by, d.regulatory_review_by, d.fiscal_review_by]) AS x;
  IF v_distinct < 3 AND NOT d.sod_override_active THEN
    RAISE EXCEPTION 'REGULATORY_SEGREGATION_OF_DUTIES'
      USING ERRCODE = '42501',
            HINT = 'Publicacao exige tres aprovadores distintos ou override emergencial auditado.';
  END IF;

  SELECT count(*) INTO v_pending FROM public.microorganism_regulatory_checklist
   WHERE dossier_id = p_dossier_id AND state = 'PENDING';
  IF v_pending > 0 THEN
    RAISE EXCEPTION 'REGULATORY_CHECKLIST_INCOMPLETE: % item(ns) pendente(s)', v_pending USING ERRCODE = '55006';
  END IF;

  SELECT count(*) INTO v_docs FROM public.microorganism_regulatory_documents
   WHERE dossier_id = p_dossier_id AND deleted_at IS NULL AND doc_type IN ('ROTULO', 'LAUDO');
  IF v_docs = 0 THEN
    RAISE EXCEPTION 'REGULATORY_EVIDENCE_DOCUMENT_MISSING' USING ERRCODE = '55006';
  END IF;

  SELECT * INTO v_cand FROM public.microorganism_ncm_candidates
   WHERE dossier_id = p_dossier_id AND status = 'APPROVED' FOR UPDATE;
  IF v_cand.id IS NULL THEN
    RAISE EXCEPTION 'REGULATORY_NCM_NOT_APPROVED' USING ERRCODE = '55006';
  END IF;
  IF v_cand.source_id IS NULL OR v_cand.table_reference_date IS NULL THEN
    RAISE EXCEPTION 'REGULATORY_NCM_OFFICIAL_SOURCE_REQUIRED' USING ERRCODE = '55006';
  END IF;

  IF EXISTS (SELECT 1 FROM public.microorganism_regulatory_presentations
              WHERE dossier_id = p_dossier_id AND (NOT units_confirmed OR NOT gtin_confirmed)) THEN
    RAISE EXCEPTION 'REGULATORY_PRESENTATION_NOT_CONFIRMED' USING ERRCODE = '55006';
  END IF;

  PERFORM set_config('app.regulatory_formal_op', 'on', true);

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
                               WHERE p.dossier_id = p_dossier_id), '[]'::jsonb),
    'documents', coalesce((SELECT jsonb_agg(jsonb_build_object(
                              'id', x.id, 'doc_type', x.doc_type, 'title', x.title,
                              'storage_path', x.storage_path,
                              'content_sha256', x.content_sha256, 'issued_at', x.issued_at,
                              'valid_until', x.valid_until, 'source_url', x.source_url) ORDER BY x.id)
                           FROM public.microorganism_regulatory_documents x
                           WHERE x.dossier_id = p_dossier_id AND x.deleted_at IS NULL), '[]'::jsonb),
    'checklist', coalesce((SELECT jsonb_agg(jsonb_build_object(
                              'item_key', c.item_key, 'state', c.state, 'justification', c.justification)
                              ORDER BY c.item_key)
                           FROM public.microorganism_regulatory_checklist c
                           WHERE c.dossier_id = p_dossier_id), '[]'::jsonb),
    'ncm_candidate', to_jsonb(v_cand));
  v_sha := encode(digest(v_snapshot::text, 'sha256'), 'hex');

  INSERT INTO public.microorganism_regulatory_publication_snapshots
    (dossier_id, microorganism_id, version, snapshot, snapshot_sha256, published_by)
  VALUES (p_dossier_id, d.microorganism_id, d.version, v_snapshot, v_sha, auth.uid());

  PERFORM set_config('app.regulatory_formal_op', '', true);
  RETURN jsonb_build_object('dossier_id', p_dossier_id, 'status', d.status,
                            'snapshot_sha256', v_sha, 'idempotent', false);
END $fn$;

-- =====================================================================
-- SEÇÃO 8 — GRANTS FAIL-CLOSED
-- =====================================================================
DO $g$
DECLARE r record;
BEGIN
  FOR r IN SELECT p.oid::regprocedure::text AS sig FROM pg_proc p
           JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public'
             AND (p.proname LIKE 'rpc_regulatory_%' OR p.proname LIKE 'fn_regulatory_%')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
  END LOOP;
END $g$;

COMMENT ON TABLE public.regulatory_storage_cleanup_queue IS
  'Fase F2 correcao: fila compensavel de remocao fisica de blobs. Exclusao logica ocorre por RPC; remocao fisica apenas de documento nao publicado, com auditoria.';
