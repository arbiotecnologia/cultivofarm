
-- ============================================================
-- Fase 12.6: Notificacoes externas (email/whatsapp) para alertas
-- ============================================================

-- 1) Tabela de configuracao por canal
CREATE TABLE IF NOT EXISTS public.alertas_notificacao_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canal text NOT NULL DEFAULT 'email' CHECK (canal IN ('email','whatsapp')),
  ativo boolean NOT NULL DEFAULT false,
  gravidades text[] NOT NULL DEFAULT ARRAY['critica','alta'],
  origens text[] NULL,
  tipos text[] NULL,
  cooldown_minutos integer NOT NULL DEFAULT 60,
  max_envios_por_alerta integer NOT NULL DEFAULT 3,
  enviar_resumo boolean NOT NULL DEFAULT false,
  horario_inicio time NULL,
  horario_fim time NULL,
  dias_semana integer[] NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_alertas_notificacao_config_canal
  ON public.alertas_notificacao_config(canal);
CREATE INDEX IF NOT EXISTS idx_alertas_notificacao_config_canal
  ON public.alertas_notificacao_config(canal);
CREATE INDEX IF NOT EXISTS idx_alertas_notificacao_config_ativo
  ON public.alertas_notificacao_config(ativo);

GRANT SELECT ON public.alertas_notificacao_config TO authenticated;
GRANT ALL ON public.alertas_notificacao_config TO service_role;
ALTER TABLE public.alertas_notificacao_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins gerenciam config" ON public.alertas_notificacao_config;
CREATE POLICY "admins gerenciam config" ON public.alertas_notificacao_config
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'administrador'::app_role) OR public.has_role(auth.uid(),'gestor'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'administrador'::app_role) OR public.has_role(auth.uid(),'gestor'::app_role));

DROP POLICY IF EXISTS "administrativo le config" ON public.alertas_notificacao_config;
CREATE POLICY "administrativo le config" ON public.alertas_notificacao_config
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'administrativo'::app_role));

-- 2) Destinatarios
CREATE TABLE IF NOT EXISTS public.alertas_notificacao_destinatarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NULL,
  nome text NOT NULL,
  email text NULL,
  telefone text NULL,
  canal text NOT NULL DEFAULT 'email' CHECK (canal IN ('email','whatsapp')),
  ativo boolean NOT NULL DEFAULT true,
  roles_permitidas text[] NULL,
  origens text[] NULL,
  gravidades text[] NULL,
  receber_resumo boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alertas_notificacao_destinatarios_user_id ON public.alertas_notificacao_destinatarios(user_id);
CREATE INDEX IF NOT EXISTS idx_alertas_notificacao_destinatarios_canal ON public.alertas_notificacao_destinatarios(canal);
CREATE INDEX IF NOT EXISTS idx_alertas_notificacao_destinatarios_ativo ON public.alertas_notificacao_destinatarios(ativo);

GRANT SELECT ON public.alertas_notificacao_destinatarios TO authenticated;
GRANT ALL ON public.alertas_notificacao_destinatarios TO service_role;
ALTER TABLE public.alertas_notificacao_destinatarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins gerenciam destinatarios" ON public.alertas_notificacao_destinatarios;
CREATE POLICY "admins gerenciam destinatarios" ON public.alertas_notificacao_destinatarios
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'administrador'::app_role) OR public.has_role(auth.uid(),'gestor'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'administrador'::app_role) OR public.has_role(auth.uid(),'gestor'::app_role));

DROP POLICY IF EXISTS "administrativo le destinatarios" ON public.alertas_notificacao_destinatarios;
CREATE POLICY "administrativo le destinatarios" ON public.alertas_notificacao_destinatarios
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'administrativo'::app_role));

DROP POLICY IF EXISTS "destinatario ve a si mesmo" ON public.alertas_notificacao_destinatarios;
CREATE POLICY "destinatario ve a si mesmo" ON public.alertas_notificacao_destinatarios
  FOR SELECT TO authenticated
  USING (user_id IS NOT NULL AND user_id = auth.uid());

-- 3) Notificacoes (fila/historico)
CREATE TABLE IF NOT EXISTS public.alertas_notificacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alerta_id uuid NOT NULL REFERENCES public.alertas_operacionais(id) ON DELETE CASCADE,
  destinatario_id uuid NULL REFERENCES public.alertas_notificacao_destinatarios(id) ON DELETE SET NULL,
  canal text NOT NULL CHECK (canal IN ('email','whatsapp')),
  destino text NOT NULL,
  assunto text NULL,
  mensagem text NOT NULL,
  status text NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente','enviado','falhou','ignorado','bloqueado','cooldown')),
  tentativa integer NOT NULL DEFAULT 1,
  enviado_em timestamptz NULL,
  erro text NULL,
  provider text NULL,
  provider_message_id text NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alertas_notificacoes_alerta_id ON public.alertas_notificacoes(alerta_id);
