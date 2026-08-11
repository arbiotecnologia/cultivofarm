-- Rollback do kit restoration/os-programacao/
-- Remove o RPC de programacao e restaura o auto-avanco anterior
-- (assumir_producao subindo apenas de 'aprovada' para 'programada').
-- Escopo: staging ikaauvsflpmamgxmkhoq.

DROP FUNCTION IF EXISTS public.rpc_programar_os_v1(uuid, text, date);

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
