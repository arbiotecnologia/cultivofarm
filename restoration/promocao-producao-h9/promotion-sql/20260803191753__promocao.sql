-- ============================================================================
-- ARTEFATO DERIVADO DE PROMOÇÃO — NÃO É UMA MIGRATION HISTÓRICA
-- Origem: supabase/migrations/20260803191753_8907559b-3c81-4d7a-913a-ff6865bec9e5.sql
-- SHA-256 da origem: 078e16e4997a5cbc4ec073436fc7a69c23dbb00502ff8ed4daa9fbc824be1745
-- Gerado por: restoration/promocao-producao-h9/gerar-promotion-sql.py (determinístico)
-- Transformação aplicada: leitura de marcador -> GUC; literal de ref homologacao -> producao
-- O arquivo de origem NÃO foi alterado.
--
-- Guarda canônica: o runner valida o ref do alvo por canal externo e só então
-- executa `SET LOCAL promocao.target_ref = 'navfzbwgwzruipouyfnk'`. Nenhuma tabela marcadora
-- de homologação é consultada.
-- ============================================================================
DO $promo_guard$
BEGIN
  IF coalesce(current_setting('promocao.target_ref', true), '') <> 'navfzbwgwzruipouyfnk' THEN
    RAISE EXCEPTION 'PROMO_GUARD: alvo nao confirmado (esperado %)', 'navfzbwgwzruipouyfnk'
      USING ERRCODE = '42501';
  END IF;
END
$promo_guard$;

-- ============================================================
-- Guarda de ambiente: STAGING ikaauvsflpmamgxmkhoq apenas
-- ============================================================
DO $guard$
DECLARE v_ref text;
BEGIN
  IF to_regclass('public._fiscal_staging_marker') IS NULL THEN
    RAISE EXCEPTION 'GUARD_ABORT: marker inexistente';
  END IF;
  SELECT current_setting('promocao.target_ref', true) INTO v_ref;
  IF v_ref IS DISTINCT FROM 'navfzbwgwzruipouyfnk' THEN
    RAISE EXCEPTION 'GUARD_ABORT: ambiente % nao autorizado', coalesce(v_ref,'<null>');
  END IF;
END
$guard$;

-- ============================================================
-- 1. registros_consultor_recomendacoes — vazamento cross-cliente
-- ============================================================
DROP POLICY IF EXISTS "auth_select_recomendacoes" ON public.registros_consultor_recomendacoes;
DROP POLICY IF EXISTS "Staff and owner manage recomendacoes" ON public.registros_consultor_recomendacoes;
DROP POLICY IF EXISTS "rec_select_participants" ON public.registros_consultor_recomendacoes;

CREATE POLICY "rc_recomendacoes_select_hardened"
ON public.registros_consultor_recomendacoes
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'administrador')
  OR public.has_role(auth.uid(), 'gestor')
  OR public.can_view_technical_visit(auth.uid(), registro_consultor_id)
  OR EXISTS (
    SELECT 1 FROM public.registros_consultor r
    WHERE r.id = registros_consultor_recomendacoes.registro_consultor_id
      AND (
        r.consultor_responsavel = auth.uid()
        OR r.created_by = auth.uid()
        OR public.has_active_user_cliente_access(auth.uid(), r.cliente_id, ARRAY['read','execute','manage'])
        OR (
          public.has_role(auth.uid(), 'cliente_produtor')
          AND public.can_user_access_cliente(r.cliente_id)
          AND r.status = ANY (ARRAY['aprovado','finalizado','convertido_os']::status_registro_consultor[])
        )
      )
  )
);

CREATE POLICY "rc_recomendacoes_insert_hardened"
ON public.registros_consultor_recomendacoes
FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'administrador')
  OR public.has_role(auth.uid(), 'gestor')
  OR public.can_manage_technical_visit(auth.uid(), registro_consultor_id)
  OR EXISTS (
    SELECT 1 FROM public.registros_consultor r
    WHERE r.id = registros_consultor_recomendacoes.registro_consultor_id
      AND (r.consultor_responsavel = auth.uid() OR r.created_by = auth.uid())
      AND public.has_active_user_cliente_access(auth.uid(), r.cliente_id, ARRAY['execute','manage'])
  )
);

