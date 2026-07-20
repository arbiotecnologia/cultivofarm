
-- 1. Estender aplicacoes
ALTER TABLE public.aplicacoes
  ADD COLUMN IF NOT EXISTS hora_inicio timestamptz,
  ADD COLUMN IF NOT EXISTS hora_fim timestamptz,
  ADD COLUMN IF NOT EXISTS modo_aplicacao text,
  ADD COLUMN IF NOT EXISTS volume_calda_l_ha numeric,
  ADD COLUMN IF NOT EXISTS volume_total_aplicado_ml numeric,
  ADD COLUMN IF NOT EXISTS area_aplicada_ha numeric,
  ADD COLUMN IF NOT EXISTS produto_usado_id uuid,
  ADD COLUMN IF NOT EXISTS lote_usado_id uuid,
  ADD COLUMN IF NOT EXISTS responsavel_id uuid,
  ADD COLUMN IF NOT EXISTS equipamento_modelo text,
  ADD COLUMN IF NOT EXISTS bico_tipo text,
  ADD COLUMN IF NOT EXISTS pressao_bar numeric,
  ADD COLUMN IF NOT EXISTS temperatura_c numeric,
  ADD COLUMN IF NOT EXISTS umidade_pct numeric,
  ADD COLUMN IF NOT EXISTS vento_kmh numeric,
  ADD COLUMN IF NOT EXISTS latitude numeric,
  ADD COLUMN IF NOT EXISTS longitude numeric,
  ADD COLUMN IF NOT EXISTS assinatura_responsavel_url text,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS update_aplicacoes_updated_at ON public.aplicacoes;
CREATE TRIGGER update_aplicacoes_updated_at
  BEFORE UPDATE ON public.aplicacoes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Permitir SELECT do produtor nas aplicacoes
DROP POLICY IF EXISTS "Producer reads own applications" ON public.aplicacoes;
CREATE POLICY "Producer reads own applications"
ON public.aplicacoes FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.ordens_servico os
    WHERE os.id = aplicacoes.ordem_servico_id
      AND os.cliente_id = ANY(public.get_cliente_ids_for_user(auth.uid()))
  )
  OR EXISTS (
    SELECT 1 FROM public.ordens_servico_onfarm os
    WHERE os.id = aplicacoes.ordem_servico_id
      AND os.cliente_id = ANY(public.get_cliente_ids_for_user(auth.uid()))
  )
);

-- 3. Nova tabela aplicacao_evidencias
CREATE TABLE IF NOT EXISTS public.aplicacao_evidencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aplicacao_id uuid NOT NULL,
  tipo text NOT NULL DEFAULT 'foto',
  url text,
  storage_path text NOT NULL,
  legenda text,
  mime text,
  tamanho_bytes bigint,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_aplicacao_evidencias_aplicacao ON public.aplicacao_evidencias(aplicacao_id);

ALTER TABLE public.aplicacao_evidencias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manage evidencias"
ON public.aplicacao_evidencias FOR ALL TO authenticated
USING (
  has_role(auth.uid(), 'administrador'::app_role)
  OR has_role(auth.uid(), 'gestor'::app_role)
  OR has_role(auth.uid(), 'administrativo'::app_role)
  OR has_role(auth.uid(), 'consultor_tecnico'::app_role)
  OR has_role(auth.uid(), 'aplicador'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'administrador'::app_role)
  OR has_role(auth.uid(), 'gestor'::app_role)
  OR has_role(auth.uid(), 'administrativo'::app_role)
  OR has_role(auth.uid(), 'consultor_tecnico'::app_role)
  OR has_role(auth.uid(), 'aplicador'::app_role)
);

CREATE POLICY "Producer reads evidencias"
ON public.aplicacao_evidencias FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.aplicacoes a
    LEFT JOIN public.ordens_servico os ON os.id = a.ordem_servico_id
    LEFT JOIN public.ordens_servico_onfarm of ON of.id = a.ordem_servico_id
    WHERE a.id = aplicacao_evidencias.aplicacao_id
      AND (
        os.cliente_id = ANY(public.get_cliente_ids_for_user(auth.uid()))
        OR of.cliente_id = ANY(public.get_cliente_ids_for_user(auth.uid()))
      )
  )
);

-- 4. Bucket de storage
INSERT INTO storage.buckets (id, name, public)
VALUES ('aplicacao-evidencias', 'aplicacao-evidencias', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Staff manage evidencias storage"
ON storage.objects FOR ALL TO authenticated
USING (
  bucket_id = 'aplicacao-evidencias' AND (
    has_role(auth.uid(), 'administrador'::app_role)
    OR has_role(auth.uid(), 'gestor'::app_role)
    OR has_role(auth.uid(), 'administrativo'::app_role)
    OR has_role(auth.uid(), 'consultor_tecnico'::app_role)
    OR has_role(auth.uid(), 'aplicador'::app_role)
  )
)
WITH CHECK (
  bucket_id = 'aplicacao-evidencias' AND (
    has_role(auth.uid(), 'administrador'::app_role)
    OR has_role(auth.uid(), 'gestor'::app_role)
    OR has_role(auth.uid(), 'administrativo'::app_role)
    OR has_role(auth.uid(), 'consultor_tecnico'::app_role)
    OR has_role(auth.uid(), 'aplicador'::app_role)
  )
);

CREATE POLICY "Producer reads evidencias storage"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'aplicacao-evidencias'
  AND (storage.foldername(name))[1]::uuid = ANY(public.get_cliente_ids_for_user(auth.uid()))
);
