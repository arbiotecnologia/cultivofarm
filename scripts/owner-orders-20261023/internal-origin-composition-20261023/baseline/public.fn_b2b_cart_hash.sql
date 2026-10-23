CREATE OR REPLACE FUNCTION public.fn_b2b_cart_hash(p_partner_id uuid, p_plan_id uuid, p_cart jsonb, p_final numeric)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT encode(sha256(convert_to(
    'v2|' || COALESCE(p_partner_id::text,'-') || '|' || COALESCE(p_plan_id::text,'-') || '|' ||
    to_char(ROUND(COALESCE(p_final,0),2),'FM9999999999990.00') || '|' ||
    COALESCE((
      SELECT string_agg(
        COALESCE(l->>'item_tipo','')      || '~' ||
        COALESCE(l->>'item_id','')        || '~' ||
        COALESCE(l->>'unidade_medida','') || '~' ||
        to_char(ROUND(COALESCE((l->>'volume_ml')::numeric,0),4),'FM9999999999990.0000') || '~' ||
        to_char(ROUND(COALESCE((l->>'quantidade')::numeric,0),4),'FM9999999999990.0000') || '~' ||
        COALESCE(l->>'pricing_mode','')   || '~' ||
        COALESCE(l->>'price_source','')   || '~' ||
        COALESCE(l->>'rule_id','')        || '~' ||
        to_char(ROUND(COALESCE((l->>'final_unit_price')::numeric,0),4),'FM9999999999990.0000') || '~' ||
        to_char(ROUND(COALESCE((l->>'line_final_amount')::numeric,0),2),'FM9999999999990.00'),
        ';' ORDER BY COALESCE(l->>'item_tipo',''),
                     COALESCE(l->>'item_id',''),
                     COALESCE(l->>'unidade_medida',''),
                     COALESCE((l->>'volume_ml')::numeric,0),
                     COALESCE((l->>'quantidade')::numeric,0),
                     COALESCE(l->>'rule_id',''))
      FROM jsonb_array_elements(COALESCE(p_cart->'lines','[]'::jsonb)) l
    ),'') || '|' ||
    COALESCE((p_cart->>'quote_required'),'false')
  ,'UTF8')),'hex')
$function$
