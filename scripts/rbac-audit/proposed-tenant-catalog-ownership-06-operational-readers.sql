-- CANDIDATO 06 — NÃO APLICAR. Requer 01–05; gate permanece OFF.
-- Leitores operacionais global-only enquanto referências privadas estão bloqueadas pelo 04.
-- Hashes capturados read-only no canônico swzpzcwiasxmjutrmvkm em 2026-10-15.
BEGIN;
DO $$ BEGIN
  IF md5(pg_get_functiondef('public.fn_fiscal_scenario_coverage()'::regprocedure)) <> '962230c786b2dbab9c62d090923e4810' THEN RAISE EXCEPTION 'ownership06_fiscal_coverage_drift'; END IF;
  IF md5(pg_get_functiondef('public.rpc_fiscal_nfe_readiness_v1()'::regprocedure)) <> '75487176d377f5bf096f658ad47587e4' THEN RAISE EXCEPTION 'ownership06_fiscal_readiness_drift'; END IF;
  IF md5(pg_get_functiondef('public.rpc_microorganism_regulatory_overview()'::regprocedure)) <> 'a5763623af22befd1a60df8b04636e5d' THEN RAISE EXCEPTION 'ownership06_regulatory_overview_drift'; END IF;
END $$;

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
    FROM public.microrganismos m
   WHERE m.owner_organization_id IS NULL;

  SELECT
    count(*) FILTER (WHERE coalesce(p.profile_status,'DRAFT') = 'VALIDATED'
                       AND p.accounting_validated_at IS NOT NULL
                       AND coalesce(p.is_active,false)),
    count(*) FILTER (WHERE coalesce(p.profile_status,'DRAFT') = 'BLOCKED')
    INTO n_micro_ready, n_micro_blocked
    FROM public.microorganism_fiscal_profiles p
    JOIN public.microrganismos m ON m.id = p.microorganism_id
   WHERE coalesce(m.ativo,true) AND m.owner_organization_id IS NULL;

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
         AND m.owner_organization_id IS NULL
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
END $function$;


CREATE OR REPLACE FUNCTION public.rpc_fiscal_nfe_readiness_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  emit public.company_fiscal_settings%ROWTYPE;
  rec_total int; rec_ready int; pol_pub int; rules_pub int; series_cnt int;
  cert_ok boolean; pend jsonb := '[]'::jsonb;
  cov jsonb; micro jsonb;
  m_active int; m_ready int; m_draft int; m_blocked int; m_inactive int;
  emitter_status text; overall text;
