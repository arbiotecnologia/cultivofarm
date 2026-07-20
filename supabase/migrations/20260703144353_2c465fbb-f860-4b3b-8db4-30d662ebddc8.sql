
-- =========================================================
-- Phase 4: RLS auth.uid() caching + covering indexes
-- Wrap auth.uid() in (SELECT auth.uid()) so Postgres treats
-- it as an InitPlan and evaluates once per query, not per row.
-- Applied to the 7 hottest tables from pg_stat_statements.
-- =========================================================

-- ---------- ENTREGAS ----------
DROP POLICY IF EXISTS "Admin/Gestor/Adm total access on entregas" ON public.entregas;
CREATE POLICY "Admin/Gestor/Adm total access on entregas" ON public.entregas
  FOR ALL
  USING (has_role((SELECT auth.uid()), 'administrador'::app_role) OR has_role((SELECT auth.uid()), 'gestor'::app_role) OR has_role((SELECT auth.uid()), 'administrativo'::app_role))
  WITH CHECK (has_role((SELECT auth.uid()), 'administrador'::app_role) OR has_role((SELECT auth.uid()), 'gestor'::app_role) OR has_role((SELECT auth.uid()), 'administrativo'::app_role));

DROP POLICY IF EXISTS "Cliente read own entregas" ON public.entregas;
CREATE POLICY "Cliente read own entregas" ON public.entregas
  FOR SELECT USING (cliente_id = ANY (get_cliente_ids_for_user((SELECT auth.uid()))));

DROP POLICY IF EXISTS "Financeiro read entregas" ON public.entregas;
CREATE POLICY "Financeiro read entregas" ON public.entregas
  FOR SELECT USING (has_role((SELECT auth.uid()), 'financeiro'::app_role));

DROP POLICY IF EXISTS "Producao/Aplicador read entregas" ON public.entregas;
CREATE POLICY "Producao/Aplicador read entregas" ON public.entregas
  FOR SELECT USING (has_role((SELECT auth.uid()), 'producao'::app_role) OR has_role((SELECT auth.uid()), 'aplicador'::app_role));

-- ---------- NOTIFICACOES_OPERACIONAIS ----------
DROP POLICY IF EXISTS "admin_delete_notif_op" ON public.notificacoes_operacionais;
CREATE POLICY "admin_delete_notif_op" ON public.notificacoes_operacionais
  FOR DELETE USING (has_role((SELECT auth.uid()), 'administrador'::app_role));

DROP POLICY IF EXISTS "auth_insert_notif_op" ON public.notificacoes_operacionais;
CREATE POLICY "auth_insert_notif_op" ON public.notificacoes_operacionais
  FOR INSERT WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "user_select_own_notif_op" ON public.notificacoes_operacionais;
