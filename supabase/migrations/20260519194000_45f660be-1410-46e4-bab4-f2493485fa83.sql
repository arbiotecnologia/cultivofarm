CREATE OR REPLACE FUNCTION public.enforce_cliente_id_for_produtor()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user uuid;
  v_role app_role;
  v_count int;
BEGIN
  -- Lógica específica para a tabela user_roles
  IF TG_TABLE_NAME = 'user_roles' THEN
    -- Aqui o record NEW possui o campo 'role'
    IF NEW.role = 'cliente_produtor' THEN
      SELECT count(*) INTO v_count
        FROM public.user_clientes WHERE user_id = NEW.user_id;
      IF v_count = 0 THEN
        RAISE EXCEPTION 'Para a função "Produtor (Portal)" é obrigatório vincular o usuário a pelo menos um cliente.'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  -- Lógica específica para a tabela user_clientes (que não possui campo 'role')
  IF TG_TABLE_NAME = 'user_clientes' THEN
    v_user := COALESCE(NEW.user_id, OLD.user_id);
    
    -- Verifica se o usuário tem a role de produtor
    SELECT role INTO v_role FROM public.user_roles
      WHERE user_id = v_user AND role = 'cliente_produtor' LIMIT 1;
      
    IF v_role IS NOT NULL THEN
      -- Conta quantos vínculos restariam após a operação
      IF TG_OP = 'DELETE' THEN
        SELECT count(*) INTO v_count FROM public.user_clientes
          WHERE user_id = v_user AND id <> OLD.id;
      ELSE
        SELECT count(*) INTO v_count FROM public.user_clientes
          WHERE user_id = v_user;
      END IF;

      IF v_count = 0 THEN
        RAISE EXCEPTION 'Este usuário é Produtor e precisa permanecer vinculado a pelo menos um cliente.'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    RETURN COALESCE(NEW, OLD);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;$$;