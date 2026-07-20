-- 1. Melhorar get_cliente_ids_for_user para ser mais abrangente
CREATE OR REPLACE FUNCTION public.get_cliente_ids_for_user(_user_id uuid)
 RETURNS uuid[]
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path = public
AS $function$
  SELECT ARRAY(
    SELECT cliente_id FROM public.user_clientes WHERE user_id = _user_id
    UNION
    SELECT cliente_id FROM public.profiles WHERE user_id = _user_id AND cliente_id IS NOT NULL
  );
$function$;

-- 2. Melhorar can_user_access_cliente para ser mais explícita e robusta
CREATE OR REPLACE FUNCTION public.can_user_access_cliente(_cliente_id uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path = public
AS $function$
  SELECT (
    has_role(auth.uid(), 'administrador'::app_role)
    OR has_role(auth.uid(), 'gestor'::app_role)
    OR has_role(auth.uid(), 'administrativo'::app_role)
    OR has_role(auth.uid(), 'consultor_tecnico'::app_role)
    OR has_role(auth.uid(), 'tecnico_agronomo'::app_role)
    OR has_role(auth.uid(), 'cliente_produtor'::app_role) -- Garantir que o papel de cliente_produtor seja considerado
    OR _cliente_id = ANY(get_cliente_ids_for_user(auth.uid()))
  );
$function$;

-- 3. Garantir que can_user_access_fazenda esteja correta
CREATE OR REPLACE FUNCTION public.can_user_access_fazenda(_fazenda_id uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path = public
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.fazendas f
    WHERE f.id = _fazenda_id
    AND can_user_access_cliente(f.cliente_id)
  );
$function$;
