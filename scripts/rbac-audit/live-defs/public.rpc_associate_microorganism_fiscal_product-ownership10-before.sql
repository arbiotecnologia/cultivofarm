CREATE OR REPLACE FUNCTION public.rpc_associate_microorganism_fiscal_product(p_microorganism_id uuid, p_product_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, product_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;

  IF NOT (
    public.has_role(v_uid, 'administrador'::public.app_role)
    OR public.has_role(v_uid, 'financeiro'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;

  IF p_microorganism_id IS NULL THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.microrganismos m WHERE m.id = p_microorganism_id) THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;

  IF p_product_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.produtos p WHERE p.id = p_product_id) THEN
      RAISE EXCEPTION 'product_not_found' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  RETURN QUERY
  UPDATE public.microrganismos m
     SET product_id = p_product_id
   WHERE m.id = p_microorganism_id
  RETURNING m.id, m.product_id;
END;
$function$;
