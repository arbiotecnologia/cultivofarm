-- =============================================================================
-- 20260905000000_hardening_digest_schema_v1.sql
-- Correcao: "function digest(text, unknown) does not exist"
-- Causa: rotinas SECURITY DEFINER com SET search_path = public chamavam digest()
--        sem qualificar o schema; pgcrypto vive em "extensions".
-- Escopo: recriacao das definicoes VIGENTES, corpo identico, trocando apenas
--         digest(...) por extensions.digest(...). Sem mudanca de algoritmo,
--         de hash gravado, de assinatura, de grants ou de RLS.
-- Alvo: staging ikaauvsflpmamgxmkhoq
-- =============================================================================

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
    WHERE e.extname = 'pgcrypto'
  ) THEN
    RAISE EXCEPTION 'pgcrypto ausente: instale a extensao antes deste hardening';
  END IF;
END
$guard$;

-- fn_assign_receipt_metadata() (1 ocorrencia(s) de digest qualificadas)
CREATE OR REPLACE FUNCTION public.fn_assign_receipt_metadata()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_year int;
  v_seq int;
  v_code text;
BEGIN
  v_year := EXTRACT(YEAR FROM COALESCE(NEW.payment_date, CURRENT_DATE))::int;
  -- lock the table portion for this year and compute next seq
  PERFORM 1 FROM public.financial_receipts WHERE receipt_year = v_year FOR UPDATE;
  SELECT COALESCE(MAX(receipt_seq), 0) + 1 INTO v_seq
    FROM public.financial_receipts WHERE receipt_year = v_year;
  NEW.receipt_year := v_year;
  NEW.receipt_seq := v_seq;
  NEW.receipt_number := 'REC-' || v_year::text || '-' || lpad(v_seq::text, 6, '0');
  IF NEW.authenticity_code IS NULL THEN
    v_code := upper(substr(encode(extensions.digest(NEW.id::text || gen_random_uuid()::text || clock_timestamp()::text, 'sha256'), 'hex'), 1, 12));
    NEW.authenticity_code := substr(v_code,1,4) || '-' || substr(v_code,5,4) || '-' || substr(v_code,9,4);
  END IF;
  IF NEW.public_verification_token IS NULL THEN
    NEW.public_verification_token := gen_random_uuid();
  END IF;
  RETURN NEW;
END;
$function$;

