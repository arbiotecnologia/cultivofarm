CREATE OR REPLACE FUNCTION public.rpc_reprogramar_monitoramento_v1(p_alerta_id uuid, p_nova_data date, p_expected_updated_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
;
