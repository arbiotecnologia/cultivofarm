CREATE FUNCTION platform_private.entrega_termo_tenant_ok(p_entrega_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT p_entrega_id IS NOT NULL AND EXISTS (
    SELECT 1
      FROM public.entregas e
      JOIN public.clientes c ON c.id = e.cliente_id
     WHERE e.id = p_entrega_id
       AND e.organization_id IS NOT NULL
       AND c.organization_id = e.organization_id
       AND e.organization_id = platform_private.h15_actor_organization());
$function$
