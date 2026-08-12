-- FULL SCHEMA RESTORATION FOR BUILD FIX

-- ENUMS
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
        CREATE TYPE public.app_role AS ENUM ('administrador', 'tecnico_agronomo', 'producao', 'administrativo', 'gestor');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'status_os') THEN
        CREATE TYPE public.status_os AS ENUM ('aberta', 'aprovada', 'programada', 'em_producao', 'em_cq', 'envase', 'pronto_entrega', 'entregue', 'finalizada');
    END IF;
END $$;

-- PROFILES
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL DEFAULT '',
  email TEXT,
  ativo boolean DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- CONFIGURACOES_SISTEMA
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

-- CLIENTES / FAZENDAS / TALHOES
CREATE TABLE IF NOT EXISTS public.clientes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), nome text NOT NULL);
CREATE TABLE IF NOT EXISTS public.fazendas (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), cliente_id uuid REFERENCES public.clientes(id), nome text NOT NULL);
CREATE TABLE IF NOT EXISTS public.talhoes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), fazenda_id uuid REFERENCES public.fazendas(id), nome text NOT NULL);
GRANT SELECT ON public.clientes, public.fazendas, public.talhoes TO authenticated;
GRANT ALL ON public.clientes, public.fazendas, public.talhoes TO service_role;

-- PRODUTOS
CREATE TABLE IF NOT EXISTS public.produtos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    nome text NOT NULL,
    dose_ml_ha numeric,
    created_at timestamptz DEFAULT now()
);
GRANT SELECT ON public.produtos TO authenticated;
GRANT ALL ON public.produtos TO service_role;

-- ORDENS_SERVICO
CREATE TABLE IF NOT EXISTS public.ordens_servico (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id uuid REFERENCES public.clientes(id),
    fazenda_id uuid REFERENCES public.fazendas(id),
    talhao_id uuid REFERENCES public.talhoes(id),
    produto_id uuid REFERENCES public.produtos(id),
    area_hectares numeric,
    volume_total_ml numeric,
    status status_os DEFAULT 'aberta',
    created_at timestamptz DEFAULT now()
);
GRANT SELECT, UPDATE ON public.ordens_servico TO authenticated;
GRANT ALL ON public.ordens_servico TO service_role;

-- LOTES
CREATE TABLE IF NOT EXISTS public.lotes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    produto_id uuid REFERENCES public.produtos(id),
    codigo_lote text,
    volume_produzido numeric,
    status text,
    created_at timestamptz DEFAULT now()
);
GRANT SELECT ON public.lotes TO authenticated;
GRANT ALL ON public.lotes TO service_role;

-- PROGRAMACAO_PRODUCAO
CREATE TABLE IF NOT EXISTS public.programacao_producao (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ordem_servico_id uuid REFERENCES public.ordens_servico(id),
    created_at timestamptz DEFAULT now()
);
GRANT SELECT ON public.programacao_producao TO authenticated;
GRANT ALL ON public.programacao_producao TO service_role;

-- APLICACOES
CREATE TABLE IF NOT EXISTS public.aplicacoes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ordem_servico_id uuid REFERENCES public.ordens_servico(id),
    data_aplicacao date,
    hora_inicio timestamptz,
    hora_fim timestamptz,
    responsavel_id uuid,
    responsavel text,
    modo_aplicacao text,
    produto_usado_id uuid REFERENCES public.produtos(id),
    lote_usado_id uuid REFERENCES public.lotes(id),
    dose_aplicada numeric,
    volume_calda_l_ha numeric,
    volume_total_aplicado_ml numeric,
    area_aplicada_ha numeric,
    equipamento text,
    equipamento_modelo text,
    bico_tipo text,
    pressao_bar numeric,
    temperatura_c numeric,
    umidade_pct numeric,
    vento_kmh numeric,
    condicoes_climaticas text,
    latitude numeric,
    longitude numeric,
    resultado_inicial text,
    observacoes text,
    created_by uuid,
    parent_id uuid,
    versao integer DEFAULT 1,
    is_latest boolean DEFAULT true,
    email_envio text,
    motivo_retificacao text,
    created_at timestamptz DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.aplicacoes TO authenticated;
GRANT ALL ON public.aplicacoes TO service_role;

-- EVIDENCIAS
CREATE TABLE IF NOT EXISTS public.evidencias (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tipo text,
    url text NOT NULL,
    storage_path text,
    legenda text,
    mime text,
    tamanho_bytes bigint,
    versao_origem_id uuid,
    created_by uuid,
    created_at timestamptz DEFAULT now()
);
GRANT SELECT, INSERT ON public.evidencias TO authenticated;
GRANT ALL ON public.evidencias TO service_role;

CREATE TABLE IF NOT EXISTS public.aplicacao_evidencias_vinculos (
    aplicacao_id uuid REFERENCES public.aplicacoes(id),
    evidencia_id uuid REFERENCES public.evidencias(id),
    PRIMARY KEY (aplicacao_id, evidencia_id)
);
GRANT SELECT, INSERT ON public.aplicacao_evidencias_vinculos TO authenticated;
GRANT ALL ON public.aplicacao_evidencias_vinculos TO service_role;

-- APLICACAO_EVIDENCIAS (Antiga referência em alguns hooks)
CREATE TABLE IF NOT EXISTS public.aplicacao_evidencias (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    aplicacao_id uuid REFERENCES public.aplicacoes(id),
    evidencia_id uuid REFERENCES public.evidencias(id)
);
GRANT SELECT, INSERT ON public.aplicacao_evidencias TO authenticated;
GRANT ALL ON public.aplicacao_evidencias TO service_role;

-- BI USER PREFERENCES
CREATE TABLE IF NOT EXISTS public.bi_user_preferences (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid,
    secao text,
    preferences jsonb,
    created_at timestamptz DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.bi_user_preferences TO authenticated;
GRANT ALL ON public.bi_user_preferences TO service_role;

-- SECURE PORTAL NOTIFICATION RPC
CREATE OR REPLACE FUNCTION public.rpc_create_portal_notification_secure(
    _cliente_id uuid,
    _tipo text,
    _titulo text,
    _mensagem text,
    _link text,
    _source_type text,
    _source_id uuid,
    _idempotency_key text
) RETURNS void AS $$
BEGIN
    -- Mock para evitar erro de compilação/execução no frontend
    NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION public.rpc_create_portal_notification_secure TO authenticated;
