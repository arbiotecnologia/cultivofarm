-- Adicionar coluna tipo_manejo_agua na tabela talhoes
ALTER TABLE public.talhoes 
ADD COLUMN IF NOT EXISTS tipo_manejo_agua TEXT NOT NULL DEFAULT 'sequeiro'
CHECK (tipo_manejo_agua IN ('irrigado', 'sequeiro'));

-- Criar índice para otimizar filtros e BI
CREATE INDEX IF NOT EXISTS idx_talhoes_tipo_manejo_agua ON public.talhoes(tipo_manejo_agua);