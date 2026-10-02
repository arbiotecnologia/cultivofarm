-- D51.2 / incidente P0: manter RLS explícita no contador interno sem acesso cliente.
DROP POLICY IF EXISTS "Client roles cannot access code sequences" ON public.codigo_sequencias;
CREATE POLICY "Client roles cannot access code sequences"
ON public.codigo_sequencias
AS RESTRICTIVE
FOR ALL TO authenticated
USING (false)
WITH CHECK (false);