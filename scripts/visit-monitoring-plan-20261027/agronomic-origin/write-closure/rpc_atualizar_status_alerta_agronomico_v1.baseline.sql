CREATE OR REPLACE FUNCTION public.rpc_atualizar_status_alerta_agronomico_v1(p_alerta_id uuid, p_novo_status status_alerta, p_updated_at_esperado timestamp with time zone)
 RETURNS alertas_agronomicos
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
;
