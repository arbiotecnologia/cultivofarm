
-- 1) Ajustar RPC: gestor B2B não cria mais partner_clients automaticamente
CREATE OR REPLACE FUNCTION public.assign_b2b_user_client_secure(
  p_user_id uuid,
  p_cliente_id uuid,
  p_assignment_type text DEFAULT 'monitoramento',
  p_can_create_simulation boolean DEFAULT true,
  p_can_monitor boolean DEFAULT true,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_partner uuid;
  v_id uuid;
  v_is_gest boolean := has_role(v_uid, 'parceiro_b2b'::app_role);
  v_is_admin boolean := has_role(v_uid, 'administrador'::app_role) OR has_role(v_uid, 'gestor_comercial'::app_role);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF has_role(v_uid,'parceiro_b2b_tecnico'::app_role) THEN RAISE EXCEPTION 'access denied'; END IF;
  IF NOT (v_is_gest OR v_is_admin) THEN RAISE EXCEPTION 'access denied'; END IF;

  IF v_is_gest AND NOT v_is_admin THEN
    v_partner := get_user_partner_id();
  ELSE
    SELECT partner_id INTO v_partner FROM public.partner_users WHERE user_id = p_user_id LIMIT 1;
  END IF;

  IF v_partner IS NULL THEN RAISE EXCEPTION 'partner nao identificado'; END IF;

  IF v_is_admin THEN
    -- Admin/gestor comercial pode liberar cliente ao parceiro
    INSERT INTO public.partner_clients (partner_id, cliente_id, assigned_by, active)
    VALUES (v_partner, p_cliente_id, v_uid, true)
    ON CONFLICT (partner_id, cliente_id) DO UPDATE SET active = true, updated_at = now();
  ELSE
    -- Gestor B2B: exige liberação prévia
    IF NOT EXISTS (
      SELECT 1 FROM public.partner_clients
      WHERE partner_id = v_partner
        AND cliente_id = p_cliente_id
        AND active = true
    ) THEN
      RAISE EXCEPTION 'Cliente não está liberado para este parceiro. Solicite ao administrador AR Bio.';
    END IF;
  END IF;

  INSERT INTO public.partner_user_clients
    (partner_id, user_id, cliente_id, assignment_type, can_create_simulation, can_monitor, notes, assigned_by, active)
  VALUES
    (v_partner, p_user_id, p_cliente_id, p_assignment_type, p_can_create_simulation, p_can_monitor, p_notes, v_uid, true)
  ON CONFLICT (partner_id, user_id, cliente_id) DO UPDATE
    SET assignment_type = EXCLUDED.assignment_type,
        can_create_simulation = EXCLUDED.can_create_simulation,
        can_monitor = EXCLUDED.can_monitor,
        notes = EXCLUDED.notes,
        active = true,
        updated_at = now()
  RETURNING id INTO v_id;

  INSERT INTO public.partner_catalog_access_logs(user_id, role, action, partner_id, cliente_id, target_user_id, details)
  VALUES (v_uid, (SELECT role::text FROM public.user_roles WHERE user_id = v_uid LIMIT 1),
          'b2b_user_client_assigned', v_partner, p_cliente_id, p_user_id,
          jsonb_build_object('assignment_type', p_assignment_type));

  RETURN v_id;
END;
$function$;

-- 2) Refazer RLS de partner_clients
DROP POLICY IF EXISTS pc_select ON public.partner_clients;
DROP POLICY IF EXISTS pc_insert ON public.partner_clients;
DROP POLICY IF EXISTS pc_update ON public.partner_clients;

-- SELECT: admin/gestor_comercial livre; gestor B2B vê seu parceiro; técnico só vê os que tem vínculo ativo em PUC
CREATE POLICY pc_select ON public.partner_clients
FOR SELECT
USING (
  has_role(auth.uid(), 'administrador'::app_role)
  OR has_role(auth.uid(), 'gestor_comercial'::app_role)
  OR (
    has_role(auth.uid(), 'parceiro_b2b'::app_role)
    AND partner_id = get_user_partner_id()
  )
  OR (
    has_role(auth.uid(), 'parceiro_b2b_tecnico'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.partner_user_clients puc
      WHERE puc.partner_id = partner_clients.partner_id
        AND puc.cliente_id = partner_clients.cliente_id
        AND puc.user_id = auth.uid()
        AND puc.active = true
    )
  )
);

-- INSERT: apenas administrador / gestor_comercial
CREATE POLICY pc_insert ON public.partner_clients
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'administrador'::app_role)
  OR has_role(auth.uid(), 'gestor_comercial'::app_role)
);

-- UPDATE: apenas administrador / gestor_comercial
CREATE POLICY pc_update ON public.partner_clients
FOR UPDATE
USING (
  has_role(auth.uid(), 'administrador'::app_role)
  OR has_role(auth.uid(), 'gestor_comercial'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'administrador'::app_role)
  OR has_role(auth.uid(), 'gestor_comercial'::app_role)
);
