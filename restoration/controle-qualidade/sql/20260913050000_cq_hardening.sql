-- PREPARADO, NÃO APLICADO. Executar somente com psql, após revisão/autorização.
-- Não define o ref: a conexão deve prover lovable.project_ref verificável.
-- Rollback capturado ANTES de cada execução; arquivar arquivo com hash, não sobrescrever o anterior.
\set ON_ERROR_STOP on
BEGIN;
DO $pre$
BEGIN
  IF current_database() <> 'postgres' OR
     current_setting('lovable.project_ref', true) IS DISTINCT FROM 'swzpzcwiasxmjutrmvkm' THEN
    RAISE EXCEPTION 'CQ_AMBIENTE_NAO_COMPROVADO';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE oid IN
    ('public.controle_qualidade'::regclass, 'public.cq_parametros_referencia'::regclass)
    AND NOT relrowsecurity) THEN RAISE EXCEPTION 'CQ_RLS_OBRIGATORIA'; END IF;
  IF to_regprocedure('public.fn_cq_ultimo_resultado(uuid)') IS NULL OR
     to_regprocedure('public.fn_validate_envase_cq()') IS NULL THEN
    RAISE EXCEPTION 'CQ_DEPENDENCIA_AUSENTE';
  END IF;
  IF (SELECT prosecdef FROM pg_proc WHERE oid='public.fn_validate_envase_cq()'::regprocedure) THEN
    RAISE EXCEPTION 'CQ_TRIGGER_DEVE_SER_INVOKER';
  END IF;
END $pre$;
-- Sem janela entre pré-check numérico e instalação dos CHECKs.
LOCK TABLE public.controle_qualidade, public.cq_parametros_referencia IN ACCESS EXCLUSIVE MODE;
-- Rollback exato deste passo (atributos/ACL modificados, objetos preexistentes preservados).
-- Arquivo local do operador: NUNCA executar automaticamente.
\pset tuples_only on
\pset format unaligned
\o cq-hardening-rollback.sql
SELECT 'BEGIN;';
SELECT $$DO $guard$ BEGIN IF current_setting('lovable.project_ref',true) IS DISTINCT FROM 'swzpzcwiasxmjutrmvkm' THEN RAISE EXCEPTION 'CQ_AMBIENTE_NAO_COMPROVADO'; END IF; END $guard$;$$;
SELECT pg_get_functiondef('public.fn_cq_ultimo_resultado(uuid)'::regprocedure);
SELECT CASE WHEN to_regprocedure('public.fn_cq_bloquear_reanalise_liberada()') IS NULL
  THEN 'DROP TRIGGER IF EXISTS trg_cq_bloquear_reanalise_liberada ON public.controle_qualidade; DROP FUNCTION IF EXISTS public.fn_cq_bloquear_reanalise_liberada();'
  ELSE pg_get_functiondef('public.fn_cq_bloquear_reanalise_liberada()'::regprocedure) END;
SELECT format('GRANT %s ON TABLE %s TO %I%s;', a.privilege_type, c.oid::regclass, r.rolname,
  CASE WHEN a.is_grantable THEN ' WITH GRANT OPTION' ELSE '' END)
FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a JOIN pg_roles r ON r.oid=a.grantee
WHERE c.oid IN ('public.controle_qualidade'::regclass,'public.cq_parametros_referencia'::regclass)
  AND r.rolname IN ('anon','authenticated') AND a.privilege_type IN ('TRUNCATE','TRIGGER','REFERENCES');
SELECT format('GRANT EXECUTE ON FUNCTION %s TO %s%s;', p.oid::regprocedure,
  CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(a.grantee)) END,
  CASE WHEN a.is_grantable THEN ' WITH GRANT OPTION' ELSE '' END)
FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
WHERE p.oid IN ('public.fn_cq_ultimo_resultado(uuid)'::regprocedure,'public.fn_validate_envase_cq()'::regprocedure)
  AND (a.grantee=0 OR pg_get_userbyid(a.grantee) IN ('anon','authenticated'))
  AND a.privilege_type='EXECUTE';
SELECT format('ALTER TABLE public.%I DROP CONSTRAINT %I;',t,n)
FROM (VALUES ('controle_qualidade','cq_h5_ph'),('controle_qualidade','cq_h5_concentracao'),
  ('cq_parametros_referencia','cq_h5_referencia')) v(t,n)
