-- Tabela para controle de avisos de monitoramento (idempotência)
CREATE TABLE IF NOT EXISTS public.monitoramento_avisos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    registro_consultor_id UUID NOT NULL REFERENCES public.registros_consultor(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL,
    enviado_em TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE (registro_consultor_id, tipo, enviado_em)
);

-- Habilitar RLS
ALTER TABLE public.monitoramento_avisos ENABLE ROW LEVEL SECURITY;

-- Política de visualização para usuários autenticados
CREATE POLICY "Visualização para usuários autenticados" 
ON public.monitoramento_avisos 
FOR SELECT 
TO authenticated 
USING (true);

-- Tabela para assinaturas de Push Notification PWA
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    last_used_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Políticas para push_subscriptions
CREATE POLICY "Usuários gerenciam suas próprias assinaturas" 
ON public.push_subscriptions 
FOR ALL 
TO authenticated 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_monitoramento_avisos_registro ON public.monitoramento_avisos(registro_consultor_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON public.push_subscriptions(user_id);
