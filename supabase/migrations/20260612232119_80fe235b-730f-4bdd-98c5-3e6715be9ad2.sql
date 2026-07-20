
-- Fase 12.9.4: Ajuste final de SELECT em alertas_acoes para rastreabilidade completa

-- Remover políticas antigas de SELECT (nomes possíveis usados em fases anteriores)
DROP POLICY IF EXISTS alertas_acoes_select_admin ON public.alertas_acoes;
DROP POLICY IF EXISTS alertas_acoes_select_self ON public.alertas_acoes;
DROP POLICY IF EXISTS "Usuários visualizam suas próprias ações" ON public.alertas_acoes;
DROP POLICY IF EXISTS "Admin gestor visualizam todas as ações" ON public.alertas_acoes;
DROP POLICY IF EXISTS "Administradores visualizam todas as ações" ON public.alertas_acoes;
DROP POLICY IF EXISTS "alertas_acoes_select_admin" ON public.alertas_acoes;
DROP POLICY IF EXISTS "alertas_acoes_select_self" ON public.alertas_acoes;

-- Nova política: quem pode acessar o alerta pode ver o histórico de ações
CREATE POLICY alertas_acoes_select_acesso_alerta
ON public.alertas_acoes
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'administrador'::app_role)
  OR public.has_role(auth.uid(), 'gestor'::app_role)
  OR public.has_role(auth.uid(), 'administrativo'::app_role)
  OR public.can_user_access_alerta(alerta_id)
);
