-- Tabela de log de sincronização
CREATE TABLE IF NOT EXISTS public.agenda_sync_log (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    solicitacao_id uuid REFERENCES public.portal_solicitacoes(id) ON DELETE CASCADE,
    provider text NOT NULL, -- 'google' ou 'outlook'
    external_event_id text,
    status text NOT NULL DEFAULT 'synced', -- 'synced', 'failed', 'removed'
    error_message text,
    last_synced_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.agenda_sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins e Gestores podem gerenciar logs de sync"
ON public.agenda_sync_log
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'administrativo') OR public.has_role(auth.uid(), 'gestor'));

-- Campo para armazenar o ID externo na solicitação para facilitar
ALTER TABLE public.portal_solicitacoes
ADD COLUMN IF NOT EXISTS external_event_id text;
