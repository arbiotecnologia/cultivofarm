-- ============================================================================
-- FLUXO OS — MOTOR DE PROGRAMACAO (aberta -> aprovada -> programada)
-- Kit: restoration/os-programacao/ | artefato: 20260826000000_os_programacao_motor_v1
--
-- Problema corrigido: OS gerada nasce em 'aberta'; o trigger
-- check_os_status_transition so permite +1 passo e nao havia acao (UI ou RPC)
-- capaz de programar a OS. Resultado: "OS precisa estar em status programada
-- para assumir producao" sem caminho possivel para programar.
--
-- Escopo: staging ikaauvsflpmamgxmkhoq. Producao navfzbwgwzruipouyfnk PROIBIDA.
-- Propriedades: fail-closed, transacional, idempotente. Rollback: 90-rollback.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- PARTE 0 - TRAVA DE AMBIENTE FAIL-CLOSED
-- ----------------------------------------------------------------------------
DO $guard$
DECLARE
  v_ref    text := nullif(btrim(coalesce(current_setting('app.settings.project_ref', true), '')), '');
  v_marked boolean := false;
BEGIN
  IF v_ref = 'navfzbwgwzruipouyfnk' THEN
    RAISE EXCEPTION 'ABORT: producao navfzbwgwzruipouyfnk PROIBIDA para esta migration'
      USING ERRCODE = '42501';
  END IF;

  IF to_regclass('public._fiscal_staging_marker') IS NULL THEN
    RAISE EXCEPTION 'ABORT (fail-closed): public._fiscal_staging_marker ausente — ambiente nao comprovado como staging ikaauvsflpmamgxmkhoq'
      USING ERRCODE = '42501';
  END IF;

  EXECUTE $q$
    SELECT EXISTS (
      SELECT 1 FROM public._fiscal_staging_marker
      WHERE marker = 'STAGING' AND project_ref = 'ikaauvsflpmamgxmkhoq'
    )
  $q$ INTO v_marked;

  IF NOT v_marked THEN
    RAISE EXCEPTION 'ABORT (fail-closed): marcador STAGING/ikaauvsflpmamgxmkhoq ausente — migration recusada'
      USING ERRCODE = '42501';
  END IF;
END
$guard$;

