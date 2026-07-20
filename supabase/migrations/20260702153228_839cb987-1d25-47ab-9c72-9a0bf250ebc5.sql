
CREATE OR REPLACE FUNCTION public.get_b2b_user_client_simulations_secure(p_cliente_id uuid)
RETURNS TABLE (
  id uuid,
  titulo text,
  status text,
  total_cheio numeric,
  created_at timestamptz,
  created_by uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_partner uuid;
  v_is_admin boolean := has_role(v_uid,'administrador'::app_role) OR has_role(v_uid,'gestor_comercial'::app_role);
  v_is_gest boolean := has_role(v_uid,'parceiro_b2b'::app_role);
  v_is_tec boolean := has_role(v_uid,'parceiro_b2b_tecnico'::app_role);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT (v_is_admin OR v_is_gest OR v_is_tec) THEN RAISE EXCEPTION 'access denied'; END IF;

  IF v_is_admin THEN
    RETURN QUERY
      SELECT s.id, s.titulo, s.status::text, s.total_cheio, s.created_at, s.created_by
      FROM public.partner_simulations s
      WHERE s.cliente_id = p_cliente_id
      ORDER BY s.created_at DESC
      LIMIT 100;
    RETURN;
  END IF;

  v_partner := public.get_user_partner_id();
  IF v_partner IS NULL THEN RAISE EXCEPTION 'partner nao identificado'; END IF;

  -- Cliente precisa estar vinculado ao usuário
  IF NOT EXISTS (
    SELECT 1 FROM public.partner_user_clients
    WHERE partner_id = v_partner
      AND cliente_id = p_cliente_id
      AND user_id = v_uid
      AND active = true
  ) THEN
    RAISE EXCEPTION 'cliente nao vinculado';
  END IF;

  IF v_is_tec THEN
    RETURN QUERY
      SELECT s.id, s.titulo, s.status::text, s.total_cheio, s.created_at, s.created_by
      FROM public.partner_simulations s
      WHERE s.cliente_id = p_cliente_id
        AND s.partner_id = v_partner
        AND s.created_by = v_uid
      ORDER BY s.created_at DESC
      LIMIT 100;
  ELSE
    RETURN QUERY
      SELECT s.id, s.titulo, s.status::text, s.total_cheio, s.created_at, s.created_by
      FROM public.partner_simulations s
      WHERE s.cliente_id = p_cliente_id
        AND s.partner_id = v_partner
      ORDER BY s.created_at DESC
      LIMIT 100;
  END IF;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_b2b_user_client_simulations_secure(uuid) TO authenticated;
