-- Adiciona coluna ativo se não existir (garantia)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS ativo BOOLEAN DEFAULT true;

-- Atualiza a função de trigger para ser mais inteligente
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (user_id, nome, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'nome', ''), NEW.email);
  
  -- Só atribui role default se NÃO for criado via admin-tool (metadata customizado)
  IF COALESCE(NEW.raw_user_meta_data->>'created_by_admin', 'false') = 'false' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'administrativo');
  END IF;
  
  RETURN NEW;
END;
$function$;