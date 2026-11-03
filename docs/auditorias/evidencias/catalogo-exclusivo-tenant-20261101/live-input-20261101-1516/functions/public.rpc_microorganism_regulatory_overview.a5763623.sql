CREATE OR REPLACE FUNCTION public.rpc_microorganism_regulatory_overview()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
END $function$
