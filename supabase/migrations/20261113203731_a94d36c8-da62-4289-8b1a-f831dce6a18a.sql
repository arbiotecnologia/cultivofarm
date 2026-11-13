insert into platform_private.nfse_homolog_send_allowlist (organization_id, company_settings_id, reason)
select fi.organization_id, fi.company_settings_id, 'Teste homologação NFS-e Nacional autorizado pelo proprietário em 2026-11-13 (prestação ed5180f3)'
  from public.fiscal_invoices fi
 where fi.id = 'ed5180f3-f9e2-4f1a-88bc-97023f0d5df4' and fi.organization_id = '007bb519-cba0-4704-be2c-cb93ad010048'
   and fi.company_settings_id = '7a52fb16-2324-4cea-ac52-cccc86527a0d' and fi.environment = 'HOMOLOGATION'
on conflict (organization_id, company_settings_id) do nothing;
do $post$ begin
  if (select count(*) from platform_private.nfse_homolog_send_allowlist where revoked_at is null) <> 1 then raise exception 'POST_ALLOWLIST_COUNT'; end if;
end $post$;