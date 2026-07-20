-- Tipos enum para clientes
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'cliente_tipo_pessoa') THEN
        CREATE TYPE public.cliente_tipo_pessoa AS ENUM ('fisica', 'juridica');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'cliente_status') THEN
        CREATE TYPE public.cliente_status AS ENUM ('prospect', 'ativo', 'inativo', 'bloqueado_financeiro');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'cliente_doc_tipo') THEN
        CREATE TYPE public.cliente_doc_tipo AS ENUM ('contrato_social', 'procuracao', 'car_mapa', 'outro');
    END IF;
END $$;

-- Alteração da tabela clientes
ALTER TABLE public.clientes 
ADD COLUMN IF NOT EXISTS tipo_pessoa public.cliente_tipo_pessoa DEFAULT 'juridica',
ADD COLUMN IF NOT EXISTS razao_social TEXT,
ADD COLUMN IF NOT EXISTS nome_fantasia TEXT,
ADD COLUMN IF NOT EXISTS inscricao_estadual TEXT,
ADD COLUMN IF NOT EXISTS inscricao_municipal TEXT,
ADD COLUMN IF NOT EXISTS site TEXT,
ADD COLUMN IF NOT EXISTS segmento TEXT,
-- Endereço Principal
ADD COLUMN IF NOT EXISTS endereco_cep TEXT,
ADD COLUMN IF NOT EXISTS endereco_logradouro TEXT,
ADD COLUMN IF NOT EXISTS endereco_numero TEXT,
ADD COLUMN IF NOT EXISTS endereco_complemento TEXT,
ADD COLUMN IF NOT EXISTS endereco_bairro TEXT,
ADD COLUMN IF NOT EXISTS endereco_municipio TEXT,
ADD COLUMN IF NOT EXISTS endereco_estado TEXT,
ADD COLUMN IF NOT EXISTS endereco_latitude NUMERIC,
ADD COLUMN IF NOT EXISTS endereco_longitude NUMERIC,
-- Cobrança
ADD COLUMN IF NOT EXISTS cobranca_mesmo_endereco BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS cobranca_cep TEXT,
ADD COLUMN IF NOT EXISTS cobranca_logradouro TEXT,
ADD COLUMN IF NOT EXISTS cobranca_numero TEXT,
ADD COLUMN IF NOT EXISTS cobranca_complemento TEXT,
ADD COLUMN IF NOT EXISTS cobranca_bairro TEXT,
ADD COLUMN IF NOT EXISTS cobranca_municipio TEXT,
ADD COLUMN IF NOT EXISTS cobranca_estado TEXT,
-- Financeiro e Sugestões
ADD COLUMN IF NOT EXISTS contato_financeiro_nome TEXT,
ADD COLUMN IF NOT EXISTS contato_financeiro_email TEXT,
ADD COLUMN IF NOT EXISTS contato_financeiro_telefone TEXT,
ADD COLUMN IF NOT EXISTS status_cliente public.cliente_status DEFAULT 'ativo',
ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS limite_credito NUMERIC,
ADD COLUMN IF NOT EXISTS condicao_pagamento TEXT,
ADD COLUMN IF NOT EXISTS banco_nome TEXT,
ADD COLUMN IF NOT EXISTS banco_agencia TEXT,
ADD COLUMN IF NOT EXISTS banco_conta TEXT,
ADD COLUMN IF NOT EXISTS banco_tipo_conta TEXT,
ADD COLUMN IF NOT EXISTS banco_pix_chave TEXT,
ADD COLUMN IF NOT EXISTS banco_pix_tipo TEXT;

-- Alteração da tabela fazendas
ALTER TABLE public.fazendas
ADD COLUMN IF NOT EXISTS codigo_referencia TEXT,
ADD COLUMN IF NOT EXISTS consultor_responsavel_id UUID REFERENCES public.profiles(user_id),
ADD COLUMN IF NOT EXISTS area_produtiva NUMERIC,
ADD COLUMN IF NOT EXISTS tipo_exploracao TEXT,
ADD COLUMN IF NOT EXISTS inscricao_estadual_produtor TEXT,
ADD COLUMN IF NOT EXISTS car TEXT,
ADD COLUMN IF NOT EXISTS nirf TEXT,
ADD COLUMN IF NOT EXISTS endereco_acesso TEXT,
ADD COLUMN IF NOT EXISTS ponto_referencia TEXT,
ADD COLUMN IF NOT EXISTS distancia_sede_km NUMERIC,
ADD COLUMN IF NOT EXISTS responsavel_local_nome TEXT,
ADD COLUMN IF NOT EXISTS responsavel_local_telefone TEXT;

