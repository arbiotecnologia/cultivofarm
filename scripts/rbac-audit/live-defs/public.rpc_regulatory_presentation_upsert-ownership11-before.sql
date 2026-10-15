CREATE OR REPLACE FUNCTION public.rpc_regulatory_presentation_upsert(p_dossier_id uuid, p_volume_ml integer, p_patch jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
END $function$
;
