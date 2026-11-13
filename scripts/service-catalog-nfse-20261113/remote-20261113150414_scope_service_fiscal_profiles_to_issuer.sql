-- Cópia de referência do histórico remoto (supabase_migrations.schema_migrations,
-- versão 20261113150414, ref swzpzcwiasxmjutrmvkm). JÁ APLICADA pelo proprietário.
-- NÃO REAPLICAR. Conteúdo extraído por leitura em 2026-11-13.
set local lock_timeout='4s';
alter table public.service_fiscal_profiles add column organization_id uuid not null default public.h15_actor_organization() references public.organizations(id);
alter table public.service_fiscal_profiles enable row level security;
create policy service_fiscal_org_boundary on public.service_fiscal_profiles as restrictive for all to public using (organization_id=(select public.h15_actor_organization()) and platform_private.fiscal_org_released(organization_id)) with check (organization_id=(select public.h15_actor_organization()) and platform_private.fiscal_org_released(organization_id));
drop policy service_fiscal_profiles_insert on public.service_fiscal_profiles;
drop policy service_fiscal_profiles_update on public.service_fiscal_profiles;
create policy service_fiscal_profiles_insert on public.service_fiscal_profiles for insert to authenticated with check (public.has_role((select auth.uid()),'administrador') or public.has_role((select auth.uid()),'financeiro'));
create policy service_fiscal_profiles_update on public.service_fiscal_profiles for update to authenticated using (public.has_role((select auth.uid()),'administrador') or public.has_role((select auth.uid()),'financeiro')) with check (public.has_role((select auth.uid()),'administrador') or public.has_role((select auth.uid()),'financeiro'));
drop index public.ux_service_fp_source_ref_ci_active;
create unique index ux_service_fp_source_ref_ci_active on public.service_fiscal_profiles(organization_id,lower(btrim(source_reference))) where source_reference is not null and btrim(source_reference)<>'' and is_active;
create index ix_service_fiscal_org on public.service_fiscal_profiles(organization_id);
-- Bloco DO $patch$ que substitui filtros por empresa em 6 RPCs (ibs/cbs get/save,
-- rpc_fiscal_draft_save, rpc_fiscal_calculate_service_invoice_v1) — ver
-- schema_migrations.statements da versão 20261113150414 para o texto integral.
