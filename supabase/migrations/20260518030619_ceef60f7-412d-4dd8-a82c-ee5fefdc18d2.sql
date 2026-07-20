-- Habilitar RLS e forçar aplicação
ALTER TABLE public.cliente_contatos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cliente_contatos FORCE ROW LEVEL SECURITY;

-- Remover TODAS as políticas existentes para começar do zero
DO $$ 
DECLARE 
    pol RECORD;
BEGIN 
    FOR pol IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE tablename = 'cliente_contatos' 
        AND schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.cliente_contatos', pol.policyname);
    END LOOP;
END $$;

-- 1. Política para equipe interna (leitura e escrita total)
CREATE POLICY "Staff manage all contacts" 
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

-- 2. Política para produtores (leitura apenas dos próprios contatos)
CREATE POLICY "Users view own contacts" 
ON public.cliente_contatos 
FOR SELECT 
TO authenticated 
USING (
  cliente_id = get_cliente_id_for_user(auth.uid())
);

-- 3. Política para produtores (inserção restrita ao próprio cliente_id)
CREATE POLICY "Users insert own contacts" 
ON public.cliente_contatos 
FOR INSERT 
TO authenticated 
WITH CHECK (
  cliente_id = get_cliente_id_for_user(auth.uid())
);

-- 4. Política para produtores (update restrito ao próprio cliente_id)
CREATE POLICY "Users update own contacts" 
ON public.cliente_contatos 
FOR UPDATE 
TO authenticated 
USING (
  cliente_id = get_cliente_id_for_user(auth.uid())
)
WITH CHECK (
  cliente_id = get_cliente_id_for_user(auth.uid())
);

-- 5. Política para produtores (delete restrito ao próprio cliente_id)
CREATE POLICY "Users delete own contacts" 
ON public.cliente_contatos 
FOR DELETE 
TO authenticated 
USING (
  cliente_id = get_cliente_id_for_user(auth.uid())
);