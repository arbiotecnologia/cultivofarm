-- =====================================================================
-- FASE F3.1 — POSTCHECK ESTRUTURAL (somente leitura, fail-fast)
-- STAGING ikaauvsflpmamgxmkhoq. Produção navfzbwgwzruipouyfnk PROIBIDA.
-- Executar com -v ON_ERROR_STOP=1.
-- =====================================================================
\set ON_ERROR_STOP on

DO $$
DECLARE g int := 0; f int := 0;
  PROCEDURE_NOOP boolean;
BEGIN
  -- helper inline: cada gate incrementa g; falha acumula em f com NOTICE.
  NULL;
END $$;

CREATE TEMP TABLE _f31_gates(n serial, gate text, ok boolean, detail text);

CREATE OR REPLACE FUNCTION pg_temp.gate(_g text, _ok boolean, _d text DEFAULT NULL)
RETURNS void LANGUAGE sql AS $$ INSERT INTO pg_temp._f31_gates(gate, ok, detail) VALUES (_g, _ok, _d) $$;

-- 1..6 Devedor/destinatário
SELECT pg_temp.gate('G01 fn_fiscal_partner_fiscal_customer existe',
  to_regprocedure('public.fn_fiscal_partner_fiscal_customer(uuid)') IS NOT NULL);
SELECT pg_temp.gate('G02 fn_fiscal_assert_debtor_recipient existe',
  to_regprocedure('public.fn_fiscal_assert_debtor_recipient(uuid)') IS NOT NULL);
SELECT pg_temp.gate('G03 assert devedor e SECURITY DEFINER com search_path fixo',
  (SELECT p.prosecdef AND array_to_string(coalesce(p.proconfig,'{}'),',') LIKE '%search_path%'
     FROM pg_proc p WHERE p.oid = to_regprocedure('public.fn_fiscal_assert_debtor_recipient(uuid)')));
SELECT pg_temp.gate('G04 calculo chama assert de devedor',
  (SELECT prosrc LIKE '%fn_fiscal_assert_debtor_recipient%'
     FROM pg_proc WHERE oid = to_regprocedure('public.rpc_fiscal_calculate_invoice_v1(uuid,text)')));
SELECT pg_temp.gate('G05 reserva chama assert de devedor',
  (SELECT prosrc LIKE '%fn_fiscal_assert_debtor_recipient%'
     FROM pg_proc WHERE oid = to_regprocedure('public.rpc_fiscal_reserve_nfe_number_v1(uuid,text)')));
SELECT pg_temp.gate('G06 codigo FISCAL_DEBTOR_RECIPIENT_MISMATCH presente',
  (SELECT prosrc LIKE '%FISCAL_DEBTOR_RECIPIENT_MISMATCH%'
     FROM pg_proc WHERE oid = to_regprocedure('public.fn_fiscal_assert_debtor_recipient(uuid)')));
SELECT pg_temp.gate('G07 partner_accounts.client_id existe',
  EXISTS (SELECT 1 FROM information_schema.columns
           WHERE table_schema='public' AND table_name='partner_accounts' AND column_name='client_id'));

-- 8..14 Contexto encadeado
SELECT pg_temp.gate('G08 calculo propaga icmsSt no contexto',
  (SELECT prosrc LIKE '%''icmsSt'', v_st_val%'
     FROM pg_proc WHERE oid = to_regprocedure('public.rpc_fiscal_calculate_invoice_v1(uuid,text)')));
SELECT pg_temp.gate('G09 calculo propaga baseST no contexto',
  (SELECT prosrc LIKE '%''baseST'', v_base_st%'
     FROM pg_proc WHERE oid = to_regprocedure('public.rpc_fiscal_calculate_invoice_v1(uuid,text)')));
SELECT pg_temp.gate('G10 totais expoem vFCP e vFCPST separados',
  (SELECT prosrc LIKE '%''vFCP'', public.fn_fiscal_round(t_fcp)%'
      AND prosrc LIKE '%''vFCPST'', public.fn_fiscal_round(t_fcpst)%'
     FROM pg_proc WHERE oid = to_regprocedure('public.rpc_fiscal_calculate_invoice_v1(uuid,text)')));
