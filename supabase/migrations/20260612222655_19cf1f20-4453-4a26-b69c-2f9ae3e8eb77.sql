
-- ============================================================
-- Fase 12.7: Resumos executivos diario/semanal
-- ============================================================

-- 1) Campos novos em alertas_notificacao_config
ALTER TABLE public.alertas_notificacao_config
  ADD COLUMN IF NOT EXISTS resumo_diario_ativo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS resumo_semanal_ativo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS horario_resumo time NULL,
  ADD COLUMN IF NOT EXISTS dia_semana_resumo integer NULL,
  ADD COLUMN IF NOT EXISTS incluir_alertas_media boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS incluir_informativos boolean NOT NULL DEFAULT false;

-- 2) Tabela alertas_resumos
CREATE TABLE IF NOT EXISTS public.alertas_resumos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_resumo text NOT NULL DEFAULT 'diario' CHECK (tipo_resumo IN ('diario','semanal','manual')),
  canal text NOT NULL DEFAULT 'email' CHECK (canal IN ('email','whatsapp')),
  periodo_inicio timestamptz NOT NULL,
  periodo_fim timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente','enviado','falhou','ignorado','bloqueado')),
  destinatario_id uuid NULL REFERENCES public.alertas_notificacao_destinatarios(id) ON DELETE SET NULL,
  destino text NOT NULL,
  assunto text NULL,
  conteudo text NOT NULL,
  total_alertas integer NOT NULL DEFAULT 0,
  total_criticos integer NOT NULL DEFAULT 0,
  total_alta integer NOT NULL DEFAULT 0,
  total_media integer NOT NULL DEFAULT 0,
  total_baixa integer NOT NULL DEFAULT 0,
  total_informativos integer NOT NULL DEFAULT 0,
  total_resolvidos integer NOT NULL DEFAULT 0,
  total_abertos integer NOT NULL DEFAULT 0,
  total_falhas_execucao integer NOT NULL DEFAULT 0,
  enviado_em timestamptz NULL,
  erro text NULL,
  provider text NULL,
  provider_message_id text NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alertas_resumos_tipo_resumo ON public.alertas_resumos(tipo_resumo);
CREATE INDEX IF NOT EXISTS idx_alertas_resumos_status ON public.alertas_resumos(status);
CREATE INDEX IF NOT EXISTS idx_alertas_resumos_canal ON public.alertas_resumos(canal);
CREATE INDEX IF NOT EXISTS idx_alertas_resumos_destinatario_id ON public.alertas_resumos(destinatario_id);
CREATE INDEX IF NOT EXISTS idx_alertas_resumos_periodo ON public.alertas_resumos(periodo_inicio, periodo_fim);
CREATE INDEX IF NOT EXISTS idx_alertas_resumos_created_at ON public.alertas_resumos(created_at DESC);

-- Chave de deduplicacao por (tipo,canal,destinatario,periodo)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_alertas_resumos_dedupe
  ON public.alertas_resumos(tipo_resumo, canal, destinatario_id, periodo_inicio, periodo_fim);

GRANT SELECT ON public.alertas_resumos TO authenticated;
GRANT ALL ON public.alertas_resumos TO service_role;
ALTER TABLE public.alertas_resumos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins veem todos resumos" ON public.alertas_resumos;
CREATE POLICY "admins veem todos resumos" ON public.alertas_resumos
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'administrador'::app_role)
    OR public.has_role(auth.uid(),'gestor'::app_role)
    OR public.has_role(auth.uid(),'administrativo'::app_role)
  );

DROP POLICY IF EXISTS "destinatario ve seus resumos" ON public.alertas_resumos;
CREATE POLICY "destinatario ve seus resumos" ON public.alertas_resumos
  FOR SELECT TO authenticated
  USING (
    destinatario_id IS NOT NULL
    AND destinatario_id IN (
      SELECT id FROM public.alertas_notificacao_destinatarios
      WHERE user_id = auth.uid()
    )
  );

