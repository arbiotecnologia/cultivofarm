CREATE OR REPLACE FUNCTION public.rpc_b2b_integrity_check()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v jsonb;
begin
  if not public.has_role(auth.uid(), 'administrador'::public.app_role)
     and not public.has_role(auth.uid(), 'gestor'::public.app_role) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'pedido_sem_parceiro',
      (select count(*) from public.partner_orders po
       where not exists (select 1 from public.partner_accounts pa where pa.id = po.partner_id)),
    'planejamento_sem_pedido',
      (select count(*) from public.production_planning pp
       where not exists (select 1 from public.partner_orders po where po.id = pp.partner_order_id)),
    'os_sem_planejamento',
      (select count(*) from public.ordens_servico os
       where os.origem = 'b2b' and os.partner_order_id is not null
         and not exists (select 1 from public.production_order_link pol where pol.ordem_servico_id = os.id)),
    'timeline_orfa',
      (select count(*) from public.production_timeline_events ev
       where not exists (select 1 from public.partner_orders po where po.id = ev.partner_order_id)),
    'os_orfa_b2b',
      (select count(*) from public.ordens_servico os
       where os.origem = 'b2b' and (os.partner_order_id is null or os.partner_order_item_id is null)),
    'itens_sem_produto',
      (select count(*) from public.partner_order_items poi
       where not exists (select 1 from public.produtos p where p.id = poi.product_id)),
    'links_invalidos',
      (select count(*) from public.production_order_link pol
       where not exists (select 1 from public.ordens_servico os where os.id = pol.ordem_servico_id))
  ) into v;
  return v;
end;
$function$
