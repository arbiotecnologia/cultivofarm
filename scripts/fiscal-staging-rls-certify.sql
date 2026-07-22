-- =====================================================================
-- Fase Fiscal 3.11 — Harness RLS SQL-nativo (staging temporário)
--
-- Executar SOMENTE no SQL Editor do Supabase de staging, como postgres,
-- no projeto marcado por public._fiscal_staging_marker (marker='STAGING').
--
-- NUNCA executar em navfzbwgwzruipouyfnk (produção).
-- NUNCA colar segredos aqui. Este script não recebe secrets: usa apenas
-- SET LOCAL role/claims para simular sessões RLS.
--
-- Uso:
--   1. Confirmar staging: SELECT * FROM public._fiscal_staging_marker;
--   2. Copiar todo este arquivo no SQL Editor e executar.
--   3. Exportar a última tabela (resultado) e o resumo final.
--
-- Namespace sintético (todo write usa este prefixo/UUIDs determinísticos):
--   FISCAL_TEST_RLS_311_*
-- =====================================================================
\set ON_ERROR_STOP on

BEGIN;

-- ---------------------------------------------------------------------
-- Guard fail-fast: marker STAGING obrigatório + rejeição de produção
-- ---------------------------------------------------------------------
DO $guard$
DECLARE
  v_ref text;
BEGIN
  SELECT project_ref INTO v_ref
    FROM public._fiscal_staging_marker
   WHERE marker = 'STAGING'
   LIMIT 1;

  IF v_ref IS NULL OR v_ref = '' THEN
    RAISE EXCEPTION 'ABORT 3.11: marker STAGING ausente ou project_ref nulo';
  END IF;
  IF v_ref = 'navfzbwgwzruipouyfnk' THEN
    RAISE EXCEPTION 'ABORT 3.11: project_ref aponta para PRODUÇÃO';
  END IF;

  -- Exposição apenas mascarada nos resultados
  PERFORM set_config(
    'fiscal.masked_ref',
    left(v_ref, 4) || '***' || right(v_ref, 3),
    true
  );
  PERFORM set_config('fiscal.staging_ref', v_ref, true);
END
$guard$;

-- ---------------------------------------------------------------------
-- Tabela temporária de resultados (persiste até COMMIT/ROLLBACK)
-- Criada ON COMMIT PRESERVE ROWS para permitir SELECT final antes do end.
-- ---------------------------------------------------------------------
CREATE TEMP TABLE IF NOT EXISTS _fiscal_rls_311_results (
  assertion_id  text PRIMARY KEY,
  categoria     text NOT NULL,
  perfil        text NOT NULL,
  objeto        text NOT NULL,
  operacao      text NOT NULL,
  esperado      text NOT NULL,
  observado     text,
  status        text NOT NULL CHECK (status IN ('passed','failed','error','skipped')),
  detail        text
) ON COMMIT PRESERVE ROWS;

CREATE OR REPLACE FUNCTION pg_temp._rec(
  p_id text, p_cat text, p_perfil text, p_obj text, p_op text,
  p_exp text, p_obs text, p_status text, p_detail text
) RETURNS void LANGUAGE sql AS $$
  INSERT INTO _fiscal_rls_311_results
    VALUES (p_id, p_cat, p_perfil, p_obj, p_op, p_exp,
            p_obs, p_status,
            -- Sanitize: nunca gravar sub, jwt, key, senha
            regexp_replace(coalesce(p_detail,''),
              '(sub|jwt|token|key|password|secret)[^,;]{0,80}', '\1=***', 'gi'))
  ON CONFLICT (assertion_id) DO UPDATE
    SET observado = EXCLUDED.observado,
        status    = EXCLUDED.status,
        detail    = EXCLUDED.detail;
$$;

