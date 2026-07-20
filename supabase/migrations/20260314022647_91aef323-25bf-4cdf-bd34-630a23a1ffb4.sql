
-- =============================================
-- AR Bio On-Farm Manager - Complete Database
-- =============================================

-- ENUMS
CREATE TYPE public.app_role AS ENUM ('administrador', 'tecnico_agronomo', 'producao', 'administrativo', 'gestor');
CREATE TYPE public.tipo_problema AS ENUM ('praga', 'doenca', 'solo', 'nutricao', 'nematoide');
CREATE TYPE public.tipo_produto AS ENUM ('inseticida', 'fungicida', 'solo', 'inoculante', 'solubilizador');
CREATE TYPE public.tipo_microrganismo AS ENUM ('bacteria', 'fungo', 'levedura', 'consorcio');
CREATE TYPE public.nivel_severidade AS ENUM ('baixo', 'medio', 'alto');
CREATE TYPE public.status_diagnostico AS ENUM ('novo', 'em_analise', 'diagnostico_concluido');
CREATE TYPE public.prioridade_os AS ENUM ('baixa', 'media', 'alta');
CREATE TYPE public.status_os AS ENUM ('aberta', 'aprovada', 'programada', 'em_producao', 'em_cq', 'envase', 'pronto_entrega', 'entregue', 'finalizada');
CREATE TYPE public.status_programacao AS ENUM ('aguardando', 'em_producao', 'aguardando_cq', 'aprovado');
CREATE TYPE public.status_lote AS ENUM ('em_producao', 'aguardando_cq', 'aprovado', 'reprovado');
CREATE TYPE public.resultado_cq AS ENUM ('aprovado', 'reprovado');
CREATE TYPE public.tipo_embalagem AS ENUM ('frasco_1L', 'bombona_5L', 'bombona_20L');
CREATE TYPE public.status_estoque AS ENUM ('disponivel', 'reservado', 'expedido');
CREATE TYPE public.status_entrega AS ENUM ('separado', 'em_rota', 'entregue');

-- UPDATED_AT TRIGGER FUNCTION
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- PROFILES
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL DEFAULT '',
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- USER ROLES
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function for role checking
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can manage roles" ON public.user_roles FOR ALL USING (public.has_role(auth.uid(), 'administrador'));

-- Auto-create profile + default role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, nome, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'nome', ''), NEW.email);
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'administrativo');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- CLIENTES
CREATE TABLE public.clientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  cpf_cnpj TEXT,
  telefone TEXT,
  email TEXT,
  consultor_responsavel TEXT,
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read clientes" ON public.clientes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert clientes" ON public.clientes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update clientes" ON public.clientes FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Admins can delete clientes" ON public.clientes FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'administrador'));
CREATE TRIGGER update_clientes_updated_at BEFORE UPDATE ON public.clientes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- FAZENDAS
CREATE TABLE public.fazendas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  municipio TEXT,
  estado TEXT,
  area_total NUMERIC,
  latitude NUMERIC,
  longitude NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.fazendas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read fazendas" ON public.fazendas FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert fazendas" ON public.fazendas FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update fazendas" ON public.fazendas FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Admins can delete fazendas" ON public.fazendas FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'administrador'));
CREATE TRIGGER update_fazendas_updated_at BEFORE UPDATE ON public.fazendas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- CULTURAS
CREATE TABLE public.culturas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  descricao TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.culturas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read culturas" ON public.culturas FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert culturas" ON public.culturas FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update culturas" ON public.culturas FOR UPDATE TO authenticated USING (true);

