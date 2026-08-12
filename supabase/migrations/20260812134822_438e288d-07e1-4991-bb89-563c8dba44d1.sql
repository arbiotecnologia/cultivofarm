-- EIGHTH SCHEMA RESTORATION FOR BUILD FIX (Final touch)

-- MICRORGANISMOS (Garantir nome)
ALTER TABLE public.microrganismos ADD COLUMN IF NOT EXISTS nome text;

-- PRODUTOS (Mais campos)
ALTER TABLE public.produtos 
ADD COLUMN IF NOT EXISTS valor_litro_brl numeric,
ADD COLUMN IF NOT EXISTS nome text;

-- ESTOQUE_PRODUTO (Status)
ALTER TABLE public.estoque_produto ADD COLUMN IF NOT EXISTS status text;

-- LOTES (Garantir ID em selects operacionais)
-- Já tem ID (PRIMARY KEY)

-- MOCK PARA FUNÇÃO DE NOTIFICAÇÃO (Complemento)
CREATE OR REPLACE FUNCTION public.rpc_notificar_gestor(
    _titulo text,
    _mensagem text
) RETURNS void AS $$
BEGIN
    NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION public.rpc_notificar_gestor TO authenticated;