-- ---------------------------------------------------------------------
-- Limpeza defensiva ANTES de qualquer write (apenas namespace sintético)
-- ---------------------------------------------------------------------
DO $cleanup_pre$
BEGIN
  DELETE FROM public.fiscal_audit_log        WHERE record_id::text LIKE 'FISCAL_TEST_RLS_311_%'
                                                OR (new_data->>'notes') LIKE 'FISCAL_TEST_RLS_311_%';
  DELETE FROM public.fiscal_events           WHERE notes LIKE 'FISCAL_TEST_RLS_311_%';
  DELETE FROM public.fiscal_invoice_items    WHERE description LIKE 'FISCAL_TEST_RLS_311_%';
  DELETE FROM public.fiscal_idempotency_keys WHERE idempotency_key LIKE 'FISCAL_TEST_RLS_311_%';
  DELETE FROM public.fiscal_invoices         WHERE notes LIKE 'FISCAL_TEST_RLS_311_%';
  DELETE FROM public.customer_fiscal_profiles WHERE notes LIKE 'FISCAL_TEST_RLS_311_%';
  DELETE FROM public.product_fiscal_profiles  WHERE notes LIKE 'FISCAL_TEST_RLS_311_%';
  DELETE FROM public.service_fiscal_profiles  WHERE source_reference LIKE 'FISCAL_TEST_RLS_311_%';
  DELETE FROM public.company_fiscal_settings  WHERE cnpj LIKE 'FISCAL_TEST_RLS_311_%';
  DELETE FROM public.user_roles              WHERE user_id::text LIKE 'ff5c0311-%';
  DELETE FROM public.user_clientes           WHERE user_id::text LIKE 'ff5c0311-%';
  DELETE FROM public.clientes                WHERE nome LIKE 'FISCAL_TEST_RLS_311_%';
  DELETE FROM public.profiles                WHERE id::text LIKE 'ff5c0311-%';
EXCEPTION WHEN OTHERS THEN
  -- limpeza é best-effort; asserts posteriores confirmam resíduo=0
  RAISE NOTICE 'cleanup pré: %', SQLERRM;
END
$cleanup_pre$;

-- ---------------------------------------------------------------------
-- Fixtures determinísticas (UUIDs sob namespace ff5c0311-*)
-- ---------------------------------------------------------------------
DO $fixtures$
DECLARE
  u_admin        uuid := 'ff5c0311-0000-0000-0000-000000000001';
  u_gestor       uuid := 'ff5c0311-0000-0000-0000-000000000002';
  u_financeiro   uuid := 'ff5c0311-0000-0000-0000-000000000003';
  u_adm          uuid := 'ff5c0311-0000-0000-0000-000000000004';
  u_gcom         uuid := 'ff5c0311-0000-0000-0000-000000000005';
  u_consult      uuid := 'ff5c0311-0000-0000-0000-000000000006';
  u_tecagro      uuid := 'ff5c0311-0000-0000-0000-000000000007';
  u_aplic        uuid := 'ff5c0311-0000-0000-0000-000000000008';
  u_onfarm       uuid := 'ff5c0311-0000-0000-0000-000000000009';
  u_prod         uuid := 'ff5c0311-0000-0000-0000-00000000000a';
  u_prodA        uuid := 'ff5c0311-0000-0000-0000-00000000000b';
  u_prodB        uuid := 'ff5c0311-0000-0000-0000-00000000000c';
  u_parc         uuid := 'ff5c0311-0000-0000-0000-00000000000d';
  u_parct        uuid := 'ff5c0311-0000-0000-0000-00000000000e';
  u_sempapel     uuid := 'ff5c0311-0000-0000-0000-00000000000f';
BEGIN
  PERFORM set_config('fiscal.u_admin',      u_admin::text,      true);
  PERFORM set_config('fiscal.u_gestor',     u_gestor::text,     true);
  PERFORM set_config('fiscal.u_financeiro', u_financeiro::text, true);
  PERFORM set_config('fiscal.u_prodA',      u_prodA::text,      true);
  PERFORM set_config('fiscal.u_prodB',      u_prodB::text,      true);
  PERFORM set_config('fiscal.u_parc',       u_parc::text,       true);
  PERFORM set_config('fiscal.u_sempapel',   u_sempapel::text,   true);

  -- NOTA: Este harness NÃO cria linhas em auth.users. A simulação usa
  -- SET LOCAL request.jwt.claims + has_role() via user_roles semeados.
  -- Fixtures dependem apenas de tabelas públicas.
  RAISE NOTICE 'fixtures preparadas (namespace ff5c0311-*)';
END
$fixtures$;

-- ---------------------------------------------------------------------
-- Helper: executa assertion RLS sob claim sintética
--   set_local_claims(role_name, user_id)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pg_temp._as_role(p_role text, p_user uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', p_user::text, 'role', 'authenticated')::text,
    true
  );
END
$$;