-- ----------------------------------------------------------------------------
-- PARTE 1 - RPC DE PROGRAMACAO
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_programar_os_v1(
  p_os_id uuid,
  p_origem text,
  p_data_programada date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id uuid;
  v_role text;
  v_status text;
  v_status_inicial text;
  v_onfarm boolean;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Não autenticado');
  END IF;

  SELECT role::text INTO v_role
  FROM public.user_roles
  WHERE user_id = v_user_id
    AND role IN ('administrador', 'gestor', 'producao', 'administrativo')
  LIMIT 1;

  IF v_role IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Seu perfil não possui permissão para programar ordens de serviço.');
  END IF;

  IF p_origem IN ('manual', 'b2b') THEN
    v_onfarm := false;
    SELECT status::text INTO v_status FROM public.ordens_servico WHERE id = p_os_id FOR UPDATE;
    IF v_status IS NULL THEN
      RETURN jsonb_build_object('success', false, 'message', 'Ordem de serviço não encontrada.');
    END IF;
  ELSIF p_origem = 'onfarm' THEN
    v_onfarm := true;
    SELECT status::text INTO v_status FROM public.ordens_servico_onfarm WHERE id = p_os_id FOR UPDATE;
    IF v_status IS NULL THEN
      RETURN jsonb_build_object('success', false, 'message', 'Ordem de serviço On-Farm não encontrada.');
    END IF;
  ELSE
    RETURN jsonb_build_object('success', false, 'message', 'Origem de OS inválida: ' || coalesce(p_origem, 'null'));
  END IF;

  v_status_inicial := v_status;

  IF v_status IN ('finalizada', 'cancelada') THEN
    RETURN jsonb_build_object('success', false, 'message', 'Operação não permitida: OS já está ' || v_status);
  END IF;

  IF v_status NOT IN ('aberta', 'aprovada', 'programada') THEN
    RETURN jsonb_build_object(
      'success', false,
      'status', v_status,
      'message', 'OS já avançou além da programação. Status atual: ' || v_status
    );
  END IF;

  -- Escada respeitando o trigger de transicao (+1 passo por vez)
  IF v_status = 'aberta' THEN
    IF v_onfarm THEN
      UPDATE public.ordens_servico_onfarm SET status = 'aprovada' WHERE id = p_os_id;
    ELSE
      UPDATE public.ordens_servico SET status = 'aprovada' WHERE id = p_os_id;
    END IF;
    v_status := 'aprovada';
  END IF;

  IF v_status = 'aprovada' THEN
    IF v_onfarm THEN
      UPDATE public.ordens_servico_onfarm SET status = 'programada' WHERE id = p_os_id;
    ELSE
      UPDATE public.ordens_servico SET status = 'programada' WHERE id = p_os_id;
    END IF;
    v_status := 'programada';
  END IF;

  -- Data programada (opcional) na OS e na programacao vinculada
  IF p_data_programada IS NOT NULL THEN
    IF v_onfarm THEN
      UPDATE public.programacao_producao
      SET data_programada = p_data_programada
      WHERE ordem_servico_onfarm_id = p_os_id;
    ELSE
      UPDATE public.ordens_servico
      SET data_programada = p_data_programada
      WHERE id = p_os_id;

      UPDATE public.programacao_producao
      SET data_programada = p_data_programada
      WHERE ordem_servico_id = p_os_id;
    END IF;
  END IF;

  INSERT INTO public.laboratorio_esteira_eventos
    (os_id, origem_os, etapa_anterior, etapa_nova, acao, usuario_id, observacao)
  VALUES
    (p_os_id, p_origem, v_status_inicial, v_status, 'programar_os', v_user_id,
     CASE WHEN p_data_programada IS NULL THEN NULL ELSE 'data_programada=' || p_data_programada::text END);

  PERFORM public.refresh_esteira_laboratorio();

  RETURN jsonb_build_object(
    'success', true,
    'status', v_status,
    'message', CASE WHEN v_status_inicial = 'programada'
                    THEN 'Programação atualizada'
                    ELSE 'OS programada com sucesso' END
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_programar_os_v1(uuid, text, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_programar_os_v1(uuid, text, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_programar_os_v1(uuid, text, date) TO authenticated;

-- ----------------------------------------------------------------------------
-- PARTE 2 - AUTO-AVANCO EM assumir_producao TAMBEM A PARTIR DE 'aberta'
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_avancar_esteira_laboratorio(
  p_os_id uuid,
  p_origem text,
  p_etapa_destino text,
  p_programacao_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_user_id uuid;
    v_profile_id uuid;
    v_role text;
    v_status_os text;
    v_etapa_anterior text;
    v_result jsonb;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Não autenticado');
    END IF;

    SELECT role::text INTO v_role
    FROM public.user_roles
    WHERE user_id = v_user_id
      AND role IN ('administrador', 'gestor', 'producao', 'administrativo')
    LIMIT 1;

    IF v_role IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Seu perfil não possui permissão para avançar a esteira laboratorial.');
    END IF;

    SELECT id INTO v_profile_id FROM public.profiles WHERE user_id = v_user_id LIMIT 1;

    IF p_origem IN ('manual','b2b') THEN
        SELECT status::text INTO v_status_os FROM public.ordens_servico WHERE id = p_os_id;
        IF NOT FOUND OR v_status_os IS NULL THEN RETURN jsonb_build_object('success', false, 'message', 'Ordem de serviço não encontrada.'); END IF;
    ELSIF p_origem = 'onfarm' THEN
        SELECT status::text INTO v_status_os FROM public.ordens_servico_onfarm WHERE id = p_os_id;
        IF NOT FOUND OR v_status_os IS NULL THEN RETURN jsonb_build_object('success', false, 'message', 'Ordem de serviço On-Farm não encontrada.'); END IF;
    ELSE
        RETURN jsonb_build_object('success', false, 'message', 'Origem de OS inválida: ' || p_origem);
    END IF;

    v_etapa_anterior := v_status_os;

    IF v_status_os IN ('finalizada', 'cancelada') THEN
        RETURN jsonb_build_object('success', false, 'message', 'Operação não permitida: OS já está ' || v_status_os);
    END IF;

    CASE p_etapa_destino
        WHEN 'assumir_producao' THEN
            IF p_programacao_id IS NULL THEN
                RETURN jsonb_build_object('success', false, 'message', 'ID da programação é obrigatório para assumir produção.');
            END IF;
            IF v_profile_id IS NULL THEN
                RETURN jsonb_build_object('success', false, 'message', 'Perfil do usuário não encontrado.');
            END IF;

            -- Auto-avanco fail-safe: sobe a escada 'aberta' -> 'aprovada' -> 'programada'
            -- respeitando o trigger de +1 passo. Demais status seguem bloqueados.
            IF v_status_os = 'aberta' THEN
                IF p_origem = 'onfarm' THEN
                    UPDATE public.ordens_servico_onfarm SET status = 'aprovada' WHERE id = p_os_id;
                ELSE
                    UPDATE public.ordens_servico SET status = 'aprovada' WHERE id = p_os_id;
                END IF;
                v_status_os := 'aprovada';
            END IF;

            IF v_status_os = 'aprovada' THEN
                IF p_origem = 'onfarm' THEN
                    UPDATE public.ordens_servico_onfarm SET status = 'programada' WHERE id = p_os_id;
                ELSE
                    UPDATE public.ordens_servico SET status = 'programada' WHERE id = p_os_id;
                END IF;
                v_status_os := 'programada';
            END IF;

            IF v_status_os <> 'programada' THEN
                RETURN jsonb_build_object('success', false, 'message', 'OS precisa estar em status "programada" para assumir produção. Status atual: ' || v_status_os);
            END IF;

            UPDATE public.programacao_producao
            SET status = 'em_producao', responsavel_id = v_profile_id
            WHERE id = p_programacao_id;

            IF p_origem = 'onfarm' THEN
                UPDATE public.ordens_servico_onfarm SET status = 'em_producao' WHERE id = p_os_id;
            ELSE
                UPDATE public.ordens_servico SET status = 'em_producao' WHERE id = p_os_id;
            END IF;

            INSERT INTO public.laboratorio_esteira_eventos (os_id, origem_os, programacao_id, etapa_anterior, etapa_nova, acao, usuario_id)
            VALUES (p_os_id, p_origem, p_programacao_id, v_etapa_anterior, p_etapa_destino, p_etapa_destino, v_user_id);

            PERFORM public.refresh_esteira_laboratorio();
            RETURN jsonb_build_object('success', true, 'message', 'Produção assumida com sucesso');
        ELSE
            v_result := public._rpc_avancar_esteira_laboratorio_internal(p_os_id, p_origem, p_etapa_destino, p_programacao_id);
            IF COALESCE((v_result->>'success')::boolean, false) THEN
              PERFORM public.refresh_esteira_laboratorio();
            END IF;
            RETURN v_result;
    END CASE;
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_avancar_esteira_laboratorio(uuid, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_avancar_esteira_laboratorio(uuid, text, text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_avancar_esteira_laboratorio(uuid, text, text, uuid) TO authenticated;