-- Índice para código de referência único por cliente
CREATE UNIQUE INDEX IF NOT EXISTS idx_fazendas_cliente_codigo ON public.fazendas (cliente_id, codigo_referencia) WHERE codigo_referencia IS NOT NULL;

-- Tabela de contatos extras (A)
CREATE TABLE IF NOT EXISTS public.cliente_contatos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    cargo TEXT,
    email TEXT,
    telefone TEXT,
    principal BOOLEAN DEFAULT false,
    observacoes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Tabela de auditoria (B)
CREATE TABLE IF NOT EXISTS public.clientes_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    changed_by UUID REFERENCES public.profiles(user_id),
    changed_at TIMESTAMPTZ DEFAULT now(),
    old_data JSONB,
    new_data JSONB,
    diff JSONB
);

-- Tabela de documentos (E)
CREATE TABLE IF NOT EXISTS public.cliente_documentos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    tipo public.cliente_doc_tipo DEFAULT 'outro',
    arquivo_path TEXT NOT NULL,
    arquivo_url TEXT,
    tamanho_bytes BIGINT,
    mime TEXT,
    uploaded_by UUID REFERENCES public.profiles(user_id),
    uploaded_at TIMESTAMPTZ DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.cliente_contatos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cliente_documentos ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Acesso total contatos para autenticados" ON public.cliente_contatos FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Leitura auditoria para gestores" ON public.clientes_audit_log FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND cargo IN ('gestor', 'administrador')));
CREATE POLICY "Acesso total documentos para autenticados" ON public.cliente_documentos FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Trigger Auditoria Clientes
CREATE OR REPLACE FUNCTION public.trg_clientes_audit()
RETURNS TRIGGER AS $$
DECLARE
    old_val JSONB := NULL;
    new_val JSONB := NULL;
    v_diff JSONB := '{}'::jsonb;
BEGIN
    IF (TG_OP = 'UPDATE') THEN
        old_val := to_jsonb(OLD);
        new_val := to_jsonb(NEW);
        SELECT jsonb_object_agg(key, value) INTO v_diff FROM jsonb_each(new_val) WHERE new_val->key IS DISTINCT FROM old_val->key;
    ELSIF (TG_OP = 'INSERT') THEN
        new_val := to_jsonb(NEW);
    ELSIF (TG_OP = 'DELETE') THEN
        old_val := to_jsonb(OLD);
    END IF;

    INSERT INTO public.clientes_audit_log (cliente_id, action, changed_by, old_data, new_data, diff)
    VALUES (COALESCE(NEW.id, OLD.id), TG_OP, auth.uid(), old_val, new_val, v_diff);
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER clientes_audit_trg
AFTER INSERT OR UPDATE OR DELETE ON public.clientes
FOR EACH ROW EXECUTE FUNCTION public.trg_clientes_audit();

-- Backfill Consultor
DO $$
DECLARE
    r RECORD;
    v_consultor_id UUID;
BEGIN
    FOR r IN SELECT id, consultor_responsavel FROM public.clientes WHERE consultor_responsavel IS NOT NULL AND consultor_responsavel <> '' LOOP
        SELECT user_id INTO v_consultor_id FROM public.profiles WHERE LOWER(nome) = LOWER(r.consultor_responsavel) LIMIT 1;
        
        IF v_consultor_id IS NOT NULL THEN
            UPDATE public.fazendas SET consultor_responsavel_id = v_consultor_id WHERE cliente_id = r.id;
        END IF;
    END LOOP;
END $$;

-- Remover coluna antiga
ALTER TABLE public.clientes DROP COLUMN IF EXISTS consultor_responsavel;

-- Configurar Storage
INSERT INTO storage.buckets (id, name, public) VALUES ('clientes-docs', 'clientes-docs', false) ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Upload docs clientes" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'clientes-docs');
CREATE POLICY "Leitura docs clientes" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'clientes-docs');
CREATE POLICY "Deleção docs clientes" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'clientes-docs');
