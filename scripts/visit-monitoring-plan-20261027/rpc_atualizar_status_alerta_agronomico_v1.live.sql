CREATE OR REPLACE FUNCTION public.rpc_atualizar_status_alerta_agronomico_v1(p_alerta_id uuid, p_novo_status status_alerta, p_updated_at_esperado timestamp with time zone)
 RETURNS alertas_agronomicos
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_alerta public.alertas_agronomicos;
begin
  if not public.technical_actor_ready(auth.uid()) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if not (
    public.has_role(auth.uid(), 'administrador'::public.app_role)
    or public.has_role(auth.uid(), 'gestor'::public.app_role)
  ) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if p_alerta_id is null or p_novo_status is null or p_updated_at_esperado is null then
    raise exception 'INVALID_INPUT';
  end if;

  perform 1 from cf_user_guards_v1.state where singleton for update;
  if not found then raise exception 'monitoring_gate_unavailable' using errcode='55000'; end if;
  if not public.technical_actor_ready(auth.uid()) or not (
    public.has_role(auth.uid(),'administrador'::public.app_role)
    or public.has_role(auth.uid(),'gestor'::public.app_role)
  ) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  select * into v_alerta
  from public.alertas_agronomicos a
  where a.id = p_alerta_id and platform_private.monitoring_refs_in_actor_tenant(a.fazenda_id,a.talhao_id,a.registro_origem_id)
  for update;
  if not found then raise exception 'monitoring_alert_not_found' using errcode='PT404'; end if;
  if not public.technical_actor_ready(auth.uid()) or not (
    public.has_role(auth.uid(),'administrador'::public.app_role)
    or public.has_role(auth.uid(),'gestor'::public.app_role)
  ) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if v_alerta.updated_at IS DISTINCT FROM p_updated_at_esperado then raise exception 'CONCURRENT_UPDATE' using errcode='PT409'; end if;
  if v_alerta.status = 'encerrado'::public.status_alerta and p_novo_status <> v_alerta.status then
    raise exception 'CLOSED_ALERT';
  end if;

  update public.alertas_agronomicos a
  set status = p_novo_status, updated_at = greatest(clock_timestamp(),v_alerta.updated_at+interval '1 microsecond')
  where a.id = p_alerta_id and a.updated_at=p_updated_at_esperado and platform_private.monitoring_refs_in_actor_tenant(a.fazenda_id,a.talhao_id,a.registro_origem_id)
  returning * into v_alerta;
  if not found then raise exception 'CONCURRENT_UPDATE' using errcode='PT409'; end if;
  return v_alerta;
end;
$function$
