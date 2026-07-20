-- Drop existing permissive public policies
DROP POLICY IF EXISTS "Users view own contacts" ON public.cliente_contatos;
DROP POLICY IF EXISTS "Users insert own contacts" ON public.cliente_contatos;
DROP POLICY IF EXISTS "Users update own contacts" ON public.cliente_contatos;
DROP POLICY IF EXISTS "Users delete own contacts" ON public.cliente_contatos;

-- Recreate policies scoped TO authenticated
CREATE POLICY "Users view own contacts"
  ON public.cliente_contatos
  FOR SELECT
  TO authenticated
  USING (cliente_id = ANY(get_cliente_ids_for_user(auth.uid())));

CREATE POLICY "Users insert own contacts"
  ON public.cliente_contatos
  FOR INSERT
  TO authenticated
  WITH CHECK (cliente_id = ANY(get_cliente_ids_for_user(auth.uid())));

CREATE POLICY "Users update own contacts"
  ON public.cliente_contatos
  FOR UPDATE
  TO authenticated
  USING (cliente_id = ANY(get_cliente_ids_for_user(auth.uid())))
  WITH CHECK (cliente_id = ANY(get_cliente_ids_for_user(auth.uid())));

CREATE POLICY "Users delete own contacts"
  ON public.cliente_contatos
  FOR DELETE
  TO authenticated
  USING (cliente_id = ANY(get_cliente_ids_for_user(auth.uid())));