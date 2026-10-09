-- Restrictive fences preserve existing permissive policies.
CREATE POLICY technical_files_read_scope ON public.registros_consultor_arquivos AS RESTRICTIVE FOR SELECT TO authenticated
USING (public.technical_child_read_scope(registro_consultor_id));
CREATE POLICY technical_files_insert_scope ON public.registros_consultor_arquivos AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (
 public.can_manage_technical_visit(auth.uid(),registro_consultor_id)
 AND uploaded_by=auth.uid()
 AND EXISTS (SELECT 1 FROM public.registros_consultor r WHERE r.id=registro_consultor_id AND r.status::text IN ('rascunho','em_andamento'))
 AND split_part(arquivo_path,'/',2)=registro_consultor_id::text
 AND platform_private.storage1_consultor_core(arquivo_path,'insert'));
CREATE POLICY technical_files_update_scope ON public.registros_consultor_arquivos AS RESTRICTIVE FOR UPDATE TO authenticated
USING (public.can_manage_technical_visit(auth.uid(),registro_consultor_id)
 AND EXISTS (SELECT 1 FROM public.registros_consultor r WHERE r.id=registro_consultor_id AND r.status::text IN ('rascunho','em_andamento')))
WITH CHECK (public.can_manage_technical_visit(auth.uid(),registro_consultor_id)
 AND EXISTS (SELECT 1 FROM public.registros_consultor r WHERE r.id=registro_consultor_id AND r.status::text IN ('rascunho','em_andamento'))
 AND split_part(arquivo_path,'/',2)=registro_consultor_id::text
 AND platform_private.storage1_consultor_core(arquivo_path,'update'));
CREATE POLICY technical_files_delete_scope ON public.registros_consultor_arquivos AS RESTRICTIVE FOR DELETE TO authenticated
USING (public.can_manage_technical_visit(auth.uid(),registro_consultor_id)
 AND EXISTS (SELECT 1 FROM public.registros_consultor r WHERE r.id=registro_consultor_id AND r.status::text IN ('rascunho','em_andamento')));