-- ---------------------------------------------------------------------
-- Matriz canônica: 15 perfis × 9 tabelas × 4 ops + 15×5 views + 15×4 RPC
--   + 2 ownership = 540 + 75 + 60 + 2 = 677 asserções planejadas.
--
-- Divergência de 632: usamos RPC_CASES_PER_ROLE=4 (positivo + 3 negativos)
-- alinhado ao matrix.ts atual; sem inventar permissão.
-- ---------------------------------------------------------------------

-- Placeholder: registra planejamento por categoria (executa asserções
-- reais quando o harness receber os 15 usuários semeados). Cada bloco
-- registra 'skipped' com detalhe explícito quando o usuário sintético
-- ainda não existir em auth.users — a certificação exige zero skipped.
DO $plan$
DECLARE
  r record;
  ops text[] := ARRAY['SELECT','INSERT','UPDATE','DELETE'];
  tables text[] := ARRAY[
    'company_fiscal_settings','product_fiscal_profiles','service_fiscal_profiles',
    'customer_fiscal_profiles','fiscal_invoices','fiscal_invoice_items',
    'fiscal_events','fiscal_idempotency_keys','fiscal_audit_log'];
  views text[] := ARRAY[
    'v_fiscal_company_readiness','v_product_fiscal_readiness','v_service_fiscal_readiness',
    'v_customer_fiscal_readiness','v_fiscal_document_reconciliation_pending'];
  roles text[] := ARRAY[
    'administrador','gestor','financeiro','administrativo','gestor_comercial',
    'consultor_tecnico','tecnico_agronomo','aplicador','operador_onfarm','producao',
    'cliente_produtor','parceiro_b2b','parceiro_b2b_tecnico','authenticated_sem_papel','anon'];
  i int; j int; k int;
BEGIN
  -- Tabelas × operações
  FOR i IN 1..array_length(roles,1) LOOP
    FOR j IN 1..array_length(tables,1) LOOP
      FOR k IN 1..array_length(ops,1) LOOP
        PERFORM pg_temp._rec(
          format('T-%s-%s-%s', roles[i], tables[j], ops[k]),
          'table', roles[i], tables[j], ops[k],
          '(matrix.ts)','pending','skipped',
          'requer usuários sintéticos semeados (auth.users) — planejamento registrado');
      END LOOP;
    END LOOP;
  END LOOP;

  -- Views
  FOR i IN 1..array_length(roles,1) LOOP
    FOR j IN 1..array_length(views,1) LOOP
      PERFORM pg_temp._rec(
        format('V-%s-%s', roles[i], views[j]),
        'view', roles[i], views[j], 'SELECT',
        '(matrix.ts)','pending','skipped',
        'requer usuários sintéticos semeados');
    END LOOP;
  END LOOP;

  -- RPC (4 casos por perfil)
  FOR i IN 1..array_length(roles,1) LOOP
    FOR k IN 1..4 LOOP
      PERFORM pg_temp._rec(
        format('R-%s-%s', roles[i], k),
        'rpc', roles[i], 'rpc_fiscal_event_manual', 'CALL',
        CASE WHEN roles[i] IN ('administrador','gestor','financeiro') AND k=1
             THEN 'allow' ELSE 'deny' END,
        'pending','skipped','planejamento registrado');
    END LOOP;
  END LOOP;

  -- Ownership produtor A/B
  PERFORM pg_temp._rec('O-prodA-own','ownership','cliente_produtor','fiscal_invoices','SELECT',
                       'allow','pending','skipped','requer produtor A/B semeados');
  PERFORM pg_temp._rec('O-prodB-other','ownership','cliente_produtor','fiscal_invoices','SELECT',
                       'deny','pending','skipped','requer produtor A/B semeados');
END
$plan$;

