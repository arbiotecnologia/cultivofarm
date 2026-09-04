CREATE OR REPLACE FUNCTION public.check_fazenda_dependencies(_fazenda_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'talhoes',               (SELECT count(*) FROM talhoes WHERE fazenda_id = _fazenda_id),
    'ordens_servico',        (SELECT count(*) FROM ordens_servico WHERE fazenda_id = _fazenda_id),
    'ordens_servico_onfarm', (SELECT count(*) FROM ordens_servico_onfarm WHERE fazenda_id = _fazenda_id),
    'registros_consultor',   (SELECT count(*) FROM registros_consultor WHERE fazenda_id = _fazenda_id),
    'portal_solicitacoes',   (SELECT count(*) FROM portal_solicitacoes WHERE fazenda_id = _fazenda_id),
    'alertas_agronomicos',   (SELECT count(*) FROM alertas_agronomicos WHERE fazenda_id = _fazenda_id),
    'clima_dados',           (SELECT count(*) FROM clima_dados WHERE fazenda_id = _fazenda_id)
  )
$function$

--ACL: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
--OWNER: postgres

