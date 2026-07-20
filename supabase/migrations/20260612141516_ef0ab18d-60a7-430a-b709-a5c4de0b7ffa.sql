
-- =========================================================================
-- Fase 12.1 — Central de Alertas Operacionais AR Bio (estrutura base)
-- =========================================================================

-- ================== TABELA: alertas_regras ==================
CREATE TABLE IF NOT EXISTS public.alertas_regras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL UNIQUE,
  nome text NOT NULL,
  descricao text NULL,
  origem text NOT NULL CHECK (origem IN ('visita','recomendacao','laboratorio','cq','estoque','entrega','bi','sistema')),
  gravidade_padrao text NOT NULL DEFAULT 'media' CHECK (gravidade_padrao IN ('informativa','baixa','media','alta','critica')),
  ativo boolean NOT NULL DEFAULT true,
  parametros jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.alertas_regras TO authenticated;
GRANT ALL ON public.alertas_regras TO service_role;

ALTER TABLE public.alertas_regras ENABLE ROW LEVEL SECURITY;

CREATE POLICY "alertas_regras_select_auth"
  ON public.alertas_regras FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "alertas_regras_admin_manage"
  ON public.alertas_regras FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'administrador') OR public.has_role(auth.uid(), 'gestor'))
  WITH CHECK (public.has_role(auth.uid(), 'administrador') OR public.has_role(auth.uid(), 'gestor'));

CREATE INDEX IF NOT EXISTS idx_alertas_regras_codigo ON public.alertas_regras(codigo);

CREATE TRIGGER trg_alertas_regras_updated_at
  BEFORE UPDATE ON public.alertas_regras
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ================== TABELA: alertas_operacionais ==================
CREATE TABLE IF NOT EXISTS public.alertas_operacionais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL,
  origem text NOT NULL CHECK (origem IN ('visita','recomendacao','laboratorio','cq','estoque','entrega','bi','sistema')),
  titulo text NOT NULL,
  descricao text NOT NULL,
  gravidade text NOT NULL DEFAULT 'media' CHECK (gravidade IN ('informativa','baixa','media','alta','critica')),
  status text NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto','lido','resolvido','ignorado','reaberto')),
  cliente_id uuid NULL,
  fazenda_id uuid NULL,
  talhao_id uuid NULL,
  consultor_id uuid NULL,
  os_id uuid NULL,
  os_origem text NULL,
  registro_consultor_id uuid NULL,
  solicitacao_id uuid NULL,
  lote_id uuid NULL,
  entrega_id uuid NULL,
  referencia_tabela text NULL,
  referencia_id uuid NULL,
  proxima_acao text NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  criado_por uuid NULL,
  resolvido_por uuid NULL,
  resolvido_em timestamptz NULL,
  ignorado_por uuid NULL,
  ignorado_em timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.alertas_operacionais TO authenticated;
GRANT ALL ON public.alertas_operacionais TO service_role;

ALTER TABLE public.alertas_operacionais ENABLE ROW LEVEL SECURITY;

-- SELECT por perfil
CREATE POLICY "alertas_op_select_admin_gestor_adm"
  ON public.alertas_operacionais FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'administrador')
    OR public.has_role(auth.uid(), 'gestor')
    OR public.has_role(auth.uid(), 'administrativo')
  );

CREATE POLICY "alertas_op_select_consultor"
  ON public.alertas_operacionais FOR SELECT TO authenticated
  USING (
    (public.has_role(auth.uid(), 'consultor_tecnico') OR public.has_role(auth.uid(), 'tecnico_agronomo'))
    AND consultor_id = auth.uid()
  );

CREATE POLICY "alertas_op_select_producao_onfarm"
  ON public.alertas_operacionais FOR SELECT TO authenticated
  USING (
    (public.has_role(auth.uid(), 'producao') OR public.has_role(auth.uid(), 'operador_onfarm'))
    AND origem IN ('laboratorio','cq','estoque','entrega')
  );