-- ============================================================
-- RPC: preparar resumos
-- ============================================================
CREATE OR REPLACE FUNCTION public.rpc_preparar_resumos_alertas(
  p_tipo_resumo text DEFAULT 'diario',
  p_periodo_inicio timestamptz DEFAULT NULL,
  p_periodo_fim timestamptz DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_service boolean := (current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role';
  v_ini timestamptz;
  v_fim timestamptz;
  cfg record;
  dest record;
  v_total_dest int := 0;
  v_criados int := 0;
  v_dup int := 0;
  v_total_alertas int := 0;
  v_total_criticos int;
  v_total_alta int;
  v_total_media int;
  v_total_baixa int;
  v_total_info int;
  v_total_resolv int;
  v_total_abertos int;
  v_total_falhas int;
  v_assunto text;
  v_conteudo text;
  v_top text;
BEGIN
  IF p_tipo_resumo NOT IN ('diario','semanal','manual') THEN
    RAISE EXCEPTION 'tipo_resumo_invalido';
  END IF;

  IF NOT v_is_service THEN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'permission_denied'; END IF;
    IF NOT (public.has_role(v_uid,'administrador'::app_role) OR public.has_role(v_uid,'gestor'::app_role)) THEN
      RAISE EXCEPTION 'permission_denied';
    END IF;
  END IF;

  -- Periodo
  IF p_periodo_inicio IS NOT NULL AND p_periodo_fim IS NOT NULL THEN
    v_ini := p_periodo_inicio;
    v_fim := p_periodo_fim;
  ELSIF p_tipo_resumo = 'semanal' THEN
    v_fim := date_trunc('day', now());
    v_ini := v_fim - interval '7 days';
  ELSE
    v_fim := date_trunc('day', now());
    v_ini := v_fim - interval '1 day';
  END IF;

  -- Config: usar config 'email'
  SELECT * INTO cfg FROM public.alertas_notificacao_config WHERE canal = 'email' LIMIT 1;
  IF cfg IS NULL THEN
    RETURN jsonb_build_object(
      'total_destinatarios', 0, 'total_resumos_criados', 0,
      'total_ignorados_duplicidade', 0, 'total_alertas_periodo', 0,
      'periodo_inicio', v_ini, 'periodo_fim', v_fim,
      'executado_em', now(),
      'aviso', 'config_email_inexistente'
    );
  END IF;

  -- Totais consolidados do periodo
  SELECT
    COUNT(*) FILTER (WHERE gravidade = 'critica'),
    COUNT(*) FILTER (WHERE gravidade = 'alta'),
    COUNT(*) FILTER (WHERE gravidade = 'media'),
    COUNT(*) FILTER (WHERE gravidade = 'baixa'),
    COUNT(*) FILTER (WHERE gravidade = 'informativa'),
    COUNT(*) FILTER (WHERE status = 'resolvido'),
    COUNT(*) FILTER (WHERE status IN ('aberto','reaberto','lido')),
    COUNT(*)
    INTO v_total_criticos, v_total_alta, v_total_media, v_total_baixa,
         v_total_info, v_total_resolv, v_total_abertos, v_total_alertas
  FROM public.alertas_operacionais
  WHERE created_at >= v_ini AND created_at < v_fim;

  SELECT COUNT(*) INTO v_total_falhas
  FROM public.alertas_execucoes
  WHERE status = 'falhou' AND iniciado_em >= v_ini AND iniciado_em < v_fim;

  -- Top criticos/alta abertos (max 10)
  SELECT string_agg(linha, E'\n')
    INTO v_top
    FROM (
      SELECT '- [' || gravidade::text || '] ' || COALESCE(titulo, 'sem título') AS linha
      FROM public.alertas_operacionais
      WHERE status IN ('aberto','reaberto','lido')
        AND gravidade IN ('critica','alta')
        AND created_at >= v_ini AND created_at < v_fim
      ORDER BY (gravidade = 'critica') DESC, created_at DESC
      LIMIT 10
    ) t;

  v_assunto := CASE p_tipo_resumo
    WHEN 'semanal' THEN '[AR Bio] Resumo semanal de alertas operacionais'
    WHEN 'manual'  THEN '[AR Bio] Resumo de alertas operacionais (manual)'
    ELSE '[AR Bio] Resumo diário de alertas operacionais'
  END;

  v_conteudo := format(
    'Período: %s a %s%sTotal de alertas: %s%sCríticos: %s | Alta: %s | Média: %s | Baixa: %s | Informativos: %s%sResolvidos no período: %s%sAbertos: %s%sFalhas do motor de alertas: %s%s%sPrincipais alertas críticos/alta em aberto:%s%s',
    to_char(v_ini AT TIME ZONE 'UTC', 'DD/MM/YYYY HH24:MI'),
    to_char(v_fim AT TIME ZONE 'UTC', 'DD/MM/YYYY HH24:MI'),
    E'\n', v_total_alertas,
    E'\n', v_total_criticos, v_total_alta, v_total_media, v_total_baixa, v_total_info,
    E'\n', v_total_resolv,
    E'\n', v_total_abertos,
    E'\n', v_total_falhas,
    E'\n', E'\n',
    E'\n',
    COALESCE(v_top, 'Nenhum alerta crítico ou de alta prioridade no período.')
  );

  -- Destinatarios com receber_resumo = true
  FOR dest IN
    SELECT * FROM public.alertas_notificacao_destinatarios
    WHERE ativo = true
      AND canal = 'email'
      AND receber_resumo = true
      AND email IS NOT NULL
      AND length(trim(email)) > 0
  LOOP
    v_total_dest := v_total_dest + 1;

    -- Deduplicacao
    PERFORM 1 FROM public.alertas_resumos
      WHERE tipo_resumo = p_tipo_resumo
        AND canal = 'email'
        AND destinatario_id = dest.id
        AND periodo_inicio = v_ini
        AND periodo_fim = v_fim;
    IF FOUND THEN
      v_dup := v_dup + 1;
      CONTINUE;
    END IF;

    INSERT INTO public.alertas_resumos (
      tipo_resumo, canal, periodo_inicio, periodo_fim, status,
      destinatario_id, destino, assunto, conteudo,
      total_alertas, total_criticos, total_alta, total_media,
      total_baixa, total_informativos, total_resolvidos, total_abertos,
      total_falhas_execucao
    ) VALUES (
      p_tipo_resumo, 'email', v_ini, v_fim, 'pendente',
      dest.id, dest.email, v_assunto, v_conteudo,
      v_total_alertas, v_total_criticos, v_total_alta, v_total_media,
      v_total_baixa, v_total_info, v_total_resolv, v_total_abertos,
      v_total_falhas
    );
    v_criados := v_criados + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'total_destinatarios', v_total_dest,
    'total_resumos_criados', v_criados,
    'total_ignorados_duplicidade', v_dup,
    'total_alertas_periodo', v_total_alertas,
    'periodo_inicio', v_ini,
    'periodo_fim', v_fim,
    'executado_em', now()
  );
END $$;

REVOKE ALL ON FUNCTION public.rpc_preparar_resumos_alertas(text, timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_preparar_resumos_alertas(text, timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_preparar_resumos_alertas(text, timestamptz, timestamptz) TO service_role;

-- ============================================================
-- RPCs de marcacao
-- ============================================================
CREATE OR REPLACE FUNCTION public.rpc_marcar_resumo_enviado(
  p_resumo_id uuid, p_provider text, p_provider_message_id text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_is_service boolean := (current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role';
BEGIN
  IF NOT v_is_service THEN RAISE EXCEPTION 'permission_denied'; END IF;
  UPDATE public.alertas_resumos
     SET status='enviado', enviado_em=now(), provider=p_provider,
         provider_message_id=p_provider_message_id, erro=NULL
   WHERE id = p_resumo_id;
END $$;

REVOKE ALL ON FUNCTION public.rpc_marcar_resumo_enviado(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_marcar_resumo_enviado(uuid, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.rpc_marcar_resumo_falhou(
  p_resumo_id uuid, p_erro text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_is_service boolean := (current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role';
BEGIN
  IF NOT v_is_service THEN RAISE EXCEPTION 'permission_denied'; END IF;
  UPDATE public.alertas_resumos
     SET status='falhou', erro=left(COALESCE(p_erro,'erro_desconhecido'), 500)
   WHERE id = p_resumo_id;
END $$;

REVOKE ALL ON FUNCTION public.rpc_marcar_resumo_falhou(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_marcar_resumo_falhou(uuid, text) TO service_role;
