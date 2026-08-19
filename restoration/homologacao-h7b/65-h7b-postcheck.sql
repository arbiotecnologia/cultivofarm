-- FASE H7b — Postcheck consolidado (transacional, termina em ROLLBACK).
-- Auditoria complementar exigida antes do gate: idempotência, ambiente,
-- privilégios, imutabilidade, append-only e preflight.
BEGIN;

DO $guard$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.fiscal_environment_marker
                  WHERE project_ref='ikaauvsflpmamgxmkhoq'
                    AND environment_label='STAGING'
                    AND production_emission_allowed=false) THEN
    RAISE EXCEPTION 'H7b POSTCHECK GUARD: ambiente nao autorizado.';
  END IF;
END $guard$;

CREATE TEMP TABLE _r(teste text, resultado text) ON COMMIT DROP;
CREATE OR REPLACE FUNCTION pg_temp.chk(_t text, _ok boolean, _info text DEFAULT '')
RETURNS void LANGUAGE sql AS $$
  INSERT INTO _r VALUES (_t, CASE WHEN _ok THEN 'PASS' ELSE 'FAIL '||_info END);
$$;

-- T1 chave de idempotência obrigatória no corpo da RPC
SELECT pg_temp.chk('T1 RPC exige idempotency_key',
  (SELECT position('FISCAL_IDEMPOTENCY_REQUIRED' in prosrc) > 0
     FROM pg_proc WHERE proname='rpc_fiscal_event_manual'));

-- T2 conflito de payload detectado
SELECT pg_temp.chk('T2 RPC detecta conflito de payload',
  (SELECT position('FISCAL_IDEMPOTENCY_CONFLICT' in prosrc) > 0
     FROM pg_proc WHERE proname='rpc_fiscal_event_manual'));

-- T3 fingerprint persistido na própria tabela (sem tabela paralela)
SELECT pg_temp.chk('T3 fiscal_events.payload_fingerprint existe',
  EXISTS (SELECT 1 FROM information_schema.columns
           WHERE table_schema='public' AND table_name='fiscal_events'
             AND column_name='payload_fingerprint'));

-- T4 advisory lock por documento preservado
SELECT pg_temp.chk('T4 advisory lock por documento',
  (SELECT position('pg_advisory_xact_lock' in prosrc) > 0
     FROM pg_proc WHERE proname='rpc_fiscal_event_manual'));

-- T5 índice único de idempotência de evento
SELECT pg_temp.chk('T5 unique de idempotencia em fiscal_events',
  EXISTS (SELECT 1 FROM pg_indexes
           WHERE schemaname='public' AND tablename='fiscal_events'
             AND indexdef ILIKE '%UNIQUE%' AND indexdef ILIKE '%idempotency_key%'));

-- T6 tpAmb do emitente ativo = 2 (homologação), emitente único
SELECT pg_temp.chk('T6 emitente ativo unico com tpAmb=2',
  (SELECT count(*)=1 FROM public.company_fiscal_settings
    WHERE is_active AND nfe_environment_code='2'),
  (SELECT coalesce(string_agg(coalesce(nfe_environment_code,'<null>'),','),'<nenhum>')
     FROM public.company_fiscal_settings WHERE is_active));

-- T7 gate de ambiente aprova homologação
DO $t7$
DECLARE ok boolean := false;
BEGIN
  BEGIN
    PERFORM public.fn_fiscal_environment_gate_v1();
    ok := true;
  EXCEPTION WHEN OTHERS THEN ok := false;
  END;
  PERFORM pg_temp.chk('T7 gate aprova tpAmb=2', ok);
END $t7$;

-- T8 simulação transacional de produção continua bloqueada
DO $t8$
DECLARE blocked boolean := false;
BEGIN
  UPDATE public.company_fiscal_settings SET nfe_environment_code='1' WHERE is_active;
  BEGIN
    PERFORM public.fn_fiscal_environment_gate_v1();
  EXCEPTION WHEN OTHERS THEN blocked := true;
  END;
  UPDATE public.company_fiscal_settings SET nfe_environment_code='2' WHERE is_active;
  PERFORM pg_temp.chk('T8 tpAmb=1 bloqueado pelo gate', blocked);
END $t8$;

-- T9 marcador de ambiente não gravável por authenticated
SELECT pg_temp.chk('T9 marcador sem escrita para authenticated',
  NOT (has_table_privilege('authenticated','public.fiscal_environment_marker','INSERT')
    OR has_table_privilege('authenticated','public.fiscal_environment_marker','UPDATE')
    OR has_table_privilege('authenticated','public.fiscal_environment_marker','DELETE')));

-- T10 anon sem EXECUTE em qualquer função fiscal/NFe
SELECT pg_temp.chk('T10 anon sem EXECUTE fiscal',
  NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public'
       AND (p.proname ILIKE '%fiscal%' OR p.proname ILIKE '%nfe%' OR p.proname ILIKE 'fn_h6c%')
       AND has_function_privilege('anon', p.oid, 'EXECUTE')));

