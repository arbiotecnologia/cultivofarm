-- 1. Reforçar RLS
ALTER TABLE public.registros_consultor_pdf_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registros_consultor_pdf_versions FORCE ROW LEVEL SECURITY;

-- 2. Revogar acessos públicos e anônimos
REVOKE ALL ON TABLE public.registros_consultor_pdf_versions FROM public, anon;
GRANT ALL ON TABLE public.registros_consultor_pdf_versions TO authenticated, service_role;

-- 3. Limpar políticas existentes para garantir que não restem políticas legadas ou sem papel definido
DO $$ 
DECLARE 
    pol RECORD;
BEGIN 
    FOR pol IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE tablename = 'registros_consultor_pdf_versions' 
        AND schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.registros_consultor_pdf_versions', pol.policyname);
    END LOOP;
END $$;

-- 4. Recriar políticas com 'TO authenticated' explícito

-- Política de Leitura Restrita
CREATE POLICY "Users can view relevant PDF versions"
ON public.registros_consultor_pdf_versions
FOR SELECT
TO authenticated
USING (
  -- Staff e Admins
  has_role(auth.uid(), 'administrador'::app_role)
  OR has_role(auth.uid(), 'gestor'::app_role)
  OR has_role(auth.uid(), 'administrativo'::app_role)
  OR has_role(auth.uid(), 'consultor_tecnico'::app_role)
  OR has_role(auth.uid(), 'tecnico_agronomo'::app_role)
  -- Próprio criador
  OR created_by = auth.uid()
  -- Cliente dono do registro
  OR EXISTS (
    SELECT 1 FROM public.registros_consultor r
    WHERE r.id = registro_consultor_id
    AND r.cliente_id = get_cliente_id_for_user(auth.uid())
  )
);

-- Política de Inserção
CREATE POLICY "Consultores podem inserir novas versões"
ON public.registros_consultor_pdf_versions
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = created_by
);