-- rpc_cockpit_registrar_envase_v1(uuid,uuid,text,uuid,jsonb,date,text,text,boolean,text) (1 ocorrencia(s) de digest qualificadas)
CREATE OR REPLACE FUNCTION public.rpc_cockpit_registrar_envase_v1(p_lote_id uuid, p_os_id uuid, p_origem text, p_programacao_id uuid, p_linhas jsonb, p_validade date, p_operador text DEFAULT NULL::text, p_idempotency_key text DEFAULT NULL::text, p_permitir_parcial boolean DEFAULT false, p_motivo_parcial text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_origem text;
  v_ctx record;
  v_scope text;
  v_hash text;
  v_row record;
  v_produzido_ml numeric := 0; v_envasado_ml numeric := 0; v_saldo_ml numeric := 0;
  v_total_ml numeric := 0; v_demanda_ml numeric := 0; v_reservado_ml numeric := 0;
  v_pendente_ml numeric := 0;
  v_linha jsonb; v_tipo text; v_qtd integer; v_unit_ml numeric;
  v_reservadas integer; v_livres integer;
  v_envase_id uuid; v_estoque_id uuid;
  v_produto_id uuid; v_micro_id uuid; v_cq_ok boolean; v_lote_status text;
  v_lote_prog uuid;
  v_env_ct int := 0; v_est_ct int := 0; v_res_ml numeric := 0; v_liv_ml numeric := 0;
  v_avanco jsonb; v_result jsonb; v_estado text;
BEGIN
  PERFORM public.fn_estoque_ctx_open(jsonb_build_object('acao','entrada','origem','rpc_cockpit_registrar_envase_v1','usuario_id',auth.uid()::text));
  v_origem := public.fn_cockpit_assert_operador_origem(p_origem);

  IF p_lote_id IS NULL OR p_os_id IS NULL OR p_programacao_id IS NULL THEN
    RAISE EXCEPTION 'COCKPIT_ENVASE_PARAMS_INVALIDOS';
  END IF;
  IF p_validade IS NULL THEN RAISE EXCEPTION 'COCKPIT_ENVASE_VALIDADE_OBRIGATORIA'; END IF;
  IF p_validade <= current_date THEN RAISE EXCEPTION 'COCKPIT_ENVASE_VALIDADE_INVALIDA'; END IF;
  IF p_linhas IS NULL OR jsonb_typeof(p_linhas) <> 'array' OR jsonb_array_length(p_linhas) = 0 THEN
    RAISE EXCEPTION 'COCKPIT_ENVASE_SEM_LINHAS';
  END IF;

  -- idempotência: LOCK primeiro, leitura definitiva depois (claim atômico)
  IF nullif(btrim(coalesce(p_idempotency_key, '')), '') IS NOT NULL THEN
    v_scope := 'registrar_envase_v1:' || v_uid::text || ':' || btrim(p_idempotency_key);
    v_hash  := encode(extensions.digest(jsonb_build_object(
                 'lote', p_lote_id, 'os', p_os_id, 'origem', v_origem,
                 'prog', p_programacao_id, 'linhas', p_linhas,
                 'validade', p_validade, 'parcial', p_permitir_parcial)::text, 'sha256'), 'hex');
    PERFORM pg_advisory_xact_lock(hashtext(v_scope));

    SELECT * INTO v_row FROM public.cockpit_operacao_idempotencia
     WHERE idempotency_key = v_scope FOR UPDATE;

    IF v_row.idempotency_key IS NOT NULL THEN
      IF coalesce(v_row.payload_hash, '') <> v_hash THEN
        RAISE EXCEPTION 'COCKPIT_IDEMPOTENCY_CONFLICT';
      END IF;
      IF v_row.resultado IS NOT NULL THEN
        RETURN v_row.resultado || jsonb_build_object('replay', true);
      END IF;
      RAISE EXCEPTION 'COCKPIT_IDEMPOTENCY_IN_PROGRESS';
    END IF;

    INSERT INTO public.cockpit_operacao_idempotencia
      (idempotency_key, operacao, usuario_id, payload_hash, alvo_id, status)
    VALUES (v_scope, 'registrar_envase_v1', v_uid, v_hash, p_lote_id, 'in_progress');
  END IF;

  -- contexto canônico e coerência de vínculos
  SELECT * INTO v_ctx FROM public.fn_cockpit_ctx_programacao(p_programacao_id);
  IF v_ctx.os_id <> p_os_id THEN RAISE EXCEPTION 'COCKPIT_RELATION_MISMATCH_PROGRAMACAO_OS'; END IF;
  IF v_ctx.origem <> v_origem THEN RAISE EXCEPTION 'COCKPIT_RELATION_MISMATCH_ORIGEM'; END IF;
  IF v_ctx.status_os IN ('cancelada','finalizada') THEN RAISE EXCEPTION 'COCKPIT_OS_ESTADO_TERMINAL'; END IF;
  PERFORM public.fn_cockpit_assert_b2b_liberado(v_ctx.partner_order_id);

  -- lock determinístico: programação e lote
  PERFORM 1 FROM public.programacao_producao WHERE id = p_programacao_id FOR UPDATE;

  SELECT coalesce(volume_produzido, 0), status::text, produto_id, microrganismo_id, programacao_id
    INTO v_produzido_ml, v_lote_status, v_produto_id, v_micro_id, v_lote_prog
    FROM public.lotes WHERE id = p_lote_id FOR UPDATE;

  IF v_lote_status IS NULL THEN RAISE EXCEPTION 'COCKPIT_LOTE_NAO_ENCONTRADO'; END IF;
  IF v_lote_prog IS DISTINCT FROM p_programacao_id THEN
    RAISE EXCEPTION 'COCKPIT_RELATION_MISMATCH_LOTE_PROGRAMACAO';
  END IF;
  IF (v_produto_id IS DISTINCT FROM v_ctx.produto_id)
     AND (v_micro_id IS DISTINCT FROM v_ctx.microrganismo_id) THEN
    RAISE EXCEPTION 'COCKPIT_RELATION_MISMATCH_ITEM';
  END IF;
  IF v_lote_status = 'reprovado' THEN RAISE EXCEPTION 'COCKPIT_LOTE_REPROVADO_BLOQUEIA_ENVASE'; END IF;
  IF v_produzido_ml <= 0 THEN RAISE EXCEPTION 'COCKPIT_LOTE_SEM_VOLUME_PRODUZIDO'; END IF;

  SELECT (resultado::text = 'aprovado') INTO v_cq_ok
    FROM public.controle_qualidade WHERE lote_id = p_lote_id
   ORDER BY created_at DESC, seq DESC LIMIT 1;
  IF coalesce(v_cq_ok, false) IS NOT TRUE THEN RAISE EXCEPTION 'COCKPIT_ENVASE_EXIGE_CQ_APROVADO'; END IF;

  SELECT coalesce(sum(coalesce(volume_por_unidade,0) * coalesce(quantidade,0)), 0)
    INTO v_envasado_ml FROM public.envase WHERE lote_id = p_lote_id;
  v_saldo_ml := v_produzido_ml - v_envasado_ml;

  v_demanda_ml := coalesce(v_ctx.volume_necessario, 0);
  SELECT coalesce(sum(coalesce(volume_total,0)), 0) * 1000 INTO v_reservado_ml
    FROM public.estoque_produto
   WHERE reservado_para_os_id = p_os_id
     AND coalesce(reservado_para_os_tipo, v_origem) = v_origem
     AND status <> 'estornado'::public.status_estoque;
  v_pendente_ml := greatest(0, v_demanda_ml - v_reservado_ml);

  FOR v_linha IN SELECT * FROM jsonb_array_elements(p_linhas) LOOP
    v_tipo := v_linha->>'tipo_embalagem';
    IF (v_linha->>'quantidade') !~ '^[0-9]+$' THEN RAISE EXCEPTION 'COCKPIT_QUANTIDADE_INVALIDA'; END IF;
    v_qtd := (v_linha->>'quantidade')::int;
    v_unit_ml := CASE v_tipo WHEN 'frasco_1L' THEN 1000 WHEN 'bombona_5L' THEN 5000
                             WHEN 'bombona_20L' THEN 20000 ELSE NULL END;
    IF v_unit_ml IS NULL THEN RAISE EXCEPTION 'COCKPIT_EMBALAGEM_INVALIDA'; END IF;
    IF v_qtd <= 0 THEN RAISE EXCEPTION 'COCKPIT_QUANTIDADE_INVALIDA'; END IF;
    v_total_ml := v_total_ml + (v_unit_ml * v_qtd);
  END LOOP;

  IF v_total_ml > v_saldo_ml THEN RAISE EXCEPTION 'COCKPIT_ENVASE_EXCEDE_PRODUZIDO'; END IF;

  FOR v_linha IN SELECT * FROM jsonb_array_elements(p_linhas) LOOP
    v_tipo := v_linha->>'tipo_embalagem';
    v_qtd  := (v_linha->>'quantidade')::int;
    v_unit_ml := CASE v_tipo WHEN 'frasco_1L' THEN 1000 WHEN 'bombona_5L' THEN 5000
                             WHEN 'bombona_20L' THEN 20000 END;

    INSERT INTO public.envase (lote_id, tipo_embalagem, volume_por_unidade, quantidade, data_envase, operador)
    VALUES (p_lote_id, v_tipo::public.tipo_embalagem, v_unit_ml, v_qtd, current_date, nullif(p_operador, ''))
    RETURNING id INTO v_envase_id;
    v_env_ct := v_env_ct + 1;

    v_reservadas := CASE WHEN v_pendente_ml > 0
                         THEN least(v_qtd, floor(v_pendente_ml / v_unit_ml)::int) ELSE 0 END;
    v_livres := v_qtd - v_reservadas;
    v_pendente_ml := v_pendente_ml - (v_reservadas * v_unit_ml);

    IF v_reservadas > 0 THEN
      INSERT INTO public.estoque_produto (
        produto_id, microrganismo_id, lote_id, envase_id, quantidade, volume_total,
        validade, status, reservado_para_os_id, reservado_para_os_tipo,
        reservado_para_cliente_id, reservado_para_partner_order_id,
        quantidade_reservada, reservado_por, reservado_em
      ) VALUES (
        v_produto_id, v_micro_id, p_lote_id, v_envase_id, v_reservadas,
        (v_unit_ml * v_reservadas) / 1000.0, p_validade, 'reservado'::public.status_estoque,
        p_os_id, v_origem, v_ctx.cliente_id, v_ctx.partner_order_id,
        v_reservadas, v_uid, now()
      ) RETURNING id INTO v_estoque_id;
      v_est_ct := v_est_ct + 1;
      v_res_ml := v_res_ml + (v_unit_ml * v_reservadas);

      INSERT INTO public.estoque_movimentacoes
        (estoque_produto_id, acao, quantidade, status_anterior, status_novo, os_id, os_tipo, usuario_id, lote_id, observacao)
      VALUES (v_estoque_id, 'entrada', v_reservadas, NULL, 'reservado',
              p_os_id, v_origem, v_uid, p_lote_id, 'Entrada de envase reservada para a OS');
    END IF;

    IF v_livres > 0 THEN
      INSERT INTO public.estoque_produto (
        produto_id, microrganismo_id, lote_id, envase_id, quantidade, volume_total, validade, status
      ) VALUES (
        v_produto_id, v_micro_id, p_lote_id, v_envase_id, v_livres,
        (v_unit_ml * v_livres) / 1000.0, p_validade, 'disponivel'::public.status_estoque
      ) RETURNING id INTO v_estoque_id;
      v_est_ct := v_est_ct + 1;
      v_liv_ml := v_liv_ml + (v_unit_ml * v_livres);

      INSERT INTO public.estoque_movimentacoes
        (estoque_produto_id, acao, quantidade, status_anterior, status_novo, os_id, os_tipo, usuario_id, lote_id, observacao)
      VALUES (v_estoque_id, 'entrada', v_livres, NULL, 'disponivel',
              p_os_id, v_origem, v_uid, p_lote_id, 'Excedente de envase para estoque livre');
    END IF;
  END LOOP;

  -- regra canônica de encerramento
  IF v_pendente_ml <= 0 THEN
    v_estado := 'completed';
  ELSIF p_permitir_parcial THEN
    IF NOT public.fn_cockpit_is_gestor() THEN RAISE EXCEPTION 'COCKPIT_ENVASE_PARCIAL_SEM_ALCADA'; END IF;
    IF nullif(btrim(coalesce(p_motivo_parcial, '')), '') IS NULL THEN
      RAISE EXCEPTION 'COCKPIT_ENVASE_PARCIAL_SEM_MOTIVO';
    END IF;
    v_estado := 'completed_override';
  ELSE
    v_estado := 'partial';
  END IF;

  INSERT INTO public.laboratorio_esteira_eventos
    (os_id, origem_os, programacao_id, lote_id, etapa_anterior, etapa_nova, acao, usuario_id, observacao)
  VALUES (p_os_id, v_origem, p_programacao_id, p_lote_id, 'em_envase',
          CASE WHEN v_estado = 'partial' THEN 'em_envase' ELSE 'estoque_gerado' END,
          'registrar_envase_v1', v_uid,
          format('Envase transacional [%s]: %s registros, %s entradas, reservado %s ml, livre %s ml, pendente %s ml. %s',
                 v_estado, v_env_ct, v_est_ct, v_res_ml, v_liv_ml, v_pendente_ml,
                 coalesce('Motivo: ' || nullif(btrim(coalesce(p_motivo_parcial, '')), ''), '')));

  IF v_estado <> 'partial' THEN
    v_avanco := public._rpc_avancar_esteira_laboratorio_internal(p_os_id, v_origem, 'concluir_envase', p_programacao_id);
  ELSE
    v_avanco := jsonb_build_object('success', false, 'motivo', 'COCKPIT_ENVASE_PARCIAL_NAO_AVANCA');
  END IF;

  v_result := jsonb_build_object(
    'success', true, 'replay', false, 'estado', v_estado,
    'envases', v_env_ct, 'entradas_estoque', v_est_ct,
    'volume_reservado_ml', v_res_ml, 'volume_livre_ml', v_liv_ml,
    'pendente_os_ml', v_pendente_ml, 'saldo_restante_ml', v_saldo_ml - v_total_ml,
    'avanco', v_avanco,
    'message', CASE WHEN v_estado = 'partial'
                    THEN 'Envase registrado — necessidade da OS ainda não coberta.'
                    ELSE 'Envase e estoque registrados em transação única.' END);

  IF v_scope IS NOT NULL THEN
    UPDATE public.cockpit_operacao_idempotencia
       SET resultado = v_result, status = 'done', updated_at = now()
     WHERE idempotency_key = v_scope;
  END IF;

  RETURN v_result;
END;
$function$;

-- rpc_coletar_assinatura_digital_entrega(uuid,jsonb) (1 ocorrencia(s) de digest qualificadas)
CREATE OR REPLACE FUNCTION public.rpc_coletar_assinatura_digital_entrega(p_entrega_id uuid, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_entrega public.entregas%ROWTYPE;
  v_comp_id uuid;
  v_rec_nome text := nullif(trim(coalesce(p_payload->>'recebedor_nome','')), '');
  v_hash text := nullif(p_payload->>'assinatura_hash','');
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Sessão inválida'; END IF;
  IF NOT public.is_delivery_staff(v_uid) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  SELECT * INTO v_entrega FROM public.entregas WHERE id = p_entrega_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Entrega não encontrada'; END IF;
  IF v_entrega.status = 'cancelada' THEN RAISE EXCEPTION 'Entrega cancelada'; END IF;
  IF v_rec_nome IS NULL THEN RAISE EXCEPTION 'recebedor_nome é obrigatório'; END IF;
  IF v_hash IS NULL THEN RAISE EXCEPTION 'assinatura_hash é obrigatório'; END IF;

  v_comp_id := v_entrega.comprovante_id;
  IF v_comp_id IS NULL THEN
    PERFORM public.rpc_gerar_formulario_entrega(p_entrega_id);
    SELECT comprovante_id INTO v_comp_id FROM public.entregas WHERE id = p_entrega_id;
  END IF;

  UPDATE public.entrega_comprovantes SET
    status = 'assinatura_digital_coletada',
    assinatura_coletada = true,
    assinatura_tipo = 'digital_tela',
    assinatura_digital_png_path = nullif(p_payload->>'assinatura_digital_png_path',''),
    assinatura_digital_svg = nullif(p_payload->>'assinatura_digital_svg',''),
    assinatura_hash = v_hash,
    assinatura_ip = nullif(p_payload->>'assinatura_ip',''),
    assinatura_user_agent = nullif(p_payload->>'assinatura_user_agent',''),
    assinatura_capturada_em = now(),
    recebedor_nome = v_rec_nome,
    recebedor_documento = nullif(p_payload->>'recebedor_documento',''),
    recebedor_cargo = nullif(p_payload->>'recebedor_cargo',''),
    recebedor_telefone = nullif(p_payload->>'recebedor_telefone',''),
    data_assinatura = now(),
    validation_hash = encode(extensions.digest(p_entrega_id::text || v_hash || now()::text, 'sha256'), 'hex'),
    updated_at = now()
  WHERE id = v_comp_id;

  UPDATE public.entregas SET
    comprovante_status = 'assinatura_digital_coletada',
    assinatura_tipo = 'digital_tela',
    recebedor_nome = v_rec_nome,
    recebedor_documento = coalesce(nullif(p_payload->>'recebedor_documento',''), recebedor_documento),
    recebedor_cargo = coalesce(nullif(p_payload->>'recebedor_cargo',''), recebedor_cargo),
    recebedor_telefone = coalesce(nullif(p_payload->>'recebedor_telefone',''), recebedor_telefone),
    assinatura_digital_capturada_em = now(),
    assinatura_digital_capturada_por = v_uid,
    updated_at = now()
  WHERE id = p_entrega_id;

  INSERT INTO public.financial_audit_log (entity_type, entity_id, action, new_data, performed_by)
  VALUES ('entrega', p_entrega_id, 'DELIVERY_DIGITAL_SIGNATURE_CAPTURED',
          jsonb_build_object('comprovante_id', v_comp_id, 'hash', v_hash), v_uid);

  RETURN jsonb_build_object('success', true, 'comprovante_id', v_comp_id);
END $function$;

-- rpc_confirmar_recebimento_entrega(uuid,jsonb) (1 ocorrencia(s) de digest qualificadas)
CREATE OR REPLACE FUNCTION public.rpc_confirmar_recebimento_entrega(p_entrega_id uuid, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_entrega public.entregas%ROWTYPE;
  v_comp public.entrega_comprovantes%ROWTYPE;
  v_ressalvas text := nullif(trim(coalesce(p_payload->>'ressalvas','')), '');
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Sessão inválida'; END IF;
  IF NOT public.is_delivery_staff(v_uid) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  SELECT * INTO v_entrega FROM public.entregas WHERE id = p_entrega_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Entrega não encontrada'; END IF;
  IF v_entrega.status = 'cancelada' THEN RAISE EXCEPTION 'Entrega cancelada'; END IF;
  IF v_entrega.assinatura_obrigatoria
     AND nullif(trim(coalesce(v_entrega.recebedor_nome,'')),'') IS NULL THEN
    RAISE EXCEPTION 'recebedor_nome é obrigatório';
  END IF;
  IF v_entrega.comprovante_id IS NULL THEN
    RAISE EXCEPTION 'Não há comprovante para confirmar';
  END IF;
  SELECT * INTO v_comp FROM public.entrega_comprovantes WHERE id = v_entrega.comprovante_id;
  IF v_comp.status NOT IN ('anexado','assinatura_digital_coletada','assinado','impresso','gerado') THEN
    RAISE EXCEPTION 'Status de comprovante não permite confirmação (%).', v_comp.status;
  END IF;
  IF v_entrega.assinatura_obrigatoria
     AND v_comp.status NOT IN ('anexado','assinatura_digital_coletada','assinado') THEN
    RAISE EXCEPTION 'Comprovante sem assinatura. Anexe ou colete a assinatura digital.';
  END IF;

  UPDATE public.entrega_comprovantes SET
    status = 'confirmado',
    confirmado_por = v_uid,
    confirmado_em = now(),
    ressalvas = coalesce(v_ressalvas, ressalvas),
    possui_ressalvas = (v_ressalvas IS NOT NULL) OR possui_ressalvas,
    validation_hash = encode(extensions.digest(p_entrega_id::text || coalesce(validation_hash,'') || 'CONF' || now()::text, 'sha256'),'hex'),
    updated_at = now()
  WHERE id = v_comp.id;

  UPDATE public.entregas SET
    comprovante_status = 'confirmado',
    recebimento_confirmado_em = now(),
    recebimento_confirmado_por = v_uid,
    updated_at = now()
  WHERE id = p_entrega_id;

  INSERT INTO public.financial_audit_log (entity_type, entity_id, action, new_data, performed_by, reason)
  VALUES ('entrega', p_entrega_id, 'DELIVERY_RECEIPT_CONFIRMED',
          jsonb_build_object('comprovante_id', v_comp.id, 'ressalvas', v_ressalvas), v_uid, v_ressalvas);

  RETURN jsonb_build_object('success', true);
END $function$;

-- rpc_dispensar_assinatura_entrega(uuid,text) (1 ocorrencia(s) de digest qualificadas)
CREATE OR REPLACE FUNCTION public.rpc_dispensar_assinatura_entrega(p_entrega_id uuid, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_motivo text := nullif(trim(coalesce(p_motivo,'')),'');
  v_comp_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Sessão inválida'; END IF;
  IF NOT (public.has_role(v_uid,'administrador'::app_role)
          OR public.has_role(v_uid,'gestor'::app_role)
          OR public.has_role(v_uid,'administrativo'::app_role)) THEN
    RAISE EXCEPTION 'Apenas admin/gestor/administrativo podem dispensar assinatura';
  END IF;
  IF v_motivo IS NULL OR length(v_motivo) < 5 THEN
    RAISE EXCEPTION 'Motivo é obrigatório (mínimo 5 caracteres)';
  END IF;

  SELECT comprovante_id INTO v_comp_id FROM public.entregas WHERE id = p_entrega_id;
  IF v_comp_id IS NULL THEN
    PERFORM public.rpc_gerar_formulario_entrega(p_entrega_id);
    SELECT comprovante_id INTO v_comp_id FROM public.entregas WHERE id = p_entrega_id;
  END IF;

  UPDATE public.entrega_comprovantes SET
    status = 'confirmado',
    assinatura_tipo = 'dispensada',
    observacoes = coalesce(observacoes,'') || E'\n[DISPENSA] ' || v_motivo,
    validation_hash = encode(extensions.digest(p_entrega_id::text || 'DISP' || now()::text,'sha256'),'hex'),
    confirmado_por = v_uid,
    confirmado_em = now(),
    updated_at = now()
  WHERE id = v_comp_id;

  UPDATE public.entregas SET
    comprovante_status = 'dispensado',
    assinatura_tipo = 'dispensada',
    recebimento_confirmado_em = now(),
    recebimento_confirmado_por = v_uid,
    updated_at = now()
  WHERE id = p_entrega_id;

  INSERT INTO public.entrega_ocorrencias (entrega_id, tipo, descricao, gravidade, registrado_por)
  VALUES (p_entrega_id, 'observacao', 'Assinatura dispensada: ' || v_motivo, 'media', v_uid);

  INSERT INTO public.financial_audit_log (entity_type, entity_id, action, performed_by, reason)
  VALUES ('entrega', p_entrega_id, 'DELIVERY_SIGNATURE_WAIVED', v_uid, v_motivo);

  RETURN jsonb_build_object('success', true);
END $function$;

-- rpc_entrega_assinar_termo_v1(uuid,jsonb,text) (1 ocorrencia(s) de digest qualificadas)
CREATE OR REPLACE FUNCTION public.rpc_entrega_assinar_termo_v1(p_termo_id uuid, p_payload jsonb, p_idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_t public.entrega_termos%ROWTYPE;
  v_fp text;
  v_rec text := nullif(trim(coalesce(p_payload->>'recebedor_nome','')), '');
  v_tipo text := coalesce(nullif(p_payload->>'assinatura_tipo',''), 'digital_tela');
  v_ahash text := nullif(p_payload->>'assinatura_hash','');
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'sessao_invalida'; END IF;
  IF NOT public.is_delivery_staff(v_uid) THEN RAISE EXCEPTION 'sem_permissao'; END IF;
  IF coalesce(trim(p_idempotency_key),'') = '' THEN RAISE EXCEPTION 'idempotency_key_obrigatoria'; END IF;
  IF v_rec IS NULL THEN RAISE EXCEPTION 'recebedor_nome_obrigatorio'; END IF;
  IF v_tipo <> 'dispensada' AND v_ahash IS NULL THEN RAISE EXCEPTION 'assinatura_hash_obrigatoria'; END IF;

  SELECT * INTO v_t FROM public.entrega_termos WHERE id = p_termo_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'termo_nao_encontrado'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('entrega_termo:' || v_t.entrega_id::text, 0));
  SELECT * INTO v_t FROM public.entrega_termos WHERE id = p_termo_id FOR UPDATE;

  v_fp := encode(extensions.digest(
    v_t.snapshot_hash || '|' || v_rec || '|' || coalesce(v_ahash,'') || '|' || v_tipo, 'sha256'), 'hex');

  -- Replay
  IF v_t.status = 'assinado' THEN
    IF v_t.idempotency_key = p_idempotency_key THEN
      IF v_t.request_fingerprint IS DISTINCT FROM v_fp THEN
        RAISE EXCEPTION 'idempotency_payload_mismatch';
      END IF;
      RETURN jsonb_build_object('success', true, 'replay', true, 'termo_id', v_t.id,
                                'versao', v_t.versao, 'snapshot_hash', v_t.snapshot_hash);
    END IF;
    RAISE EXCEPTION 'termo_ja_assinado';
  END IF;

  IF v_t.status <> 'rascunho' THEN RAISE EXCEPTION 'termo_estado_invalido: %', v_t.status; END IF;

  IF EXISTS (SELECT 1 FROM public.entrega_termos
             WHERE entrega_id = v_t.entrega_id AND idempotency_key = p_idempotency_key AND id <> v_t.id) THEN
    RAISE EXCEPTION 'idempotency_key_reutilizada';
  END IF;

  IF v_t.cobertura = 'pendente' AND coalesce((p_payload->>'permitir_pendencia')::boolean, false) IS FALSE THEN
    RAISE EXCEPTION 'cobertura_pendente: conferir todos os itens antes de assinar';
  END IF;

  UPDATE public.entrega_termos SET
    status = 'assinado',
    recebedor_nome = v_rec,
    recebedor_documento = nullif(p_payload->>'recebedor_documento',''),
    recebedor_cargo = nullif(p_payload->>'recebedor_cargo',''),
    recebedor_telefone = nullif(p_payload->>'recebedor_telefone',''),
    assinatura_hash = v_ahash,
    assinatura_tipo = v_tipo,
    assinatura_origem = nullif(p_payload->>'origem',''),
    assinado_em = now(),
    assinado_por = v_uid,
    idempotency_key = p_idempotency_key,
    request_fingerprint = v_fp
  WHERE id = p_termo_id;

  INSERT INTO public.financial_audit_log (entity_type, entity_id, action, new_data, performed_by)
  VALUES ('entrega', v_t.entrega_id, 'DELIVERY_TERM_SIGNED',
          jsonb_build_object('termo_id', p_termo_id, 'versao', v_t.versao,
                             'snapshot_hash', v_t.snapshot_hash, 'cobertura', v_t.cobertura), v_uid);

  RETURN jsonb_build_object('success', true, 'replay', false, 'termo_id', p_termo_id,
                            'versao', v_t.versao, 'snapshot_hash', v_t.snapshot_hash,
                            'cobertura', v_t.cobertura);
END $function$;

-- rpc_entrega_gerar_termo_v1(uuid,text) (1 ocorrencia(s) de digest qualificadas)
CREATE OR REPLACE FUNCTION public.rpc_entrega_gerar_termo_v1(p_entrega_id uuid, p_template_versao text DEFAULT 'termo-entrega-v1'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_snap jsonb;
  v_hash text;
  v_cob text;
  v_id uuid;
  v_versao integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'sessao_invalida'; END IF;
  IF NOT public.is_delivery_staff(v_uid) THEN RAISE EXCEPTION 'sem_permissao'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('entrega_termo:' || p_entrega_id::text, 0));

  IF EXISTS (SELECT 1 FROM public.entrega_termos WHERE entrega_id = p_entrega_id AND status = 'assinado') THEN
    RAISE EXCEPTION 'termo_ja_assinado';
  END IF;

  v_snap := public.fn_entrega_build_snapshot_v1(p_entrega_id);
  v_cob := public.fn_entrega_cobertura_v1(p_entrega_id);
  v_hash := encode(extensions.digest(p_template_versao || '|' || v_snap::text, 'sha256'), 'hex');

  SELECT id INTO v_id FROM public.entrega_termos
   WHERE entrega_id = p_entrega_id AND status = 'rascunho' LIMIT 1;

  IF v_id IS NOT NULL THEN
    UPDATE public.entrega_termos
       SET snapshot = v_snap, snapshot_hash = v_hash, cobertura = v_cob,
           template_versao = p_template_versao, comprovante_id = (SELECT comprovante_id FROM public.entregas WHERE id = p_entrega_id)
     WHERE id = v_id
     RETURNING versao INTO v_versao;
  ELSE
    SELECT coalesce(max(versao), 0) + 1 INTO v_versao
      FROM public.entrega_termos WHERE entrega_id = p_entrega_id;
    INSERT INTO public.entrega_termos
      (entrega_id, comprovante_id, versao, template_versao, status, snapshot, snapshot_hash, cobertura, created_by,
       substitui_termo_id)
    VALUES (p_entrega_id, (SELECT comprovante_id FROM public.entregas WHERE id = p_entrega_id),
            v_versao, p_template_versao, 'rascunho', v_snap, v_hash, v_cob, v_uid,
            (SELECT id FROM public.entrega_termos WHERE entrega_id = p_entrega_id
              AND status IN ('cancelado','substituido') ORDER BY versao DESC LIMIT 1))
    RETURNING id INTO v_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'termo_id', v_id, 'versao', v_versao,
                            'snapshot_hash', v_hash, 'cobertura', v_cob);
END $function$;

-- rpc_entrega_reconciliar_v1(uuid,text) (1 ocorrencia(s) de digest qualificadas)
CREATE OR REPLACE FUNCTION public.rpc_entrega_reconciliar_v1(p_entrega_id uuid, p_idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_e public.entregas%ROWTYPE;
  v_t public.entrega_termos%ROWTYPE;
  v_r public.entrega_reconciliacoes%ROWTYPE;
  v_total int := 0; v_ok int := 0; v_no int := 0; v_pend int := 0;
  v_qtd_ok numeric := 0; v_qtd_no numeric := 0;
  v_vol_ok numeric := 0; v_vol_no numeric := 0;
  v_ratio numeric := 0;
  v_fp text;
  v_item record;
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'sessao_invalida' USING ERRCODE='insufficient_privilege'; END IF;
  IF NOT public.is_delivery_staff(v_uid) THEN
    RAISE EXCEPTION 'sem_permissao' USING ERRCODE='insufficient_privilege';
  END IF;
  IF coalesce(trim(p_idempotency_key),'') = '' THEN RAISE EXCEPTION 'idempotency_key_obrigatoria'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('entrega_reconc:' || p_entrega_id::text, 0));

  SELECT * INTO v_e FROM public.entregas WHERE id = p_entrega_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'entrega_nao_encontrada'; END IF;
  IF v_e.status = 'cancelada' THEN RAISE EXCEPTION 'entrega_cancelada'; END IF;

  SELECT * INTO v_t FROM public.entrega_termos
   WHERE entrega_id = p_entrega_id AND status = 'assinado'
   ORDER BY versao DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'termo_nao_assinado'; END IF;

  SELECT count(*)::int,
         count(*) FILTER (WHERE status='aceito')::int,
         count(*) FILTER (WHERE status='recusado')::int,
         count(*) FILTER (WHERE status='pendente')::int,
         coalesce(sum(quantidade) FILTER (WHERE status='aceito'),0),
         coalesce(sum(quantidade) FILTER (WHERE status='recusado'),0)
    INTO v_total, v_ok, v_no, v_pend, v_qtd_ok, v_qtd_no
    FROM public.entrega_conferencia_itens WHERE entrega_id = p_entrega_id;

  IF v_total = 0 THEN RAISE EXCEPTION 'conferencia_ausente'; END IF;
  IF v_pend > 0 THEN RAISE EXCEPTION 'conferencia_pendente: % item(ns) sem decisao', v_pend; END IF;

  v_fp := encode(extensions.digest(
    v_t.snapshot_hash || '|' || v_total::text || '|' || v_ok::text || '|' || v_no::text
    || '|' || v_qtd_ok::text || '|' || v_qtd_no::text, 'sha256'), 'hex');

  SELECT * INTO v_r FROM public.entrega_reconciliacoes
   WHERE entrega_id = p_entrega_id AND status = 'reconciliada';
  IF FOUND THEN
    IF v_r.idempotency_key IS DISTINCT FROM p_idempotency_key THEN
      RAISE EXCEPTION 'entrega_ja_reconciliada';
    END IF;
    IF v_r.request_fingerprint IS DISTINCT FROM v_fp THEN
      RAISE EXCEPTION 'idempotency_payload_mismatch';
    END IF;
    RETURN jsonb_build_object('success', true, 'replay', true,
      'reconciliacao_id', v_r.id, 'itens_aceitos', v_r.itens_aceitos,
      'itens_recusados', v_r.itens_recusados, 'faturavel', v_r.faturavel,
      'ratio_aceito', v_r.ratio_aceito);
  END IF;

  FOR v_item IN
    SELECT ci.id, ci.status, ci.quantidade, ci.motivo, ci.etiqueta_id, ci.embalagem_id
      FROM public.entrega_conferencia_itens ci
     WHERE ci.entrega_id = p_entrega_id
     ORDER BY ci.id
  LOOP
    IF v_item.status = 'aceito' THEN
      IF v_item.embalagem_id IS NOT NULL THEN
        UPDATE public.estoque_embalagens
           SET status = 'entregue', entregue_em = now(), entregue_por = v_uid,
               entrega_id = p_entrega_id, updated_at = now()
         WHERE id = v_item.embalagem_id
           AND status <> 'entregue';

        INSERT INTO public.estoque_embalagem_movimentacoes
          (embalagem_id, tipo_movimentacao, status_anterior, status_novo, origem, destino,
           entrega_id, user_id, observacao, metadata)
        SELECT v_item.embalagem_id, 'entrega_confirmada', 'separado', 'entregue',
               'entrega', 'cliente', p_entrega_id, v_uid,
               'baixa por conferencia aceita',
               jsonb_build_object('conferencia_item_id', v_item.id, 'termo_id', v_t.id);
      END IF;
      IF v_item.etiqueta_id IS NOT NULL THEN
        UPDATE public.produto_etiquetas
           SET entrega_id = p_entrega_id, updated_at = now()
         WHERE id = v_item.etiqueta_id;
      END IF;
    ELSE
      IF v_item.embalagem_id IS NOT NULL THEN
        UPDATE public.estoque_embalagens
           SET status = 'em_estoque', entrega_id = NULL, entrega_item_id = NULL,
               reservado_em = NULL, reservado_por = NULL,
               separado_em = NULL, separado_por = NULL,
               entregue_em = NULL, entregue_por = NULL,
               updated_at = now()
         WHERE id = v_item.embalagem_id;

        INSERT INTO public.estoque_embalagem_movimentacoes
          (embalagem_id, tipo_movimentacao, status_anterior, status_novo, origem, destino,
           entrega_id, user_id, observacao, metadata)
        VALUES (v_item.embalagem_id, 'estorno_recusa', 'separado', 'em_estoque',
                'entrega', 'estoque', p_entrega_id, v_uid,
                left(coalesce(v_item.motivo,'recusa na conferencia'), 240),
                jsonb_build_object('conferencia_item_id', v_item.id, 'termo_id', v_t.id));
      END IF;
      IF v_item.etiqueta_id IS NOT NULL THEN
        UPDATE public.produto_etiquetas
           SET entrega_id = NULL, updated_at = now()
         WHERE id = v_item.etiqueta_id;
      END IF;
    END IF;
  END LOOP;

  SELECT coalesce(sum(ee.volume * ci.quantidade) FILTER (WHERE ci.status='aceito'), 0),
         coalesce(sum(ee.volume * ci.quantidade) FILTER (WHERE ci.status='recusado'), 0)
    INTO v_vol_ok, v_vol_no
    FROM public.entrega_conferencia_itens ci
    LEFT JOIN public.estoque_embalagens ee ON ee.id = ci.embalagem_id
   WHERE ci.entrega_id = p_entrega_id;

  v_ratio := CASE WHEN (v_qtd_ok + v_qtd_no) > 0
                  THEN round(v_qtd_ok / (v_qtd_ok + v_qtd_no), 5) ELSE 0 END;

  INSERT INTO public.entrega_reconciliacoes (
    entrega_id, termo_id, termo_versao, status,
    itens_total, itens_aceitos, itens_recusados,
    quantidade_aceita, quantidade_recusada, volume_aceito, volume_recusado,
    ratio_aceito, faturavel, resumo, idempotency_key, request_fingerprint, reconciliado_por
  ) VALUES (
    p_entrega_id, v_t.id, v_t.versao, 'reconciliada',
    v_total, v_ok, v_no,
    v_qtd_ok, v_qtd_no, v_vol_ok, v_vol_no,
    v_ratio, (v_ok > 0),
    jsonb_build_object(
      'termo_snapshot_hash', v_t.snapshot_hash,
      'cobertura', v_t.cobertura,
      'itens', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                  'conferencia_item_id', ci.id, 'status', ci.status,
                  'quantidade', ci.quantidade) ORDER BY ci.id), '[]'::jsonb)
                FROM public.entrega_conferencia_itens ci WHERE ci.entrega_id = p_entrega_id)
    ),
    p_idempotency_key, v_fp, v_uid
  ) RETURNING id INTO v_id;

  UPDATE public.entregas SET
    status = CASE WHEN v_ok > 0 THEN 'entregue'::status_entrega ELSE status END,
    recebido_por_nome = coalesce(nullif(trim(recebido_por_nome), ''), v_t.recebedor_nome),
    recebido_por_documento = coalesce(recebido_por_documento, v_t.recebedor_documento),
    confirmado_por = coalesce(confirmado_por, v_uid),
    entregue_em = CASE WHEN v_ok > 0 THEN coalesce(entregue_em, now()) ELSE entregue_em END,
    confirmada_em = coalesce(confirmada_em, now()),
    confirmada_por = coalesce(confirmada_por, v_uid),
    quantidade_entregue = v_qtd_ok,
    volume_entregue_ml = v_vol_ok,
    financial_status = CASE WHEN v_ok > 0 THEN 'PENDING_BILLING' ELSE 'NOT_BILLABLE' END,
    not_billable_reason = CASE WHEN v_ok = 0 THEN 'RECUSA_TOTAL_NA_CONFERENCIA' ELSE not_billable_reason END,
    updated_at = now()
  WHERE id = p_entrega_id;

  INSERT INTO public.financial_audit_log (entity_type, entity_id, action, new_data, performed_by)
  VALUES ('entrega', p_entrega_id, 'DELIVERY_RECONCILED',
          jsonb_build_object('reconciliacao_id', v_id, 'termo_id', v_t.id,
                             'itens_aceitos', v_ok, 'itens_recusados', v_no,
                             'ratio_aceito', v_ratio, 'faturavel', (v_ok > 0)), v_uid);

  RETURN jsonb_build_object('success', true, 'replay', false, 'reconciliacao_id', v_id,
    'itens_total', v_total, 'itens_aceitos', v_ok, 'itens_recusados', v_no,
    'quantidade_aceita', v_qtd_ok, 'quantidade_recusada', v_qtd_no,
    'ratio_aceito', v_ratio, 'faturavel', (v_ok > 0));
