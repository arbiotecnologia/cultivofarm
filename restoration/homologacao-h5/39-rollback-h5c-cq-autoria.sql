-- =====================================================================
-- H5c — ROLLBACK da autoria server-side do CQ (staging ikaauvsflpmamgxmkhoq)
-- Remove APENAS o gatilho/função introduzidos em 38-h5c-cq-autoria-servidor.sql.
-- A imutabilidade do resultado final (H5-B03 / 34) permanece intacta.
-- =====================================================================
\set ON_ERROR_STOP on
BEGIN;

DROP TRIGGER IF EXISTS trg_cq_autoria_servidor ON public.controle_qualidade;
DROP FUNCTION IF EXISTS public.fn_cq_autoria_servidor();

COMMIT;
