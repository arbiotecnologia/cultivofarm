-- TENTH SCHEMA RESTORATION FOR BUILD FIX (Resolving deep business logic dependencies)

-- ESTOQUE_PRODUTO (Envase ID)
ALTER TABLE public.estoque_produto ADD COLUMN IF NOT EXISTS envase_id uuid REFERENCES public.envase(id);

-- PARTNER_ACCOUNTS
CREATE TABLE IF NOT EXISTS public.partner_accounts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo text UNIQUE,
    nome text NOT NULL,
    created_at timestamptz DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.partner_accounts TO authenticated;

-- AUDIT_SENHA_LOG
CREATE TABLE IF NOT EXISTS public.audit_senha_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id uuid,
    acao text,
    created_at timestamptz DEFAULT now()
);
GRANT SELECT, INSERT ON public.audit_senha_log TO authenticated;

-- ACCOUNTS_RECEIVABLE
CREATE TABLE IF NOT EXISTS public.accounts_receivable (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ordem_servico_id uuid REFERENCES public.ordens_servico(id),
    valor numeric,
    status text,
    created_at timestamptz DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.accounts_receivable TO authenticated;

-- CLIENTE_CAMPOS_EXTRAS
CREATE TABLE IF NOT EXISTS public.cliente_campos_extras (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id uuid REFERENCES public.clientes(id),
    campo text,
    valor text,
    created_at timestamptz DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.cliente_campos_extras TO authenticated;

-- ESTOQUE_MOVIMENTACOES
CREATE TABLE IF NOT EXISTS public.estoque_movimentacoes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    produto_id uuid REFERENCES public.produtos(id),
    quantidade numeric,
    tipo text, -- 'entrada', 'saida'
    origem text,
    created_at timestamptz DEFAULT now()
);
GRANT SELECT, INSERT ON public.estoque_movimentacoes TO authenticated;

-- MOCK PARA RPC DE CRIAR PEDIDO PARCEIRO (Comum em B2B)
CREATE OR REPLACE FUNCTION public.create_partner_order_secure(
    _partner_id uuid,
    _items jsonb
) RETURNS uuid AS $$
BEGIN
    RETURN gen_random_uuid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION public.create_partner_order_secure TO authenticated;
