
-- ============================================================
-- Phase 5A: Fix search_path on 8 mutable functions
-- ============================================================
ALTER FUNCTION public.set_updated_at()               SET search_path = public;
ALTER FUNCTION public.catalog_set_updated_at()       SET search_path = public;
ALTER FUNCTION public.tg_pfs_updated_at()            SET search_path = public;
ALTER FUNCTION public.tg_pofl_updated_at()           SET search_path = public;
ALTER FUNCTION public.tg_block_pofl_delete()         SET search_path = public;
ALTER FUNCTION public.normalizar_alvo(text)          SET search_path = public;
ALTER FUNCTION public.fn_calc_os_faturamento_totals() SET search_path = public;
ALTER FUNCTION public.fn_validate_envase_cq()        SET search_path = public;

-- ============================================================
-- Phase 5B: Hide matviews from Data API, expose via regular views
-- ============================================================
-- 1) Rename matviews to mv_* so we can create views with old names
ALTER MATERIALIZED VIEW public.vw_esteira_laboratorio   RENAME TO mv_esteira_laboratorio;
ALTER MATERIALIZED VIEW public.vw_fluxo_visita_tecnica  RENAME TO mv_fluxo_visita_tecnica;

-- 2) Revoke Data API from the raw matview
REVOKE ALL ON public.mv_esteira_laboratorio  FROM anon, authenticated;
REVOKE ALL ON public.mv_fluxo_visita_tecnica FROM anon, authenticated;

-- 3) Update the cron refresh jobs to the new matview names
SELECT cron.unschedule('refresh-mv-esteira-laboratorio')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='refresh-mv-esteira-laboratorio');
SELECT cron.unschedule('refresh-mv-fluxo-visita-tecnica')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='refresh-mv-fluxo-visita-tecnica');

SELECT cron.schedule(
  'refresh-mv-esteira-laboratorio', '*/5 * * * *',
  $$REFRESH MATERIALIZED VIEW public.mv_esteira_laboratorio;$$
);
SELECT cron.schedule(
  'refresh-mv-fluxo-visita-tecnica', '*/5 * * * *',
  $$REFRESH MATERIALIZED VIEW public.mv_fluxo_visita_tecnica;$$
);

-- 4) Recreate the old public names as regular views that select from matview
CREATE OR REPLACE VIEW public.vw_esteira_laboratorio  AS SELECT * FROM public.mv_esteira_laboratorio;
CREATE OR REPLACE VIEW public.vw_fluxo_visita_tecnica AS SELECT * FROM public.mv_fluxo_visita_tecnica;

GRANT SELECT ON public.vw_esteira_laboratorio  TO anon, authenticated;
GRANT SELECT ON public.vw_fluxo_visita_tecnica TO anon, authenticated;