-- T11 trigger functions H6c sem privilégio para PUBLIC/anon/authenticated
SELECT pg_temp.chk('T11 H6-P2 triggers com menor privilegio',
  NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public'
       AND p.proname IN ('fn_h6c_entrega_ar_b2b_link','fn_h6c_set_canonical_payment_terms')
       AND (has_function_privilege('anon', p.oid,'EXECUTE')
         OR has_function_privilege('authenticated', p.oid,'EXECUTE'))));

-- T12 RLS habilitada em todas as tabelas fiscais
SELECT pg_temp.chk('T12 RLS em todas as tabelas fiscais',
  NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
               WHERE n.nspname='public' AND c.relkind='r'
                 AND c.relname LIKE 'fiscal%' AND NOT c.relrowsecurity));

-- T13 SECURITY DEFINER fiscal com search_path explícito
SELECT pg_temp.chk('T13 search_path fixo em SECURITY DEFINER fiscal',
  NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
               WHERE n.nspname='public' AND p.prosecdef
                 AND (p.proname ILIKE '%fiscal%' OR p.proname ILIKE '%nfe%')
                 AND (p.proconfig IS NULL
                   OR NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) cfg
                                   WHERE cfg LIKE 'search_path=%'))));

-- T14 registro manual exige evidência externa para estado emitido
SELECT pg_temp.chk('T14 registro manual exige chave/numero externos',
  (SELECT position('FISCAL_MANUAL_EVIDENCE_REQUIRED' in prosrc) > 0
     FROM pg_proc WHERE proname='rpc_upsert_fiscal_invoice_manual'));

-- T15 registro manual marca origem canônica e provedor NONE
SELECT pg_temp.chk('T15 registro manual marca MANUAL_RECORD/NONE',
  (SELECT position('MANUAL_RECORD' in prosrc) > 0 AND position('''NONE''' in prosrc) > 0
     FROM pg_proc WHERE proname='rpc_upsert_fiscal_invoice_manual'));

-- T16 registro manual não sobrescreve documento terminal nem do motor
SELECT pg_temp.chk('T16 registro manual respeita lock e motor',
  (SELECT position('FISCAL_DOCUMENT_LOCKED' in prosrc) > 0
      AND position('FISCAL_DOCUMENT_ENGINE_MANAGED' in prosrc) > 0
     FROM pg_proc WHERE proname='rpc_upsert_fiscal_invoice_manual'));

-- T17 fiscal_events append-only
SELECT pg_temp.chk('T17 fiscal_events append-only',
  EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.fiscal_events'::regclass
            AND tgname='trg_h7_fiscal_events_append_only' AND NOT tgisinternal));

-- T18 imutabilidade econômica de documento terminal
SELECT pg_temp.chk('T18 trigger de imutabilidade do documento',
  EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.fiscal_invoices'::regclass
            AND tgname='trg_h7_fiscal_invoice_immutable' AND NOT tgisinternal));

-- T19 numeração com lock + unicidade + idempotência + gate
SELECT pg_temp.chk('T19 numeracao NFe protegida',
  (SELECT position('FOR UPDATE' in prosrc)>0 AND position('pg_advisory' in prosrc)>0
      AND position('idempotency_key' in prosrc)>0
      AND position('assert_environment_homologation' in prosrc)>0
     FROM pg_proc WHERE proname='rpc_fiscal_reserve_nfe_number_v1'));

-- T20 XML prepare/record sob gate de homologação
SELECT pg_temp.chk('T20 XML prepare/record com gate',
  (SELECT bool_and(position('assert_environment_homologation' in prosrc)>0
                OR position('fn_fiscal_environment_gate_v1' in prosrc)>0)
     FROM pg_proc WHERE proname IN ('rpc_fiscal_xml_prepare_v1','rpc_fiscal_xml_record_v1')));

-- T21 preflight verifica total e prontidão
SELECT pg_temp.chk('T21 preflight valida total/prontidao',
  (SELECT position('total' in prosrc)>0 AND position('gate' in lower(prosrc))>0
     FROM pg_proc WHERE proname='rpc_fiscal_preflight_v1'));

-- T22 zero resíduos de harness
SELECT pg_temp.chk('T22 sem residuos de harness fiscal',
  NOT EXISTS (SELECT 1 FROM public.fiscal_invoices
               WHERE status='DRAFT' AND invoice_number IS NULL AND access_key IS NULL
                 AND coalesce(total_amount,0)=0 AND receivable_id IS NULL));

SELECT teste, resultado FROM _r ORDER BY teste;
SELECT count(*) FILTER (WHERE resultado='PASS') AS pass,
       count(*) FILTER (WHERE resultado<>'PASS') AS fail FROM _r;

ROLLBACK;
