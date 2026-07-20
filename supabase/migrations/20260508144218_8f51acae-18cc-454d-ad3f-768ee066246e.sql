-- Adicionar coluna de telefones (array)
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS telefones TEXT[] DEFAULT '{}';

-- Migrar dados existentes de 'telefone' para o array 'telefones'
UPDATE public.clientes SET telefones = ARRAY[telefone] WHERE telefone IS NOT NULL AND (telefones IS NULL OR array_length(telefones, 1) IS NULL);

-- Garantir que a tabela cliente_contatos existe (já deve existir baseado no código visto)
CREATE TABLE IF NOT EXISTS public.cliente_contatos (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    cliente_id UUID REFERENCES public.clientes(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    cargo TEXT,
    email TEXT,
    telefone TEXT,
    principal BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Habilitar RLS para cliente_contatos se ainda não estiver
ALTER TABLE public.cliente_contatos ENABLE ROW LEVEL SECURITY;

-- Políticas para cliente_contatos
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view their own client contacts') THEN
        CREATE POLICY "Users can view their own client contacts" ON public.cliente_contatos FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can insert their own client contacts') THEN
        CREATE POLICY "Users can insert their own client contacts" ON public.cliente_contatos FOR INSERT WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can update their own client contacts') THEN
        CREATE POLICY "Users can update their own client contacts" ON public.cliente_contatos FOR UPDATE USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can delete their own client contacts') THEN
        CREATE POLICY "Users can delete their own client contacts" ON public.cliente_contatos FOR DELETE USING (true);
    END IF;
END $$;
