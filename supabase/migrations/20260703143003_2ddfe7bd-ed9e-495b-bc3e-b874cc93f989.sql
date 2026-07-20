-- =========================================================
-- Fase 3A — Materialized Views (esteira + fluxo)
-- =========================================================

-- 1) Renomear views originais para servirem de fonte do snapshot
ALTER VIEW public.vw_esteira_laboratorio RENAME TO _src_vw_esteira_laboratorio;
ALTER VIEW public.vw_fluxo_visita_tecnica RENAME TO _src_vw_fluxo_visita_tecnica;

-- 2) Criar matviews com o nome original (contrato preservado)
CREATE MATERIALIZED VIEW public.vw_esteira_laboratorio AS
  SELECT * FROM public._src_vw_esteira_laboratorio;

CREATE MATERIALIZED VIEW public.vw_fluxo_visita_tecnica AS
  SELECT * FROM public._src_vw_fluxo_visita_tecnica;

-- 3) Permissões (mesmo nível de acesso das views anteriores)
GRANT SELECT ON public.vw_esteira_laboratorio TO authenticated;
GRANT SELECT ON public.vw_esteira_laboratorio TO anon;
GRANT SELECT ON public.vw_fluxo_visita_tecnica TO authenticated;
GRANT SELECT ON public.vw_fluxo_visita_tecnica TO anon;

-- 4) Índices em colunas filtradas pelo frontend
CREATE INDEX IF NOT EXISTS idx_mv_esteira_created_at ON public.vw_esteira_laboratorio(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mv_esteira_cliente ON public.vw_esteira_laboratorio(cliente_id);
CREATE INDEX IF NOT EXISTS idx_mv_esteira_status_os ON public.vw_esteira_laboratorio(status_os);
CREATE INDEX IF NOT EXISTS idx_mv_esteira_status_oficial ON public.vw_esteira_laboratorio(status_esteira_oficial);
CREATE INDEX IF NOT EXISTS idx_mv_esteira_origem_os ON public.vw_esteira_laboratorio(origem_os);

CREATE INDEX IF NOT EXISTS idx_mv_fluxo_created_at ON public.vw_fluxo_visita_tecnica(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mv_fluxo_cliente ON public.vw_fluxo_visita_tecnica(cliente_id);
CREATE INDEX IF NOT EXISTS idx_mv_fluxo_status_solic ON public.vw_fluxo_visita_tecnica(status_solicitacao);
CREATE INDEX IF NOT EXISTS idx_mv_fluxo_status_visita ON public.vw_fluxo_visita_tecnica(status_visita);
CREATE INDEX IF NOT EXISTS idx_mv_fluxo_consultor ON public.vw_fluxo_visita_tecnica(consultor_id);

ANALYZE public.vw_esteira_laboratorio;
ANALYZE public.vw_fluxo_visita_tecnica;

-- =========================================================
-- Fase 3B — pg_cron: refresh das matviews a cada 5 minutos
-- =========================================================
SELECT cron.schedule(
  'refresh-mv-esteira-laboratorio',
  '*/5 * * * *',
  $$REFRESH MATERIALIZED VIEW public.vw_esteira_laboratorio;$$
);

SELECT cron.schedule(
  'refresh-mv-fluxo-visita-tecnica',
  '*/5 * * * *',
  $$REFRESH MATERIALIZED VIEW public.vw_fluxo_visita_tecnica;$$
);

-- =========================================================
-- Fase 3C — Poda diária de logs (> 180 dias) via pg_cron
-- =========================================================
SELECT cron.schedule(
  'prune-old-audit-logs',
  '15 3 * * *',
  $$
  DELETE FROM public.catalog_technical_audit_logs   WHERE created_at < now() - interval '180 days';
  DELETE FROM public.partner_order_audit_logs        WHERE created_at < now() - interval '180 days';
  DELETE FROM public.financial_audit_log             WHERE created_at < now() - interval '180 days';
  DELETE FROM public.financial_governance_audit_log  WHERE created_at < now() - interval '180 days';
  DELETE FROM public.commercial_audit_log            WHERE created_at < now() - interval '180 days';
  DELETE FROM public.partner_audit_logs              WHERE created_at < now() - interval '180 days';
  DELETE FROM public.audit_senha_log                 WHERE created_at < now() - interval '180 days';
  DELETE FROM public.clientes_audit_log              WHERE created_at < now() - interval '180 days';
  DELETE FROM public.laboratorio_esteira_eventos     WHERE created_at < now() - interval '180 days';
  DELETE FROM public.sync_log                        WHERE created_at < now() - interval '180 days';
  DELETE FROM public.agenda_sync_log                 WHERE created_at < now() - interval '180 days';
  DELETE FROM public.alertas_execucoes               WHERE created_at < now() - interval '180 days';
  DELETE FROM public.alertas_notificacoes            WHERE created_at < now() - interval '180 days';
  $$
);