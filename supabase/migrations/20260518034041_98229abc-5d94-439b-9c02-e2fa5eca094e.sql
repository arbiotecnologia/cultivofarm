-- 1. Reforçar RLS
ALTER TABLE public.cliente_contatos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cliente_contatos FORCE ROW LEVEL SECURITY;

-- 2. Revogar acessos públicos e anônimos (Garante que nem o Grant permita)
REVOKE ALL ON TABLE public.cliente_contatos FROM public, anon;
GRANT ALL ON TABLE public.cliente_contatos TO authenticated, service_role;

-- 3. Limpar políticas existentes para evitar conflitos ou políticas sem papel definido
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

-- 4. Recriar políticas com 'TO authenticated' explícito

-- Política para Staff (Administradores, Gestores e Administrativo)
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

-- Políticas para Produtores (Isolamento por cliente_id)
CREATE POLICY "Users view own contacts"
ON public.cliente_contatos
FOR SELECT
TO authenticated
USING (
  cliente_id = get_cliente_id_for_user(auth.uid())
);

CREATE POLICY "Users insert own contacts"
ON public.cliente_contatos
FOR INSERT
TO authenticated
WITH CHECK (
  cliente_id = get_cliente_id_for_user(auth.uid())
);

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

CREATE POLICY "Users delete own contacts"
ON public.cliente_contatos
FOR DELETE
TO authenticated
USING (
  cliente_id = get_cliente_id_for_user(auth.uid())
);
