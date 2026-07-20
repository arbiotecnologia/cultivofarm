CREATE INDEX IF NOT EXISTS idx_visita_diagnosticos_registro_id ON public.visita_diagnosticos(registro_id);
ANALYZE public.visita_diagnosticos;