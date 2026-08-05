-- =====================================================================
-- FASE F3 — POSTCHECK ESTRUTURAL (somente leitura; transação revertida)
-- Ambiente: STAGING ikaauvsflpmamgxmkhoq
-- =====================================================================
BEGIN;

DO $$
DECLARE
  g int := 0;
  ok boolean;
  n int;
  t text;

  PROCEDURE_STUB text := NULL;
BEGIN
  -- ---------- FONTES OFICIAIS ----------
  SELECT count(*) INTO n FROM public.fiscal_official_sources
   WHERE source_key IN ('MOC_NFE_70','PORTAL_NFE_SCHEMAS_NT','PORTAL_NFE_SERVICOS_UF','RFB_NCM_TIPI','GUIA_EFD_ICMS_IPI_322')
     AND is_active;
  IF n <> 5 THEN RAISE EXCEPTION 'GATE 1 FAIL: fontes oficiais F3 esperadas=5 obtidas=%', n; END IF; g := g+1;

  SELECT bool_and(public.fn_fiscal_official_url_allowlisted(url)) INTO ok
    FROM public.fiscal_official_sources
   WHERE source_key IN ('MOC_NFE_70','PORTAL_NFE_SCHEMAS_NT','PORTAL_NFE_SERVICOS_UF','RFB_NCM_TIPI','GUIA_EFD_ICMS_IPI_322');
  IF NOT ok THEN RAISE EXCEPTION 'GATE 2 FAIL: fonte oficial fora do dominio gov.br'; END IF; g := g+1;

  -- ---------- VALIDADORES ----------
  IF NOT public.fn_fiscal_cnpj_is_valid('11.222.333/0001-81') THEN RAISE EXCEPTION 'GATE 3 FAIL: CNPJ valido rejeitado'; END IF; g := g+1;
  IF public.fn_fiscal_cnpj_is_valid('11.222.333/0001-82') THEN RAISE EXCEPTION 'GATE 4 FAIL: CNPJ invalido aceito'; END IF; g := g+1;
  IF public.fn_fiscal_cnpj_is_valid('11111111111111') THEN RAISE EXCEPTION 'GATE 5 FAIL: CNPJ repetido aceito'; END IF; g := g+1;
  IF NOT public.fn_fiscal_cpf_is_valid('529.982.247-25') THEN RAISE EXCEPTION 'GATE 6 FAIL: CPF valido rejeitado'; END IF; g := g+1;
  IF public.fn_fiscal_cpf_is_valid('529.982.247-24') THEN RAISE EXCEPTION 'GATE 7 FAIL: CPF invalido aceito'; END IF; g := g+1;

  IF public.fn_fiscal_uf_ibge_code('GO') <> '52' THEN RAISE EXCEPTION 'GATE 8 FAIL: codigo IBGE de GO incorreto'; END IF; g := g+1;
  IF public.fn_fiscal_uf_ibge_code('XX') IS NOT NULL THEN RAISE EXCEPTION 'GATE 9 FAIL: UF inexistente aceita'; END IF; g := g+1;
  SELECT count(*) INTO n FROM (SELECT unnest(ARRAY['RO','AC','AM','RR','PA','AP','TO','MA','PI','CE','RN','PB','PE','AL','SE','BA','MG','ES','RJ','SP','PR','SC','RS','MS','MT','GO','DF']) u) s
   WHERE public.fn_fiscal_uf_ibge_code(s.u) IS NOT NULL;
  IF n <> 27 THEN RAISE EXCEPTION 'GATE 10 FAIL: tabela de UF incompleta (%/27)', n; END IF; g := g+1;

  IF NOT public.fn_fiscal_ibge_municipio_coerente('5208707','GO') THEN RAISE EXCEPTION 'GATE 11 FAIL: cMun coerente rejeitado'; END IF; g := g+1;
  IF public.fn_fiscal_ibge_municipio_coerente('3550308','GO') THEN RAISE EXCEPTION 'GATE 12 FAIL: cMun de outra UF aceito'; END IF; g := g+1;
  IF public.fn_fiscal_ibge_municipio_coerente('52087','GO') THEN RAISE EXCEPTION 'GATE 13 FAIL: cMun com 5 digitos aceito'; END IF; g := g+1;
  IF NOT public.fn_fiscal_cep_is_valid('74000-000') THEN RAISE EXCEPTION 'GATE 14 FAIL: CEP valido rejeitado'; END IF; g := g+1;
  IF public.fn_fiscal_cep_is_valid('7400-000') THEN RAISE EXCEPTION 'GATE 15 FAIL: CEP invalido aceito'; END IF; g := g+1;

  IF public.fn_fiscal_ie_check('GO','') <> 'MISSING' THEN RAISE EXCEPTION 'GATE 16 FAIL: IE ausente nao sinalizada'; END IF; g := g+1;
  IF public.fn_fiscal_ie_check('GO','ISENTO') <> 'ISENTO' THEN RAISE EXCEPTION 'GATE 17 FAIL: IE ISENTO nao reconhecida'; END IF; g := g+1;
  IF public.fn_fiscal_ie_check('GO','1234') <> 'INVALID_LENGTH' THEN RAISE EXCEPTION 'GATE 18 FAIL: IE curta aceita'; END IF; g := g+1;
  IF public.fn_fiscal_ie_check('AM','123456789') <> 'VALID_LENGTH_DV_NOT_IMPLEMENTED' THEN
    RAISE EXCEPTION 'GATE 19 FAIL: UF sem DV implementado deveria retornar estado explicito'; END IF; g := g+1;
  IF public.fn_fiscal_ie_check('XX','123456789') <> 'INVALID_UF' THEN RAISE EXCEPTION 'GATE 20 FAIL: UF invalida na IE'; END IF; g := g+1;

  -- ---------- CHAVE DE ACESSO ----------
  IF public.fn_fiscal_access_key_dv(repeat('1',43)) IS NULL THEN RAISE EXCEPTION 'GATE 21 FAIL: DV da chave nao calculado'; END IF; g := g+1;
  BEGIN
    PERFORM public.fn_fiscal_access_key_dv(repeat('1',40));
    RAISE EXCEPTION 'GATE 22 FAIL: chave com tamanho errado aceita';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'FISCAL_ACCESS_KEY_LENGTH%' THEN RAISE; END IF;
  END; g := g+1;

  -- ---------- EMITENTE ----------
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_schema='public' AND table_name='company_fiscal_settings'
     AND column_name IN ('nfe_series_number','nfe_environment_code','uf_accreditations','pis_cofins_regime',
                         'ipi_taxpayer','icms_st_responsible','fcp_applicable','difal_responsible',
                         'rtc_scaffolding_enabled','nfe_readiness_status','nfe_readiness_pendencies');
  IF n <> 11 THEN RAISE EXCEPTION 'GATE 23 FAIL: colunas do emitente incompletas (%/11)', n; END IF; g := g+1;

  SELECT count(*) INTO n FROM pg_constraint
   WHERE conname IN ('cfs_nfe_series_number_range','cfs_nfe_environment_code_domain','cfs_crt_domain',
                     'cfs_pis_cofins_regime_domain','cfs_nfe_readiness_domain');
  IF n <> 5 THEN RAISE EXCEPTION 'GATE 24 FAIL: constraints do emitente incompletas (%/5)', n; END IF; g := g+1;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_fiscal_emitter_readiness') THEN
    RAISE EXCEPTION 'GATE 25 FAIL: trigger de prontidao do emitente ausente'; END IF; g := g+1;

  -- Placeholder AR BIO HML permanece NOT_READY.
  SELECT nfe_readiness_status INTO t FROM public.company_fiscal_settings WHERE is_active ORDER BY updated_at DESC LIMIT 1;
  IF t <> 'NOT_READY' THEN RAISE EXCEPTION 'GATE 26 FAIL: emitente placeholder deveria permanecer NOT_READY (obtido %)', t; END IF; g := g+1;
  SELECT jsonb_array_length(nfe_readiness_pendencies) INTO n FROM public.company_fiscal_settings WHERE is_active ORDER BY updated_at DESC LIMIT 1;
  IF n = 0 THEN RAISE EXCEPTION 'GATE 27 FAIL: emitente placeholder sem pendencias listadas'; END IF; g := g+1;

  -- ---------- DESTINATARIO ----------
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_schema='public' AND table_name='customer_fiscal_profiles'
     AND column_name IN ('person_type','cpf_cnpj','legal_name','state_registration','final_consumer',
                         'icms_taxpayer','nfe_readiness_status','nfe_readiness_pendencies');
  IF n <> 8 THEN RAISE EXCEPTION 'GATE 28 FAIL: colunas do destinatario incompletas (%/8)', n; END IF; g := g+1;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_fiscal_recipient_readiness') THEN
    RAISE EXCEPTION 'GATE 29 FAIL: trigger de prontidao do destinatario ausente'; END IF; g := g+1;

  -- ---------- OPERACAO ----------
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_schema='public' AND table_name='fiscal_operation_policies'
     AND column_name IN ('direction','fin_nfe','nature_operation','presence_indicator','final_consumer',
                         'taxpayer_indicator','origin_uf','destination_uf','cfop','crt','ncm_prefix',
                         'product_category','priority','source_id','policy_status');
  IF n <> 15 THEN RAISE EXCEPTION 'GATE 30 FAIL: colunas de operacao incompletas (%/15)', n; END IF; g := g+1;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fop_published_requires_evidence') THEN
    RAISE EXCEPTION 'GATE 31 FAIL: politica publicada sem exigencia de evidencia'; END IF; g := g+1;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_fiscal_operation_policy_immutable') THEN
    RAISE EXCEPTION 'GATE 32 FAIL: imutabilidade de politica publicada ausente'; END IF; g := g+1;

  -- ---------- REGRAS TRIBUTARIAS ----------
  IF to_regclass('public.fiscal_tax_rules') IS NULL THEN RAISE EXCEPTION 'GATE 33 FAIL: fiscal_tax_rules ausente'; END IF; g := g+1;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ftr_published_requires_evidence') THEN
    RAISE EXCEPTION 'GATE 34 FAIL: regra publicada sem exigencia de fonte/base legal'; END IF; g := g+1;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_fiscal_tax_rule_immutable') THEN
    RAISE EXCEPTION 'GATE 35 FAIL: imutabilidade de regra publicada ausente'; END IF; g := g+1;
  -- Nenhuma regra tributaria foi semeada: nada e inventado.
  SELECT count(*) INTO n FROM public.fiscal_tax_rules;
  IF n <> 0 THEN RAISE EXCEPTION 'GATE 36 FAIL: a migration nao pode semear regras tributarias (obtidas %)', n; END IF; g := g+1;

  -- ---------- NUMERACAO ----------
  IF to_regclass('public.fiscal_document_series') IS NULL THEN RAISE EXCEPTION 'GATE 37 FAIL: series ausentes'; END IF; g := g+1;
  IF to_regclass('public.fiscal_number_reservations') IS NULL THEN RAISE EXCEPTION 'GATE 38 FAIL: reservas ausentes'; END IF; g := g+1;
  SELECT count(*) INTO n FROM pg_constraint
   WHERE conname IN ('fnr_unique_number','fnr_unique_idempotency','fnr_unique_access_key','fds_unique','fds_series_range');
  IF n <> 5 THEN RAISE EXCEPTION 'GATE 39 FAIL: unicidade de numeracao incompleta (%/5)', n; END IF; g := g+1;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='ux_fiscal_invoice_scope_nfe') THEN
    RAISE EXCEPTION 'GATE 40 FAIL: unicidade de NF-e por escopo ausente'; END IF; g := g+1;

  -- ---------- MOTOR ----------
  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
   WHERE ns.nspname='public' AND p.proname IN (
     'rpc_fiscal_calculate_invoice_v1','rpc_fiscal_reserve_nfe_number_v1','rpc_fiscal_nfe_readiness_v1',
     'rpc_fiscal_tax_rule_publish','rpc_fiscal_operation_policy_publish','rpc_fiscal_rule_sod_override',
     'fn_fiscal_resolve_operation','fn_fiscal_resolve_tax_rule','fn_fiscal_invoice_eligibility',
     'fn_fiscal_apply_tax','rpc_fiscal_emitter_request_accounting_review','rpc_fiscal_emitter_accounting_validate');
  IF n <> 12 THEN RAISE EXCEPTION 'GATE 41 FAIL: motor fiscal incompleto (%/12)', n; END IF; g := g+1;

  SELECT bool_and(p.prosecdef) INTO ok FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
   WHERE ns.nspname='public' AND p.proname IN (
     'rpc_fiscal_calculate_invoice_v1','rpc_fiscal_reserve_nfe_number_v1','rpc_fiscal_nfe_readiness_v1');
  IF NOT ok THEN RAISE EXCEPTION 'GATE 42 FAIL: RPC fiscal sem SECURITY DEFINER'; END IF; g := g+1;

  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
   WHERE ns.nspname='public'
     AND p.proname IN ('rpc_fiscal_calculate_invoice_v1','rpc_fiscal_reserve_nfe_number_v1','rpc_fiscal_nfe_readiness_v1',
                       'rpc_fiscal_tax_rule_publish','rpc_fiscal_operation_policy_publish','rpc_fiscal_rule_sod_override')
     AND (p.proconfig IS NULL OR NOT ('search_path=public, pg_temp' = ANY(p.proconfig)));
  IF n <> 0 THEN RAISE EXCEPTION 'GATE 43 FAIL: % RPC fiscal sem search_path fixo', n; END IF; g := g+1;

  -- ---------- SEGURANCA ----------
  SELECT count(*) INTO n FROM information_schema.role_table_grants
   WHERE table_schema='public' AND grantee IN ('anon','PUBLIC')
     AND table_name IN ('fiscal_tax_rules','fiscal_document_series','fiscal_number_reservations',
                        'fiscal_rule_sod_overrides','fiscal_calculation_runs',
                        'v_fiscal_nfe_emitter_readiness','v_fiscal_nfe_recipient_readiness','v_fiscal_nfe_rule_coverage',
                        'company_fiscal_settings','customer_fiscal_profiles','fiscal_operation_policies');
  IF n <> 0 THEN RAISE EXCEPTION 'GATE 44 FAIL: % grants para anon/PUBLIC em relacoes fiscais', n; END IF; g := g+1;

  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
   WHERE ns.nspname='public'
     AND p.proname IN ('rpc_fiscal_calculate_invoice_v1','rpc_fiscal_reserve_nfe_number_v1','rpc_fiscal_nfe_readiness_v1',
                       'rpc_fiscal_tax_rule_publish','rpc_fiscal_operation_policy_publish','rpc_fiscal_rule_sod_override',
                       'fn_fiscal_resolve_operation','fn_fiscal_resolve_tax_rule')
     AND (has_function_privilege('anon', p.oid, 'EXECUTE'));
  IF n <> 0 THEN RAISE EXCEPTION 'GATE 45 FAIL: % funcoes fiscais executaveis por anon', n; END IF; g := g+1;

  SELECT count(*) INTO n FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace
   WHERE ns.nspname='public' AND c.relrowsecurity
     AND c.relname IN ('fiscal_tax_rules','fiscal_document_series','fiscal_number_reservations',
                       'fiscal_rule_sod_overrides','fiscal_calculation_runs');
  IF n <> 5 THEN RAISE EXCEPTION 'GATE 46 FAIL: RLS ausente em % de 5 tabelas novas', 5-n; END IF; g := g+1;

  SELECT count(*) INTO n FROM pg_policies
   WHERE schemaname='public' AND tablename IN ('fiscal_tax_rules','fiscal_document_series','fiscal_number_reservations',
                                               'fiscal_rule_sod_overrides','fiscal_calculation_runs')
     AND (qual ILIKE '%true%' AND qual NOT ILIKE '%fn_regulatory%' AND qual NOT ILIKE '%has_role%');
  IF n <> 0 THEN RAISE EXCEPTION 'GATE 47 FAIL: % politica permissiva demais', n; END IF; g := g+1;

  -- Nenhuma politica de escrita direta em series/reservas/runs (somente RPC).
  SELECT count(*) INTO n FROM pg_policies
   WHERE schemaname='public' AND tablename IN ('fiscal_document_series','fiscal_number_reservations','fiscal_calculation_runs')
     AND cmd <> 'SELECT';
  IF n <> 0 THEN RAISE EXCEPTION 'GATE 48 FAIL: escrita direta permitida em numeracao/calculo (%)', n; END IF; g := g+1;

  -- ---------- AUDITORIA ----------
  SELECT count(*) INTO n FROM pg_trigger
   WHERE tgname IN ('tg_fiscal_tax_rules_audit','tg_fiscal_operation_policies_audit',
                    'tg_fiscal_number_reservations_audit','tg_fiscal_document_series_audit');
  IF n <> 4 THEN RAISE EXCEPTION 'GATE 49 FAIL: triggers de auditoria fiscal incompletas (%/4)', n; END IF; g := g+1;

  IF public.fiscal_json_has_sensitive_key(jsonb_build_object('password','x')) IS NOT TRUE THEN
    RAISE EXCEPTION 'GATE 50 FAIL: detector de segredo em JSON fiscal nao funciona'; END IF; g := g+1;

  -- ---------- MICRORGANISMOS: nada inventado ----------
  SELECT count(*) INTO n FROM public.v_microorganism_fiscal_readiness WHERE coalesce(fiscally_ready,false);
  IF n <> 0 THEN RAISE EXCEPTION 'GATE 51 FAIL: microrganismos nao podem ficar prontos sem dado fiscal real (obtidos %)', n; END IF; g := g+1;

  -- ---------- PRONTIDAO AGREGADA ----------
  SELECT count(*) INTO n FROM pg_views WHERE schemaname='public'
    AND viewname IN ('v_fiscal_nfe_emitter_readiness','v_fiscal_nfe_recipient_readiness','v_fiscal_nfe_rule_coverage');
  IF n <> 3 THEN RAISE EXCEPTION 'GATE 52 FAIL: views de prontidao NF-e incompletas (%/3)', n; END IF; g := g+1;

  RAISE NOTICE 'POSTCHECK F3: %/52 GATES PASS', g;
  IF g <> 52 THEN RAISE EXCEPTION 'POSTCHECK F3 FAIL: % de 52', g; END IF;
