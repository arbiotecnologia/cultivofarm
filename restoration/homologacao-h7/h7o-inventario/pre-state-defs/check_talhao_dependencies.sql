CREATE OR REPLACE FUNCTION public.check_talhao_dependencies(_talhao_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'ordens_servico',        (SELECT count(*) FROM ordens_servico WHERE talhao_id = _talhao_id),
    'ordens_servico_onfarm', (SELECT count(*) FROM ordens_servico_onfarm WHERE talhao_id = _talhao_id),
    'registros_consultor',   (SELECT count(*) FROM registros_consultor WHERE talhao_id = _talhao_id),
    'portal_solicitacoes',   (SELECT count(*) FROM portal_solicitacoes WHERE talhao_id = _talhao_id),
    'alertas_agronomicos',   (SELECT count(*) FROM alertas_agronomicos WHERE talhao_id = _talhao_id)
  )
$function$

--ACL: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
--OWNER: postgres

