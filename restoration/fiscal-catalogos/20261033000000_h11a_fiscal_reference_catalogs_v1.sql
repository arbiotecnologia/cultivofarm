-- Fase H11-A — Catálogos fiscais oficiais versionados (referência), CultivoFarm.
-- Idempotente e incremental. Não altera motor fiscal, snapshots nem documentos.
-- Separação de responsabilidades:
--   fiscal_reference_*        = referência oficial (NCM/CFOP/CNAE/IBGE/NFS-e/RTC)
--   fiscal_tax_rules          = regra tributária operacional
--   fiscal_operation_policies = política operacional

BEGIN;

-- ---------------------------------------------------------------- catálogos
CREATE TABLE IF NOT EXISTS public.fiscal_reference_catalogs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_type text NOT NULL,
  source_name text NOT NULL,
  source_reference text,
  source_version text NOT NULL,
  published_at date,
  effective_from date,
  effective_to date,
  checksum text,
  status text NOT NULL DEFAULT 'DRAFT',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  imported_at timestamptz NOT NULL DEFAULT now(),
  imported_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fiscal_reference_catalogs_type_check') THEN
    ALTER TABLE public.fiscal_reference_catalogs
      ADD CONSTRAINT fiscal_reference_catalogs_type_check CHECK (catalog_type = ANY (ARRAY[
        'NCM','CFOP','CNAE','MUNICIPIO_IBGE','NFSE_SERVICO_NACIONAL',
        'CCLASSTRIB','CCREDPRES','CBS_RATE','FCP_UF','RTC_NORMA'
      ]));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fiscal_reference_catalogs_status_check') THEN
    ALTER TABLE public.fiscal_reference_catalogs
      ADD CONSTRAINT fiscal_reference_catalogs_status_check
      CHECK (status = ANY (ARRAY['DRAFT','ACTIVE','SUPERSEDED']));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_fiscal_ref_catalog_type_version
  ON public.fiscal_reference_catalogs (catalog_type, source_version);
CREATE UNIQUE INDEX IF NOT EXISTS ux_fiscal_ref_catalog_active
  ON public.fiscal_reference_catalogs (catalog_type) WHERE status = 'ACTIVE';

-- ------------------------------------------------------------------ itens
CREATE TABLE IF NOT EXISTS public.fiscal_reference_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_id uuid NOT NULL REFERENCES public.fiscal_reference_catalogs(id) ON DELETE CASCADE,
  code text NOT NULL,
  description text NOT NULL,
  parent_code text,
  search_text text,
  valid_from date,
  valid_to date,
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fiscal_reference_entries_unique UNIQUE (catalog_id, code)
);

CREATE INDEX IF NOT EXISTS ix_fiscal_ref_entries_catalog_code
  ON public.fiscal_reference_entries (catalog_id, code);
CREATE INDEX IF NOT EXISTS ix_fiscal_ref_entries_parent
  ON public.fiscal_reference_entries (catalog_id, parent_code) WHERE parent_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_fiscal_ref_entries_validity
  ON public.fiscal_reference_entries (catalog_id, is_active, valid_from, valid_to);
CREATE INDEX IF NOT EXISTS ix_fiscal_ref_entries_search
  ON public.fiscal_reference_entries (catalog_id, search_text text_pattern_ops);

CREATE OR REPLACE FUNCTION public.fn_fiscal_reference_entry_normalize()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.search_text := lower(translate(
    coalesce(NEW.code,'') || ' ' || coalesce(NEW.description,''),
    'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç',
    'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc'
  ));
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fiscal_reference_entry_normalize ON public.fiscal_reference_entries;
CREATE TRIGGER trg_fiscal_reference_entry_normalize
  BEFORE INSERT OR UPDATE ON public.fiscal_reference_entries
  FOR EACH ROW EXECUTE FUNCTION public.fn_fiscal_reference_entry_normalize();

-- ------------------------------------------------------------------ GRANTS
GRANT SELECT ON public.fiscal_reference_catalogs TO authenticated;
GRANT SELECT ON public.fiscal_reference_entries TO authenticated;
GRANT ALL ON public.fiscal_reference_catalogs TO service_role;
GRANT ALL ON public.fiscal_reference_entries TO service_role;
REVOKE ALL ON public.fiscal_reference_catalogs FROM anon;
REVOKE ALL ON public.fiscal_reference_entries FROM anon;

ALTER TABLE public.fiscal_reference_catalogs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fiscal_reference_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS frc_internal_read ON public.fiscal_reference_catalogs;
CREATE POLICY frc_internal_read ON public.fiscal_reference_catalogs
  FOR SELECT TO authenticated
  USING (public.fn_fiscal_can_read_internal());

DROP POLICY IF EXISTS fre_internal_read ON public.fiscal_reference_entries;
CREATE POLICY fre_internal_read ON public.fiscal_reference_entries
  FOR SELECT TO authenticated
  USING (public.fn_fiscal_can_read_internal());

