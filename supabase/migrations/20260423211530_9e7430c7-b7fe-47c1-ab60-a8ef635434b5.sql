
-- ============================================
-- ENUMS
-- ============================================

CREATE TYPE public.status_atribuicao AS ENUM ('atribuida', 'aceita', 'recusada', 'concluida');

CREATE TYPE public.tipo_checkin AS ENUM ('chegada_fazenda', 'chegada_talhao', 'inicio_visita');

CREATE TYPE public.status_checkin AS ENUM ('realizado', 'inconsistente', 'validado');

CREATE TYPE public.tipo_visita AS ENUM (
  'vistoria_inicial',
  'retorno',
  'monitoramento',
  'pos_aplicacao',
  'emergencia',
  'acompanhamento_programado'
);

CREATE TYPE public.risco_produtivo AS ENUM ('baixo', 'medio', 'alto', 'critico');

CREATE TYPE public.tipo_arquivo_consultor AS ENUM ('foto', 'audio', 'pdf');

-- ============================================
-- ALTERAÇÕES EM portal_solicitacoes
-- ============================================

ALTER TABLE public.portal_solicitacoes
  ADD COLUMN IF NOT EXISTS solicitante_nome text,
  ADD COLUMN IF NOT EXISTS solicitante_contato text,
  ADD COLUMN IF NOT EXISTS audio_inicial_url text,
  ADD COLUMN IF NOT EXISTS fotos_iniciais text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS consultor_atribuido uuid;

-- O status segue como text para manter compatibilidade.
-- Valores aceitos: aberta, em_triagem, atribuida, em_deslocamento, checkin_realizado,
-- em_visita, aguardando_recomendacao, concluida, cancelada, pendente

-- ============================================
-- ALTERAÇÕES EM registros_consultor
-- ============================================

ALTER TABLE public.registros_consultor
  ADD COLUMN IF NOT EXISTS solicitacao_id uuid,
  ADD COLUMN IF NOT EXISTS hora_inicio timestamp with time zone,
  ADD COLUMN IF NOT EXISTS hora_fim timestamp with time zone,
  ADD COLUMN IF NOT EXISTS tipo_visita public.tipo_visita,
  ADD COLUMN IF NOT EXISTS risco_produtivo public.risco_produtivo,
  ADD COLUMN IF NOT EXISTS objetivo_visita text,
  ADD COLUMN IF NOT EXISTS acao_realizada text,
  ADD COLUMN IF NOT EXISTS proxima_acao_recomendada text;

-- ============================================
-- ALTERAÇÕES EM registros_consultor_arquivos
-- ============================================

ALTER TABLE public.registros_consultor_arquivos
  ADD COLUMN IF NOT EXISTS tipo_midia public.tipo_arquivo_consultor DEFAULT 'foto',
  ADD COLUMN IF NOT EXISTS latitude numeric,
  ADD COLUMN IF NOT EXISTS longitude numeric,
  ADD COLUMN IF NOT EXISTS capturado_em timestamp with time zone,
  ADD COLUMN IF NOT EXISTS duracao_segundos integer;

-- ============================================
-- TABELA: solicitacoes_atribuicoes
-- ============================================

CREATE TABLE IF NOT EXISTS public.solicitacoes_atribuicoes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  solicitacao_id uuid NOT NULL,
  consultor_id uuid NOT NULL,
  atribuido_por uuid,
  data_atribuicao timestamp with time zone NOT NULL DEFAULT now(),
  status public.status_atribuicao NOT NULL DEFAULT 'atribuida',
  observacoes text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.solicitacoes_atribuicoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_select_atribuicoes"
  ON public.solicitacoes_atribuicoes FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth_insert_atribuicoes"
  ON public.solicitacoes_atribuicoes FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "auth_update_atribuicoes"
  ON public.solicitacoes_atribuicoes FOR UPDATE TO authenticated USING (true);

CREATE POLICY "admin_delete_atribuicoes"
  ON public.solicitacoes_atribuicoes FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'administrador'::app_role));

CREATE INDEX idx_atribuicoes_solicitacao ON public.solicitacoes_atribuicoes(solicitacao_id);
CREATE INDEX idx_atribuicoes_consultor ON public.solicitacoes_atribuicoes(consultor_id);

-- ============================================
-- TABELA: visitas_checkin
-- ============================================

CREATE TABLE IF NOT EXISTS public.visitas_checkin (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  solicitacao_id uuid,
  registro_consultor_id uuid,
  consultor_id uuid NOT NULL,
  cliente_id uuid,
  fazenda_id uuid,
  talhao_id uuid,
  data_hora_checkin timestamp with time zone NOT NULL DEFAULT now(),
  latitude numeric,
  longitude numeric,
  precisao_gps numeric,
  tipo_checkin public.tipo_checkin NOT NULL DEFAULT 'chegada_fazenda',
  observacoes text,
  foto_url text,
  audio_url text,
  justificativa_sem_gps text,
  status public.status_checkin NOT NULL DEFAULT 'realizado',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.visitas_checkin ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_select_checkin"
  ON public.visitas_checkin FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth_insert_checkin"
  ON public.visitas_checkin FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "auth_update_checkin"
  ON public.visitas_checkin FOR UPDATE TO authenticated USING (true);

CREATE POLICY "admin_delete_checkin"
  ON public.visitas_checkin FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'administrador'::app_role));

CREATE INDEX idx_checkin_solicitacao ON public.visitas_checkin(solicitacao_id);
CREATE INDEX idx_checkin_consultor ON public.visitas_checkin(consultor_id);
CREATE INDEX idx_checkin_talhao ON public.visitas_checkin(talhao_id);
CREATE INDEX idx_checkin_data ON public.visitas_checkin(data_hora_checkin DESC);

-- ============================================
-- TABELA: visitas_logs (auditoria)
-- ============================================

CREATE TABLE IF NOT EXISTS public.visitas_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  registro_consultor_id uuid,
  solicitacao_id uuid,
  acao text NOT NULL,
  descricao text,
  usuario_id uuid,
  data_hora timestamp with time zone NOT NULL DEFAULT now(),
  metadata jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.visitas_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_select_visitas_logs"
  ON public.visitas_logs FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth_insert_visitas_logs"
  ON public.visitas_logs FOR INSERT TO authenticated WITH CHECK (true);

CREATE INDEX idx_visitas_logs_registro ON public.visitas_logs(registro_consultor_id);
CREATE INDEX idx_visitas_logs_solicitacao ON public.visitas_logs(solicitacao_id);
CREATE INDEX idx_visitas_logs_data ON public.visitas_logs(data_hora DESC);
