-- CQ — subconjunto SEGURO de hardening.
-- STATUS: APLICADO MANUALMENTE e pós-checado no Supabase CultivoFarm swzpzcwiasxmjutrmvkm (13/09/2026).
-- Este arquivo é idempotente e reexecutável: reconhece o estado "já aplicado" e não repete efeitos.
-- Compatível com o SQL Editor do Supabase: NÃO contém metacomandos psql.
--
-- VALIDAÇÃO DO DESTINO: é EXTERNA. Nenhuma configuração SQL comprova o project ref.
-- Antes de executar, confirme no dashboard/URL que o projeto é EXATAMENTE swzpzcwiasxmjutrmvkm.
-- Marcador literal do destino autorizado: swzpzcwiasxmjutrmvkm
--
-- ESCOPO (fiel ao que foi aplicado e verificado):
--   1. Revogar TRUNCATE/TRIGGER/REFERENCES de anon e authenticated nas duas tabelas de CQ.
--   2. fn_cq_ultimo_resultado(uuid): SECURITY INVOKER, search_path fixo, sem EXECUTE para PUBLIC/anon.
--   3. fn_validate_envase_cq(): sem EXECUTE para PUBLIC/anon/authenticated (trigger permanece habilitado).
--   4. CHECKs cq_h5_ph, cq_h5_concentracao e cq_h5_referencia (rejeitam NaN/Infinity/-Infinity,
--      faixas inválidas e concentração negativa).
-- FORA DE ESCOPO: nenhum RLS é habilitado/desabilitado, nenhuma policy é criada/removida/alterada,
-- nenhum INSERT/UPDATE/DELETE/TRUNCATE é executado. A regra de bloqueio de reanálise está NO-GO
-- e NÃO faz parte deste arquivo (ver README, seção "Reanálise — proposta textual, sem SQL executável").

BEGIN;

-- Pré-check fail-closed: banco esperado, RLS ativa e dependências presentes.
DO $pre$
BEGIN
  IF current_database() <> 'postgres' THEN
    RAISE EXCEPTION 'CQ_AMBIENTE_NAO_COMPROVADO: database=%', current_database();
  END IF;
  IF to_regclass('public.controle_qualidade') IS NULL
     OR to_regclass('public.cq_parametros_referencia') IS NULL THEN
    RAISE EXCEPTION 'CQ_TABELA_AUSENTE';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_class
    WHERE oid IN ('public.controle_qualidade'::regclass, 'public.cq_parametros_referencia'::regclass)
      AND NOT relrowsecurity
  ) THEN
    RAISE EXCEPTION 'CQ_RLS_OBRIGATORIA';
  END IF;
  IF to_regprocedure('public.fn_cq_ultimo_resultado(uuid)') IS NULL
     OR to_regprocedure('public.fn_validate_envase_cq()') IS NULL THEN
    RAISE EXCEPTION 'CQ_DEPENDENCIA_AUSENTE';
  END IF;
END $pre$;

-- Sem janela entre o pré-check numérico e a instalação dos CHECKs.
LOCK TABLE public.controle_qualidade, public.cq_parametros_referencia IN ACCESS EXCLUSIVE MODE;

-- 1. ACL mínima das tabelas (idempotente: REVOKE de privilégio ausente é no-op).
REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLE public.controle_qualidade, public.cq_parametros_referencia FROM anon, authenticated;

-- 2. Helper de leitura: invoker, caminho fixo, sem PUBLIC/anon.
--    Assinatura e corpo preservados; authenticated mantém EXECUTE se já possuía.
ALTER FUNCTION public.fn_cq_ultimo_resultado(uuid) SECURITY INVOKER;
ALTER FUNCTION public.fn_cq_ultimo_resultado(uuid) SET search_path TO public, pg_temp;
REVOKE EXECUTE ON FUNCTION public.fn_cq_ultimo_resultado(uuid) FROM PUBLIC, anon;

-- 3. Função de trigger não é chamável diretamente.
--    PostgreSQL verifica EXECUTE ao criar o trigger, não a cada disparo: o trigger segue ativo.
REVOKE EXECUTE ON FUNCTION public.fn_validate_envase_cq() FROM PUBLIC, anon, authenticated;

