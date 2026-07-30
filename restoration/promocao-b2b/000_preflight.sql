-- =====================================================================
-- PACOTE DE PROMOCAO MOTOR B2B — 000_preflight.sql
-- FAIL-CLOSED. Executar SEMPRE como primeiro arquivo, na MESMA sessão/
-- transação do apply (psql --single-transaction -f 000_preflight.sql -f ...).
--
-- Este arquivo NÃO altera nada. Ele aborta a transação inteira se qualquer
-- pré-condição falhar, sem efeito colateral.
--
-- Parâmetros efêmeros (NUNCA persistidos, NUNCA secrets):
--   -c "SET promo.target_ref = '<ref-do-destino>'"        (obrigatório)
--   -c "SET promo.human_authorization = '<texto de autorização>'" (obrigatório)
--   -c "SET promo.pitr_confirmed = 'yes'"                 (obrigatório)
--   -c "SET promo.mode = 'production' | 'rehearsal'"      (obrigatório)
--
-- IMPORTANTE — descoberta de project_ref:
--   O PostgreSQL NÃO conhece com segurança o project_ref do Supabase. Não há
--   mecanismo interno confiável e qualquer tentativa (ler secrets, consultar
--   tabelas de marcação, inferir por hostname dentro do SQL) é insegura ou
--   falsificável. Portanto:
--     1) A verificação PRIMÁRIA do destino ocorre NO EXECUTOR, ANTES da conexão
--        (ver apply-production.sh.BLOCKED / rehearsal-staging.sh): comparação do
--        project-ref da CLI/DSN com o destino esperado.
--     2) Aqui há apenas a SEGUNDA confirmação, por parâmetro efêmero de sessão,
--        declarado explicitamente pelo operador humano.
--   As duas devem concordar; qualquer divergência aborta.
-- =====================================================================

DO $preflight$
DECLARE
  c_prod   constant text := 'navfzbwgwzruipouyfnk';
  c_stg    constant text := 'ikaauvsflpmamgxmkhoq';
  v_ref    text := nullif(trim(current_setting('promo.target_ref', true)), '');
  v_auth   text := nullif(trim(current_setting('promo.human_authorization', true)), '');
  v_pitr   text := lower(nullif(trim(current_setting('promo.pitr_confirmed', true)), ''));
  v_mode   text := lower(nullif(trim(current_setting('promo.mode', true)), ''));
  v_missing text[] := '{}';
  v_obj    text;
  v_n      int;