END $$;

-- ---------------------------------------------------------------------
-- PROVAS TRANSACIONAIS (revertidas)
-- ---------------------------------------------------------------------
DO $$
DECLARE p int := 0; v_id uuid; v_src uuid; e jsonb;
BEGIN
  -- 1) Regra tributaria nao pode ser publicada sem fonte/base legal.
  BEGIN
    INSERT INTO public.fiscal_tax_rules (rule_key, tax_kind, cst, rate, status, published_at, published_by)
    VALUES ('_probe_no_source', 'ICMS', '00', 17, 'PUBLISHED', now(), gen_random_uuid());
    RAISE EXCEPTION 'PROVA 1 FAIL: regra publicada sem fonte oficial foi aceita';
  EXCEPTION WHEN check_violation THEN p := p+1;
  END;

  -- 2) Ausencia de regra => bloqueio explicito, nunca zero.
  BEGIN
    PERFORM public.fn_fiscal_resolve_tax_rule('ICMS','3','GO','SP','30021000',NULL,true,'9');
    RAISE EXCEPTION 'PROVA 2 FAIL: resolucao sem regra deveria bloquear';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'FISCAL_TAX_RULE_NOT_FOUND%' THEN RAISE; END IF;
    p := p+1;
  END;

  -- 3) Ausencia de politica de operacao => bloqueio explicito.
  BEGIN
    PERFORM public.fn_fiscal_resolve_operation('OUT','GO','SP','3',true,'9','30021000',NULL,NULL);
    RAISE EXCEPTION 'PROVA 3 FAIL: resolucao sem politica deveria bloquear';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'FISCAL_OPERATION_POLICY_NOT_FOUND%' THEN RAISE; END IF;
    p := p+1;
  END;

  -- 4) Imutabilidade de regra publicada.
  INSERT INTO public.fiscal_tax_rules (rule_key, tax_kind, cst, rate, status, legal_basis, source_id, published_at, published_by)
  SELECT '_probe_imut', 'PIS', '01', 1.65, 'PUBLISHED', 'Probe transacional', s.id, now(), gen_random_uuid()
    FROM public.fiscal_official_sources s WHERE s.source_key='GUIA_EFD_ICMS_IPI_322'
  RETURNING id INTO v_id;
  BEGIN
    UPDATE public.fiscal_tax_rules SET rate = 2.00 WHERE id = v_id;
    RAISE EXCEPTION 'PROVA 4 FAIL: regra publicada foi alterada';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'FISCAL_TAX_RULE_IMMUTABLE%' THEN RAISE; END IF;
    p := p+1;
  END;

  -- 5) Elegibilidade: pedido em cotacao bloqueia.
  SELECT id INTO v_src FROM public.partner_orders WHERE status::text IN ('rascunho','em_analise_comercial') LIMIT 1;
  IF v_src IS NOT NULL THEN
    e := public.fn_fiscal_invoice_eligibility('PARTNER_ORDER', v_src);
    IF (e->>'eligible')::boolean THEN RAISE EXCEPTION 'PROVA 5 FAIL: pedido em cotacao considerado elegivel'; END IF;
    IF e->'reasons'->0->>'code' <> 'FISCAL_QUOTE_ONLY_BLOCKED' THEN
      RAISE EXCEPTION 'PROVA 5 FAIL: motivo esperado FISCAL_QUOTE_ONLY_BLOCKED, obtido %', e->'reasons';
    END IF;
  ELSE
    e := public.fn_fiscal_invoice_eligibility('PARTNER_ORDER', gen_random_uuid());
    IF (e->>'eligible')::boolean THEN RAISE EXCEPTION 'PROVA 5 FAIL: pedido inexistente considerado elegivel'; END IF;
  END IF;
  p := p+1;

  -- 6) Escopo fiscal nao suportado bloqueia.
  e := public.fn_fiscal_invoice_eligibility('QUALQUER_COISA', gen_random_uuid());
  IF (e->>'eligible')::boolean THEN RAISE EXCEPTION 'PROVA 6 FAIL: escopo desconhecido aceito'; END IF;
  p := p+1;

  -- 7) Arredondamento por item conforme MOC (2 casas).
  IF public.fn_fiscal_round(10.005) <> 10.01 OR public.fn_fiscal_round(10.004) <> 10.00 THEN
    RAISE EXCEPTION 'PROVA 7 FAIL: arredondamento monetario incorreto';
  END IF;
  p := p+1;

  -- 8) Override de SoD exige administrador.
  BEGIN
    PERFORM public.rpc_fiscal_rule_sod_override('TAX_RULE', gen_random_uuid(), repeat('x',60));
    RAISE EXCEPTION 'PROVA 8 FAIL: override concedido sem administrador';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'FISCAL_FORBIDDEN%' THEN RAISE; END IF;
    p := p+1;
  END;

  RAISE NOTICE 'PROVAS TRANSACIONAIS F3: %/8 PASS (revertidas)', p;
  IF p <> 8 THEN RAISE EXCEPTION 'PROVAS TRANSACIONAIS F3 FAIL: % de 8', p; END IF;
END $$;

ROLLBACK;
