-- Prepared only; never executed during this recut. Contain without deletion.
REVOKE EXECUTE ON FUNCTION public.get_my_commercial_orders_projection() FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION platform_private.b2b_commercial_own_orders() FROM PUBLIC,anon,authenticated;
-- Remove the own-order UI consumer together with this containment.
-- Preserve service_role ACL, history, partner fixture and Executive/email gates.