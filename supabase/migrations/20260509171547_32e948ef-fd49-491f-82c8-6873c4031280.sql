ALTER TABLE public.registros_consultor_recomendacoes 
ADD COLUMN IF NOT EXISTS microrganismo_id UUID REFERENCES public.microrganismos(id);
