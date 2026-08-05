-- =====================================================================
-- ROLLBACK — CORREÇÃO 1 (HARDENING DE CARTEIRA E ANON)
-- Restaura exatamente a função, a policy e as ACLs do baseline
-- 7c0f28735914f81922a5259d30eecb91a2dd9603 em staging ikaauvsflpmamgxmkhoq.
-- Não exclui nem altera dados.
-- psql "$STAGING_DSN" --single-transaction -v ON_ERROR_STOP=1 -f rollback.sql
-- =====================================================================

DO $guard$
DECLARE v_marker text; v_ref text; v_count int;
BEGIN
  IF to_regclass('public._fiscal_staging_marker') IS NULL THEN
    RAISE EXCEPTION 'GUARD_ABORT: marcador ausente';
  END IF;
  EXECUTE 'SELECT count(*) FROM public._fiscal_staging_marker' INTO v_count;
  IF v_count <> 1 THEN RAISE EXCEPTION 'GUARD_ABORT: marcador com % linhas', v_count; END IF;
  EXECUTE 'SELECT marker, project_ref FROM public._fiscal_staging_marker' INTO v_marker, v_ref;
  IF COALESCE(v_marker,'') <> 'STAGING' OR COALESCE(v_ref,'') <> 'ikaauvsflpmamgxmkhoq' THEN
    RAISE EXCEPTION 'GUARD_ABORT: ambiente nao autorizado';
  END IF;
END
$guard$;

-- 1) Função no estado original (sem exigência de vínculo ativo p/ técnicos)
CREATE OR REPLACE FUNCTION public.can_user_access_cliente(_cliente_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id uuid := auth.uid();
    v_is_admin boolean;
    v_is_gestor boolean;
    v_is_adm_sys boolean;
    v_is_financeiro boolean;
    v_is_comercial boolean;
    v_is_producao boolean;
    v_is_aplicador boolean;
    v_is_onfarm boolean;
    v_is_consultor boolean;
    v_is_tecnico boolean;
    v_is_cliente boolean;
    v_is_b2b boolean;
    v_is_b2b_tec boolean;
    v_partner_id uuid;
BEGIN
    IF v_user_id IS NULL OR _cliente_id IS NULL THEN
        RETURN FALSE;
    END IF;

    v_is_admin := has_role(v_user_id, 'administrador'::app_role);
    v_is_gestor := has_role(v_user_id, 'gestor'::app_role);
    v_is_adm_sys := has_role(v_user_id, 'administrativo'::app_role);
    v_is_financeiro := has_role(v_user_id, 'financeiro'::app_role);
    v_is_comercial := has_role(v_user_id, 'gestor_comercial'::app_role);
    v_is_producao := has_role(v_user_id, 'producao'::app_role);
    v_is_aplicador := has_role(v_user_id, 'aplicador'::app_role);
    v_is_onfarm := has_role(v_user_id, 'operador_onfarm'::app_role);
    v_is_consultor := has_role(v_user_id, 'consultor_tecnico'::app_role);
    v_is_tecnico := has_role(v_user_id, 'tecnico_agronomo'::app_role);
    v_is_cliente := has_role(v_user_id, 'cliente_produtor'::app_role);
    v_is_b2b := has_role(v_user_id, 'parceiro_b2b'::app_role);
    v_is_b2b_tec := has_role(v_user_id, 'parceiro_b2b_tecnico'::app_role);

    IF v_is_admin OR v_is_gestor OR v_is_adm_sys OR v_is_financeiro
       OR v_is_comercial OR v_is_producao OR v_is_aplicador OR v_is_onfarm THEN
        RETURN TRUE;
    END IF;

    IF v_is_cliente THEN
        RETURN _cliente_id = ANY(get_cliente_ids_for_user(v_user_id));
    END IF;

    IF v_is_consultor OR v_is_tecnico THEN
        RETURN EXISTS (
            SELECT 1 FROM user_clientes uc
            WHERE uc.user_id = v_user_id AND uc.cliente_id = _cliente_id
        );
    END IF;

    IF v_is_b2b_tec THEN
        v_partner_id := public.get_user_partner_id();
        RETURN EXISTS (
            SELECT 1 FROM public.partner_technician_clients ptc
            WHERE ptc.cliente_id = _cliente_id
              AND ptc.technician_user_id = v_user_id
              AND ptc.partner_id = v_partner_id
              AND ptc.active = true
        );
    END IF;

    IF v_is_b2b THEN
        v_partner_id := public.get_user_partner_id();
        RETURN EXISTS (
            SELECT 1 FROM public.partner_technician_clients ptc
            WHERE ptc.cliente_id = _cliente_id
              AND ptc.partner_id = v_partner_id
              AND ptc.active = true
        ) OR EXISTS (
            SELECT 1 FROM public.partner_clients pc
            WHERE pc.cliente_id = _cliente_id
              AND pc.partner_id = v_partner_id
              AND pc.active = true
        );
    END IF;

    RETURN FALSE;
END;
$function$;

COMMENT ON FUNCTION public.can_user_access_cliente(uuid) IS NULL;

-- 2) Policy de SELECT no estado original (TO public)
DROP POLICY IF EXISTS registros_consultor_select_hardened ON public.registros_consultor;

CREATE POLICY registros_consultor_select_hardened
ON public.registros_consultor
FOR SELECT
TO public
USING (
  has_role(auth.uid(), 'administrador'::app_role)
  OR has_role(auth.uid(), 'gestor'::app_role)
  OR (
    COALESCE(natureza_registro, 'ocorrencia'::natureza_registro_consultor)
      <> 'visita'::natureza_registro_consultor
    AND can_user_access_cliente(cliente_id)
  )
  OR (
    COALESCE(natureza_registro, 'ocorrencia'::natureza_registro_consultor)
      = 'visita'::natureza_registro_consultor
    AND (
      has_active_user_cliente_access(auth.uid(), cliente_id, ARRAY['read','execute','manage'])
      OR is_active_visit_participant(auth.uid(), id)
      OR (
        has_role(auth.uid(), 'cliente_produtor'::app_role)
        AND can_user_access_cliente(cliente_id)
        AND status = ANY (ARRAY[
          'aprovado'::status_registro_consultor,
          'finalizado'::status_registro_consultor,
          'convertido_os'::status_registro_consultor
        ])
      )
    )
  )
);

-- 3) ACLs originais da tabela
GRANT ALL ON TABLE public.registros_consultor TO anon;
GRANT ALL ON TABLE public.registros_consultor TO authenticated;
GRANT ALL ON TABLE public.registros_consultor TO service_role;

ALTER TABLE public.registros_consultor ENABLE ROW LEVEL SECURITY;