CREATE INDEX IF NOT EXISTS idx_alertas_notificacoes_destinatario_id ON public.alertas_notificacoes(destinatario_id);
CREATE INDEX IF NOT EXISTS idx_alertas_notificacoes_canal ON public.alertas_notificacoes(canal);
CREATE INDEX IF NOT EXISTS idx_alertas_notificacoes_status ON public.alertas_notificacoes(status);
CREATE INDEX IF NOT EXISTS idx_alertas_notificacoes_created_at ON public.alertas_notificacoes(created_at DESC);

GRANT SELECT ON public.alertas_notificacoes TO authenticated;
GRANT ALL ON public.alertas_notificacoes TO service_role;
ALTER TABLE public.alertas_notificacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins veem todas notificacoes" ON public.alertas_notificacoes;
CREATE POLICY "admins veem todas notificacoes" ON public.alertas_notificacoes
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'administrador'::app_role)
    OR public.has_role(auth.uid(),'gestor'::app_role)
    OR public.has_role(auth.uid(),'administrativo'::app_role)
  );

DROP POLICY IF EXISTS "destinatario ve suas notificacoes" ON public.alertas_notificacoes;
CREATE POLICY "destinatario ve suas notificacoes" ON public.alertas_notificacoes
  FOR SELECT TO authenticated
  USING (
    destinatario_id IS NOT NULL
    AND destinatario_id IN (
      SELECT id FROM public.alertas_notificacao_destinatarios
      WHERE user_id = auth.uid()
    )
  );

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.tg_set_updated_at_notif()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_set_updated_at_config ON public.alertas_notificacao_config;
CREATE TRIGGER trg_set_updated_at_config BEFORE UPDATE ON public.alertas_notificacao_config
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at_notif();

DROP TRIGGER IF EXISTS trg_set_updated_at_dest ON public.alertas_notificacao_destinatarios;
CREATE TRIGGER trg_set_updated_at_dest BEFORE UPDATE ON public.alertas_notificacao_destinatarios
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at_notif();

-- Linha inicial para email (inativa por padrao)
INSERT INTO public.alertas_notificacao_config (canal, ativo)
VALUES ('email', false)
ON CONFLICT (canal) DO NOTHING;

INSERT INTO public.alertas_notificacao_config (canal, ativo)
VALUES ('whatsapp', false)
ON CONFLICT (canal) DO NOTHING;

