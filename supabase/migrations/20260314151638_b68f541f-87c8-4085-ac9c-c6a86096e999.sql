
-- Configurações do sistema (singleton)
CREATE TABLE public.configuracoes_sistema (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  logo_url text,
  nome_empresa text DEFAULT 'AR Bio',
  cor_primaria text DEFAULT '160 84% 22%',
  cor_sidebar_bg text DEFAULT '215 25% 12%',
  cor_sidebar_primary text DEFAULT '160 84% 39%',
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Inserir registro padrão
INSERT INTO public.configuracoes_sistema (nome_empresa) VALUES ('AR Bio');

-- RLS
ALTER TABLE public.configuracoes_sistema ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read config" ON public.configuracoes_sistema
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can update config" ON public.configuracoes_sistema
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'administrador'));

-- Bucket para logos
INSERT INTO storage.buckets (id, name, public) VALUES ('logos', 'logos', true);

CREATE POLICY "Admins upload logos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'logos' AND public.has_role(auth.uid(), 'administrador'));

CREATE POLICY "Anyone can view logos" ON storage.objects
  FOR SELECT USING (bucket_id = 'logos');
