-- =====================================================================
-- CORREÇÃO 1 — HARDENING DE CARTEIRA E ANON EM REGISTROS/OCORRÊNCIAS
-- Base auditada: 7c0f28735914f81922a5259d30eecb91a2dd9603
-- Ambiente: staging ikaauvsflpmamgxmkhoq (guard fail-closed abaixo)
-- Idempotente. Forward-only. Nenhuma alteração de dados.
-- Aplicar com: psql "$STAGING_DSN" --single-transaction -v ON_ERROR_STOP=1 -f migration.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- GUARD FAIL-CLOSED DE AMBIENTE
-- ---------------------------------------------------------------------
DO $guard$
DECLARE
  v_count int;
  v_marker text;
  v_ref text;
BEGIN
  IF to_regclass('public._fiscal_staging_marker') IS NULL THEN
    RAISE EXCEPTION 'GUARD_ABORT: public._fiscal_staging_marker ausente';
  END IF;

  EXECUTE 'SELECT count(*) FROM public._fiscal_staging_marker' INTO v_count;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'GUARD_ABORT: marcador de ambiente com % linhas (esperado 1)', v_count;
  END IF;

  EXECUTE 'SELECT marker, project_ref FROM public._fiscal_staging_marker'
    INTO v_marker, v_ref;

  IF COALESCE(v_marker, '') <> 'STAGING' THEN
    RAISE EXCEPTION 'GUARD_ABORT: marker <> STAGING';
  END IF;

  IF COALESCE(v_ref, '') <> 'ikaauvsflpmamgxmkhoq' THEN
    RAISE EXCEPTION 'GUARD_ABORT: project_ref divergente do staging autorizado';
  END IF;
END
$guard$;

-- ---------------------------------------------------------------------
-- 1) FONTE CANÔNICA: public.can_user_access_cliente
--    Correção única: consultor_tecnico / tecnico_agronomo passam a exigir
--    vínculo ATIVO e VIGENTE de carteira, delegando ao helper canônico
--    public.has_active_user_cliente_access. Nenhuma outra regra é alterada.
-- ---------------------------------------------------------------------
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

    v_is_admin := COALESCE(has_role(v_user_id, 'administrador'::app_role), false);
    v_is_gestor := COALESCE(has_role(v_user_id, 'gestor'::app_role), false);
    v_is_adm_sys := COALESCE(has_role(v_user_id, 'administrativo'::app_role), false);
    v_is_financeiro := COALESCE(has_role(v_user_id, 'financeiro'::app_role), false);
    v_is_comercial := COALESCE(has_role(v_user_id, 'gestor_comercial'::app_role), false);
    v_is_producao := COALESCE(has_role(v_user_id, 'producao'::app_role), false);
    v_is_aplicador := COALESCE(has_role(v_user_id, 'aplicador'::app_role), false);
    v_is_onfarm := COALESCE(has_role(v_user_id, 'operador_onfarm'::app_role), false);
    v_is_consultor := COALESCE(has_role(v_user_id, 'consultor_tecnico'::app_role), false);
    v_is_tecnico := COALESCE(has_role(v_user_id, 'tecnico_agronomo'::app_role), false);
    v_is_cliente := COALESCE(has_role(v_user_id, 'cliente_produtor'::app_role), false);
    v_is_b2b := COALESCE(has_role(v_user_id, 'parceiro_b2b'::app_role), false);
    v_is_b2b_tec := COALESCE(has_role(v_user_id, 'parceiro_b2b_tecnico'::app_role), false);

    IF v_is_admin OR v_is_gestor OR v_is_adm_sys OR v_is_financeiro
       OR v_is_comercial OR v_is_producao OR v_is_aplicador OR v_is_onfarm THEN
        RETURN TRUE;
    END IF;

    IF v_is_cliente THEN
        RETURN COALESCE(_cliente_id = ANY(get_cliente_ids_for_user(v_user_id)), false);
    END IF;

    -- HARDENING: carteira ativa e vigente é obrigatória para papéis técnicos.
    IF v_is_consultor OR v_is_tecnico THEN
        RETURN COALESCE(
          public.has_active_user_cliente_access(
            v_user_id, _cliente_id, ARRAY['read','execute','manage']
          ), false);
    END IF;

    IF v_is_b2b_tec THEN
        v_partner_id := public.get_user_partner_id();
        RETURN COALESCE((
          EXISTS (
            SELECT 1 FROM public.partner_technician_clients ptc
            WHERE ptc.cliente_id = _cliente_id
              AND ptc.technician_user_id = v_user_id
              AND ptc.partner_id = v_partner_id
              AND ptc.active = true
          )), false);
    END IF;

    IF v_is_b2b THEN
        v_partner_id := public.get_user_partner_id();
        RETURN COALESCE((
          EXISTS (
            SELECT 1 FROM public.partner_technician_clients ptc
            WHERE ptc.cliente_id = _cliente_id
              AND ptc.partner_id = v_partner_id
              AND ptc.active = true
          ) OR EXISTS (
            SELECT 1 FROM public.partner_clients pc
            WHERE pc.cliente_id = _cliente_id
              AND pc.partner_id = v_partner_id
              AND pc.active = true
          )), false);
    END IF;

    RETURN FALSE;