END $function$;

-- rpc_gerar_etiqueta_produto(jsonb) (1 ocorrencia(s) de digest qualificadas)
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
$function$;

-- rpc_gerar_formulario_entrega(uuid) (1 ocorrencia(s) de digest qualificadas)
CREATE OR REPLACE FUNCTION public.rpc_gerar_formulario_entrega(p_entrega_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_entrega public.entregas%ROWTYPE;
  v_comp public.entrega_comprovantes%ROWTYPE;
  v_num text;
  v_token uuid := gen_random_uuid();
  v_hash text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Sessão inválida'; END IF;
  IF NOT public.is_delivery_staff(v_uid) THEN
    RAISE EXCEPTION 'Sem permissão para gerar formulário de entrega';
  END IF;
  SELECT * INTO v_entrega FROM public.entregas WHERE id = p_entrega_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Entrega não encontrada'; END IF;
  IF v_entrega.status = 'cancelada' THEN RAISE EXCEPTION 'Entrega cancelada'; END IF;

  -- reuse if exists
  SELECT * INTO v_comp FROM public.entrega_comprovantes
    WHERE entrega_id = p_entrega_id AND tipo = 'formulario_entrega'
    ORDER BY gerado_em DESC LIMIT 1;

  IF v_comp.id IS NOT NULL AND v_comp.status NOT IN ('rejeitado','cancelado') THEN
    RETURN jsonb_build_object(
      'success', true, 'reused', true,
      'entrega_id', p_entrega_id,
      'comprovante_id', v_comp.id,
      'numero_formulario', v_comp.numero_formulario,
      'validation_token', v_comp.validation_token,
      'validation_url', v_comp.validation_url
    );
  END IF;

  v_num := 'AR-ENT-' || lpad(nextval('public.entrega_formulario_seq')::text, 6, '0');
  v_hash := encode(extensions.digest(p_entrega_id::text || v_num || v_token::text || now()::text, 'sha256'), 'hex');

  INSERT INTO public.entrega_comprovantes (
    entrega_id, numero_formulario, tipo, status,
    validation_token, validation_hash, qr_code_payload, gerado_por
  ) VALUES (
    p_entrega_id, v_num, 'formulario_entrega', 'gerado',
    v_token, v_hash, v_token::text, v_uid
  ) RETURNING * INTO v_comp;

  UPDATE public.entregas SET
    comprovante_status = 'formulario_gerado',
    comprovante_id = v_comp.id,
    formulario_gerado_em = now(),
    formulario_gerado_por = v_uid,
    validation_token = v_token,
    validation_hash = v_hash,
    updated_at = now()
  WHERE id = p_entrega_id;

  PERFORM public._entrega_seed_checklist(p_entrega_id);

  INSERT INTO public.financial_audit_log (entity_type, entity_id, action, new_data, performed_by)
  VALUES ('entrega', p_entrega_id, 'DELIVERY_FORM_GENERATED',
          jsonb_build_object('comprovante_id', v_comp.id, 'numero_formulario', v_num), v_uid);

  RETURN jsonb_build_object(
    'success', true,
    'entrega_id', p_entrega_id,
    'comprovante_id', v_comp.id,
    'numero_formulario', v_num,
    'validation_token', v_token,
    'validation_hash', v_hash
  );
END $function$;

-- rpc_get_comprovante_entrega_data(uuid,boolean) (1 ocorrencia(s) de digest qualificadas)
CREATE OR REPLACE FUNCTION public.rpc_get_comprovante_entrega_data(p_entrega_id uuid, p_reemissao boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_uid       uuid := auth.uid();
  e           public.entregas%ROWTYPE;
  v_conteudo  jsonb;
  v_snapshot  jsonb;
  v_comp      public.entrega_comprovantes%ROWTYPE;
  v_doc_tipo  text;
  v_receb     text;
  v_numero    text;
  v_hash      text;
  v_reemissoes int := 0;
  v_congelado boolean := false;
  v_item      jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'COMPROVANTE_UNAUTHENTICATED';
  END IF;
  IF NOT public.is_delivery_staff(v_uid) THEN
    RAISE EXCEPTION 'COMPROVANTE_FORBIDDEN';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('comprovante_entrega:' || p_entrega_id::text));

  SELECT * INTO e FROM public.entregas WHERE id = p_entrega_id FOR UPDATE;
  IF e.id IS NULL THEN
    RAISE EXCEPTION 'COMPROVANTE_ENTREGA_NAO_ENCONTRADA';
  END IF;
  IF e.status = 'cancelada' THEN
    RAISE EXCEPTION 'COMPROVANTE_ENTREGA_CANCELADA';
  END IF;

  v_receb := nullif(btrim(coalesce(e.recebido_por_nome, e.recebedor_nome, '')), '');
  v_doc_tipo := CASE
                  WHEN e.status = 'entregue' AND v_receb IS NOT NULL THEN 'comprovante'
                  ELSE 'romaneio'
                END;

  v_conteudo := public.fn_comprovante_entrega_montar_v1(p_entrega_id);

  -- Documento operacional: sempre montado do estado atual, sem congelar.
  IF v_doc_tipo = 'romaneio' THEN
    RETURN jsonb_build_object(
      'doc_tipo', 'romaneio',
      'titulo', 'Romaneio de Entrega',
      'definitivo', false,
      'numero_documento', 'RM-' || upper(substr(replace(e.id::text, '-', ''), 1, 8)),
      'emitido_em', now(),
      'conteudo', v_conteudo,
      'aviso', 'Documento operacional. Nao comprova o recebimento fisico.'
    );
  END IF;

  -- Comprovante definitivo: cliente + OS + produto + lote + quantidade + volume.
  IF (v_conteudo->'destinatario'->>'cliente_id') IS NULL THEN
    RAISE EXCEPTION 'COMPROVANTE_CLIENTE_OBRIGATORIO';
  END IF;
  IF v_conteudo->'ordem_servico' IS NULL
     OR jsonb_typeof(v_conteudo->'ordem_servico') <> 'object'
     OR (v_conteudo->'ordem_servico'->>'os_id') IS NULL THEN
    RAISE EXCEPTION 'COMPROVANTE_OS_OBRIGATORIA';
  END IF;
  IF jsonb_array_length(v_conteudo->'itens') = 0 THEN
    RAISE EXCEPTION 'COMPROVANTE_SEM_ITENS';
  END IF;
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_conteudo->'itens') LOOP
    IF nullif(btrim(coalesce(v_item->>'produto', '')), '') IS NULL THEN
      RAISE EXCEPTION 'COMPROVANTE_PRODUTO_OBRIGATORIO';
    END IF;
    IF nullif(btrim(coalesce(v_item->>'lote', '')), '') IS NULL THEN
      RAISE EXCEPTION 'COMPROVANTE_LOTE_OBRIGATORIO';
    END IF;
    IF coalesce((v_item->>'quantidade')::numeric, 0) <= 0 THEN
      RAISE EXCEPTION 'COMPROVANTE_QUANTIDADE_OBRIGATORIA';
    END IF;
    IF coalesce((v_item->>'volume_total_ml')::numeric, 0) <= 0 THEN
      RAISE EXCEPTION 'COMPROVANTE_VOLUME_OBRIGATORIO';
    END IF;
  END LOOP;
  IF (v_conteudo->'recebimento'->>'confirmado_em') IS NULL THEN
    RAISE EXCEPTION 'COMPROVANTE_CONFIRMACAO_SEM_DATA';
  END IF;

  SELECT * INTO v_comp
    FROM public.entrega_comprovantes
   WHERE entrega_id = p_entrega_id
     AND metadata ? 'comprovante_snapshot_v1'
   ORDER BY gerado_em DESC
   LIMIT 1;

  IF v_comp.id IS NOT NULL THEN
    v_congelado := true;
    v_snapshot  := v_comp.metadata->'comprovante_snapshot_v1';
    v_numero    := coalesce(v_comp.metadata->>'comprovante_numero', v_comp.numero_formulario);
    v_hash      := v_comp.metadata->>'comprovante_snapshot_hash';
    v_reemissoes := coalesce((v_comp.metadata->>'comprovante_reemissoes')::int, 0);
  ELSE
    SELECT * INTO v_comp
      FROM public.entrega_comprovantes
     WHERE entrega_id = p_entrega_id
     ORDER BY gerado_em DESC
     LIMIT 1;

    v_numero := 'CE-' || to_char(now(), 'YYYY') || '-'
             || lpad(nextval('public.comprovante_entrega_seq')::text, 6, '0');
    v_snapshot := v_conteudo || jsonb_build_object(
      'congelado_em', now(),
      'congelado_por', v_uid,
      'numero_documento', v_numero
    );
    v_hash := encode(extensions.digest(v_snapshot::text, 'sha256'), 'hex');

    IF v_comp.id IS NULL THEN
      INSERT INTO public.entrega_comprovantes (
        entrega_id, numero_formulario, tipo, status,
        validation_token, gerado_por, metadata
      ) VALUES (
        p_entrega_id, v_numero, 'comprovante_entrega', 'confirmado',
        gen_random_uuid(), v_uid,
        jsonb_build_object(
          'comprovante_snapshot_v1', v_snapshot,
          'comprovante_snapshot_hash', v_hash,
          'comprovante_numero', v_numero,
          'comprovante_reemissoes', 0
        )
      ) RETURNING * INTO v_comp;
    ELSE
      UPDATE public.entrega_comprovantes
         SET metadata = metadata || jsonb_build_object(
               'comprovante_snapshot_v1', v_snapshot,
               'comprovante_snapshot_hash', v_hash,
               'comprovante_numero', v_numero,
               'comprovante_reemissoes', 0
             ),
             updated_at = now()
       WHERE id = v_comp.id
       RETURNING * INTO v_comp;
    END IF;

    INSERT INTO public.financial_audit_log (entity_type, entity_id, action, new_data, performed_by)
    VALUES ('entrega', p_entrega_id, 'DELIVERY_RECEIPT_SNAPSHOT_FROZEN',
            jsonb_build_object('comprovante_id', v_comp.id, 'numero', v_numero, 'hash', v_hash), v_uid);
  END IF;

  IF p_reemissao AND v_congelado THEN
    v_reemissoes := v_reemissoes + 1;
    UPDATE public.entrega_comprovantes
       SET metadata = metadata || jsonb_build_object(
             'comprovante_reemissoes', v_reemissoes,
             'comprovante_ultima_reemissao_em', now(),
             'comprovante_ultima_reemissao_por', v_uid),
           updated_at = now()
     WHERE id = v_comp.id;

    INSERT INTO public.financial_audit_log (entity_type, entity_id, action, new_data, performed_by)
    VALUES ('entrega', p_entrega_id, 'DELIVERY_RECEIPT_REISSUED',
            jsonb_build_object('comprovante_id', v_comp.id, 'reemissao', v_reemissoes), v_uid);
  END IF;

  RETURN jsonb_build_object(
    'doc_tipo', 'comprovante',
    'titulo', 'Comprovante de Entrega',
    'definitivo', true,
    'numero_documento', v_numero,
    'comprovante_id', v_comp.id,
    'snapshot_hash', v_hash,
    'reemissoes', v_reemissoes,
    'emitido_em', now(),
    'conteudo', v_snapshot,
    'aviso', 'Este documento comprova exclusivamente a entrega fisica dos produtos nele relacionados. '
          || 'Nao substitui documento fiscal, receituario agronomico, prescricao tecnica ou laudo tecnico '
          || 'quando legalmente exigiveis.'
  );
