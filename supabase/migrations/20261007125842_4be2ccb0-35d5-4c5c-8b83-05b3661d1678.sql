-- A RPC SECURITY INVOKER usa FOR UPDATE; a permissão foi removida do estado vivo.
-- Não altera RLS: a política UPDATE exige is_platform_superadmin(auth.uid()).
-- Reversão: REVOKE UPDATE ON public.organization_subscriptions FROM authenticated;
GRANT UPDATE ON public.organization_subscriptions TO authenticated;