-- 4. CHECKs numéricos anuláveis. Precheck sem DML; constraints existentes são preservadas.
DO $checks$
BEGIN
  IF EXISTS (SELECT 1 FROM public.controle_qualidade WHERE
    (ph IS NOT NULL AND (ph::text IN ('NaN','Infinity','-Infinity') OR ph < 0 OR ph > 14)) OR
    (concentracao IS NOT NULL AND (concentracao::text IN ('NaN','Infinity','-Infinity') OR concentracao < 0)))
    THEN RAISE EXCEPTION 'CQ_VALORES_INVALIDOS'; END IF;
  IF EXISTS (SELECT 1 FROM public.cq_parametros_referencia WHERE
    (ph_min IS NOT NULL AND (ph_min::text IN ('NaN','Infinity','-Infinity') OR ph_min < 0 OR ph_min > 14)) OR
    (ph_max IS NOT NULL AND (ph_max::text IN ('NaN','Infinity','-Infinity') OR ph_max < 0 OR ph_max > 14)) OR
    ph_min > ph_max OR (concentracao_min_ufc_ml IS NOT NULL AND
      (concentracao_min_ufc_ml::text IN ('NaN','Infinity','-Infinity') OR concentracao_min_ufc_ml < 0)))
    THEN RAISE EXCEPTION 'CQ_REFERENCIAS_INVALIDAS'; END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.controle_qualidade'::regclass AND conname='cq_h5_ph') THEN
    ALTER TABLE public.controle_qualidade ADD CONSTRAINT cq_h5_ph CHECK
      (ph IS NULL OR (ph::text NOT IN ('NaN','Infinity','-Infinity') AND ph BETWEEN 0 AND 14));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.controle_qualidade'::regclass AND conname='cq_h5_concentracao') THEN
    ALTER TABLE public.controle_qualidade ADD CONSTRAINT cq_h5_concentracao CHECK
      (concentracao IS NULL OR (concentracao::text NOT IN ('NaN','Infinity','-Infinity') AND concentracao >= 0));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.cq_parametros_referencia'::regclass AND conname='cq_h5_referencia') THEN
    ALTER TABLE public.cq_parametros_referencia ADD CONSTRAINT cq_h5_referencia CHECK (
      (ph_min IS NULL OR (ph_min::text NOT IN ('NaN','Infinity','-Infinity') AND ph_min BETWEEN 0 AND 14)) AND
      (ph_max IS NULL OR (ph_max::text NOT IN ('NaN','Infinity','-Infinity') AND ph_max BETWEEN 0 AND 14)) AND
      (ph_min IS NULL OR ph_max IS NULL OR ph_min <= ph_max) AND
      (concentracao_min_ufc_ml IS NULL OR (concentracao_min_ufc_ml::text NOT IN ('NaN','Infinity','-Infinity') AND concentracao_min_ufc_ml >= 0)));
  END IF;
END $checks$;

-- Reconhecer checks homônimos apenas quando a definição corresponde ao contrato.
-- Normalização estritamente sintática; divergência aborta, sem substituir objetos existentes.
DO $definitions$
DECLARE item record; actual text; expected text;
BEGIN
  FOR item IN SELECT * FROM (VALUES
    ('controle_qualidade','cq_h5_ph',
     'CHECK (ph IS NULL OR (ph::text <> ALL (ARRAY[''NaN''::text,''Infinity''::text,''-Infinity''::text]) AND ph >= 0 AND ph <= 14))'),
    ('controle_qualidade','cq_h5_concentracao',
     'CHECK (concentracao IS NULL OR (concentracao::text <> ALL (ARRAY[''NaN''::text,''Infinity''::text,''-Infinity''::text]) AND concentracao >= 0))'),
    ('cq_parametros_referencia','cq_h5_referencia',
     'CHECK ((ph_min IS NULL OR (ph_min::text <> ALL (ARRAY[''NaN''::text,''Infinity''::text,''-Infinity''::text]) AND ph_min >= 0 AND ph_min <= 14)) AND (ph_max IS NULL OR (ph_max::text <> ALL (ARRAY[''NaN''::text,''Infinity''::text,''-Infinity''::text]) AND ph_max >= 0 AND ph_max <= 14)) AND (ph_min IS NULL OR ph_max IS NULL OR ph_min <= ph_max) AND (concentracao_min_ufc_ml IS NULL OR (concentracao_min_ufc_ml::text <> ALL (ARRAY[''NaN''::text,''Infinity''::text,''-Infinity''::text]) AND concentracao_min_ufc_ml >= 0)))')
  ) AS definitions(table_name, constraint_name, definition) LOOP
    SELECT pg_get_constraintdef(oid) INTO actual FROM pg_constraint
      WHERE conrelid=('public.'||item.table_name)::regclass
        AND conname=item.constraint_name AND contype='c' AND convalidated;
    -- Parentheses, whitespace and numeric literal casts vary with column numeric types.
    actual := regexp_replace(regexp_replace(actual, '::(numeric|double precision|real|integer)', '', 'g'), '[[:space:]()]', '', 'g');
    expected := regexp_replace(item.definition, '[[:space:]()]', '', 'g');
    IF actual IS DISTINCT FROM expected THEN
      RAISE EXCEPTION 'CQ_CHECK_DEFINICAO_DIVERGENTE: %; revisar sem substituir automaticamente', item.constraint_name;
    END IF;
  END LOOP;
