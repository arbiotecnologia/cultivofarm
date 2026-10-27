CREATE OR REPLACE FUNCTION public.rpc_criar_alerta_climatico_v1(p_fazenda_id uuid, p_talhao_id uuid, p_tipo_alerta tipo_alerta, p_nivel_risco nivel_risco, p_descricao text)
 RETURNS TABLE(id uuid, criado boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
;
