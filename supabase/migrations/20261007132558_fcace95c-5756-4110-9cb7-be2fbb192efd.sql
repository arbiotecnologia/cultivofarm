-- Canônico validado por lovable supabase info: swzpzcwiasxmjutrmvkm.
-- Fase 1: A_direct_cross_settings retornou 1 linha de B antes desta correção.
-- Reversão estrutural: DROP POLICY b2b_financial_settings_tenant_guard ON public.partner_financial_settings;
-- Não executar reversão em produção sem contenção substituta: reabriria a falha comprovada.
DO $migration$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='partner_financial_settings' AND policyname='b2b_financial_settings_tenant_guard') THEN
  CREATE POLICY b2b_financial_settings_tenant_guard ON public.partner_financial_settings
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (
   public.is_platform_superadmin(auth.uid()) OR (
    NOT public.has_role(auth.uid(),'parceiro_b2b_tecnico'::public.app_role)
    AND EXISTS (SELECT 1 FROM public.profiles p
      JOIN public.organizations o ON o.id=p.organization_id
      JOIN public.partner_accounts pa ON pa.id=o.partner_account_id
      WHERE p.user_id=auth.uid() AND p.ativo=true AND o.ativo=true AND o.status='ativa'
       AND pa.id=partner_financial_settings.partner_id AND pa.ativo=true AND pa.deleted_at IS NULL)
   )
  )
  WITH CHECK (
   public.is_platform_superadmin(auth.uid()) OR (
    NOT public.has_role(auth.uid(),'parceiro_b2b_tecnico'::public.app_role)
    AND EXISTS (SELECT 1 FROM public.profiles p
      JOIN public.organizations o ON o.id=p.organization_id
      JOIN public.partner_accounts pa ON pa.id=o.partner_account_id
      WHERE p.user_id=auth.uid() AND p.ativo=true AND o.ativo=true AND o.status='ativa'
       AND pa.id=partner_financial_settings.partner_id AND pa.ativo=true AND pa.deleted_at IS NULL)
   )
  );
 END IF;
END $migration$;