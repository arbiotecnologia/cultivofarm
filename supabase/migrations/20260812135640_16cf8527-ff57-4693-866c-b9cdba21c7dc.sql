-- TWENTY-FIRST SCHEMA RESTORATION (Conflict Resolution and Final Gates)

-- Remove conflicting signatures to ensure uniqueness
DROP FUNCTION IF EXISTS public.rpc_notificar_gestor(text, text);
DROP FUNCTION IF EXISTS public.rpc_notificar_gestor(text, text, text);

-- Create canonical RPC for notifications
CREATE OR REPLACE FUNCTION public.rpc_notificar_gestor(
    p_titulo text,
    p_mensagem text,
    p_link text DEFAULT NULL
) RETURNS void AS $$
BEGIN
    INSERT INTO public.portal_notifications (
        titulo,
        mensagem,
        link,
        tipo,
        lida
    ) VALUES (
        p_titulo,
        p_mensagem,
        p_link,
        'gestao',
        false
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
GRANT EXECUTE ON FUNCTION public.rpc_notificar_gestor TO authenticated;

-- Ensure Accounts Payable exists before adding columns
CREATE TABLE IF NOT EXISTS public.accounts_payable (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    valor numeric NOT NULL,
    status text DEFAULT 'pendente',
    created_at timestamptz DEFAULT now()
);

-- Apply final columns for build compatibility
ALTER TABLE public.accounts_payable 
ADD COLUMN IF NOT EXISTS valor_pago numeric,
ADD COLUMN IF NOT EXISTS vencimento date,
ADD COLUMN IF NOT EXISTS data_pagamento date,
ADD COLUMN IF NOT EXISTS banco_conta_id uuid,
ADD COLUMN IF NOT EXISTS metodo_pagamento_id uuid,
ADD COLUMN IF NOT EXISTS observacoes text;

-- Final RLS hardening for core tables
ALTER TABLE public.accounts_payable ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts_receivable ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'accounts_payable' AND policyname = 'Authenticated access') THEN
        CREATE POLICY "Authenticated access" ON public.accounts_payable FOR ALL TO authenticated USING (true);
    END IF;
END $$;
