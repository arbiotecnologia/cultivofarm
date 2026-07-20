-- Fase 12.5: Tabela de execucoes do motor de alertas + RPC wrapper

CREATE TABLE IF NOT EXISTS public.alertas_execucoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_execucao text NOT NULL DEFAULT 'manual'
    CHECK (tipo_execucao IN ('manual','automatico','cron','edge_function','sistema')),
  origem text NOT NULL DEFAULT 'sistema',
  status text NOT NULL DEFAULT 'iniciada'
    CHECK (status IN ('iniciada','concluida','falhou','cancelada')),
  iniciado_em timestamptz NOT NULL DEFAULT now(),
  finalizado_em timestamptz NULL,
  duracao_ms integer NULL,
  total_processados integer NOT NULL DEFAULT 0,
  total_criados integer NOT NULL DEFAULT 0,
  total_atualizados integer NOT NULL DEFAULT 0,
  total_resolvidos_automaticamente integer NOT NULL DEFAULT 0,
  total_ignorados_por_regra integer NOT NULL DEFAULT 0,
  erro text NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  executado_por uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.alertas_execucoes TO authenticated;
GRANT ALL ON public.alertas_execucoes TO service_role;

ALTER TABLE public.alertas_execucoes ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_alertas_execucoes_tipo_execucao ON public.alertas_execucoes(tipo_execucao);
CREATE INDEX IF NOT EXISTS idx_alertas_execucoes_status ON public.alertas_execucoes(status);
CREATE INDEX IF NOT EXISTS idx_alertas_execucoes_iniciado_em ON public.alertas_execucoes(iniciado_em DESC);
CREATE INDEX IF NOT EXISTS idx_alertas_execucoes_executado_por ON public.alertas_execucoes(executado_por);

-- RLS: somente administrador, gestor, administrativo podem ler
DROP POLICY IF EXISTS "Admins/gestores podem ver execucoes" ON public.alertas_execucoes;
CREATE POLICY "Admins/gestores podem ver execucoes"
  ON public.alertas_execucoes
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'administrador'::app_role)
    OR public.has_role(auth.uid(), 'gestor'::app_role)
    OR public.has_role(auth.uid(), 'administrativo'::app_role)
  );

-- INSERT/UPDATE somente via service_role ou funcoes SECURITY DEFINER.
-- Nao criamos policy para INSERT/UPDATE/DELETE, bloqueando authenticated.

-- ============================================================
-- RPC wrapper para execucao auditada do motor de alertas
-- ============================================================
CREATE OR REPLACE FUNCTION public.rpc_executar_motor_alertas(
  p_tipo_execucao text DEFAULT 'manual',
  p_origem text DEFAULT 'painel'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_execucao_id uuid;
  v_iniciado_em timestamptz := clock_timestamp();
  v_resultado jsonb;
  v_uid uuid := auth.uid();
  v_is_service boolean := (current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role';
  v_erro_msg text;
BEGIN
  -- Guardrail de permissao quando chamado via cliente autenticado.
  IF NOT v_is_service THEN
    IF v_uid IS NULL THEN
      RAISE EXCEPTION 'permission_denied' USING HINT = 'Usuario nao autenticado';
    END IF;
    IF NOT (
      public.has_role(v_uid, 'administrador'::app_role)
      OR public.has_role(v_uid, 'gestor'::app_role)
      OR public.has_role(v_uid, 'administrativo'::app_role)
    ) THEN
      RAISE EXCEPTION 'permission_denied' USING HINT = 'Perfil sem permissao para executar o motor de alertas';
    END IF;
  END IF;

  -- Normaliza inputs
  IF p_tipo_execucao IS NULL OR p_tipo_execucao NOT IN ('manual','automatico','cron','edge_function','sistema') THEN
    p_tipo_execucao := 'manual';
  END IF;
  IF p_origem IS NULL OR length(trim(p_origem)) = 0 THEN
    p_origem := 'sistema';
  END IF;

  INSERT INTO public.alertas_execucoes (
    tipo_execucao, origem, status, iniciado_em, executado_por
  ) VALUES (
    p_tipo_execucao, p_origem, 'iniciada', v_iniciado_em, v_uid
  ) RETURNING id INTO v_execucao_id;

  BEGIN
    SELECT public.rpc_gerar_alertas_operacionais() INTO v_resultado;

    UPDATE public.alertas_execucoes
       SET status = 'concluida',
           finalizado_em = clock_timestamp(),
           duracao_ms = GREATEST(0, EXTRACT(EPOCH FROM (clock_timestamp() - v_iniciado_em)) * 1000)::int,
           total_processados = COALESCE((v_resultado->>'total_processados')::int, 0),
           total_criados = COALESCE((v_resultado->>'total_criados')::int, 0),
           total_atualizados = COALESCE((v_resultado->>'total_atualizados')::int, 0),
           total_resolvidos_automaticamente = COALESCE((v_resultado->>'total_resolvidos_automaticamente')::int, 0),
           total_ignorados_por_regra = COALESCE((v_resultado->>'total_ignorados_por_regra')::int, 0),
           metadata = COALESCE(v_resultado, '{}'::jsonb)
     WHERE id = v_execucao_id;

    RETURN jsonb_build_object(
      'success', true,
      'execucao_id', v_execucao_id,
      'tipo_execucao', p_tipo_execucao,
      'origem', p_origem,
      'resultado', COALESCE(v_resultado, '{}'::jsonb)
    );
  EXCEPTION WHEN OTHERS THEN
    v_erro_msg := left(COALESCE(SQLERRM, 'erro_desconhecido'), 500);
    UPDATE public.alertas_execucoes
       SET status = 'falhou',
           finalizado_em = clock_timestamp(),
           duracao_ms = GREATEST(0, EXTRACT(EPOCH FROM (clock_timestamp() - v_iniciado_em)) * 1000)::int,
           erro = v_erro_msg
     WHERE id = v_execucao_id;

    RAISE EXCEPTION 'Falha na execucao do motor de alertas: %', v_erro_msg;
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_executar_motor_alertas(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_executar_motor_alertas(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_executar_motor_alertas(text, text) TO service_role;
