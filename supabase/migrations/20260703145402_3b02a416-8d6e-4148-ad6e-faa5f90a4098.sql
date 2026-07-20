
DROP VIEW IF EXISTS public.vw_esteira_laboratorio;
DROP VIEW IF EXISTS public.vw_fluxo_visita_tecnica;

CREATE VIEW public.vw_esteira_laboratorio
  WITH (security_invoker = true)
  AS SELECT * FROM public.mv_esteira_laboratorio;

CREATE VIEW public.vw_fluxo_visita_tecnica
  WITH (security_invoker = true)
  AS SELECT * FROM public.mv_fluxo_visita_tecnica;

GRANT SELECT ON public.vw_esteira_laboratorio  TO anon, authenticated;
GRANT SELECT ON public.vw_fluxo_visita_tecnica TO anon, authenticated;