SELECT pg_temp.gate('G11 totais expoem vICMSUFDest/vICMSUFRemet/vFCPUFDest no DIFAL',
  (SELECT prosrc LIKE '%vICMSUFDest%' AND prosrc LIKE '%vICMSUFRemet%' AND prosrc LIKE '%vFCPUFDest%'
     FROM pg_proc WHERE oid = to_regprocedure('public.rpc_fiscal_calculate_invoice_v1(uuid,text)')));
SELECT pg_temp.gate('G12 snapshot do item grava chainedContext',
  (SELECT prosrc LIKE '%chainedContext%'
     FROM pg_proc WHERE oid = to_regprocedure('public.rpc_fiscal_calculate_invoice_v1(uuid,text)')));
SELECT pg_temp.gate('G13 engineVersion F3.3',
  (SELECT prosrc LIKE '%''engineVersion'',''F3.3''%'
     FROM pg_proc WHERE oid = to_regprocedure('public.rpc_fiscal_calculate_invoice_v1(uuid,text)')));
SELECT pg_temp.gate('G14 FCP proprio nao soma FCP-ST nem FCP destino',
  (SELECT prosrc LIKE '%t_fcp    := t_fcp    + v_fcp_own%'
     FROM pg_proc WHERE oid = to_regprocedure('public.rpc_fiscal_calculate_invoice_v1(uuid,text)')));

-- 15..22 Cobertura real
SELECT pg_temp.gate('G15 fn_fiscal_rule_validate_synthetic existe',
  to_regprocedure('public.fn_fiscal_rule_validate_synthetic(text,public.fiscal_tax_rules,jsonb)') IS NOT NULL);
SELECT pg_temp.gate('G16 cobertura chama o motor v2',
  (SELECT prosrc LIKE '%fn_fiscal_apply_tax_v2%'
     FROM pg_proc WHERE oid = to_regprocedure('public.fn_fiscal_scenario_coverage()')));
SELECT pg_temp.gate('G17 cobertura distingue os 4 codigos de gap',
  (SELECT prosrc LIKE '%NOT_FOUND%' AND prosrc LIKE '%AMBIGUOUS%'
      AND prosrc LIKE '%INCOMPLETE%' AND prosrc LIKE '%ENGINE_UNAVAILABLE%'
     FROM pg_proc WHERE oid = to_regprocedure('public.fn_fiscal_scenario_coverage()')));
SELECT pg_temp.gate('G18 cobertura exige NCM nao nulo',
  (SELECT prosrc LIKE '%mp.ncm,%' AND prosrc LIKE '%IS NOT NULL%'
     FROM pg_proc WHERE oid = to_regprocedure('public.fn_fiscal_scenario_coverage()')));
SELECT pg_temp.gate('G19 cobertura exige dossie VALIDATED vigente',
  (SELECT prosrc LIKE '%d.status = ''VALIDATED''%'
     FROM pg_proc WHERE oid = to_regprocedure('public.fn_fiscal_scenario_coverage()')));
SELECT pg_temp.gate('G20 cobertura exige validacao contabil',
  (SELECT prosrc LIKE '%accounting_validated_at IS NOT NULL%'
     FROM pg_proc WHERE oid = to_regprocedure('public.fn_fiscal_scenario_coverage()')));
SELECT pg_temp.gate('G21 cobertura segrega ativos/prontos/rascunhos/bloqueados/inativos',
  (SELECT prosrc LIKE '%''active''%' AND prosrc LIKE '%''ready''%' AND prosrc LIKE '%''draft''%'
      AND prosrc LIKE '%''blocked''%' AND prosrc LIKE '%''inactive''%'
     FROM pg_proc WHERE oid = to_regprocedure('public.fn_fiscal_scenario_coverage()')));
SELECT pg_temp.gate('G22 cobertura e STABLE (sem persistencia)',
  (SELECT provolatile IN ('s','i') FROM pg_proc WHERE oid = to_regprocedure('public.fn_fiscal_scenario_coverage()')));

-- 23..30 Homologação / produção
SELECT pg_temp.gate('G23 trigger de prontidao nunca persiste READY_PRODUCTION',
  (SELECT prosrc NOT LIKE '%READY_PRODUCTION%'
     FROM pg_proc WHERE oid = to_regprocedure('public.tg_fiscal_emitter_refresh_readiness()')));
