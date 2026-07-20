-- Índices para registros_consultor
CREATE INDEX IF NOT EXISTS idx_registros_consultor_cliente_id ON public.registros_consultor (cliente_id);
CREATE INDEX IF NOT EXISTS idx_registros_consultor_fazenda_id ON public.registros_consultor (fazenda_id);
CREATE INDEX IF NOT EXISTS idx_registros_consultor_talhao_id ON public.registros_consultor (talhao_id);
CREATE INDEX IF NOT EXISTS idx_registros_consultor_status ON public.registros_consultor (status);
CREATE INDEX IF NOT EXISTS idx_registros_consultor_data_vistoria ON public.registros_consultor (data_vistoria);
CREATE INDEX IF NOT EXISTS idx_registros_consultor_created_at ON public.registros_consultor (created_at DESC);

-- Índices para entregas
CREATE INDEX IF NOT EXISTS idx_entregas_cliente_id ON public.entregas (cliente_id);
CREATE INDEX IF NOT EXISTS idx_entregas_ordem_servico_id ON public.entregas (ordem_servico_id);
CREATE INDEX IF NOT EXISTS idx_entregas_status ON public.entregas (status);
CREATE INDEX IF NOT EXISTS idx_entregas_created_at ON public.entregas (created_at DESC);

-- Índices para lotes
CREATE INDEX IF NOT EXISTS idx_lotes_produto_id ON public.lotes (produto_id);
CREATE INDEX IF NOT EXISTS idx_lotes_status ON public.lotes (status);
CREATE INDEX IF NOT EXISTS idx_lotes_data_producao ON public.lotes (data_producao);
CREATE INDEX IF NOT EXISTS idx_lotes_created_at ON public.lotes (created_at DESC);

-- Índices para portal_solicitacoes
CREATE INDEX IF NOT EXISTS idx_portal_solicitacoes_cliente_id ON public.portal_solicitacoes (cliente_id);
CREATE INDEX IF NOT EXISTS idx_portal_solicitacoes_fazenda_id ON public.portal_solicitacoes (fazenda_id);
CREATE INDEX IF NOT EXISTS idx_portal_solicitacoes_status ON public.portal_solicitacoes (status);
CREATE INDEX IF NOT EXISTS idx_portal_solicitacoes_created_at ON public.portal_solicitacoes (created_at DESC);

-- Índices para ordens_servico
CREATE INDEX IF NOT EXISTS idx_ordens_servico_cliente_id ON public.ordens_servico (cliente_id);
CREATE INDEX IF NOT EXISTS idx_ordens_servico_fazenda_id ON public.ordens_servico (fazenda_id);
CREATE INDEX IF NOT EXISTS idx_ordens_servico_status ON public.ordens_servico (status);
CREATE INDEX IF NOT EXISTS idx_ordens_servico_created_at ON public.ordens_servico (created_at DESC);

-- Índices para talhoes
CREATE INDEX IF NOT EXISTS idx_talhoes_fazenda_id ON public.talhoes (fazenda_id);

-- Índices para fazendas
CREATE INDEX IF NOT EXISTS idx_fazendas_cliente_id ON public.fazendas (cliente_id);

-- Índices para profiles
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles (email);
CREATE INDEX IF NOT EXISTS idx_profiles_ativo ON public.profiles (ativo);
