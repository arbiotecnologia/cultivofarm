-- ============================================================
-- 1. SLA: Configurações + tracking
-- ============================================================
CREATE TABLE public.sla_configuracoes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  etapa TEXT NOT NULL UNIQUE,
  prazo_horas INTEGER NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  descricao TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.sla_configuracoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read sla"
  ON public.sla_configuracoes FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage sla"
  ON public.sla_configuracoes FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'administrador'::app_role));

CREATE TRIGGER update_sla_configuracoes_updated_at
  BEFORE UPDATE ON public.sla_configuracoes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Defaults: atribuição 24h, check-in 48h, recomendação 72h
INSERT INTO public.sla_configuracoes (etapa, prazo_horas, descricao) VALUES
  ('atribuicao', 24, 'Tempo máximo entre solicitação e atribuição a um consultor'),
  ('checkin', 48, 'Tempo máximo entre atribuição e realização do check-in na fazenda'),
  ('recomendacao', 72, 'Tempo máximo entre check-in e finalização da recomendação técnica');

-- ============================================================
-- 2. Sync Log: auditoria da fila offline
-- ============================================================
CREATE TABLE public.sync_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  tipo_item TEXT NOT NULL, -- 'registro' | 'checkin' | 'foto' | 'audio'
  item_local_id TEXT NOT NULL,
  item_remoto_id UUID,
  status TEXT NOT NULL, -- 'sucesso' | 'erro' | 'tentativa'
  tentativa INTEGER NOT NULL DEFAULT 1,
  mensagem_erro TEXT,
  payload_resumo JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_sync_log_user ON public.sync_log(user_id, created_at DESC);
CREATE INDEX idx_sync_log_status ON public.sync_log(status, created_at DESC);

ALTER TABLE public.sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own sync log"
  ON public.sync_log FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

CREATE POLICY "Users can read own sync log"
  ON public.sync_log FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR has_role(auth.uid(), 'administrador'::app_role) OR has_role(auth.uid(), 'gestor'::app_role));

CREATE POLICY "Admins can delete sync log"
  ON public.sync_log FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'administrador'::app_role));