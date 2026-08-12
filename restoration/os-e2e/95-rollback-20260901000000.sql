-- Rollback exato de 20260901000000_cq_ordem_canonica.sql
-- Restaura o desempate por ctid nos consumidores e remove a coluna seq.
-- Uso: apenas no staging ikaauvsflpmamgxmkhoq via restoration/os-e2e/staging-psql.sh

DO $guard$
DECLARE v_ref text;
BEGIN
  SELECT m.project_ref INTO v_ref FROM public._fiscal_staging_marker m WHERE m.marker = 'STAGING' LIMIT 1;
  IF v_ref IS DISTINCT FROM 'ikaauvsflpmamgxmkhoq' THEN
    RAISE EXCEPTION 'ABORT_AMBIENTE: rollback permitido apenas no staging autorizado';
  END IF;
END;
$guard$;

DO $patch$
DECLARE
  r record;
  v_def text;
  v_novo text;
BEGIN
  FOR r IN
    SELECT p.oid, pg_get_functiondef(p.oid) AS def
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN (
         '_rpc_avancar_esteira_laboratorio_internal',
         'rpc_cockpit_registrar_envase_v1',
         'fn_validate_envase_cq',
         'fn_avancar_etapa_esteira'
       )
  LOOP
    v_def := r.def;
    v_novo := replace(v_def, 'created_at DESC, seq DESC', 'created_at DESC, ctid DESC');
    IF v_novo IS DISTINCT FROM v_def THEN
      EXECUTE v_novo;
    END IF;
  END LOOP;
END;
$patch$;

DROP FUNCTION IF EXISTS public.fn_cq_ultimo_resultado(uuid);
DROP INDEX IF EXISTS public.ix_controle_qualidade_lote_ordem;
DROP INDEX IF EXISTS public.ux_controle_qualidade_seq;
ALTER TABLE public.controle_qualidade DROP COLUMN IF EXISTS seq;
