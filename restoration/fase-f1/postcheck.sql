-- =====================================================================
-- FASE F1 (+ correção 20260813000000) — PÓS-CHECK / VERIFY
-- Somente leitura. Não é migration.
--
-- Fail-closed e SEM contagens absolutas congeladas: todas as verificações
-- de integridade comparam o baseline capturado NA MESMA EXECUÇÃO
-- (restoration/fase-f1/baseline/pre-correcao.json), ou são invariantes
-- semânticas restritas ao escopo desta fase.
--
-- Uso (o runner injeta o baseline):
--   ./restoration/fase-f1/run-postcheck.sh
-- ou:
--   psql "$STAGING_DSN" -v ON_ERROR_STOP=1 \
--        -v baseline_json="$(tr -d '\n' < restoration/fase-f1/baseline/pre-correcao.json)" \
--        -f restoration/fase-f1/postcheck.sql
-- =====================================================================
\set ON_ERROR_STOP on

\if :{?baseline_json}
\else
\echo 'POSTCHECK_ABORT: variavel baseline_json ausente (use run-postcheck.sh)'
\quit 1
\endif

CREATE TEMP TABLE _f1_baseline AS SELECT :'baseline_json'::jsonb AS b;

DO $v$
DECLARE
  b jsonb;
  v_n int;
  v_marker text; v_ref text;
  v_gate jsonb;
  v_scope_rel text[] := ARRAY[
    'microrganismos','microorganism_fiscal_profiles','microorganism_targets',
    'microorganism_technical_profiles','microorganism_crop_recommendations',
    'fiscal_invoice_references','fiscal_invoice_item_references','fiscal_stock_loss_contexts',
    'v_fiscal_company_readiness','v_fiscal_certificate_readiness','v_product_fiscal_readiness',
    'v_service_fiscal_readiness','v_customer_fiscal_readiness','v_microorganism_fiscal_readiness'];
