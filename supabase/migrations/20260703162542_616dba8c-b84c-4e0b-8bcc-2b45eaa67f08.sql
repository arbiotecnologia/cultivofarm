
-- FASE 4: BI seguro — filtro por perfil nas views wrapper

-- 1) Revogar acesso direto às materialized views (força uso via vw_*)
REVOKE ALL ON public.mv_esteira_laboratorio FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.mv_fluxo_visita_tecnica FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.mv_esteira_laboratorio TO service_role;
GRANT SELECT ON public.mv_fluxo_visita_tecnica TO service_role;

-- 2) Helper: perfis internos que podem ver o BI global
CREATE OR REPLACE FUNCTION public.can_view_bi_operacional(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _uid IS NOT NULL AND (
    public.has_role(_uid, 'administrador')
    OR public.has_role(_uid, 'gestor')
    OR public.has_role(_uid, 'administrativo')
    OR public.has_role(_uid, 'producao')
    OR public.has_role(_uid, 'financeiro')
    OR public.has_role(_uid, 'consultor_tecnico')
    OR public.has_role(_uid, 'tecnico_agronomo')
  );
$$;
REVOKE ALL ON FUNCTION public.can_view_bi_operacional(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_bi_operacional(uuid) TO authenticated;

-- 3) Recriar wrapper views com filtro por perfil embutido (executam como owner = postgres, lendo a MV; filtro no WHERE)
DROP VIEW IF EXISTS public.vw_esteira_laboratorio CASCADE;
CREATE VIEW public.vw_esteira_laboratorio AS
  SELECT m.*
  FROM public.mv_esteira_laboratorio m
  WHERE
    -- Perfis executivos/operacionais/financeiro: visão global
    public.has_role(auth.uid(), 'administrador')
    OR public.has_role(auth.uid(), 'gestor')
    OR public.has_role(auth.uid(), 'administrativo')
    OR public.has_role(auth.uid(), 'producao')
    OR public.has_role(auth.uid(), 'financeiro')
    -- Consultor/técnico: apenas seus clientes
    OR (
      (public.has_role(auth.uid(), 'consultor_tecnico') OR public.has_role(auth.uid(), 'tecnico_agronomo'))
      AND m.cliente_id = ANY (public.get_cliente_ids_for_user(auth.uid()))
    );

DROP VIEW IF EXISTS public.vw_fluxo_visita_tecnica CASCADE;
CREATE VIEW public.vw_fluxo_visita_tecnica AS
  SELECT m.*
  FROM public.mv_fluxo_visita_tecnica m
  WHERE
    public.has_role(auth.uid(), 'administrador')
    OR public.has_role(auth.uid(), 'gestor')
    OR public.has_role(auth.uid(), 'administrativo')
    OR public.has_role(auth.uid(), 'producao')
    OR public.has_role(auth.uid(), 'financeiro')
    OR (
      (public.has_role(auth.uid(), 'consultor_tecnico') OR public.has_role(auth.uid(), 'tecnico_agronomo'))
      AND (m.consultor_id = auth.uid() OR m.cliente_id = ANY (public.get_cliente_ids_for_user(auth.uid())))
    );

REVOKE ALL ON public.vw_esteira_laboratorio FROM PUBLIC, anon;
REVOKE ALL ON public.vw_fluxo_visita_tecnica FROM PUBLIC, anon;
GRANT SELECT ON public.vw_esteira_laboratorio TO authenticated;
GRANT SELECT ON public.vw_fluxo_visita_tecnica TO authenticated;

-- 4) Índices auxiliares (não recriam se já existem)
CREATE INDEX IF NOT EXISTS idx_mv_esteira_fazenda ON public.mv_esteira_laboratorio (fazenda_id);
CREATE INDEX IF NOT EXISTS idx_mv_esteira_produto ON public.mv_esteira_laboratorio (produto_id);
CREATE INDEX IF NOT EXISTS idx_mv_esteira_microrganismo ON public.mv_esteira_laboratorio (microrganismo_id);
CREATE INDEX IF NOT EXISTS idx_mv_esteira_entrega_status ON public.mv_esteira_laboratorio (entrega_status);

CREATE INDEX IF NOT EXISTS idx_mv_fluxo_fazenda ON public.mv_fluxo_visita_tecnica (fazenda_id);
CREATE INDEX IF NOT EXISTS idx_mv_fluxo_talhao ON public.mv_fluxo_visita_tecnica (talhao_id);
