-- 1. Evolução segura da tabela ordens_servico_onfarm
ALTER TABLE public.ordens_servico_onfarm ADD COLUMN IF NOT EXISTS solicitacao_id uuid REFERENCES public.portal_solicitacoes(id);
ALTER TABLE public.ordens_servico_onfarm ADD COLUMN IF NOT EXISTS consultor_responsavel uuid REFERENCES auth.users(id);
ALTER TABLE public.ordens_servico_onfarm ADD COLUMN IF NOT EXISTS cultura_id uuid REFERENCES public.culturas(id);
ALTER TABLE public.ordens_servico_onfarm ADD COLUMN IF NOT EXISTS fase_fenologica text;
ALTER TABLE public.ordens_servico_onfarm ADD COLUMN IF NOT EXISTS problema_principal text;
ALTER TABLE public.ordens_servico_onfarm ADD COLUMN IF NOT EXISTS diagnostico text;
ALTER TABLE public.ordens_servico_onfarm ADD COLUMN IF NOT EXISTS recomendacao_tecnica text;
ALTER TABLE public.ordens_servico_onfarm ADD COLUMN IF NOT EXISTS observacoes_adicionais text;
ALTER TABLE public.ordens_servico_onfarm ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id);

-- 2. Limpeza de duplicados antes de criar o índice
DELETE FROM public.ordens_servico_onfarm a
USING public.ordens_servico_onfarm b
WHERE a.registro_consultor_id = b.registro_consultor_id
  AND a.created_at < b.created_at;

-- 3. Índice único parcial para evitar duplicidade
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_os_onfarm_registro_consultor 
ON public.ordens_servico_onfarm(registro_consultor_id) 
WHERE registro_consultor_id IS NOT NULL;

-- 4. Correção da RPC rpc_liberar_recomendacao_produtor
DROP FUNCTION IF EXISTS public.rpc_liberar_recomendacao_produtor(uuid);
CREATE OR REPLACE FUNCTION public.rpc_liberar_recomendacao_produtor(p_registro_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_user_role text;
  v_status_anterior text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Usuário não autenticado');
  END IF;

  SELECT role INTO v_user_role FROM public.user_roles WHERE user_id = v_user_id LIMIT 1;
  IF v_user_role NOT IN ('administrador', 'gestor') THEN
    RETURN json_build_object('success', false, 'message', 'Apenas administradores ou gestores podem liberar recomendações');
  END IF;

  SELECT status INTO v_status_anterior FROM public.registros_consultor WHERE id = p_registro_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'message', 'Visita não encontrada');
  END IF;

  UPDATE public.registros_consultor 
  SET status = 'aprovado', updated_at = now() 
  WHERE id = p_registro_id;

  INSERT INTO public.registros_consultor_status_log (registro_consultor_id, status_anterior, status_novo, changed_by, motivo)
  VALUES (p_registro_id, v_status_anterior, 'aprovado', v_user_id, 'Liberação para o produtor');

  RETURN json_build_object('success', true, 'message', 'Recomendação liberada com sucesso');
END;
$function$;

-- 5. Correção da RPC rpc_converter_visita_em_os
DROP FUNCTION IF EXISTS public.rpc_converter_visita_em_os(uuid, text);
CREATE OR REPLACE FUNCTION public.rpc_converter_visita_em_os(p_registro_id uuid, p_observacao text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_user_role text;
  v_registro record;
  v_new_os_id uuid;
  v_os_existente_id uuid;
  v_recomendacao record;
  v_status_anterior_visita text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Usuário não autenticado');
  END IF;

  SELECT role INTO v_user_role FROM public.user_roles WHERE user_id = v_user_id LIMIT 1;
  IF v_user_role NOT IN ('administrador', 'gestor', 'consultor_tecnico', 'tecnico_agronomo') THEN
    RETURN json_build_object('success', false, 'message', 'Usuário sem permissão para converter visita em OS');
  END IF;

  SELECT * INTO v_registro FROM public.registros_consultor WHERE id = p_registro_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'message', 'Visita técnica não encontrada');
  END IF;

  v_status_anterior_visita := v_registro.status;

  SELECT id INTO v_os_existente_id FROM public.ordens_servico_onfarm WHERE registro_consultor_id = p_registro_id LIMIT 1;
  IF v_os_existente_id IS NOT NULL THEN
    RETURN json_build_object(
      'success', true, 
      'already_exists', true,
      'os_id', v_os_existente_id,
      'message', 'OS já existente para esta visita.'
    );
  END IF;

  SELECT * INTO v_recomendacao FROM public.registros_consultor_recomendacoes WHERE registro_consultor_id = p_registro_id LIMIT 1;

  INSERT INTO public.ordens_servico_onfarm (
    cliente_id, fazenda_id, talhao_id, cultura_id,
    fase_fenologica, problema_principal, diagnostico, 
    recomendacao_tecnica, consultor_responsavel, solicitacao_id,
    registro_consultor_id, observacoes_adicionais, status, created_by
  ) VALUES (
    v_registro.cliente_id, v_registro.fazenda_id, v_registro.talhao_id, v_registro.cultura_id,
    v_registro.fase_fenologica, v_registro.problema_principal, v_registro.problema_principal,
    COALESCE(v_recomendacao.recomendacao_tecnica, v_registro.observacoes_tecnicas),
    v_registro.consultor_responsavel, v_registro.solicitacao_id,
    v_registro.id, p_observacao, 'aberta', v_user_id
  ) RETURNING id INTO v_new_os_id;

  UPDATE public.registros_consultor SET status = 'convertido_os', updated_at = now() WHERE id = p_registro_id;
  
  INSERT INTO public.registros_consultor_status_log (registro_consultor_id, status_anterior, status_novo, changed_by, motivo)
  VALUES (p_registro_id, v_status_anterior_visita, 'convertido_os', v_user_id, 'Conversão em Ordem de Serviço On-Farm');

  IF v_registro.solicitacao_id IS NOT NULL THEN
    UPDATE public.portal_solicitacoes SET status = 'convertida_os', updated_at = now() WHERE id = v_registro.solicitacao_id;
    INSERT INTO public.solicitacoes_timeline (solicitacao_id, tipo_evento, descricao, usuario_id)
    VALUES (v_registro.solicitacao_id, 'convertida_os', 'Visita convertida em OS On-Farm #' || v_new_os_id, v_user_id);
  END IF;

  INSERT INTO public.visitas_logs (registro_consultor_id, usuario_id, acao, descricao)
  VALUES (p_registro_id, v_user_id, 'conversao_os', 'Visita técnica convertida em Ordem de Serviço On-Farm ID: ' || v_new_os_id);

  RETURN json_build_object('success', true, 'os_id', v_new_os_id, 'message', 'Visita convertida em OS com sucesso');
END;
$function$;
