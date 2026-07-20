-- Drop the overly permissive SELECT policy
DROP POLICY IF EXISTS "Authenticated users can read clientes" ON public.clientes;
DROP POLICY IF EXISTS "Authenticated users can insert clientes" ON public.clientes;
DROP POLICY IF EXISTS "Authenticated users can update clientes" ON public.clientes;

-- Policy for internal roles to view all clients (admin, gestor, technicians, etc.)
CREATE POLICY "Internal roles can view all clients" 
ON public.clientes 
FOR SELECT 
TO authenticated 
USING (
  has_role(auth.uid(), 'administrador'::app_role) OR 
  has_role(auth.uid(), 'gestor'::app_role) OR
  has_role(auth.uid(), 'consultor_tecnico'::app_role) OR
  has_role(auth.uid(), 'tecnico_agronomo'::app_role) OR
  has_role(auth.uid(), 'administrativo'::app_role)
);

-- Policy for producers/clients to view only their own record
CREATE POLICY "Clients can view their own record" 
ON public.clientes 
FOR SELECT 
TO authenticated 
USING (
  id = get_cliente_id_for_user(auth.uid())
);

-- Restrict INSERT to authorized roles
CREATE POLICY "Authorized roles can insert clients"
ON public.clientes
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'administrador'::app_role) OR 
  has_role(auth.uid(), 'gestor'::app_role) OR
  has_role(auth.uid(), 'administrativo'::app_role)
);

-- Restrict UPDATE to authorized roles
CREATE POLICY "Authorized roles can update clients"
ON public.clientes
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'administrador'::app_role) OR 
  has_role(auth.uid(), 'gestor'::app_role) OR
  has_role(auth.uid(), 'administrativo'::app_role)
);
