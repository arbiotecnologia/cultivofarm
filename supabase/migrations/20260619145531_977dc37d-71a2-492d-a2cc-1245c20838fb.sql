
CREATE TABLE public.catalogo_volumes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_tipo text NOT NULL CHECK (item_tipo IN ('produto','microrganismo')),
  produto_id uuid REFERENCES public.produtos(id) ON DELETE CASCADE,
  microrganismo_id uuid REFERENCES public.microrganismos(id) ON DELETE CASCADE,
  volume_ml numeric NOT NULL CHECK (volume_ml > 0),
  rotulo text,
  preco_brl numeric NOT NULL DEFAULT 0 CHECK (preco_brl >= 0),
  moeda text NOT NULL DEFAULT 'BRL',
  ativo boolean NOT NULL DEFAULT true,
  ordem integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT catalogo_volumes_item_ref CHECK (
    (item_tipo = 'produto' AND produto_id IS NOT NULL AND microrganismo_id IS NULL)
    OR (item_tipo = 'microrganismo' AND microrganismo_id IS NOT NULL AND produto_id IS NULL)
  )
);

CREATE INDEX idx_catalogo_volumes_produto ON public.catalogo_volumes(produto_id) WHERE produto_id IS NOT NULL;
CREATE INDEX idx_catalogo_volumes_micro ON public.catalogo_volumes(microrganismo_id) WHERE microrganismo_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalogo_volumes TO authenticated;
GRANT ALL ON public.catalogo_volumes TO service_role;

ALTER TABLE public.catalogo_volumes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read catalogo_volumes"
  ON public.catalogo_volumes FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Staff manage catalogo_volumes"
  ON public.catalogo_volumes FOR ALL
  TO authenticated
  USING (has_role(auth.uid(),'administrador'::app_role) OR has_role(auth.uid(),'gestor'::app_role))
  WITH CHECK (has_role(auth.uid(),'administrador'::app_role) OR has_role(auth.uid(),'gestor'::app_role));

CREATE TRIGGER trg_catalogo_volumes_updated_at
  BEFORE UPDATE ON public.catalogo_volumes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
