
-- 1) Expand can_user_access_cliente to include 'financeiro' in broad-access roles
CREATE OR REPLACE FUNCTION public.can_user_access_cliente(_cliente_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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

    -- 1. Acesso amplo: administração, gestão e financeiro (leitura global p/ faturamento, AR/AP, NF-e)
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

    RETURN FALSE;
END;
$function$;

-- 2) SELECT policies for financeiro on operational tables
CREATE POLICY "Financeiro read entregas"
ON public.entregas FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'financeiro'::app_role));

CREATE POLICY "Financeiro read ordens_servico"
ON public.ordens_servico FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'financeiro'::app_role));

CREATE POLICY "Financeiro read ordens_servico_onfarm"
ON public.ordens_servico_onfarm FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'financeiro'::app_role));

CREATE POLICY "Financeiro read aplicacoes"
ON public.aplicacoes FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'financeiro'::app_role));

CREATE POLICY "Financeiro read lotes"
ON public.lotes FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'financeiro'::app_role));

CREATE POLICY "Financeiro read partner_orders"
ON public.partner_orders FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'financeiro'::app_role));
