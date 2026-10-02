-- D51.2 / incidente P0: hardening mínimo dos seis achados RLS bloqueantes.
-- Forward-fix idempotente; não altera dados operacionais.

-- 1) Contador interno: nunca deve ser lido/escrito diretamente pelo cliente.
DROP POLICY IF EXISTS "codigo_sequencias leitura autenticada" ON public.codigo_sequencias;
REVOKE ALL ON TABLE public.codigo_sequencias FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.codigo_sequencias TO service_role;

-- 2) Branding/configuração global: somente contas ativas leem; admin mantém update.
DROP POLICY IF EXISTS "Anyone can read config" ON public.configuracoes_sistema;
CREATE POLICY "Active users can read system config"
ON public.configuracoes_sistema
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.user_id = (SELECT auth.uid())
      AND p.ativo IS TRUE
  )
);
REVOKE ALL ON TABLE public.configuracoes_sistema FROM PUBLIC, anon, authenticated;
GRANT SELECT, UPDATE ON TABLE public.configuracoes_sistema TO authenticated;
GRANT ALL ON TABLE public.configuracoes_sistema TO service_role;

-- 3) Configuração financeira: somente equipe financeira autorizada.
DROP POLICY IF EXISTS "fs_read_all_auth" ON public.financial_settings;
CREATE POLICY "Financial staff can read settings"
ON public.financial_settings
FOR SELECT TO authenticated
USING (public.is_financial_staff((SELECT auth.uid())));
REVOKE ALL ON TABLE public.financial_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT, UPDATE ON TABLE public.financial_settings TO authenticated;
GRANT ALL ON TABLE public.financial_settings TO service_role;

-- 4) Avisos de monitoramento: mesma fronteira da visita técnica vinculada.
DROP POLICY IF EXISTS "Visualização para usuários autenticados" ON public.monitoramento_avisos;
CREATE POLICY "Authorized users can read monitoring notices"
ON public.monitoramento_avisos
FOR SELECT TO authenticated
USING (
  public.can_view_technical_visit(
    (SELECT auth.uid()),
    monitoramento_avisos.registro_consultor_id
  )
);
REVOKE ALL ON TABLE public.monitoramento_avisos FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.monitoramento_avisos TO authenticated;
GRANT ALL ON TABLE public.monitoramento_avisos TO service_role;

-- 5) Sugestões de visita: catálogo interno apenas para papéis que executam/gerem visitas.
DROP POLICY IF EXISTS "Authenticated can read objetivos sugestoes" ON public.objetivos_visita_sugestoes;
CREATE POLICY "Technical staff can read visit objective suggestions"
ON public.objetivos_visita_sugestoes
FOR SELECT TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'administrador'::public.app_role)
  OR public.has_role((SELECT auth.uid()), 'gestor'::public.app_role)
  OR public.has_role((SELECT auth.uid()), 'consultor_tecnico'::public.app_role)
  OR public.has_role((SELECT auth.uid()), 'tecnico_agronomo'::public.app_role)
);
REVOKE ALL ON TABLE public.objetivos_visita_sugestoes FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.objetivos_visita_sugestoes TO authenticated;
GRANT ALL ON TABLE public.objetivos_visita_sugestoes TO service_role;

-- 6) SLA operacional: leitura somente pelos papéis internos que usam o acompanhamento.
DROP POLICY IF EXISTS "Authenticated can read sla" ON public.sla_configuracoes;
CREATE POLICY "Operational staff can read SLA settings"
ON public.sla_configuracoes
FOR SELECT TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'administrador'::public.app_role)
  OR public.has_role((SELECT auth.uid()), 'gestor'::public.app_role)
  OR public.has_role((SELECT auth.uid()), 'administrativo'::public.app_role)
  OR public.has_role((SELECT auth.uid()), 'consultor_tecnico'::public.app_role)
  OR public.has_role((SELECT auth.uid()), 'tecnico_agronomo'::public.app_role)
);
REVOKE ALL ON TABLE public.sla_configuracoes FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sla_configuracoes TO authenticated;
GRANT ALL ON TABLE public.sla_configuracoes TO service_role;