BEGIN
  PERFORM public.h15_require_staff();

  IF NOT public.fn_fiscal_can_read_internal() THEN
    RAISE EXCEPTION 'FISCAL_FORBIDDEN: perfil sem permissao de leitura fiscal.';
  END IF;

  SELECT * INTO emit FROM (SELECT * FROM public.company_fiscal_settings WHERE organization_id = public.h15_actor_organization()) company_fiscal_settings WHERE is_active ORDER BY updated_at DESC LIMIT 1;
  SELECT count(*), count(*) FILTER (WHERE nfe_readiness_status = 'READY')
    INTO rec_total, rec_ready FROM public.customer_fiscal_profiles;
  SELECT count(*) INTO pol_pub FROM public.fiscal_operation_policies
   WHERE policy_status = 'PUBLISHED' AND document_model = '55';
  SELECT count(*) INTO rules_pub FROM public.fiscal_tax_rules WHERE status = 'PUBLISHED';
  SELECT count(*) INTO series_cnt FROM (SELECT * FROM public.fiscal_document_series WHERE public.h15_company_access(company_id)) fiscal_document_series WHERE status = 'ACTIVE';
  cert_ok := EXISTS (SELECT 1 FROM public.fiscal_certificates c
    WHERE c.id::text = emit.certificate_ref AND c.company_settings_id = emit.id
      AND c.environment = 'HOMOLOGATION' AND c.status = 'AVAILABLE'
      AND c.is_active IS TRUE AND c.revoked_at IS NULL
      AND c.valid_from <= now() AND c.valid_until > now());

  cov := public.fn_fiscal_scenario_coverage();
  micro := coalesce(cov->'microorganisms','{}'::jsonb);
  m_active   := coalesce((micro->>'active')::int,0);
  m_ready    := coalesce((micro->>'ready')::int,0);
  m_draft    := coalesce((micro->>'draft')::int,0);
  m_blocked  := coalesce((micro->>'blocked')::int,0);
  m_inactive := coalesce((micro->>'inactive')::int,0);

  -- Teto absoluto da F3: nunca READY_PRODUCTION.
  emitter_status := coalesce(emit.nfe_readiness_status,'NOT_READY');
  IF NOT cert_ok OR emitter_status = 'READY_PRODUCTION' THEN
    emitter_status := 'NOT_READY';
  END IF;
  IF coalesce(emit.nfe_environment_code,'2') = '1' THEN
    pend := pend || jsonb_build_object('section','HOMOLOGACAO','code','EMITTER_PRODUCTION_BLOCKED_F3',
      'severity','BLOCK','message','Ambiente de producao (tpAmb=1) bloqueado nesta fase. Teto: READY_HOMOLOGATION.');
  END IF;
  IF emit.id IS NOT NULL AND emit.sefaz_homologation_at IS NULL THEN
    pend := pend || jsonb_build_object('section','HOMOLOGACAO','code','SEFAZ_HOMOLOGATION_NOT_RECORDED',
      'severity','WARN','message','Homologacao SEFAZ ainda nao registrada. A transicao so ocorrera por RPC controlada em fase posterior.');
  END IF;

  IF emit.id IS NULL THEN
    pend := pend || jsonb_build_object('section','EMITENTE','code','EMITTER_NOT_CONFIGURED','severity','BLOCK','message','Emitente nao cadastrado.');
  ELSE
    pend := pend || coalesce((SELECT jsonb_agg(e || jsonb_build_object('section','EMITENTE'))
                              FROM jsonb_array_elements(emit.nfe_readiness_pendencies) e), '[]'::jsonb);
  END IF;

  IF rec_total = 0 THEN
    pend := pend || jsonb_build_object('section','DESTINATARIOS','code','RECIPIENTS_NONE','severity','BLOCK','message','Nenhum perfil fiscal de destinatario cadastrado.');
  ELSIF rec_ready = 0 THEN
    pend := pend || jsonb_build_object('section','DESTINATARIOS','code','RECIPIENTS_NONE_READY','severity','BLOCK','message','Nenhum destinatario com cadastro fiscal completo.');
  END IF;

  IF pol_pub = 0 THEN
    pend := pend || jsonb_build_object('section','OPERACOES','code','OPERATION_POLICIES_NONE','severity','BLOCK','message','Nenhuma politica de operacao/CFOP publicada para modelo 55.');
  END IF;

  IF coalesce((cov->>'total')::int,0) = 0 THEN
    pend := pend || jsonb_build_object('section','TRIBUTOS','code','COVERAGE_NO_SCENARIOS','severity','BLOCK',
      'message','Nao ha cenarios reais (destinatario pronto x canal ativo x NCM oficial) para aferir cobertura tributaria.');
  ELSIF (cov->>'covered')::int < (cov->>'total')::int THEN
    pend := pend || jsonb_build_object('section','TRIBUTOS','code','COVERAGE_INCOMPLETE','severity','BLOCK',
      'message','Cobertura tributaria incompleta: '||(cov->>'covered')||' de '||(cov->>'total')||' cenarios validados no motor.');
  END IF;

  -- Somente microrganismos ATIVOS podem bloquear. Inativos sao informativos.
  IF m_blocked > 0 THEN
    pend := pend || jsonb_build_object('section','TRIBUTOS','code','MICROORGANISMS_BLOCKED','severity','BLOCK',
      'message', m_blocked||' microrganismo(s) ativo(s) com perfil fiscal BLOQUEADO.');
  END IF;
  IF m_draft > 0 THEN
    pend := pend || jsonb_build_object('section','TRIBUTOS','code','MICROORGANISMS_NOT_READY','severity','BLOCK',
      'message', m_draft||' de '||m_active||' microrganismos ativos sem dossie aprovado e validacao contabil.');
  END IF;

  IF NOT cert_ok THEN
    pend := pend || jsonb_build_object('section','CERTIFICADO','code','CERTIFICATE_MISSING','severity','BLOCK','message','Certificado ausente, indisponivel, revogado, vencido ou de outra empresa.');
  END IF;
  IF series_cnt = 0 THEN
    pend := pend || jsonb_build_object('section','HOMOLOGACAO','code','SERIES_NOT_INITIALIZED','severity','WARN','message','Nenhuma serie de numeracao inicializada; sera criada na primeira reserva.');
  END IF;

  overall := CASE
    WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(pend) e WHERE e->>'severity'='BLOCK') THEN 'NOT_READY'
    WHEN jsonb_array_length(pend) > 0 THEN 'PARTIAL'
    ELSE 'READY_HOMOLOGATION' END;

  RETURN jsonb_build_object(
    'generatedAt', to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SSZ'),
    'documentModel','55',
    'maxAllowedStatus','READY_HOMOLOGATION',
    'emitter', jsonb_build_object(
      'configured', emit.id IS NOT NULL,
      'status', emitter_status,
      'crt', emit.crt, 'uf', emit.state,
      'series', emit.nfe_series_number, 'environment', emit.nfe_environment_code,
      'certificateLinked', cert_ok,
      'sefazHomologationRecorded', emit.sefaz_homologation_at IS NOT NULL,
      'productionBlocked', true,
      'accountingValidated', emit.accounting_validated_at IS NOT NULL),
    'recipients', jsonb_build_object('total', rec_total, 'ready', rec_ready),
    'operations', jsonb_build_object('publishedPolicies', pol_pub),
    'taxes', jsonb_build_object('publishedRules', rules_pub, 'missingMandatoryKinds', '[]'::jsonb),
    'coverage', cov,
    'microorganisms', jsonb_build_object(
      'active', m_active, 'ready', m_ready, 'draft', m_draft,
      'blocked', m_blocked, 'inactive', m_inactive,
      'total', m_active + m_inactive),
    'numbering', jsonb_build_object('activeSeries', series_cnt),
    'pendencies', pend,
    'overallStatus', overall);
