-- THIRTEENTH SCHEMA RESTORATION (Resolving OS On-Farm, Etiquetas and Terms)

-- ESTOQUE_PRODUTO (Tipo de reserva)
ALTER TABLE public.estoque_produto ADD COLUMN IF NOT EXISTS reservado_para_os_tipo text;

-- ENTREGA_ETIQUETAS (Campo ativo)
ALTER TABLE public.entrega_etiquetas ADD COLUMN IF NOT EXISTS ativo boolean DEFAULT true;

-- ENTREGA_CONFERENCIA_ITENS
CREATE TABLE IF NOT EXISTS public.entrega_conferencia_itens (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    entrega_id uuid REFERENCES public.entregas(id),
    produto_id uuid REFERENCES public.produtos(id),
    lote_id uuid REFERENCES public.lotes(id),
    quantidade_conferida numeric,
    created_at timestamptz DEFAULT now()
);
GRANT SELECT, INSERT ON public.entrega_conferencia_itens TO authenticated;

-- ENTREGA_TERMOS
CREATE TABLE IF NOT EXISTS public.entrega_termos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    entrega_id uuid REFERENCES public.entregas(id),
    termo text,
    aceite boolean DEFAULT false,
    created_at timestamptz DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.entrega_termos TO authenticated;

-- MOCK PARA RPC DE CRIAR VISITA (Caso falte)
CREATE OR REPLACE FUNCTION public.rpc_cockpit_criar_visita_v1(
    _cliente_id uuid,
    _fazenda_id uuid,
    _data_visita date
) RETURNS uuid AS $$
BEGIN
    RETURN gen_random_uuid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION public.rpc_cockpit_criar_visita_v1 TO authenticated;

-- MOCK PARA RPC DE FINALIZAR OS (Fluxo Lab)
CREATE OR REPLACE FUNCTION public.rpc_cockpit_finalizar_os_v1(
    _ordem_servico_id uuid
) RETURNS void AS $$
BEGIN
    NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION public.rpc_cockpit_finalizar_os_v1 TO authenticated;
