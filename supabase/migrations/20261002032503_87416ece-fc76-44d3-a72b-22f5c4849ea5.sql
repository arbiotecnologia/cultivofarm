-- D51.2 / gate de publicação: hardening dos três warnings RLS exploráveis restantes.
-- Forward-fix idempotente; não altera dados.

-- Templates de etiqueta são configuração operacional interna.
DROP POLICY IF EXISTS "et_select_auth" ON public.etiqueta_templates;
CREATE POLICY "Internal catalog users can read label templates"
ON public.etiqueta_templates
FOR SELECT TO authenticated
USING (public.can_view_catalog_internal((SELECT auth.uid())));
REVOKE ALL ON TABLE public.etiqueta_templates FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.etiqueta_templates TO authenticated;
GRANT ALL ON TABLE public.etiqueta_templates TO service_role;

-- Marcador do ambiente fiscal é lido somente por funções server-side com service_role.
DROP POLICY IF EXISTS "fiscal_environment_marker_read" ON public.fiscal_environment_marker;
DROP POLICY IF EXISTS "Client roles cannot access fiscal environment marker" ON public.fiscal_environment_marker;
CREATE POLICY "Client roles cannot access fiscal environment marker"
ON public.fiscal_environment_marker
AS RESTRICTIVE
FOR ALL TO authenticated
USING (false)
WITH CHECK (false);
REVOKE ALL ON TABLE public.fiscal_environment_marker FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.fiscal_environment_marker TO service_role;

-- Formulações compõem o catálogo interno; escrita exige capacidade técnica explícita.
DROP POLICY IF EXISTS "Authenticated users can read formulacoes" ON public.formulacoes;
DROP POLICY IF EXISTS "Authenticated users can insert formulacoes" ON public.formulacoes;
DROP POLICY IF EXISTS "Authenticated users can update formulacoes" ON public.formulacoes;
DROP POLICY IF EXISTS "Authenticated users can delete formulacoes" ON public.formulacoes;
CREATE POLICY "Internal catalog users can read formulations"
ON public.formulacoes
FOR SELECT TO authenticated
USING (public.can_view_catalog_internal((SELECT auth.uid())));
CREATE POLICY "Technical catalog managers can insert formulations"
ON public.formulacoes
FOR INSERT TO authenticated
WITH CHECK (public.can_manage_catalog_tecnico((SELECT auth.uid())));
CREATE POLICY "Technical catalog managers can update formulations"
ON public.formulacoes
FOR UPDATE TO authenticated
USING (public.can_manage_catalog_tecnico((SELECT auth.uid())))
WITH CHECK (public.can_manage_catalog_tecnico((SELECT auth.uid())));
CREATE POLICY "Technical catalog managers can delete formulations"
ON public.formulacoes
FOR DELETE TO authenticated
USING (public.can_manage_catalog_tecnico((SELECT auth.uid())));
REVOKE ALL ON TABLE public.formulacoes FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.formulacoes TO authenticated;
GRANT ALL ON TABLE public.formulacoes TO service_role;