END $function$;


CREATE OR REPLACE FUNCTION public.rpc_microorganism_regulatory_overview()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $fn$
DECLARE v jsonb;
BEGIN
  IF NOT public.fn_regulatory_can_read() THEN RAISE EXCEPTION 'REGULATORY_FORBIDDEN' USING ERRCODE='42501'; END IF;
  SELECT coalesce(jsonb_agg(x ORDER BY x->>'codigo'),'[]'::jsonb) INTO v FROM (
    SELECT jsonb_build_object('microorganism_id',m.id,'codigo',m.codigo,'nome',m.nome,'tipo',m.tipo,'ativo',m.ativo,
      'concentracao_label',m.concentracao_label,'facts',f.facts,
      'checklist_total',coalesce((f.facts->>'checklist_total')::int,0),
      'checklist_confirmed',coalesce((f.facts->>'checklist_confirmed')::int,0),
      'checklist_pending',coalesce(jsonb_array_length(coalesce(f.facts->'checklist_pending','[]'::jsonb)),0),
      'progress_pct',CASE WHEN coalesce((f.facts->>'checklist_total')::int,0)=0 THEN 0 ELSE round(100.0*(coalesce((f.facts->>'checklist_total')::int,0)-jsonb_array_length(coalesce(f.facts->'checklist_pending','[]'::jsonb)))/coalesce((f.facts->>'checklist_total')::int,1)) END,
      'dossier_status',coalesce(f.facts->>'status','NONE'),'profile_status',r.profile_status,
      'fiscally_ready',coalesce(r.fiscally_ready,false),'technical_ready',coalesce(r.minimally_classified,false),
      'regulatory_ready',coalesce(r.regulatory_ready,false),'quarantined',coalesce(r.quarantined,false),
      'pendencies',coalesce(r.pendencies,'[]'::jsonb),'not_applicable',coalesce(r.not_applicable,'[]'::jsonb)) AS x
    FROM public.microrganismos m
    LEFT JOIN public.v_microorganism_fiscal_readiness r ON r.microorganism_id=m.id
    CROSS JOIN LATERAL (SELECT public.fn_microorganism_regulatory_facts(m.id) AS facts) f
    WHERE m.ativo AND m.owner_organization_id IS NULL
  ) s; RETURN v;
END $fn$;