-- ---------------------------------------------------------------------
-- SEÇÃO EXECUTIVA (a preencher com fixtures reais quando os 15 usuários
-- sintéticos estiverem semeados). O corpo abaixo demonstra o padrão
-- para 1 caso allow e 1 caso deny; a matriz completa segue idêntica.
--
-- Padrão allow SELECT:
--   PERFORM pg_temp._as_role('administrador', current_setting('fiscal.u_admin')::uuid);
--   PERFORM 1 FROM public.company_fiscal_settings LIMIT 1;
--   -> registrar 'passed' com contagem.
--
-- Padrão deny SELECT:
--   PERFORM pg_temp._as_role('parceiro_b2b', current_setting('fiscal.u_parc')::uuid);
--   BEGIN PERFORM 1 FROM public.company_fiscal_settings;
--     -> se zero linhas: passed; senão failed.
--   EXCEPTION WHEN insufficient_privilege THEN -> passed
--     WHEN OTHERS THEN -> error (nunca deny).
--   END;
--
-- Padrão INSERT: payload válido; qualquer 42501 => deny observado;
-- qualquer 23xxx (constraint) => error, nunca deny.
--
-- Padrão UPDATE: alterar campo mutável (ex.: notes) e verificar linha.
--
-- Padrão DELETE: usar fixture __disposable dedicada. Allow=1 linha
-- afetada; deny=0 linhas + registro preservado.
--
-- Padrão RPC allow: SELECT rpc_fiscal_event_manual(...); ler
-- fiscal_events e conferir event_source='USER', performed_by, notes.
-- Padrão RPC deny: mesma chamada -> insufficient_privilege -> passed.
-- ---------------------------------------------------------------------

-- Exemplo executável (mask_sensitive_jsonb — não depende de usuário):
DO $exec_mask$
DECLARE v jsonb;
BEGIN
  v := public.mask_sensitive_jsonb(jsonb_build_object('password','x','k','ok'));
  IF v->>'password' <> 'x' AND v->>'k' = 'ok' THEN
    PERFORM pg_temp._rec('X-mask-recursive','mask','n/a',
      'mask_sensitive_jsonb','CALL','allow','masked','passed','recursivo OK');
  ELSE
    PERFORM pg_temp._rec('X-mask-recursive','mask','n/a',
      'mask_sensitive_jsonb','CALL','allow','not-masked','failed',
      'mask não removeu campo sensível');
  END IF;
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_temp._rec('X-mask-recursive','mask','n/a',
    'mask_sensitive_jsonb','CALL','allow','exception','error', SQLERRM);
END
$exec_mask$;

-- ---------------------------------------------------------------------
-- Teardown (namespace sintético, best-effort mesmo após falhas)
-- ---------------------------------------------------------------------
DO $cleanup_post$
BEGIN
  DELETE FROM public.fiscal_audit_log        WHERE record_id::text LIKE 'FISCAL_TEST_RLS_311_%'
                                                OR (new_data->>'notes') LIKE 'FISCAL_TEST_RLS_311_%';
  DELETE FROM public.fiscal_events           WHERE notes LIKE 'FISCAL_TEST_RLS_311_%';
  DELETE FROM public.fiscal_invoice_items    WHERE description LIKE 'FISCAL_TEST_RLS_311_%';
  DELETE FROM public.fiscal_idempotency_keys WHERE idempotency_key LIKE 'FISCAL_TEST_RLS_311_%';
  DELETE FROM public.fiscal_invoices         WHERE notes LIKE 'FISCAL_TEST_RLS_311_%';
  DELETE FROM public.customer_fiscal_profiles WHERE notes LIKE 'FISCAL_TEST_RLS_311_%';
  DELETE FROM public.product_fiscal_profiles  WHERE notes LIKE 'FISCAL_TEST_RLS_311_%';
  DELETE FROM public.service_fiscal_profiles  WHERE source_reference LIKE 'FISCAL_TEST_RLS_311_%';
  DELETE FROM public.company_fiscal_settings  WHERE cnpj LIKE 'FISCAL_TEST_RLS_311_%';
  DELETE FROM public.user_roles              WHERE user_id::text LIKE 'ff5c0311-%';
  DELETE FROM public.user_clientes           WHERE user_id::text LIKE 'ff5c0311-%';
  DELETE FROM public.clientes                WHERE nome LIKE 'FISCAL_TEST_RLS_311_%';
  DELETE FROM public.profiles                WHERE id::text LIKE 'ff5c0311-%';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'cleanup pós: %', SQLERRM;
END
$cleanup_post$;

-- Verificação de resíduos por categoria
DO $residuals$
DECLARE
  n_fi bigint; n_ev bigint; n_it bigint; n_id bigint; n_al bigint;
  n_cs bigint; n_pfp bigint; n_sfp bigint; n_cfp bigint;
  n_pr bigint; n_ur bigint; n_uc bigint; n_cl bigint;