-- INSERT/UPDATE só para admin/gestor/administrativo (service_role bypassa RLS)
CREATE POLICY "alertas_op_insert_gestao"
  ON public.alertas_operacionais FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'administrador')
    OR public.has_role(auth.uid(), 'gestor')
    OR public.has_role(auth.uid(), 'administrativo')
  );

CREATE POLICY "alertas_op_update_gestao"
  ON public.alertas_operacionais FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'administrador')
    OR public.has_role(auth.uid(), 'gestor')
    OR public.has_role(auth.uid(), 'administrativo')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'administrador')
    OR public.has_role(auth.uid(), 'gestor')
    OR public.has_role(auth.uid(), 'administrativo')
  );

-- Índices
CREATE INDEX IF NOT EXISTS idx_alertas_operacionais_status ON public.alertas_operacionais(status);
CREATE INDEX IF NOT EXISTS idx_alertas_operacionais_gravidade ON public.alertas_operacionais(gravidade);
CREATE INDEX IF NOT EXISTS idx_alertas_operacionais_origem ON public.alertas_operacionais(origem);
CREATE INDEX IF NOT EXISTS idx_alertas_operacionais_cliente_id ON public.alertas_operacionais(cliente_id);
CREATE INDEX IF NOT EXISTS idx_alertas_operacionais_fazenda_id ON public.alertas_operacionais(fazenda_id);
CREATE INDEX IF NOT EXISTS idx_alertas_operacionais_consultor_id ON public.alertas_operacionais(consultor_id);
CREATE INDEX IF NOT EXISTS idx_alertas_operacionais_os_id ON public.alertas_operacionais(os_id);
CREATE INDEX IF NOT EXISTS idx_alertas_operacionais_created_at ON public.alertas_operacionais(created_at DESC);

-- Anti-duplicidade: índice único parcial para alertas ativos
CREATE UNIQUE INDEX IF NOT EXISTS uniq_alertas_abertos
  ON public.alertas_operacionais (tipo, origem, COALESCE(referencia_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE status IN ('aberto','lido','reaberto');

CREATE TRIGGER trg_alertas_op_updated_at
  BEFORE UPDATE ON public.alertas_operacionais
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ================== TABELA: alertas_leituras ==================
CREATE TABLE IF NOT EXISTS public.alertas_leituras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alerta_id uuid NOT NULL REFERENCES public.alertas_operacionais(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  lido_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE(alerta_id, user_id)
);

GRANT SELECT, INSERT ON public.alertas_leituras TO authenticated;
GRANT ALL ON public.alertas_leituras TO service_role;

ALTER TABLE public.alertas_leituras ENABLE ROW LEVEL SECURITY;

CREATE POLICY "alertas_leituras_self_select"
  ON public.alertas_leituras FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "alertas_leituras_self_insert"
  ON public.alertas_leituras FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_alertas_leituras_alerta_id ON public.alertas_leituras(alerta_id);
CREATE INDEX IF NOT EXISTS idx_alertas_leituras_user_id ON public.alertas_leituras(user_id);

-- ================== TABELA: alertas_acoes ==================
CREATE TABLE IF NOT EXISTS public.alertas_acoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alerta_id uuid NOT NULL REFERENCES public.alertas_operacionais(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  acao text NOT NULL,
  observacao text NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.alertas_acoes TO authenticated;
GRANT ALL ON public.alertas_acoes TO service_role;

ALTER TABLE public.alertas_acoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "alertas_acoes_select_admin"
  ON public.alertas_acoes FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'administrador')
    OR public.has_role(auth.uid(), 'gestor')
    OR user_id = auth.uid()
  );

CREATE POLICY "alertas_acoes_insert_self"
  ON public.alertas_acoes FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.alertas_operacionais a WHERE a.id = alerta_id
    )
  );

