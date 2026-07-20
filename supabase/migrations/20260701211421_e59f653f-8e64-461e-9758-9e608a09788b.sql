CREATE OR REPLACE FUNCTION public.link_partner_user(p_partner_id uuid, p_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'administrador') OR public.has_role(auth.uid(), 'gestor_comercial')) THEN
    RAISE EXCEPTION 'Permissão negada';
  END IF;

  INSERT INTO public.partner_users(partner_id, user_id)
  VALUES (p_partner_id, p_user_id)
  RETURNING id INTO v_id;

  INSERT INTO public.user_roles(user_id, role)
  VALUES (p_user_id, 'parceiro_b2b')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.link_partner_user(uuid, uuid) TO authenticated;