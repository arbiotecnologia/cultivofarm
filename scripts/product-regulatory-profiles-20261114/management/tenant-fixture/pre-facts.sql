CREATE OR REPLACE FUNCTION platform_private.product_dossier_facts(p_dossier_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH g AS (
    SELECT platform_private.product_dossier_row_read(p_dossier_id) AS ok
  ), d AS (
    SELECT * FROM public.microorganism_regulatory_dossiers
     WHERE id = p_dossier_id AND deleted_at IS NULL
       AND (SELECT ok FROM g)
     ORDER BY (status='VALIDATED') DESC, version DESC
     LIMIT 1)
  SELECT CASE WHEN NOT (SELECT ok FROM g) THEN NULL
              WHEN NOT EXISTS (SELECT 1 FROM d) THEN NULL ELSE (
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
      'has_label_document', EXISTS (SELECT 1 FROM public.microorganism_regulatory_documents x WHERE x.dossier_id=d.id AND x.deleted_at IS NULL AND x.doc_type='ROTULO'),
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
$function$;
