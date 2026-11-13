-- Privilégios de schema conferidos em produção (somente leitura, 13/11/2026):
-- authenticated tem USAGE em platform_private. A réplica local não copia ACLs,
-- então os replicamos explicitamente para o caminho testado.
grant usage on schema public, platform_private, auth to authenticated, service_role, anon;
grant execute on all functions in schema public, platform_private, auth to authenticated, service_role;
grant select on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
