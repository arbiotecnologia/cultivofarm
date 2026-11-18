CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (user_id, nome, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'nome', ''), NEW.email);

  -- Segurança: auto-cadastro NÃO recebe nenhum papel.
  -- O usuário permanece com privilégio mínimo (sem papel -> /acesso-pendente)
  -- até que um administrador atribua explicitamente o perfil adequado.
  -- Usuários criados por admin recebem papéis na própria rotina administrativa.

  RETURN NEW;
END;
$function$