CREATE POLICY "rc_recomendacoes_update_hardened"
ON public.registros_consultor_recomendacoes
FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'administrador')
  OR public.has_role(auth.uid(), 'gestor')
  OR public.can_manage_technical_visit(auth.uid(), registro_consultor_id)
  OR EXISTS (
    SELECT 1 FROM public.registros_consultor r
    WHERE r.id = registros_consultor_recomendacoes.registro_consultor_id
      AND (r.consultor_responsavel = auth.uid() OR r.created_by = auth.uid())
      AND public.has_active_user_cliente_access(auth.uid(), r.cliente_id, ARRAY['execute','manage'])
  )
)
WITH CHECK (
  public.has_role(auth.uid(), 'administrador')
  OR public.has_role(auth.uid(), 'gestor')
  OR public.can_manage_technical_visit(auth.uid(), registro_consultor_id)
  OR EXISTS (
    SELECT 1 FROM public.registros_consultor r
    WHERE r.id = registros_consultor_recomendacoes.registro_consultor_id
      AND (r.consultor_responsavel = auth.uid() OR r.created_by = auth.uid())
      AND public.has_active_user_cliente_access(auth.uid(), r.cliente_id, ARRAY['execute','manage'])
  )
);

CREATE POLICY "rc_recomendacoes_delete_hardened"
ON public.registros_consultor_recomendacoes
FOR DELETE TO authenticated
USING (
  public.has_role(auth.uid(), 'administrador')
  OR public.has_role(auth.uid(), 'gestor')
  OR public.can_manage_technical_visit(auth.uid(), registro_consultor_id)
);

-- ============================================================
-- 2. solicitacoes_atribuicoes — escrita/leitura abertas
-- ============================================================
DROP POLICY IF EXISTS "auth_select_atribuicoes" ON public.solicitacoes_atribuicoes;
DROP POLICY IF EXISTS "auth_insert_atribuicoes" ON public.solicitacoes_atribuicoes;
DROP POLICY IF EXISTS "auth_update_atribuicoes" ON public.solicitacoes_atribuicoes;

CREATE POLICY "solic_atrib_select_hardened"
ON public.solicitacoes_atribuicoes
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'administrador')
  OR public.has_role(auth.uid(), 'gestor')
  OR consultor_id = auth.uid()
  OR atribuido_por = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.portal_solicitacoes s
    WHERE s.id = solicitacoes_atribuicoes.solicitacao_id
      AND public.can_user_access_cliente(s.cliente_id)
  )
);

CREATE POLICY "solic_atrib_insert_hardened"
ON public.solicitacoes_atribuicoes
FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'administrador')
  OR public.has_role(auth.uid(), 'gestor')
  OR public.has_role(auth.uid(), 'tecnico_agronomo')
  OR public.has_role(auth.uid(), 'consultor_tecnico')
);

CREATE POLICY "solic_atrib_update_hardened"
ON public.solicitacoes_atribuicoes
FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'administrador')
  OR public.has_role(auth.uid(), 'gestor')
  OR consultor_id = auth.uid()
)
WITH CHECK (
  public.has_role(auth.uid(), 'administrador')
  OR public.has_role(auth.uid(), 'gestor')
  OR consultor_id = auth.uid()
);

-- ============================================================
-- 3. registros_consultor_arquivos — remover políticas legadas duplicadas
-- ============================================================
DROP POLICY IF EXISTS "admin_gestor_manage_arquivos" ON public.registros_consultor_arquivos;
DROP POLICY IF EXISTS "consultor_manage_own_arquivos" ON public.registros_consultor_arquivos;
DROP POLICY IF EXISTS "produtor_view_released_arquivos" ON public.registros_consultor_arquivos;

-- ============================================================
-- 4. Revogar EXECUTE de anon/public em RPCs do módulo
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.rpc_salvar_campo_visita(uuid, uuid, jsonb, integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rpc_salvar_campo_visita(uuid, uuid, jsonb, integer) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.rpc_record_aplicacao_email(uuid, text, text, text, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rpc_record_aplicacao_email(uuid, text, text, text, uuid) TO authenticated, service_role;
