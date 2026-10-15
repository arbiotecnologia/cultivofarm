CREATE OR REPLACE FUNCTION public.rpc_regulatory_dossier_ensure_draft(p_microorganism_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
END $function$;
