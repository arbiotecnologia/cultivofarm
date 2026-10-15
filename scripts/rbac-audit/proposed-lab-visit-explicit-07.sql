-- ARQUIVO HISTÓRICO JÁ APLICADO PELO REVISOR: NÃO EXECUTAR/REAPLICAR.
-- Versões oficiais: 20261015161648 (lab+visita), 20261015162631 (hotfix12); ver applied-catalog-lab-20261015-manifest.json.
-- CANDIDATO VISITA07 — LOCAL, NÃO APLICAR/PUBLICAR; após candidato07-base.
-- Não sobrescreve os snapshots dos hotfixes já aplicados. Sem tabelas/ACL/índices novos.
BEGIN;
DO $preflight$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.fiscal_environment_marker WHERE project_ref='swzpzcwiasxmjutrmvkm') THEN RAISE EXCEPTION 'CANONICAL_REF_REQUIRED'; END IF;
 IF NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261015154248' AND name='h_catalog_visit_conversion_enum_text') THEN RAISE EXCEPTION 'VISIT07_ENUM_HOTFIX_REQUIRED'; END IF;
 IF md5(pg_get_functiondef('public.rpc_converter_visita_em_os(uuid,text)'::regprocedure)) <> '89a904d232b32c57c24931a007f6d728' THEN RAISE EXCEPTION 'VISIT07_CONVERSION_DRIFT'; END IF;
 IF md5(pg_get_functiondef('public.auto_advance_solicitacao_on_registro()'::regprocedure)) <> 'b01b3190e09b3da5c401a5ec7dd4377a' THEN RAISE EXCEPTION 'VISIT07_REQUEST_TRIGGER_DRIFT'; END IF;
 IF md5(pg_get_functiondef('public.fn_create_programacao_on_os_onfarm_insert()'::regprocedure)) <> '55d57b6e698b48ccf6673978980400b4' THEN RAISE EXCEPTION 'VISIT07_PROGRAMMING_DRIFT'; END IF;
 IF to_regprocedure('platform_private.lab_item_is_manufacturable(uuid,uuid)') IS NULL THEN RAISE EXCEPTION 'VISIT07_BASE_REQUIRED'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_index WHERE indexrelid=to_regclass('public.idx_unique_os_onfarm_registro_consultor') AND indisunique AND indisvalid AND pg_get_indexdef(indexrelid)='CREATE UNIQUE INDEX idx_unique_os_onfarm_registro_consultor ON public.ordens_servico_onfarm USING btree (registro_consultor_id) WHERE (registro_consultor_id IS NOT NULL)') THEN RAISE EXCEPTION 'VISIT07_CARDINALITY_DRIFT'; END IF;
 IF NOT has_function_privilege('authenticated','public.rpc_converter_visita_em_os(uuid,text)','EXECUTE') OR has_function_privilege('anon','public.rpc_converter_visita_em_os(uuid,text)','EXECUTE') THEN RAISE EXCEPTION 'VISIT07_ACL_DRIFT'; END IF;
END $preflight$;

-- Coordena qualquer escrita de recomendação com o lock do pai da conversão.
-- Não reclassifica nem repara flags existentes. Bloqueia mutação pós-encaminhamento.
CREATE OR REPLACE FUNCTION platform_private.lab_visit_recommendation_lock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $lock$
DECLARE v_id uuid; v_status text;
BEGIN
 FOR v_id IN SELECT DISTINCT id FROM unnest(ARRAY[
   CASE WHEN TG_OP<>'INSERT' THEN OLD.registro_consultor_id END,
   CASE WHEN TG_OP<>'DELETE' THEN NEW.registro_consultor_id END]) id WHERE id IS NOT NULL ORDER BY id LOOP
   SELECT status::text INTO v_status FROM public.registros_consultor WHERE id=v_id FOR UPDATE;
   IF v_status='convertido_os' THEN RAISE EXCEPTION 'VISIT07_REVIEW_REQUIRED' USING ERRCODE='23514',HINT='Visita já encaminhada; preserve a seleção e revise pelo fluxo técnico autorizado.'; END IF;
 END LOOP;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $lock$;
REVOKE ALL ON FUNCTION platform_private.lab_visit_recommendation_lock() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER trg_lab_visit_recommendation_lock BEFORE INSERT OR UPDATE OR DELETE ON public.registros_consultor_recomendacoes
FOR EACH ROW EXECUTE FUNCTION platform_private.lab_visit_recommendation_lock();