-- Sete views que tocam roots/descendentes do catálogo. As 3 comerciais não projetam roots: parent autorizado
-- pelas RLS das tabelas comerciais; preservadas byte-semanticamente com security_invoker.
DO $$ DECLARE r record; BEGIN FOR r IN SELECT * FROM (VALUES
 ('v_microorganism_fiscal_readiness','be3f247cb0d79514336759e4117ac0ba'),
 ('vw_bi_commercial_campaigns','23b0873940b080cdcbb75a4d851704ff'),
 ('vw_bi_commercial_engagement','48392cfff0a5b9b0075d3827ca25397a'),
 ('vw_bi_commercial_revenue','297b9932f8c92f91c0fbc4f7a1ccedfe'),
 ('vw_bi_estoque_produto','054a615aa894d8c6771efffa70e30248'),
 ('vw_bi_movimentacoes','4530d450cf23994637f6eccd137287b9'),
 ('v_product_fiscal_readiness','af802dc9f89a108b25ad07856b6cb30c')
 ) v(n,h) LOOP SELECT viewname,md5(definition) INTO r FROM pg_views WHERE schemaname='public' AND viewname=r.n; IF r.md5 IS DISTINCT FROM r.h THEN RAISE EXCEPTION 'ownership06_view_drift: %',r.n; END IF; END LOOP; END $$;

CREATE OR REPLACE VIEW public.v_product_fiscal_readiness WITH (security_invoker=true) AS
SELECT sel.product_id,sel.id profile_id,sel.profile_status,sel.is_active profile_is_active,
 (g.gate->>'technical_ready')::boolean minimally_classified,sel.accounting_validated_at IS NOT NULL accounting_validated,
 (g.gate->>'quarantined')::boolean quarantined,(g.gate->>'ready')::boolean fiscally_ready,g.gate->'pendencies' pendencies,g.gate
FROM (SELECT DISTINCT ON (pf.product_id) pf.* FROM public.product_fiscal_profiles pf JOIN public.produtos p ON p.id=pf.product_id
 WHERE p.owner_organization_id IS NULL ORDER BY pf.product_id,(pf.is_active AND pf.profile_status='VALIDATED') DESC,pf.is_active DESC,pf.updated_at DESC NULLS LAST,pf.created_at DESC NULLS LAST,pf.id DESC) sel
CROSS JOIN LATERAL (SELECT public.fn_fiscal_item_profile_gate_eval('PRODUCT',public.fn_fiscal_company_crt(),sel.is_active,sel.profile_status,sel.accounting_validated_at,sel.accounting_notes,sel.fiscal_description,sel.commercial_unit,sel.taxable_unit,sel.ncm,sel.origin_code,sel.cfop_in_state,sel.cfop_interstate,sel.icms_cst,sel.icms_csosn,sel.pis_cst,sel.cofins_cst,NULL::jsonb) gate) g;

CREATE OR REPLACE VIEW public.v_microorganism_fiscal_readiness WITH (security_invoker=true) AS
SELECT m.id microorganism_id,m.codigo,m.nome,m.ativo,sel.id profile_id,sel.profile_status,sel.is_active profile_is_active,
 (g.gate->>'ready')::boolean fiscally_ready,(g.gate->>'technical_ready')::boolean minimally_classified,(g.gate->>'regulatory_ready')::boolean regulatory_ready,
 sel.accounting_validated_at IS NOT NULL accounting_validated,(g.gate->>'quarantined')::boolean quarantined,reg.facts->'dossier_id' dossier_id,
 reg.facts->>'status' dossier_status,g.gate->'pendencies' pendencies,g.gate->'not_applicable' not_applicable,g.gate
