
-- Trigger: ensure cliente_produtor role always has cliente_id
CREATE OR REPLACE FUNCTION public.enforce_cliente_id_for_produtor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cliente_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'user_roles' AND NEW.role = 'cliente_produtor' THEN
    SELECT cliente_id INTO v_cliente_id FROM public.profiles WHERE user_id = NEW.user_id LIMIT 1;
    IF v_cliente_id IS NULL THEN
      RAISE EXCEPTION 'Para a função "Produtor (Portal)" é obrigatório vincular o usuário a um cliente.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'profiles' THEN
    IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = NEW.user_id AND role = 'cliente_produtor')
       AND NEW.cliente_id IS NULL THEN
      RAISE EXCEPTION 'Este usuário é Produtor (Portal); o cliente vinculado não pode ficar vazio.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_roles_enforce_cliente ON public.user_roles;
CREATE TRIGGER trg_user_roles_enforce_cliente
  BEFORE INSERT OR UPDATE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_cliente_id_for_produtor();

DROP TRIGGER IF EXISTS trg_profiles_enforce_cliente ON public.profiles;
CREATE TRIGGER trg_profiles_enforce_cliente
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_cliente_id_for_produtor();
