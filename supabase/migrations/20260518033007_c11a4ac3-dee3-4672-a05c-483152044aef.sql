-- Remover a política excessivamente permissiva
DROP POLICY IF EXISTS "Staff can view all profiles" ON public.profiles;

-- Criar política para equipe interna (acesso total) - sem o papel 'aplicador'
CREATE POLICY "Internal staff can view all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'administrador'::app_role)
  OR has_role(auth.uid(), 'gestor'::app_role)
  OR has_role(auth.uid(), 'administrativo'::app_role)
  OR has_role(auth.uid(), 'consultor_tecnico'::app_role)
  OR has_role(auth.uid(), 'tecnico_agronomo'::app_role)
);

-- Criar política para membros da organização (ver apenas colegas)
-- Isso cobre 'aplicador', 'cliente_produtor', 'operador_onfarm' e 'producao'
CREATE POLICY "Organization members can view colleagues"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  cliente_id IS NOT NULL 
  AND cliente_id = get_cliente_id_for_user(auth.uid())
);
