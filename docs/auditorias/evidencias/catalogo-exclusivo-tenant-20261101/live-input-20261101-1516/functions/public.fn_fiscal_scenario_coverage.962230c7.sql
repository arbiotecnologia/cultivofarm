CREATE OR REPLACE FUNCTION public.fn_fiscal_scenario_coverage()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  emit public.company_fiscal_settings%ROWTYPE;
  sc record; total int := 0; covered int := 0;
  gaps jsonb := '[]'::jsonb; ref_date date := current_date;
  ok boolean; k text; kinds text[]; code text; msg text;
  rule public.fiscal_tax_rules%ROWTYPE;
  ctx jsonb; res jsonb;
  v_icms numeric; v_ipi numeric; v_st numeric; v_base_st numeric;
  n_micro_active int; n_micro_ready int; n_micro_draft int;
  n_micro_blocked int; n_micro_inactive int;
  n_ncm int; n_recip int; n_channel int;
BEGIN
  PERFORM public.h15_require_staff();

  SELECT * INTO emit FROM (SELECT * FROM public.company_fiscal_settings WHERE organization_id = public.h15_actor_organization()) company_fiscal_settings WHERE is_active ORDER BY updated_at DESC LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('total',0,'covered',0,'gaps',
      jsonb_build_array(jsonb_build_object('code','EMITTER_NOT_CONFIGURED','scope','EMITENTE')));
  END IF;

  -- Inventário de microrganismos: ativos, prontos, rascunhos, bloqueados, inativos.
  SELECT count(*) FILTER (WHERE coalesce(m.ativo,true)),
         count(*) FILTER (WHERE NOT coalesce(m.ativo,true))
    INTO n_micro_active, n_micro_inactive
    FROM public.microrganismos m;

  SELECT
    count(*) FILTER (WHERE coalesce(p.profile_status,'DRAFT') = 'VALIDATED'
                       AND p.accounting_validated_at IS NOT NULL
                       AND coalesce(p.is_active,false)),
    count(*) FILTER (WHERE coalesce(p.profile_status,'DRAFT') = 'BLOCKED')
    INTO n_micro_ready, n_micro_blocked
    FROM public.microorganism_fiscal_profiles p
    JOIN public.microrganismos m ON m.id = p.microorganism_id
   WHERE coalesce(m.ativo,true);

  n_micro_ready   := coalesce(n_micro_ready,0);
  n_micro_blocked := coalesce(n_micro_blocked,0);
  n_micro_draft   := greatest(coalesce(n_micro_active,0) - n_micro_ready - n_micro_blocked, 0);

  -- Cenários reais: destinatário pronto × canal realmente usado × NCM oficial vigente.
  -- Nenhum cenário artificial com NCM NULL; nenhum produto cartesiano irrelevante.
  FOR sc IN
    WITH recipients AS (
      SELECT DISTINCT
             p.customer_id,
             upper(coalesce(p.fiscal_state, emit.state)) AS dest_uf,
             coalesce(p.final_consumer,true) AS final_consumer,
             coalesce(p.taxpayer_indicator,'9') AS ind
        FROM public.customer_fiscal_profiles p
       WHERE p.nfe_readiness_status = 'READY'
    ),
    channels AS (
      SELECT DISTINCT coalesce(fi.sales_channel,'B2B_PARTNER') AS channel
        FROM (SELECT * FROM public.fiscal_invoices WHERE public.h15_company_access(company_settings_id)) fi
       WHERE fi.document_model = 'NFE'
      UNION
      SELECT 'B2B_PARTNER'
    ),
    ncms AS (
      SELECT DISTINCT public.fn_fiscal_digits(mp.ncm) AS ncm
        FROM public.microorganism_fiscal_profiles mp
        JOIN public.microrganismos m ON m.id = mp.microorganism_id
       WHERE coalesce(m.ativo,true)
         AND coalesce(mp.is_active,false)
         AND coalesce(mp.profile_status,'DRAFT') = 'VALIDATED'
         AND mp.accounting_validated_at IS NOT NULL
         AND nullif(btrim(coalesce(mp.ncm,'')),'') IS NOT NULL
         AND EXISTS (
           SELECT 1 FROM public.microorganism_regulatory_dossiers d
            WHERE d.microorganism_id = m.id
              AND d.deleted_at IS NULL
              AND d.status = 'VALIDATED'
              AND coalesce(d.effective_from, current_date) <= current_date
              AND (d.effective_to IS NULL OR d.effective_to >= current_date)
              AND nullif(btrim(coalesce(d.published_ncm,'')),'') IS NOT NULL)
    )
    SELECT r.dest_uf, r.final_consumer, r.ind, c.channel, n.ncm
      FROM recipients r CROSS JOIN channels c CROSS JOIN ncms n
  LOOP
    total := total + 1;
    ok := true;

    -- Política de operação
    BEGIN
      PERFORM public.fn_fiscal_resolve_operation('OUT', emit.state, sc.dest_uf, emit.crt,
        sc.final_consumer, sc.ind, sc.ncm, null, sc.channel, ref_date);
    EXCEPTION WHEN OTHERS THEN
      msg := coalesce(SQLERRM,'');
      code := CASE WHEN msg LIKE '%AMBIGUOUS%' THEN 'AMBIGUOUS' ELSE 'NOT_FOUND' END;
      ok := false;
      gaps := gaps || jsonb_build_object('scope','OPERACAO','destUf',sc.dest_uf,
        'finalConsumer',sc.final_consumer,'indIEDest',sc.ind,'channel',sc.channel,
        'ncm',sc.ncm,'code',code);
    END;

    kinds := ARRAY['ICMS']::text[];
    IF coalesce(emit.ipi_taxpayer,false) THEN kinds := array_append(kinds,'IPI'); END IF;
    IF coalesce(emit.icms_st_responsible,false) THEN kinds := array_append(kinds,'ICMS_ST'); END IF;
    IF coalesce(emit.fcp_applicable,false) THEN
      kinds := array_append(kinds,'FCP');
      IF coalesce(emit.icms_st_responsible,false) THEN kinds := array_append(kinds,'FCP_ST'); END IF;
    END IF;
    IF coalesce(emit.difal_responsible,false) AND sc.dest_uf <> upper(coalesce(emit.state,''))
       AND sc.final_consumer THEN kinds := array_append(kinds,'DIFAL'); END IF;
    kinds := kinds || ARRAY['PIS','COFINS']::text[];

    -- Contexto sintético NEUTRO, encadeado como no motor real. Sem persistência.
    v_icms := 0; v_ipi := 0; v_st := 0; v_base_st := NULL;

    FOREACH k IN ARRAY kinds LOOP
      code := NULL;
      BEGIN
        rule := public.fn_fiscal_resolve_tax_rule(k, emit.crt, emit.state, sc.dest_uf,
          sc.ncm, null, sc.final_consumer, sc.ind, ref_date);
      EXCEPTION WHEN OTHERS THEN
        msg := coalesce(SQLERRM,'');
        code := CASE
          WHEN msg LIKE '%ENGINE_UNAVAILABLE%' THEN 'ENGINE_UNAVAILABLE'
          WHEN msg LIKE '%AMBIGUOUS%'          THEN 'AMBIGUOUS'
          WHEN msg LIKE '%NOT_FOUND%'          THEN 'NOT_FOUND'
          ELSE 'INCOMPLETE' END;
      END;

      IF code IS NULL THEN
        ctx := jsonb_build_object(
          'produto', 1000, 'frete', 0, 'seguro', 0, 'outras', 0, 'desconto', 0,
          'ipi', v_ipi, 'icmsSt', v_st, 'icmsOwnValue', v_icms, 'baseST', v_base_st);
        code := public.fn_fiscal_rule_validate_synthetic(k, rule, ctx);

        IF code = 'OK' THEN
          BEGIN
            res := public.fn_fiscal_apply_tax_v2(rule, ctx);
            IF k = 'ICMS'    THEN v_icms := (res->>'value')::numeric; END IF;
            IF k = 'IPI'     THEN v_ipi  := (res->>'value')::numeric; END IF;
            IF k = 'ICMS_ST' THEN
              v_st := (res->>'value')::numeric;
              v_base_st := (res->'params'->>'baseST')::numeric;
            END IF;
          EXCEPTION WHEN OTHERS THEN
            code := 'INCOMPLETE';
          END;
        END IF;
      END IF;

      IF code <> 'OK' THEN
        ok := false;
        gaps := gaps || jsonb_build_object('scope','TRIBUTO','taxKind',k,'destUf',sc.dest_uf,
          'channel',sc.channel,'ncm',sc.ncm,'code',code);
      END IF;
    END LOOP;

    IF ok THEN covered := covered + 1; END IF;
  END LOOP;

  SELECT count(DISTINCT customer_id) INTO n_recip
    FROM public.customer_fiscal_profiles WHERE nfe_readiness_status = 'READY';

  n_channel := (SELECT count(*) FROM (
                  SELECT DISTINCT coalesce(fi.sales_channel,'B2B_PARTNER') ch
                    FROM (SELECT * FROM public.fiscal_invoices WHERE public.h15_company_access(company_settings_id)) fi WHERE fi.document_model='NFE'
                  UNION SELECT 'B2B_PARTNER') q);

  n_ncm := CASE WHEN coalesce(n_recip,0) = 0 OR coalesce(n_channel,0) = 0
                THEN 0 ELSE total / greatest(n_recip * n_channel, 1) END;

  RETURN jsonb_build_object(
    'total', total, 'covered', covered,
    'dimensions', jsonb_build_object(
      'readyRecipients', coalesce(n_recip,0),
      'activeChannels', coalesce(n_channel,0),
      'officialNcms', coalesce(n_ncm,0)),
    'microorganisms', jsonb_build_object(
      'active', coalesce(n_micro_active,0),
      'ready', n_micro_ready,
      'draft', n_micro_draft,
      'blocked', n_micro_blocked,
      'inactive', coalesce(n_micro_inactive,0)),
    'gapCodes', jsonb_build_array('NOT_FOUND','AMBIGUOUS','INCOMPLETE','ENGINE_UNAVAILABLE'),
    'gaps', (SELECT coalesce(jsonb_agg(DISTINCT g),'[]'::jsonb) FROM jsonb_array_elements(gaps) g));
END $function$