-- ============================================================
-- RPC: preparar notificacoes pendentes
-- ============================================================
CREATE OR REPLACE FUNCTION public.rpc_preparar_notificacoes_alertas()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_service boolean := (current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role';
  v_total_alertas int := 0;
  v_criadas int := 0;
  v_ignoradas_cd int := 0;
  v_bloq_limite int := 0;
  cfg record;
  alr record;
  dest record;
  v_envios_alerta int;
  v_ultima_ts timestamptz;
  v_cooldown_min int;
  v_max int;
  v_assunto text;
  v_mensagem text;
  v_gravidade_label text;
  v_cliente_nome text;
  v_fazenda_nome text;
BEGIN
  -- Permissao: somente service_role ou admin/gestor podem disparar
  IF NOT v_is_service THEN
    IF v_uid IS NULL THEN
      RAISE EXCEPTION 'permission_denied';
    END IF;
    IF NOT (
      public.has_role(v_uid,'administrador'::app_role)
      OR public.has_role(v_uid,'gestor'::app_role)
    ) THEN
      RAISE EXCEPTION 'permission_denied';
    END IF;
  END IF;

  -- Itera sobre canais ativos
  FOR cfg IN
    SELECT * FROM public.alertas_notificacao_config WHERE ativo = true
  LOOP
    v_cooldown_min := COALESCE(cfg.cooldown_minutos, 60);
    v_max := COALESCE(cfg.max_envios_por_alerta, 3);

    -- Alertas criticos/alta nao resolvidos/ignorados
    FOR alr IN
      SELECT a.*
      FROM public.alertas_operacionais a
      WHERE a.status IN ('aberto','reaberto','lido')
        AND a.gravidade = ANY(cfg.gravidades)
        AND (cfg.origens IS NULL OR a.origem = ANY(cfg.origens))
        AND (cfg.tipos IS NULL OR a.tipo = ANY(cfg.tipos))
    LOOP
      v_total_alertas := v_total_alertas + 1;

      v_gravidade_label := CASE alr.gravidade
        WHEN 'critica' THEN 'crítico'
        WHEN 'alta' THEN 'de alta prioridade'
        ELSE alr.gravidade::text
      END;
      v_assunto := CASE WHEN alr.gravidade = 'critica'
        THEN '[AR Bio] Alerta crítico: ' || COALESCE(alr.titulo, 'sem título')
        ELSE '[AR Bio] Alerta de alta prioridade: ' || COALESCE(alr.titulo, 'sem título')
      END;

      SELECT nome INTO v_cliente_nome FROM public.clientes WHERE id = alr.cliente_id;
      SELECT nome INTO v_fazenda_nome FROM public.fazendas WHERE id = alr.fazenda_id;

      v_mensagem := format(
        'Alerta %s detectado.%s%sTítulo: %s%sOrigem: %s%s%s%sPróxima ação: %s%sCriado em: %s',
        v_gravidade_label,
        E'\n', E'\n',
        COALESCE(alr.titulo, '—'),
        E'\n', alr.origem::text,
        CASE WHEN v_cliente_nome IS NOT NULL THEN E'\nCliente: ' || v_cliente_nome ELSE '' END,
        CASE WHEN v_fazenda_nome IS NOT NULL THEN E'\nFazenda: ' || v_fazenda_nome ELSE '' END,
        E'\n', COALESCE(alr.proxima_acao, '—'),
        E'\n', to_char(alr.created_at AT TIME ZONE 'UTC', 'DD/MM/YYYY HH24:MI')
      );

      -- Destinatarios ativos no canal
      FOR dest IN
        SELECT * FROM public.alertas_notificacao_destinatarios
        WHERE ativo = true
          AND canal = cfg.canal
          AND (
            (cfg.canal = 'email' AND email IS NOT NULL AND length(trim(email)) > 0)
            OR (cfg.canal = 'whatsapp' AND telefone IS NOT NULL AND length(trim(telefone)) > 0)
          )
          AND (gravidades IS NULL OR alr.gravidade = ANY(gravidades))
          AND (origens IS NULL OR alr.origem = ANY(origens))
      LOOP
        -- Limite e cooldown por (alerta, destinatario, canal)
        SELECT COUNT(*), MAX(created_at)
          INTO v_envios_alerta, v_ultima_ts
          FROM public.alertas_notificacoes
         WHERE alerta_id = alr.id
           AND destinatario_id = dest.id
           AND canal = cfg.canal
           AND status IN ('enviado','pendente','falhou');

        IF v_envios_alerta >= v_max THEN
          INSERT INTO public.alertas_notificacoes (
            alerta_id, destinatario_id, canal, destino, assunto, mensagem,
            status, tentativa, metadata
          ) VALUES (
            alr.id, dest.id, cfg.canal,
            COALESCE(dest.email, dest.telefone, ''),
            v_assunto, v_mensagem,
            'bloqueado', v_envios_alerta + 1,
            jsonb_build_object('motivo','limite_por_alerta','max', v_max)
          );
          v_bloq_limite := v_bloq_limite + 1;
          CONTINUE;
        END IF;

        IF v_ultima_ts IS NOT NULL
           AND v_ultima_ts > now() - make_interval(mins => v_cooldown_min) THEN
          INSERT INTO public.alertas_notificacoes (
            alerta_id, destinatario_id, canal, destino, assunto, mensagem,
            status, tentativa, metadata
          ) VALUES (
            alr.id, dest.id, cfg.canal,
            COALESCE(dest.email, dest.telefone, ''),
            v_assunto, v_mensagem,
            'cooldown', v_envios_alerta + 1,
            jsonb_build_object('motivo','cooldown','cooldown_minutos', v_cooldown_min)
          );
          v_ignoradas_cd := v_ignoradas_cd + 1;
          CONTINUE;
        END IF;

        INSERT INTO public.alertas_notificacoes (
          alerta_id, destinatario_id, canal, destino, assunto, mensagem,
          status, tentativa
        ) VALUES (
          alr.id, dest.id, cfg.canal,
          COALESCE(dest.email, dest.telefone, ''),
          v_assunto, v_mensagem,
          'pendente', v_envios_alerta + 1
        );
        v_criadas := v_criadas + 1;
      END LOOP;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'total_alertas_analisados', v_total_alertas,
    'total_notificacoes_criadas', v_criadas,
    'total_ignoradas_cooldown', v_ignoradas_cd,
    'total_bloqueadas_limite', v_bloq_limite,
    'executado_em', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_preparar_notificacoes_alertas() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_preparar_notificacoes_alertas() TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_preparar_notificacoes_alertas() TO service_role;

-- ============================================================
-- RPCs de marcacao (usadas pela Edge Function)
-- ============================================================
CREATE OR REPLACE FUNCTION public.rpc_marcar_notificacao_enviada(
  p_notificacao_id uuid,
  p_provider text,
  p_provider_message_id text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_is_service boolean := (current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role';
BEGIN
  IF NOT v_is_service THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;
  UPDATE public.alertas_notificacoes
     SET status = 'enviado',
         enviado_em = now(),
         provider = p_provider,
         provider_message_id = p_provider_message_id,
         erro = NULL
   WHERE id = p_notificacao_id;
END $$;

REVOKE ALL ON FUNCTION public.rpc_marcar_notificacao_enviada(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_marcar_notificacao_enviada(uuid, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.rpc_marcar_notificacao_falhou(
  p_notificacao_id uuid,
  p_erro text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_is_service boolean := (current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role';
BEGIN
  IF NOT v_is_service THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;
  UPDATE public.alertas_notificacoes
     SET status = 'falhou',
         erro = left(COALESCE(p_erro, 'erro_desconhecido'), 500)
   WHERE id = p_notificacao_id;
END $$;

REVOKE ALL ON FUNCTION public.rpc_marcar_notificacao_falhou(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_marcar_notificacao_falhou(uuid, text) TO service_role;
