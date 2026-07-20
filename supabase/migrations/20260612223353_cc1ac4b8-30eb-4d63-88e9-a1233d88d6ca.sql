
-- =========================================
-- Tabela: alertas_sla_config
-- =========================================
CREATE TABLE IF NOT EXISTS public.alertas_sla_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL UNIQUE,
  nome text NOT NULL,
  descricao text NULL,
  ativo boolean NOT NULL DEFAULT true,
  origem text NULL,
  tipo_alerta text NULL,
  gravidade text NOT NULL,
  prazo_primeira_resposta_minutos integer NULL,
  prazo_resolucao_minutos integer NOT NULL,
  escalonar_apos_minutos integer NULL,
  nova_gravidade_apos_sla text NULL,
  notificar_gestor boolean NOT NULL DEFAULT true,
  notificar_responsavel boolean NOT NULL DEFAULT false,
  aplica_horario_comercial boolean NOT NULL DEFAULT false,
  horario_inicio time NULL,
  horario_fim time NULL,
  dias_semana integer[] NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.alertas_sla_config TO authenticated;
GRANT ALL ON public.alertas_sla_config TO service_role;
ALTER TABLE public.alertas_sla_config ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_alertas_sla_config_codigo ON public.alertas_sla_config(codigo);
CREATE INDEX IF NOT EXISTS idx_alertas_sla_config_ativo ON public.alertas_sla_config(ativo);
CREATE INDEX IF NOT EXISTS idx_alertas_sla_config_gravidade ON public.alertas_sla_config(gravidade);
CREATE INDEX IF NOT EXISTS idx_alertas_sla_config_origem ON public.alertas_sla_config(origem);
CREATE INDEX IF NOT EXISTS idx_alertas_sla_config_tipo_alerta ON public.alertas_sla_config(tipo_alerta);

CREATE POLICY "Admin e gestor gerenciam SLA config"
  ON public.alertas_sla_config FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'gestor'))
  WITH CHECK (public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'gestor'));

CREATE POLICY "Administrativo visualiza SLA config"
  ON public.alertas_sla_config FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'administrativo'));

CREATE TRIGGER trg_alertas_sla_config_updated
  BEFORE UPDATE ON public.alertas_sla_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================
-- Alterações em alertas_operacionais
-- =========================================
ALTER TABLE public.alertas_operacionais
  ADD COLUMN IF NOT EXISTS sla_config_id uuid NULL REFERENCES public.alertas_sla_config(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sla_primeira_resposta_em timestamptz NULL,
  ADD COLUMN IF NOT EXISTS sla_resolucao_em timestamptz NULL,
  ADD COLUMN IF NOT EXISTS primeira_resposta_em timestamptz NULL,
  ADD COLUMN IF NOT EXISTS sla_vencido boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sla_vencido_em timestamptz NULL,
  ADD COLUMN IF NOT EXISTS escalonado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS escalonado_em timestamptz NULL,
  ADD COLUMN IF NOT EXISTS escalonado_para uuid NULL,
  ADD COLUMN IF NOT EXISTS prioridade_score integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS responsavel_id uuid NULL;

CREATE INDEX IF NOT EXISTS idx_alertas_operacionais_sla_vencido ON public.alertas_operacionais(sla_vencido);
CREATE INDEX IF NOT EXISTS idx_alertas_operacionais_sla_resolucao_em ON public.alertas_operacionais(sla_resolucao_em);
CREATE INDEX IF NOT EXISTS idx_alertas_operacionais_escalonado ON public.alertas_operacionais(escalonado);
CREATE INDEX IF NOT EXISTS idx_alertas_operacionais_responsavel_id ON public.alertas_operacionais(responsavel_id);
CREATE INDEX IF NOT EXISTS idx_alertas_operacionais_prioridade_score ON public.alertas_operacionais(prioridade_score DESC);

-- =========================================
-- Tabela: alertas_sla_eventos
-- =========================================
CREATE TABLE IF NOT EXISTS public.alertas_sla_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alerta_id uuid NOT NULL REFERENCES public.alertas_operacionais(id) ON DELETE CASCADE,
  config_id uuid NULL REFERENCES public.alertas_sla_config(id) ON DELETE SET NULL,
  evento text NOT NULL,
  gravidade_anterior text NULL,
  gravidade_nova text NULL,
  prazo_primeira_resposta_em timestamptz NULL,
  prazo_resolucao_em timestamptz NULL,
  vencido_em timestamptz NULL,
  escalonado_em timestamptz NULL,
  responsavel_id uuid NULL,
  gestor_notificado boolean NOT NULL DEFAULT false,
  observacao text NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  criado_por uuid NULL
);