END $definitions$;

-- Pós-check fail-closed do subconjunto aplicado.
DO $post$
DECLARE r text; t text; priv text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
    FOREACH t IN ARRAY ARRAY['controle_qualidade','cq_parametros_referencia'] LOOP
      FOREACH priv IN ARRAY ARRAY['TRUNCATE','TRIGGER','REFERENCES'] LOOP
        IF has_table_privilege(r, ('public.'||t)::regclass, priv) THEN
          RAISE EXCEPTION 'CQ_ACL_RESIDUAL: % % %', r, t, priv;
        END IF;
      END LOOP;
    END LOOP;
    IF has_function_privilege(r, 'public.fn_validate_envase_cq()', 'EXECUTE') THEN
      RAISE EXCEPTION 'CQ_ENVASE_ACL: %', r;
    END IF;
  END LOOP;
  IF (SELECT prosecdef FROM pg_proc WHERE oid='public.fn_cq_ultimo_resultado(uuid)'::regprocedure) THEN
    RAISE EXCEPTION 'CQ_INVOKER_AUSENTE';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.fn_cq_ultimo_resultado(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'CQ_HELPER_AUTHENTICATED_ACL';
  END IF;
  IF has_function_privilege('anon', 'public.fn_cq_ultimo_resultado(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'CQ_HELPER_ANON_ACL';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgfoid='public.fn_validate_envase_cq()'::regprocedure AND tgenabled <> 'D') THEN
    RAISE EXCEPTION 'CQ_TRIGGER_ENVASE_AUSENTE';
  END IF;
  IF (SELECT count(*) FROM pg_constraint
      WHERE conrelid IN ('public.controle_qualidade'::regclass,'public.cq_parametros_referencia'::regclass)
        AND conname IN ('cq_h5_ph','cq_h5_concentracao','cq_h5_referencia') AND convalidated) <> 3 THEN
    RAISE EXCEPTION 'CQ_CHECK_NAO_VALIDADO';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class
             WHERE oid IN ('public.controle_qualidade'::regclass,'public.cq_parametros_referencia'::regclass)
               AND NOT relrowsecurity) THEN
    RAISE EXCEPTION 'CQ_RLS_ALTERADA';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.cq_parametros_referencia WHERE ativo) THEN
    RAISE NOTICE 'CQ_SEM_REFERENCIA: conformidade bloqueada por configuracao ausente; nenhum dado inventado.';
  END IF;
  RAISE NOTICE 'CQ_HARDENING_OK: subconjunto seguro presente e validado.';
END $post$;

-- Relatório final do pós-check (leitura, sem DML).
SELECT current_database() AS database,
       (SELECT count(*) FROM public.controle_qualidade) AS cq_rows,
       (SELECT count(*) FROM public.cq_parametros_referencia) AS reference_rows,
       (SELECT bool_and(relrowsecurity) FROM pg_class
         WHERE oid IN ('public.controle_qualidade'::regclass,'public.cq_parametros_referencia'::regclass)) AS rls_ambas_ativas,
       (SELECT count(*) FROM (VALUES ('anon'),('authenticated')) rr(r)
          CROSS JOIN (VALUES ('controle_qualidade'),('cq_parametros_referencia')) tt(t)
          CROSS JOIN (VALUES ('TRUNCATE'),('TRIGGER'),('REFERENCES')) pp(p)
         WHERE has_table_privilege(rr.r, ('public.'||tt.t)::regclass, pp.p)) AS dangerous_grants_remaining,
       (SELECT prosecdef FROM pg_proc WHERE oid='public.fn_cq_ultimo_resultado(uuid)'::regprocedure) AS helper_security_definer,
       has_function_privilege('anon','public.fn_cq_ultimo_resultado(uuid)','EXECUTE') AS helper_anon_execute,
       has_function_privilege('authenticated','public.fn_cq_ultimo_resultado(uuid)','EXECUTE') AS helper_authenticated_execute,
       has_function_privilege('anon','public.fn_validate_envase_cq()','EXECUTE') AS envase_anon_execute,
       has_function_privilege('authenticated','public.fn_validate_envase_cq()','EXECUTE') AS envase_authenticated_execute,
       (SELECT bool_and(tgenabled <> 'D') FROM pg_trigger WHERE tgfoid='public.fn_validate_envase_cq()'::regprocedure) AS trigger_envase_habilitado,
       (SELECT count(*) FROM pg_constraint
         WHERE conrelid IN ('public.controle_qualidade'::regclass,'public.cq_parametros_referencia'::regclass)
           AND conname IN ('cq_h5_ph','cq_h5_concentracao','cq_h5_referencia') AND convalidated) AS checks_validados;

COMMIT;
