
-- 1. Remove duplicate audit triggers (old ones using catalog_audit_log)
DROP TRIGGER IF EXISTS trg_audit_product_profile ON public.product_technical_profiles;
DROP TRIGGER IF EXISTS trg_audit_product_targets ON public.product_target_recommendations;
DROP TRIGGER IF EXISTS trg_audit_product_crops ON public.product_crop_recommendations;

-- 2. Remove duplicate approval triggers (keep enforce_*)
DROP TRIGGER IF EXISTS trg_validate_micro_profile_approval ON public.microorganism_technical_profiles;
DROP TRIGGER IF EXISTS trg_validate_product_profile_approval ON public.product_technical_profiles;

-- 3. Tighten RLS for targets/crops: require approved profile for produtor/parceiro
DROP POLICY IF EXISTS micro_targets_read ON public.microorganism_targets;
CREATE POLICY micro_targets_read ON public.microorganism_targets
FOR SELECT TO authenticated
USING (
  can_view_catalog_internal(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.microrganismos m
    JOIN public.microorganism_technical_profiles tp ON tp.microrganismo_id = m.id
    WHERE m.id = microorganism_targets.microrganismo_id
      AND m.ativo = true
      AND tp.status_validacao = 'aprovado'
      AND microorganism_targets.ativo = true
      AND (
        has_role(auth.uid(), 'cliente_produtor'::app_role)
        OR (has_role(auth.uid(), 'parceiro_b2b'::app_role) AND m.b2b_enabled = true)
      )
  )
);

DROP POLICY IF EXISTS micro_crops_read ON public.microorganism_crop_recommendations;
CREATE POLICY micro_crops_read ON public.microorganism_crop_recommendations
FOR SELECT TO authenticated
USING (
  can_view_catalog_internal(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.microrganismos m
    JOIN public.microorganism_technical_profiles tp ON tp.microrganismo_id = m.id
    WHERE m.id = microorganism_crop_recommendations.microrganismo_id
      AND m.ativo = true
      AND tp.status_validacao = 'aprovado'
      AND microorganism_crop_recommendations.ativo = true
      AND (
        has_role(auth.uid(), 'cliente_produtor'::app_role)
        OR (has_role(auth.uid(), 'parceiro_b2b'::app_role) AND m.b2b_enabled = true)
      )
  )
);

DROP POLICY IF EXISTS prod_targets_read ON public.product_target_recommendations;
CREATE POLICY prod_targets_read ON public.product_target_recommendations
FOR SELECT TO authenticated
USING (
  can_view_catalog_internal(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.produtos p
    JOIN public.product_technical_profiles tp ON tp.produto_id = p.id
    WHERE p.id = product_target_recommendations.produto_id
      AND p.ativo = true
      AND tp.status_validacao = 'aprovado'
      AND product_target_recommendations.ativo = true
      AND (
        has_role(auth.uid(), 'cliente_produtor'::app_role)
        OR (has_role(auth.uid(), 'parceiro_b2b'::app_role) AND p.b2b_enabled = true)
      )
  )
);

DROP POLICY IF EXISTS prod_crops_read ON public.product_crop_recommendations;
CREATE POLICY prod_crops_read ON public.product_crop_recommendations
FOR SELECT TO authenticated
USING (
  can_view_catalog_internal(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.produtos p
    JOIN public.product_technical_profiles tp ON tp.produto_id = p.id
    WHERE p.id = product_crop_recommendations.produto_id
      AND p.ativo = true
      AND tp.status_validacao = 'aprovado'
      AND product_crop_recommendations.ativo = true
      AND (
        has_role(auth.uid(), 'cliente_produtor'::app_role)
        OR (has_role(auth.uid(), 'parceiro_b2b'::app_role) AND p.b2b_enabled = true)
      )
  )
);

-- 4. Restrict gestor_comercial out of direct UPDATE on product profile; route via RPC
DROP POLICY IF EXISTS prod_tp_update_team ON public.product_technical_profiles;
CREATE POLICY prod_tp_update_team ON public.product_technical_profiles
FOR UPDATE TO authenticated
USING (can_manage_catalog_tecnico(auth.uid()))
WITH CHECK (can_manage_catalog_tecnico(auth.uid()));