END
$function$;

-- rpc_publish_communication_event(text,text,uuid,jsonb,text) (1 ocorrencia(s) de digest qualificadas)
CREATE OR REPLACE FUNCTION public.rpc_publish_communication_event(p_event_key text, p_source_type text, p_source_id uuid, p_payload jsonb, p_idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_event_id uuid; v_rule public.comunicacao_regras%rowtype;
  v_tpl public.comunicacao_templates%rowtype; v_rec record;
  v_snapshot jsonb; v_payload_snapshot jsonb; v_idem_out text;
  v_enq int := 0; v_skp int := 0; v_row int := 0;
  v_target_role public.app_role;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'autenticação requerida' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_event_key NOT IN ('produto_pronto_retirada','produto_pronto_aplicacao','administrative_important_update') THEN
    RAISE EXCEPTION 'event_key não permitido: %', p_event_key;
  END IF;
  IF jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'payload deve ser objeto JSON';
  END IF;
  IF NOT public.has_role(auth.uid(),'administrador') THEN
    RAISE EXCEPTION 'apenas administrador (fase 1 manual)' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_event_key IN ('produto_pronto_retirada','produto_pronto_aplicacao') THEN
    IF (SELECT count(*) FROM jsonb_object_keys(p_payload)) > 0 THEN
      RAISE EXCEPTION 'payload não aceita chaves para %', p_event_key;
    END IF;
    IF p_source_type <> 'ordens_servico' OR p_source_id IS NULL THEN
      RAISE EXCEPTION 'source ordens_servico/id requerido';
    END IF;
    IF p_event_key = 'produto_pronto_retirada' THEN
      IF NOT EXISTS (SELECT 1 FROM public.ordens_servico o
                      WHERE o.id = p_source_id AND o.status = 'pronto_entrega') THEN
        RAISE EXCEPTION 'ordens_servico não está em pronto_entrega';
      END IF;
    ELSE
      IF NOT EXISTS (SELECT 1 FROM public.ordens_servico o WHERE o.id = p_source_id) THEN
        RAISE EXCEPTION 'ordem_servico inexistente';
      END IF;
    END IF;
  ELSIF p_event_key = 'administrative_important_update' THEN
    IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_payload) k WHERE k NOT IN ('target_role','titulo','mensagem')) THEN
      RAISE EXCEPTION 'chaves de payload não permitidas';
    END IF;
    IF p_payload ->> 'target_role' IS NULL THEN RAISE EXCEPTION 'target_role obrigatório'; END IF;
    BEGIN
      v_target_role := (p_payload ->> 'target_role')::public.app_role;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'target_role inválido: %', p_payload ->> 'target_role';
    END;
    IF length(COALESCE(p_payload->>'titulo','')) > 200 THEN RAISE EXCEPTION 'titulo excede 200'; END IF;
    IF length(COALESCE(p_payload->>'mensagem','')) > 2000 THEN RAISE EXCEPTION 'mensagem excede 2000'; END IF;
  END IF;

  INSERT INTO public.comunicacao_eventos(event_key,source_type,source_id,payload,created_by,idempotency_key)
  VALUES (p_event_key,p_source_type,p_source_id,p_payload,auth.uid(),p_idempotency_key)
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_event_id;

  IF v_event_id IS NULL THEN
    SELECT id INTO v_event_id FROM public.comunicacao_eventos WHERE idempotency_key = p_idempotency_key;
    RETURN jsonb_build_object('ok',true,'event_id',v_event_id,'duplicated',true);
  END IF;

  FOR v_rule IN
    SELECT * FROM public.comunicacao_regras
     WHERE event_key = p_event_key AND enabled = true
       AND (p_event_key <> 'administrative_important_update'
            OR (estrategia = 'broadcast_role' AND perfil = v_target_role))
     ORDER BY prioridade ASC
  LOOP
    v_tpl := public._comunicacao_resolve_template(v_rule.template_chave, v_rule.canal, v_rule.template_versao);
    IF v_tpl.id IS NULL OR v_tpl.canal <> v_rule.canal THEN
      v_skp := v_skp + 1; CONTINUE;
    END IF;
    v_snapshot := jsonb_build_object(
      'assunto', v_tpl.assunto, 'corpo', v_tpl.corpo,
      'variaveis', v_tpl.variaveis, 'canal', v_tpl.canal, 'locale', v_tpl.locale);

    FOR v_rec IN SELECT * FROM public._comunicacao_resolve_recipients(p_event_key, v_rule, p_source_id)
    LOOP
      IF NOT public._comunicacao_can_deliver(v_rec.recipient_user_id, v_rec.recipient_cliente_id, v_rule.canal) THEN
        v_skp := v_skp + 1; CONTINUE;
      END IF;
      v_payload_snapshot := public._comunicacao_build_snapshot(
        p_event_key, p_source_id, p_payload, v_rec.recipient_user_id, v_rec.recipient_cliente_id);
      v_idem_out := encode(extensions.digest(
        concat_ws('|', v_event_id::text, v_rule.id::text, v_tpl.id::text,
                  COALESCE(v_rec.recipient_user_id::text,''),
                  COALESCE(v_rec.recipient_cliente_id::text,'')),
        'sha256'), 'hex');
      INSERT INTO public.comunicacao_outbox(
        event_id, rule_id, template_id, template_chave, template_versao,
        template_snapshot, canal, recipient_user_id, recipient_cliente_id,
        payload_snapshot, idempotency_key)
      VALUES (
        v_event_id, v_rule.id, v_tpl.id, v_tpl.chave, v_tpl.versao,
        v_snapshot, v_rule.canal, v_rec.recipient_user_id, v_rec.recipient_cliente_id,
        v_payload_snapshot, v_idem_out)
      ON CONFLICT (idempotency_key) DO NOTHING;
      GET DIAGNOSTICS v_row = ROW_COUNT;
      IF v_row = 1 THEN v_enq := v_enq + 1; ELSE v_skp := v_skp + 1; END IF;
    END LOOP;
  END LOOP;

  UPDATE public.comunicacao_eventos
     SET status = 'processed', processed_at = now(),
         outbox_enqueued = v_enq, outbox_skipped = v_skp
   WHERE id = v_event_id;

  PERFORM public._comunicacao_write_audit('event.publish','comunicacao_eventos',v_event_id, NULL,
    jsonb_build_object('event_key',p_event_key,'enqueued',v_enq,'skipped',v_skp));

  RETURN jsonb_build_object('ok',true,'event_id',v_event_id,'duplicated',false,
    'enqueued',v_enq,'skipped',v_skp);
