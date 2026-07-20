
-- Fase 16: SELECT partner_simulations restrito para técnico
DROP POLICY IF EXISTS partner_simulations_select ON public.partner_simulations;
CREATE POLICY partner_simulations_select ON public.partner_simulations
FOR SELECT USING (
  public.has_role(auth.uid(), 'administrador'::app_role)
  OR public.has_role(auth.uid(), 'gestor_comercial'::app_role)
  OR (
    public.has_role(auth.uid(), 'parceiro_b2b'::app_role)
    AND partner_id = public.get_user_partner_id()
  )
  OR (
    public.has_role(auth.uid(), 'parceiro_b2b_tecnico'::app_role)
    AND partner_id = public.get_user_partner_id()
    AND created_by = auth.uid()
  )
);

-- INSERT: técnico só pode gravar com cliente vinculado (ou null); status inicial não pode ser convertida_pedido
DROP POLICY IF EXISTS partner_simulations_insert ON public.partner_simulations;
CREATE POLICY partner_simulations_insert ON public.partner_simulations
FOR INSERT WITH CHECK (
  (
    public.has_role(auth.uid(), 'parceiro_b2b_tecnico'::app_role)
    AND created_by = auth.uid()
    AND partner_id = public.get_user_partner_id()
    AND status <> 'convertida_pedido'
    AND (
      cliente_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.partner_technician_clients ptc
        WHERE ptc.cliente_id = partner_simulations.cliente_id
          AND ptc.technician_user_id = auth.uid()
          AND ptc.partner_id = partner_simulations.partner_id
          AND ptc.active = true
      )
    )
  )
  OR (
    public.has_role(auth.uid(), 'parceiro_b2b'::app_role)
    AND partner_id = public.get_user_partner_id()
  )
  OR public.has_role(auth.uid(), 'administrador'::app_role)
  OR public.has_role(auth.uid(), 'gestor_comercial'::app_role)
);

-- UPDATE: técnico só pode editar próprias simulações não convertidas/arquivadas
DROP POLICY IF EXISTS partner_simulations_update ON public.partner_simulations;
CREATE POLICY partner_simulations_update ON public.partner_simulations
FOR UPDATE USING (
  public.has_role(auth.uid(), 'administrador'::app_role)
  OR public.has_role(auth.uid(), 'gestor_comercial'::app_role)
  OR (
    public.has_role(auth.uid(), 'parceiro_b2b'::app_role)
    AND partner_id = public.get_user_partner_id()
  )
  OR (
    public.has_role(auth.uid(), 'parceiro_b2b_tecnico'::app_role)
    AND created_by = auth.uid()
    AND status IN ('rascunho','enviada_gestor')
  )
) WITH CHECK (
  public.has_role(auth.uid(), 'administrador'::app_role)
  OR public.has_role(auth.uid(), 'gestor_comercial'::app_role)
  OR (
    public.has_role(auth.uid(), 'parceiro_b2b'::app_role)
    AND partner_id = public.get_user_partner_id()
  )
  OR (
    public.has_role(auth.uid(), 'parceiro_b2b_tecnico'::app_role)
    AND created_by = auth.uid()
    AND partner_id = public.get_user_partner_id()
    AND status IN ('rascunho','enviada_gestor')
  )
);

-- Fase 17: estender can_user_access_cliente para B2B
CREATE OR REPLACE FUNCTION public.can_user_access_cliente(_cliente_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_user_id uuid := auth.uid();
    v_is_admin boolean;
    v_is_gestor boolean;
    v_is_adm_sys boolean;
    v_is_financeiro boolean;
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
    v_is_consultor := has_role(v_user_id, 'consultor_tecnico'::app_role);
    v_is_tecnico := has_role(v_user_id, 'tecnico_agronomo'::app_role);
    v_is_cliente := has_role(v_user_id, 'cliente_produtor'::app_role);
    v_is_b2b := has_role(v_user_id, 'parceiro_b2b'::app_role);
    v_is_b2b_tec := has_role(v_user_id, 'parceiro_b2b_tecnico'::app_role);

    IF v_is_admin OR v_is_gestor OR v_is_adm_sys OR v_is_financeiro THEN
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
        );
    END IF;

    RETURN FALSE;
END;
$function$;
