-- Adicionar colunas de latitude e longitude
ALTER TABLE public.registros_consultor 
ADD COLUMN IF NOT EXISTS latitude NUMERIC,
ADD COLUMN IF NOT EXISTS longitude NUMERIC;

-- Comentários nas colunas para documentação
COMMENT ON COLUMN public.registros_consultor.latitude IS 'Latitude GPS capturada durante a vistoria';
COMMENT ON COLUMN public.registros_consultor.longitude IS 'Longitude GPS capturada durante a vistoria';