CREATE INDEX IF NOT EXISTS idx_alertas_acoes_alerta_id ON public.alertas_acoes(alerta_id);
CREATE INDEX IF NOT EXISTS idx_alertas_acoes_user_id ON public.alertas_acoes(user_id);

-- ================== SEED: catálogo de regras ==================
INSERT INTO public.alertas_regras (codigo, nome, descricao, origem, gravidade_padrao) VALUES
  ('visita_sem_checkin','Visita sem check-in','Visita agendada não teve check-in registrado.','visita','media'),
  ('visita_finalizada_sem_recomendacao','Visita sem recomendação','Visita finalizada sem recomendação técnica vinculada.','visita','media'),
  ('recomendacao_liberada_sem_decisao','Recomendação aguardando decisão','Recomendação liberada e aguardando aprovação/rejeição do produtor.','recomendacao','media'),
  ('recomendacao_convertida_sem_os','Recomendação convertida sem OS','Recomendação convertida em produção sem ordem de serviço gerada.','recomendacao','alta'),
  ('os_sem_programacao','OS sem programação','Ordem de serviço sem PCP vinculado.','bi','alta'),
  ('os_sem_lote','OS sem lote','Ordem de serviço sem lote associado para produção.','bi','alta'),
  ('cq_pendente','CQ pendente','Lote aguardando análise de controle de qualidade.','cq','media'),
  ('cq_reprovado','CQ reprovado','Lote reprovado no controle de qualidade.','cq','critica'),
  ('os_sem_envase','OS sem envase','Ordem aprovada sem envase realizado.','bi','alta'),
  ('os_sem_estoque','OS sem estoque','Produto da OS sem reserva ou movimentação de estoque.','estoque','alta'),
  ('entrega_pendente','Entrega pendente','Entrega programada não confirmada no prazo.','entrega','alta'),
  ('os_apta_finalizacao','OS apta para finalização','OS com todas as etapas concluídas, aguardando encerramento.','bi','media'),
  ('aplicacao_nao_registrada','Aplicação em campo não registrada','Entrega confirmada sem registro de aplicação em campo (informativo).','entrega','baixa')
ON CONFLICT (codigo) DO NOTHING;

-- ================== RPC: rpc_gerar_alertas_operacionais ==================
CREATE OR REPLACE FUNCTION public.rpc_gerar_alertas_operacionais()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inseridos int := 0;
  v_atualizados int := 0;
BEGIN
  -- Guard de permissão
  IF NOT (
    public.has_role(auth.uid(), 'administrador')
    OR public.has_role(auth.uid(), 'gestor')
    OR public.has_role(auth.uid(), 'administrativo')
    OR auth.role() = 'service_role'
  ) THEN
    RAISE EXCEPTION 'Permissão negada para gerar alertas operacionais';
  END IF;

  -- Esta RPC é a base para a reconciliação. Nesta fase 12.1, fica preparada
  -- para receber as queries específicas de cada regra. A inserção é
  -- idempotente via índice único parcial uniq_alertas_abertos.
  --
  -- Estrutura prevista por regra (exemplo, sem dados fake):
  --
  -- INSERT INTO public.alertas_operacionais (...)
  -- SELECT ... FROM public.vw_<view> v
  -- WHERE <condição da regra ativa>
  -- ON CONFLICT (tipo, origem, COALESCE(referencia_id, '00000000-...'))
  -- WHERE status IN ('aberto','lido','reaberto')
  -- DO UPDATE SET updated_at = now(),
  --               descricao = EXCLUDED.descricao,
  --               proxima_acao = EXCLUDED.proxima_acao,
  --               metadata = EXCLUDED.metadata;
  --
  -- Nunca usar DELETE. A resolução é feita via UPDATE de status.

  RETURN jsonb_build_object(
    'ok', true,
    'inseridos', v_inseridos,
    'atualizados', v_atualizados,
    'executado_em', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_gerar_alertas_operacionais() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_gerar_alertas_operacionais() TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_gerar_alertas_operacionais() TO service_role;