END$function$;

-- rpc_regulatory_dossier_publish(uuid) (1 ocorrencia(s) de digest qualificadas)
CREATE OR REPLACE FUNCTION public.rpc_regulatory_dossier_publish(p_dossier_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  d public.microorganism_regulatory_dossiers;
  v_cand public.microorganism_ncm_candidates;
  v_pending int; v_docs int; v_distinct int; v_snapshot jsonb; v_sha text;
BEGIN
  IF NOT public.fn_regulatory_can_prepare() THEN
    RAISE EXCEPTION 'REGULATORY_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO d FROM public.microorganism_regulatory_dossiers
   WHERE id = p_dossier_id AND deleted_at IS NULL FOR UPDATE;
  IF d.id IS NULL THEN RAISE EXCEPTION 'REGULATORY_DOSSIER_NOT_FOUND' USING ERRCODE = '22023'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('regulatory_publish:' || d.microorganism_id::text, 0));

  -- Idempotência sob concorrência: re-leitura após o lock
  SELECT * INTO d FROM public.microorganism_regulatory_dossiers
   WHERE id = p_dossier_id AND deleted_at IS NULL FOR UPDATE;
  IF d.status = 'VALIDATED' THEN
    SELECT snapshot_sha256 INTO v_sha
      FROM public.microorganism_regulatory_publication_snapshots
     WHERE dossier_id = p_dossier_id ORDER BY version DESC LIMIT 1;
    RETURN jsonb_build_object('dossier_id', p_dossier_id, 'status', d.status,
                              'snapshot_sha256', v_sha, 'idempotent', true);
  END IF;
  IF d.status <> 'PENDING_REVIEW' THEN
    RAISE EXCEPTION 'REGULATORY_INVALID_TRANSITION' USING ERRCODE = '55006';
  END IF;

  IF d.technical_review_status <> 'APPROVED'
     OR d.regulatory_review_status <> 'APPROVED'
     OR d.fiscal_review_status <> 'APPROVED' THEN
    RAISE EXCEPTION 'REGULATORY_APPROVALS_INCOMPLETE' USING ERRCODE = '55006';
  END IF;

  SELECT count(DISTINCT x) INTO v_distinct
    FROM unnest(ARRAY[d.technical_review_by, d.regulatory_review_by, d.fiscal_review_by]) AS x;
  IF v_distinct < 3 AND NOT d.sod_override_active THEN
    RAISE EXCEPTION 'REGULATORY_SEGREGATION_OF_DUTIES'
      USING ERRCODE = '42501',
            HINT = 'Publicacao exige tres aprovadores distintos ou override emergencial auditado.';
  END IF;

  SELECT count(*) INTO v_pending FROM public.microorganism_regulatory_checklist
   WHERE dossier_id = p_dossier_id AND state = 'PENDING';
  IF v_pending > 0 THEN
    RAISE EXCEPTION 'REGULATORY_CHECKLIST_INCOMPLETE: % item(ns) pendente(s)', v_pending USING ERRCODE = '55006';
  END IF;

  SELECT count(*) INTO v_docs FROM public.microorganism_regulatory_documents
   WHERE dossier_id = p_dossier_id AND deleted_at IS NULL AND doc_type IN ('ROTULO', 'LAUDO');
  IF v_docs = 0 THEN
    RAISE EXCEPTION 'REGULATORY_EVIDENCE_DOCUMENT_MISSING' USING ERRCODE = '55006';
  END IF;

  SELECT * INTO v_cand FROM public.microorganism_ncm_candidates
   WHERE dossier_id = p_dossier_id AND status = 'APPROVED' FOR UPDATE;
  IF v_cand.id IS NULL THEN
    RAISE EXCEPTION 'REGULATORY_NCM_NOT_APPROVED' USING ERRCODE = '55006';
  END IF;
  IF v_cand.source_id IS NULL OR v_cand.table_reference_date IS NULL THEN
    RAISE EXCEPTION 'REGULATORY_NCM_OFFICIAL_SOURCE_REQUIRED' USING ERRCODE = '55006';
  END IF;

  IF EXISTS (SELECT 1 FROM public.microorganism_regulatory_presentations
              WHERE dossier_id = p_dossier_id AND (NOT units_confirmed OR NOT gtin_confirmed)) THEN
    RAISE EXCEPTION 'REGULATORY_PRESENTATION_NOT_CONFIRMED' USING ERRCODE = '55006';
  END IF;

  PERFORM set_config('app.regulatory_formal_op', 'on', true);

  UPDATE public.microorganism_regulatory_dossiers
     SET status = 'VALIDATED',
         published_ncm = v_cand.ncm,
         published_cest = v_cand.cest,
         published_ncm_candidate_id = v_cand.id,
         published_at = now(), published_by = auth.uid(),
         effective_from = coalesce(effective_from, current_date),
         updated_by = auth.uid()
   WHERE id = p_dossier_id RETURNING * INTO d;

  v_snapshot := jsonb_build_object(
    'dossier', to_jsonb(d),
    'presentations', coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.volume_ml)
                               FROM public.microorganism_regulatory_presentations p
                               WHERE p.dossier_id = p_dossier_id), '[]'::jsonb),
    'documents', coalesce((SELECT jsonb_agg(jsonb_build_object(
                              'id', x.id, 'doc_type', x.doc_type, 'title', x.title,
                              'storage_path', x.storage_path,
                              'content_sha256', x.content_sha256, 'issued_at', x.issued_at,
                              'valid_until', x.valid_until, 'source_url', x.source_url) ORDER BY x.id)
                           FROM public.microorganism_regulatory_documents x
                           WHERE x.dossier_id = p_dossier_id AND x.deleted_at IS NULL), '[]'::jsonb),
    'checklist', coalesce((SELECT jsonb_agg(jsonb_build_object(
                              'item_key', c.item_key, 'state', c.state, 'justification', c.justification)
                              ORDER BY c.item_key)
                           FROM public.microorganism_regulatory_checklist c
                           WHERE c.dossier_id = p_dossier_id), '[]'::jsonb),
    'ncm_candidate', to_jsonb(v_cand));
  v_sha := encode(extensions.digest(v_snapshot::text, 'sha256'), 'hex');

  INSERT INTO public.microorganism_regulatory_publication_snapshots
    (dossier_id, microorganism_id, version, snapshot, snapshot_sha256, published_by)
  VALUES (p_dossier_id, d.microorganism_id, d.version, v_snapshot, v_sha, auth.uid());

  PERFORM set_config('app.regulatory_formal_op', '', true);
  RETURN jsonb_build_object('dossier_id', p_dossier_id, 'status', d.status,
                            'snapshot_sha256', v_sha, 'idempotent', false);
