CREATE OR REPLACE FUNCTION public.link_partner_user(p_partner_id uuid, p_user_id uuid, p_papel text DEFAULT 'gestor'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_role public.app_role;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'administrador') OR public.has_role(auth.uid(), 'gestor_comercial')) THEN
    RAISE EXCEPTION 'Permissão negada';
  END IF;
  IF p_papel NOT IN ('gestor','tecnico') THEN
    RAISE EXCEPTION 'Papel inválido: %', p_papel;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = p_user_id
      AND role IN ('parceiro_b2b'::public.app_role, 'parceiro_b2b_tecnico'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Usuário não possui perfil Parceiro B2B ou Técnico B2B. Ajuste o perfil em Configurações → Usuários antes de vincular.';
  END IF;

  v_role := CASE WHEN p_papel = 'tecnico' THEN 'parceiro_b2b_tecnico'::public.app_role
                 ELSE 'parceiro_b2b'::public.app_role END;

  INSERT INTO public.partner_users(partner_id, user_id, papel)
  VALUES (p_partner_id, p_user_id, p_papel)
  RETURNING id INTO v_id;

  DELETE FROM public.user_roles
   WHERE user_id = p_user_id
     AND role IN ('parceiro_b2b'::public.app_role, 'parceiro_b2b_tecnico'::public.app_role);

  INSERT INTO public.user_roles(user_id, role)
  VALUES (p_user_id, v_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN v_id;
END;
$function$;