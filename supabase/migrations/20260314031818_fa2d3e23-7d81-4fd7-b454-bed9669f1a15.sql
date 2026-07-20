
-- Enum for approval status
CREATE TYPE public.status_aprovacao AS ENUM ('pendente', 'aprovado', 'reprovado', 'solicitar_ajuste');

-- Enum for on-farm OS status
CREATE TYPE public.status_os_onfarm AS ENUM ('aberta', 'aprovada', 'programada', 'em_producao', 'em_cq', 'envase', 'pronto_entrega', 'entregue', 'finalizada', 'cancelada');

-- Aprovacoes tecnicas table
CREATE TABLE public.aprovacoes_tecnicas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registro_consultor_id uuid NOT NULL REFERENCES public.registros_consultor(id) ON DELETE CASCADE,
  status_aprovacao public.status_aprovacao NOT NULL DEFAULT 'pendente',
  gestor_responsavel uuid,
  comentario_gestor text,
  data_aprovacao timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.aprovacoes_tecnicas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_select_aprovacoes" ON public.aprovacoes_tecnicas FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_aprovacoes" ON public.aprovacoes_tecnicas FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_aprovacoes" ON public.aprovacoes_tecnicas FOR UPDATE TO authenticated USING (true);

-- Ordens servico on-farm table
CREATE TABLE public.ordens_servico_onfarm (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registro_consultor_id uuid REFERENCES public.registros_consultor(id),
  aprovacao_id uuid REFERENCES public.aprovacoes_tecnicas(id),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id),
  fazenda_id uuid NOT NULL REFERENCES public.fazendas(id),
  talhao_id uuid NOT NULL REFERENCES public.talhoes(id),
  produto_id uuid REFERENCES public.produtos(id),
  dose_ml_ha numeric,
  area_hectares numeric,
  volume_total_ml numeric,
  modo_aplicacao text,
  data_recomendada date,
  prioridade public.prioridade_os NOT NULL DEFAULT 'media',
  status public.status_os_onfarm NOT NULL DEFAULT 'aberta',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ordens_servico_onfarm ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_select_os_onfarm" ON public.ordens_servico_onfarm FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_os_onfarm" ON public.ordens_servico_onfarm FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_os_onfarm" ON public.ordens_servico_onfarm FOR UPDATE TO authenticated USING (true);

-- Add on-farm OS reference to programacao_producao
ALTER TABLE public.programacao_producao ALTER COLUMN ordem_servico_id DROP NOT NULL;
ALTER TABLE public.programacao_producao ADD COLUMN ordem_servico_onfarm_id uuid REFERENCES public.ordens_servico_onfarm(id);
