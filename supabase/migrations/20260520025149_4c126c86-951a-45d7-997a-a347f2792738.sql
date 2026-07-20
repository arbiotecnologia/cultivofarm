ALTER TABLE public.aplicacao_evidencias 
ADD COLUMN versao_origem_id UUID REFERENCES public.aplicacoes(id);

COMMENT ON COLUMN public.aplicacao_evidencias.versao_origem_id IS 'ID da aplicação original de onde esta evidência foi herdada durante uma retificação';