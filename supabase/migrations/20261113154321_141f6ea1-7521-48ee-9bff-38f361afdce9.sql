revoke all on public.catalog_services, public.service_engagements, public.service_billing_requests from anon, public;
revoke delete, truncate, references, trigger on public.catalog_services, public.service_engagements from authenticated;
revoke insert, update, delete, truncate, references, trigger on public.service_billing_requests from authenticated;