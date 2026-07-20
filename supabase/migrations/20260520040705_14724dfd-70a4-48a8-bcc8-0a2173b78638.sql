-- Criar tabela de histórico de status para OS On-Farm
CREATE TABLE IF NOT EXISTS public.ordens_servico_onfarm_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    os_onfarm_id UUID REFERENCES public.ordens_servico_onfarm(id) ON DELETE CASCADE NOT NULL,
    status_anterior TEXT,
    status_novo TEXT NOT NULL,
    usuario_id UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Habilitar RLS
ALTER TABLE public.ordens_servico_onfarm_status_history ENABLE ROW LEVEL SECURITY;

-- Políticas de acesso
CREATE POLICY "Usuários podem ver histórico de OS que acessam"
ON public.ordens_servico_onfarm_status_history
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.ordens_servico_onfarm os
        WHERE os.id = os_onfarm_id
        AND public.can_user_access_cliente(os.cliente_id)
    )
);

-- Função do gatilho para registrar mudança de status
CREATE OR REPLACE FUNCTION public.log_os_onfarm_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF (OLD.status IS DISTINCT FROM NEW.status) THEN
        INSERT INTO public.ordens_servico_onfarm_status_history (
            os_onfarm_id,
            status_anterior,
            status_novo,
            usuario_id
        ) VALUES (
            NEW.id,
            OLD.status::TEXT,
            NEW.status::TEXT,
            auth.uid()
        );
    END IF;
    RETURN NEW;
END;
$$;

-- Criar o gatilho
DROP TRIGGER IF EXISTS trg_log_os_onfarm_status_change ON public.ordens_servico_onfarm;
CREATE TRIGGER trg_log_os_onfarm_status_change
AFTER UPDATE ON public.ordens_servico_onfarm
FOR EACH ROW
EXECUTE FUNCTION public.log_os_onfarm_status_change();
