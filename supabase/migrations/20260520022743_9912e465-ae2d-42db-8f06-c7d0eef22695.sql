-- Adiciona campos de versionamento na tabela de aplicacoes
ALTER TABLE public.aplicacoes 
ADD COLUMN parent_id UUID REFERENCES public.aplicacoes(id),
ADD COLUMN versao INTEGER DEFAULT 1,
ADD COLUMN is_latest BOOLEAN DEFAULT true,
ADD COLUMN motivo_retificacao TEXT;

-- Índice para performance na busca de histórico
CREATE INDEX idx_aplicacoes_parent_id ON public.aplicacoes(parent_id);
CREATE INDEX idx_aplicacoes_is_latest ON public.aplicacoes(is_latest);

-- Comentários para documentação
COMMENT ON COLUMN public.aplicacoes.parent_id IS 'Referência para a aplicação original em caso de retificação';
COMMENT ON COLUMN public.aplicacoes.versao IS 'Número da versão do registro de aplicação';
COMMENT ON COLUMN public.aplicacoes.is_latest IS 'Indica se esta é a versão mais recente e ativa da aplicação';
COMMENT ON COLUMN public.aplicacoes.motivo_retificacao IS 'Justificativa para a alteração do registro anterior';
