-- ENVASE — subconjunto SEGURO de hardening.
-- STATUS: APLICADO MANUALMENTE e pós-checado no Supabase CultivoFarm swzpzcwiasxmjutrmvkm (13/09/2026).
-- Idempotente e reexecutável: reconhece o estado "já aplicado" e não repete efeitos.
-- Compatível com o SQL Editor do Supabase: NÃO contém metacomandos psql (\set, \pset, \o).
--
-- VALIDAÇÃO DO DESTINO: é EXTERNA. Nenhuma configuração SQL comprova o project ref.
-- Confirme no painel/URL, antes de executar, que o projeto é EXATAMENTE swzpzcwiasxmjutrmvkm.
--
-- ESTADO EXATO APLICADO EM PRODUÇÃO (seis pontos + RLS ativa, todos comprovados no pós-check):
--   1. constraint envase_quantidade_positiva
--   2. constraint envase_volume_valido
--   3. constraint envase_embalagem_volume_coerente (1L=1000, 5L=5000, 20L=20000)
--   4. quantidade e volume_por_unidade com ALTER COLUMN SET NOT NULL
--   5. anon sem QUALQUER grant em public.envase; authenticated somente SELECT
--   6. gatilho trg_envase_avanca_os ausente
--   + RLS de public.envase ativa
--   + rpc_cockpit_registrar_envase_v1 permanece com EXECUTE para authenticated
--
-- FORA DE ESCOPO: nenhum RLS é habilitado/desabilitado, nenhuma policy é criada/alterada/removida,
-- nenhum INSERT/UPDATE/DELETE/TRUNCATE é executado.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- Pré-check fail-closed.
DO $pre$
BEGIN
  IF current_database() <> 'postgres' THEN
    RAISE EXCEPTION 'ENVASE_AMBIENTE_NAO_COMPROVADO: database=%', current_database();
  END IF;
  IF to_regclass('public.envase') IS NULL THEN
    RAISE EXCEPTION 'ENVASE_TABELA_AUSENTE';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_class WHERE oid = 'public.envase'::regclass AND relrowsecurity
  ) THEN
    RAISE EXCEPTION 'ENVASE_RLS_OBRIGATORIA';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'rpc_cockpit_registrar_envase_v1'
  ) THEN
    RAISE EXCEPTION 'ENVASE_RPC_CANONICA_AUSENTE';
  END IF;
END $pre$;

LOCK TABLE public.envase IN ACCESS EXCLUSIVE MODE;

-- (5) ACL mínima: anon sem nenhum grant; authenticated somente SELECT.
REVOKE ALL ON TABLE public.envase FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES ON TABLE public.envase FROM authenticated;

-- (6) Gatilho legado de avanço automático da OS.
DROP TRIGGER IF EXISTS trg_envase_avanca_os ON public.envase;

-- (4) Colunas obrigatórias.
ALTER TABLE public.envase ALTER COLUMN quantidade SET NOT NULL;
ALTER TABLE public.envase ALTER COLUMN volume_por_unidade SET NOT NULL;

-- (1)(2)(3) Constraints de integridade, criadas NOT VALID e validadas em seguida.
DO $c$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'envase_quantidade_positiva'
                   AND conrelid = 'public.envase'::regclass) THEN
    ALTER TABLE public.envase
      ADD CONSTRAINT envase_quantidade_positiva
      CHECK (quantidade > 0) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'envase_volume_valido'
                   AND conrelid = 'public.envase'::regclass) THEN
    ALTER TABLE public.envase
      ADD CONSTRAINT envase_volume_valido
      CHECK (
        volume_por_unidade > 0
        AND volume_por_unidade::text NOT IN ('NaN', 'Infinity', '-Infinity')
      ) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'envase_embalagem_volume_coerente'
                   AND conrelid = 'public.envase'::regclass) THEN
    ALTER TABLE public.envase
      ADD CONSTRAINT envase_embalagem_volume_coerente
      CHECK (
        (tipo_embalagem::text = 'frasco_1L'   AND volume_por_unidade = 1000)
        OR (tipo_embalagem::text = 'bombona_5L'  AND volume_por_unidade = 5000)
        OR (tipo_embalagem::text = 'bombona_20L' AND volume_por_unidade = 20000)
      ) NOT VALID;
  END IF;
END $c$;

ALTER TABLE public.envase VALIDATE CONSTRAINT envase_quantidade_positiva;
ALTER TABLE public.envase VALIDATE CONSTRAINT envase_volume_valido;
ALTER TABLE public.envase VALIDATE CONSTRAINT envase_embalagem_volume_coerente;

-- PÓS-CHECK fail-closed: comprova exatamente os seis pontos + RLS ativa.
DO $post$
DECLARE
  v_constraints integer;
  v_not_null integer;
  v_anon integer;
  v_auth_nao_select integer;
  v_auth_select integer;
BEGIN
  -- (1)(2)(3) três constraints existentes e VALIDADAS, pelos nomes exatos.
  SELECT count(*) INTO v_constraints
  FROM pg_constraint
  WHERE conrelid = 'public.envase'::regclass
    AND convalidated
    AND conname IN ('envase_quantidade_positiva',
                    'envase_volume_valido',
                    'envase_embalagem_volume_coerente');
  IF v_constraints <> 3 THEN
    RAISE EXCEPTION 'ENVASE_CONSTRAINTS_INCOMPLETAS: % de 3', v_constraints;
  END IF;

  -- (4) NOT NULL nas duas colunas.
  SELECT count(*) INTO v_not_null
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'envase'
    AND column_name IN ('quantidade', 'volume_por_unidade')
    AND is_nullable = 'NO';
  IF v_not_null <> 2 THEN
    RAISE EXCEPTION 'ENVASE_NOT_NULL_INCOMPLETO: % de 2', v_not_null;
  END IF;

  -- (5) anon sem qualquer grant; authenticated somente SELECT.
  SELECT count(*) INTO v_anon
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public' AND table_name = 'envase' AND grantee = 'anon';
  IF v_anon <> 0 THEN
    RAISE EXCEPTION 'ENVASE_ANON_COM_GRANT: %', v_anon;
  END IF;

  SELECT count(*) INTO v_auth_nao_select
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public' AND table_name = 'envase'
    AND grantee = 'authenticated' AND privilege_type <> 'SELECT';
  IF v_auth_nao_select <> 0 THEN
    RAISE EXCEPTION 'ENVASE_AUTHENTICATED_COM_ESCRITA: %', v_auth_nao_select;
  END IF;

  SELECT count(*) INTO v_auth_select
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public' AND table_name = 'envase'
    AND grantee = 'authenticated' AND privilege_type = 'SELECT';
  IF v_auth_select <> 1 THEN
    RAISE EXCEPTION 'ENVASE_AUTHENTICATED_SEM_SELECT';
  END IF;

  -- (6) gatilho legado ausente.
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_envase_avanca_os'
               AND tgrelid = 'public.envase'::regclass) THEN
    RAISE EXCEPTION 'ENVASE_TRIGGER_LEGADO_PRESENTE';
  END IF;

  -- RLS ativa.
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid = 'public.envase'::regclass AND relrowsecurity) THEN
    RAISE EXCEPTION 'ENVASE_RLS_DESATIVADA';
  END IF;

  -- RPC canônica continua executável por authenticated.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'rpc_cockpit_registrar_envase_v1'
      AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
  ) THEN
    RAISE EXCEPTION 'ENVASE_RPC_SEM_EXECUTE_AUTHENTICATED';
  END IF;
END $post$;

COMMIT;
