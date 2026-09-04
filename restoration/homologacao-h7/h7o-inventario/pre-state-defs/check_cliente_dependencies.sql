CREATE OR REPLACE FUNCTION public.check_cliente_dependencies(_cliente_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'fazendas',              (SELECT count(*) FROM fazendas WHERE cliente_id = _cliente_id),
    'talhoes',               (SELECT count(*) FROM talhoes t JOIN fazendas f ON f.id = t.fazenda_id WHERE f.cliente_id = _cliente_id),
    'ordens_servico',        (SELECT count(*) FROM ordens_servico WHERE cliente_id = _cliente_id),
    'ordens_servico_onfarm', (SELECT count(*) FROM ordens_servico_onfarm WHERE cliente_id = _cliente_id),
    'registros_consultor',   (SELECT count(*) FROM registros_consultor WHERE cliente_id = _cliente_id),
    'portal_solicitacoes',   (SELECT count(*) FROM portal_solicitacoes WHERE cliente_id = _cliente_id),
    'entregas',              (SELECT count(*) FROM entregas WHERE cliente_id = _cliente_id),
    'usuarios',              (SELECT count(*) FROM profiles WHERE cliente_id = _cliente_id)
  )
$function$

--ACL: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
--OWNER: postgres

