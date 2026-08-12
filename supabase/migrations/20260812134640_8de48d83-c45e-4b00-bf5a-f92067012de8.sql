-- SIXTH SCHEMA RESTORATION FOR BUILD FIX (Resolving Cockpit/CQ/Envase)

-- MICRORGANISMOS (Campos financeiros adicionais)
ALTER TABLE public.microrganismos 
ADD COLUMN IF NOT EXISTS valor_litro_brl numeric;

-- PRODUTOS (Descrição)
ALTER TABLE public.produtos 
ADD COLUMN IF NOT EXISTS descricao text;

-- CONTROLE_QUALIDADE
CREATE TABLE IF NOT EXISTS public.controle_qualidade (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    lote_id uuid REFERENCES public.lotes(id),
    status text,
    resultado text,
    data_analise date,
    created_at timestamptz DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.controle_qualidade TO authenticated;

-- ENVASE
CREATE TABLE IF NOT EXISTS public.envase (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    lote_id uuid REFERENCES public.lotes(id),
    quantidade numeric,
    data_envase date,
    reservado_para_os_id uuid REFERENCES public.ordens_servico(id),
    created_at timestamptz DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.envase TO authenticated;

-- PROGRAMACAO_PRODUCAO (Campos operacionais)
ALTER TABLE public.programacao_producao 
ADD COLUMN IF NOT EXISTS volume_necessario numeric;

-- ESTOQUE_PRODUTO (Campos operacionais)
ALTER TABLE public.estoque_produto 
ADD COLUMN IF NOT EXISTS volume_total numeric;

-- MOCK PARA FUNÇÃO DE LEITURA DE SCHEMA (Previne erro excessively deep)
CREATE OR REPLACE VIEW public.vw_schema_health AS 
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';
GRANT SELECT ON public.vw_schema_health TO authenticated;
