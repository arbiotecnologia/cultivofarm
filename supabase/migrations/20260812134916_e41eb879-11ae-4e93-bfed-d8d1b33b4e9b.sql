-- NINTH SCHEMA RESTORATION FOR BUILD FIX (Resolving remaining inventory gaps)

-- PRODUTOS (Mais um campo financeiro)
ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS valor_ha_brl numeric;

-- ESTOQUE_PRODUTO (Lote ID para reserva direta)
ALTER TABLE public.estoque_produto ADD COLUMN IF NOT EXISTS lote_id uuid REFERENCES public.lotes(id);

-- MOCK PARA RPC DE CRIAR PORTAL NOTIFICATION (Versão completa para evitar TS error)
CREATE OR REPLACE FUNCTION public.rpc_create_portal_notification_secure(
    _cliente_id uuid,
    _tipo text,
    _titulo text,
    _mensagem text,
    _link text,
    _source_type text,
    _source_id uuid,
    _idempotency_key text
) RETURNS void AS $$
BEGIN
    INSERT INTO public.portal_notifications (
        cliente_id, tipo, titulo, mensagem, link, source_type, source_id, idempotency_key
    ) VALUES (
        _cliente_id, _tipo, _titulo, _mensagem, _link, _source_type, _source_id, _idempotency_key
    ) ON CONFLICT (idempotency_key) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- PORTAL NOTIFICATIONS TABLE (Necessária para a RPC acima)
CREATE TABLE IF NOT EXISTS public.portal_notifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id uuid REFERENCES public.clientes(id),
    tipo text,
    titulo text,
    mensagem text,
    link text,
    source_type text,
    source_id uuid,
    idempotency_key text UNIQUE,
    read boolean DEFAULT false,
    created_at timestamptz DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.portal_notifications TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_create_portal_notification_secure TO authenticated;

-- AJUSTAR EVIDENCIAS (Storage path e campos técnicos)
ALTER TABLE public.evidencias 
ADD COLUMN IF NOT EXISTS storage_path text,
ADD COLUMN IF NOT EXISTS mime text,
ADD COLUMN IF NOT EXISTS tamanho_bytes bigint;
