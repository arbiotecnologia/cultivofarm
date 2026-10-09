CREATE POLICY technical_parent_direct_update_draft
ON public.registros_consultor AS RESTRICTIVE FOR UPDATE TO authenticated
USING (status::text IN ('rascunho','em_andamento'))
WITH CHECK (status::text IN ('rascunho','em_andamento'));
CREATE POLICY technical_parent_direct_insert_draft
ON public.registros_consultor AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (status::text IN ('rascunho','em_andamento'));
CREATE POLICY technical_parent_direct_delete_draft
ON public.registros_consultor AS RESTRICTIVE FOR DELETE TO authenticated
USING (status::text IN ('rascunho','em_andamento'));