CREATE OR REPLACE FUNCTION public.rpc_gerar_etiqueta_produto(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_lote_id uuid := NULLIF(p_payload->>'lote_id','')::uuid;
  v_produto_id uuid := NULLIF(p_payload->>'produto_id','')::uuid;
  v_envase_id uuid := NULLIF(p_payload->>'envase_id','')::uuid;
  v_envase_item_id uuid := NULLIF(p_payload->>'envase_item_id','')::uuid;
  v_estoque_item_id uuid := NULLIF(p_payload->>'estoque_item_id','')::uuid;
  v_embalagem_id uuid := NULLIF(p_payload->>'embalagem_id','')::uuid;
  v_entrega_id uuid := NULLIF(p_payload->>'entrega_id','')::uuid;
  v_entrega_item_id uuid := NULLIF(p_payload->>'entrega_item_id','')::uuid;
  v_cliente_id uuid := NULLIF(p_payload->>'cliente_id','')::uuid;
  v_fazenda_id uuid := NULLIF(p_payload->>'fazenda_id','')::uuid;
  v_tipo text := COALESCE(NULLIF(p_payload->>'tipo_etiqueta',''), 'principal');
  v_volume numeric := NULLIF(p_payload->>'volume','')::numeric;
  v_unidade text := NULLIF(p_payload->>'unidade','');
  v_qtd_emb integer := NULLIF(p_payload->>'quantidade_embalagens','')::integer;
  v_conservacao text := NULLIF(p_payload->>'conservacao','');
  v_uso text := NULLIF(p_payload->>'uso_recomendado','');
  v_obs text := NULLIF(p_payload->>'observacoes','');
  v_substitui uuid := NULLIF(p_payload->>'substitui_etiqueta_id','')::uuid;
  v_template_codigo text := NULLIF(p_payload->>'template_codigo','');
  v_comercial boolean;
  v_produto_nome text;
  v_produto_tipo text;
  v_lote_codigo text;
  v_lote_status text;
  v_cq_liberado boolean;
  v_cepas text[];
  v_fabricado_em date;
  v_validade_em date;
  v_validade_origem text;
  v_perfil public.produto_conformidade_perfis;
  v_tpl public.etiqueta_templates;
  v_seq bigint;
  v_codigo text;
  v_trace_token uuid := gen_random_uuid();
  v_trace_hash text;
  v_id uuid := gen_random_uuid();
  v_qr_payload text;
  v_snapshot jsonb;
  v_template text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF NOT (
    public.has_role(v_uid,'administrador'::app_role)
    OR public.has_role(v_uid,'gestor'::app_role)
    OR public.has_role(v_uid,'producao'::app_role)
    OR public.has_role(v_uid,'operador_onfarm'::app_role)
  ) THEN
    RAISE EXCEPTION 'Sem permissão para gerar etiqueta';
  END IF;

  v_comercial := v_tipo NOT IN ('interna','amostra');

  -- embalagem como origem unitária canônica
  IF v_embalagem_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('etiqueta_embalagem:' || v_embalagem_id::text, 0));
    SELECT eb.lote_id, COALESCE(v_produto_id, eb.produto_id), COALESCE(v_envase_id, eb.envase_id),
           COALESCE(v_volume, eb.volume), COALESCE(v_unidade, eb.unidade), eb.validade_em
      INTO v_lote_id, v_produto_id, v_envase_id, v_volume, v_unidade, v_validade_em
    FROM public.estoque_embalagens eb WHERE eb.id = v_embalagem_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'label_package_not_found: embalagem inexistente'; END IF;
    IF v_validade_em IS NOT NULL THEN v_validade_origem := 'embalagem'; END IF;
    v_qtd_emb := COALESCE(v_qtd_emb, 1);
  END IF;

  IF v_envase_id IS NOT NULL AND v_lote_id IS NULL THEN
    SELECT e.lote_id, COALESCE(v_volume, e.volume_por_unidade), COALESCE(v_qtd_emb, e.quantidade)
      INTO v_lote_id, v_volume, v_qtd_emb
    FROM public.envase e WHERE e.id = v_envase_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Envase não encontrado'; END IF;
  ELSIF v_envase_id IS NOT NULL THEN
    SELECT COALESCE(v_volume, e.volume_por_unidade), COALESCE(v_qtd_emb, e.quantidade)
      INTO v_volume, v_qtd_emb
    FROM public.envase e WHERE e.id = v_envase_id;
  END IF;

  IF v_lote_id IS NULL THEN
    RAISE EXCEPTION 'Lote obrigatório';
  END IF;

  SELECT l.codigo_lote, COALESCE(v_produto_id, l.produto_id), l.data_producao, l.status::text
    INTO v_lote_codigo, v_produto_id, v_fabricado_em, v_lote_status
  FROM public.lotes l WHERE l.id = v_lote_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lote não encontrado'; END IF;

  v_cq_liberado := (v_lote_status = 'aprovado');

  IF NOT v_cq_liberado AND v_comercial THEN
    RAISE EXCEPTION 'label_cq_not_approved: etiqueta % bloqueada, lote % com status de qualidade "%"',
      v_tipo, v_lote_codigo, v_lote_status;
  END IF;

  IF v_produto_id IS NOT NULL THEN
    SELECT p.nome, p.tipo::text INTO v_produto_nome, v_produto_tipo
    FROM public.produtos p WHERE p.id = v_produto_id;
  END IF;
  IF v_produto_nome IS NULL THEN v_produto_nome := 'Bioinsumo AR Bio'; END IF;

  -- Perfil de conformidade vigente
  v_perfil := public.fn_conformidade_perfil_vigente(v_produto_id, v_produto_tipo);

  IF v_comercial AND v_perfil.id IS NULL THEN
    RAISE EXCEPTION 'label_compliance_profile_missing: não há perfil de conformidade aprovado vigente para o produto %', v_produto_nome;
  END IF;

  IF v_comercial AND v_perfil.campos_obrigatorios IS NOT NULL THEN
    IF 'responsavel_tecnico' = ANY(v_perfil.campos_obrigatorios)
       AND COALESCE(btrim(v_perfil.responsavel_tecnico_registro),'') = '' THEN
      RAISE EXCEPTION 'label_compliance_field_missing: responsavel_tecnico não validado no perfil de conformidade';
    END IF;
    IF 'registro_mapa' = ANY(v_perfil.campos_obrigatorios)
       AND COALESCE(btrim(v_perfil.registro_mapa),'') = '' THEN
      RAISE EXCEPTION 'label_compliance_field_missing: registro_mapa não validado no perfil de conformidade';
    END IF;
  END IF;

  SELECT array_remove(ARRAY[m.nome], NULL)
    INTO v_cepas
  FROM public.lotes l
  LEFT JOIN public.microrganismos m ON m.id = l.microrganismo_id
  WHERE l.id = v_lote_id;

  -- Resolução de validade: embalagem > estoque > política do perfil. Sem fallback estimado.
  IF v_validade_em IS NULL THEN
    SELECT MIN(ep.validade) INTO v_validade_em
    FROM public.estoque_produto ep WHERE ep.lote_id = v_lote_id;
    IF v_validade_em IS NOT NULL THEN v_validade_origem := 'estoque'; END IF;
  END IF;

  IF v_validade_em IS NULL AND v_perfil.validade_meses IS NOT NULL AND v_fabricado_em IS NOT NULL THEN
    v_validade_em := (v_fabricado_em + make_interval(months => v_perfil.validade_meses))::date;
    v_validade_origem := 'perfil_conformidade';
  END IF;

  IF v_validade_em IS NULL THEN
    IF v_comercial THEN
      RAISE EXCEPTION 'label_expiry_not_validated: validade não validada para o lote % — defina validade em estoque/embalagem ou política de validade no perfil de conformidade aprovado',
        v_lote_codigo;
    END IF;
    v_validade_origem := 'nao_validada';
  END IF;

  IF v_unidade IS NULL AND v_volume IS NOT NULL THEN
    v_unidade := 'ml';
  END IF;

  -- Template configurável
  IF v_template_codigo IS NULL THEN
    v_template_codigo := CASE WHEN v_tipo = 'reduzida' THEN 'etiqueta-produto-reduzida'
                              ELSE 'etiqueta-produto-principal' END;
  END IF;
  SELECT * INTO v_tpl FROM public.etiqueta_templates
   WHERE codigo = v_template_codigo AND ativo
   ORDER BY versao DESC LIMIT 1;
  IF v_tpl.id IS NULL THEN
    RAISE EXCEPTION 'label_template_not_found: template % inexistente ou inativo', v_template_codigo;
  END IF;
  v_template := v_tpl.codigo || '@v' || v_tpl.versao;

  SELECT nextval('public.produto_etiqueta_seq') INTO v_seq;
  v_codigo := 'AR-LB-' || lpad(v_seq::text, 6, '0');

  v_trace_hash := encode(extensions.digest(v_trace_token::text || '|' || v_codigo, 'sha256'), 'hex');
  v_qr_payload := '/rastrear-produto/' || v_trace_token::text;

  v_conservacao := COALESCE(v_conservacao, v_perfil.conservacao_texto);
  v_uso := COALESCE(v_uso, v_perfil.uso_texto);

  IF v_comercial AND (COALESCE(btrim(v_conservacao),'') = '' OR COALESCE(btrim(v_uso),'') = '') THEN
    RAISE EXCEPTION 'label_compliance_field_missing: textos de conservação/uso não validados no perfil de conformidade';
  END IF;

  v_snapshot := jsonb_build_object(
    'template_versao', v_template,
    'template', jsonb_build_object(
      'codigo', v_tpl.codigo, 'versao', v_tpl.versao, 'midia', v_tpl.midia,
      'largura_mm', v_tpl.largura_mm, 'altura_mm', v_tpl.altura_mm,
      'orientacao', v_tpl.orientacao, 'densidade_dpi', v_tpl.densidade_dpi,
      'colunas', v_tpl.colunas, 'linhas', v_tpl.linhas,
      'margens_mm', jsonb_build_object('topo', v_tpl.margem_topo_mm, 'direita', v_tpl.margem_direita_mm,
                                       'base', v_tpl.margem_base_mm, 'esquerda', v_tpl.margem_esquerda_mm)
    ),
    'conformidade', CASE WHEN v_perfil.id IS NULL THEN NULL ELSE jsonb_build_object(
      'perfil_id', v_perfil.id, 'perfil_key', v_perfil.perfil_key, 'versao', v_perfil.versao,
      'aprovado_em', v_perfil.aprovado_em,
      'responsavel_informacao', v_perfil.responsavel_informacao,
      'fonte_documento', v_perfil.fonte_documento,
      'responsavel_tecnico_nome', v_perfil.responsavel_tecnico_nome,
      'responsavel_tecnico_registro', v_perfil.responsavel_tecnico_registro,
      'registro_mapa', v_perfil.registro_mapa,
      'identificadores_regulatorios', v_perfil.identificadores_regulatorios,
      'identificadores_fiscais', v_perfil.identificadores_fiscais,
      'advertencias', to_jsonb(v_perfil.advertencias),
      'transporte_texto', v_perfil.transporte_texto,
      'politica_validade', v_perfil.politica_validade
    ) END,
    'origem_dados', jsonb_build_object(
      'validade', v_validade_origem,
      'conservacao', CASE WHEN NULLIF(p_payload->>'conservacao','') IS NOT NULL THEN 'payload' ELSE 'perfil_conformidade' END,
      'uso_recomendado', CASE WHEN NULLIF(p_payload->>'uso_recomendado','') IS NOT NULL THEN 'payload' ELSE 'perfil_conformidade' END,
      'produto', 'cadastro_produtos',
      'lote', 'lotes',
      'embalagem', CASE WHEN v_embalagem_id IS NOT NULL THEN 'estoque_embalagens' ELSE NULL END
    ),
    'codigo_etiqueta', v_codigo,
    'tipo_etiqueta', v_tipo,
    'produto_nome', v_produto_nome,
    'lote_codigo', v_lote_codigo,
    'cepas', to_jsonb(COALESCE(v_cepas, ARRAY[]::text[])),
    'volume', v_volume,
    'unidade', v_unidade,
    'quantidade_embalagens', v_qtd_emb,
    'fabricado_em', v_fabricado_em,
    'validade_em', v_validade_em,
    'validade_origem', v_validade_origem,
    'conservacao', v_conservacao,
    'uso_recomendado', v_uso,
    'observacoes', v_obs,
    'cq_liberado', v_cq_liberado,
    'lote_status_na_emissao', v_lote_status,
    'emitida_em', now(),
    'emitida_por', v_uid
  );

  INSERT INTO public.produto_etiquetas (
    id, codigo_etiqueta, tipo_etiqueta, status,
    lote_id, produto_id, envase_id, envase_item_id, estoque_item_id, embalagem_id,
    entrega_id, entrega_item_id, cliente_id, fazenda_id,
    produto_nome, lote_codigo, volume, unidade, quantidade_embalagens, cepas,
    fabricado_em, validade_em, conservacao, uso_recomendado, observacoes,
    trace_token, trace_hash, qr_code_payload, qr_code_generated_at,
    gerada_por, gerada_em,
    snapshot, template_versao, cq_liberado, lote_status_na_emissao, substitui_etiqueta_id
  ) VALUES (
    v_id, v_codigo, v_tipo, 'gerada',
    v_lote_id, v_produto_id, v_envase_id, v_envase_item_id, v_estoque_item_id, v_embalagem_id,
    v_entrega_id, v_entrega_item_id, v_cliente_id, v_fazenda_id,
    v_produto_nome, v_lote_codigo, v_volume, v_unidade, v_qtd_emb, v_cepas,
    v_fabricado_em, v_validade_em, v_conservacao, v_uso, v_obs,
    v_trace_token, v_trace_hash, v_qr_payload, now(),
    v_uid, now(),
    v_snapshot, v_template, v_cq_liberado, v_lote_status, v_substitui
  );

  IF v_substitui IS NOT NULL THEN
    UPDATE public.produto_etiquetas SET substituida_por_id = v_id WHERE id = v_substitui;
  END IF;

  IF v_embalagem_id IS NOT NULL THEN
    UPDATE public.estoque_embalagens SET etiqueta_id = v_id, updated_at = now()
     WHERE id = v_embalagem_id;
  END IF;

  IF v_envase_id IS NOT NULL THEN
    UPDATE public.envase
       SET etiqueta_gerada = true,
           etiqueta_id = v_id,
           etiqueta_gerada_em = now(),
           etiqueta_gerada_por = v_uid
     WHERE id = v_envase_id;
  END IF;

  IF v_entrega_id IS NOT NULL THEN
    INSERT INTO public.entrega_etiquetas (entrega_id, etiqueta_id, created_by)
      VALUES (v_entrega_id, v_id, v_uid)
      ON CONFLICT DO NOTHING;
  END IF;

  INSERT INTO public.produto_etiqueta_eventos(etiqueta_id, evento, descricao, user_id, metadata)
    VALUES (v_id, 'etiqueta_gerada', 'Etiqueta gerada', v_uid,
            jsonb_build_object('tipo', v_tipo, 'codigo', v_codigo, 'cq_liberado', v_cq_liberado,
                               'template', v_template, 'validade_origem', v_validade_origem));

  INSERT INTO public.financial_audit_log(entity_type, entity_id, action, new_data, performed_by, reason)
    VALUES ('produto_etiqueta', v_id, 'LABEL_GENERATED',
            jsonb_build_object('codigo', v_codigo, 'tipo', v_tipo, 'lote_id', v_lote_id,
                               'envase_id', v_envase_id, 'embalagem_id', v_embalagem_id,
                               'cq_liberado', v_cq_liberado, 'template', v_template),
            v_uid, 'Geração de etiqueta de produto');

  RETURN jsonb_build_object(
    'success', true,
    'etiqueta_id', v_id,
    'codigo_etiqueta', v_codigo,
    'trace_token', v_trace_token,
    'trace_url', v_qr_payload,
    'qr_code_payload', v_qr_payload,
    'cq_liberado', v_cq_liberado,
    'validade_origem', v_validade_origem,
    'template_versao', v_template
  );
END;
$function$
