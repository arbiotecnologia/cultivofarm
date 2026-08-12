-- FOURTH SCHEMA RESTORATION FOR BUILD FIX (Resolving deep UI dependencies)

-- MICRORGANISMOS (Campos técnicos)
ALTER TABLE public.microrganismos 
ADD COLUMN IF NOT EXISTS funcao_agronomica text;

-- PRODUTOS (Campos técnicos)
ALTER TABLE public.produtos 
ADD COLUMN IF NOT EXISTS codigo text,
ADD COLUMN IF NOT EXISTS ativo boolean DEFAULT true;

-- PRODUCT_TECHNICAL_PROFILES
CREATE TABLE IF NOT EXISTS public.product_technical_profiles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    produto_id uuid REFERENCES public.produtos(id),
    resumo_curto text,
    explicacao_produtor text,
    indicacoes_uso text,
    cuidados_aplicacao text,
    beneficio_combinado text,
    status_validacao text DEFAULT 'rascunho',
    created_at timestamptz DEFAULT now()
);
GRANT SELECT ON public.product_technical_profiles TO authenticated;

-- CLIENTE_CONTATOS
CREATE TABLE IF NOT EXISTS public.cliente_contatos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id uuid REFERENCES public.clientes(id),
    nome text NOT NULL,
    cargo text,
    email text,
    telefone text,
    is_whatsapp boolean DEFAULT false,
    created_at timestamptz DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cliente_contatos TO authenticated;

-- SINCRONIZAR TYPES.TS (Forçar atualização via script de build se necessário, mas aqui apenas garantimos o schema)
