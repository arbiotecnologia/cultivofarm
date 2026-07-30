-- Guarda de ambiente ESTRITA para qualquer harness/rollback do Motor B2B Fase 7.
-- Exige marker='STAGING' E project_ref='ikaauvsflpmamgxmkhoq'.
-- Recusa explicitamente o ref de PRODUÇÃO 'navfzbwgwzruipouyfnk'.
-- Deve ser executada ANTES de qualquer escrita (\i _guard.sql).

DO $guard$
DECLARE
  v_marker text;
  v_ref    text;
  c_expected constant text := 'ikaauvsflpmamgxmkhoq';
  c_prod     constant text := 'navfzbwgwzruipouyfnk';
BEGIN
  IF to_regclass('public._fiscal_staging_marker') IS NULL THEN
    RAISE EXCEPTION 'GUARD_ABORT: tabela _fiscal_staging_marker inexistente (ambiente nao identificado)';
  END IF;

  SELECT marker, project_ref
    INTO v_marker, v_ref
    FROM public._fiscal_staging_marker
   WHERE marker = 'STAGING'
   LIMIT 1;

  IF v_marker IS NULL THEN
    RAISE EXCEPTION 'GUARD_ABORT: nenhuma linha marker=STAGING encontrada';
  END IF;

  IF v_ref = c_prod THEN
    RAISE EXCEPTION 'GUARD_ABORT: ambiente de PRODUCAO (%) — execucao proibida', c_prod;
  END IF;

  IF v_ref IS DISTINCT FROM c_expected THEN
    RAISE EXCEPTION 'GUARD_ABORT: project_ref % difere do staging autorizado %', coalesce(v_ref,'<null>'), c_expected;
  END IF;

  -- Defesa em profundidade: o ref de producao nao pode aparecer em nenhuma linha.
  IF EXISTS (SELECT 1 FROM public._fiscal_staging_marker WHERE project_ref = c_prod) THEN
    RAISE EXCEPTION 'GUARD_ABORT: marker contem ref de PRODUCAO';
  END IF;

  RAISE NOTICE 'GUARD_OK: staging % autorizado', c_expected;
END
$guard$;
