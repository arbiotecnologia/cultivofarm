-- Adiciona colunas de geolocalização na tabela de arquivos
ALTER TABLE public.registros_consultor_arquivos 
ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

-- Comentários para documentação
COMMENT ON COLUMN public.registros_consultor_arquivos.latitude IS 'Latitude da captura da mídia';
COMMENT ON COLUMN public.registros_consultor_arquivos.longitude IS 'Longitude da captura da mídia';