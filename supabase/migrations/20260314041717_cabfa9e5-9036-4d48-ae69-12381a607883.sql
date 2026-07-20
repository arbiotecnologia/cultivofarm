-- Enums
CREATE TYPE public.tipo_alerta AS ENUM ('praga','doenca','daninha','nematoide','estresse_hidrico');
CREATE TYPE public.nivel_risco AS ENUM ('baixo','medio','alto','critico');
CREATE TYPE public.status_alerta AS ENUM ('ativo','monitoramento','encerrado');

-- Dados climaticos
CREATE TABLE public.clima_dados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id uuid NOT NULL REFERENCES public.fazendas(id) ON DELETE CASCADE,
  data_hora timestamptz NOT NULL DEFAULT now(),
  temperatura numeric,
  umidade numeric,
  chuva_mm numeric DEFAULT 0,
  vento_kmh numeric,
  radiacao_solar numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.clima_dados ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can select clima_dados" ON public.clima_dados FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert clima_dados" ON public.clima_dados FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update clima_dados" ON public.clima_dados FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Admins can delete clima_dados" ON public.clima_dados FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'administrador'::app_role));

-- Alertas agronomicos
CREATE TABLE public.alertas_agronomicos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id uuid NOT NULL REFERENCES public.fazendas(id) ON DELETE CASCADE,
  talhao_id uuid REFERENCES public.talhoes(id) ON DELETE SET NULL,
  tipo_alerta public.tipo_alerta NOT NULL,
  nivel_risco public.nivel_risco NOT NULL DEFAULT 'baixo',
  descricao text,
  data_alerta timestamptz NOT NULL DEFAULT now(),
  status public.status_alerta NOT NULL DEFAULT 'ativo',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.alertas_agronomicos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can select alertas" ON public.alertas_agronomicos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert alertas" ON public.alertas_agronomicos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update alertas" ON public.alertas_agronomicos FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Admins can delete alertas" ON public.alertas_agronomicos FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'administrador'::app_role));