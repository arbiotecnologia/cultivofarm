-- Create ENUM for billing base status
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'faturamento_base_status') THEN
        CREATE TYPE public.faturamento_base_status AS ENUM (
            'PENDENTE', 
            'LIBERADO_FATURAMENTO', 
            'FATURADO_PARCIAL', 
            'FATURADO_TOTAL', 
            'CANCELADO'
        );
    END IF;
END $$;

-- Create table for billing base
CREATE TABLE IF NOT EXISTS public.os_faturamento_base (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    origem_os_tipo TEXT NOT NULL CHECK (origem_os_tipo IN ('TRADICIONAL', 'ON_FARM')),
    ordem_servico_id UUID NOT NULL,
    cliente_id UUID REFERENCES public.clientes(id),
    produto_id UUID REFERENCES public.produtos(id),
    
    -- Snapshots to prevent historical changes
    modelo_precificacao TEXT NOT NULL,
    area_hectares_snapshot DECIMAL(12,2) NOT NULL DEFAULT 0,
    volume_total_ml_snapshot DECIMAL(12,2) NOT NULL DEFAULT 0,
    valor_ha_snapshot DECIMAL(12,2) NOT NULL DEFAULT 0,
    
    -- Values
    subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
    desconto_valor DECIMAL(12,2) NOT NULL DEFAULT 0,
    acrescimo_valor DECIMAL(12,2) NOT NULL DEFAULT 0,
    valor_total_faturavel DECIMAL(12,2) NOT NULL DEFAULT 0,
    
    -- Payment Conditions
    condicao_pagamento_snapshot TEXT,
    numero_parcelas_sugerido INTEGER NOT NULL DEFAULT 1,
    primeiro_vencimento_sugerido DATE,
    
    status public.faturamento_base_status NOT NULL DEFAULT 'PENDENTE',
    
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_faturamento_base_os ON public.os_faturamento_base(ordem_servico_id);

-- Prevent multiple active billing bases for the same OS
CREATE UNIQUE INDEX IF NOT EXISTS idx_faturamento_base_unique_active 
ON public.os_faturamento_base (ordem_servico_id, origem_os_tipo) 
WHERE (status != 'CANCELADO');

-- Function to calculate totals
CREATE OR REPLACE FUNCTION public.fn_calc_os_faturamento_totals()
RETURNS TRIGGER AS $$
BEGIN
    -- Subtotal based on pricing model
    IF NEW.modelo_precificacao = 'HA' THEN
        NEW.subtotal := NEW.area_hectares_snapshot * NEW.valor_ha_snapshot;
    END IF;

    -- Total Faturavel
    NEW.valor_total_faturavel := NEW.subtotal - NEW.desconto_valor + NEW.acrescimo_valor;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for totals
DROP TRIGGER IF EXISTS tr_calc_os_faturamento_totals ON public.os_faturamento_base;
CREATE TRIGGER tr_calc_os_faturamento_totals
BEFORE INSERT OR UPDATE ON public.os_faturamento_base
FOR EACH ROW
EXECUTE FUNCTION public.fn_calc_os_faturamento_totals();

-- Update timestamp trigger
DROP TRIGGER IF EXISTS tr_os_faturamento_base_updated_at ON public.os_faturamento_base;
CREATE TRIGGER tr_os_faturamento_base_updated_at
BEFORE UPDATE ON public.os_faturamento_base
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.os_faturamento_base ENABLE ROW LEVEL SECURITY;

-- Policies (Simplified for now using cargo until a more robust role system is verified)
CREATE POLICY "View billing base" ON public.os_faturamento_base
FOR SELECT USING (true);

CREATE POLICY "Manage billing base" ON public.os_faturamento_base
FOR ALL USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE user_id = auth.uid() 
        AND cargo IN ('Admin', 'Gestor', 'Administrativo', 'Financeiro')
    )
) WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE user_id = auth.uid() 
        AND cargo IN ('Admin', 'Gestor', 'Administrativo', 'Financeiro')
    )
);