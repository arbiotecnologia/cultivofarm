do $$
begin
  if current_database() is null then raise exception 'database unavailable'; end if;
end $$;

-- Remove legacy role-only management policies and recreate them at least privilege.
drop policy if exists "Staff manage clients" on public.clientes;
drop policy if exists "GestorComercial manage clients" on public.clientes;
create policy "Tenant writers manage clients"
on public.clientes for all to authenticated
using (
  organization_id = public.h15_actor_organization()
  and (
    public.has_role(auth.uid(), 'administrador'::public.app_role)
    or public.has_role(auth.uid(), 'gestor'::public.app_role)
    or public.has_role(auth.uid(), 'gestor_comercial'::public.app_role)
  )
)
with check (
  organization_id = public.h15_actor_organization()
  and (
    public.has_role(auth.uid(), 'administrador'::public.app_role)
    or public.has_role(auth.uid(), 'gestor'::public.app_role)
    or public.has_role(auth.uid(), 'gestor_comercial'::public.app_role)
  )
);

drop policy if exists "Staff manage farms" on public.fazendas;
create policy "Tenant writers manage farms"
on public.fazendas for all to authenticated
using (
  organization_id = public.h15_actor_organization()
  and (public.has_role(auth.uid(), 'administrador'::public.app_role) or public.has_role(auth.uid(), 'gestor'::public.app_role))
)
with check (
  organization_id = public.h15_actor_organization()
  and (public.has_role(auth.uid(), 'administrador'::public.app_role) or public.has_role(auth.uid(), 'gestor'::public.app_role))
);

drop policy if exists "Staff manage plots" on public.talhoes;
create policy "Tenant writers manage plots"
on public.talhoes for all to authenticated
using (
  organization_id = public.h15_actor_organization()
  and (public.has_role(auth.uid(), 'administrador'::public.app_role) or public.has_role(auth.uid(), 'gestor'::public.app_role))
)
with check (
  organization_id = public.h15_actor_organization()
  and (public.has_role(auth.uid(), 'administrador'::public.app_role) or public.has_role(auth.uid(), 'gestor'::public.app_role))
);

-- Production is read-only on service orders according to ACCESS_MAP.
drop policy if exists "Producao update ordens_servico" on public.ordens_servico;

-- Remove historic authenticated=true policies if they survived older migrations.
drop policy if exists "Authenticated users can read lotes" on public.lotes;
drop policy if exists "Authenticated users can insert lotes" on public.lotes;
drop policy if exists "Authenticated users can update lotes" on public.lotes;
drop policy if exists "Authenticated users can read envase" on public.envase;
drop policy if exists "Authenticated users can insert envase" on public.envase;
drop policy if exists "Authenticated users can read cq" on public.controle_qualidade;
drop policy if exists "Authenticated users can insert cq" on public.controle_qualidade;
drop policy if exists "Authenticated users can update cq" on public.controle_qualidade;

-- SECURITY DEFINER production mutations and context lookup are fail-closed until every
-- resource lookup is bound to the active tenant inside the function itself.
revoke execute on function public.rpc_programar_os_v1(uuid,text,date) from public, anon, authenticated;
revoke execute on function public.rpc_cockpit_gerar_lote_v1(uuid,uuid,text,jsonb) from public, anon, authenticated;
revoke execute on function public.rpc_cockpit_registrar_envase_v1(uuid,uuid,text,uuid,jsonb,date,text,text,boolean,text) from public, anon, authenticated;
revoke execute on function public.rpc_avancar_esteira_laboratorio(uuid,text,text,uuid) from public, anon, authenticated;
revoke execute on function public.fn_cockpit_ctx_programacao(uuid) from public, anon, authenticated;

-- The listing endpoint must never be callable anonymously.
revoke execute on function public.rpc_cockpit_listar_esteira_v1(text,text[],text[],text[],boolean,date,date,boolean,integer,integer) from public, anon;
grant execute on function public.rpc_cockpit_listar_esteira_v1(text,text[],text[],text[],boolean,date,date,boolean,integer,integer) to authenticated, service_role;

comment on function public.rpc_programar_os_v1(uuid,text,date) is 'D51.5 P0-D: fail-closed for authenticated callers until explicit tenant validation is embedded.';
comment on function public.rpc_cockpit_gerar_lote_v1(uuid,uuid,text,jsonb) is 'D51.5 P0-D: fail-closed for authenticated callers until explicit tenant validation is embedded.';
comment on function public.rpc_cockpit_registrar_envase_v1(uuid,uuid,text,uuid,jsonb,date,text,text,boolean,text) is 'D51.5 P0-D: fail-closed for authenticated callers until explicit tenant validation is embedded.';
comment on function public.rpc_avancar_esteira_laboratorio(uuid,text,text,uuid) is 'D51.5 P0-D: fail-closed for authenticated callers until explicit tenant validation is embedded.';