BEGIN
  ------------------------------------------------------------------
  -- P0. Parâmetros obrigatórios (fail-closed: ausência = aborto)
  ------------------------------------------------------------------
  IF v_mode IS NULL OR v_mode NOT IN ('production','rehearsal') THEN
    RAISE EXCEPTION 'PREFLIGHT_ABORT: promo.mode ausente ou inválido (production|rehearsal)';
  END IF;
  IF v_ref IS NULL THEN
    RAISE EXCEPTION 'PREFLIGHT_ABORT: promo.target_ref ausente';
  END IF;
  IF v_pitr IS DISTINCT FROM 'yes' THEN
    RAISE EXCEPTION 'PREFLIGHT_ABORT: backup/PITR não confirmado (promo.pitr_confirmed <> yes)';
  END IF;
  IF v_auth IS NULL OR length(v_auth) < 40 THEN
    RAISE EXCEPTION 'PREFLIGHT_ABORT: autorização humana ausente ou incompleta em promo.human_authorization';
  END IF;

  ------------------------------------------------------------------
  -- P1. Coerência modo x destino declarado
  ------------------------------------------------------------------
  IF v_mode = 'production' AND v_ref <> c_prod THEN
    RAISE EXCEPTION 'PREFLIGHT_ABORT: modo production exige destino % (recebido %)', c_prod, v_ref;
  END IF;
  IF v_mode = 'rehearsal' AND v_ref = c_prod THEN
    RAISE EXCEPTION 'PREFLIGHT_ABORT: ensaio nunca pode apontar produção (%)', c_prod;
  END IF;
  IF v_mode = 'rehearsal' AND v_ref <> c_stg THEN
    RAISE EXCEPTION 'PREFLIGHT_ABORT: ensaio autorizado somente em % (recebido %)', c_stg, v_ref;
  END IF;

  ------------------------------------------------------------------
  -- P2. Versão de servidor e extensões exigidas pelo delta
  ------------------------------------------------------------------
  IF current_setting('server_version_num')::int < 150000 THEN
    RAISE EXCEPTION 'PREFLIGHT_ABORT: server_version_num % < 150000', current_setting('server_version_num');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto') THEN
    RAISE EXCEPTION 'PREFLIGHT_ABORT: extensão pgcrypto ausente (exigida por fn_b2b_cart_hash/reqfp_v2)';
  END IF;

  ------------------------------------------------------------------
  -- P3. Baseline de schema — objetos que DEVEM preexistir no destino
  ------------------------------------------------------------------
  FOREACH v_obj IN ARRAY ARRAY[
    'public.partner_accounts','public.partner_orders','public.partner_order_items',
    'public.partner_order_payment_terms','public.partner_order_payment_schedule',
    'public.partner_simulations','public.partner_simulation_items',
    'public.partner_product_prices','public.commercial_payment_plans',
    'public.accounts_receivable','public.accounts_receivable_installments',
    'public.user_roles','public.produtos','public.microrganismos'
  ] LOOP
    IF to_regclass(v_obj) IS NULL THEN
      v_missing := v_missing || v_obj;
    END IF;
  END LOOP;
  IF array_length(v_missing, 1) > 0 THEN
    RAISE EXCEPTION 'PREFLIGHT_ABORT: baseline incompleto — objetos ausentes: %', array_to_string(v_missing, ', ');
  END IF;

  IF to_regprocedure('public.has_role(uuid, app_role)') IS NULL THEN
    RAISE EXCEPTION 'PREFLIGHT_ABORT: baseline incompleto — public.has_role(uuid, app_role) ausente';
  END IF;

  ------------------------------------------------------------------
  -- P4. Estado transacional: nada conflitante em curso
  ------------------------------------------------------------------
  SELECT count(*) INTO v_n
    FROM pg_stat_activity
   WHERE datname = current_database()
     AND pid <> pg_backend_pid()
     AND state <> 'idle'
     AND xact_start IS NOT NULL
     AND now() - xact_start > interval '60 seconds';
  IF v_n > 0 THEN
    RAISE EXCEPTION 'PREFLIGHT_ABORT: % transação(ões) longa(s) em curso — aguarde janela limpa', v_n;
  END IF;

  SELECT count(*) INTO v_n
    FROM pg_locks l
    JOIN pg_class c ON c.oid = l.relation
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE ns.nspname = 'public'
     AND c.relname IN ('partner_orders','partner_order_items','partner_order_idempotency',
                       'commercial_payment_plans','accounts_receivable')
     AND l.mode IN ('AccessExclusiveLock','ExclusiveLock','ShareRowExclusiveLock')
     AND l.pid <> pg_backend_pid();
  IF v_n > 0 THEN
    RAISE EXCEPTION 'PREFLIGHT_ABORT: % lock(s) exclusivo(s) em tabelas do delta', v_n;
  END IF;

  ------------------------------------------------------------------
  -- P5. Jobs agendados que tocam o motor B2B devem estar parados
  ------------------------------------------------------------------
  IF to_regclass('cron.job') IS NOT NULL THEN
    EXECUTE $q$
      SELECT count(*) FROM cron.job
       WHERE active
         AND (command ILIKE '%partner_order%' OR command ILIKE '%b2b%' OR command ILIKE '%commercial_%')
    $q$ INTO v_n;
    IF v_n > 0 THEN
      RAISE EXCEPTION 'PREFLIGHT_ABORT: % job(s) pg_cron ativo(s) tocam o motor B2B — desative na janela', v_n;
    END IF;
  END IF;

  ------------------------------------------------------------------
  -- P6. Higiene: artefatos de teste não podem existir no destino
  ------------------------------------------------------------------
  IF to_regclass('public._motor_b2b_fase7_proofs') IS NOT NULL THEN
    RAISE NOTICE 'PREFLIGHT_WARN: tabela de provas presente — será removida (no-op se ausente) pelo passo 230';
  END IF;
  IF v_mode = 'production'
     AND to_regclass('public._fiscal_staging_marker') IS NOT NULL THEN
    RAISE EXCEPTION 'PREFLIGHT_ABORT: marker de staging presente em destino declarado como produção — destino inconsistente';
  END IF;

  RAISE NOTICE 'PREFLIGHT_OK: mode=% target_ref=% baseline=ok pitr=confirmado', v_mode, v_ref;
END
$preflight$;