BEGIN
  SELECT _f1_baseline.b INTO b FROM _f1_baseline;
  IF b IS NULL OR b->>'project_ref' IS NULL THEN
    RAISE EXCEPTION 'POSTCHECK_ABORT: baseline invalido';
  END IF;

  -- T0 — ambiente é exatamente o do baseline e é ambiente autorizado
  SELECT marker, project_ref INTO v_marker, v_ref FROM public._fiscal_staging_marker;
  IF v_marker IS DISTINCT FROM (b->>'marker') OR v_ref IS DISTINCT FROM (b->>'project_ref') THEN
    RAISE EXCEPTION 'POSTCHECK_ABORT: ambiente atual (%/%) difere do baseline (%/%)',
      v_marker, v_ref, b->>'marker', b->>'project_ref';
  END IF;
  IF NOT ((v_marker='STAGING' AND v_ref='ikaauvsflpmamgxmkhoq')
       OR (v_marker='PRODUCTION' AND v_ref='navfzbwgwzruipouyfnk')) THEN
    RAISE EXCEPTION 'POSTCHECK_ABORT: ambiente nao autorizado';
  END IF;

  -- =========================================================
  -- PRIVILÉGIOS (invariantes, não dependem de volume de dados)
  -- =========================================================
  -- T1: zero privilégios de anon/PUBLIC nas relações do escopo
  SELECT count(*) INTO v_n FROM information_schema.role_table_grants
  WHERE table_schema='public' AND grantee IN ('anon','PUBLIC')
    AND table_name = ANY(v_scope_rel);
  IF v_n <> 0 THEN RAISE EXCEPTION 'T1 FAIL: % grants anon/PUBLIC no escopo', v_n; END IF;

  -- T2: nenhuma policy TO anon/public nas tabelas do escopo
  SELECT count(*) INTO v_n FROM pg_policies
  WHERE schemaname='public' AND tablename = ANY(v_scope_rel)
    AND (roles::text[] && ARRAY['anon','public']);
  IF v_n <> 0 THEN RAISE EXCEPTION 'T2 FAIL: % policies permissivas p/ anon/public', v_n; END IF;

  -- T3: authenticated sem privilégios estruturais nas tabelas do escopo
  SELECT count(*) INTO v_n FROM information_schema.role_table_grants
  WHERE table_schema='public' AND grantee='authenticated'
    AND privilege_type IN ('TRUNCATE','REFERENCES','TRIGGER')
    AND table_name = ANY(v_scope_rel);
  IF v_n <> 0 THEN RAISE EXCEPTION 'T3 FAIL: % privilegios estruturais residuais', v_n; END IF;

  -- T4: funções da fase sem EXECUTE para anon/PUBLIC, com search_path fixado
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public'
    AND p.proname IN ('fn_fiscal_item_profile_gate_eval','fn_fiscal_company_crt',
                      'rpc_fiscal_item_readiness','fiscal_audit_trigger_microorganism_profiles')
    AND (has_function_privilege('anon', p.oid, 'EXECUTE')
         OR p.proconfig IS NULL);
  IF v_n <> 0 THEN RAISE EXCEPTION 'T4 FAIL: % funcoes com anon EXECUTE ou sem search_path', v_n; END IF;

  -- T5: views permanecem security_invoker (RLS das tabelas-base vigente)
  SELECT count(*) INTO v_n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public'
    AND c.relname IN ('v_product_fiscal_readiness','v_microorganism_fiscal_readiness')
    AND NOT coalesce(array_to_string(c.reloptions,',') LIKE '%security_invoker=true%', false);
  IF v_n <> 0 THEN RAISE EXCEPTION 'T5 FAIL: view sem security_invoker'; END IF;

  -- =========================================================
  -- QUARENTENA SEMÂNTICA (sem UUID fixo)
  -- =========================================================
  -- T6: nenhum perfil sintético permanece ativo
  SELECT count(*) INTO v_n FROM (
    SELECT 1 FROM public.microorganism_fiscal_profiles
      WHERE is_active = true AND (lower(coalesce(accounting_notes,'')) LIKE '%hml-b2b%'
         OR lower(coalesce(accounting_notes,'')) LIKE '%test_only%'
         OR lower(coalesce(accounting_notes,'')) LIKE '%sintetic%'
         OR lower(coalesce(accounting_notes,'')) LIKE '%homologacao%')
    UNION ALL
    SELECT 1 FROM public.product_fiscal_profiles
      WHERE is_active = true AND (lower(coalesce(accounting_notes,'')) LIKE '%hml-b2b%'
         OR lower(coalesce(accounting_notes,'')) LIKE '%test_only%'
         OR lower(coalesce(accounting_notes,'')) LIKE '%sintetic%'
         OR lower(coalesce(accounting_notes,'')) LIKE '%homologacao%')
  ) s;
  IF v_n <> 0 THEN RAISE EXCEPTION 'T6 FAIL: % perfis sinteticos ativos', v_n; END IF;

  -- T7: todo perfil marcado como quarentena está BLOCKED e inativo
  SELECT count(*) INTO v_n FROM (
    SELECT 1 FROM public.microorganism_fiscal_profiles
      WHERE lower(coalesce(accounting_notes,'')) LIKE '%quarentena f1%'
        AND (profile_status::text <> 'BLOCKED' OR is_active IS TRUE)
    UNION ALL
    SELECT 1 FROM public.product_fiscal_profiles
      WHERE lower(coalesce(accounting_notes,'')) LIKE '%quarentena f1%'
        AND (profile_status::text <> 'BLOCKED' OR is_active IS TRUE)
  ) s;
  IF v_n <> 0 THEN RAISE EXCEPTION 'T7 FAIL: % perfis de quarentena com estado incorreto', v_n; END IF;

  -- T8: nenhum perfil VALIDATED foi bloqueado por esta fase
  SELECT count(*) INTO v_n FROM (
    SELECT 1 FROM public.microorganism_fiscal_profiles
      WHERE profile_status::text='BLOCKED' AND accounting_validated_at IS NOT NULL
    UNION ALL
    SELECT 1 FROM public.product_fiscal_profiles
      WHERE profile_status::text='BLOCKED' AND accounting_validated_at IS NOT NULL
  ) s;
  IF v_n <> 0 THEN RAISE EXCEPTION 'T8 FAIL: % perfis validados foram bloqueados', v_n; END IF;

  -- =========================================================
  -- DIAGNÓSTICO DO GATE
  -- =========================================================
  -- T9: CRT 3 + CSOSN rejeitado tecnicamente
  v_gate := public.fn_fiscal_item_profile_gate_eval('PRODUCT','3',true,'VALIDATED',now(),NULL,
    'desc','L','L','38089299','0','5102','6102',NULL,'102','01','01');
  IF (v_gate->>'technical_ready')::boolean IS NOT FALSE
     OR NOT (v_gate->'pendencies' @> '[{"code":"CSOSN_NOT_ALLOWED_FOR_CRT3"}]'::jsonb)
  THEN RAISE EXCEPTION 'T9 FAIL: CRT3+CSOSN aceito'; END IF;

  -- T10: CST + CSOSN simultâneos rejeitados
  v_gate := public.fn_fiscal_item_profile_gate_eval('PRODUCT','3',true,'VALIDATED',now(),NULL,
    'desc','L','L','38089299','0','5102','6102','00','102','01','01');
  IF NOT (v_gate->'pendencies' @> '[{"code":"CST_AND_CSOSN_CONFLICT"}]'::jsonb)
  THEN RAISE EXCEPTION 'T10 FAIL: conflito CST+CSOSN nao detectado'; END IF;

  -- T11: sem validação contábil preliminar => pendência técnica
  v_gate := public.fn_fiscal_item_profile_gate_eval('PRODUCT','3',true,'VALIDATED',NULL,NULL,
    'desc','L','L','38089299','0','5102','6102','00',NULL,'01','01');
  IF NOT (v_gate->'pendencies' @> '[{"code":"ACCOUNTING_NOT_VALIDATED"}]'::jsonb)
     OR NOT (v_gate->'pendencies' @> '[{"code":"NCM_NOT_ACCOUNTING_REVIEWED"}]'::jsonb)
  THEN RAISE EXCEPTION 'T11 FAIL: pre-requisito contabil nao exigido'; END IF;

  -- T12: caminho feliz TÉCNICO passa, mas readiness OPERACIONAL segue bloqueado
  v_gate := public.fn_fiscal_item_profile_gate_eval('PRODUCT','3',true,'VALIDATED',now(),
    'Revisado pela contabilidade','Desc fiscal','L','L','38089299','0','5102','6102','00',NULL,'01','01');
  IF (v_gate->>'technical_ready')::boolean IS NOT TRUE
  THEN RAISE EXCEPTION 'T12 FAIL: gate tecnico rejeita perfil valido: %', v_gate->'pendencies'; END IF;
  IF (v_gate->>'ready')::boolean IS NOT FALSE
     OR NOT (v_gate->'pendencies' @> '[{"code":"REGULATORY_EVIDENCE_NOT_IMPLEMENTED"}]'::jsonb)
  THEN RAISE EXCEPTION 'T12 FAIL: prontidao operacional sem evidencia regulatoria'; END IF;

  -- T13: código que alegava evidência documental não é mais emitido
  IF v_gate::text LIKE '%NCM_WITHOUT_EVIDENCE%'
     OR EXISTS (SELECT 1 FROM public.v_microorganism_fiscal_readiness
                WHERE pendencies::text LIKE '%NCM_WITHOUT_EVIDENCE%')
  THEN RAISE EXCEPTION 'T13 FAIL: codigo NCM_WITHOUT_EVIDENCE ainda presente'; END IF;

  -- T14: quarentena exposta no diagnóstico e nunca pronta
  IF (SELECT count(*) FROM public.microorganism_fiscal_profiles WHERE profile_status::text='BLOCKED') > 0
     AND NOT EXISTS (SELECT 1 FROM public.v_microorganism_fiscal_readiness
                     WHERE quarantined IS TRUE
                       AND pendencies @> '[{"code":"PROFILE_QUARANTINED"}]'::jsonb)
  THEN RAISE EXCEPTION 'T14 FAIL: quarentena invisivel no diagnostico'; END IF;

  -- T15: 1 linha por item (escolha determinística, sem duplicidade)
  SELECT count(*) INTO v_n FROM (
    SELECT microorganism_id FROM public.v_microorganism_fiscal_readiness GROUP BY 1 HAVING count(*)>1) d;
  IF v_n <> 0 THEN RAISE EXCEPTION 'T15 FAIL: duplicidade em microrganismos'; END IF;
  SELECT count(*) INTO v_n FROM (
    SELECT product_id FROM public.v_product_fiscal_readiness GROUP BY 1 HAVING count(*)>1) d;
  IF v_n <> 0 THEN RAISE EXCEPTION 'T15 FAIL: duplicidade em produtos'; END IF;

  -- T16: nenhum item fiscalmente pronto nesta fase
  SELECT count(*) INTO v_n FROM public.v_microorganism_fiscal_readiness WHERE fiscally_ready IS TRUE;
  IF v_n <> 0 THEN RAISE EXCEPTION 'T16 FAIL: % microrganismos prontos', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.v_product_fiscal_readiness WHERE fiscally_ready IS TRUE;
  IF v_n <> 0 THEN RAISE EXCEPTION 'T16 FAIL: % produtos prontos', v_n; END IF;

  -- =========================================================
  -- AUDITORIA
  -- =========================================================
  -- T17: corpo compartilhado de fiscal_audit_trigger() sem escopo da F1
  IF (SELECT pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='fiscal_audit_trigger') LIKE '%microorganism_fiscal_profiles%'
  THEN RAISE EXCEPTION 'T17 FAIL: corpo compartilhado ainda alterado pela F1'; END IF;

  -- T18: trigger dedicado ativo em microorganism_fiscal_profiles
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_proc p ON p.oid=t.tgfoid
    WHERE c.relname='microorganism_fiscal_profiles'
      AND p.proname='fiscal_audit_trigger_microorganism_profiles' AND NOT t.tgisinternal)
  THEN RAISE EXCEPTION 'T18 FAIL: trigger dedicado ausente'; END IF;

  -- T19: os 7 triggers fiscais preexistentes continuam no corpo compartilhado
  --      (a F1 original havia acrescentado um 8o em microorganism_fiscal_profiles;
  --       a correcao devolveu esse escopo ao trigger dedicado)
  SELECT count(*) INTO v_n FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
  JOIN pg_proc p ON p.oid=t.tgfoid
  WHERE p.proname='fiscal_audit_trigger' AND NOT t.tgisinternal;
  IF v_n <> 7 THEN RAISE EXCEPTION 'T19 FAIL: % triggers no corpo compartilhado (esperado 7)', v_n; END IF;

  -- =========================================================
  -- INTEGRIDADE POR BASELINE (nada de contagens congeladas)
  -- =========================================================
  -- T20: emitente inalterado
  IF (SELECT md5(string_agg(t::text,'|' ORDER BY t::text)) FROM public.company_fiscal_settings t)
     IS DISTINCT FROM (b->>'company_fiscal_settings_md5')
  THEN RAISE EXCEPTION 'T20 FAIL: company_fiscal_settings alterada'; END IF;

  -- T21: nenhuma classificação fiscal inventada ou apagada (hash de escopo)
  IF (SELECT md5(coalesce(string_agg(concat_ws('~',id,ncm,cest,origin_code,cfop_in_state,
                 cfop_interstate,icms_cst,icms_csosn,pis_cst,cofins_cst),'|' ORDER BY id::text),''))
      FROM public.microorganism_fiscal_profiles)
     IS DISTINCT FROM (b->>'micro_profiles_fiscal_md5')
  THEN RAISE EXCEPTION 'T21 FAIL: valores fiscais de microrganismos divergem do baseline'; END IF;
  IF (SELECT md5(coalesce(string_agg(concat_ws('~',id,ncm,cest,origin_code,cfop_in_state,
                 cfop_interstate,icms_cst,icms_csosn,pis_cst,cofins_cst),'|' ORDER BY id::text),''))
      FROM public.product_fiscal_profiles)
     IS DISTINCT FROM (b->>'product_profiles_fiscal_md5')
  THEN RAISE EXCEPTION 'T21 FAIL: valores fiscais de produtos divergem do baseline'; END IF;

  -- T22: zero DELETE — contagens de perfis não podem CAIR abaixo do baseline
  IF (SELECT count(*) FROM public.microorganism_fiscal_profiles) < (b->>'micro_profiles')::int
     OR (SELECT count(*) FROM public.product_fiscal_profiles) < (b->>'product_profiles')::int
     OR (SELECT count(*) FROM public.microrganismos) < (b->>'microrganismos')::int
  THEN RAISE EXCEPTION 'T22 FAIL: houve remocao de linhas no escopo'; END IF;

  -- T23: escopo comercial/financeiro não regrediu (crescimento legítimo é aceito)
  IF (SELECT count(*) FROM public.partner_orders) < (b->>'partner_orders')::int
     OR (SELECT count(*) FROM public.accounts_receivable) < (b->>'accounts_receivable')::int
     OR (SELECT count(*) FROM public.fiscal_invoices) < (b->>'fiscal_invoices')::int
     OR (SELECT count(*) FROM public.fiscal_invoice_items) < (b->>'fiscal_invoice_items')::int
  THEN RAISE EXCEPTION 'T23 FAIL: remocao de pedidos/recebiveis/documentos'; END IF;

  -- T24: ledger não regrediu em relação ao baseline
  IF (SELECT count(*) FROM supabase_migrations.schema_migrations) < (b->>'ledger_count')::int
     OR (SELECT max(version) FROM supabase_migrations.schema_migrations) < (b->>'ledger_head')
  THEN RAISE EXCEPTION 'T24 FAIL: ledger regrediu em relacao ao baseline'; END IF;

  RAISE NOTICE 'POSTCHECK_FASE_F1_CORRECAO_PASS (24 gates)';
END
$v$;