SELECT pg_temp.gate('G24 nenhum emitente persistido em READY_PRODUCTION',
  NOT EXISTS (SELECT 1 FROM public.company_fiscal_settings WHERE nfe_readiness_status = 'READY_PRODUCTION'));
SELECT pg_temp.gate('G25 pendencia EMITTER_PRODUCTION_BLOCKED_F3 implementada',
  (SELECT prosrc LIKE '%EMITTER_PRODUCTION_BLOCKED_F3%'
     FROM pg_proc WHERE oid = to_regprocedure('public.fn_fiscal_emitter_pendencies_row(public.company_fiscal_settings)')));
SELECT pg_temp.gate('G26 guarda de evidencia de homologacao instalada',
  EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_fiscal_homologation_evidence_guard' AND NOT tgisinternal));
SELECT pg_temp.gate('G27 calculo bloqueia ambiente 1',
  (SELECT prosrc LIKE '%FISCAL_PRODUCTION_BLOCKED%'
     FROM pg_proc WHERE oid = to_regprocedure('public.rpc_fiscal_calculate_invoice_v1(uuid,text)')));
SELECT pg_temp.gate('G28 reserva bloqueia ambiente 1',
  (SELECT prosrc LIKE '%FISCAL_PRODUCTION_BLOCKED%'
     FROM pg_proc WHERE oid = to_regprocedure('public.rpc_fiscal_reserve_nfe_number_v1(uuid,text)')));
SELECT pg_temp.gate('G29 painel declara teto READY_HOMOLOGATION',
  (SELECT prosrc LIKE '%''maxAllowedStatus'',''READY_HOMOLOGATION''%'
     FROM pg_proc WHERE oid = to_regprocedure('public.rpc_fiscal_nfe_readiness_v1()')));
SELECT pg_temp.gate('G30 painel rebaixa READY_PRODUCTION residual',
  (SELECT prosrc LIKE '%emitter_status := ''NOT_READY''%'
     FROM pg_proc WHERE oid = to_regprocedure('public.rpc_fiscal_nfe_readiness_v1()')));

-- 31..40 RLS
SELECT pg_temp.gate('G31 policies SELECT redundantes removidas',
  NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
               AND policyname IN ('fcr_select','fds_select','fnr_select','ftr_select','frso_select','fop_admin_read')));
SELECT pg_temp.gate('G32 exatamente uma policy SELECT em fiscal_tax_rules',
  (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='fiscal_tax_rules' AND cmd IN ('SELECT','ALL')) = 1);
SELECT pg_temp.gate('G33 exatamente uma policy SELECT em fiscal_number_reservations',
  (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='fiscal_number_reservations' AND cmd IN ('SELECT','ALL')) = 1);
SELECT pg_temp.gate('G34 exatamente uma policy SELECT em fiscal_operation_policies',
  (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='fiscal_operation_policies' AND cmd IN ('SELECT','ALL')) = 1);
SELECT pg_temp.gate('G35 exatamente uma policy SELECT em fiscal_calculation_runs',
  (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='fiscal_calculation_runs' AND cmd IN ('SELECT','ALL')) = 1);
SELECT pg_temp.gate('G36 exatamente uma policy SELECT em fiscal_document_series',
  (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='fiscal_document_series' AND cmd IN ('SELECT','ALL')) = 1);
SELECT pg_temp.gate('G37 exatamente uma policy SELECT em fiscal_rule_sod_overrides',
  (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='fiscal_rule_sod_overrides' AND cmd IN ('SELECT','ALL')) = 1);
SELECT pg_temp.gate('G38 toda policy SELECT fiscal usa fn_fiscal_can_read_internal',
  NOT EXISTS (SELECT 1 FROM pg_policies
               WHERE schemaname='public'
                 AND tablename IN ('fiscal_calculation_runs','fiscal_document_series','fiscal_number_reservations',
                                   'fiscal_tax_rules','fiscal_rule_sod_overrides','fiscal_operation_policies')
                 AND cmd IN ('SELECT','ALL')
                 AND coalesce(qual,'') NOT LIKE '%fn_fiscal_can_read_internal%'));
SELECT pg_temp.gate('G39 RLS habilitada em todas as relacoes fiscais F3',
  NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
               WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity
                 AND c.relname IN ('fiscal_calculation_runs','fiscal_document_series','fiscal_number_reservations',
                                   'fiscal_tax_rules','fiscal_rule_sod_overrides','fiscal_operation_policies')));
