-- ============================================================================
-- VERIFY RESTORATION — Fluxo unificado de atendimento técnico
-- Executar DEPOIS de `rollback.sql`. Read-only: nenhum DDL/DML.
-- Falha (RAISE EXCEPTION) se qualquer invariante não for satisfeita, INCLUSIVE
-- divergência de checksum SHA-256 contra as constantes esperadas do baseline.
-- ============================================================================

DO $verify$
DECLARE
  c_expected constant text := 'ikaauvsflpmamgxmkhoq';
  c_prod     constant text := 'navfzbwgwzruipouyfnk';
  -- Checksums esperados APÓS o rollback (estado pré-fase), obtidos por
  -- ensaio transacional em staging em 2026-08-05.
  c_sum_motor constant text :=
    '078fef67f89889dbe139904c2cb4405ce68b0e601bb25a3359bb044b5f21b057';
  c_sum_resp  constant text :=
    '42e3a861241a22a60773b54b0ea3a990a7fd6533d6551ff74652dcc6b6c737d9';
  v_ref text;
  v_oid oid;
  v_resp_oid oid;
  v_checksum text;
  v_n int;
BEGIN
  -- Guard fail-closed (também na verificação)
  IF to_regclass('public._fiscal_staging_marker') IS NULL THEN
    RAISE EXCEPTION 'GUARD_ABORT: marcador de staging inexistente';
  END IF;
  SELECT project_ref INTO v_ref FROM public._fiscal_staging_marker WHERE marker='STAGING' LIMIT 1;
  IF v_ref = c_prod OR v_ref IS DISTINCT FROM c_expected THEN
    RAISE EXCEPTION 'GUARD_ABORT: ambiente % nao autorizado', coalesce(v_ref,'<null>');
  END IF;

  -- V1: RPCs da fase removidas
  IF to_regprocedure('public.rpc_listar_atendimentos_tecnicos_v1(text,text,integer,integer)') IS NOT NULL THEN
    RAISE EXCEPTION 'V1 FAIL: rpc_listar_atendimentos_tecnicos_v1 ainda existe';
  END IF;
  IF to_regprocedure('public.rpc_iniciar_atendimento_solicitacao_v1(uuid,uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'V1 FAIL: rpc_iniciar_atendimento_solicitacao_v1 ainda existe';
  END IF;
  IF to_regprocedure('public.rpc_resumo_atendimentos_tecnicos_v1()') IS NOT NULL THEN
    RAISE EXCEPTION 'V1 FAIL: rpc_resumo_atendimentos_tecnicos_v1 ainda existe';
  END IF;
  RAISE NOTICE 'V1 OK: RPCs da fase removidas';

  -- V2: motor único preservado, assinatura intacta (23 argumentos)
  v_oid := to_regprocedure('public.rpc_criar_visita_idempotente(
    uuid,uuid,uuid,uuid,uuid,date,tipo_visita,text,text,text,uuid,
    text,categoria_problema_consultor,nivel_pressao,numeric,urgencia_consultor,
    text,text,text,numeric,numeric,numeric,uuid)')::oid;
  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'V2 FAIL: motor unico ausente apos rollback (chamadores quebrariam)';
  END IF;
  IF (SELECT pronargs FROM pg_proc WHERE oid = v_oid) <> 23 THEN
    RAISE EXCEPTION 'V2 FAIL: aridade inesperada';
  END IF;
  RAISE NOTICE 'V2 OK: motor unico presente com assinatura de 23 argumentos';

  -- V3: sem overload ambíguo (exatamente UMA função por nome)
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='rpc_criar_visita_idempotente';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'V3 FAIL: % overloads de rpc_criar_visita_idempotente (ambiguidade)', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='is_visit_responsible';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'V3 FAIL: % overloads de is_visit_responsible', v_n;
  END IF;
  RAISE NOTICE 'V3 OK: sem overload ambiguo';

  -- V4: grants — authenticated SIM, anon/PUBLIC NAO
  v_resp_oid := to_regprocedure('public.is_visit_responsible(uuid,uuid)')::oid;
  IF v_resp_oid IS NULL THEN
    RAISE EXCEPTION 'V4 FAIL: is_visit_responsible ausente apos rollback';
  END IF;
  IF NOT has_function_privilege('authenticated', v_oid, 'EXECUTE')
     OR NOT has_function_privilege('authenticated', v_resp_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'V4 FAIL: authenticated sem EXECUTE';
  END IF;
  IF has_function_privilege('anon', v_oid, 'EXECUTE')
     OR has_function_privilege('anon', v_resp_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'V4 FAIL: anon possui EXECUTE (vazamento)';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
     WHERE p.oid IN (v_oid, v_resp_oid) AND a.grantee = 0 AND a.privilege_type = 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'V4 FAIL: PUBLIC possui EXECUTE (vazamento)';
  END IF;
  RAISE NOTICE 'V4 OK: grants corretos (authenticated=yes, anon/PUBLIC=no)';

  -- V5: SECURITY DEFINER + search_path fixo nas duas funções
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid=v_oid)
     OR NOT (SELECT prosecdef FROM pg_proc WHERE oid=v_resp_oid) THEN
    RAISE EXCEPTION 'V5 FAIL: funcao sem SECURITY DEFINER';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=v_oid AND proconfig @> ARRAY['search_path=public'])
     OR NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=v_resp_oid AND proconfig @> ARRAY['search_path=public']) THEN
    RAISE EXCEPTION 'V5 FAIL: search_path nao fixado em public';
  END IF;
  RAISE NOTICE 'V5 OK: SECURITY DEFINER + search_path=public';

  -- V6: PRESERVAÇÃO DE DADOS — coluna origem_atendimento intacta
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='registros_consultor'
                    AND column_name='origem_atendimento') THEN
    RAISE EXCEPTION 'V6 FAIL: origem_atendimento foi removida (perda de dados)';
  END IF;
  SELECT count(*) INTO v_n FROM public.registros_consultor WHERE origem_atendimento IS NOT NULL;
  RAISE NOTICE 'V6 OK: origem_atendimento preservada (% linhas com origem)', v_n;

  -- V7: CHECKSUM COMPARADO (falha em divergência)
  SELECT encode(digest(pg_get_functiondef(v_oid), 'sha256'), 'hex') INTO v_checksum;
  IF v_checksum IS DISTINCT FROM c_sum_motor THEN
    RAISE EXCEPTION 'V7 FAIL: checksum motor esperado % obtido %', c_sum_motor, v_checksum;
  END IF;
  SELECT encode(digest(pg_get_functiondef(v_resp_oid), 'sha256'), 'hex') INTO v_checksum;
  IF v_checksum IS DISTINCT FROM c_sum_resp THEN
    RAISE EXCEPTION 'V7 FAIL: checksum is_visit_responsible esperado % obtido %', c_sum_resp, v_checksum;
  END IF;
  RAISE NOTICE 'V7 OK: checksums SHA-256 conferem com o baseline esperado';

  -- V8: nenhum status invalido referenciado nas definicoes restauradas
  IF EXISTS (
    SELECT 1 FROM pg_proc WHERE oid IN (v_oid, v_resp_oid)
       AND pg_get_functiondef(oid) LIKE '%ajuste_solicitado%'
  ) THEN
    RAISE EXCEPTION 'V8 FAIL: status inexistente ajuste_solicitado presente na definicao';
  END IF;
  RAISE NOTICE 'V8 OK: sem referencia a status inexistente';

  RAISE NOTICE 'VERIFY_RESTORATION_OK';
END
$verify$;

-- Saída tabular auxiliar (evidência para o relatório)
SELECT
  p.proname,
  p.pronargs,
  p.prosecdef,
  p.provolatile,
  p.proconfig,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec,
  has_function_privilege('anon', p.oid, 'EXECUTE')          AS anon_exec,
  encode(digest(pg_get_functiondef(p.oid), 'sha256'), 'hex') AS checksum_sha256
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('rpc_criar_visita_idempotente','is_visit_responsible')
ORDER BY p.proname;
