
CREATE TABLE public.cq_parametros_referencia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  microrganismo_id uuid NOT NULL REFERENCES public.microrganismos(id) ON DELETE CASCADE,
  produto_id uuid REFERENCES public.produtos(id) ON DELETE CASCADE,
  ph_min numeric,
  ph_max numeric,
  concentracao_min_ufc_ml numeric,
  aparencia_esperada text,
  odor_esperado text,
  contaminacao_esperada text,
  observacoes text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

CREATE UNIQUE INDEX cq_param_ref_micro_prod_uidx
  ON public.cq_parametros_referencia (microrganismo_id, COALESCE(produto_id, '00000000-0000-0000-0000-000000000000'::uuid));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cq_parametros_referencia TO authenticated;
GRANT ALL ON public.cq_parametros_referencia TO service_role;

ALTER TABLE public.cq_parametros_referencia ENABLE ROW LEVEL SECURITY;

CREATE POLICY "CQ ref: leitura autenticada"
  ON public.cq_parametros_referencia FOR SELECT TO authenticated USING (true);

CREATE POLICY "CQ ref: escrita admin/gestor/producao"
  ON public.cq_parametros_referencia FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'administrador'::app_role)
    OR public.has_role(auth.uid(), 'gestor'::app_role)
    OR public.has_role(auth.uid(), 'producao'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'administrador'::app_role)
    OR public.has_role(auth.uid(), 'gestor'::app_role)
    OR public.has_role(auth.uid(), 'producao'::app_role)
  );

CREATE TRIGGER trg_cq_param_ref_updated_at
  BEFORE UPDATE ON public.cq_parametros_referencia
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
