CREATE POLICY "Partner B2B tecnico read catalogo_volumes" ON public.catalogo_volumes FOR SELECT TO authenticated USING (
  has_role(auth.uid(), 'parceiro_b2b_tecnico'::app_role) AND ativo = true AND (
    (produto_id IS NOT NULL AND EXISTS (SELECT 1 FROM produtos p WHERE p.id = catalogo_volumes.produto_id AND p.ativo = true AND COALESCE(p.b2b_enabled, true) = true))
    OR
    (microrganismo_id IS NOT NULL AND EXISTS (SELECT 1 FROM microrganismos m WHERE m.id = catalogo_volumes.microrganismo_id AND m.ativo = true AND COALESCE(m.b2b_enabled, false) = true))
  )
);