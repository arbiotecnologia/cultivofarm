-- CONSOLIDATED FIX FOR BUILD ERRORS
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
        CREATE TYPE public.app_role AS ENUM ('administrador', 'tecnico_agronomo', 'producao', 'administrativo', 'gestor');
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.configuracoes_sistema (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    nome_empresa text NOT NULL DEFAULT 'PULSE AGRÍCOLA',
    logo_url text,
    email_envio text,
    created_at timestamptz DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.configuracoes_sistema TO authenticated;
GRANT ALL ON public.configuracoes_sistema TO service_role;
ALTER TABLE public.configuracoes_sistema ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'configuracoes_sistema' 
        AND policyname = 'Public read for system config'
    ) THEN
        CREATE POLICY "Public read for system config" ON public.configuracoes_sistema FOR SELECT TO authenticated USING (true);
    END IF;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS public.produtos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    nome text NOT NULL,
    dose_ml_ha numeric,
    created_at timestamptz DEFAULT now()
);
GRANT SELECT ON public.produtos TO authenticated;
GRANT ALL ON public.produtos TO service_role;

CREATE TABLE IF NOT EXISTS public.clientes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), nome text NOT NULL);
CREATE TABLE IF NOT EXISTS public.fazendas (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), cliente_id uuid REFERENCES public.clientes(id), nome text NOT NULL);
CREATE TABLE IF NOT EXISTS public.talhoes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), fazenda_id uuid REFERENCES public.fazendas(id), nome text NOT NULL);
GRANT SELECT ON public.clientes, public.fazendas, public.talhoes TO authenticated;
GRANT ALL ON public.clientes, public.fazendas, public.talhoes TO service_role;

CREATE TABLE IF NOT EXISTS public.ordens_servico (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id uuid REFERENCES public.clientes(id),
    fazenda_id uuid REFERENCES public.fazendas(id),
    talhao_id uuid REFERENCES public.talhoes(id),
    produto_id uuid REFERENCES public.produtos(id),
    area_hectares numeric,
    volume_total_ml numeric,
    status text,
    created_at timestamptz DEFAULT now()
);
GRANT SELECT, UPDATE ON public.ordens_servico TO authenticated;
GRANT ALL ON public.ordens_servico TO service_role;

CREATE TABLE IF NOT EXISTS public.aplicacoes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ordem_servico_id uuid REFERENCES public.ordens_servico(id),
    data_aplicacao date,
    hora_inicio timestamptz,
    hora_fim timestamptz,
    responsavel_id uuid,
    responsavel text,
    modo_aplicacao text,
    lote_usado_id uuid,
    dose_aplicada numeric,
    volume_calda_l_ha numeric,
    area_aplicada_ha numeric,
    parent_id uuid,
    versao integer DEFAULT 1,
    is_latest boolean DEFAULT true,
    email_envio text,
    motivo_retificacao text,
    observacoes text,
    created_at timestamptz DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.aplicacoes TO authenticated;
GRANT ALL ON public.aplicacoes TO service_role;

CREATE TABLE IF NOT EXISTS public.evidencias (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), url text NOT NULL);
CREATE TABLE IF NOT EXISTS public.aplicacao_evidencias_vinculos (
    aplicacao_id uuid REFERENCES public.aplicacoes(id),
    evidencia_id uuid REFERENCES public.evidencias(id),
    PRIMARY KEY (aplicacao_id, evidencia_id)
);
GRANT SELECT, INSERT ON public.evidencias, public.aplicacao_evidencias_vinculos TO authenticated;
GRANT ALL ON public.evidencias, public.aplicacao_evidencias_vinculos TO service_role;
