-- H7n P0: elimina 5 security_definer_view no staging, preservando contratos.
-- Aplicar somente em ikaauvsflpmamgxmkhoq.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

create or replace function private.h7n_esteira_laboratorio()
returns setof public.mv_esteira_laboratorio
language sql
stable
security definer
set search_path = ''
as $fn$
  select m.*
  from public.mv_esteira_laboratorio m
  where public.has_role(auth.uid(), 'administrador'::public.app_role)
     or public.has_role(auth.uid(), 'gestor'::public.app_role)
     or public.has_role(auth.uid(), 'administrativo'::public.app_role)
     or public.has_role(auth.uid(), 'producao'::public.app_role)
     or public.has_role(auth.uid(), 'financeiro'::public.app_role)
     or (
       (public.has_role(auth.uid(), 'consultor_tecnico'::public.app_role)
        or public.has_role(auth.uid(), 'tecnico_agronomo'::public.app_role))
       and m.cliente_id = any(public.get_cliente_ids_for_user(auth.uid()))
     );
$fn$;

create or replace function private.h7n_fluxo_visita_tecnica()
returns setof public.mv_fluxo_visita_tecnica
language sql
stable
security definer
set search_path = ''
as $fn$
  select m.*
  from public.mv_fluxo_visita_tecnica m
  where public.has_role(auth.uid(), 'administrador'::public.app_role)
     or public.has_role(auth.uid(), 'gestor'::public.app_role)
     or public.has_role(auth.uid(), 'administrativo'::public.app_role)
     or public.has_role(auth.uid(), 'producao'::public.app_role)
     or public.has_role(auth.uid(), 'financeiro'::public.app_role)
     or (
       (public.has_role(auth.uid(), 'consultor_tecnico'::public.app_role)
        or public.has_role(auth.uid(), 'tecnico_agronomo'::public.app_role))
       and (m.consultor_id = auth.uid()
            or m.cliente_id = any(public.get_cliente_ids_for_user(auth.uid())))
     );
$fn$;

create or replace function private.h7n_catalogo_ficha_produtos()
returns table(
  id uuid, nome text, codigo text, tipo public.tipo_produto, descricao text,
  ativo boolean, valor_dose_brl numeric, valor_litro_brl numeric,
  valor_ha_brl numeric, dose_ml_ha numeric, preco_fonte text
)
language sql
stable
security definer
set search_path = ''
as $fn$
  select p.id, p.nome, p.codigo, p.tipo, p.descricao, p.ativo,
    coalesce(public.fn_catalogo_preco_canonico(p.id, null::uuid, 'dose'::text, null::numeric), p.valor_dose_brl),
    coalesce(public.fn_catalogo_preco_canonico(p.id, null::uuid, 'litro'::text, null::numeric), p.valor_litro_brl),
    coalesce(public.fn_catalogo_preco_canonico(p.id, null::uuid, 'hectare'::text, null::numeric), p.valor_ha_brl),
    p.dose_ml_ha,
    case when public.fn_catalogo_preco_canonico(p.id, null::uuid, 'litro'::text, null::numeric) is not null
      then 'catalogo_volumes'::text else 'legado_mestre'::text end
  from public.produtos p
  where p.ativo = true
    and (
      public.can_view_catalog_internal(auth.uid())
      or (
        (
          not exists (select 1 from public.product_technical_profiles tp where tp.produto_id = p.id)
          or exists (
            select 1 from public.product_technical_profiles tp
            where tp.produto_id = p.id and tp.status_validacao = 'aprovado'::text
          )
        )
        and (
          not (
            public.has_role(auth.uid(), 'parceiro_b2b'::public.app_role)
            or public.has_role(auth.uid(), 'parceiro_b2b_tecnico'::public.app_role)
          )
          or coalesce(p.b2b_enabled, false) = true
        )
      )
    );
$fn$;

create or replace function private.h7n_catalogo_ficha_microrganismos()
returns table(
  id uuid, nome text, nome_cientifico text, funcao_agronomica text,
  ativo boolean, valor_dose_brl numeric, valor_litro_brl numeric,
  dose_ml_ha numeric, preco_fonte text
)
language sql
stable
security definer
set search_path = ''
as $fn$
  select m.id, m.nome, m.nome_cientifico, m.funcao_agronomica, m.ativo,
    coalesce(public.fn_catalogo_preco_canonico(null::uuid, m.id, 'dose'::text, null::numeric), m.valor_dose_brl),
    coalesce(public.fn_catalogo_preco_canonico(null::uuid, m.id, 'litro'::text, null::numeric), m.valor_litro_brl),
    m.dose_ml_ha,
    case when public.fn_catalogo_preco_canonico(null::uuid, m.id, 'litro'::text, null::numeric) is not null
      then 'catalogo_volumes'::text else 'legado_mestre'::text end
  from public.microrganismos m
  where m.ativo = true
    and (
      public.can_view_catalog_internal(auth.uid())
      or (
        (
          not exists (select 1 from public.microorganism_technical_profiles tp where tp.microrganismo_id = m.id)
          or exists (
            select 1 from public.microorganism_technical_profiles tp
            where tp.microrganismo_id = m.id and tp.status_validacao = 'aprovado'::text
          )
        )
        and (
          not (
            public.has_role(auth.uid(), 'parceiro_b2b'::public.app_role)
            or public.has_role(auth.uid(), 'parceiro_b2b_tecnico'::public.app_role)
          )
          or coalesce(m.b2b_enabled, false) = true
        )
      )
    );
$fn$;

revoke all on function private.h7n_esteira_laboratorio() from public, anon;
revoke all on function private.h7n_fluxo_visita_tecnica() from public, anon;
revoke all on function private.h7n_catalogo_ficha_produtos() from public, anon;
revoke all on function private.h7n_catalogo_ficha_microrganismos() from public, anon;
grant execute on function private.h7n_esteira_laboratorio() to authenticated, service_role;
grant execute on function private.h7n_fluxo_visita_tecnica() to authenticated, service_role;
grant execute on function private.h7n_catalogo_ficha_produtos() to authenticated, service_role;
grant execute on function private.h7n_catalogo_ficha_microrganismos() to authenticated, service_role;

alter view public.vw_os_integridade_esteira set (security_invoker = true);

create or replace view public.vw_esteira_laboratorio
with (security_invoker = true)
as select * from private.h7n_esteira_laboratorio();

create or replace view public.vw_fluxo_visita_tecnica
with (security_invoker = true)
as select * from private.h7n_fluxo_visita_tecnica();

create or replace view public.vw_catalogo_ficha_produtos
with (security_invoker = true)
as select * from private.h7n_catalogo_ficha_produtos();

create or replace view public.vw_catalogo_ficha_microrganismos
with (security_invoker = true)
as select * from private.h7n_catalogo_ficha_microrganismos();

revoke all on public.vw_os_integridade_esteira from public, anon, authenticated, service_role;
revoke all on public.vw_esteira_laboratorio from public, anon, authenticated, service_role;
revoke all on public.vw_fluxo_visita_tecnica from public, anon, authenticated, service_role;
revoke all on public.vw_catalogo_ficha_produtos from public, anon, authenticated, service_role;
revoke all on public.vw_catalogo_ficha_microrganismos from public, anon, authenticated, service_role;
grant select on public.vw_os_integridade_esteira to authenticated, service_role;
grant select on public.vw_esteira_laboratorio to authenticated, service_role;
grant select on public.vw_fluxo_visita_tecnica to authenticated, service_role;
grant select on public.vw_catalogo_ficha_produtos to authenticated, service_role;
grant select on public.vw_catalogo_ficha_microrganismos to authenticated, service_role;


