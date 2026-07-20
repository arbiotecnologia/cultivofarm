
-- Fase 12.9.3: Endurecimento de RLS residual em alertas_regras, alertas_acoes e alertas_sla_eventos

-- 1) alertas_regras: restringir leitura a perfis internos autorizados
DROP POLICY IF EXISTS alertas_regras_select_auth ON public.alertas_regras;
CREATE POLICY alertas_regras_select_internos
ON public.alertas_regras
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'administrador'::app_role)
  OR has_role(auth.uid(), 'gestor'::app_role)
  OR has_role(auth.uid(), 'administrativo'::app_role)
  OR has_role(auth.uid(), 'consultor_tecnico'::app_role)
  OR has_role(auth.uid(), 'tecnico_agronomo'::app_role)
  OR has_role(auth.uid(), 'producao'::app_role)
  OR has_role(auth.uid(), 'operador_onfarm'::app_role)
);

-- 2) alertas_acoes: INSERT precisa validar acesso ao alerta (não apenas existência)
DROP POLICY IF EXISTS alertas_acoes_insert_self ON public.alertas_acoes;
CREATE POLICY alertas_acoes_insert_self
ON public.alertas_acoes
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND public.can_user_access_alerta(alerta_id)
);

-- 3) alertas_sla_eventos: SELECT amplo para quem pode ver o alerta
DROP POLICY IF EXISTS "Admin gestor administrativo visualizam eventos SLA" ON public.alertas_sla_eventos;
CREATE POLICY alertas_sla_eventos_select_acesso
ON public.alertas_sla_eventos
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'administrador'::app_role)
  OR has_role(auth.uid(), 'gestor'::app_role)
  OR has_role(auth.uid(), 'administrativo'::app_role)
  OR public.can_user_access_alerta(alerta_id)
);
