drop policy if exists "Superadmin le empresas" on public.organizations;
create policy "Superadmin le empresas" on public.organizations
  for select to authenticated using (public.is_platform_superadmin(auth.uid()));