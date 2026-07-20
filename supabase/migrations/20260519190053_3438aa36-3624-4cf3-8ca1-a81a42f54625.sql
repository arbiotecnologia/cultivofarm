-- Ensure helper functions are robust and secure
CREATE OR REPLACE FUNCTION public.can_user_access_cliente(_cliente_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    has_role(auth.uid(), 'administrador'::app_role)
    OR has_role(auth.uid(), 'gestor'::app_role)
    OR has_role(auth.uid(), 'administrativo'::app_role)
    OR has_role(auth.uid(), 'consultor_tecnico'::app_role)
    OR has_role(auth.uid(), 'tecnico_agronomo'::app_role)
    OR _cliente_id = ANY(get_cliente_ids_for_user(auth.uid()))
  )
$$;

CREATE OR REPLACE FUNCTION public.can_user_access_fazenda(_fazenda_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.fazendas f
    WHERE f.id = _fazenda_id
    AND can_user_access_cliente(f.cliente_id)
  )
$$;

-- Clientes: Cleanup and Hardening
DROP POLICY IF EXISTS "Admins can delete clientes" ON public.clientes;
DROP POLICY IF EXISTS "Authorized roles can insert clients" ON public.clientes;
DROP POLICY IF EXISTS "Authorized roles can update clients" ON public.clientes;
DROP POLICY IF EXISTS "Clients can view their own record" ON public.clientes;
DROP POLICY IF EXISTS "Internal roles can view all clients" ON public.clientes;
DROP POLICY IF EXISTS "Staff can manage clients" ON public.clientes;
DROP POLICY IF EXISTS "Clients read access" ON public.clientes;
DROP POLICY IF EXISTS "Staff manage clients" ON public.clientes;

CREATE POLICY "Clients read access"
  ON public.clientes FOR SELECT TO authenticated
  USING (can_user_access_cliente(id));

CREATE POLICY "Staff manage clients"
  ON public.clientes FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'administrador'::app_role) OR has_role(auth.uid(), 'gestor'::app_role) OR has_role(auth.uid(), 'administrativo'::app_role))
  WITH CHECK (has_role(auth.uid(), 'administrador'::app_role) OR has_role(auth.uid(), 'gestor'::app_role) OR has_role(auth.uid(), 'administrativo'::app_role));

-- Fazendas: Cleanup and Hardening
DROP POLICY IF EXISTS "Admins can delete fazendas" ON public.fazendas;
DROP POLICY IF EXISTS "Authenticated users can insert fazendas" ON public.fazendas;
DROP POLICY IF EXISTS "Authenticated users can update fazendas" ON public.fazendas;
DROP POLICY IF EXISTS "Staff can manage farms" ON public.fazendas;
DROP POLICY IF EXISTS "Users can only view their own farms" ON public.fazendas;
DROP POLICY IF EXISTS "Staff can view all farms" ON public.fazendas;
DROP POLICY IF EXISTS "Fazendas read access" ON public.fazendas;
DROP POLICY IF EXISTS "Staff manage farms" ON public.fazendas;

CREATE POLICY "Fazendas read access"
  ON public.fazendas FOR SELECT TO authenticated
  USING (can_user_access_cliente(cliente_id));

CREATE POLICY "Staff manage farms"
  ON public.fazendas FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'administrador'::app_role) OR has_role(auth.uid(), 'gestor'::app_role) OR has_role(auth.uid(), 'administrativo'::app_role))
  WITH CHECK (has_role(auth.uid(), 'administrador'::app_role) OR has_role(auth.uid(), 'gestor'::app_role) OR has_role(auth.uid(), 'administrativo'::app_role));

