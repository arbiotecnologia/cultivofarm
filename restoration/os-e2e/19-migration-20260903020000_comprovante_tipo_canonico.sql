-- =====================================================================
-- FASE 2.2 — Tipo documental canonico 'comprovante_entrega' aceito pela
-- constraint de entrega_comprovantes (mudanca incremental e reversivel).
-- Alvo EXCLUSIVO: staging ikaauvsflpmamgxmkhoq.
-- =====================================================================
\set ON_ERROR_STOP on
BEGIN;

DO $guard$
DECLARE v_marker text; v_ref text;
BEGIN
  IF to_regclass('public._fiscal_staging_marker') IS NULL THEN
    RAISE EXCEPTION 'ENV_ABORT: marcador de ambiente ausente';
  END IF;
  SELECT marker, project_ref INTO v_marker, v_ref FROM public._fiscal_staging_marker;
  IF v_ref = 'navfzbwgwzruipouyfnk' THEN RAISE EXCEPTION 'ENV_ABORT: PRODUCAO PROIBIDA'; END IF;
  IF v_marker IS DISTINCT FROM 'STAGING' OR v_ref IS DISTINCT FROM 'ikaauvsflpmamgxmkhoq' THEN
    RAISE EXCEPTION 'ENV_ABORT: ambiente nao autorizado';
  END IF;
END
$guard$;

ALTER TABLE public.entrega_comprovantes
  DROP CONSTRAINT IF EXISTS entrega_comprovantes_tipo_chk;

ALTER TABLE public.entrega_comprovantes
  ADD CONSTRAINT entrega_comprovantes_tipo_chk
  CHECK (tipo = ANY (ARRAY[
    'formulario_entrega'::text,
    'termo_recebimento'::text,
    'comprovante_entrega'::text,
    'comprovante_assinado'::text,
    'assinatura_digital'::text,
    'foto_recebimento'::text,
    'outro'::text
  ]));

COMMIT;
