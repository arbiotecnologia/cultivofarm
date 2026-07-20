
-- 1. Permitir user_id NULL apenas para ações automáticas do sistema
ALTER TABLE public.alertas_acoes ALTER COLUMN user_id DROP NOT NULL;

-- Policy adicional para inserções automáticas via RPC SECURITY DEFINER já bypassa RLS,
-- mas garantimos que usuários autenticados não consigam inserir com user_id NULL.
DROP POLICY IF EXISTS alertas_acoes_insert_self ON public.alertas_acoes;
CREATE POLICY alertas_acoes_insert_self ON public.alertas_acoes
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.alertas_operacionais a WHERE a.id = alertas_acoes.alerta_id)
  );

-- 2. Função auxiliar de acesso a alerta
CREATE OR REPLACE FUNCTION public.can_user_access_alerta(p_alerta_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_alerta record;
BEGIN
  IF v_uid IS NULL THEN RETURN false; END IF;

  IF public.has_role(v_uid, 'cliente_produtor'::app_role)
     OR public.has_role(v_uid, 'financeiro'::app_role) THEN
    RETURN false;
  END IF;

  IF public.has_role(v_uid, 'administrador'::app_role)
     OR public.has_role(v_uid, 'gestor'::app_role)
     OR public.has_role(v_uid, 'administrativo'::app_role) THEN
    RETURN true;
  END IF;

  SELECT * INTO v_alerta FROM public.alertas_operacionais WHERE id = p_alerta_id;
  IF NOT FOUND THEN RETURN false; END IF;

  IF public.has_role(v_uid, 'consultor_tecnico'::app_role)
     OR public.has_role(v_uid, 'tecnico_agronomo'::app_role) THEN
    RETURN v_alerta.consultor_id = v_uid
        OR v_alerta.responsavel_id = v_uid
        OR v_alerta.criado_por = v_uid;
  END IF;

  IF public.has_role(v_uid, 'producao'::app_role)
     OR public.has_role(v_uid, 'operador_onfarm'::app_role) THEN
    RETURN v_alerta.origem IN ('laboratorio','cq','estoque','entrega');
  END IF;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.can_user_access_alerta(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_user_access_alerta(uuid) TO authenticated, service_role;

-- 3. rpc_recalcular_prioridade_alerta: corrige tipo_alerta -> tipo, restringe execução
CREATE OR REPLACE FUNCTION public.rpc_recalcular_prioridade_alerta(p_alerta_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_score integer := 0;
  v_alerta record;
  v_uid uuid := auth.uid();
  v_is_service boolean := COALESCE((current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role', false);
BEGIN
  IF NOT v_is_service THEN
    IF v_uid IS NULL THEN
      RAISE EXCEPTION 'permission_denied' USING HINT = 'Usuario nao autenticado';
    END IF;
    IF NOT (
      public.has_role(v_uid,'administrador'::app_role)
      OR public.has_role(v_uid,'gestor'::app_role)
      OR public.has_role(v_uid,'administrativo'::app_role)
    ) THEN
      RAISE EXCEPTION 'permission_denied' USING HINT = 'Perfil sem permissao para recalcular prioridade';
    END IF;
  END IF;

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
  IF v_alerta.tipo = 'cq_reprovado' THEN v_score := v_score + 20; END IF;
  IF v_alerta.tipo = 'entrega_pendente_critica' THEN v_score := v_score + 15; END IF;

  UPDATE public.alertas_operacionais SET prioridade_score = v_score WHERE id = p_alerta_id;
  RETURN v_score;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_recalcular_prioridade_alerta(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_recalcular_prioridade_alerta(uuid) TO authenticated, service_role;

-- 4. rpc_aplicar_sla_alertas: corrige tipo_alerta -> tipo, restringe execução manual
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
  v_uid uuid := auth.uid();
  v_is_service boolean := COALESCE((current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role', false);
BEGIN
  IF NOT v_is_service THEN
    IF v_uid IS NULL THEN
      RAISE EXCEPTION 'permission_denied' USING HINT = 'Usuario nao autenticado';
    END IF;
    IF NOT (
      public.has_role(v_uid,'administrador'::app_role)
      OR public.has_role(v_uid,'gestor'::app_role)
      OR public.has_role(v_uid,'administrativo'::app_role)
    ) THEN
      RAISE EXCEPTION 'permission_denied' USING HINT = 'Perfil sem permissao para aplicar SLA';
    END IF;
  END IF;

  FOR v_alerta IN
    SELECT * FROM public.alertas_operacionais
    WHERE COALESCE(status,'aberto') NOT IN ('resolvido','ignorado','cancelado')
  LOOP
    v_processados := v_processados + 1;

    SELECT * INTO v_config FROM public.alertas_sla_config
      WHERE ativo = true AND tipo_alerta = v_alerta.tipo
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
      SELECT * INTO v_alerta FROM public.alertas_operacionais WHERE id = v_alerta.id;
    END IF;

    IF NOT v_alerta.sla_vencido AND v_alerta.sla_resolucao_em IS NOT NULL AND now() > v_alerta.sla_resolucao_em THEN
      UPDATE public.alertas_operacionais
        SET sla_vencido = true, sla_vencido_em = now()
        WHERE id = v_alerta.id;
      INSERT INTO public.alertas_sla_eventos (alerta_id, config_id, evento, vencido_em)
        VALUES (v_alerta.id, v_config.id, 'sla_resolucao_vencido', now());
      v_vencidos := v_vencidos + 1;
      v_alerta.sla_vencido := true;
    END IF;

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

      IF v_config.nova_gravidade_apos_sla IS NOT NULL
         AND v_config.nova_gravidade_apos_sla <> v_alerta.gravidade
         AND v_alerta.tipo IS DISTINCT FROM 'aplicacao_nao_registrada' THEN
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

REVOKE ALL ON FUNCTION public.rpc_aplicar_sla_alertas() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_aplicar_sla_alertas() TO authenticated, service_role;

-- 5. rpc_registrar_primeira_resposta_alerta: usar user_id correto + can_user_access_alerta
CREATE OR REPLACE FUNCTION public.rpc_registrar_primeira_resposta_alerta(p_alerta_id uuid)
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
  IF NOT public.can_user_access_alerta(p_alerta_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'forbidden');
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
      VALUES (p_alerta_id, v_alerta.sla_config_id, 'primeira_resposta_registrada', auth.uid(), auth.uid());

    IF v_alerta.sla_primeira_resposta_em IS NOT NULL AND now() > v_alerta.sla_primeira_resposta_em THEN
      INSERT INTO public.alertas_sla_eventos (alerta_id, config_id, evento, criado_por)
        VALUES (p_alerta_id, v_alerta.sla_config_id, 'sla_resposta_vencido', auth.uid());
    END IF;

    BEGIN
      INSERT INTO public.alertas_acoes (alerta_id, user_id, acao, observacao)
        VALUES (p_alerta_id, auth.uid(), 'primeira_resposta', 'Primeira resposta registrada');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  PERFORM public.rpc_recalcular_prioridade_alerta(p_alerta_id);
  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_registrar_primeira_resposta_alerta(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_registrar_primeira_resposta_alerta(uuid) TO authenticated, service_role;

-- 6. rpc_assumir_alerta: usar user_id correto + can_user_access_alerta
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
  IF NOT public.can_user_access_alerta(p_alerta_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'forbidden');
  END IF;

  SELECT * INTO v_alerta FROM public.alertas_operacionais WHERE id = p_alerta_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'alerta_nao_encontrado');
  END IF;

  UPDATE public.alertas_operacionais
    SET responsavel_id = auth.uid()
    WHERE id = p_alerta_id;

  BEGIN
    INSERT INTO public.alertas_acoes (alerta_id, user_id, acao, observacao)
      VALUES (p_alerta_id, auth.uid(), 'assumir', 'Alerta assumido');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  PERFORM public.rpc_recalcular_prioridade_alerta(p_alerta_id);
  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_assumir_alerta(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_assumir_alerta(uuid) TO authenticated, service_role;

-- 7. Ajuste em rpc_gerar_alertas_operacionais: o INSERT em alertas_acoes precisa de metadata
-- para ações automáticas. Quando auth.uid() é NULL (execução por service role/cron),
-- o user_id ficará NULL e metadata identifica origem sistema.
CREATE OR REPLACE FUNCTION public.rpc_gerar_alertas_operacionais()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_processados int := 0;
  v_total_resolvidos int := 0;
  v_chaves text[] := ARRAY[]::text[];
  v_now timestamptz := now();
  rec record;
  v_dias int;
  v_meta jsonb;
  v_alerta_id uuid;
BEGIN
  IF NOT (
    public.has_role(auth.uid(),'administrador') OR
    public.has_role(auth.uid(),'gestor') OR
    public.has_role(auth.uid(),'administrativo') OR
    COALESCE(auth.role(),'') = 'service_role'
  ) THEN
    RAISE EXCEPTION 'Sem permissão para executar geração de alertas';
  END IF;

  -- VISITAS
  IF coalesce((SELECT ativo FROM public.alertas_regras WHERE codigo='visita_sem_checkin'),true) THEN
    v_dias := coalesce((SELECT (parametros->>'dias')::int FROM public.alertas_regras WHERE codigo='visita_sem_checkin'),2);
    FOR rec IN SELECT * FROM public.vw_fluxo_visita_tecnica
       WHERE origem_fluxo IN ('visita_com_solicitacao','visita_avulsa')
         AND coalesce(possui_checkin,false)=false
         AND coalesce(status_visita,'') NOT IN ('finalizado','aprovado','convertido_os')
         AND coalesce(dias_em_aberto,0) >= v_dias LOOP
      v_meta := jsonb_build_object('origem_fluxo',rec.origem_fluxo,'status_visita',rec.status_visita,'dias_em_aberto',rec.dias_em_aberto,'bloqueios',rec.bloqueios,'verificado_em',v_now);
      v_alerta_id := public.fn_upsert_alerta_operacional('visita_sem_checkin','visita','Visita sem check-in',
        format('Visita %s do cliente %s sem check-in há %s dias.',coalesce(rec.codigo_visita,rec.numero_solicitacao,'(sem código)'),coalesce(rec.cliente_nome,'(sem cliente)'),coalesce(rec.dias_em_aberto::text,'?')),
        'media','vw_fluxo_visita_tecnica',coalesce(rec.registro_consultor_id,rec.solicitacao_id),
        rec.cliente_id,rec.fazenda_id,rec.talhao_id,rec.consultor_id,NULL,rec.registro_consultor_id,rec.solicitacao_id,NULL,NULL,
        coalesce(rec.proxima_acao,'Realizar check-in da visita'),v_meta);
      v_chaves := array_append(v_chaves, concat_ws('|','visita_sem_checkin','visita','vw_fluxo_visita_tecnica',coalesce(coalesce(rec.registro_consultor_id,rec.solicitacao_id)::text,''),coalesce(rec.cliente_id::text,''),coalesce(rec.fazenda_id::text,''),coalesce(rec.consultor_id::text,''),''));
      v_total_processados := v_total_processados+1;
    END LOOP;
  END IF;

  IF coalesce((SELECT ativo FROM public.alertas_regras WHERE codigo='visita_finalizada_sem_recomendacao'),true) THEN
    FOR rec IN SELECT * FROM public.vw_fluxo_visita_tecnica
       WHERE status_visita IN ('finalizado','aprovado') AND coalesce(possui_recomendacao,false)=false LOOP
      v_meta := jsonb_build_object('status_visita',rec.status_visita,'bloqueios',rec.bloqueios,'verificado_em',v_now);
      v_alerta_id := public.fn_upsert_alerta_operacional('visita_finalizada_sem_recomendacao','visita','Visita finalizada sem recomendação',
        format('Visita %s do cliente %s finalizada sem recomendação registrada.',coalesce(rec.codigo_visita,'(sem código)'),coalesce(rec.cliente_nome,'(sem cliente)')),
        'alta','vw_fluxo_visita_tecnica',rec.registro_consultor_id,
        rec.cliente_id,rec.fazenda_id,rec.talhao_id,rec.consultor_id,NULL,rec.registro_consultor_id,rec.solicitacao_id,NULL,NULL,
        'Registrar recomendação técnica',v_meta);
      v_chaves := array_append(v_chaves, concat_ws('|','visita_finalizada_sem_recomendacao','visita','vw_fluxo_visita_tecnica',coalesce(rec.registro_consultor_id::text,''),coalesce(rec.cliente_id::text,''),coalesce(rec.fazenda_id::text,''),coalesce(rec.consultor_id::text,''),''));
      v_total_processados := v_total_processados+1;
    END LOOP;
  END IF;

  IF coalesce((SELECT ativo FROM public.alertas_regras WHERE codigo='recomendacao_liberada_sem_decisao'),true) THEN
    v_dias := coalesce((SELECT (parametros->>'dias')::int FROM public.alertas_regras WHERE codigo='recomendacao_liberada_sem_decisao'),3);
    FOR rec IN SELECT * FROM public.vw_fluxo_visita_tecnica
       WHERE coalesce(possui_recomendacao,false)=true AND data_liberacao_recomendacao IS NOT NULL
         AND coalesce(possui_os,false)=false AND data_conversao_os IS NULL
         AND data_liberacao_recomendacao <= now() - make_interval(days => v_dias) LOOP
      v_meta := jsonb_build_object('data_liberacao',rec.data_liberacao_recomendacao,'verificado_em',v_now);
      v_alerta_id := public.fn_upsert_alerta_operacional('recomendacao_liberada_sem_decisao','recomendacao','Recomendação liberada sem decisão',
        format('Recomendação liberada para cliente %s aguarda decisão há mais de %s dias.',coalesce(rec.cliente_nome,'(sem cliente)'),v_dias),
        'media','vw_fluxo_visita_tecnica',rec.registro_consultor_id,
        rec.cliente_id,rec.fazenda_id,rec.talhao_id,rec.consultor_id,NULL,rec.registro_consultor_id,rec.solicitacao_id,NULL,NULL,
        'Aprovar ou recusar a recomendação',v_meta);
      v_chaves := array_append(v_chaves, concat_ws('|','recomendacao_liberada_sem_decisao','recomendacao','vw_fluxo_visita_tecnica',coalesce(rec.registro_consultor_id::text,''),coalesce(rec.cliente_id::text,''),coalesce(rec.fazenda_id::text,''),coalesce(rec.consultor_id::text,''),''));
      v_total_processados := v_total_processados+1;
    END LOOP;
  END IF;

  IF coalesce((SELECT ativo FROM public.alertas_regras WHERE codigo='recomendacao_convertida_sem_os'),true) THEN
    FOR rec IN SELECT * FROM public.vw_fluxo_visita_tecnica
       WHERE status_visita='convertido_os' AND (coalesce(possui_os,false)=false OR os_id IS NULL) LOOP
      v_meta := jsonb_build_object('bloqueios',rec.bloqueios,'verificado_em',v_now);
      v_alerta_id := public.fn_upsert_alerta_operacional('recomendacao_convertida_sem_os','recomendacao','Recomendação convertida sem OS vinculada',
        format('Visita %s do cliente %s marcada como convertida, mas sem OS vinculada.',coalesce(rec.codigo_visita,'(sem código)'),coalesce(rec.cliente_nome,'(sem cliente)')),
        'critica','vw_fluxo_visita_tecnica',rec.registro_consultor_id,
        rec.cliente_id,rec.fazenda_id,rec.talhao_id,rec.consultor_id,NULL,rec.registro_consultor_id,rec.solicitacao_id,NULL,NULL,
        'Vincular OS à recomendação',v_meta);
      v_chaves := array_append(v_chaves, concat_ws('|','recomendacao_convertida_sem_os','recomendacao','vw_fluxo_visita_tecnica',coalesce(rec.registro_consultor_id::text,''),coalesce(rec.cliente_id::text,''),coalesce(rec.fazenda_id::text,''),coalesce(rec.consultor_id::text,''),''));
      v_total_processados := v_total_processados+1;
    END LOOP;
  END IF;

  IF coalesce((SELECT ativo FROM public.alertas_regras WHERE codigo='visita_com_bloqueio'),true) THEN
    FOR rec IN SELECT * FROM public.vw_fluxo_visita_tecnica
       WHERE bloqueios IS NOT NULL AND array_length(bloqueios,1)>0 LOOP
      v_meta := jsonb_build_object('bloqueios',rec.bloqueios,'status_visita',rec.status_visita,'verificado_em',v_now);
      v_alerta_id := public.fn_upsert_alerta_operacional('visita_com_bloqueio','visita','Visita com bloqueio',
        format('Visita %s do cliente %s possui bloqueios: %s.',coalesce(rec.codigo_visita,'(sem código)'),coalesce(rec.cliente_nome,'(sem cliente)'),array_to_string(rec.bloqueios,', ')),
        'media','vw_fluxo_visita_tecnica',rec.registro_consultor_id,
        rec.cliente_id,rec.fazenda_id,rec.talhao_id,rec.consultor_id,NULL,rec.registro_consultor_id,rec.solicitacao_id,NULL,NULL,
        coalesce(rec.proxima_acao,'Revisar pendências da visita'),v_meta);
      v_chaves := array_append(v_chaves, concat_ws('|','visita_com_bloqueio','visita','vw_fluxo_visita_tecnica',coalesce(rec.registro_consultor_id::text,''),coalesce(rec.cliente_id::text,''),coalesce(rec.fazenda_id::text,''),coalesce(rec.consultor_id::text,''),''));
      v_total_processados := v_total_processados+1;
    END LOOP;
  END IF;

  -- ESTEIRA LABORATÓRIO
  FOR rec IN SELECT * FROM public.vw_esteira_laboratorio LOOP
    v_meta := jsonb_build_object('status_esteira_oficial',rec.status_esteira_oficial,'bloqueios',rec.bloqueios,'pendencias_informativas',rec.pendencias_informativas,'atrasado',rec.atrasado,'verificado_em',v_now);

    IF rec.bloqueios IS NOT NULL AND 'os_duplicada'=ANY(rec.bloqueios)
       AND coalesce((SELECT ativo FROM public.alertas_regras WHERE codigo='os_duplicada'),true) THEN
      v_alerta_id := public.fn_upsert_alerta_operacional('os_duplicada','laboratorio','OS duplicada',
        format('OS %s possui indicador de duplicidade.',coalesce(rec.numero_os,'(sem número)')),
        'critica','vw_esteira_laboratorio',rec.os_id,rec.cliente_id,rec.fazenda_id,rec.talhao_id,NULL,
        rec.os_id,NULL,NULL,rec.lote_id,rec.entrega_id,'Revisar OS duplicada (não corrigir automaticamente)',v_meta);
      v_chaves := array_append(v_chaves,concat_ws('|','os_duplicada','laboratorio','vw_esteira_laboratorio',coalesce(rec.os_id::text,''),coalesce(rec.cliente_id::text,''),coalesce(rec.fazenda_id::text,''),'',coalesce(rec.os_id::text,'')));
      v_total_processados := v_total_processados+1;
    END IF;

    IF rec.bloqueios IS NOT NULL AND 'sem_programacao'=ANY(rec.bloqueios)
       AND coalesce(rec.status_esteira_oficial,'') NOT IN ('finalizada','cancelada')
       AND coalesce((SELECT ativo FROM public.alertas_regras WHERE codigo='os_sem_programacao'),true) THEN
      v_alerta_id := public.fn_upsert_alerta_operacional('os_sem_programacao','laboratorio','OS sem programação',
        format('OS %s sem programação de produção.',coalesce(rec.numero_os,'(sem número)')),
        'alta','vw_esteira_laboratorio',rec.os_id,rec.cliente_id,rec.fazenda_id,rec.talhao_id,NULL,
        rec.os_id,NULL,NULL,rec.lote_id,rec.entrega_id,coalesce(rec.proxima_acao,'Programar produção'),v_meta);
      v_chaves := array_append(v_chaves,concat_ws('|','os_sem_programacao','laboratorio','vw_esteira_laboratorio',coalesce(rec.os_id::text,''),coalesce(rec.cliente_id::text,''),coalesce(rec.fazenda_id::text,''),'',coalesce(rec.os_id::text,'')));
      v_total_processados := v_total_processados+1;
    END IF;

    IF rec.bloqueios IS NOT NULL AND 'sem_lote'=ANY(rec.bloqueios)
       AND coalesce(rec.status_esteira_oficial,'') IN ('em_producao','aguardando_cq','cq_aprovado','envase','pronto_entrega','entrega_pendente')
       AND coalesce((SELECT ativo FROM public.alertas_regras WHERE codigo='os_sem_lote'),true) THEN
      v_alerta_id := public.fn_upsert_alerta_operacional('os_sem_lote','laboratorio','OS sem lote',
        format('OS %s sem lote vinculado.',coalesce(rec.numero_os,'(sem número)')),
        'alta','vw_esteira_laboratorio',rec.os_id,rec.cliente_id,rec.fazenda_id,rec.talhao_id,NULL,
        rec.os_id,NULL,NULL,rec.lote_id,rec.entrega_id,'Gerar lote para a OS',v_meta);
      v_chaves := array_append(v_chaves,concat_ws('|','os_sem_lote','laboratorio','vw_esteira_laboratorio',coalesce(rec.os_id::text,''),coalesce(rec.cliente_id::text,''),coalesce(rec.fazenda_id::text,''),'',coalesce(rec.os_id::text,'')));
      v_total_processados := v_total_processados+1;
    END IF;

    IF (rec.bloqueios IS NOT NULL AND 'cq_pendente'=ANY(rec.bloqueios))
       AND coalesce(rec.status_esteira_oficial,'')='aguardando_cq'
       AND coalesce((SELECT ativo FROM public.alertas_regras WHERE codigo='cq_pendente'),true) THEN
      v_alerta_id := public.fn_upsert_alerta_operacional('cq_pendente','cq','CQ pendente',
        format('OS %s aguardando controle de qualidade.',coalesce(rec.numero_os,'(sem número)')),
        'alta','vw_esteira_laboratorio',rec.os_id,rec.cliente_id,rec.fazenda_id,rec.talhao_id,NULL,
        rec.os_id,NULL,NULL,rec.lote_id,rec.entrega_id,'Registrar CQ do lote',v_meta);
      v_chaves := array_append(v_chaves,concat_ws('|','cq_pendente','cq','vw_esteira_laboratorio',coalesce(rec.os_id::text,''),coalesce(rec.cliente_id::text,''),coalesce(rec.fazenda_id::text,''),'',coalesce(rec.os_id::text,'')));
      v_total_processados := v_total_processados+1;
    END IF;

    IF ((rec.bloqueios IS NOT NULL AND 'cq_reprovado'=ANY(rec.bloqueios))
         OR coalesce(rec.status_esteira_oficial,'')='cq_reprovado')
       AND coalesce((SELECT ativo FROM public.alertas_regras WHERE codigo='cq_reprovado'),true) THEN
      v_alerta_id := public.fn_upsert_alerta_operacional('cq_reprovado','cq','CQ reprovado',
        format('OS %s com CQ reprovado.',coalesce(rec.numero_os,'(sem número)')),
        'critica','vw_esteira_laboratorio',rec.os_id,rec.cliente_id,rec.fazenda_id,rec.talhao_id,NULL,
        rec.os_id,NULL,NULL,rec.lote_id,rec.entrega_id,'Avaliar reprovação de CQ e reprogramar',v_meta);
      v_chaves := array_append(v_chaves,concat_ws('|','cq_reprovado','cq','vw_esteira_laboratorio',coalesce(rec.os_id::text,''),coalesce(rec.cliente_id::text,''),coalesce(rec.fazenda_id::text,''),'',coalesce(rec.os_id::text,'')));
      v_total_processados := v_total_processados+1;
    END IF;

    IF (rec.bloqueios IS NOT NULL AND 'sem_envase'=ANY(rec.bloqueios))
       AND coalesce(rec.status_esteira_oficial,'') IN ('cq_aprovado','envase','pronto_entrega','entrega_pendente')
       AND coalesce((SELECT ativo FROM public.alertas_regras WHERE codigo='os_sem_envase'),true) THEN
      v_alerta_id := public.fn_upsert_alerta_operacional('os_sem_envase','laboratorio','OS sem envase',
        format('OS %s aguardando envase.',coalesce(rec.numero_os,'(sem número)')),
        'alta','vw_esteira_laboratorio',rec.os_id,rec.cliente_id,rec.fazenda_id,rec.talhao_id,NULL,
        rec.os_id,NULL,NULL,rec.lote_id,rec.entrega_id,'Registrar envase do lote',v_meta);
      v_chaves := array_append(v_chaves,concat_ws('|','os_sem_envase','laboratorio','vw_esteira_laboratorio',coalesce(rec.os_id::text,''),coalesce(rec.cliente_id::text,''),coalesce(rec.fazenda_id::text,''),'',coalesce(rec.os_id::text,'')));
      v_total_processados := v_total_processados+1;
    END IF;

    IF (rec.bloqueios IS NOT NULL AND 'sem_estoque'=ANY(rec.bloqueios))
       AND coalesce(rec.status_esteira_oficial,'') IN ('envase','pronto_entrega','entrega_pendente')
       AND coalesce((SELECT ativo FROM public.alertas_regras WHERE codigo='os_sem_estoque'),true) THEN
      v_alerta_id := public.fn_upsert_alerta_operacional('os_sem_estoque','estoque','OS sem estoque',
        format('OS %s sem reserva ou movimentação de estoque.',coalesce(rec.numero_os,'(sem número)')),
        'alta','vw_esteira_laboratorio',rec.os_id,rec.cliente_id,rec.fazenda_id,rec.talhao_id,NULL,
        rec.os_id,NULL,NULL,rec.lote_id,rec.entrega_id,'Reservar/registrar estoque para a OS',v_meta);
      v_chaves := array_append(v_chaves,concat_ws('|','os_sem_estoque','estoque','vw_esteira_laboratorio',coalesce(rec.os_id::text,''),coalesce(rec.cliente_id::text,''),coalesce(rec.fazenda_id::text,''),'',coalesce(rec.os_id::text,'')));
      v_total_processados := v_total_processados+1;
    END IF;

    IF (coalesce(rec.status_esteira_oficial,'')='entrega_pendente'
        OR (rec.bloqueios IS NOT NULL AND 'sem_entrega_confirmada'=ANY(rec.bloqueios)))
       AND coalesce((SELECT ativo FROM public.alertas_regras WHERE codigo='entrega_pendente'),true) THEN
      v_alerta_id := public.fn_upsert_alerta_operacional('entrega_pendente','entrega','Entrega pendente',
        format('OS %s aguardando confirmação de entrega.',coalesce(rec.numero_os,'(sem número)')),
        'alta','vw_esteira_laboratorio',rec.os_id,rec.cliente_id,rec.fazenda_id,rec.talhao_id,NULL,
        rec.os_id,NULL,NULL,rec.lote_id,rec.entrega_id,'Confirmar entrega',v_meta);
      v_chaves := array_append(v_chaves,concat_ws('|','entrega_pendente','entrega','vw_esteira_laboratorio',coalesce(rec.os_id::text,''),coalesce(rec.cliente_id::text,''),coalesce(rec.fazenda_id::text,''),'',coalesce(rec.os_id::text,'')));
      v_total_processados := v_total_processados+1;
    END IF;

    IF coalesce(rec.pode_finalizar,false)=true
       AND coalesce(rec.status_esteira_oficial,'')<>'finalizada'
       AND coalesce((SELECT ativo FROM public.alertas_regras WHERE codigo='os_apta_finalizacao'),true) THEN
      v_alerta_id := public.fn_upsert_alerta_operacional('os_apta_finalizacao','laboratorio','OS apta para finalização',
        format('OS %s atende a todos os critérios para finalização.',coalesce(rec.numero_os,'(sem número)')),
        'media','vw_esteira_laboratorio',rec.os_id,rec.cliente_id,rec.fazenda_id,rec.talhao_id,NULL,
        rec.os_id,NULL,NULL,rec.lote_id,rec.entrega_id,'Finalizar OS no cockpit',v_meta);
      v_chaves := array_append(v_chaves,concat_ws('|','os_apta_finalizacao','laboratorio','vw_esteira_laboratorio',coalesce(rec.os_id::text,''),coalesce(rec.cliente_id::text,''),coalesce(rec.fazenda_id::text,''),'',coalesce(rec.os_id::text,'')));
      v_total_processados := v_total_processados+1;
    END IF;

    IF rec.pendencias_informativas IS NOT NULL
       AND ('aplicacao_nao_registrada'=ANY(rec.pendencias_informativas)
            OR 'cliente_nao_informou_aplicacao'=ANY(rec.pendencias_informativas))
       AND coalesce((SELECT ativo FROM public.alertas_regras WHERE codigo='aplicacao_nao_registrada'),true) THEN
      v_alerta_id := public.fn_upsert_alerta_operacional('aplicacao_nao_registrada','entrega','Aplicação não registrada',
        format('OS %s entregue, mas aplicação em campo ainda não foi registrada.',coalesce(rec.numero_os,'(sem número)')),
        'informativa','vw_esteira_laboratorio',rec.os_id,rec.cliente_id,rec.fazenda_id,rec.talhao_id,NULL,
        rec.os_id,NULL,NULL,rec.lote_id,rec.entrega_id,'Solicitar registro de aplicação',v_meta);
      v_chaves := array_append(v_chaves,concat_ws('|','aplicacao_nao_registrada','entrega','vw_esteira_laboratorio',coalesce(rec.os_id::text,''),coalesce(rec.cliente_id::text,''),coalesce(rec.fazenda_id::text,''),'',coalesce(rec.os_id::text,'')));
      v_total_processados := v_total_processados+1;
    END IF;

    IF coalesce(rec.atrasado,false)=true
       AND coalesce((SELECT ativo FROM public.alertas_regras WHERE codigo='os_atrasada'),true) THEN
      v_alerta_id := public.fn_upsert_alerta_operacional('os_atrasada','laboratorio','OS atrasada',
        format('OS %s sinalizada como atrasada na esteira.',coalesce(rec.numero_os,'(sem número)')),
        'alta','vw_esteira_laboratorio',rec.os_id,rec.cliente_id,rec.fazenda_id,rec.talhao_id,NULL,
        rec.os_id,NULL,NULL,rec.lote_id,rec.entrega_id,coalesce(rec.proxima_acao,'Verificar próxima etapa da esteira'),v_meta);
      v_chaves := array_append(v_chaves,concat_ws('|','os_atrasada','laboratorio','vw_esteira_laboratorio',coalesce(rec.os_id::text,''),coalesce(rec.cliente_id::text,''),coalesce(rec.fazenda_id::text,''),'',coalesce(rec.os_id::text,'')));
      v_total_processados := v_total_processados+1;
    END IF;
  END LOOP;

  -- RESOLUÇÃO AUTOMÁTICA: aceita auth.uid() NULL (service role/cron) com metadata identificando origem sistema.
  WITH a_resolver AS (
    SELECT id FROM public.alertas_operacionais
     WHERE status IN ('aberto','lido','reaberto')
       AND chave_dedupe IS NOT NULL
       AND NOT (chave_dedupe = ANY(v_chaves))
       AND tipo IN ('visita_sem_checkin','visita_finalizada_sem_recomendacao','recomendacao_liberada_sem_decisao','recomendacao_convertida_sem_os','visita_com_bloqueio','os_duplicada','os_sem_programacao','os_sem_lote','cq_pendente','cq_reprovado','os_sem_envase','os_sem_estoque','entrega_pendente','os_apta_finalizacao','aplicacao_nao_registrada','os_atrasada')
  ), upd AS (
    UPDATE public.alertas_operacionais a
       SET status='resolvido', resolvido_em=v_now, updated_at=v_now
      FROM a_resolver r WHERE a.id=r.id
    RETURNING a.id
  )
  INSERT INTO public.alertas_acoes(alerta_id, user_id, acao, observacao, metadata)
  SELECT id, auth.uid(), 'resolvido_automaticamente',
         'Condição do alerta não foi mais identificada na última verificação.',
         jsonb_build_object(
           'origem','sistema',
           'executado_por', COALESCE(auth.role(),'service_role'),
           'verificado_em', v_now
         ) FROM upd;
  GET DIAGNOSTICS v_total_resolvidos = ROW_COUNT;

  RETURN jsonb_build_object(
    'total_processados', v_total_processados,
    'total_resolvidos_automaticamente', v_total_resolvidos,
    'executado_em', v_now
  );
END;
$$;