-- Nenhuma política de escrita: escrita somente via RPC administrativa abaixo.

-- ------------------------------------------------------- auditoria: ações
ALTER TABLE public.fiscal_audit_log DROP CONSTRAINT IF EXISTS fiscal_audit_log_action_check;
ALTER TABLE public.fiscal_audit_log ADD CONSTRAINT fiscal_audit_log_action_check
  CHECK (action = ANY (ARRAY[
    'INSERT','UPDATE','DELETE',
    'XML_PREPARED','XML_GENERATED','XML_XSD_VALIDATED','XML_SIGNED','XML_FAILED',
    'BASE_REDUCTION_CHANGE','BASE_REDUCTION_APPLIED',
    'CATALOG_IMPORTED','CATALOG_PUBLISHED','CATALOG_SUPERSEDED','CFOP_CHANGE'
  ]));

-- ------------------------------------------------------------ RPC de busca
CREATE OR REPLACE FUNCTION public.rpc_fiscal_catalog_search_v1(
  p_catalog_type text,
  p_query text DEFAULT NULL,
  p_parent_code text DEFAULT NULL,
  p_preferred_codes text[] DEFAULT NULL,
  p_limit integer DEFAULT 25
)
RETURNS TABLE (
  code text,
  description text,
  parent_code text,
  metadata jsonb,
  is_preferred boolean,
  catalog_version text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH cat AS (
    SELECT id, source_version
    FROM public.fiscal_reference_catalogs
    WHERE catalog_type = p_catalog_type AND status = 'ACTIVE'
    LIMIT 1
  ),
  needle AS (
    SELECT lower(translate(coalesce(p_query,''),
      'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç',
      'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc')) AS q
  )
  SELECT e.code, e.description, e.parent_code, e.metadata,
         (p_preferred_codes IS NOT NULL AND e.code = ANY (p_preferred_codes)) AS is_preferred,
         c.source_version
  FROM public.fiscal_reference_entries e
  JOIN cat c ON c.id = e.catalog_id
  CROSS JOIN needle n
  WHERE e.is_active
    AND (e.valid_from IS NULL OR e.valid_from <= current_date)
    AND (e.valid_to IS NULL OR e.valid_to >= current_date)
    AND (p_parent_code IS NULL OR e.parent_code = p_parent_code)
    AND (n.q = '' OR e.search_text LIKE '%' || n.q || '%')
  ORDER BY
    (p_preferred_codes IS NOT NULL AND e.code = ANY (p_preferred_codes)) DESC,
    (n.q <> '' AND e.code LIKE n.q || '%') DESC,
    e.code
  LIMIT LEAST(GREATEST(coalesce(p_limit, 25), 1), 30);
$$;

REVOKE ALL ON FUNCTION public.rpc_fiscal_catalog_search_v1(text, text, text, text[], integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_fiscal_catalog_search_v1(text, text, text, text[], integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_fiscal_catalog_search_v1(text, text, text, text[], integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.rpc_fiscal_catalog_resolve_v1(
  p_catalog_type text,
  p_codes text[]
)
RETURNS TABLE (code text, description text, parent_code text, is_active boolean, metadata jsonb)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT e.code, e.description, e.parent_code, e.is_active, e.metadata
  FROM public.fiscal_reference_entries e
  JOIN public.fiscal_reference_catalogs c ON c.id = e.catalog_id
  WHERE c.catalog_type = p_catalog_type
    AND c.status = 'ACTIVE'
    AND e.code = ANY (coalesce(p_codes, ARRAY[]::text[]))
  LIMIT 200;
$$;

REVOKE ALL ON FUNCTION public.rpc_fiscal_catalog_resolve_v1(text, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_fiscal_catalog_resolve_v1(text, text[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_fiscal_catalog_resolve_v1(text, text[]) TO authenticated;

-- -------------------------------------------------- RPC de importação (admin)
CREATE OR REPLACE FUNCTION public.rpc_fiscal_catalog_import_v1(
  p_catalog_type text,
  p_source_name text,
  p_source_version text,
  p_entries jsonb,
  p_source_reference text DEFAULT NULL,
  p_published_at date DEFAULT NULL,
  p_effective_from date DEFAULT NULL,
  p_checksum text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
  v_status text;
  v_count integer;
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'administrador'::app_role) THEN
    RAISE EXCEPTION 'CATALOG_FORBIDDEN';
  END IF;
  IF p_entries IS NULL OR jsonb_typeof(p_entries) <> 'array' OR jsonb_array_length(p_entries) = 0 THEN
    RAISE EXCEPTION 'CATALOG_EMPTY_PAYLOAD';
  END IF;

  SELECT id, status INTO v_id, v_status
    FROM public.fiscal_reference_catalogs
   WHERE catalog_type = p_catalog_type AND source_version = p_source_version;

  IF v_status = 'SUPERSEDED' THEN
    RAISE EXCEPTION 'CATALOG_SUPERSEDED_IMMUTABLE';
  END IF;

  INSERT INTO public.fiscal_reference_catalogs (
    catalog_type, source_name, source_reference, source_version,
    published_at, effective_from, checksum, status, metadata, imported_by
  ) VALUES (
    p_catalog_type, p_source_name, p_source_reference, p_source_version,
    p_published_at, p_effective_from, p_checksum, 'DRAFT', coalesce(p_metadata,'{}'::jsonb), v_uid
  )
  ON CONFLICT (catalog_type, source_version) DO UPDATE
    SET source_name = EXCLUDED.source_name,
        source_reference = EXCLUDED.source_reference,
        published_at = EXCLUDED.published_at,
        effective_from = EXCLUDED.effective_from,
        checksum = EXCLUDED.checksum,
        metadata = EXCLUDED.metadata,
        updated_at = now()
  RETURNING id INTO v_id;

  INSERT INTO public.fiscal_reference_entries (catalog_id, code, description, parent_code, valid_from, valid_to, is_active, metadata)
  SELECT v_id, x.code, x.description, x.parent_code, x.valid_from, x.valid_to,
         coalesce(x.is_active, true), coalesce(x.metadata, '{}'::jsonb)
  FROM jsonb_to_recordset(p_entries) AS x(
    code text, description text, parent_code text,
    valid_from date, valid_to date, is_active boolean, metadata jsonb
  )
  WHERE x.code IS NOT NULL AND x.description IS NOT NULL
  ON CONFLICT (catalog_id, code) DO UPDATE
    SET description = EXCLUDED.description,
        parent_code = EXCLUDED.parent_code,
        valid_from = EXCLUDED.valid_from,
        valid_to = EXCLUDED.valid_to,
        is_active = EXCLUDED.is_active,
        metadata = EXCLUDED.metadata,
        updated_at = now();

  GET DIAGNOSTICS v_count = ROW_COUNT;

  INSERT INTO public.fiscal_audit_log (table_name, record_id, action, changed_by, new_values)
  VALUES ('fiscal_reference_catalogs', v_id, 'CATALOG_IMPORTED', v_uid,
          jsonb_build_object('catalog_type', p_catalog_type, 'source_name', p_source_name,
                             'source_version', p_source_version, 'checksum', p_checksum,
                             'entries', v_count));
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_fiscal_catalog_import_v1(text, text, text, jsonb, text, date, date, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_fiscal_catalog_import_v1(text, text, text, jsonb, text, date, date, text, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_fiscal_catalog_import_v1(text, text, text, jsonb, text, date, date, text, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_fiscal_catalog_import_v1(text, text, text, jsonb, text, date, date, text, jsonb) TO service_role;

-- ---------------------------------------------- RPC de publicação (admin)
CREATE OR REPLACE FUNCTION public.rpc_fiscal_catalog_publish_v1(p_catalog_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_type text;
  v_prev uuid;
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'administrador'::app_role) THEN
    RAISE EXCEPTION 'CATALOG_FORBIDDEN';
  END IF;

  SELECT catalog_type INTO v_type FROM public.fiscal_reference_catalogs WHERE id = p_catalog_id;
  IF v_type IS NULL THEN
    RAISE EXCEPTION 'CATALOG_NOT_FOUND';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.fiscal_reference_entries WHERE catalog_id = p_catalog_id) THEN
    RAISE EXCEPTION 'CATALOG_WITHOUT_ENTRIES';
  END IF;

  SELECT id INTO v_prev FROM public.fiscal_reference_catalogs
   WHERE catalog_type = v_type AND status = 'ACTIVE' AND id <> p_catalog_id;

  IF v_prev IS NOT NULL THEN
    UPDATE public.fiscal_reference_catalogs
       SET status = 'SUPERSEDED', effective_to = current_date, updated_at = now()
     WHERE id = v_prev;
    INSERT INTO public.fiscal_audit_log (table_name, record_id, action, changed_by, new_values)
    VALUES ('fiscal_reference_catalogs', v_prev, 'CATALOG_SUPERSEDED', v_uid,
            jsonb_build_object('catalog_type', v_type, 'superseded_by', p_catalog_id));
  END IF;

  UPDATE public.fiscal_reference_catalogs
     SET status = 'ACTIVE',
         effective_from = coalesce(effective_from, current_date),
         updated_at = now()
   WHERE id = p_catalog_id;

  INSERT INTO public.fiscal_audit_log (table_name, record_id, action, changed_by, new_values)
  VALUES ('fiscal_reference_catalogs', p_catalog_id, 'CATALOG_PUBLISHED', v_uid,
          jsonb_build_object('catalog_type', v_type));
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_fiscal_catalog_publish_v1(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_fiscal_catalog_publish_v1(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_fiscal_catalog_publish_v1(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_fiscal_catalog_publish_v1(uuid) TO service_role;

COMMIT;
