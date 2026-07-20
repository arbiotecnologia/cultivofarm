CREATE POLICY "Produtor cria OS OnFarm do proprio cliente"
ON public.ordens_servico_onfarm
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'cliente_produtor'::app_role)
  AND can_user_access_cliente(cliente_id)
);