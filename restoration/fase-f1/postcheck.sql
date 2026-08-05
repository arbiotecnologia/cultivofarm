-- =====================================================================
-- FASE F1 — PÓS-CHECK / VERIFY (somente leitura). Não é migration.
-- Uso: psql "$STAGING_DSN" -v ON_ERROR_STOP=1 -f restoration/fase-f1/postcheck.sql
-- =====================================================================
\set ON_ERROR_STOP on

DO $v$
DECLARE
  v_n int;
  v_marker text; v_ref text;
  v_gate jsonb;
BEGIN
  SELECT marker, project_ref INTO v_marker, v_ref FROM public._fiscal_staging_marker;
  IF v_marker IS DISTINCT FROM 'STAGING' OR v_ref IS DISTINCT FROM 'ikaauvsflpmamgxmkhoq' THEN
    RAISE EXCEPTION 'POSTCHECK_ABORT: ambiente nao autorizado';
  END IF;

  -- T1: zero grants anon/PUBLIC nas 14 relações
  SELECT count(*) INTO v_n FROM information_schema.role_table_grants
  WHERE table_schema='public' AND grantee IN ('anon','PUBLIC')
    AND table_name IN ('microrganismos','microorganism_fiscal_profiles','microorganism_targets',
      'microorganism_technical_profiles','microorganism_crop_recommendations',
      'fiscal_invoice_references','fiscal_invoice_item_references','fiscal_stock_loss_contexts',
      'v_fiscal_company_readiness','v_fiscal_certificate_readiness','v_product_fiscal_readiness',
      'v_service_fiscal_readiness','v_customer_fiscal_readiness','v_microorganism_fiscal_readiness');
  IF v_n <> 0 THEN RAISE EXCEPTION 'T1 FAIL: % grants anon/PUBLIC', v_n; END IF;

  -- T2: nenhuma policy TO anon/public nessas tabelas
  SELECT count(*) INTO v_n FROM pg_policies
  WHERE schemaname='public'
    AND tablename IN ('microrganismos','microorganism_fiscal_profiles','microorganism_targets',
      'microorganism_technical_profiles','microorganism_crop_recommendations',
      'fiscal_invoice_references','fiscal_invoice_item_references','fiscal_stock_loss_contexts')
    AND (roles::text[] && ARRAY['anon','public']);
  IF v_n <> 0 THEN RAISE EXCEPTION 'T2 FAIL: % policies permissivas p/ anon/public', v_n; END IF;

  -- T3: authenticated mantém privilégio mínimo necessário
  SELECT count(*) INTO v_n FROM information_schema.role_table_grants
  WHERE table_schema='public' AND grantee='authenticated'
    AND privilege_type IN ('TRUNCATE','REFERENCES','TRIGGER')
    AND table_name IN ('microrganismos','microorganism_fiscal_profiles','microorganism_targets',
      'microorganism_technical_profiles','microorganism_crop_recommendations',
      'fiscal_invoice_references','fiscal_invoice_item_references','fiscal_stock_loss_contexts');
  IF v_n <> 0 THEN RAISE EXCEPTION 'T3 FAIL: % privilegios estruturais residuais', v_n; END IF;

  -- T4: as 3 classificações sintéticas estão quarentenadas
  SELECT count(*) INTO v_n FROM public.microorganism_fiscal_profiles
  WHERE id='5b3817dd-9894-408f-b4f2-06bb57f6fb56'::uuid
    AND profile_status='BLOCKED' AND is_active=false;
  IF v_n <> 1 THEN RAISE EXCEPTION 'T4 FAIL: perfil micro nao quarentenado'; END IF;

  SELECT count(*) INTO v_n FROM public.product_fiscal_profiles
  WHERE id IN ('e848af9d-1a10-4066-9d98-b03a49c284b8'::uuid,'4120a677-0d7f-46a6-aa6a-48b748b879ba'::uuid)
    AND profile_status='BLOCKED' AND is_active=false;
  IF v_n <> 2 THEN RAISE EXCEPTION 'T5 FAIL: perfis produto nao quarentenados'; END IF;

  -- T6: nenhum perfil deletado (valores fiscais preservados)
  SELECT count(*) INTO v_n FROM public.microorganism_fiscal_profiles WHERE ncm IS NOT NULL;
  IF v_n <> 1 THEN RAISE EXCEPTION 'T6 FAIL: perda de dados fiscais em microrganismos'; END IF;
  SELECT count(*) INTO v_n FROM public.product_fiscal_profiles;
  IF v_n <> 2 THEN RAISE EXCEPTION 'T6 FAIL: perda de linhas em product_fiscal_profiles'; END IF;

  -- T7: auditoria old/new gerada
  SELECT count(*) INTO v_n FROM public.fiscal_audit_log
  WHERE action='UPDATE' AND old_values IS NOT NULL AND new_values IS NOT NULL
    AND record_id IN ('5b3817dd-9894-408f-b4f2-06bb57f6fb56'::uuid,
                      'e848af9d-1a10-4066-9d98-b03a49c284b8'::uuid,
                      '4120a677-0d7f-46a6-aa6a-48b748b879ba'::uuid);
  IF v_n < 3 THEN RAISE EXCEPTION 'T7 FAIL: auditoria old/new ausente (% linhas)', v_n; END IF;

  -- T8: CRT 3 + CSOSN => bloqueio
  v_gate := public.fn_fiscal_item_profile_gate_eval('PRODUCT','3',true,'VALIDATED',now(),NULL,
    'desc','L','L','38089299','0','5102','6102',NULL,'102','01','01');
  IF (v_gate->>'ready')::boolean THEN RAISE EXCEPTION 'T8 FAIL: CRT3+CSOSN aceito'; END IF;
  IF NOT (v_gate->'pendencies' @> '[{"code":"CSOSN_NOT_ALLOWED_FOR_CRT3"}]'::jsonb)
    THEN RAISE EXCEPTION 'T8 FAIL: codigo CSOSN_NOT_ALLOWED_FOR_CRT3 ausente'; END IF;

  -- T9: CST + CSOSN simultâneos => bloqueio
  v_gate := public.fn_fiscal_item_profile_gate_eval('PRODUCT','3',true,'VALIDATED',now(),NULL,
    'desc','L','L','38089299','0','5102','6102','00','102','01','01');
  IF NOT (v_gate->'pendencies' @> '[{"code":"CST_AND_CSOSN_CONFLICT"}]'::jsonb)
    THEN RAISE EXCEPTION 'T9 FAIL: conflito CST+CSOSN nao detectado'; END IF;

  -- T10: sem validação contábil => bloqueio
  v_gate := public.fn_fiscal_item_profile_gate_eval('PRODUCT','3',true,'VALIDATED',NULL,NULL,
    'desc','L','L','38089299','0','5102','6102','00',NULL,'01','01');
  IF NOT (v_gate->'pendencies' @> '[{"code":"ACCOUNTING_NOT_VALIDATED"}]'::jsonb)
    THEN RAISE EXCEPTION 'T10 FAIL: falta de validacao contabil aceita'; END IF;

  -- T11: perfil sintético/quarentenado => NOT_READY
  v_gate := public.fn_fiscal_item_profile_gate_eval('PRODUCT','3',false,'BLOCKED',now(),
    'QUARENTENA F1: classificacao sintetica','desc','L','L','38089299','0','5102','6102','00',NULL,'01','01');
  IF (v_gate->>'status') <> 'NOT_READY' OR NOT (v_gate->>'quarantined')::boolean
    THEN RAISE EXCEPTION 'T11 FAIL: perfil quarentenado nao bloqueado'; END IF;

  -- T12: caminho feliz permanece possível (não há bloqueio universal)
  v_gate := public.fn_fiscal_item_profile_gate_eval('PRODUCT','3',true,'VALIDATED',now(),
    'Validado por contabilidade com laudo tecnico','Desc fiscal','L','L','38089299','0','5102','6102','00',NULL,'01','01');
  IF NOT (v_gate->>'ready')::boolean
    THEN RAISE EXCEPTION 'T12 FAIL: gate rejeita perfil integralmente valido: %', v_gate->'pendencies'; END IF;

  -- T13: nenhum microrganismo ficou fiscalmente pronto e nenhum recebeu classificação
  SELECT count(*) INTO v_n FROM public.v_microorganism_fiscal_readiness WHERE fiscally_ready IS TRUE;
  IF v_n <> 0 THEN RAISE EXCEPTION 'T13 FAIL: % microrganismos marcados como prontos', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.microrganismos;
  IF v_n <> 24 THEN RAISE EXCEPTION 'T13 FAIL: contagem de microrganismos alterada (%)', v_n; END IF;

  -- T14: integridade comercial/financeira inalterada
  IF (SELECT count(*) FROM public.partner_orders) <> 3
     OR (SELECT count(*) FROM public.accounts_receivable) <> 2
     OR (SELECT count(*) FROM public.fiscal_invoices) <> 0
     OR (SELECT count(*) FROM public.fiscal_invoice_items) <> 0
  THEN RAISE EXCEPTION 'T14 FAIL: contagens de pedidos/recebiveis/documentos alteradas'; END IF;

  -- T15: emitente intocado
  IF (SELECT md5(string_agg(t::text,'|' ORDER BY t::text)) FROM public.company_fiscal_settings t)
     <> '41398afe3328ef0e517f55697a754d7e'
  THEN RAISE EXCEPTION 'T15 FAIL: company_fiscal_settings alterada'; END IF;

  RAISE NOTICE 'POSTCHECK_FASE_F1_PASS';
END
$v$;