-- convertido_os não significa solicitação concluída, mesmo em visita mista.
CREATE OR REPLACE FUNCTION public.auto_advance_solicitacao_on_registro()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
 IF NEW.solicitacao_id IS NULL THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND OLD.hora_inicio IS NULL AND NEW.hora_inicio IS NOT NULL THEN
  UPDATE public.portal_solicitacoes SET status='em_visita',updated_at=now()
   WHERE id=NEW.solicitacao_id AND status NOT IN ('concluida','cancelada');
 END IF;
 -- Não concluir solicitação no encaminhamento; OS/comerciais têm ciclos próprios.
 RETURN NEW;
END $function$;

-- O trigger existente ignorava micro-only. Mantém vínculo singular e status original.
CREATE OR REPLACE FUNCTION public.fn_create_programacao_on_os_onfarm_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
 IF NEW.status::text NOT IN ('aberta','aprovada','programada') THEN RETURN NEW; END IF;
 IF NEW.produto_id IS NULL AND NEW.microrganismo_id IS NULL THEN RETURN NEW; END IF;
 PERFORM platform_private.lab_assert_manufacturable(NEW.produto_id,NEW.microrganismo_id);
 IF EXISTS(SELECT 1 FROM public.programacao_producao WHERE ordem_servico_onfarm_id=NEW.id) THEN RETURN NEW; END IF;
 INSERT INTO public.programacao_producao(produto_id,microrganismo_id,volume_necessario,data_programada,status,ordem_servico_onfarm_id)
 VALUES(NEW.produto_id,NEW.microrganismo_id,NEW.volume_total_ml,coalesce(NEW.data_recomendada,CURRENT_DATE),'aguardando',NEW.id);
 RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.rpc_converter_visita_em_os(p_registro_id uuid, p_observacao text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_registro RECORD;
  v_rec RECORD;
  v_rec_count int;
  v_rec_ids uuid[];
  v_remaining int;
  v_existing_os RECORD;
  v_new_os_id uuid;
  v_new_numero text;
  v_status_anterior text;
  v_solic_id uuid;
  v_is_consultor_resp boolean;
  v_has_admin boolean;
  v_has_gestor boolean;
  v_has_consultor boolean;
  v_has_tecnico boolean;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Não autenticado');
  END IF;

  -- H9-D-L4: gate de capacidade ANTES de qualquer leitura do registro.
  -- Fecha o oráculo de existência (não-encontrado vs sem-permissão) para
  -- identidades sem papel de domínio de visita técnica.
  IF NOT (
    public.has_role(v_user_id, 'administrador'::app_role)
    OR public.has_role(v_user_id, 'gestor'::app_role)
    OR public.has_role(v_user_id, 'consultor_tecnico'::app_role)
    OR public.has_role(v_user_id, 'tecnico_agronomo'::app_role)
  ) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Sem permissão para converter esta visita.');
  END IF;

  -- Scope before lookup, status or replay; global role alone is not tenant access.
  IF NOT COALESCE(public.can_view_technical_visit(v_user_id, p_registro_id), false) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Sem permissão para converter esta visita.');
  END IF;

  -- H9-D-L4-R2: resolução ESCOPADA ao chamador em UMA única consulta.
  -- Inexistente e alheio produzem a MESMA resposta genérica, sem revelar existência.
  v_has_admin    := public.has_role(v_user_id, 'administrador'::app_role);
  v_has_gestor   := public.has_role(v_user_id, 'gestor'::app_role);
  v_has_consultor:= public.has_role(v_user_id, 'consultor_tecnico'::app_role);
  v_has_tecnico  := public.has_role(v_user_id, 'tecnico_agronomo'::app_role);

  SELECT * INTO v_registro
    FROM public.registros_consultor rc
   WHERE rc.id = p_registro_id
     AND (
       v_has_admin
       OR v_has_gestor
       OR ((v_has_consultor OR v_has_tecnico) AND rc.consultor_responsavel = v_user_id)
     ) FOR UPDATE;

  IF v_registro IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Sem permissão para converter esta visita.');
  END IF;
  -- Revalida após aguardar o lock: alteração concorrente de escopo não autoriza replay.
  IF NOT COALESCE(public.can_view_technical_visit(v_user_id, p_registro_id), false) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Sem permissão para converter esta visita.');
  END IF;

  v_is_consultor_resp := (v_registro.consultor_responsavel = v_user_id);

  -- OS já existente → retorno idempotente
  SELECT id, numero_os INTO v_existing_os
    FROM public.ordens_servico_onfarm
   WHERE registro_consultor_id = p_registro_id
   LIMIT 1;

  IF v_existing_os.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_exists', true,
      'os_id', v_existing_os.id,
      'numero_os', v_existing_os.numero_os,
      'registro_id', p_registro_id,
      'message', 'OS já existente para esta visita.'
    );
  END IF;

  -- Validações de status
  IF v_registro.status::text = 'arquivado' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Visita arquivada não pode gerar OS.');
  END IF;
  IF v_registro.status::text = 'convertido_os' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Visita já foi convertida em OS.');
  END IF;
  IF v_registro.status::text <> 'aprovado' THEN
    RETURN jsonb_build_object('success', false,
      'message', 'Apenas visitas com recomendação aprovada podem ser convertidas em OS.');
  END IF;

  -- Campos obrigatórios
  IF v_registro.cliente_id IS NULL
     OR v_registro.fazenda_id IS NULL
     OR v_registro.talhao_id  IS NULL THEN
    RETURN jsonb_build_object('success', false,
      'message', 'Visita sem cliente, fazenda ou talhão definidos.');
  END IF;

  -- A intenção explícita é a única seleção; created_at não autoriza nem escolhe.
  -- Lock do pai já adquirido: writers canônicos e trigger abaixo serializam no mesmo pai.
  SELECT array_agg(id ORDER BY id) INTO v_rec_ids
    FROM public.registros_consultor_recomendacoes
   WHERE registro_consultor_id = p_registro_id AND encaminhar_para_os IS TRUE;
  v_rec_count := coalesce(cardinality(v_rec_ids), 0);
  IF v_rec_count = 0 THEN
    RETURN jsonb_build_object('success', false, 'code', 'LAB_VISIT_NO_SELECTION',
      'message', 'Revise a visita e marque uma recomendação biológica ou um microrganismo para encaminhar à OS.');
  END IF;
  IF v_rec_count <> 1 THEN
    RETURN jsonb_build_object('success', false, 'code', 'LAB_VISIT_MULTIPLE_SELECTIONS',
      'message', 'Há mais de uma recomendação encaminhada. Revise os encaminhamentos e mantenha apenas uma para esta visita.');
  END IF;
  SELECT * INTO v_rec FROM public.registros_consultor_recomendacoes
   WHERE id = v_rec_ids[1] AND registro_consultor_id = p_registro_id FOR UPDATE;
  -- Catálogo próprio continua contido; sem inferência de ownership/família do histórico.
  IF v_rec.produto_biologico_sugerido_id IS NOT NULL THEN
    PERFORM 1 FROM public.produtos p WHERE p.id=v_rec.produto_biologico_sugerido_id
      AND p.ativo IS TRUE AND (to_jsonb(p)->>'owner_organization_id') IS NULL FOR SHARE;
  ELSE
    PERFORM 1 FROM public.microrganismos m WHERE m.id=v_rec.microrganismo_id
      AND m.ativo IS TRUE AND (to_jsonb(m)->>'owner_organization_id') IS NULL FOR SHARE;
  END IF;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'LAB_VISIT_SELECTION_CONFLICT',
      'message', 'O item encaminhado não está disponível para produção. Revise a recomendação, sem alterar o histórico automaticamente.');
  END IF;
  -- Revalida família sob lock do catálogo, não antes dele.
  IF NOT platform_private.lab_item_is_manufacturable(v_rec.produto_biologico_sugerido_id, v_rec.microrganismo_id) THEN
    RETURN jsonb_build_object('success', false, 'code', 'LAB_VISIT_SELECTION_CONFLICT',
      'message', 'Revise o encaminhamento: selecione somente um produto biológico ou somente um microrganismo. Químicos, adubos e itens sem família não geram produção.');
  END IF;
  IF coalesce(btrim(v_rec.recomendacao_tecnica), '') = ''
     AND coalesce(btrim(v_rec.observacoes_finais), '') = ''
     AND coalesce(btrim(v_rec.estrategia_manejo::text), '') = '' THEN
    RETURN jsonb_build_object('success', false, 'code', 'LAB_VISIT_EMPTY_RECOMMENDATION',
      'message', 'Preencha a recomendação técnica encaminhada antes de gerar a OS.');
  END IF;
  SELECT count(*) INTO v_remaining FROM public.registros_consultor_recomendacoes
    WHERE registro_consultor_id=p_registro_id AND id<>v_rec.id;

  v_status_anterior := v_registro.status::text;
  v_solic_id := v_registro.solicitacao_id;

  -- Inserir OS On-Farm (status inicial: aberta)
  INSERT INTO public.ordens_servico_onfarm (
    cliente_id, fazenda_id, talhao_id, produto_id, microrganismo_id,
    area_hectares, modo_aplicacao,
    prioridade, status,
    registro_consultor_id, solicitacao_id, consultor_responsavel, cultura_id,
    fase_fenologica, problema_principal, diagnostico, recomendacao_tecnica,
    observacoes_adicionais, created_by
  ) VALUES (
    v_registro.cliente_id, v_registro.fazenda_id, v_registro.talhao_id,
    v_rec.produto_biologico_sugerido_id, v_rec.microrganismo_id,
    v_registro.area_hectares,
    v_rec.modo_aplicacao,
    'media', 'aberta',
    p_registro_id, v_solic_id, v_registro.consultor_responsavel, v_registro.cultura_id,
    v_registro.fase_fenologica, v_registro.problema_principal, NULL,
    coalesce(v_rec.recomendacao_tecnica, v_rec.observacoes_finais, v_rec.estrategia_manejo::text),
    p_observacao, v_user_id
  )
  RETURNING id, numero_os INTO v_new_os_id, v_new_numero;

  -- convertido_os representa encaminhamento singular, NÃO conclusão das linhas comerciais.
  UPDATE public.registros_consultor
     SET status = 'convertido_os', updated_at = now()
   WHERE id = p_registro_id;

  -- Atualizar solicitação
  IF v_solic_id IS NOT NULL THEN
    UPDATE public.portal_solicitacoes
       SET status = 'aguardando_os', updated_at = now()
     WHERE id = v_solic_id AND status NOT IN ('concluida','cancelada');

    INSERT INTO public.solicitacoes_timeline
      (solicitacao_id, tipo_evento, descricao, usuario_id)
    VALUES
      (v_solic_id, 'convertida_os',
       'Uma recomendação encaminhada à OS On-Farm ' || coalesce(v_new_numero, v_new_os_id::text),
       v_user_id);
  END IF;

  -- Logs
  INSERT INTO public.registros_consultor_status_log
    (registro_consultor_id, status_anterior, status_novo, motivo, changed_by, changed_at)
  VALUES
    (p_registro_id, v_status_anterior, 'convertido_os',
     'Encaminhamento da recomendação ' || v_rec.id::text || ' à OS; demais recomendações preservadas', v_user_id, now());

  INSERT INTO public.visitas_logs
    (registro_consultor_id, solicitacao_id, acao, descricao, usuario_id, metadata)
  VALUES
    (p_registro_id, v_solic_id, 'os_gerada',
     'Visita convertida em OS On-Farm ' || coalesce(v_new_numero, v_new_os_id::text),
     v_user_id,
     jsonb_build_object('os_id', v_new_os_id, 'numero_os', v_new_numero,
       'recomendacao_id', v_rec.id, 'recomendacao_versao', v_rec.versao,
       'selection_snapshot', to_jsonb(v_rec), 'remaining_recommendations', v_remaining,
       'selection_rule', 'explicit_single_manufacturable', 'commercial_completed', false));

  RETURN jsonb_build_object(
    'success', true,
    'already_exists', false,
    'message', 'OS On-Farm gerada com sucesso.',
    'os_id', v_new_os_id,
    'numero_os', v_new_numero,
    'registro_id', p_registro_id,
    'solicitacao_id', v_solic_id,
    'status_anterior', v_status_anterior,
    'status_novo', 'convertido_os', 'recomendacao_id', v_rec.id,
    'remaining_recommendations', v_remaining, 'commercial_completed', false
  );
EXCEPTION WHEN OTHERS THEN
  -- O sub-bloco PL/pgSQL desfaz todas as escritas antes de retornar falha.
  -- Nunca interpretar conflito em OUTRA constraint como replay bem-sucedido com OS nula.
  RETURN jsonb_build_object('success', false, 'code', 'LAB_VISIT_CONVERSION_FAILED',
    'message', 'Não foi possível encaminhar a recomendação. Nenhuma alteração foi mantida; revise a visita e tente novamente.');
END;
$function$;

-- CREATE OR REPLACE preserva ACL. Rollback operacional: não restaurar corpos vulneráveis.
COMMIT;
