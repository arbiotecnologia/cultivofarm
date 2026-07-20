
ALTER TABLE public.partner_users
  ADD COLUMN IF NOT EXISTS papel text NOT NULL DEFAULT 'gestor'
  CHECK (papel IN ('gestor','tecnico'));

CREATE OR REPLACE FUNCTION public.get_partner_papel(_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT papel FROM public.partner_users WHERE user_id = _user_id LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.get_partner_papel(uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.link_partner_user(uuid, uuid);
CREATE OR REPLACE FUNCTION public.link_partner_user(
  p_partner_id uuid,
  p_user_id uuid,
  p_papel text DEFAULT 'gestor'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;
GRANT EXECUTE ON FUNCTION public.link_partner_user(uuid, uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_partner_user_papel(
  p_link_id uuid,
  p_papel text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_role public.app_role;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'administrador') OR public.has_role(auth.uid(), 'gestor_comercial')) THEN
    RAISE EXCEPTION 'Permissão negada';
  END IF;
  IF p_papel NOT IN ('gestor','tecnico') THEN
    RAISE EXCEPTION 'Papel inválido: %', p_papel;
  END IF;

  UPDATE public.partner_users SET papel = p_papel WHERE id = p_link_id
    RETURNING user_id INTO v_user_id;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Vínculo não encontrado';
  END IF;

  v_role := CASE WHEN p_papel = 'tecnico' THEN 'parceiro_b2b_tecnico'::public.app_role
                 ELSE 'parceiro_b2b'::public.app_role END;

  DELETE FROM public.user_roles
   WHERE user_id = v_user_id
     AND role IN ('parceiro_b2b'::public.app_role, 'parceiro_b2b_tecnico'::public.app_role);

  INSERT INTO public.user_roles(user_id, role)
  VALUES (v_user_id, v_role)
  ON CONFLICT (user_id, role) DO NOTHING;
END;
$$;
GRANT EXECUTE ON FUNCTION public.set_partner_user_papel(uuid, text) TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='product_technical_profiles' AND policyname='product_tech_profiles_b2b_read') THEN
    EXECUTE 'CREATE POLICY product_tech_profiles_b2b_read ON public.product_technical_profiles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), ''parceiro_b2b''::public.app_role) OR public.has_role(auth.uid(), ''parceiro_b2b_tecnico''::public.app_role))';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='microorganism_technical_profiles' AND policyname='micro_tech_profiles_b2b_read') THEN
    EXECUTE 'CREATE POLICY micro_tech_profiles_b2b_read ON public.microorganism_technical_profiles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), ''parceiro_b2b''::public.app_role) OR public.has_role(auth.uid(), ''parceiro_b2b_tecnico''::public.app_role))';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='produtos' AND policyname='produtos_b2b_read') THEN
    EXECUTE 'CREATE POLICY produtos_b2b_read ON public.produtos FOR SELECT TO authenticated USING (public.has_role(auth.uid(), ''parceiro_b2b''::public.app_role) OR public.has_role(auth.uid(), ''parceiro_b2b_tecnico''::public.app_role))';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='microrganismos' AND policyname='micros_b2b_read') THEN
    EXECUTE 'CREATE POLICY micros_b2b_read ON public.microrganismos FOR SELECT TO authenticated USING (public.has_role(auth.uid(), ''parceiro_b2b''::public.app_role) OR public.has_role(auth.uid(), ''parceiro_b2b_tecnico''::public.app_role))';
  END IF;
END $$;
