-- Secondary Tables Hardening

-- Alertas Agronomicos
DROP POLICY IF EXISTS "Authenticated can insert alertas" ON public.alertas_agronomicos;
DROP POLICY IF EXISTS "Authenticated can update alertas" ON public.alertas_agronomicos;
CREATE POLICY "Staff manage alerts"
  ON public.alertas_agronomicos FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'administrador'::app_role) OR has_role(auth.uid(), 'gestor'::app_role) OR has_role(auth.uid(), 'consultor_tecnico'::app_role))
  WITH CHECK (has_role(auth.uid(), 'administrador'::app_role) OR has_role(auth.uid(), 'gestor'::app_role) OR has_role(auth.uid(), 'consultor_tecnico'::app_role));

-- Clima Dados
DROP POLICY IF EXISTS "Authenticated can insert clima_dados" ON public.clima_dados;
DROP POLICY IF EXISTS "Authenticated can update clima_dados" ON public.clima_dados;
CREATE POLICY "Staff manage climate data"
  ON public.clima_dados FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'administrador'::app_role) OR has_role(auth.uid(), 'gestor'::app_role))
  WITH CHECK (has_role(auth.uid(), 'administrador'::app_role) OR has_role(auth.uid(), 'gestor'::app_role));

-- Talhao Safras
DROP POLICY IF EXISTS "Authenticated can insert talhao_safras" ON public.talhao_safras;
DROP POLICY IF EXISTS "Authenticated can update talhao_safras" ON public.talhao_safras;
CREATE POLICY "Staff manage talhao safras"
  ON public.talhao_safras FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'administrador'::app_role) OR has_role(auth.uid(), 'gestor'::app_role))
  WITH CHECK (has_role(auth.uid(), 'administrador'::app_role) OR has_role(auth.uid(), 'gestor'::app_role));

-- Aplicacoes
DROP POLICY IF EXISTS "Authenticated users can insert aplicacoes" ON public.aplicacoes;
DROP POLICY IF EXISTS "Authenticated users can update aplicacoes" ON public.aplicacoes;
CREATE POLICY "Authorized manage applications"
  ON public.aplicacoes FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'administrador'::app_role) OR has_role(auth.uid(), 'gestor'::app_role) OR has_role(auth.uid(), 'aplicador'::app_role))
  WITH CHECK (has_role(auth.uid(), 'administrador'::app_role) OR has_role(auth.uid(), 'gestor'::app_role) OR has_role(auth.uid(), 'aplicador'::app_role));

-- Aprovacoes Tecnicas
DROP POLICY IF EXISTS "auth_insert_aprovacoes" ON public.aprovacoes_tecnicas;
DROP POLICY IF EXISTS "auth_update_aprovacoes" ON public.aprovacoes_tecnicas;
CREATE POLICY "Staff manage technical approvals"
  ON public.aprovacoes_tecnicas FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'administrador'::app_role) OR has_role(auth.uid(), 'gestor'::app_role))
  WITH CHECK (has_role(auth.uid(), 'administrador'::app_role) OR has_role(auth.uid(), 'gestor'::app_role));

-- Entregas
DROP POLICY IF EXISTS "Authenticated users can insert entregas" ON public.entregas;
DROP POLICY IF EXISTS "Authenticated users can update entregas" ON public.entregas;
CREATE POLICY "Staff manage deliveries"
  ON public.entregas FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'administrador'::app_role) OR has_role(auth.uid(), 'gestor'::app_role) OR has_role(auth.uid(), 'administrativo'::app_role))
  WITH CHECK (has_role(auth.uid(), 'administrador'::app_role) OR has_role(auth.uid(), 'gestor'::app_role) OR has_role(auth.uid(), 'administrativo'::app_role));

-- Ordens de Servico OnFarm
DROP POLICY IF EXISTS "auth_insert_os_onfarm" ON public.ordens_servico_onfarm;
DROP POLICY IF EXISTS "auth_update_os_onfarm" ON public.ordens_servico_onfarm;
CREATE POLICY "Staff manage OS OnFarm"
  ON public.ordens_servico_onfarm FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'administrador'::app_role) OR has_role(auth.uid(), 'gestor'::app_role) OR has_role(auth.uid(), 'consultor_tecnico'::app_role))
  WITH CHECK (has_role(auth.uid(), 'administrador'::app_role) OR has_role(auth.uid(), 'gestor'::app_role) OR has_role(auth.uid(), 'consultor_tecnico'::app_role));

-- Visitas Checkin
DROP POLICY IF EXISTS "auth_insert_checkin" ON public.visitas_checkin;
DROP POLICY IF EXISTS "auth_update_checkin" ON public.visitas_checkin;
CREATE POLICY "Consultants manage checkins"
  ON public.visitas_checkin FOR ALL TO authenticated
  USING (consultor_id = auth.uid() OR has_role(auth.uid(), 'administrador'::app_role))
  WITH CHECK (consultor_id = auth.uid() OR has_role(auth.uid(), 'administrador'::app_role));

-- Global Catalog Hardening
DROP POLICY IF EXISTS "Authenticated users can insert culturas" ON public.culturas;
DROP POLICY IF EXISTS "Authenticated users can update culturas" ON public.culturas;
DROP POLICY IF EXISTS "Authenticated users can insert produtos" ON public.produtos;
DROP POLICY IF EXISTS "Authenticated users can update produtos" ON public.produtos;
DROP POLICY IF EXISTS "Authenticated users can insert problemas" ON public.problemas_fitossanitarios;
DROP POLICY IF EXISTS "Authenticated users can update problemas" ON public.problemas_fitossanitarios;

CREATE POLICY "ReadOnly global catalog"
  ON public.culturas FOR SELECT TO authenticated USING (true);
CREATE POLICY "ReadOnly global products"
  ON public.produtos FOR SELECT TO authenticated USING (true);
CREATE POLICY "ReadOnly global problems"
  ON public.problemas_fitossanitarios FOR SELECT TO authenticated USING (true);

CREATE POLICY "Staff manage global catalog"
  ON public.culturas FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'administrador'::app_role) OR has_role(auth.uid(), 'gestor'::app_role))
  WITH CHECK (has_role(auth.uid(), 'administrador'::app_role) OR has_role(auth.uid(), 'gestor'::app_role));

CREATE POLICY "Staff manage global products"
  ON public.produtos FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'administrador'::app_role) OR has_role(auth.uid(), 'gestor'::app_role))
  WITH CHECK (has_role(auth.uid(), 'administrador'::app_role) OR has_role(auth.uid(), 'gestor'::app_role));

CREATE POLICY "Staff manage global problems"
  ON public.problemas_fitossanitarios FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'administrador'::app_role) OR has_role(auth.uid(), 'gestor'::app_role))
  WITH CHECK (has_role(auth.uid(), 'administrador'::app_role) OR has_role(auth.uid(), 'gestor'::app_role));

-- Fix search_path for all remaining functions
DO $$ 
DECLARE 
  r RECORD;
BEGIN
  FOR r IN (SELECT routine_name FROM information_schema.routines WHERE routine_schema = 'public' AND routine_type = 'FUNCTION') LOOP
    EXECUTE 'ALTER FUNCTION public.' || quote_ident(r.routine_name) || ' SET search_path = public';
  END LOOP;
END $$;
