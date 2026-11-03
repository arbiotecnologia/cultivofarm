CREATE OR REPLACE FUNCTION public.update_product_b2b_description(p_profile_id uuid, p_explicacao_b2b text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_b2b boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF NOT (
    has_role(v_uid, 'administrador'::app_role)
    OR has_role(v_uid, 'gestor'::app_role)
    OR has_role(v_uid, 'gestor_comercial'::app_role)
  ) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  IF has_role(v_uid, 'gestor_comercial'::app_role)
     AND NOT (has_role(v_uid, 'administrador'::app_role) OR has_role(v_uid, 'gestor'::app_role)) THEN
    SELECT p.b2b_enabled INTO v_b2b
    FROM public.product_technical_profiles tp
    JOIN public.produtos p ON p.id = tp.produto_id
    WHERE tp.id = p_profile_id;
    IF NOT COALESCE(v_b2b, false) THEN
      RAISE EXCEPTION 'produto não habilitado para B2B';
    END IF;
  END IF;

  UPDATE public.product_technical_profiles
  SET explicacao_b2b = p_explicacao_b2b,
      updated_by = v_uid,
      updated_at = now()
  WHERE id = p_profile_id;
END;
$function$
