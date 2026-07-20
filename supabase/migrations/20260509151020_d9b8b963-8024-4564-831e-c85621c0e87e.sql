-- Adicionar colunas para estruturar alertas de monitoramento
ALTER TABLE public.alertas_agronomicos 
ADD COLUMN IF NOT EXISTS data_vencimento DATE,
ADD COLUMN IF NOT EXISTS registro_origem_id UUID REFERENCES public.registros_consultor(id) ON DELETE SET NULL;

-- Criar índice para performance de filtros por data
CREATE INDEX IF NOT EXISTS idx_alertas_data_vencimento ON public.alertas_agronomicos(data_vencimento);
CREATE INDEX IF NOT EXISTS idx_alertas_registro_origem ON public.alertas_agronomicos(registro_origem_id);
