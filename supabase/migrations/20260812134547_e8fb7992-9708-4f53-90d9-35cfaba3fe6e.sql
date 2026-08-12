-- FIFTH SCHEMA RESTORATION FOR BUILD FIX (Focusing on Inventory and Audit)

-- MICRORGANISMOS (Mais campos financeiros)
ALTER TABLE public.microrganismos 
ADD COLUMN IF NOT EXISTS valor_dose_brl numeric;

-- PRODUTOS (Mais campos técnicos)
ALTER TABLE public.produtos 
ADD COLUMN IF NOT EXISTS tipo text;

-- LOTES (Normalização para Esteira)
ALTER TABLE public.lotes 
ADD COLUMN IF NOT EXISTS microrganismo_id uuid REFERENCES public.microrganismos(id);

-- ESTOQUE_PRODUTO (Garantir estrutura para BI/Cockpit)
CREATE TABLE IF NOT EXISTS public.estoque_produto (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    produto_id uuid REFERENCES public.produtos(id),
    microrganismo_id uuid REFERENCES public.microrganismos(id),
    quantidade numeric DEFAULT 0,
    created_at timestamptz DEFAULT now()
);
GRANT SELECT ON public.estoque_produto TO authenticated;

-- CLIENTES_AUDIT_LOG
CREATE TABLE IF NOT EXISTS public.clientes_audit_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id uuid REFERENCES public.clientes(id),
    acao text,
    alteracoes jsonb,
    usuario_id uuid,
    created_at timestamptz DEFAULT now()
);
GRANT SELECT ON public.clientes_audit_log TO authenticated;

-- CLIENTE_CONTATOS (Ajuste para tipagem Contato)
ALTER TABLE public.cliente_contatos 
ADD COLUMN IF NOT EXISTS principal boolean DEFAULT false;

-- MOCK PARA RPC DE IDEMPOTÊNCIA (Comum em fluxos de OS)
CREATE OR REPLACE FUNCTION public.rpc_generate_idempotency_key()
RETURNS text AS $$
BEGIN
    RETURN encode(extensions.digest(now()::text || random()::text, 'sha256'), 'hex');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION public.rpc_generate_idempotency_key TO authenticated;
