-- Enable Row Level Security
ALTER TABLE public.cliente_contatos ENABLE ROW LEVEL SECURITY;

-- Drop existing problematic policies
DROP POLICY IF EXISTS "Acesso total contatos para autenticados" ON public.cliente_contatos;
DROP POLICY IF EXISTS "Users can delete their own client contacts" ON public.cliente_contatos;
DROP POLICY IF EXISTS "Users can insert their own client contacts" ON public.cliente_contatos;
DROP POLICY IF EXISTS "Users can update their own client contacts" ON public.cliente_contatos;
DROP POLICY IF EXISTS "Users can view their own client contacts" ON public.cliente_contatos;

-- Create new secure policies
-- Allow admins and gestors full access
CREATE POLICY "Admins and gestors can manage client contacts" 
ON public.cliente_contatos 
FOR ALL 
TO authenticated 
USING (
  has_role(auth.uid(), 'administrador'::app_role) OR 
  has_role(auth.uid(), 'gestor'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'administrador'::app_role) OR 
  has_role(auth.uid(), 'gestor'::app_role)
);

-- Allow other authenticated users to view contacts
CREATE POLICY "Authenticated users can view client contacts" 
ON public.cliente_contatos 
FOR SELECT 
TO authenticated 
USING (true);
