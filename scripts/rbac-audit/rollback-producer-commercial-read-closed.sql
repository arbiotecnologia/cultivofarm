-- Restrictive rollback only: no restored vulnerable bodies/grants or data changes.
BEGIN;
REVOKE ALL ON FUNCTION public.get_portal_cliente_b2b_order_detail_secure(uuid),public.get_portal_cliente_b2b_orders_secure(uuid),public.get_portal_cliente_b2b_simulation_detail_secure(uuid),public.get_portal_cliente_b2b_simulations_secure(uuid),platform_private.producer_commercial_client_scope(uuid) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
