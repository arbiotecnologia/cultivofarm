-- THIRD SCHEMA RESTORATION FOR BUILD FIX (Deep normalization)

-- ORDENS_SERVICO (Campos faltantes)
ALTER TABLE public.ordens_servico ADD COLUMN IF NOT EXISTS data_programada date;

-- MICRORGANISMOS (Campos faltantes)
ALTER TABLE public.microrganismos 
ADD COLUMN IF NOT EXISTS nome_cientifico text,
ADD COLUMN IF NOT EXISTS ativo boolean DEFAULT true;

-- MICROORGANISM_TECHNICAL_PROFILES
CREATE TABLE IF NOT EXISTS public.microorganism_technical_profiles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    microrganismo_id uuid REFERENCES public.microrganismos(id),
    resumo_curto text,
    explicacao_produtor text,
    indicacoes_uso text,
    cuidados_aplicacao text,
    beneficios_agronomicos text,
    status_validacao text DEFAULT 'rascunho',
    created_at timestamptz DEFAULT now()
);
GRANT SELECT ON public.microorganism_technical_profiles TO authenticated;

-- CLIENTE_DOCUMENTOS
CREATE TABLE IF NOT EXISTS public.cliente_documentos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id uuid REFERENCES public.clientes(id),
    titulo text,
    url text,
    created_at timestamptz DEFAULT now()
);
GRANT SELECT, DELETE ON public.cliente_documentos TO authenticated;

-- PRODUTO_ANEXOS (para FichaProdutorDrawer)
CREATE TABLE IF NOT EXISTS public.produto_anexos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    produto_id uuid REFERENCES public.produtos(id),
    titulo text,
    url text,
    created_at timestamptz DEFAULT now()
);
GRANT SELECT ON public.produto_anexos TO authenticated;

-- LABORATÓRIO E CQ (Campos faltantes detectados em erros truncados)
CREATE TABLE IF NOT EXISTS public.esteira_producao_v2 (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ordem_servico_id uuid REFERENCES public.ordens_servico(id),
    status text,
    created_at timestamptz DEFAULT now()
);
GRANT SELECT ON public.esteira_producao_v2 TO authenticated;

-- AJUSTAR PROFILES (Garantir campos comuns)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url text;
