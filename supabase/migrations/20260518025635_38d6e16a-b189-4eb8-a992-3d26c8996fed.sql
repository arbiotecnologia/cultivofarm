-- Garantir que o RLS está habilitado
ALTER TABLE public.cliente_contatos ENABLE ROW LEVEL SECURITY;

-- Remover qualquer política que possa estar aplicando ao papel 'public'
DO $$ 
DECLARE 
    pol RECORD;
BEGIN 
    FOR pol IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE tablename = 'cliente_contatos' 
        AND schemaname = 'public' 
        AND ('public' = ANY(roles) OR roles IS NULL)
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.cliente_contatos', pol.policyname);
    END LOOP;
END $$;

-- Recriar políticas seguras para usuários autenticados
DROP POLICY IF EXISTS "Staff can manage client contacts" ON public.cliente_contatos;
CREATE POLICY "Staff can manage client contacts" 
ON public.cliente_contatos 
FOR ALL 
TO authenticated 
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

DROP POLICY IF EXISTS "Users can only view their own client contacts" ON public.cliente_contatos;
CREATE POLICY "Users can only view their own client contacts" 
ON public.cliente_contatos 
FOR SELECT 
TO authenticated 
USING (cliente_id = get_cliente_id_for_user(auth.uid()));