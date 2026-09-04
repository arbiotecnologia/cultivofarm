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
$function$

--ACL: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
--OWNER: postgres

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
$function$

--ACL: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
--OWNER: postgres