-- TALHOES
CREATE TABLE public.talhoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id UUID NOT NULL REFERENCES public.fazendas(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  area_hectares NUMERIC,
  cultura_id UUID REFERENCES public.culturas(id),
  historico_pragas TEXT,
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.talhoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read talhoes" ON public.talhoes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert talhoes" ON public.talhoes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update talhoes" ON public.talhoes FOR UPDATE TO authenticated USING (true);
CREATE TRIGGER update_talhoes_updated_at BEFORE UPDATE ON public.talhoes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- PROBLEMAS FITOSSANITARIOS
CREATE TABLE public.problemas_fitossanitarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  tipo tipo_problema NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.problemas_fitossanitarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read problemas" ON public.problemas_fitossanitarios FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert problemas" ON public.problemas_fitossanitarios FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update problemas" ON public.problemas_fitossanitarios FOR UPDATE TO authenticated USING (true);

-- PRODUTOS
CREATE TABLE public.produtos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  tipo tipo_produto NOT NULL,
  dose_ml_ha NUMERIC,
  descricao TEXT,
  modo_acao TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.produtos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read produtos" ON public.produtos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert produtos" ON public.produtos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update produtos" ON public.produtos FOR UPDATE TO authenticated USING (true);
CREATE TRIGGER update_produtos_updated_at BEFORE UPDATE ON public.produtos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- MICRORGANISMOS
CREATE TABLE public.microrganismos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  tipo tipo_microrganismo NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.microrganismos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read microrganismos" ON public.microrganismos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert microrganismos" ON public.microrganismos FOR INSERT TO authenticated WITH CHECK (true);

-- FORMULACOES
CREATE TABLE public.formulacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id UUID NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
  microrganismo_id UUID NOT NULL REFERENCES public.microrganismos(id) ON DELETE CASCADE,
  concentracao NUMERIC,
  unidade TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.formulacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read formulacoes" ON public.formulacoes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert formulacoes" ON public.formulacoes FOR INSERT TO authenticated WITH CHECK (true);

-- DIAGNOSTICOS
CREATE TABLE public.diagnosticos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES public.clientes(id),
  fazenda_id UUID NOT NULL REFERENCES public.fazendas(id),
  talhao_id UUID NOT NULL REFERENCES public.talhoes(id),
  cultura_id UUID REFERENCES public.culturas(id),
  problema_id UUID REFERENCES public.problemas_fitossanitarios(id),
  nivel_severidade nivel_severidade NOT NULL DEFAULT 'medio',
  descricao TEXT,
  fotos TEXT[],
  tecnico_responsavel UUID REFERENCES auth.users(id),
  data_visita DATE,
  status status_diagnostico NOT NULL DEFAULT 'novo',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.diagnosticos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read diagnosticos" ON public.diagnosticos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert diagnosticos" ON public.diagnosticos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update diagnosticos" ON public.diagnosticos FOR UPDATE TO authenticated USING (true);
CREATE TRIGGER update_diagnosticos_updated_at BEFORE UPDATE ON public.diagnosticos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RECOMENDACOES
CREATE TABLE public.recomendacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  diagnostico_id UUID NOT NULL REFERENCES public.diagnosticos(id) ON DELETE CASCADE,
  produto_id UUID NOT NULL REFERENCES public.produtos(id),
  dose_ml_ha NUMERIC NOT NULL,
  area_hectares NUMERIC NOT NULL,
  volume_total_ml NUMERIC GENERATED ALWAYS AS (dose_ml_ha * area_hectares) STORED,
  modo_aplicacao TEXT,
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.recomendacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read recomendacoes" ON public.recomendacoes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert recomendacoes" ON public.recomendacoes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update recomendacoes" ON public.recomendacoes FOR UPDATE TO authenticated USING (true);

-- ORDENS DE SERVICO
CREATE TABLE public.ordens_servico (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES public.clientes(id),
  fazenda_id UUID NOT NULL REFERENCES public.fazendas(id),
  talhao_id UUID NOT NULL REFERENCES public.talhoes(id),
  produto_id UUID NOT NULL REFERENCES public.produtos(id),
  recomendacao_id UUID REFERENCES public.recomendacoes(id),
  volume_total_ml NUMERIC,
  area_hectares NUMERIC,
  data_programada DATE,
  prioridade prioridade_os NOT NULL DEFAULT 'media',
  status status_os NOT NULL DEFAULT 'aberta',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.ordens_servico ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read os" ON public.ordens_servico FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert os" ON public.ordens_servico FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update os" ON public.ordens_servico FOR UPDATE TO authenticated USING (true);
CREATE TRIGGER update_os_updated_at BEFORE UPDATE ON public.ordens_servico FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- PROGRAMACAO PRODUCAO
CREATE TABLE public.programacao_producao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ordem_servico_id UUID NOT NULL REFERENCES public.ordens_servico(id) ON DELETE CASCADE,
  produto_id UUID NOT NULL REFERENCES public.produtos(id),
  volume_necessario NUMERIC,
  data_programada DATE,
  responsavel TEXT,
  status status_programacao NOT NULL DEFAULT 'aguardando',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.programacao_producao ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read programacao" ON public.programacao_producao FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert programacao" ON public.programacao_producao FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update programacao" ON public.programacao_producao FOR UPDATE TO authenticated USING (true);
CREATE TRIGGER update_programacao_updated_at BEFORE UPDATE ON public.programacao_producao FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- LOTES
CREATE TABLE public.lotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo_lote TEXT NOT NULL UNIQUE,
  produto_id UUID NOT NULL REFERENCES public.produtos(id),
  programacao_id UUID REFERENCES public.programacao_producao(id),
  volume_produzido NUMERIC,
  data_producao DATE NOT NULL DEFAULT CURRENT_DATE,
  responsavel_producao TEXT,
  tanque TEXT,
  status status_lote NOT NULL DEFAULT 'em_producao',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.lotes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read lotes" ON public.lotes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert lotes" ON public.lotes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update lotes" ON public.lotes FOR UPDATE TO authenticated USING (true);
CREATE TRIGGER update_lotes_updated_at BEFORE UPDATE ON public.lotes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- CONTROLE DE QUALIDADE
CREATE TABLE public.controle_qualidade (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lote_id UUID NOT NULL REFERENCES public.lotes(id) ON DELETE CASCADE,
  ph NUMERIC,
  aparencia TEXT,
  odor TEXT,
  concentracao NUMERIC,
  contaminacao TEXT,
  data_analise DATE NOT NULL DEFAULT CURRENT_DATE,
  responsavel TEXT,
  resultado resultado_cq,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.controle_qualidade ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read cq" ON public.controle_qualidade FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert cq" ON public.controle_qualidade FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update cq" ON public.controle_qualidade FOR UPDATE TO authenticated USING (true);

-- ENVASE
CREATE TABLE public.envase (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lote_id UUID NOT NULL REFERENCES public.lotes(id),
  tipo_embalagem tipo_embalagem NOT NULL,
  volume_por_unidade NUMERIC,
  quantidade INTEGER,
  data_envase DATE NOT NULL DEFAULT CURRENT_DATE,
  operador TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.envase ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read envase" ON public.envase FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert envase" ON public.envase FOR INSERT TO authenticated WITH CHECK (true);

-- ESTOQUE
CREATE TABLE public.estoque_produto (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id UUID NOT NULL REFERENCES public.produtos(id),
  lote_id UUID NOT NULL REFERENCES public.lotes(id),
  quantidade NUMERIC,
  volume_total NUMERIC,
  validade DATE,
  status status_estoque NOT NULL DEFAULT 'disponivel',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.estoque_produto ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read estoque" ON public.estoque_produto FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert estoque" ON public.estoque_produto FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update estoque" ON public.estoque_produto FOR UPDATE TO authenticated USING (true);
CREATE TRIGGER update_estoque_updated_at BEFORE UPDATE ON public.estoque_produto FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ENTREGAS
CREATE TABLE public.entregas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ordem_servico_id UUID NOT NULL REFERENCES public.ordens_servico(id),
  cliente_id UUID NOT NULL REFERENCES public.clientes(id),
  data_saida DATE,
  motorista TEXT,
  veiculo TEXT,
  status status_entrega NOT NULL DEFAULT 'separado',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.entregas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read entregas" ON public.entregas FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert entregas" ON public.entregas FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update entregas" ON public.entregas FOR UPDATE TO authenticated USING (true);
CREATE TRIGGER update_entregas_updated_at BEFORE UPDATE ON public.entregas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- APLICACOES
CREATE TABLE public.aplicacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ordem_servico_id UUID NOT NULL REFERENCES public.ordens_servico(id),
  data_aplicacao DATE NOT NULL DEFAULT CURRENT_DATE,
  responsavel TEXT,
  equipamento TEXT,
  condicoes_climaticas TEXT,
  dose_aplicada NUMERIC,
  observacoes TEXT,
  resultado_inicial TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.aplicacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read aplicacoes" ON public.aplicacoes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert aplicacoes" ON public.aplicacoes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update aplicacoes" ON public.aplicacoes FOR UPDATE TO authenticated USING (true);

-- ARQUIVOS (ANEXOS)
CREATE TABLE public.arquivos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entidade_tipo TEXT NOT NULL,
  entidade_id UUID NOT NULL,
  arquivo_url TEXT NOT NULL,
  descricao TEXT,
  data_upload TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.arquivos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read arquivos" ON public.arquivos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert arquivos" ON public.arquivos FOR INSERT TO authenticated WITH CHECK (true);

-- AUTO-GENERATE PROGRAMACAO WHEN OS IS APPROVED (trigger)
CREATE OR REPLACE FUNCTION public.auto_create_programacao()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'aprovada' AND (OLD.status IS NULL OR OLD.status != 'aprovada') THEN
    INSERT INTO public.programacao_producao (ordem_servico_id, produto_id, volume_necessario, data_programada, status)
    VALUES (NEW.id, NEW.produto_id, NEW.volume_total_ml, NEW.data_programada, 'aguardando');
    NEW.status = 'programada';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trigger_auto_programacao
BEFORE UPDATE ON public.ordens_servico
FOR EACH ROW EXECUTE FUNCTION public.auto_create_programacao();
