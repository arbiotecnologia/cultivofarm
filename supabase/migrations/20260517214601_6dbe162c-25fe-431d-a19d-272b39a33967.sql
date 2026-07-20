-- Primeiro, garantir que o RLS está ativo
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;

-- Remover quaisquer políticas de SELECT existentes que possam ser muito permissivas
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'clientes' AND policyname = 'Enable read access for all users') THEN
        DROP POLICY "Enable read access for all users" ON public.clientes;
    END IF;
    
    IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'clientes' AND policyname = 'Authenticated users can view clients') THEN
        DROP POLICY "Authenticated users can view clients" ON public.clientes;
    END IF;
END $$;

-- Política para produtores verem apenas o próprio registro
DROP POLICY IF EXISTS "Clients can view their own record" ON public.clientes;
CREATE POLICY "Clients can view their own record"
ON public.clientes
FOR SELECT
TO authenticated
USING (
  id = get_cliente_id_for_user(auth.uid())
);

-- Política para papéis internos verem todos os clientes
-- Incluímos administrador, gestor e administrativo como papéis que precisam de acesso total
DROP POLICY IF EXISTS "Internal roles can view all clients" ON public.clientes;
CREATE POLICY "Internal roles can view all clients"
ON public.clientes
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'administrador'::app_role) OR
  has_role(auth.uid(), 'gestor'::app_role) OR
  has_role(auth.uid(), 'administrativo'::app_role) OR
  has_role(auth.uid(), 'consultor_tecnico'::app_role) OR
  has_role(auth.uid(), 'tecnico_agronomo'::app_role)
);

-- Garantir que INSERT/UPDATE/DELETE também estão protegidos (já parecem estar, mas reforçamos)
DROP POLICY IF EXISTS "Authorized roles can insert clients" ON public.clientes;
CREATE POLICY "Authorized roles can insert clients"
ON public.clientes
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'administrador'::app_role) OR
  has_role(auth.uid(), 'gestor'::app_role) OR
  has_role(auth.uid(), 'administrativo'::app_role)
);

DROP POLICY IF EXISTS "Authorized roles can update clients" ON public.clientes;
CREATE POLICY "Authorized roles can update clients"
ON public.clientes
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'administrador'::app_role) OR
  has_role(auth.uid(), 'gestor'::app_role) OR
  has_role(auth.uid(), 'administrativo'::app_role)
);

DROP POLICY IF EXISTS "Admins can delete clientes" ON public.clientes;
CREATE POLICY "Admins can delete clientes"
ON public.clientes
FOR DELETE
TO authenticated
USING (
  has_role(auth.uid(), 'administrador'::app_role)
);