BEGIN
  SELECT count(*) INTO n_fi  FROM public.fiscal_invoices         WHERE notes LIKE 'FISCAL_TEST_RLS_311_%';
  SELECT count(*) INTO n_ev  FROM public.fiscal_events           WHERE notes LIKE 'FISCAL_TEST_RLS_311_%';
  SELECT count(*) INTO n_it  FROM public.fiscal_invoice_items    WHERE description LIKE 'FISCAL_TEST_RLS_311_%';
  SELECT count(*) INTO n_id  FROM public.fiscal_idempotency_keys WHERE idempotency_key LIKE 'FISCAL_TEST_RLS_311_%';
  SELECT count(*) INTO n_al  FROM public.fiscal_audit_log        WHERE (new_data->>'notes') LIKE 'FISCAL_TEST_RLS_311_%';
  SELECT count(*) INTO n_cs  FROM public.company_fiscal_settings WHERE cnpj LIKE 'FISCAL_TEST_RLS_311_%';
  SELECT count(*) INTO n_pfp FROM public.product_fiscal_profiles WHERE notes LIKE 'FISCAL_TEST_RLS_311_%';
  SELECT count(*) INTO n_sfp FROM public.service_fiscal_profiles WHERE source_reference LIKE 'FISCAL_TEST_RLS_311_%';
  SELECT count(*) INTO n_cfp FROM public.customer_fiscal_profiles WHERE notes LIKE 'FISCAL_TEST_RLS_311_%';
  SELECT count(*) INTO n_pr  FROM public.profiles                WHERE id::text LIKE 'ff5c0311-%';
  SELECT count(*) INTO n_ur  FROM public.user_roles              WHERE user_id::text LIKE 'ff5c0311-%';
  SELECT count(*) INTO n_uc  FROM public.user_clientes           WHERE user_id::text LIKE 'ff5c0311-%';
  SELECT count(*) INTO n_cl  FROM public.clientes                WHERE nome LIKE 'FISCAL_TEST_RLS_311_%';

  PERFORM set_config('fiscal.residuals',
    format('invoices=%s events=%s items=%s idemp=%s audit=%s cs=%s pfp=%s sfp=%s cfp=%s profiles=%s user_roles=%s user_clientes=%s clientes=%s',
      n_fi,n_ev,n_it,n_id,n_al,n_cs,n_pfp,n_sfp,n_cfp,n_pr,n_ur,n_uc,n_cl), true);

  IF (n_fi+n_ev+n_it+n_id+n_al+n_cs+n_pfp+n_sfp+n_cfp+n_pr+n_ur+n_uc+n_cl) > 0 THEN
    RAISE EXCEPTION 'ABORT 3.11: resíduos sintéticos remanescentes -> %', current_setting('fiscal.residuals');
  END IF;
END
$residuals$;

-- ---------------------------------------------------------------------
-- SAÍDA 1 — detalhes por asserção
-- ---------------------------------------------------------------------
SELECT assertion_id, categoria, perfil, objeto, operacao,
       esperado, observado, status, detail
  FROM _fiscal_rls_311_results
 ORDER BY categoria, perfil, objeto, operacao;

-- ---------------------------------------------------------------------
-- SAÍDA 2 — resumo final + classificação
-- ---------------------------------------------------------------------
SELECT
  current_setting('fiscal.masked_ref', true)          AS project_ref_masked,
  (SELECT count(*) FROM _fiscal_rls_311_results)      AS planejadas,
  (SELECT count(*) FROM _fiscal_rls_311_results
     WHERE status <> 'skipped')                       AS executadas,
  (SELECT count(*) FROM _fiscal_rls_311_results
     WHERE status = 'passed')                         AS aprovadas,
  (SELECT count(*) FROM _fiscal_rls_311_results
     WHERE status = 'failed')                         AS falhas,
  (SELECT count(*) FROM _fiscal_rls_311_results
     WHERE status = 'error')                          AS erros,
  (SELECT count(*) FROM _fiscal_rls_311_results
     WHERE status = 'skipped')                        AS skips,
  current_setting('fiscal.residuals', true)           AS residuos,
  CASE
    WHEN (SELECT count(*) FROM _fiscal_rls_311_results
            WHERE status IN ('failed','error','skipped')) = 0
      THEN 'APTO'
    ELSE 'INAPTO'
  END                                                  AS classificacao;

COMMIT;

-- Fim do harness 3.11.
