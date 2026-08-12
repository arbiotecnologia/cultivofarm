-- TWELFTH SCHEMA RESTORATION (Fixing missing Entregas and dependent tables)

-- ENTREGAS (Base para etiquetas e outros)
CREATE TABLE IF NOT EXISTS public.entregas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ordem_servico_id uuid REFERENCES public.ordens_servico(id),
    cliente_id uuid REFERENCES public.clientes(id),
    status text,
    data_entrega date,
    responsavel_id uuid,
    created_at timestamptz DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.entregas TO authenticated;
GRANT ALL ON public.entregas TO service_role;

-- ENTREGA_ETIQUETAS
CREATE TABLE IF NOT EXISTS public.entrega_etiquetas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    entrega_id uuid REFERENCES public.entregas(id),
    codigo_barras text,
    created_at timestamptz DEFAULT now()
);
GRANT SELECT, INSERT ON public.entrega_etiquetas TO authenticated;

-- ESTOQUE_PRODUTO (Reserva de OS)
ALTER TABLE public.estoque_produto ADD COLUMN IF NOT EXISTS reservado_para_os_id uuid REFERENCES public.ordens_servico(id);

-- ORDENS_SERVICO_ONFARM
CREATE TABLE IF NOT EXISTS public.ordens_servico_onfarm (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ordem_servico_id uuid REFERENCES public.ordens_servico(id),
    created_at timestamptz DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.ordens_servico_onfarm TO authenticated;

-- MOCKS
CREATE OR REPLACE FUNCTION public.rpc_cockpit_criar_entrega_v1(
    _ordem_servico_id uuid,
    _volume_total numeric
) RETURNS uuid AS $$
BEGIN
    RETURN gen_random_uuid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.rpc_gerar_formulario_entrega(
    _entrega_id uuid
) RETURNS boolean AS $$
BEGIN
    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.fn_fiscal_apply_tax_v2(
    _item_id uuid,
    _payload jsonb
) RETURNS jsonb AS $$
BEGIN
    RETURN _payload;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.rpc_cockpit_criar_entrega_v1 TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_gerar_formulario_entrega TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_fiscal_apply_tax_v2 TO authenticated;