GRANT SELECT, INSERT ON public.alertas_sla_eventos TO authenticated;
GRANT ALL ON public.alertas_sla_eventos TO service_role;
ALTER TABLE public.alertas_sla_eventos ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_alertas_sla_eventos_alerta_id ON public.alertas_sla_eventos(alerta_id);
CREATE INDEX IF NOT EXISTS idx_alertas_sla_eventos_config_id ON public.alertas_sla_eventos(config_id);
CREATE INDEX IF NOT EXISTS idx_alertas_sla_eventos_evento ON public.alertas_sla_eventos(evento);
CREATE INDEX IF NOT EXISTS idx_alertas_sla_eventos_created_at ON public.alertas_sla_eventos(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alertas_sla_eventos_responsavel_id ON public.alertas_sla_eventos(responsavel_id);

CREATE POLICY "Admin gestor administrativo visualizam eventos SLA"
  ON public.alertas_sla_eventos FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'administrador')
    OR public.has_role(auth.uid(),'gestor')
    OR public.has_role(auth.uid(),'administrativo')
    OR responsavel_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.alertas_operacionais a
      WHERE a.id = alerta_id AND a.responsavel_id = auth.uid()
    )
  );

CREATE POLICY "Service role insere eventos SLA"
  ON public.alertas_sla_eventos FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(),'administrador')
    OR public.has_role(auth.uid(),'gestor')
  );

-- =========================================
-- SLA Defaults
-- =========================================
INSERT INTO public.alertas_sla_config (codigo, nome, gravidade, prazo_primeira_resposta_minutos, prazo_resolucao_minutos, escalonar_apos_minutos, nova_gravidade_apos_sla, notificar_gestor)
VALUES
  ('critica_padrao','SLA Crítica Padrão','critica',30,240,60,'critica',true),
  ('alta_padrao','SLA Alta Padrão','alta',120,1440,240,'critica',true),
  ('media_padrao','SLA Média Padrão','media',480,2880,1440,'alta',false),
  ('baixa_padrao','SLA Baixa Padrão','baixa',NULL,10080,NULL,NULL,false),
  ('informativa_padrao','SLA Informativa Padrão','informativa',NULL,0,NULL,NULL,false)
ON CONFLICT (codigo) DO NOTHING;

