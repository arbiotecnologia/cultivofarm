CREATE TABLE public.bi_user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  filtros JSONB NOT NULL DEFAULT '{}',
  secao TEXT,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bi_user_preferences TO authenticated;
GRANT ALL ON public.bi_user_preferences TO service_role;

-- RLS
ALTER TABLE public.bi_user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários podem gerenciar suas próprias preferências" ON public.bi_user_preferences
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Índices
CREATE INDEX idx_bi_user_preferences_user_id ON public.bi_user_preferences(user_id);
CREATE INDEX idx_bi_user_preferences_user_secao ON public.bi_user_preferences(user_id, secao);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_bi_user_preferences_updated_at
    BEFORE UPDATE ON public.bi_user_preferences
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();