SELECT pg_temp.gate('G40 sem grants para anon nas relacoes fiscais F3',
  NOT EXISTS (SELECT 1 FROM information_schema.role_table_grants
               WHERE table_schema='public' AND grantee IN ('anon','PUBLIC')
                 AND table_name IN ('fiscal_calculation_runs','fiscal_document_series','fiscal_number_reservations',
                                    'fiscal_tax_rules','fiscal_rule_sod_overrides','fiscal_operation_policies')));

-- 41..44 Promoção segura
SELECT pg_temp.gate('G41 nenhuma reserva orfa (fiscal_invoice_id NULL)',
  NOT EXISTS (SELECT 1 FROM public.fiscal_number_reservations WHERE fiscal_invoice_id IS NULL));
SELECT pg_temp.gate('G42 fiscal_invoice_id NOT NULL',
  (SELECT attnotnull FROM pg_attribute
    WHERE attrelid='public.fiscal_number_reservations'::regclass AND attname='fiscal_invoice_id'));
SELECT pg_temp.gate('G43 unicidade de idempotencia escopada ao documento',
  EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='fnr_unique_idempotency_scoped'));
SELECT pg_temp.gate('G44 reserva imutavel por trigger',
  EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_fiscal_reservation_immutable' AND NOT tgisinternal));

-- 45..50 Fontes oficiais
SELECT pg_temp.gate('G45 nenhuma fonte oficial em pagina generica',
  NOT EXISTS (SELECT 1 FROM public.fiscal_official_sources
               WHERE url IS NULL OR url !~ '^https://' OR url ~ '^https://[^/]+/?$'));
SELECT pg_temp.gate('G46 MOC com URL de listaConteudo',
  (SELECT url LIKE '%listaConteudo.aspx?tipoConteudo=ndIjl%' FROM public.fiscal_official_sources WHERE source_key='MOC_NFE_70'));
SELECT pg_temp.gate('G47 Schemas/NT com URL especifica',
  (SELECT url LIKE '%tipoConteudo=BMPFMBoln3w%' FROM public.fiscal_official_sources WHERE source_key='PORTAL_NFE_SCHEMAS_NT'));
SELECT pg_temp.gate('G48 NCM com URL de download oficial',
  (SELECT url LIKE '%download-ncm-nomenclatura-comum-do-mercosul' FROM public.fiscal_official_sources WHERE source_key='RFB_NCM_TIPI'));
SELECT pg_temp.gate('G49 TIPI em PDF oficial',
  (SELECT url LIKE '%tipi.pdf' FROM public.fiscal_official_sources WHERE source_key='TIPI'));
SELECT pg_temp.gate('G50 Guia EFD 3.2.2',
  (SELECT url LIKE '%guia-pratico-da-efd-icms-ipi-3-2.2' FROM public.fiscal_official_sources WHERE source_key='GUIA_EFD_ICMS_IPI_322'));

-- 51..52 Inventário de microrganismos
SELECT pg_temp.gate('G51 microrganismos ativos contabilizados no painel',
  (SELECT (public.fn_fiscal_scenario_coverage()->'microorganisms'->>'active')::int
        = (SELECT count(*) FROM public.microrganismos WHERE coalesce(ativo,true))));
SELECT pg_temp.gate('G52 inativos nao entram no bloqueio de prontidao',
  (SELECT prosrc LIKE '%Somente microrganismos ATIVOS podem bloquear%'
     FROM pg_proc WHERE oid = to_regprocedure('public.rpc_fiscal_nfe_readiness_v1()')));

\echo '== RESULTADO POSTCHECK F3.1 =='
SELECT n, gate, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS status FROM _f31_gates ORDER BY n;

DO $$
DECLARE nf int;
BEGIN
  SELECT count(*) INTO nf FROM _f31_gates WHERE NOT coalesce(ok,false);
  IF nf > 0 THEN
    RAISE EXCEPTION 'POSTCHECK_F3_1_FAILED: % gate(s) reprovado(s).', nf;
  END IF;
  RAISE NOTICE 'POSTCHECK F3.1: % / % PASS', (SELECT count(*) FROM _f31_gates), (SELECT count(*) FROM _f31_gates);
END $$;
