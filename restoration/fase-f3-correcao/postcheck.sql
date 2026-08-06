-- =====================================================================
-- FASE F3 — CORREÇÃO DA AUDITORIA — POSTCHECK ESTRUTURAL
-- Ambiente: STAGING ikaauvsflpmamgxmkhoq. Somente leitura de catálogo.
-- Falha em qualquer gate => ERRO (fail-fast).
-- =====================================================================
\set ON_ERROR_STOP on

CREATE TEMP TABLE _f3c_gate(n int, name text, ok boolean, detail text);

CREATE OR REPLACE FUNCTION pg_temp.g(_n int, _name text, _ok boolean, _detail text DEFAULT NULL)
RETURNS void LANGUAGE sql AS $$ INSERT INTO _f3c_gate VALUES (_n,_name,coalesce(_ok,false),_detail) $$;

DO $post$
DECLARE v_num int; v_txt text; v_bool boolean;
BEGIN
  -- ---------------- BLOCO 1: idempotência e numeração ----------------
  PERFORM pg_temp.g(1,'idempotency_key deixou de ser unica globalmente',
    NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='fnr_unique_idempotency'));

  PERFORM pg_temp.g(2,'Unicidade escopada (fiscal_invoice_id, idempotency_key)',
    EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='fnr_unique_idempotency_scoped'));

  PERFORM pg_temp.g(3,'fiscal_invoice_id NOT NULL em fiscal_number_reservations',
    (SELECT attnotnull FROM pg_attribute
      WHERE attrelid='public.fiscal_number_reservations'::regclass AND attname='fiscal_invoice_id'));

  PERFORM pg_temp.g(4,'Unicidade de numero por serie',
    EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='fnr_unique_number'));

  PERFORM pg_temp.g(5,'Unicidade de chave de acesso',
    EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='fnr_unique_access_key'));

  PERFORM pg_temp.g(6,'Uma reserva ativa por documento',
    EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='fnr_unique_active_per_invoice'));

  PERFORM pg_temp.g(7,'tp_emis presente em reservas e documentos',
    (SELECT count(*) FROM information_schema.columns
      WHERE table_schema='public' AND column_name='tp_emis'
        AND table_name IN ('fiscal_number_reservations','fiscal_invoices')) = 2);

  PERFORM pg_temp.g(8,'tpEmis restrito a 1 (contingencias bloqueadas)',
    (SELECT count(*) FROM pg_constraint
      WHERE conname IN ('fnr_tp_emis_chk','fiscal_invoices_tp_emis_chk')) = 2);

  PERFORM pg_temp.g(9,'Reserva usa lock transacional deterministico',
    (SELECT prosrc LIKE '%pg_advisory_xact_lock%' AND prosrc LIKE '%FOR UPDATE%'
       FROM pg_proc WHERE proname='rpc_fiscal_reserve_nfe_number_v1'));

  PERFORM pg_temp.g(10,'Reserva bloqueia chave reutilizada por outro documento',
    (SELECT prosrc LIKE '%FISCAL_IDEMPOTENCY_SCOPE_MISMATCH%'
       FROM pg_proc WHERE proname='rpc_fiscal_reserve_nfe_number_v1'));

  PERFORM pg_temp.g(11,'Reserva reavalia elegibilidade antes de consumir numero',
    (SELECT prosrc LIKE '%fn_fiscal_invoice_eligibility%'
       FROM pg_proc WHERE proname='rpc_fiscal_reserve_nfe_number_v1'));

  PERFORM pg_temp.g(12,'Trigger de imutabilidade da reserva ativo',
    EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_fiscal_reservation_immutable' AND NOT tgisinternal));

  -- ---------------- BLOCO 2: elegibilidade fail-closed ---------------
  PERFORM pg_temp.g(13,'Allowlist de status de pedido faturavel existe',
    (SELECT array_length(public.fn_fiscal_billing_allowed_order_status(),1)) > 0);

  PERFORM pg_temp.g(14,'Allowlist nao contem status proibidos',
    NOT (ARRAY['aguardando_cotacao','cancelado','reprovado','reprovado_sem_itens','faturado']
         && public.fn_fiscal_billing_allowed_order_status()));

  PERFORM pg_temp.g(15,'Elegibilidade e STABLE (sem efeito colateral)',
    (SELECT provolatile='s' FROM pg_proc WHERE proname='fn_fiscal_invoice_eligibility'));

  PERFORM pg_temp.g(16,'Elegibilidade bloqueia quote_only e snapshot ausente',
    (SELECT prosrc LIKE '%FISCAL_QUOTE_ONLY_BLOCKED%' AND prosrc LIKE '%FISCAL_PRICE_SNAPSHOT_MISSING%'
       FROM pg_proc WHERE proname='fn_fiscal_invoice_eligibility'));

  PERFORM pg_temp.g(17,'Elegibilidade valida devedor B2B e vinculo da entrega',
    (SELECT prosrc LIKE '%FISCAL_DEBTOR_UNRESOLVED%' AND prosrc LIKE '%FISCAL_DELIVERY_ORDER_LINK_MISSING%'
       FROM pg_proc WHERE proname='fn_fiscal_invoice_eligibility'));

  PERFORM pg_temp.g(18,'Elegibilidade bloqueia duplicidade fiscal vigente',
    (SELECT prosrc LIKE '%FISCAL_DUPLICATE_DOCUMENT%'
       FROM pg_proc WHERE proname='fn_fiscal_invoice_eligibility'));

  PERFORM pg_temp.g(19,'Status desconhecido cai no bloqueio por allowlist',
    (SELECT prosrc LIKE '%FISCAL_ORDER_STATUS_NOT_BILLABLE%'
       FROM pg_proc WHERE proname='fn_fiscal_invoice_eligibility'));

  -- ---------------- BLOCO 3: motor tributário ------------------------
  PERFORM pg_temp.g(20,'Parametros de ST/FCP/DIFAL presentes em fiscal_tax_rules',
    (SELECT count(*) FROM information_schema.columns
      WHERE table_schema='public' AND table_name='fiscal_tax_rules'
        AND column_name IN ('st_modality','internal_rate_pct','interstate_rate_pct',
                            'fcp_st_rate','credit_own_icms','base_components')) = 6);

  PERFORM pg_temp.g(21,'Componentes de base validados por constraint',
    EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ftr_base_components_chk'));

  PERFORM pg_temp.g(22,'Modalidade de BC ST restrita ao dominio oficial',
    EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ftr_st_modality_chk'));

  PERFORM pg_temp.g(23,'Coerencia CRT x CST/CSOSN garantida por constraint',
    EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ftr_crt_cst_csosn_chk'));

  PERFORM pg_temp.g(24,'PIS/COFINS/IPI nunca usam CSOSN',
    EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ftr_non_icms_csosn_chk'));

  PERFORM pg_temp.g(25,'IBS/CBS/IS nao podem ser publicados (scaffolding)',
    EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ftr_rtc_not_publishable_chk'));

  PERFORM pg_temp.g(26,'Motor v2 canonico existe',
    EXISTS (SELECT 1 FROM pg_proc WHERE proname='fn_fiscal_apply_tax_v2'));

  PERFORM pg_temp.g(27,'Motor v2 implementa ICMS_ST, FCP_ST e DIFAL explicitamente',
    (SELECT prosrc LIKE '%ICMS_ST%' AND prosrc LIKE '%FCP_ST%' AND prosrc LIKE '%DIFAL%'
        AND prosrc LIKE '%difal_dest_share_pct%'
       FROM pg_proc WHERE proname='fn_fiscal_apply_tax_v2'));

  PERFORM pg_temp.g(28,'Motor generico legado desativado',
    (SELECT prosrc LIKE '%FISCAL_ENGINE_DEPRECATED%' FROM pg_proc WHERE proname='fn_fiscal_apply_tax'));

  PERFORM pg_temp.g(29,'Resolvedor de tributo bloqueia ambiguidade',
    (SELECT prosrc LIKE '%FISCAL_TAX_RULE_AMBIGUOUS%' FROM pg_proc WHERE proname='fn_fiscal_resolve_tax_rule'));

  PERFORM pg_temp.g(30,'Resolvedor de operacao bloqueia ambiguidade',
    (SELECT prosrc LIKE '%FISCAL_OPERATION_POLICY_AMBIGUOUS%' FROM pg_proc WHERE proname='fn_fiscal_resolve_operation'));

  PERFORM pg_temp.g(31,'Calculo usa motor v2 e ordem canonica de tributos',
    (SELECT prosrc LIKE '%fn_fiscal_apply_tax_v2%' AND prosrc LIKE '%taxOrder%'
       FROM pg_proc WHERE proname='rpc_fiscal_calculate_invoice_v1'));

  PERFORM pg_temp.g(32,'Snapshot grava CFOP, politica, fonte e componentes',
    (SELECT prosrc LIKE '%operationPolicyId%' AND prosrc LIKE '%operationSourceId%'
        AND prosrc LIKE '%''components''%' AND prosrc LIKE '%roundingMode%'
       FROM pg_proc WHERE proname='rpc_fiscal_calculate_invoice_v1'));

  PERFORM pg_temp.g(33,'Calculo escopa idempotencia por documento',
    (SELECT prosrc LIKE '%FISCAL_IDEMPOTENCY_SCOPE_MISMATCH%'
       FROM pg_proc WHERE proname='rpc_fiscal_calculate_invoice_v1'));

  -- ---------------- BLOCO 4: prontidão real --------------------------
  PERFORM pg_temp.g(34,'Registro de homologacao SEFAZ existe no emitente',
    (SELECT count(*) FROM information_schema.columns
      WHERE table_schema='public' AND table_name='company_fiscal_settings'
        AND column_name IN ('sefaz_homologation_at','sefaz_homologation_evidence')) = 2);

  PERFORM pg_temp.g(35,'Evidencia de homologacao nao aceita segredo',
    EXISTS (SELECT 1 FROM pg_constraint WHERE conname='cfs_homologation_no_secret_chk'));

  PERFORM pg_temp.g(36,'Cobertura efetiva de cenarios implementada',
    EXISTS (SELECT 1 FROM pg_proc WHERE proname='fn_fiscal_scenario_coverage'));

  PERFORM pg_temp.g(37,'Prontidao usa cobertura real e teto de homologacao',
    (SELECT prosrc LIKE '%fn_fiscal_scenario_coverage%'
        AND prosrc LIKE '%SEFAZ_HOMOLOGATION_NOT_RECORDED%'
        AND prosrc LIKE '%maxAllowedStatus%'
       FROM pg_proc WHERE proname='rpc_fiscal_nfe_readiness_v1'));

  PERFORM pg_temp.g(38,'Prontidao reporta lacunas de cobertura acionaveis',
    (SELECT prosrc LIKE '%COVERAGE_INCOMPLETE%' AND prosrc LIKE '%COVERAGE_NO_SCENARIOS%'
       FROM pg_proc WHERE proname='rpc_fiscal_nfe_readiness_v1'));

  -- ---------------- BLOCO 5: fontes oficiais -------------------------
  SELECT count(*) INTO v_num FROM public.fiscal_official_sources
   WHERE url IS NULL OR url !~ '^https://' OR url ~ '^https://[^/]+/?$';
  PERFORM pg_temp.g(39,'Fontes oficiais com URL especifica (sem home generica)', v_num = 0, v_num::text);

  -- ---------------- BLOCO 6: segurança -------------------------------
  SELECT count(*) INTO v_num
    FROM information_schema.role_table_grants
   WHERE table_schema='public' AND grantee IN ('PUBLIC','anon')
     AND table_name IN ('fiscal_number_reservations','fiscal_tax_rules','fiscal_operation_policies',
                        'fiscal_calculation_runs','fiscal_document_series','fiscal_official_sources',
                        'fiscal_rule_sod_overrides','fiscal_invoices','fiscal_invoice_items','fiscal_audit_log');
  PERFORM pg_temp.g(40,'Nenhum grant de tabela fiscal para PUBLIC/anon', v_num = 0, v_num::text);

  SELECT count(*) INTO v_num
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND NOT c.relrowsecurity
     AND c.relname IN ('fiscal_number_reservations','fiscal_tax_rules','fiscal_operation_policies',
                       'fiscal_calculation_runs','fiscal_document_series','fiscal_official_sources',
                       'fiscal_rule_sod_overrides','fiscal_invoices','fiscal_invoice_items','fiscal_audit_log');
  PERFORM pg_temp.g(41,'RLS habilitada em todas as relacoes fiscais F3', v_num = 0, v_num::text);

  SELECT count(*) INTO v_num FROM pg_policies
   WHERE schemaname='public' AND policyname LIKE 'f3_internal_read_%';
  PERFORM pg_temp.g(42,'Politicas de leitura interna criadas (>=6)', v_num >= 6, v_num::text);

  SELECT count(*) INTO v_num
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public'
     AND p.proname IN ('rpc_fiscal_reserve_nfe_number_v1','rpc_fiscal_calculate_invoice_v1',
                       'rpc_fiscal_nfe_readiness_v1','fn_fiscal_invoice_eligibility',
                       'fn_fiscal_resolve_tax_rule','fn_fiscal_resolve_operation',
                       'fn_fiscal_apply_tax_v2','fn_fiscal_scenario_coverage')
     AND (has_function_privilege('anon', p.oid, 'EXECUTE')
          OR coalesce(array_to_string(p.proacl,','),'') LIKE '%=X/%'
             AND coalesce(array_to_string(p.proacl,','),'') LIKE '%,=X%');
  PERFORM pg_temp.g(43,'anon sem EXECUTE nas funcoes fiscais F3', v_num = 0, v_num::text);

  SELECT count(*) INTO v_num FROM pg_trigger
   WHERE tgname IN ('trg_f3_audit_fiscal_tax_rules','trg_f3_audit_fiscal_operation_policies',
                    'trg_f3_audit_fiscal_number_reservations') AND NOT tgisinternal;
  PERFORM pg_temp.g(44,'Trilha de auditoria nas relacoes F3', v_num = 3, v_num::text);

  SELECT count(*) INTO v_num
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.prosecdef
     AND p.proname LIKE 'fn_fiscal%'
     AND coalesce(array_to_string(p.proconfig,','),'') NOT LIKE '%search_path%';
  PERFORM pg_temp.g(45,'Funcoes SECURITY DEFINER fiscais com search_path fixo', v_num = 0, v_num::text);

  -- ---------------- Integridade de dados preservada ------------------
  PERFORM pg_temp.g(46,'Nenhuma reserva orfa de documento',
    NOT EXISTS (SELECT 1 FROM public.fiscal_number_reservations WHERE fiscal_invoice_id IS NULL));

  SELECT count(*) INTO v_num FROM public.fiscal_tax_rules
   WHERE status='PUBLISHED' AND (source_id IS NULL OR nullif(btrim(coalesce(legal_basis,'')),'') IS NULL);
  PERFORM pg_temp.g(47,'Toda regra publicada tem fonte oficial e base legal', v_num = 0, v_num::text);

  SELECT count(*) INTO v_num FROM public.fiscal_tax_rules
   WHERE status='PUBLISHED' AND tax_kind IN ('IBS','CBS','IS');
  PERFORM pg_temp.g(48,'Nenhum tributo da reforma publicado', v_num = 0, v_num::text);
END $post$;

SELECT n, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS status, name, coalesce(detail,'') AS detail
FROM _f3c_gate ORDER BY n;

DO $$
DECLARE p int; t int; BEGIN
  SELECT count(*) FILTER (WHERE ok), count(*) INTO p, t FROM _f3c_gate;
  RAISE NOTICE 'POSTCHECK F3-CORRECAO: %/% PASS', p, t;
  IF p <> t THEN
    RAISE EXCEPTION 'POSTCHECK F3-CORRECAO FAIL: % gates reprovados (%)',
      t - p, (SELECT string_agg(n::text||':'||name, ' | ') FROM _f3c_gate WHERE NOT ok);
  END IF;
END $$;

DROP TABLE _f3c_gate;
