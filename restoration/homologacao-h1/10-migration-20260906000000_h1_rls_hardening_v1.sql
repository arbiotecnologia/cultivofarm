-- =====================================================================
-- FASE H1 — HARDENING DE SEGURANÇA (RLS / EXECUTE / RPC AUSENTE)
-- Versão canônica: 20260906000000_h1_rls_hardening_v1
-- Alvo autorizado: staging ikaauvsflpmamgxmkhoq (executar via
--   restoration/os-e2e/staging-psql.sh, que é fail-closed contra produção).
-- Forward-only e idempotente.
-- Rollback: restoration/homologacao-h1/90-rollback-20260906000000.sql
--
-- Escopo:
--  H1-001 aplicacao_emails              — SELECT sem vínculo de autorização
--  H1-002 aplicacao_evidencias_vinculos — SELECT true / INSERT-DELETE auth.uid IS NOT NULL
--  H1-003 arquivos                      — SELECT true / INSERT auth.uid IS NOT NULL
--  H1-004 registros_consultor_status_log— SELECT true / INSERT auth.uid IS NOT NULL
--  H1-005 solicitacoes_timeline         — SELECT true / INSERT auth.uid IS NOT NULL
--  H1-006 organizations                 — SELECT true para authenticated
--  H1-008 REVOKE anon EXECUTE em trigger functions e RPCs não públicas
--  H1-009 rpc_notificar_gestor ausente no staging (dependência do HEAD)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. HELPERS DE AUTORIZAÇÃO (SECURITY DEFINER, search_path fixo)
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_operational_staff(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(_uid IS NOT NULL AND (
       public.has_role(_uid, 'administrador'::app_role)
    OR public.has_role(_uid, 'gestor'::app_role)
    OR public.has_role(_uid, 'administrativo'::app_role)
    OR public.has_role(_uid, 'consultor_tecnico'::app_role)
    OR public.has_role(_uid, 'tecnico_agronomo'::app_role)
    OR public.has_role(_uid, 'aplicador'::app_role)
    OR public.has_role(_uid, 'producao'::app_role)
    OR public.has_role(_uid, 'operador_onfarm'::app_role)
  ), false);
$$;

-- Acesso de leitura a uma aplicação: espelha as policies de public.aplicacoes
CREATE OR REPLACE FUNCTION public.can_user_access_aplicacao(_aplicacao_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _aplicacao_id IS NOT NULL
     AND auth.uid() IS NOT NULL
     AND (
       public.is_operational_staff(auth.uid())
       OR public.has_role(auth.uid(), 'financeiro'::app_role)
       OR EXISTS (
            SELECT 1
            FROM public.aplicacoes a
            LEFT JOIN public.ordens_servico os ON os.id = a.ordem_servico_id
            LEFT JOIN public.ordens_servico_onfarm oso ON oso.id = a.ordem_servico_onfarm_id
            WHERE a.id = _aplicacao_id
              AND (
                os.cliente_id = ANY (public.get_cliente_ids_for_user(auth.uid()))
                OR oso.cliente_id = ANY (public.get_cliente_ids_for_user(auth.uid()))
              )
          )
     );
$$;

-- Gestão (escrita) de artefatos de aplicação: espelha "Staff manage evidencias"
CREATE OR REPLACE FUNCTION public.can_user_manage_aplicacao(_aplicacao_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _aplicacao_id IS NOT NULL
     AND auth.uid() IS NOT NULL
     AND (
       public.has_role(auth.uid(), 'administrador'::app_role)
       OR public.has_role(auth.uid(), 'gestor'::app_role)
       OR public.has_role(auth.uid(), 'administrativo'::app_role)
       OR public.has_role(auth.uid(), 'consultor_tecnico'::app_role)
       OR public.has_role(auth.uid(), 'aplicador'::app_role)
     )
     AND EXISTS (SELECT 1 FROM public.aplicacoes a WHERE a.id = _aplicacao_id);
$$;

CREATE OR REPLACE FUNCTION public.can_user_access_registro_consultor(_registro_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _registro_id IS NOT NULL
     AND auth.uid() IS NOT NULL
     AND (
       public.has_role(auth.uid(), 'administrador'::app_role)
       OR public.has_role(auth.uid(), 'gestor'::app_role)
       OR public.can_view_technical_visit(auth.uid(), _registro_id)
       OR EXISTS (
            SELECT 1 FROM public.registros_consultor r
            WHERE r.id = _registro_id
              AND (
                r.consultor_responsavel = auth.uid()
                OR r.created_by = auth.uid()
                OR r.finalized_by = auth.uid()
                OR r.cliente_id = ANY (public.get_cliente_ids_for_user(auth.uid()))
              )
          )
     );
$$;

CREATE OR REPLACE FUNCTION public.can_user_access_solicitacao(_solicitacao_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _solicitacao_id IS NOT NULL
     AND auth.uid() IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.portal_solicitacoes s
       WHERE s.id = _solicitacao_id
         AND (
           public.has_role(auth.uid(), 'administrador'::app_role)
           OR public.has_role(auth.uid(), 'gestor'::app_role)
           OR s.created_by = auth.uid()
           OR s.user_id = auth.uid()
           OR s.consultor_atribuido = auth.uid()
           OR s.cliente_id = ANY (public.get_cliente_ids_for_user(auth.uid()))
         )
     );
$$;

-- Autorização polimórfica de public.arquivos: whitelist por entidade pai.
-- Default = DENY (exceto administrador/gestor, que administram o acervo).
CREATE OR REPLACE FUNCTION public.can_user_access_arquivo(_entidade_tipo text, _entidade_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
     AND (
       public.has_role(auth.uid(), 'administrador'::app_role)
       OR public.has_role(auth.uid(), 'gestor'::app_role)
       OR (
         _entidade_id IS NOT NULL AND CASE lower(COALESCE(_entidade_tipo, ''))
           WHEN 'registro_consultor'  THEN public.can_user_access_registro_consultor(_entidade_id)
           WHEN 'registros_consultor' THEN public.can_user_access_registro_consultor(_entidade_id)
           WHEN 'visita'              THEN public.can_user_access_registro_consultor(_entidade_id)
           WHEN 'aplicacao'           THEN public.can_user_access_aplicacao(_entidade_id)
           WHEN 'solicitacao'         THEN public.can_user_access_solicitacao(_entidade_id)
           WHEN 'portal_solicitacao'  THEN public.can_user_access_solicitacao(_entidade_id)
           WHEN 'cliente'             THEN public.can_user_access_cliente(_entidade_id)
           WHEN 'fazenda'             THEN public.can_user_access_fazenda(_entidade_id)
           ELSE false
         END
       )
     );
$$;

-- ---------------------------------------------------------------------
-- H1-001 aplicacao_emails
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view emails sent for their applications" ON public.aplicacao_emails;
DROP POLICY IF EXISTS "aplicacao_emails_select_scoped" ON public.aplicacao_emails;
CREATE POLICY "aplicacao_emails_select_scoped"
  ON public.aplicacao_emails FOR SELECT TO authenticated
  USING (public.can_user_access_aplicacao(aplicacao_id));

-- ---------------------------------------------------------------------
-- H1-002 aplicacao_evidencias_vinculos
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Permitir leitura de vínculos para usuários autenticados" ON public.aplicacao_evidencias_vinculos;
DROP POLICY IF EXISTS "Permitir inserção de vínculos para usuários autenticados" ON public.aplicacao_evidencias_vinculos;
DROP POLICY IF EXISTS "Permitir exclusão de vínculos para usuários autenticados" ON public.aplicacao_evidencias_vinculos;
DROP POLICY IF EXISTS "aev_select_scoped" ON public.aplicacao_evidencias_vinculos;
DROP POLICY IF EXISTS "aev_insert_scoped" ON public.aplicacao_evidencias_vinculos;
DROP POLICY IF EXISTS "aev_delete_scoped" ON public.aplicacao_evidencias_vinculos;

CREATE POLICY "aev_select_scoped"
  ON public.aplicacao_evidencias_vinculos FOR SELECT TO authenticated
  USING (public.can_user_access_aplicacao(aplicacao_id));

CREATE POLICY "aev_insert_scoped"
  ON public.aplicacao_evidencias_vinculos FOR INSERT TO authenticated
  WITH CHECK (
    public.can_user_manage_aplicacao(aplicacao_id)
    AND EXISTS (
      SELECT 1 FROM public.aplicacao_evidencias e
      WHERE e.id = evidencia_id
        AND public.can_user_access_aplicacao(e.aplicacao_id)
    )
  );

CREATE POLICY "aev_delete_scoped"
  ON public.aplicacao_evidencias_vinculos FOR DELETE TO authenticated
  USING (public.can_user_manage_aplicacao(aplicacao_id));

-- ---------------------------------------------------------------------
-- H1-003 arquivos
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can read arquivos" ON public.arquivos;
DROP POLICY IF EXISTS "Authenticated users can insert arquivos" ON public.arquivos;
DROP POLICY IF EXISTS "arquivos_select_scoped" ON public.arquivos;
DROP POLICY IF EXISTS "arquivos_insert_scoped" ON public.arquivos;

CREATE POLICY "arquivos_select_scoped"
  ON public.arquivos FOR SELECT TO authenticated
  USING (public.can_user_access_arquivo(entidade_tipo, entidade_id));

CREATE POLICY "arquivos_insert_scoped"
  ON public.arquivos FOR INSERT TO authenticated
  WITH CHECK (public.can_user_access_arquivo(entidade_tipo, entidade_id));

-- ---------------------------------------------------------------------
-- H1-004 registros_consultor_status_log (trilha imutável)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "auth_select_status_log" ON public.registros_consultor_status_log;
DROP POLICY IF EXISTS "auth_insert_status_log" ON public.registros_consultor_status_log;
DROP POLICY IF EXISTS "rcsl_select_scoped" ON public.registros_consultor_status_log;
DROP POLICY IF EXISTS "rcsl_insert_scoped" ON public.registros_consultor_status_log;

CREATE POLICY "rcsl_select_scoped"
  ON public.registros_consultor_status_log FOR SELECT TO authenticated
  USING (public.can_user_access_registro_consultor(registro_consultor_id));

CREATE POLICY "rcsl_insert_scoped"
  ON public.registros_consultor_status_log FOR INSERT TO authenticated
  WITH CHECK (
    COALESCE(changed_by, auth.uid()) = auth.uid()
    AND public.can_user_access_registro_consultor(registro_consultor_id)
  );

-- ---------------------------------------------------------------------
-- H1-005 solicitacoes_timeline
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "auth_select_solicitacoes_timeline" ON public.solicitacoes_timeline;
DROP POLICY IF EXISTS "auth_insert_solicitacoes_timeline" ON public.solicitacoes_timeline;
DROP POLICY IF EXISTS "st_select_scoped" ON public.solicitacoes_timeline;
DROP POLICY IF EXISTS "st_insert_scoped" ON public.solicitacoes_timeline;

CREATE POLICY "st_select_scoped"
  ON public.solicitacoes_timeline FOR SELECT TO authenticated
  USING (public.can_user_access_solicitacao(solicitacao_id));

CREATE POLICY "st_insert_scoped"
  ON public.solicitacoes_timeline FOR INSERT TO authenticated
  WITH CHECK (
    COALESCE(usuario_id, auth.uid()) = auth.uid()
    AND public.can_user_access_solicitacao(solicitacao_id)
  );

-- ---------------------------------------------------------------------
-- H1-006 organizations
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "organizations_select_authenticated" ON public.organizations;
DROP POLICY IF EXISTS "organizations_select_scoped" ON public.organizations;
CREATE POLICY "organizations_select_scoped"
  ON public.organizations FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'administrador'::app_role)
    OR public.has_role(auth.uid(), 'gestor'::app_role)
    OR EXISTS (
         SELECT 1 FROM public.profiles p
         WHERE p.user_id = auth.uid() AND p.organization_id = organizations.id
       )
    OR (
      organizations.partner_account_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.partner_users pu
        WHERE pu.user_id = auth.uid()
          AND pu.partner_id = organizations.partner_account_id
      )
    )
  );

-- ---------------------------------------------------------------------
-- H1-008 REVOKE anon EXECUTE
--   Trigger functions: não são endpoints RPC; anon nunca precisa de EXECUTE.
--   RPCs internas/autenticadas: PostgREST não deve expô-las a anon.
--   MANTIDAS públicas (token-scoped): rpc_validar_comprovante_entrega,
--   rpc_validar_rastreio_produto.
-- ---------------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'comunicacao_dlq_replay_audit_no_mutation','enforce_checkin_immutability',
        'enforce_diagnostico_immutability','enforce_visit_immutability',
        'fn_estoque_produto_guard','fn_ledger_append_only','regulatory_audit_trigger',
        'tg_b2b_block_receivable_before_approval','tg_block_pofl_delete',
        'tg_commercial_price_rules_audit','tg_culturas_block_delete_in_use',
        'tg_culturas_stamp_desativacao','tg_monitoramento_avisos_set_dref',
        'tg_notify_payment_terms_pending','tg_pcp_audit',
        '_notify_role','fn_cultura_em_uso','get_visit_organization_id',
        'rpc_check_monitoramento_and_notify','rpc_create_notificacao_operacional',
        'rpc_portal_partner_financial'
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
  END LOOP;
END $$;

-- Reconcede EXECUTE a authenticated/service_role nas RPCs que o app usa.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'rpc_create_notificacao_operacional','rpc_portal_partner_financial',
        'fn_cultura_em_uso','get_visit_organization_id'
      )
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- H1-009 rpc_notificar_gestor — dependência do HEAD ausente no staging
-- (src/components/aplicacao/AplicacaoFormDialog.tsx).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_notificar_gestor(
  p_titulo text,
  p_mensagem text,
  p_link text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Identidade obrigatória' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_operational_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Sem papel operacional' USING ERRCODE = '42501';
  END IF;
  IF p_titulo IS NULL OR char_length(p_titulo) > 200 THEN
    RAISE EXCEPTION 'Título obrigatório e limitado a 200 caracteres' USING ERRCODE = '22023';
  END IF;
  IF p_mensagem IS NOT NULL AND char_length(p_mensagem) > 2000 THEN
    RAISE EXCEPTION 'Mensagem excede 2000 caracteres' USING ERRCODE = '22023';
  END IF;
  IF p_link IS NOT NULL AND p_link !~ '^/[A-Za-z0-9_\-./?=&%#]{0,500}$' THEN
    RAISE EXCEPTION 'Link inválido' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.notificacoes_operacionais (usuario_id, tipo, titulo, mensagem, link)
  SELECT ur.user_id, 'informativo', p_titulo, p_mensagem, p_link
  FROM public.user_roles ur
  WHERE ur.role = 'gestor'::app_role;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_notificar_gestor(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_notificar_gestor(text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_notificar_gestor(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_notificar_gestor(text, text, text) TO service_role;

-- Helpers novos: apenas authenticated/service_role.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname IN (
      'is_operational_staff','can_user_access_aplicacao','can_user_manage_aplicacao',
      'can_user_access_registro_consultor','can_user_access_solicitacao','can_user_access_arquivo')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;