FROM public.microrganismos m LEFT JOIN LATERAL (SELECT mfp.* FROM public.microorganism_fiscal_profiles mfp WHERE mfp.microorganism_id=m.id ORDER BY (mfp.is_active AND mfp.profile_status='VALIDATED') DESC,mfp.is_active DESC,mfp.updated_at DESC NULLS LAST,mfp.created_at DESC NULLS LAST,mfp.id DESC LIMIT 1) sel ON true
CROSS JOIN LATERAL (SELECT public.fn_microorganism_regulatory_facts(m.id) facts) reg
CROSS JOIN LATERAL (SELECT public.fn_fiscal_item_profile_gate_eval('MICROORGANISM',public.fn_fiscal_company_crt(),sel.is_active,sel.profile_status,sel.accounting_validated_at,sel.accounting_notes,sel.fiscal_description,sel.commercial_unit,sel.taxable_unit,sel.ncm,sel.origin_code,sel.cfop_in_state,sel.cfop_interstate,sel.icms_cst,sel.icms_csosn,sel.pis_cst,sel.cofins_cst,reg.facts) gate) g
WHERE m.owner_organization_id IS NULL;

CREATE OR REPLACE VIEW public.vw_bi_commercial_revenue WITH (security_invoker=on) AS SELECT date_trunc('month',po.created_at)::date mes,pa.id partner_id,pa.razao_social,pa.commercial_region,pa.partner_type,count(po.id) qtd_pedidos,coalesce(sum(po.total),0) receita_total,coalesce(sum(po.total) FILTER(WHERE po.status::text IN ('aprovado','em_producao','pronto_entrega','entregue','faturado')),0) receita_aprovada,coalesce(sum(po.total) FILTER(WHERE po.status::text='faturado'),0) receita_faturada FROM public.partner_orders po JOIN public.partner_accounts pa ON pa.id=po.partner_id GROUP BY 1,2,3,4,5;
CREATE OR REPLACE VIEW public.vw_bi_commercial_engagement WITH (security_invoker=on) AS SELECT pa.id partner_id,pa.razao_social,pa.partner_type,pa.commercial_region,pem.ultima_compra,pem.dias_sem_compra,pem.pedidos_30d,pem.pedidos_90d FROM public.partner_accounts pa LEFT JOIN public.partner_engagement_metrics pem ON pem.partner_id=pa.id;
CREATE OR REPLACE VIEW public.vw_bi_commercial_campaigns WITH (security_invoker=on) AS SELECT c.id,c.nome,c.data_inicio,c.data_fim,c.ativa,(SELECT count(*) FROM public.commercial_campaign_partners cp WHERE cp.campaign_id=c.id) qtd_parceiros,(SELECT count(*) FROM public.commercial_campaign_products cpp JOIN public.produtos p ON p.id=cpp.product_id AND p.owner_organization_id IS NULL WHERE cpp.campaign_id=c.id) qtd_produtos FROM public.commercial_campaigns c;
CREATE OR REPLACE VIEW public.vw_bi_estoque_produto WITH (security_invoker=true) AS SELECT ep.id,ep.produto_id,l.microrganismo_id,p.nome nome_produto,m.nome nome_microrganismo,coalesce(ep.volume_total,0) volume_total,round(coalesce(ep.volume_total,0)/1000.0,4) volume_total_l,ep.updated_at FROM public.estoque_produto ep LEFT JOIN public.produtos p ON ep.produto_id=p.id AND p.owner_organization_id IS NULL LEFT JOIN public.lotes l ON ep.lote_id=l.id LEFT JOIN public.microrganismos m ON l.microrganismo_id=m.id AND m.owner_organization_id IS NULL;
CREATE OR REPLACE VIEW public.vw_bi_movimentacoes WITH (security_invoker=true) AS SELECT em.id,em.estoque_produto_id,em.acao tipo_movimentacao,em.quantidade volume_alteracao,em.status_anterior volume_anterior,em.status_novo volume_novo,em.observacao motivo,em.created_at,ep.produto_id,l.microrganismo_id FROM public.estoque_movimentacoes em LEFT JOIN public.estoque_produto ep ON em.estoque_produto_id=ep.id LEFT JOIN public.produtos p ON p.id=ep.produto_id AND p.owner_organization_id IS NULL LEFT JOIN public.lotes l ON ep.lote_id=l.id LEFT JOIN public.microrganismos m ON m.id=l.microrganismo_id AND m.owner_organization_id IS NULL WHERE (ep.produto_id IS NULL OR p.id IS NOT NULL) AND (l.microrganismo_id IS NULL OR m.id IS NOT NULL);

DO $$ BEGIN IF platform_private.catalog_ownership_enabled() THEN RAISE EXCEPTION 'ownership06_gate_must_remain_off'; END IF; END $$;
COMMIT;
