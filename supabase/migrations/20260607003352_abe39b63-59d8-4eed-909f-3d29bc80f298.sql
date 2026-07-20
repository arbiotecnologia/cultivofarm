
CREATE TABLE public.objetivos_visita_sugestoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cultura_id uuid NULL REFERENCES public.culturas(id) ON DELETE CASCADE,
  texto text NOT NULL,
  ordem int NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.objetivos_visita_sugestoes TO authenticated;
GRANT ALL ON public.objetivos_visita_sugestoes TO service_role;

ALTER TABLE public.objetivos_visita_sugestoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read objetivos sugestoes"
  ON public.objetivos_visita_sugestoes
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admin/gestor can insert objetivos sugestoes"
  ON public.objetivos_visita_sugestoes
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'administrador'::app_role)
    OR public.has_role(auth.uid(), 'gestor'::app_role)
  );

CREATE POLICY "Admin/gestor can update objetivos sugestoes"
  ON public.objetivos_visita_sugestoes
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'administrador'::app_role)
    OR public.has_role(auth.uid(), 'gestor'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'administrador'::app_role)
    OR public.has_role(auth.uid(), 'gestor'::app_role)
  );

CREATE POLICY "Admin/gestor can delete objetivos sugestoes"
  ON public.objetivos_visita_sugestoes
  FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'administrador'::app_role)
    OR public.has_role(auth.uid(), 'gestor'::app_role)
  );

CREATE TRIGGER update_objetivos_visita_sugestoes_updated_at
  BEFORE UPDATE ON public.objetivos_visita_sugestoes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_objetivos_visita_sugestoes_cultura ON public.objetivos_visita_sugestoes(cultura_id) WHERE ativo = true;
