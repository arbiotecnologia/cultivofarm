
-- Habilitar realtime para as tabelas principais de produção e envase
ALTER PUBLICATION supabase_realtime ADD TABLE public.lotes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.envase;

-- Garantir REPLICA IDENTITY FULL para capturar estados anteriores se necessário (bom para auditoria/logs)
ALTER TABLE public.lotes REPLICA IDENTITY FULL;
ALTER TABLE public.envase REPLICA IDENTITY FULL;
