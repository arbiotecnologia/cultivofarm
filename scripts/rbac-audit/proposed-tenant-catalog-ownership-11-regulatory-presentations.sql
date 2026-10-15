-- CANDIDATO 11 — NÃO APLICAR. Requer 01–10; gate permanece OFF.
-- FK live adicional (60ª): microorganism_regulatory_presentations.catalog_volume_id -> catalogo_volumes(id) ON DELETE SET NULL.
-- Não remove FK, dossiês nem apresentações. Contenção por dono derivado do volume E do pai do volume E do dossiê.
-- Live read-only 2026-10-15: authenticated/anon sem grant direto na tabela; 1 policy SELECT; 0 linhas com catalog_volume_id.
BEGIN;
DO $g$ BEGIN
  IF platform_private.catalog_ownership_enabled() THEN RAISE EXCEPTION 'ownership11_gate_must_remain_off'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=ANY(c.conkey)
     WHERE c.contype='f' AND c.conrelid='public.microorganism_regulatory_presentations'::regclass
       AND c.confrelid='public.catalogo_volumes'::regclass AND a.attname='catalog_volume_id' AND c.confdeltype='n') THEN
    RAISE EXCEPTION 'ownership11_fk_drift';
  END IF;
  IF md5(pg_get_functiondef('public.rpc_regulatory_presentation_upsert(uuid,integer,jsonb)'::regprocedure)) <> '74f45dd67e9435a9876b0e2609e38954' THEN
    RAISE EXCEPTION 'ownership11_drift:rpc_regulatory_presentation_upsert';
  END IF;
  -- Aborta se já houver vínculo privado: leitores regulatórios só ficam provados global-only sem esse estado.
  IF EXISTS (SELECT 1 FROM public.microorganism_regulatory_presentations p
               JOIN public.catalogo_volumes v ON v.id=p.catalog_volume_id
               JOIN public.microorganism_regulatory_dossiers d ON d.id=p.dossier_id
               JOIN public.microrganismos m ON m.id=d.microorganism_id
              LEFT JOIN public.produtos vp ON vp.id=v.produto_id
              LEFT JOIN public.microrganismos vm ON vm.id=v.microrganismo_id
              WHERE v.owner_organization_id IS NOT NULL OR vp.owner_organization_id IS NOT NULL
                 OR vm.owner_organization_id IS NOT NULL OR m.owner_organization_id IS NOT NULL) THEN
    RAISE EXCEPTION 'ownership11_private_regulatory_link_present';
  END IF;
END $g$;

-- Helper booleano mínimo: não devolve dados nem distingue privado de inexistente.
CREATE OR REPLACE FUNCTION platform_private.catalog_regulatory_volume_is_global(p_dossier_id uuid, p_volume_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $f$
  SELECT EXISTS (
    SELECT 1 FROM public.catalogo_volumes v
      JOIN public.microorganism_regulatory_dossiers d ON d.id=p_dossier_id
      JOIN public.microrganismos m ON m.id=d.microorganism_id AND m.owner_organization_id IS NULL
      LEFT JOIN public.produtos vp ON vp.id=v.produto_id
      LEFT JOIN public.microrganismos vm ON vm.id=v.microrganismo_id
     WHERE v.id=p_volume_id AND v.owner_organization_id IS NULL
       AND (v.produto_id IS NULL OR vp.owner_organization_id IS NULL AND vp.id IS NOT NULL)
       AND (v.microrganismo_id IS NULL OR vm.owner_organization_id IS NULL AND vm.id IS NOT NULL));
$f$;
REVOKE ALL ON FUNCTION platform_private.catalog_regulatory_volume_is_global(uuid,uuid) FROM PUBLIC, anon, authenticated;

-- Trigger dedicado: INSERT/UPDATE que define/troca volume ou dossiê exige cadeia global; NULL (inclusive SET NULL da FK) passa.
CREATE OR REPLACE FUNCTION platform_private.catalog_regulatory_presentation_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
BEGIN
  IF NEW.catalog_volume_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' AND NEW.catalog_volume_id IS NOT DISTINCT FROM OLD.catalog_volume_id
     AND NEW.dossier_id IS NOT DISTINCT FROM OLD.dossier_id THEN RETURN NEW; END IF;
  IF NOT platform_private.catalog_regulatory_volume_is_global(NEW.dossier_id, NEW.catalog_volume_id) THEN
    RAISE EXCEPTION 'catalog_private_reference_module_unavailable' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $f$;
REVOKE ALL ON FUNCTION platform_private.catalog_regulatory_presentation_guard() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_catalog_regulatory_presentation_guard ON public.microorganism_regulatory_presentations;
CREATE TRIGGER trg_catalog_regulatory_presentation_guard BEFORE INSERT OR UPDATE OF catalog_volume_id, dossier_id
  ON public.microorganism_regulatory_presentations FOR EACH ROW EXECUTE FUNCTION platform_private.catalog_regulatory_presentation_guard();

-- Writer: recusa antes de gravar, mesma mensagem para inexistente/privado/outra empresa.
CREATE OR REPLACE FUNCTION public.rpc_regulatory_presentation_upsert(p_dossier_id uuid, p_volume_ml integer, p_patch jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_id uuid; v_status text; v_units boolean; v_gtin_conf boolean;
  v_absent boolean; v_gtin text; v_absent_reason text; v_volume uuid;
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

  v_volume := nullif(p_patch ->> 'catalog_volume_id', '')::uuid;
  IF v_volume IS NOT NULL AND NOT platform_private.catalog_regulatory_volume_is_global(p_dossier_id, v_volume) THEN
    RAISE EXCEPTION 'REGULATORY_CATALOG_VOLUME_NOT_FOUND' USING ERRCODE = '22023';
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
END $function$;

COMMIT;