-- Talhoes: Cleanup and Hardening
DROP POLICY IF EXISTS "Admins can delete talhoes" ON public.talhoes;
DROP POLICY IF EXISTS "Authenticated users can insert talhoes" ON public.talhoes;
DROP POLICY IF EXISTS "Authenticated users can read talhoes" ON public.talhoes;
DROP POLICY IF EXISTS "Authenticated users can update talhoes" ON public.talhoes;
DROP POLICY IF EXISTS "Staff can manage plots" ON public.talhoes;
DROP POLICY IF EXISTS "Talhoes read access" ON public.talhoes;
DROP POLICY IF EXISTS "Staff manage plots" ON public.talhoes;

CREATE POLICY "Talhoes read access"
  ON public.talhoes FOR SELECT TO authenticated
  USING (can_user_access_fazenda(fazenda_id));

CREATE POLICY "Staff manage plots"
  ON public.talhoes FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'administrador'::app_role) OR has_role(auth.uid(), 'gestor'::app_role) OR has_role(auth.uid(), 'administrativo'::app_role))
  WITH CHECK (has_role(auth.uid(), 'administrador'::app_role) OR has_role(auth.uid(), 'gestor'::app_role) OR has_role(auth.uid(), 'administrativo'::app_role));

-- Ordens de Servico: Cleanup and Hardening
DROP POLICY IF EXISTS "Authenticated users can insert os" ON public.ordens_servico;
DROP POLICY IF EXISTS "Authenticated users can read os" ON public.ordens_servico;
DROP POLICY IF EXISTS "Authenticated users can update os" ON public.ordens_servico;
DROP POLICY IF EXISTS "Staff can manage OS" ON public.ordens_servico;
DROP POLICY IF EXISTS "Ordens servico read access" ON public.ordens_servico;

CREATE POLICY "Ordens servico read access"
  ON public.ordens_servico FOR SELECT TO authenticated
  USING (can_user_access_cliente(cliente_id));

CREATE POLICY "Staff manage OS"
  ON public.ordens_servico FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'administrador'::app_role) OR has_role(auth.uid(), 'gestor'::app_role) OR has_role(auth.uid(), 'consultor_tecnico'::app_role) OR has_role(auth.uid(), 'tecnico_agronomo'::app_role))
  WITH CHECK (has_role(auth.uid(), 'administrador'::app_role) OR has_role(auth.uid(), 'gestor'::app_role) OR has_role(auth.uid(), 'consultor_tecnico'::app_role) OR has_role(auth.uid(), 'tecnico_agronomo'::app_role));

-- Registros Consultor: Cleanup and Hardening
DROP POLICY IF EXISTS "auth_insert_registros" ON public.registros_consultor;
DROP POLICY IF EXISTS "auth_select_registros" ON public.registros_consultor;
DROP POLICY IF EXISTS "auth_update_registros" ON public.registros_consultor;
DROP POLICY IF EXISTS "Consultants can manage their own records" ON public.registros_consultor;
DROP POLICY IF EXISTS "Registros consultor read access" ON public.registros_consultor;
DROP POLICY IF EXISTS "Consultants manage records" ON public.registros_consultor;

CREATE POLICY "Registros consultor read access"
  ON public.registros_consultor FOR SELECT TO authenticated
  USING (can_user_access_cliente(cliente_id));

CREATE POLICY "Consultants manage records"
  ON public.registros_consultor FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'administrador'::app_role) OR has_role(auth.uid(), 'gestor'::app_role) OR consultor_responsavel = auth.uid())
  WITH CHECK (has_role(auth.uid(), 'administrador'::app_role) OR has_role(auth.uid(), 'gestor'::app_role) OR consultor_responsavel = auth.uid());

-- Fix missing search_path on other functions
ALTER FUNCTION public.get_cliente_ids_for_user(uuid) SET search_path = public;
ALTER FUNCTION public.get_cliente_id_for_user(uuid) SET search_path = public;
ALTER FUNCTION public.sync_user_cliente_principal() SET search_path = public;
ALTER FUNCTION public.enforce_cliente_id_for_produtor() SET search_path = public;
