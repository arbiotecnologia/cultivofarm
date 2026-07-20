-- Remover as políticas antigas que usam o papel 'public'
DROP POLICY IF EXISTS "Consultores podem ver versões de seus registros" ON public.registros_consultor_pdf_versions;
DROP POLICY IF EXISTS "Consultores podem inserir novas versões" ON public.registros_consultor_pdf_versions;

-- Criar novas políticas restritas a usuários autenticados
CREATE POLICY "Consultores podem ver versões de seus registros" 
ON public.registros_consultor_pdf_versions 
FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Consultores podem inserir novas versões" 
ON public.registros_consultor_pdf_versions 
FOR INSERT 
TO authenticated 
WITH CHECK (auth.uid() = created_by);