WHERE NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid=('public.'||t)::regclass AND conname=n);
SELECT 'COMMIT;';
\o
\pset tuples_only off
-- Invoker escolhido: preserva assinatura/corpo e aplica RLS do chamador, inclusive NULL sem linhas visíveis.
-- Chamadas internas SECURITY DEFINER conservam contexto do proprietário; não ampliamos EXECUTE.
ALTER FUNCTION public.fn_cq_ultimo_resultado(uuid) SECURITY INVOKER;
ALTER FUNCTION public.fn_cq_ultimo_resultado(uuid) SET search_path TO public, pg_temp;
REVOKE EXECUTE ON FUNCTION public.fn_cq_ultimo_resultado(uuid) FROM PUBLIC, anon;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLE public.controle_qualidade, public.cq_parametros_referencia FROM anon, authenticated;
-- PostgreSQL verifica EXECUTE ao criar o trigger, não a cada disparo. Trigger existente permanece ativo.
REVOKE EXECUTE ON FUNCTION public.fn_validate_envase_cq() FROM PUBLIC, anon, authenticated;
-- Preservar ACLs dos outros três triggers: falhar, não reabrir permissões.
DO $acl$
DECLARE f text; r text;
BEGIN
  FOREACH f IN ARRAY ARRAY['fn_cq_aprovado_avanca_os','fn_cq_autoria_servidor','fn_cq_resultado_imutavel'] LOOP
    FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
      IF has_function_privilege(r,('public.'||f||'()')::regprocedure,'EXECUTE') THEN
        RAISE EXCEPTION 'CQ_TRIGGER_ACL_DIVERGENTE: %',f;
      END IF;
    END LOOP;
  END LOOP;
END $acl$;
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
-- REGRA CONSERVADORA: congelar novos pareceres após QUALQUER aprovação.
-- Evita reprovação posterior mantendo lote/OS liberados; NÃO finge implementar quarentena/recall.
-- Bloqueia também backdating e atualização de pendência antiga após aprovação.
-- Nenhum status é retrocedido; histórico não é sobrescrito. Uma reanálise nessa situação
-- requer fluxo separado de não conformidade/quarentena autorizado, ainda não disponível.
CREATE OR REPLACE FUNCTION public.fn_cq_bloquear_reanalise_liberada()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public, pg_temp AS $fn$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'CQ_SESSAO_OBRIGATORIA' USING ERRCODE='42501'; END IF;
  IF NOT (public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'gestor') OR
          public.has_role(auth.uid(),'producao') OR public.fn_onfarm_scope_lote(NEW.lote_id)) THEN
    RAISE EXCEPTION 'CQ_ESCOPO_NEGADO' USING ERRCODE='42501';
  END IF;
  -- Lock de tabela evita snapshots concorrentes obsoletos entre dois INSERTs de CQ.
  -- Sob isolamento REPEATABLE READ/SERIALIZABLE, falhar em vez de usar snapshot antigo.
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'CQ_ISOLAMENTO_NAO_SUPORTADO';
  END IF;
  LOCK TABLE public.controle_qualidade IN SHARE ROW EXCLUSIVE MODE;
  IF TG_OP = 'UPDATE' AND NEW.lote_id IS DISTINCT FROM OLD.lote_id THEN
    RAISE EXCEPTION 'CQ_LOTE_IMUTAVEL';
  END IF;
  IF EXISTS (SELECT 1 FROM public.controle_qualidade WHERE lote_id=NEW.lote_id AND resultado::text='aprovado') THEN
    RAISE EXCEPTION 'CQ_REANALISE_BLOQUEADA: lote já liberado; solicite tratamento formal de não conformidade. Nenhum parecer ou etapa foi alterado.' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION public.fn_cq_bloquear_reanalise_liberada() FROM PUBLIC, anon, authenticated;
DO $trigger$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.controle_qualidade'::regclass AND tgname='trg_cq_bloquear_reanalise_liberada') THEN
    CREATE TRIGGER trg_cq_bloquear_reanalise_liberada BEFORE INSERT OR UPDATE ON public.controle_qualidade
      FOR EACH ROW EXECUTE FUNCTION public.fn_cq_bloquear_reanalise_liberada();
  END IF;
END $trigger$;
DO $post$
DECLARE r text; t text; priv text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
    FOREACH t IN ARRAY ARRAY['controle_qualidade','cq_parametros_referencia'] LOOP
      FOREACH priv IN ARRAY ARRAY['TRUNCATE','TRIGGER','REFERENCES'] LOOP
        IF has_table_privilege(r,('public.'||t)::regclass,priv) THEN RAISE EXCEPTION 'CQ_ACL_RESIDUAL'; END IF;
      END LOOP;
    END LOOP;
    IF has_function_privilege(r,'public.fn_validate_envase_cq()','EXECUTE') THEN RAISE EXCEPTION 'CQ_ENVASE_ACL'; END IF;
  END LOOP;
  IF (SELECT prosecdef FROM pg_proc WHERE oid='public.fn_cq_ultimo_resultado(uuid)'::regprocedure) THEN RAISE EXCEPTION 'CQ_INVOKER_AUSENTE'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgfoid='public.fn_validate_envase_cq()'::regprocedure AND tgenabled <> 'D') THEN RAISE EXCEPTION 'CQ_TRIGGER_ENVASE_AUSENTE'; END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid IN ('public.controle_qualidade'::regclass,'public.cq_parametros_referencia'::regclass) AND conname IN ('cq_h5_ph','cq_h5_concentracao','cq_h5_referencia') AND NOT convalidated) THEN RAISE EXCEPTION 'CQ_CHECK_NAO_VALIDADO'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.cq_parametros_referencia WHERE ativo) THEN
    RAISE NOTICE 'CQ_SEM_REFERENCIA: conformidade bloqueada por configuração ausente; nenhum dado inventado.';
  END IF;
END $post$;
COMMIT;
