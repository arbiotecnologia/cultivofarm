DROP POLICY IF EXISTS "Superadmin lê assinaturas" ON public.organization_subscriptions;
CREATE POLICY "Superadmin lê assinaturas"
ON public.organization_subscriptions
FOR SELECT
TO authenticated
USING (public.is_platform_superadmin((SELECT auth.uid())));

DROP POLICY IF EXISTS "Superadmin lê histórico de assinaturas" ON public.organization_subscription_history;
CREATE POLICY "Superadmin lê histórico de assinaturas"
ON public.organization_subscription_history
FOR SELECT
TO authenticated
USING (public.is_platform_superadmin((SELECT auth.uid())));