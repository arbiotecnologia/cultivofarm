CREATE OR REPLACE FUNCTION platform_private.lab_assert_manufacturable(p_product_id uuid, p_microorganism_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT platform_private.lab_item_is_manufacturable(p_product_id,p_microorganism_id) THEN
    RAISE EXCEPTION 'LAB_ITEM_NOT_MANUFACTURABLE' USING ERRCODE='23514',
      HINT='Somente produtos biológicos e microrganismos podem gerar fabricação laboratorial.';
  END IF;
END $function$