-- =========================================
-- RPC: recalcular prioridade
-- =========================================
CREATE OR REPLACE FUNCTION public.rpc_recalcular_prioridade_alerta(p_alerta_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_score integer := 0;
  v_alerta record;
BEGIN
  SELECT * INTO v_alerta FROM public.alertas_operacionais WHERE id = p_alerta_id;
  IF NOT FOUND THEN RETURN 0; END IF;

  v_score := CASE v_alerta.gravidade
    WHEN 'critica' THEN 100
    WHEN 'alta' THEN 70
    WHEN 'media' THEN 40
    WHEN 'baixa' THEN 20
    WHEN 'informativa' THEN 5
    ELSE 0 END;

  IF v_alerta.sla_vencido THEN v_score := v_score + 30; END IF;
  IF v_alerta.escalonado THEN v_score := v_score + 20; END IF;
  IF v_alerta.created_at < now() - interval '3 days' AND v_alerta.status NOT IN ('resolvido','ignorado') THEN
    v_score := v_score + 10;
  END IF;
  IF v_alerta.tipo_alerta = 'cq_reprovado' THEN v_score := v_score + 20; END IF;
  IF v_alerta.tipo_alerta = 'entrega_pendente_critica' THEN v_score := v_score + 15; END IF;

  UPDATE public.alertas_operacionais SET prioridade_score = v_score WHERE id = p_alerta_id;
  RETURN v_score;
END;
$$;

-- =========================================
-- RPC: registrar primeira resposta
-- =========================================
CREATE OR REPLACE FUNCTION public.rpc_registrar_primeira_resposta_alerta(p_alerta_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_alerta record;
  v_evento text := 'primeira_resposta_registrada';
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  SELECT * INTO v_alerta FROM public.alertas_operacionais WHERE id = p_alerta_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'alerta_nao_encontrado');
  END IF;

  IF v_alerta.primeira_resposta_em IS NULL THEN
    UPDATE public.alertas_operacionais
      SET primeira_resposta_em = now()
      WHERE id = p_alerta_id;

    INSERT INTO public.alertas_sla_eventos (alerta_id, config_id, evento, criado_por, responsavel_id)
      VALUES (p_alerta_id, v_alerta.sla_config_id, v_evento, auth.uid(), auth.uid());

    IF v_alerta.sla_primeira_resposta_em IS NOT NULL AND now() > v_alerta.sla_primeira_resposta_em THEN
      INSERT INTO public.alertas_sla_eventos (alerta_id, config_id, evento, criado_por)
        VALUES (p_alerta_id, v_alerta.sla_config_id, 'sla_resposta_vencido', auth.uid());
    END IF;

    BEGIN
      INSERT INTO public.alertas_acoes (alerta_id, usuario_id, acao, observacao)
        VALUES (p_alerta_id, auth.uid(), 'primeira_resposta', 'Primeira resposta registrada');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  PERFORM public.rpc_recalcular_prioridade_alerta(p_alerta_id);
  RETURN jsonb_build_object('success', true);
END;
$$;

-- =========================================
-- RPC: assumir alerta
-- =========================================
CREATE OR REPLACE FUNCTION public.rpc_assumir_alerta(p_alerta_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_alerta record;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  SELECT * INTO v_alerta FROM public.alertas_operacionais WHERE id = p_alerta_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'alerta_nao_encontrado');
  END IF;

  UPDATE public.alertas_operacionais
    SET responsavel_id = auth.uid()
    WHERE id = p_alerta_id;

  BEGIN
    INSERT INTO public.alertas_acoes (alerta_id, usuario_id, acao, observacao)
      VALUES (p_alerta_id, auth.uid(), 'assumir', 'Alerta assumido');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  PERFORM public.rpc_recalcular_prioridade_alerta(p_alerta_id);
  RETURN jsonb_build_object('success', true);
END;
$$;

-- =========================================
-- RPC: aplicar SLA em lote
-- =========================================
CREATE OR REPLACE FUNCTION public.rpc_aplicar_sla_alertas()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_alerta record;
  v_config record;
  v_processados int := 0;
  v_configurados int := 0;
  v_vencidos int := 0;
  v_escalonados int := 0;
  v_reclassificados int := 0;
  v_sem_sla int := 0;
  v_grav_anterior text;
BEGIN
  FOR v_alerta IN
    SELECT * FROM public.alertas_operacionais
    WHERE COALESCE(status,'aberto') NOT IN ('resolvido','ignorado','cancelado')
  LOOP
    v_processados := v_processados + 1;

    -- buscar config: tipo_alerta > origem > gravidade
    SELECT * INTO v_config FROM public.alertas_sla_config
      WHERE ativo = true AND tipo_alerta = v_alerta.tipo_alerta
      LIMIT 1;
    IF NOT FOUND THEN
      SELECT * INTO v_config FROM public.alertas_sla_config
        WHERE ativo = true AND origem = v_alerta.origem AND gravidade = v_alerta.gravidade
        LIMIT 1;
    END IF;
    IF NOT FOUND THEN
      SELECT * INTO v_config FROM public.alertas_sla_config
        WHERE ativo = true AND tipo_alerta IS NULL AND origem IS NULL AND gravidade = v_alerta.gravidade
        LIMIT 1;
    END IF;

    IF NOT FOUND OR v_config.prazo_resolucao_minutos = 0 THEN
      v_sem_sla := v_sem_sla + 1;
      CONTINUE;
    END IF;

    -- associar config se ausente
    IF v_alerta.sla_config_id IS NULL THEN
      UPDATE public.alertas_operacionais
        SET sla_config_id = v_config.id,
            sla_primeira_resposta_em = CASE WHEN v_config.prazo_primeira_resposta_minutos IS NOT NULL
              THEN v_alerta.created_at + make_interval(mins => v_config.prazo_primeira_resposta_minutos)
              ELSE NULL END,
            sla_resolucao_em = v_alerta.created_at + make_interval(mins => v_config.prazo_resolucao_minutos)
        WHERE id = v_alerta.id;

      INSERT INTO public.alertas_sla_eventos (alerta_id, config_id, evento, prazo_primeira_resposta_em, prazo_resolucao_em)
        VALUES (v_alerta.id, v_config.id, 'sla_configurado',
          CASE WHEN v_config.prazo_primeira_resposta_minutos IS NOT NULL
            THEN v_alerta.created_at + make_interval(mins => v_config.prazo_primeira_resposta_minutos)
            ELSE NULL END,
          v_alerta.created_at + make_interval(mins => v_config.prazo_resolucao_minutos));

      v_configurados := v_configurados + 1;
      -- reler alerta
      SELECT * INTO v_alerta FROM public.alertas_operacionais WHERE id = v_alerta.id;
    END IF;

    -- vencimento
    IF NOT v_alerta.sla_vencido AND v_alerta.sla_resolucao_em IS NOT NULL AND now() > v_alerta.sla_resolucao_em THEN
      UPDATE public.alertas_operacionais
        SET sla_vencido = true, sla_vencido_em = now()
        WHERE id = v_alerta.id;
      INSERT INTO public.alertas_sla_eventos (alerta_id, config_id, evento, vencido_em)
        VALUES (v_alerta.id, v_config.id, 'sla_resolucao_vencido', now());
      v_vencidos := v_vencidos + 1;
      v_alerta.sla_vencido := true;
    END IF;

    -- escalonamento
    IF NOT v_alerta.escalonado
       AND v_config.escalonar_apos_minutos IS NOT NULL
       AND v_alerta.created_at + make_interval(mins => v_config.escalonar_apos_minutos) < now() THEN
      UPDATE public.alertas_operacionais
        SET escalonado = true, escalonado_em = now()
        WHERE id = v_alerta.id;
      INSERT INTO public.alertas_sla_eventos (alerta_id, config_id, evento, escalonado_em, gestor_notificado)
        VALUES (v_alerta.id, v_config.id, 'escalonado', now(), v_config.notificar_gestor);
      v_escalonados := v_escalonados + 1;
      v_alerta.escalonado := true;

      -- reclassificação
      IF v_config.nova_gravidade_apos_sla IS NOT NULL
         AND v_config.nova_gravidade_apos_sla <> v_alerta.gravidade
         AND v_alerta.tipo_alerta IS DISTINCT FROM 'aplicacao_nao_registrada' THEN
        v_grav_anterior := v_alerta.gravidade;
        UPDATE public.alertas_operacionais
          SET gravidade = v_config.nova_gravidade_apos_sla
          WHERE id = v_alerta.id;
        INSERT INTO public.alertas_sla_eventos (alerta_id, config_id, evento, gravidade_anterior, gravidade_nova)
          VALUES (v_alerta.id, v_config.id, 'prioridade_reclassificada', v_grav_anterior, v_config.nova_gravidade_apos_sla);
        v_reclassificados := v_reclassificados + 1;
      END IF;
    END IF;

    PERFORM public.rpc_recalcular_prioridade_alerta(v_alerta.id);
  END LOOP;

  RETURN jsonb_build_object(
    'total_processados', v_processados,
    'total_sla_configurados', v_configurados,
    'total_vencidos', v_vencidos,
    'total_escalonados', v_escalonados,
    'total_reclassificados', v_reclassificados,
    'total_sem_sla', v_sem_sla,
    'executado_em', now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_aplicar_sla_alertas() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_registrar_primeira_resposta_alerta(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_assumir_alerta(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_recalcular_prioridade_alerta(uuid) TO authenticated, service_role;
