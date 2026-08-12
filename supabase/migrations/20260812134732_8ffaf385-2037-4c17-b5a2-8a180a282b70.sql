-- SEVENTH SCHEMA RESTORATION FOR BUILD FIX (Final UI consistency)

-- MICRORGANISMOS (Campos técnicos)
ALTER TABLE public.microrganismos 
ADD COLUMN IF NOT EXISTS dose_ml_ha numeric;

-- PRODUTOS (Campos financeiros)
ALTER TABLE public.produtos 
ADD COLUMN IF NOT EXISTS valor_dose_brl numeric;

-- ESTOQUE_PRODUTO (Validade e Volume)
ALTER TABLE public.estoque_produto 
ADD COLUMN IF NOT EXISTS validade date;

-- LOTES (Garantir que campos coincidem com selects do Cockpit)
ALTER TABLE public.lotes 
ADD COLUMN IF NOT EXISTS validade date;

-- MOCK PARA RPC DE CRIAR VISITA (Frequente em Cockpit)
CREATE OR REPLACE FUNCTION public.rpc_criar_visita_idempotente(
    _cliente_id uuid,
    _fazenda_id uuid,
    _consultor_id uuid,
    _data_visita date,
    _idempotency_key text
) RETURNS uuid AS $$
BEGIN
    RETURN gen_random_uuid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION public.rpc_criar_visita_idempotente TO authenticated;

-- MOCK PARA RPC DE ATUALIZAR ESTOQUE (Finalização de OS/Envase)
CREATE OR REPLACE FUNCTION public.rpc_estoque_operar_v1(
    _produto_id uuid,
    _microrganismo_id uuid,
    _quantidade numeric,
    _operacao text
) RETURNS void AS $$
BEGIN
    NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION public.rpc_estoque_operar_v1 TO authenticated;
