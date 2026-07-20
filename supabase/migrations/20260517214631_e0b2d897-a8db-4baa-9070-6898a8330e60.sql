-- Habilitar RLS em todas as tabelas sensíveis
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cliente_contatos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cliente_documentos ENABLE ROW LEVEL SECURITY;

-- 1. TABELA: clientes (Já fizemos, mas garantindo consistência)
DROP POLICY IF EXISTS "Authenticated users can read clientes" ON public.clientes;
DROP POLICY IF EXISTS "Clients can view their own record" ON public.clientes;
DROP POLICY IF EXISTS "Internal roles can view all clients" ON public.clientes;

CREATE POLICY "Clients can view their own record"
ON public.clientes FOR SELECT TO authenticated
USING (id = get_cliente_id_for_user(auth.uid()));

CREATE POLICY "Internal roles can view all clients"
ON public.clientes FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'administrador'::app_role) OR
  has_role(auth.uid(), 'gestor'::app_role) OR
  has_role(auth.uid(), 'administrativo'::app_role) OR
  has_role(auth.uid(), 'consultor_tecnico'::app_role) OR
  has_role(auth.uid(), 'tecnico_agronomo'::app_role)
);

-- 2. TABELA: cliente_contatos
DROP POLICY IF EXISTS "Authenticated users can view client contacts" ON public.cliente_contatos;
DROP POLICY IF EXISTS "Users can only view their own client contacts" ON public.cliente_contatos;
DROP POLICY IF EXISTS "Staff can view all client contacts" ON public.cliente_contatos;

CREATE POLICY "Users can only view their own client contacts"
ON public.cliente_contatos FOR SELECT TO authenticated
USING (cliente_id = get_cliente_id_for_user(auth.uid()));

CREATE POLICY "Staff can view all client contacts"
ON public.cliente_contatos FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'administrador'::app_role) OR
  has_role(auth.uid(), 'gestor'::app_role) OR
  has_role(auth.uid(), 'administrativo'::app_role)
);

-- 3. TABELA: cliente_documentos
DROP POLICY IF EXISTS "Authenticated users can read cliente_documentos" ON public.cliente_documentos;
DROP POLICY IF EXISTS "Users can only view their own client documents" ON public.cliente_documentos;
DROP POLICY IF EXISTS "Staff can view all client documents" ON public.cliente_documentos;

CREATE POLICY "Users can only view their own client documents"
ON public.cliente_documentos FOR SELECT TO authenticated
USING (cliente_id = get_cliente_id_for_user(auth.uid()));

CREATE POLICY "Staff can view all client documents"
ON public.cliente_documentos FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'administrador'::app_role) OR
  has_role(auth.uid(), 'gestor'::app_role) OR
  has_role(auth.uid(), 'administrativo'::app_role)
);

-- Adicionar políticas de escrita para contatos e documentos (Staff apenas)
CREATE POLICY "Staff can manage client contacts"
ON public.cliente_contatos FOR ALL TO authenticated
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

CREATE POLICY "Staff can manage client documents"
ON public.cliente_documentos FOR ALL TO authenticated
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