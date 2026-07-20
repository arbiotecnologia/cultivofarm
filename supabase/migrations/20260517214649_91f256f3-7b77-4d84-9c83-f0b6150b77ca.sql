-- Reforçar segurança na tabela de fazendas
ALTER TABLE public.fazendas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read fazendas" ON public.fazendas;
DROP POLICY IF EXISTS "Users can only view their own farms" ON public.fazendas;
DROP POLICY IF EXISTS "Staff can view all farms" ON public.fazendas;

CREATE POLICY "Users can only view their own farms"
ON public.fazendas FOR SELECT TO authenticated
USING (cliente_id = get_cliente_id_for_user(auth.uid()));

CREATE POLICY "Staff can view all farms"
ON public.fazendas FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'administrador'::app_role) OR
  has_role(auth.uid(), 'gestor'::app_role) OR
  has_role(auth.uid(), 'administrativo'::app_role) OR
  has_role(auth.uid(), 'consultor_tecnico'::app_role) OR
  has_role(auth.uid(), 'tecnico_agronomo'::app_role)
);

-- Políticas de escrita para fazendas (Staff apenas)
CREATE POLICY "Staff can manage farms"
ON public.fazendas FOR ALL TO authenticated
USING (
  has_role(auth.uid(), 'administrador'::app_role) OR
  has_role(auth.uid(), 'gestor'::app_role) OR
  has_role(auth.uid(), 'administrativo'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'administrador'::app_role) OR
  has_role(auth.uid(), 'gestor'::app_role) OR
  has_role(auth.uid(), 'administrativo'::app_role)
);