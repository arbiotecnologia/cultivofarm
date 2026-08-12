-- FOURTEENTH SCHEMA RESTORATION (Resolving Finance, Labels and B2B)

-- ORDENS_SERVICO_ONFARM (Campo cliente_id para ReservaDialog)
ALTER TABLE public.ordens_servico_onfarm ADD COLUMN IF NOT EXISTS cliente_id uuid REFERENCES public.clientes(id);

-- PARTNER_ORDERS
CREATE TABLE IF NOT EXISTS public.partner_orders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_id uuid REFERENCES public.partner_accounts(id),
    status text,
    created_at timestamptz DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.partner_orders TO authenticated;

-- ADJUST ORDENS_SERVICO (Partner order reference)
ALTER TABLE public.ordens_servico ADD COLUMN IF NOT EXISTS partner_order_id uuid REFERENCES public.partner_orders(id);

-- OS_FATURAMENTO_BASE
CREATE TABLE IF NOT EXISTS public.os_faturamento_base (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ordem_servico_id uuid REFERENCES public.ordens_servico(id),
    origem_os_tipo text,
    status text,
    created_at timestamptz DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.os_faturamento_base TO authenticated;

-- MOCK PARA RPC DE ETIQUETAS
CREATE OR REPLACE FUNCTION public.rpc_gerar_etiqueta_produto(
    _lote_id uuid,
    _payload jsonb
) RETURNS uuid AS $$
BEGIN
    RETURN gen_random_uuid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.rpc_cancelar_etiqueta_produto(
    _etiqueta_id uuid
) RETURNS void AS $$
BEGIN
    NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.rpc_gerar_etiqueta_produto TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_cancelar_etiqueta_produto TO authenticated;

-- FISCAL ITEM READINESS (Fase F1)
CREATE OR REPLACE FUNCTION public.rpc_fiscal_item_readiness(_item_id uuid, _tipo text)
RETURNS jsonb AS $$
BEGIN
    RETURN jsonb_build_object('ready', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION public.rpc_fiscal_item_readiness TO authenticated;