END;
$function$;

-- ---------------------------------------------------------------------
-- 2) POLICY DE SELECT: restringir o role alvo a authenticated.
--    A policy anterior era TO public (alcançava anon). A lógica de
--    autorização permanece semanticamente idêntica.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS registros_consultor_select_hardened ON public.registros_consultor;

CREATE POLICY registros_consultor_select_hardened
ON public.registros_consultor
FOR SELECT
TO authenticated
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

-- ---------------------------------------------------------------------
-- 3) ACLs: remover privilégios diretos de anon e de PUBLIC.
--    authenticated mantém apenas o mínimo funcional (S/I/U/D).
--    service_role mantém ALL. RLS permanece habilitada.
-- ---------------------------------------------------------------------
REVOKE ALL ON TABLE public.registros_consultor FROM anon;
REVOKE ALL ON TABLE public.registros_consultor FROM PUBLIC;

REVOKE TRIGGER, TRUNCATE, REFERENCES ON TABLE public.registros_consultor FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.registros_consultor TO authenticated;
GRANT ALL ON TABLE public.registros_consultor TO service_role;

ALTER TABLE public.registros_consultor ENABLE ROW LEVEL SECURITY;

COMMENT ON FUNCTION public.can_user_access_cliente(uuid) IS
  'Fonte canonica de acesso por cliente. Papeis tecnicos (consultor_tecnico, tecnico_agronomo) exigem vinculo ATIVO e VIGENTE em user_clientes via has_active_user_cliente_access. Fail-closed.';

-- ---------------------------------------------------------------------
-- 4) OVERLOAD public.can_user_access_cliente(_user_id, _cliente_id)
--    Baseline retornava TRUE para QUALQUER tecnico_agronomo /
--    consultor_tecnico, ignorando a carteira, e é executável por
--    authenticated via RPC. Hardening: papéis técnicos passam a exigir
--    vínculo ativo e vigente; demais regras preservadas.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_user_access_cliente(_user_id uuid, _cliente_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF _user_id IS NULL OR _cliente_id IS NULL THEN
    RETURN false;
  END IF;

  IF COALESCE(public.has_role(_user_id,'administrador'::app_role), false)
     OR COALESCE(public.has_role(_user_id,'gestor_comercial'::app_role), false)
     OR COALESCE(public.has_role(_user_id,'gestor'::app_role), false)
  THEN
    RETURN true;
  END IF;

  -- HARDENING: papéis técnicos exigem carteira ativa e vigente.
  IF COALESCE(public.has_role(_user_id,'tecnico_agronomo'::app_role), false)
     OR COALESCE(public.has_role(_user_id,'consultor_tecnico'::app_role), false)
  THEN
    RETURN COALESCE(
      public.has_active_user_cliente_access(
        _user_id, _cliente_id, ARRAY['read','execute','manage']
      ), false);
  END IF;

  IF COALESCE(public.has_role(_user_id,'parceiro_b2b'::app_role), false) THEN
    RETURN COALESCE((EXISTS (
      SELECT 1 FROM public.partner_clients pc
      JOIN public.partner_users pu ON pu.partner_id = pc.partner_id
      WHERE pu.user_id = _user_id AND pc.cliente_id = _cliente_id AND pc.active = true
    )), false);
  END IF;

  IF COALESCE(public.has_role(_user_id,'parceiro_b2b_tecnico'::app_role), false) THEN
    RETURN COALESCE((EXISTS (
      SELECT 1 FROM public.partner_user_clients puc
      WHERE puc.user_id = _user_id AND puc.cliente_id = _cliente_id AND puc.active = true
    ) OR EXISTS (
      SELECT 1 FROM public.partner_technician_clients ptc
      WHERE ptc.technician_user_id = _user_id AND ptc.cliente_id = _cliente_id AND ptc.active = true
    )), false);
  END IF;

  RETURN COALESCE((EXISTS (
    SELECT 1 FROM public.user_clientes uc
    WHERE uc.user_id = _user_id
      AND uc.cliente_id = _cliente_id
      AND uc.is_active = true
      AND (uc.valid_from IS NULL OR uc.valid_from <= now())
      AND (uc.valid_until IS NULL OR uc.valid_until >= now())
  )), false);
END;
$function$;

REVOKE ALL ON FUNCTION public.can_user_access_cliente(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_user_access_cliente(uuid, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.can_user_access_cliente(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_user_access_cliente(uuid) TO authenticated, service_role;
