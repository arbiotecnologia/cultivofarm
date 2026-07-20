
-- Enums for Consultor Técnico de Campo module
CREATE TYPE public.tipo_demanda_consultor AS ENUM (
  'praga', 'doenca', 'planta_daninha', 'nematoide', 'solo',
  'nutricao_biologica', 'manejo_preventivo', 'manejo_corretivo', 'outro'
);

CREATE TYPE public.categoria_problema_consultor AS ENUM (
  'insetos_praga', 'doencas_fungicas', 'doencas_bacterianas', 'nematoides',
  'plantas_daninhas', 'desequilibrio_biologico_solo', 'baixa_vitalidade',
  'falha_estande', 'fitotoxidade', 'outro'
);

CREATE TYPE public.nivel_pressao AS ENUM ('baixo', 'medio', 'alto', 'severo');

CREATE TYPE public.urgencia_consultor AS ENUM ('baixa', 'media', 'alta', 'critica');

CREATE TYPE public.necessidade_intervencao AS ENUM (
  'monitorar', 'intervir_ate_7_dias', 'intervir_ate_3_dias', 'intervir_imediatamente'
);

CREATE TYPE public.status_registro_consultor AS ENUM (
  'rascunho', 'finalizado', 'enviado_aprovacao', 'aprovado', 'convertido_os', 'arquivado'
);

CREATE TYPE public.objetivo_recomendacao AS ENUM (
  'preventivo', 'corretivo', 'reducao_pressao', 'tratamento_solo',
  'reequilibrio_biologico', 'suporte_fisiologico', 'manejo_integrado'
);

CREATE TYPE public.estrategia_manejo AS ENUM (
  'biologico', 'manejo_integrado', 'monitoramento', 'correcao_operacional',
  'ajuste_aplicacao', 'ajuste_janela', 'outro'
);

CREATE TYPE public.modo_aplicacao_consultor AS ENUM (
  'foliar', 'aplicacao_no_colo_da_planta', 'via_solo', 'tratamento_semente',
  'sulco_plantio', 'jato_dirigido', 'outro'
);

CREATE TYPE public.categoria_arquivo_consultor AS ENUM (
  'praga', 'doenca', 'planta_daninha', 'nematoide', 'solo', 'aplicacao', 'geral'
);

CREATE TYPE public.ponto_area_consultor AS ENUM (
  'entrada_talhao', 'bordadura', 'centro_area', 'reboleira', 'outro'
);

-- Main records table
CREATE TABLE public.registros_consultor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid REFERENCES public.clientes(id),
  fazenda_id uuid REFERENCES public.fazendas(id),
  talhao_id uuid REFERENCES public.talhoes(id),
  consultor_responsavel uuid,
  data_vistoria date NOT NULL DEFAULT CURRENT_DATE,
  cultura_id uuid REFERENCES public.culturas(id),
  fase_fenologica text,
  area_hectares numeric,
  safra text,
  tipo_demanda public.tipo_demanda_consultor,
  titulo_registro text,
  problema_principal text,
  problema_secundario text,
  categoria_problema public.categoria_problema_consultor,
  nivel_pressao public.nivel_pressao DEFAULT 'medio',
  localizacao_na_area text,
  percentual_area_afetada numeric,
  historico_resumido text,
  condicoes_climaticas_observadas text,
  observacoes_tecnicas text,
  urgencia public.urgencia_consultor DEFAULT 'media',
  necessidade_intervencao public.necessidade_intervencao DEFAULT 'monitorar',
  status public.status_registro_consultor NOT NULL DEFAULT 'rascunho',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

-- Files table
CREATE TABLE public.registros_consultor_arquivos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registro_consultor_id uuid NOT NULL REFERENCES public.registros_consultor(id) ON DELETE CASCADE,
  arquivo_url text NOT NULL,
  tipo_arquivo text,
  categoria_arquivo public.categoria_arquivo_consultor DEFAULT 'geral',
  legenda text,
  foto_principal boolean DEFAULT false,
  ponto_area public.ponto_area_consultor,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  uploaded_by uuid
);

-- Recommendations table
CREATE TABLE public.registros_consultor_recomendacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registro_consultor_id uuid NOT NULL REFERENCES public.registros_consultor(id) ON DELETE CASCADE,
  objetivo_recomendacao public.objetivo_recomendacao,
  estrategia_manejo public.estrategia_manejo,
  recomendacao_tecnica text,
  produto_biologico_sugerido_id uuid REFERENCES public.produtos(id),
  dose_recomendada_valor numeric,
  dose_recomendada_unidade text DEFAULT 'mL/ha',
  volume_calda text,
  modo_aplicacao public.modo_aplicacao_consultor,
  momento_aplicacao text,
  numero_aplicacoes integer,
  intervalo_aplicacoes text,
  compatibilidade_observacoes text,
  cuidados_operacionais text,
  observacoes_finais text,
  encaminhar_para_os boolean DEFAULT false,
  volume_total_recomendado numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Status log table
CREATE TABLE public.registros_consultor_status_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registro_consultor_id uuid NOT NULL REFERENCES public.registros_consultor(id) ON DELETE CASCADE,
  status_anterior text,
  status_novo text NOT NULL,
  motivo text,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.registros_consultor ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registros_consultor_arquivos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registros_consultor_recomendacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registros_consultor_status_log ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "auth_select_registros" ON public.registros_consultor FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_registros" ON public.registros_consultor FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_registros" ON public.registros_consultor FOR UPDATE TO authenticated USING (true);

CREATE POLICY "auth_select_arquivos" ON public.registros_consultor_arquivos FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_arquivos" ON public.registros_consultor_arquivos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_arquivos" ON public.registros_consultor_arquivos FOR UPDATE TO authenticated USING (true);
CREATE POLICY "auth_delete_arquivos" ON public.registros_consultor_arquivos FOR DELETE TO authenticated USING (true);

CREATE POLICY "auth_select_recomendacoes" ON public.registros_consultor_recomendacoes FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_recomendacoes" ON public.registros_consultor_recomendacoes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_recomendacoes" ON public.registros_consultor_recomendacoes FOR UPDATE TO authenticated USING (true);

CREATE POLICY "auth_select_status_log" ON public.registros_consultor_status_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_status_log" ON public.registros_consultor_status_log FOR INSERT TO authenticated WITH CHECK (true);

-- Triggers
CREATE TRIGGER update_registros_consultor_updated_at
  BEFORE UPDATE ON public.registros_consultor
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_registros_consultor_recomendacoes_updated_at
  BEFORE UPDATE ON public.registros_consultor_recomendacoes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Storage bucket for consultant files
INSERT INTO storage.buckets (id, name, public) VALUES ('consultor-arquivos', 'consultor-arquivos', true);

CREATE POLICY "auth_upload_consultor" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'consultor-arquivos');
CREATE POLICY "public_view_consultor" ON storage.objects FOR SELECT TO public USING (bucket_id = 'consultor-arquivos');
CREATE POLICY "auth_delete_consultor" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'consultor-arquivos');
