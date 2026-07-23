-- =====================================================================
-- MIGRATION CANÔNICA PREPARADA — NÃO APLICADA
-- Destino final (após autorização): supabase/migrations/
--   20260728000000_fiscal_rls_perfis_split_write.sql
--
-- Ambiente autorizado para aplicação: staging temporário
--   ikaauvsflpmamgxmkhoq (via canal externo). Produção
--   navfzbwgwzruipouyfnk permanece INTOCADA.
--
-- Fase corretiva RLS — perfis fiscais (produtos, serviços, clientes).
-- Aditiva. Não altera comportamento legítimo.
--
-- Motivação: as policies `<tabela>_write FOR ALL` combinam-se por OR com
-- a policy `<tabela>_delete USING(false)`, mantendo o ramo DELETE da
-- policy FOR ALL habilitado no plano RLS. A negação real hoje depende
-- apenas da camada de GRANT (REVOKE DELETE aplicado em 20260722000000).
-- Esta migration elimina a ambiguidade separando INSERT e UPDATE,
-- mantendo DELETE=false e reforçando REVOKE DELETE como defesa em
-- profundidade. GRANTs SELECT/INSERT/UPDATE existentes são preservados.
-- =====================================================================

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'product_fiscal_profiles',
    'service_fiscal_profiles',
    'customer_fiscal_profiles'
  ] LOOP
    -- Remover policy permissiva FOR ALL
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_write', t);

    -- INSERT separado (admin/financeiro)
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_insert', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated '
      'WITH CHECK (public.has_role(auth.uid(),''administrador'') '
      'OR public.has_role(auth.uid(),''financeiro''))',
      t || '_insert', t
    );

    -- UPDATE separado (admin/financeiro)
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_update', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated '
      'USING (public.has_role(auth.uid(),''administrador'') '
      'OR public.has_role(auth.uid(),''financeiro'')) '
      'WITH CHECK (public.has_role(auth.uid(),''administrador'') '
      'OR public.has_role(auth.uid(),''financeiro''))',
      t || '_update', t
    );

    -- READ preservado (admin/gestor/financeiro) — recriação idempotente
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_read', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated '
      'USING (public.has_role(auth.uid(),''administrador'') '
      'OR public.has_role(auth.uid(),''gestor'') '
      'OR public.has_role(auth.uid(),''financeiro''))',
      t || '_read', t
    );

    -- DELETE negado — recriação idempotente
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_delete', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (false)',
      t || '_delete', t
    );

    -- Defesa em profundidade: revogar DELETE do authenticated
    EXECUTE format('REVOKE DELETE ON public.%I FROM authenticated', t);
  END LOOP;
END $$;
