
CREATE OR REPLACE FUNCTION public.validate_responsavel_producao()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_ok boolean;
BEGIN
  IF NEW.responsavel_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT user_id INTO v_user_id
  FROM public.profiles
  WHERE id = NEW.responsavel_id;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Responsável inválido: perfil não encontrado'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = v_user_id
      AND role::text IN ('administrador','gestor','operador_onfarm','producao')
  ) INTO v_ok;

  IF NOT v_ok THEN
    RAISE EXCEPTION 'Responsável inválido: perfil sem permissão para produção do laboratório'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_responsavel_producao ON public.programacao_producao;
CREATE TRIGGER trg_validate_responsavel_producao
  BEFORE INSERT OR UPDATE OF responsavel_id ON public.programacao_producao
  FOR EACH ROW EXECUTE FUNCTION public.validate_responsavel_producao();
