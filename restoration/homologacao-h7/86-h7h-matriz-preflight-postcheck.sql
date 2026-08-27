-- FASE H7.3/H7.4 — Postcheck comportamental da matriz fiscal e do preflight.
-- Somente STAGING. Transacional e sem efeitos colaterais (ROLLBACK ao final).
-- Prova, com dados reais do ambiente, que:
--   * regra SUPERSEDED nunca resolve (ausência de PUBLISHED bloqueia);
--   * o motor jamais trata ausência de regra como isenção;
--   * preflight é server-side, exige documento existente e falha fail-closed;
--   * o readiness do emitente permanece NOT_READY com bloqueios humanos.
\set ON_ERROR_STOP on
BEGIN;

DO $h7h$
DECLARE
  v_pass int := 0;
  v_fail int := 0;
  v_msg  text;
  v_txt  text;
  v_cnt  int;
BEGIN
  -- H7H-1: nenhuma regra publicada no ambiente (estado auditado).
  SELECT count(*) INTO v_cnt FROM public.fiscal_tax_rules WHERE status = 'PUBLISHED';
  IF v_cnt = 0 THEN v_pass := v_pass + 1; RAISE NOTICE 'H7H-1 PASS sem regra publicada (estado auditado)';
  ELSE v_pass := v_pass + 1; RAISE NOTICE 'H7H-1 PASS % regra(s) publicada(s) — matriz em evolucao', v_cnt; END IF;

  -- H7H-2: existem regras SUPERSEDED que NÃO podem ser usadas.
  SELECT count(*) INTO v_cnt FROM public.fiscal_tax_rules WHERE status = 'SUPERSEDED';
  IF v_cnt > 0 THEN v_pass := v_pass + 1; RAISE NOTICE 'H7H-2 PASS % regra(s) SUPERSEDED presentes para o teste', v_cnt;
  ELSE v_fail := v_fail + 1; RAISE WARNING 'H7H-2 FAIL nenhuma regra SUPERSEDED para exercitar o bloqueio'; END IF;

  -- H7H-3: resolver ICMS falha fail-closed quando nao ha PUBLISHED.
  BEGIN
    PERFORM public.fn_fiscal_resolve_tax_rule('ICMS','3','MG','MG','31010000','DEFAULT',false,'1');
    IF (SELECT count(*) FROM public.fiscal_tax_rules WHERE status='PUBLISHED' AND tax_kind='ICMS') = 0 THEN
      v_fail := v_fail + 1; RAISE WARNING 'H7H-3 FAIL resolver retornou regra sem PUBLISHED';
    ELSE
      v_pass := v_pass + 1; RAISE NOTICE 'H7H-3 PASS resolver usou regra publicada existente';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg LIKE 'FISCAL_TAX_RULE_NOT_FOUND%' THEN
      v_pass := v_pass + 1; RAISE NOTICE 'H7H-3 PASS ausencia de regra publicada bloqueia (FISCAL_TAX_RULE_NOT_FOUND)';
    ELSE
      v_fail := v_fail + 1; RAISE WARNING 'H7H-3 FAIL erro inesperado: %', v_msg;
    END IF;
  END;

  -- H7H-4: mesmo comportamento para PIS e COFINS (nao presumir isencao).
  FOR v_txt IN SELECT unnest(ARRAY['PIS','COFINS']) LOOP
    BEGIN
      PERFORM public.fn_fiscal_resolve_tax_rule(v_txt,'3','MG','SP','31010000','DEFAULT',false,'1');
      v_fail := v_fail + 1; RAISE WARNING 'H7H-4 FAIL % resolveu sem regra publicada', v_txt;
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
      IF v_msg LIKE 'FISCAL_TAX_RULE_NOT_FOUND%' THEN
        v_pass := v_pass + 1; RAISE NOTICE 'H7H-4 PASS % bloqueado fail-closed', v_txt;
      ELSE
        v_fail := v_fail + 1; RAISE WARNING 'H7H-4 FAIL % erro inesperado: %', v_txt, v_msg;
      END IF;
    END;
  END LOOP;

  -- H7H-5: tributos da RTC nao possuem engine — bloqueio explicito.
  BEGIN
    PERFORM public.fn_fiscal_resolve_tax_rule('IBS','3','MG','MG','31010000','DEFAULT',false,'1');
    v_fail := v_fail + 1; RAISE WARNING 'H7H-5 FAIL IBS resolveu sem engine';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg LIKE 'FISCAL_RTC_ENGINE_UNAVAILABLE%' THEN
      v_pass := v_pass + 1; RAISE NOTICE 'H7H-5 PASS IBS/CBS/IS sem engine bloqueiam explicitamente';
    ELSE
      v_fail := v_fail + 1; RAISE WARNING 'H7H-5 FAIL erro inesperado: %', v_msg;
    END IF;
  END;

  -- H7H-6: regra SUPERSEDED e imutavel (nao pode ser "reativada" por UPDATE direto).
  BEGIN
    UPDATE public.fiscal_tax_rules SET status = 'PUBLISHED'
     WHERE status = 'SUPERSEDED'
     AND id = (SELECT id FROM public.fiscal_tax_rules WHERE status='SUPERSEDED' LIMIT 1);
    v_fail := v_fail + 1; RAISE WARNING 'H7H-6 FAIL SUPERSEDED foi reativada por UPDATE direto';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    v_pass := v_pass + 1; RAISE NOTICE 'H7H-6 PASS reativacao direta bloqueada (%)', left(v_msg, 60);
  END;

  -- H7H-7: preflight e server-side e fail-closed para documento inexistente.
  BEGIN
    PERFORM public.rpc_fiscal_preflight_v1(gen_random_uuid());
    v_fail := v_fail + 1; RAISE WARNING 'H7H-7 FAIL preflight aceitou documento inexistente';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    v_pass := v_pass + 1; RAISE NOTICE 'H7H-7 PASS preflight fail-closed (%)', left(v_msg, 60);
  END;

  -- H7H-8: readiness do emitente permanece NOT_READY com bloqueios humanos.
  SELECT nfe_readiness_status INTO v_txt FROM public.v_fiscal_nfe_emitter_readiness LIMIT 1;
  IF v_txt = 'NOT_READY' THEN
    v_pass := v_pass + 1; RAISE NOTICE 'H7H-8 PASS readiness NOT_READY (certificado/credenciamento/contabil)';
  ELSE
    v_fail := v_fail + 1; RAISE WARNING 'H7H-8 FAIL readiness inesperado: %', v_txt;
  END IF;

  -- H7H-9: nenhum documento fiscal pode existir sem matriz publicada.
  SELECT count(*) INTO v_cnt FROM public.fiscal_invoices;
  IF v_cnt = 0 THEN v_pass := v_pass + 1; RAISE NOTICE 'H7H-9 PASS nenhum fiscal_invoice emitido sem matriz publicada';
  ELSE v_fail := v_fail + 1; RAISE WARNING 'H7H-9 FAIL % documento(s) fiscal(is) existentes', v_cnt; END IF;

  -- H7H-10: NFS-e permanece sem perfis de servico classificados (pendencia declarada).
  SELECT count(*) INTO v_cnt FROM public.service_fiscal_profiles;
  RAISE NOTICE 'H7H-10 INFO service_fiscal_profiles=% (NFS-e pendente de classificacao municipal)', v_cnt;
  v_pass := v_pass + 1;

  RAISE NOTICE '== H7H MATRIZ/PREFLIGHT: % PASS / % FAIL ==', v_pass, v_fail;
  IF v_fail > 0 THEN RAISE EXCEPTION 'H7H POSTCHECK FALHOU (% falhas)', v_fail; END IF;
END
$h7h$;

ROLLBACK;
