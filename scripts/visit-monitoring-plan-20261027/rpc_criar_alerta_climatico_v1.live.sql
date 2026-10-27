CREATE OR REPLACE FUNCTION public.rpc_criar_alerta_climatico_v1(p_fazenda_id uuid, p_talhao_id uuid, p_tipo_alerta tipo_alerta, p_nivel_risco nivel_risco, p_descricao text)
 RETURNS TABLE(id uuid, criado boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id uuid;
begin
  if not public.technical_actor_ready(auth.uid()) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if not (
    public.has_role(auth.uid(), 'administrador'::public.app_role)
    or public.has_role(auth.uid(), 'gestor'::public.app_role)
  ) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if p_tipo_alerta is null or p_nivel_risco is null or p_fazenda_id is null or p_talhao_id is null or nullif(btrim(p_descricao), '') is null then
    raise exception 'INVALID_INPUT';
  end if;
  if length(p_descricao) > 2000 then raise exception 'DESCRIPTION_TOO_LONG'; end if;
  if not public.technical_actor_ready(auth.uid()) or not (
    public.has_role(auth.uid(), 'administrador'::public.app_role)
    or public.has_role(auth.uid(), 'gestor'::public.app_role)
  ) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if not platform_private.monitoring_refs_in_actor_tenant(p_fazenda_id,p_talhao_id,null) then
    raise exception 'monitoring_reference_not_found' using errcode='PT404';
  end if;
  perform 1 from cf_user_guards_v1.state where singleton for update;
  if not found then raise exception 'monitoring_gate_unavailable' using errcode='55000'; end if;
  if not public.technical_actor_ready(auth.uid()) or not (
    public.has_role(auth.uid(), 'administrador'::public.app_role)
    or public.has_role(auth.uid(), 'gestor'::public.app_role)
  ) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if not platform_private.monitoring_refs_in_actor_tenant(p_fazenda_id,p_talhao_id,null) then
    raise exception 'monitoring_reference_not_found' using errcode='PT404';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    p_fazenda_id::text || ':' || p_talhao_id::text || ':' || p_tipo_alerta::text, 0
  ));

  if not public.technical_actor_ready(auth.uid()) or not (
    public.has_role(auth.uid(), 'administrador'::public.app_role)
    or public.has_role(auth.uid(), 'gestor'::public.app_role)
  ) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if not platform_private.monitoring_refs_in_actor_tenant(p_fazenda_id,p_talhao_id,null) then
    raise exception 'monitoring_reference_not_found' using errcode='PT404';
  end if;

  select a.id into v_id
  from public.alertas_agronomicos a
  where a.fazenda_id = p_fazenda_id
    and a.talhao_id = p_talhao_id
    and a.tipo_alerta = p_tipo_alerta
    and platform_private.monitoring_refs_in_actor_tenant(a.fazenda_id,a.talhao_id,a.registro_origem_id)
    and a.status <> 'encerrado'::public.status_alerta
  order by a.created_at desc
  limit 1;

  if v_id is not null then
    return query select v_id, false;
    return;
  end if;

  insert into public.alertas_agronomicos (
    fazenda_id, talhao_id, tipo_alerta, nivel_risco, descricao
  ) values (
    p_fazenda_id, p_talhao_id, p_tipo_alerta, p_nivel_risco, btrim(p_descricao)
  ) returning alertas_agronomicos.id into v_id;

  return query select v_id, true;
end;
$function$
