
ALTER TABLE public.alertas_operacionais
  ADD COLUMN IF NOT EXISTS chave_dedupe text;

CREATE INDEX IF NOT EXISTS idx_alertas_operacionais_chave_dedupe
  ON public.alertas_operacionais (chave_dedupe);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_alertas_operacionais_abertos_chave_dedupe
  ON public.alertas_operacionais (chave_dedupe)
  WHERE status IN ('aberto','lido','reaberto');

CREATE OR REPLACE FUNCTION public.fn_upsert_alerta_operacional(
  p_tipo text, p_origem text, p_titulo text, p_descricao text, p_gravidade text,
  p_referencia_tabela text, p_referencia_id uuid,
  p_cliente_id uuid, p_fazenda_id uuid, p_talhao_id uuid, p_consultor_id uuid,
  p_os_id uuid, p_registro_consultor_id uuid, p_solicitacao_id uuid,
  p_lote_id uuid, p_entrega_id uuid,
  p_proxima_acao text, p_metadata jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_chave text;
  v_id uuid;
BEGIN
  v_chave := concat_ws('|',
    p_tipo, p_origem,
    coalesce(p_referencia_tabela,''), coalesce(p_referencia_id::text,''),
    coalesce(p_cliente_id::text,''), coalesce(p_fazenda_id::text,''),
    coalesce(p_consultor_id::text,''), coalesce(p_os_id::text,''));

  UPDATE public.alertas_operacionais
     SET descricao = p_descricao, gravidade = p_gravidade, titulo = p_titulo,
         proxima_acao = p_proxima_acao, metadata = coalesce(p_metadata,'{}'::jsonb),
         updated_at = now()
   WHERE chave_dedupe = v_chave AND status IN ('aberto','lido','reaberto')
  RETURNING id INTO v_id;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  SELECT id INTO v_id FROM public.alertas_operacionais
   WHERE chave_dedupe = v_chave AND status = 'ignorado'
     AND ignorado_em > now() - interval '1 day' LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  SELECT id INTO v_id FROM public.alertas_operacionais
   WHERE chave_dedupe = v_chave AND status = 'resolvido'
     AND resolvido_em > now() - (CASE p_gravidade
        WHEN 'critica' THEN interval '3 days'
        WHEN 'alta' THEN interval '7 days'
        ELSE interval '15 days' END)
   LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  INSERT INTO public.alertas_operacionais(
    tipo, origem, titulo, descricao, gravidade, status,
    cliente_id, fazenda_id, talhao_id, consultor_id,
    os_id, registro_consultor_id, solicitacao_id, lote_id, entrega_id,
    referencia_tabela, referencia_id, proxima_acao, metadata, chave_dedupe
  ) VALUES (
    p_tipo, p_origem, p_titulo, p_descricao, p_gravidade, 'aberto',
    p_cliente_id, p_fazenda_id, p_talhao_id, p_consultor_id,
    p_os_id, p_registro_consultor_id, p_solicitacao_id, p_lote_id, p_entrega_id,
    p_referencia_tabela, p_referencia_id, p_proxima_acao, coalesce(p_metadata,'{}'::jsonb), v_chave
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_upsert_alerta_operacional(text,text,text,text,text,text,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,jsonb) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.rpc_gerar_alertas_operacionais()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_total_processados int := 0;
  v_total_resolvidos int := 0;
  v_chaves text[] := ARRAY[]::text[];
  v_now timestamptz := now();
  rec record;
  v_dias int;
  v_meta jsonb;
  v_alerta_id uuid;
  v_k text;
BEGIN
  IF NOT (
    public.has_role(auth.uid(),'administrador') OR
    public.has_role(auth.uid(),'gestor') OR
    public.has_role(auth.uid(),'administrativo') OR
    auth.role() = 'service_role'
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

  -- RESOLUÇÃO AUTOMÁTICA
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
         jsonb_build_object('verificado_em', v_now) FROM upd;
  GET DIAGNOSTICS v_total_resolvidos = ROW_COUNT;

  RETURN jsonb_build_object(
    'total_processados', v_total_processados,
    'total_resolvidos_automaticamente', v_total_resolvidos,
    'executado_em', v_now
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_gerar_alertas_operacionais() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_gerar_alertas_operacionais() TO authenticated;