CREATE POLICY "user_select_own_notif_op" ON public.notificacoes_operacionais
  FOR SELECT USING (usuario_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "user_update_own_notif_op" ON public.notificacoes_operacionais;
CREATE POLICY "user_update_own_notif_op" ON public.notificacoes_operacionais
  FOR UPDATE USING (usuario_id = (SELECT auth.uid()));

-- ---------- ORDENS_SERVICO ----------
DROP POLICY IF EXISTS "Admin/Gestor total access on ordens_servico" ON public.ordens_servico;
CREATE POLICY "Admin/Gestor total access on ordens_servico" ON public.ordens_servico
  FOR ALL
  USING (has_role((SELECT auth.uid()), 'administrador'::app_role) OR has_role((SELECT auth.uid()), 'gestor'::app_role))
  WITH CHECK (has_role((SELECT auth.uid()), 'administrador'::app_role) OR has_role((SELECT auth.uid()), 'gestor'::app_role));

DROP POLICY IF EXISTS "Cliente read own ordens_servico" ON public.ordens_servico;
CREATE POLICY "Cliente read own ordens_servico" ON public.ordens_servico
  FOR SELECT USING (cliente_id = ANY (get_cliente_ids_for_user((SELECT auth.uid()))));

DROP POLICY IF EXISTS "Financeiro read ordens_servico" ON public.ordens_servico;
CREATE POLICY "Financeiro read ordens_servico" ON public.ordens_servico
  FOR SELECT USING (has_role((SELECT auth.uid()), 'financeiro'::app_role));

DROP POLICY IF EXISTS "GestorComercial read B2B ordens_servico" ON public.ordens_servico;
CREATE POLICY "GestorComercial read B2B ordens_servico" ON public.ordens_servico
  FOR SELECT USING (has_role((SELECT auth.uid()), 'gestor_comercial'::app_role) AND (origem = 'b2b'::text) AND (partner_order_id IS NOT NULL));

DROP POLICY IF EXISTS "Producao update ordens_servico" ON public.ordens_servico;
CREATE POLICY "Producao update ordens_servico" ON public.ordens_servico
  FOR UPDATE
  USING (has_role((SELECT auth.uid()), 'producao'::app_role))
  WITH CHECK (has_role((SELECT auth.uid()), 'producao'::app_role));

DROP POLICY IF EXISTS "Producao/Adm/Consultor read ordens_servico" ON public.ordens_servico;
CREATE POLICY "Producao/Adm/Consultor read ordens_servico" ON public.ordens_servico
  FOR SELECT USING (has_role((SELECT auth.uid()), 'producao'::app_role) OR has_role((SELECT auth.uid()), 'administrativo'::app_role) OR has_role((SELECT auth.uid()), 'consultor_tecnico'::app_role));

-- ---------- ORDENS_SERVICO_ONFARM ----------
DROP POLICY IF EXISTS "Admin/Gestor total access on ordens_servico_onfarm" ON public.ordens_servico_onfarm;
CREATE POLICY "Admin/Gestor total access on ordens_servico_onfarm" ON public.ordens_servico_onfarm
  FOR ALL
  USING (has_role((SELECT auth.uid()), 'administrador'::app_role) OR has_role((SELECT auth.uid()), 'gestor'::app_role))
  WITH CHECK (has_role((SELECT auth.uid()), 'administrador'::app_role) OR has_role((SELECT auth.uid()), 'gestor'::app_role));

DROP POLICY IF EXISTS "Cliente read own ordens_servico_onfarm" ON public.ordens_servico_onfarm;
CREATE POLICY "Cliente read own ordens_servico_onfarm" ON public.ordens_servico_onfarm
  FOR SELECT USING (cliente_id = ANY (get_cliente_ids_for_user((SELECT auth.uid()))));

DROP POLICY IF EXISTS "Financeiro read ordens_servico_onfarm" ON public.ordens_servico_onfarm;
CREATE POLICY "Financeiro read ordens_servico_onfarm" ON public.ordens_servico_onfarm
  FOR SELECT USING (has_role((SELECT auth.uid()), 'financeiro'::app_role));

DROP POLICY IF EXISTS "Producao/Adm/Consultor read ordens_servico_onfarm" ON public.ordens_servico_onfarm;
CREATE POLICY "Producao/Adm/Consultor read ordens_servico_onfarm" ON public.ordens_servico_onfarm
  FOR SELECT USING (has_role((SELECT auth.uid()), 'producao'::app_role) OR has_role((SELECT auth.uid()), 'administrativo'::app_role) OR has_role((SELECT auth.uid()), 'consultor_tecnico'::app_role));

-- ---------- PROFILES ----------
DROP POLICY IF EXISTS "Admins can read all profiles" ON public.profiles;
CREATE POLICY "Admins can read all profiles" ON public.profiles
  FOR SELECT USING (has_role((SELECT auth.uid()), 'administrador'::app_role));

DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;
CREATE POLICY "Admins can update all profiles" ON public.profiles
  FOR UPDATE USING (has_role((SELECT auth.uid()), 'administrador'::app_role));

DROP POLICY IF EXISTS "Internal staff can view all profiles" ON public.profiles;
CREATE POLICY "Internal staff can view all profiles" ON public.profiles
  FOR SELECT USING (
    has_role((SELECT auth.uid()), 'administrador'::app_role)
    OR has_role((SELECT auth.uid()), 'gestor'::app_role)
    OR has_role((SELECT auth.uid()), 'administrativo'::app_role)
    OR has_role((SELECT auth.uid()), 'consultor_tecnico'::app_role)
    OR has_role((SELECT auth.uid()), 'tecnico_agronomo'::app_role)
  );

DROP POLICY IF EXISTS "Organization members can view colleagues" ON public.profiles;
CREATE POLICY "Organization members can view colleagues" ON public.profiles
  FOR SELECT USING (
    ((cliente_id IS NOT NULL) AND (cliente_id = ANY (get_cliente_ids_for_user((SELECT auth.uid())))))
    OR can_user_access_cliente(cliente_id)
  );

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING ((SELECT auth.uid()) = user_id);

-- ---------- ADDITIONAL INDEXES ----------
-- visitas_checkin: 2.248 calls ordering by data_hora_checkin DESC
CREATE INDEX IF NOT EXISTS idx_visitas_checkin_data_hora
  ON public.visitas_checkin (data_hora_checkin DESC);

-- registros_consultor covering for hot select projection
CREATE INDEX IF NOT EXISTS idx_registros_consultor_created_status
  ON public.registros_consultor (created_at DESC, status);

-- profiles covering for repeated (user_id, nome, email) lookups
CREATE INDEX IF NOT EXISTS idx_profiles_user_id_covering
  ON public.profiles (user_id) INCLUDE (nome, email);

ANALYZE public.entregas;
ANALYZE public.ordens_servico;
ANALYZE public.ordens_servico_onfarm;
ANALYZE public.profiles;
ANALYZE public.notificacoes_operacionais;
ANALYZE public.visitas_checkin;
ANALYZE public.registros_consultor;
