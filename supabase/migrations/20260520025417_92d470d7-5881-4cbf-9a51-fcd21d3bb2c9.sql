-- Criar tabela de vínculos entre aplicações e evidências
CREATE TABLE IF NOT EXISTS public.aplicacao_evidencias_vinculos (
    aplicacao_id UUID NOT NULL REFERENCES public.aplicacoes(id) ON DELETE CASCADE,
    evidencia_id UUID NOT NULL REFERENCES public.aplicacao_evidencias(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    PRIMARY KEY (aplicacao_id, evidencia_id)
);

-- Habilitar RLS
ALTER TABLE public.aplicacao_evidencias_vinculos ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS
CREATE POLICY "Permitir leitura de vínculos para usuários autenticados" 
ON public.aplicacao_evidencias_vinculos FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Permitir inserção de vínculos para usuários autenticados" 
ON public.aplicacao_evidencias_vinculos FOR INSERT 
TO authenticated 
WITH CHECK (true);

CREATE POLICY "Permitir exclusão de vínculos para usuários autenticados" 
ON public.aplicacao_evidencias_vinculos FOR DELETE 
TO authenticated 
USING (true);

-- Migrar vínculos existentes
INSERT INTO public.aplicacao_evidencias_vinculos (aplicacao_id, evidencia_id)
SELECT aplicacao_id, id FROM public.aplicacao_evidencias
ON CONFLICT DO NOTHING;

-- Adicionar índice para performance
CREATE INDEX IF NOT EXISTS idx_evidencia_vinculos_aplicacao ON public.aplicacao_evidencias_vinculos(aplicacao_id);
CREATE INDEX IF NOT EXISTS idx_evidencia_vinculos_evidencia ON public.aplicacao_evidencias_vinculos(evidencia_id);
