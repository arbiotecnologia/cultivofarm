-- Add column to store the last sent email if needed
ALTER TABLE public.aplicacoes ADD COLUMN IF NOT EXISTS email_envio TEXT;

-- Create a table to track emails sent for each application
CREATE TABLE IF NOT EXISTS public.aplicacao_emails (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    aplicacao_id UUID NOT NULL REFERENCES public.aplicacoes(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    enviado_por UUID REFERENCES auth.users(id),
    status TEXT DEFAULT 'enviado',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.aplicacao_emails ENABLE ROW LEVEL SECURITY;

-- Policies for aplicacao_emails
CREATE POLICY "Users can view emails sent for their applications" 
ON public.aplicacao_emails 
FOR SELECT 
USING (
    EXISTS (
        SELECT 1 FROM public.aplicacoes a
        JOIN public.ordens_servico os ON a.ordem_servico_id = os.id
        WHERE a.id = aplicacao_emails.aplicacao_id
    )
);

CREATE POLICY "Users can record sent emails" 
ON public.aplicacao_emails 
FOR INSERT 
WITH CHECK (true);
