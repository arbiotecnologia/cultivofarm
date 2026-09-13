-- ENVASE — subconjunto SEGURO de hardening.
-- STATUS: APLICADO MANUALMENTE e pós-checado no Supabase CultivoFarm swzpzcwiasxmjutrmvkm (13/09/2026).
-- Idempotente e reexecutável: reconhece o estado "já aplicado" e não repete efeitos.
-- Compatível com o SQL Editor do Supabase: NÃO contém metacomandos psql.
--
-- VALIDAÇÃO DO DESTINO: é EXTERNA. Nenhuma configuração SQL comprova o project ref.
-- Confirme antes de executar que o projeto é EXATAMENTE swzpzcwiasxmjutrmvkm.
--
-- ESCOPO (fiel ao que foi aplicado e verificado):
--   1. Revogar grants diretos de anon e authenticated em public.envase (authenticated fica só com SELECT;
--      anon sem acesso). A RPC canônica rpc_cockpit_registrar_envase_v1 continua executável por authenticated.
--   2. Remover o gatilho legado trg_envase_avanca_os (avançava a OS para pronto_entrega no primeiro INSERT,
--      inclusive quando a RPC classificava o envase como parcial).
--   3. Criar/validar exatamente 3 constraints: quantidade positiva e NOT NULL; volume_por_unidade
--      positivo/finito e NOT NULL; coerência exata embalagem-volume (1L=1000, 5L=5000, 20L=20000).
-- FORA DE ESCOPO: nenhum RLS é habilitado/desabilitado, nenhuma policy é criada/removida/alterada,
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
  IF to_regprocedure('public.rpc_cockpit_registrar_envase_v1(uuid,uuid,text,uuid,jsonb,date,text,text,boolean,text)') IS NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'rpc_cockpit_registrar_envase_v1'
     ) THEN
    RAISE EXCEPTION 'ENVASE_RPC_CANONICA_AUSENTE';
  END IF;
END $pre$;

LOCK TABLE public.envase IN ACCESS EXCLUSIVE MODE;

-- 1. ACL mínima (REVOKE de privilégio ausente é no-op).
REVOKE ALL ON TABLE public.envase FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES ON TABLE public.envase FROM anon, authenticated;

-- 2. Gatilho legado de avanço automático da OS.
DROP TRIGGER IF EXISTS trg_envase_avanca_os ON public.envase;

-- 3. Constraints de integridade (criadas NOT VALID e validadas em seguida; idempotentes).
DO $c$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'envase_quantidade_positiva'
                   AND conrelid = 'public.envase'::regclass) THEN
    ALTER TABLE public.envase
      ADD CONSTRAINT envase_quantidade_positiva
      CHECK (quantidade IS NOT NULL AND quantidade > 0) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'envase_volume_unitario_positivo'
                   AND conrelid = 'public.envase'::regclass) THEN
    ALTER TABLE public.envase
      ADD CONSTRAINT envase_volume_unitario_positivo
      CHECK (
        volume_por_unidade IS NOT NULL
        AND volume_por_unidade > 0
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
ALTER TABLE public.envase VALIDATE CONSTRAINT envase_volume_unitario_positivo;
ALTER TABLE public.envase VALIDATE CONSTRAINT envase_embalagem_volume_coerente;

-- Pós-check fail-closed dentro da mesma transação.
DO $post$
DECLARE
  v_grants integer;
  v_constraints integer;
BEGIN
  SELECT count(*) INTO v_grants
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public' AND table_name = 'envase'
    AND grantee IN ('anon', 'authenticated')
    AND privilege_type <> 'SELECT';
  IF v_grants <> 0 THEN
    RAISE EXCEPTION 'ENVASE_GRANTS_RESIDUAIS: %', v_grants;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_envase_avanca_os'
               AND tgrelid = 'public.envase'::regclass) THEN
    RAISE EXCEPTION 'ENVASE_TRIGGER_LEGADO_PRESENTE';
  END IF;

  SELECT count(*) INTO v_constraints
  FROM pg_constraint
  WHERE conrelid = 'public.envase'::regclass
    AND convalidated
    AND conname IN ('envase_quantidade_positiva',
                    'envase_volume_unitario_positivo',
                    'envase_embalagem_volume_coerente');
  IF v_constraints <> 3 THEN
    RAISE EXCEPTION 'ENVASE_CONSTRAINTS_INCOMPLETAS: %', v_constraints;
  END IF;
END $post$;

COMMIT;
