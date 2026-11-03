CREATE OR REPLACE FUNCTION public.platform_set_global_product_composition(p_produto_id uuid, p_expected_updated_at timestamp with time zone, p_status text, p_itens jsonb, p_reason text, p_idempotency_key uuid)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$ SELECT platform_private.set_global_product_composition_core(p_produto_id,p_expected_updated_at,p_status,p_itens,p_reason,p_idempotency_key) $function$
