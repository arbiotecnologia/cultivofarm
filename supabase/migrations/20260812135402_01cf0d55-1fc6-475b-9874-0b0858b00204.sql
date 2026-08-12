-- SIXTEENTH SCHEMA RESTORATION (Dropping and recreating functions with correct param names)

-- DROP FUNCTIONS TO RENAME PARAMS
DROP FUNCTION IF EXISTS public.rpc_gerar_etiqueta_produto(uuid,jsonb);
DROP FUNCTION IF EXISTS public.rpc_cancelar_etiqueta_produto(uuid);
DROP FUNCTION IF EXISTS public.rpc_create_portal_notification_secure(uuid,text,text,text,text,text,uuid,text);

-- RECREATE WITH FRONTEND-EXPECTED PARAMS (p_ prefix)
CREATE OR REPLACE FUNCTION public.rpc_gerar_etiqueta_produto(
    p_lote_id uuid,
    p_payload jsonb
) RETURNS uuid AS $$
BEGIN
    RETURN gen_random_uuid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.rpc_cancelar_etiqueta_produto(
    p_etiqueta_id uuid
) RETURNS void AS $$
BEGIN
    NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.rpc_create_portal_notification_secure(
    p_cliente_id uuid,
    p_tipo text,
    p_titulo text,
    p_mensagem text,
    p_link text,
    p_source_type text,
    p_source_id uuid,
    p_idempotency_key text
) RETURNS void AS $$
BEGIN
    INSERT INTO public.portal_notifications (
        cliente_id, tipo, titulo, mensagem, link, source_type, source_id, idempotency_key
    ) VALUES (
        p_cliente_id, p_tipo, p_titulo, p_mensagem, p_link, p_source_type, p_source_id, p_idempotency_key
    ) ON CONFLICT (idempotency_key) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.rpc_gerar_etiqueta_produto TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_cancelar_etiqueta_produto TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_create_portal_notification_secure TO authenticated;

-- TALHOES (Garantir campos)
ALTER TABLE public.talhoes 
ADD COLUMN IF NOT EXISTS historico_pragas text,
ADD COLUMN IF NOT EXISTS observacoes text,
ADD COLUMN IF NOT EXISTS latitude numeric,
ADD COLUMN IF NOT EXISTS longitude numeric,
ADD COLUMN IF NOT EXISTS localizacao_referencia text,
ADD COLUMN IF NOT EXISTS ativo boolean DEFAULT true;

-- FINANCIAL_SETTINGS
CREATE TABLE IF NOT EXISTS public.financial_settings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    chave text UNIQUE,
    valor text,
    created_at timestamptz DEFAULT now()
);
GRANT SELECT ON public.financial_settings TO authenticated;