CREATE OR REPLACE FUNCTION public.update_product_b2b_description(
  p_profile_id uuid,
  p_explicacao_b2b text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_b2b boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF NOT (
    has_role(v_uid, 'administrador'::app_role)
    OR has_role(v_uid, 'gestor'::app_role)
    OR has_role(v_uid, 'gestor_comercial'::app_role)
  ) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  IF has_role(v_uid, 'gestor_comercial'::app_role)
     AND NOT (has_role(v_uid, 'administrador'::app_role) OR has_role(v_uid, 'gestor'::app_role)) THEN
    SELECT p.b2b_enabled INTO v_b2b
    FROM public.product_technical_profiles tp
    JOIN public.produtos p ON p.id = tp.produto_id
    WHERE tp.id = p_profile_id;
    IF NOT COALESCE(v_b2b, false) THEN
      RAISE EXCEPTION 'produto não habilitado para B2B';
    END IF;
  END IF;

  UPDATE public.product_technical_profiles
  SET explicacao_b2b = p_explicacao_b2b,
      updated_by = v_uid,
      updated_at = now()
  WHERE id = p_profile_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_product_b2b_description(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_microorganism_b2b_description(
  p_profile_id uuid,
  p_explicacao_b2b text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_b2b boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF NOT (
    has_role(v_uid, 'administrador'::app_role)
    OR has_role(v_uid, 'gestor'::app_role)
    OR has_role(v_uid, 'gestor_comercial'::app_role)
  ) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  IF has_role(v_uid, 'gestor_comercial'::app_role)
     AND NOT (has_role(v_uid, 'administrador'::app_role) OR has_role(v_uid, 'gestor'::app_role)) THEN
    SELECT m.b2b_enabled INTO v_b2b
    FROM public.microorganism_technical_profiles tp
    JOIN public.microrganismos m ON m.id = tp.microrganismo_id
    WHERE tp.id = p_profile_id;
    IF NOT COALESCE(v_b2b, false) THEN
      RAISE EXCEPTION 'microrganismo não habilitado para B2B';
    END IF;
  END IF;

  UPDATE public.microorganism_technical_profiles
  SET explicacao_b2b = p_explicacao_b2b,
      updated_by = v_uid,
      updated_at = now()
  WHERE id = p_profile_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_microorganism_b2b_description(uuid, text) TO authenticated;

-- 5. catalog_technical_sources: add source_key dedup column + trigger + unique index
ALTER TABLE public.catalog_technical_sources ADD COLUMN IF NOT EXISTS source_key text;

CREATE OR REPLACE FUNCTION public.catalog_sources_set_source_key()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.source_key := lower(md5(
    coalesce(NEW.entidade_tipo,'') || ':' ||
    coalesce(NEW.entidade_id::text,'') || ':' ||
    coalesce(NEW.fonte_url, NEW.fonte_titulo, '')
  ));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_catalog_sources_source_key ON public.catalog_technical_sources;
CREATE TRIGGER trg_catalog_sources_source_key
BEFORE INSERT OR UPDATE ON public.catalog_technical_sources
FOR EACH ROW EXECUTE FUNCTION public.catalog_sources_set_source_key();

-- Backfill
UPDATE public.catalog_technical_sources
SET source_key = lower(md5(
  coalesce(entidade_tipo,'') || ':' ||
  coalesce(entidade_id::text,'') || ':' ||
  coalesce(fonte_url, fonte_titulo, '')
))
WHERE source_key IS NULL;

-- Deduplicate before creating unique index
DELETE FROM public.catalog_technical_sources a
USING public.catalog_technical_sources b
WHERE a.source_key = b.source_key AND a.ctid > b.ctid;

ALTER TABLE public.catalog_technical_sources ALTER COLUMN source_key SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_catalog_sources_source_key
  ON public.catalog_technical_sources (source_key);