END $function$;

-- rpc_resolve_outbox_address(uuid) (2 ocorrencia(s) de digest qualificadas)
CREATE OR REPLACE FUNCTION public.rpc_resolve_outbox_address(p_outbox_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r public.comunicacao_outbox%rowtype; v_role text; v_email text;
  v_phone_raw text; v_phone text; v_ok boolean; v_hash text; v_redacted text;
BEGIN
  v_role := COALESCE(current_setting('request.jwt.claims',true)::jsonb->>'role', session_user);
  IF v_role IS NOT NULL AND v_role NOT IN ('service_role') AND current_user <> 'service_role' THEN
    RAISE EXCEPTION 'apenas service_role' USING ERRCODE='insufficient_privilege'; END IF;
  SELECT * INTO r FROM public.comunicacao_outbox WHERE id = p_outbox_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'outbox não encontrado'; END IF;
  IF r.status NOT IN ('processing') THEN
    RETURN jsonb_build_object('ok',false,'outcome','skipped','reason','not_processing'); END IF;
  v_ok := public._comunicacao_can_deliver(r.recipient_user_id, r.recipient_cliente_id, r.canal);
  IF NOT v_ok THEN
    RETURN jsonb_build_object('ok',false,'outcome','skipped','reason','opt_out_or_unverified'); END IF;
  IF r.canal = 'in_app' THEN
    RETURN jsonb_build_object('ok',true,'canal','in_app',
      'user_id',r.recipient_user_id,'cliente_id',r.recipient_cliente_id); END IF;
  IF r.canal = 'email' THEN
    IF r.recipient_user_id IS NOT NULL THEN
      SELECT lower(nullif(trim(email),'')) INTO v_email FROM public.profiles WHERE user_id = r.recipient_user_id;
    ELSE
      SELECT lower(nullif(trim(email),'')) INTO v_email FROM public.clientes WHERE id = r.recipient_cliente_id;
    END IF;
    IF v_email IS NULL OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
      RETURN jsonb_build_object('ok',false,'outcome','cancelled','reason','invalid_email'); END IF;
    v_hash := encode(extensions.digest(v_email,'sha256'),'hex');
    v_redacted := left(split_part(v_email,'@',1),2) || '***@' || split_part(v_email,'@',2);
    RETURN jsonb_build_object('ok',true,'canal','email','address',v_email,
      'address_hash',v_hash,'redacted',v_redacted,
      'user_id',r.recipient_user_id,'cliente_id',r.recipient_cliente_id);
  END IF;
  IF r.canal = 'whatsapp' THEN
    IF r.recipient_user_id IS NOT NULL THEN
      SELECT telefone INTO v_phone_raw FROM public.profiles WHERE user_id = r.recipient_user_id;
    ELSE
      SELECT COALESCE(telefone, (telefones)[1]) INTO v_phone_raw FROM public.clientes WHERE id = r.recipient_cliente_id;
    END IF;
    v_phone_raw := regexp_replace(COALESCE(v_phone_raw,''), '[^0-9]', '', 'g');
    IF length(v_phone_raw) IN (10,11) THEN v_phone := '+55' || v_phone_raw;
    ELSIF length(v_phone_raw) BETWEEN 12 AND 15 THEN v_phone := '+' || v_phone_raw;
    ELSE RETURN jsonb_build_object('ok',false,'outcome','cancelled','reason','invalid_phone'); END IF;
    v_hash := encode(extensions.digest(v_phone,'sha256'),'hex');
    v_redacted := left(v_phone,4) || repeat('*', GREATEST(0, length(v_phone)-6)) || right(v_phone,2);
    RETURN jsonb_build_object('ok',true,'canal','whatsapp','address',v_phone,
      'address_hash',v_hash,'redacted',v_redacted,
      'user_id',r.recipient_user_id,'cliente_id',r.recipient_cliente_id);
  END IF;
  RETURN jsonb_build_object('ok',false,'outcome','cancelled','reason','unsupported_canal');
END$function$;

-- Verificacao final: nenhuma funcao de public pode restar com digest() nao qualificado.
DO $check$
DECLARE v_restantes text;
BEGIN
  SELECT string_agg(p.oid::regprocedure::text, ', ')
    INTO v_restantes
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prosrc ~ '(^|[^.a-zA-Z_])digest\s*\(';
  IF v_restantes IS NOT NULL THEN
    RAISE EXCEPTION 'ainda existem funcoes com digest() nao qualificado: %', v_restantes;
  END IF;
END
$check$;
