-- =====================================================================
-- Etiquetas pós-envase: CQ gate, snapshot imutável, reimpressão auditada
-- Forward-only. Staging ikaauvsflpmamgxmkhoq.
-- =====================================================================

ALTER TABLE public.produto_etiquetas
  ADD COLUMN IF NOT EXISTS snapshot jsonb,
  ADD COLUMN IF NOT EXISTS template_versao text NOT NULL DEFAULT 'etiqueta-produto-v1',
  ADD COLUMN IF NOT EXISTS cq_liberado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS lote_status_na_emissao text,
  ADD COLUMN IF NOT EXISTS motivo_ultima_reimpressao text,
  ADD COLUMN IF NOT EXISTS substitui_etiqueta_id uuid,
  ADD COLUMN IF NOT EXISTS substituida_por_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_produto_etiquetas_substitui') THEN
    ALTER TABLE public.produto_etiquetas
      ADD CONSTRAINT fk_produto_etiquetas_substitui
      FOREIGN KEY (substitui_etiqueta_id) REFERENCES public.produto_etiquetas(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_produto_etiquetas_substituida_por') THEN
    ALTER TABLE public.produto_etiquetas
      ADD CONSTRAINT fk_produto_etiquetas_substituida_por
      FOREIGN KEY (substituida_por_id) REFERENCES public.produto_etiquetas(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_produto_etiquetas_lote ON public.produto_etiquetas(lote_id);
CREATE INDEX IF NOT EXISTS idx_produto_etiquetas_envase ON public.produto_etiquetas(envase_id);
CREATE INDEX IF NOT EXISTS idx_produto_etiquetas_status ON public.produto_etiquetas(status);

-- ---------------------------------------------------------------
-- Imutabilidade do conteúdo emitido
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_produto_etiquetas_snapshot_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.snapshot IS NOT NULL AND NEW.snapshot IS DISTINCT FROM OLD.snapshot THEN
    RAISE EXCEPTION 'Snapshot da etiqueta é imutável';
  END IF;
  IF NEW.codigo_etiqueta IS DISTINCT FROM OLD.codigo_etiqueta
     OR NEW.trace_token IS DISTINCT FROM OLD.trace_token
     OR NEW.lote_id IS DISTINCT FROM OLD.lote_id
     OR NEW.lote_codigo IS DISTINCT FROM OLD.lote_codigo
     OR NEW.template_versao IS DISTINCT FROM OLD.template_versao
     OR NEW.gerada_em IS DISTINCT FROM OLD.gerada_em THEN
    RAISE EXCEPTION 'Campos de identificação/emissão da etiqueta são imutáveis';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_produto_etiquetas_snapshot_immutable ON public.produto_etiquetas;
CREATE TRIGGER trg_produto_etiquetas_snapshot_immutable
  BEFORE UPDATE ON public.produto_etiquetas
  FOR EACH ROW EXECUTE FUNCTION public.tg_produto_etiquetas_snapshot_immutable();

-- ---------------------------------------------------------------
-- Geração de etiqueta com gate de CQ + snapshot
-- ---------------------------------------------------------------
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
  v_produto_nome text;
  v_lote_codigo text;
  v_lote_status text;
  v_cq_liberado boolean;
  v_cepas text[];
  v_fabricado_em date;
  v_validade_em date;
  v_estoque_validade date;
  v_seq bigint;
  v_codigo text;
  v_trace_token uuid := gen_random_uuid();
  v_trace_hash text;
  v_id uuid := gen_random_uuid();
  v_qr_payload text;
  v_snapshot jsonb;
  v_template text := 'etiqueta-produto-v1';
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

  IF v_envase_id IS NOT NULL THEN
    SELECT e.lote_id, COALESCE(v_volume, e.volume_por_unidade), COALESCE(v_qtd_emb, e.quantidade)
      INTO v_lote_id, v_volume, v_qtd_emb
    FROM public.envase e WHERE e.id = v_envase_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Envase não encontrado'; END IF;
  END IF;

  IF v_lote_id IS NULL THEN
    RAISE EXCEPTION 'Lote obrigatório';
  END IF;

  SELECT l.codigo_lote, COALESCE(v_produto_id, l.produto_id), l.data_producao, l.status::text
    INTO v_lote_codigo, v_produto_id, v_fabricado_em, v_lote_status
  FROM public.lotes l WHERE l.id = v_lote_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lote não encontrado'; END IF;

  v_cq_liberado := (v_lote_status = 'aprovado');

  -- Gate de qualidade: etiquetas comerciais/logísticas exigem CQ aprovado
  IF NOT v_cq_liberado AND v_tipo NOT IN ('interna','amostra') THEN
    RAISE EXCEPTION 'Etiqueta % bloqueada: lote % está com status de qualidade "%". Somente lotes aprovados no CQ podem receber etiqueta liberada.',
      v_tipo, v_lote_codigo, v_lote_status;
  END IF;

  IF v_produto_id IS NOT NULL THEN
    SELECT p.nome INTO v_produto_nome FROM public.produtos p WHERE p.id = v_produto_id;
  END IF;
  IF v_produto_nome IS NULL THEN v_produto_nome := 'Bioinsumo AR Bio'; END IF;

  SELECT array_remove(ARRAY[m.nome], NULL)
    INTO v_cepas
  FROM public.lotes l
  LEFT JOIN public.microrganismos m ON m.id = l.microrganismo_id
  WHERE l.id = v_lote_id;

  IF v_envase_id IS NOT NULL THEN
    SELECT MIN(ep.validade) INTO v_estoque_validade
    FROM public.estoque_produto ep WHERE ep.lote_id = v_lote_id;
  END IF;
  v_validade_em := COALESCE(v_estoque_validade, (v_fabricado_em + INTERVAL '6 months')::date);

  IF v_unidade IS NULL AND v_volume IS NOT NULL THEN
    v_unidade := 'ml';
  END IF;

  SELECT nextval('public.produto_etiqueta_seq') INTO v_seq;
  v_codigo := 'AR-LB-' || lpad(v_seq::text, 6, '0');

  v_trace_hash := encode(digest(v_trace_token::text || '|' || v_codigo, 'sha256'), 'hex');
  v_qr_payload := '/rastrear-produto/' || v_trace_token::text;

  v_conservacao := COALESCE(v_conservacao, 'Conservar em local fresco, protegido do sol. Evitar exposição direta ao calor.');
  v_uso := COALESCE(v_uso, 'Utilizar conforme recomendação técnica AR Bio.');

  v_snapshot := jsonb_build_object(
    'template_versao', v_template,
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
    'validade_origem', CASE WHEN v_estoque_validade IS NOT NULL THEN 'estoque' ELSE 'estimada_6_meses' END,
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
    lote_id, produto_id, envase_id, envase_item_id, estoque_item_id,
    entrega_id, entrega_item_id, cliente_id, fazenda_id,
    produto_nome, lote_codigo, volume, unidade, quantidade_embalagens, cepas,
    fabricado_em, validade_em, conservacao, uso_recomendado, observacoes,
    trace_token, trace_hash, qr_code_payload, qr_code_generated_at,
    gerada_por, gerada_em,
    snapshot, template_versao, cq_liberado, lote_status_na_emissao, substitui_etiqueta_id
  ) VALUES (
    v_id, v_codigo, v_tipo, 'gerada',
    v_lote_id, v_produto_id, v_envase_id, v_envase_item_id, v_estoque_item_id,
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
            jsonb_build_object('tipo', v_tipo, 'codigo', v_codigo, 'cq_liberado', v_cq_liberado));

  INSERT INTO public.financial_audit_log(entity_type, entity_id, action, new_data, performed_by, reason)
    VALUES ('produto_etiqueta', v_id, 'LABEL_GENERATED',
            jsonb_build_object('codigo', v_codigo, 'tipo', v_tipo, 'lote_id', v_lote_id, 'envase_id', v_envase_id, 'cq_liberado', v_cq_liberado),
            v_uid, 'Geração de etiqueta de produto');

  RETURN jsonb_build_object(
    'success', true,
    'etiqueta_id', v_id,
    'codigo_etiqueta', v_codigo,
    'trace_token', v_trace_token,
    'trace_url', v_qr_payload,
    'qr_code_payload', v_qr_payload,
    'cq_liberado', v_cq_liberado,
    'template_versao', v_template
  );
END;
$function$;

-- ---------------------------------------------------------------
-- Impressão / reimpressão auditada (motivo obrigatório na reimpressão)
-- ---------------------------------------------------------------
DROP FUNCTION IF EXISTS public.rpc_marcar_etiqueta_impressa(uuid);

CREATE OR REPLACE FUNCTION public.rpc_marcar_etiqueta_impressa(p_etiqueta_id uuid, p_motivo text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_status text;
  v_count integer;
  v_new_status text;
  v_event text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF NOT (
    public.has_role(v_uid,'administrador'::app_role)
    OR public.has_role(v_uid,'gestor'::app_role)
    OR public.has_role(v_uid,'producao'::app_role)
    OR public.has_role(v_uid,'operador_onfarm'::app_role)
    OR public.has_role(v_uid,'administrativo'::app_role)
  ) THEN
    RAISE EXCEPTION 'Sem permissão para imprimir etiqueta';
  END IF;

  SELECT status, quantidade_impressoes INTO v_status, v_count
    FROM public.produto_etiquetas WHERE id = p_etiqueta_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Etiqueta não encontrada'; END IF;
  IF v_status = 'cancelada' THEN RAISE EXCEPTION 'Etiqueta cancelada não pode ser impressa'; END IF;

  IF v_status = 'gerada' THEN
    v_new_status := 'impressa'; v_event := 'etiqueta_impressa';
    UPDATE public.produto_etiquetas
      SET status='impressa', impressa_em=now(), impressa_por=v_uid,
          quantidade_impressoes = quantidade_impressoes + 1
      WHERE id = p_etiqueta_id;
  ELSE
    IF p_motivo IS NULL OR length(trim(p_motivo)) < 3 THEN
      RAISE EXCEPTION 'Motivo obrigatório para reimpressão (mínimo 3 caracteres)';
    END IF;
    v_new_status := 'reimpressa'; v_event := 'etiqueta_reimpressa';
    UPDATE public.produto_etiquetas
      SET status='reimpressa', ultima_reimpressao_em=now(), ultima_reimpressao_por=v_uid,
          motivo_ultima_reimpressao = trim(p_motivo),
          quantidade_impressoes = quantidade_impressoes + 1
      WHERE id = p_etiqueta_id;
  END IF;

  INSERT INTO public.produto_etiqueta_eventos(etiqueta_id, evento, descricao, user_id, metadata)
    VALUES (p_etiqueta_id, v_event, NULLIF(trim(COALESCE(p_motivo,'')),''), v_uid,
            jsonb_build_object('quantidade_total', v_count+1, 'motivo', NULLIF(trim(COALESCE(p_motivo,'')),'')));

  INSERT INTO public.financial_audit_log(entity_type, entity_id, action, performed_by, reason)
    VALUES ('produto_etiqueta', p_etiqueta_id, upper(v_event), v_uid, NULLIF(trim(COALESCE(p_motivo,'')),''));

  RETURN jsonb_build_object('success', true, 'status', v_new_status, 'quantidade_impressoes', v_count+1);
END;
$function$;

-- ---------------------------------------------------------------
-- Substituição auditada de etiqueta (cancela + reemite vinculada)
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_substituir_etiqueta_produto(p_etiqueta_id uuid, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_old public.produto_etiquetas%ROWTYPE;
  v_res jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF p_motivo IS NULL OR length(trim(p_motivo)) < 5 THEN
    RAISE EXCEPTION 'Motivo obrigatório para substituição (mínimo 5 caracteres)';
  END IF;

  SELECT * INTO v_old FROM public.produto_etiquetas WHERE id = p_etiqueta_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Etiqueta não encontrada'; END IF;
  IF v_old.status = 'cancelada' THEN RAISE EXCEPTION 'Etiqueta já cancelada'; END IF;
  IF v_old.substituida_por_id IS NOT NULL THEN RAISE EXCEPTION 'Etiqueta já substituída'; END IF;

  v_res := public.rpc_gerar_etiqueta_produto(jsonb_build_object(
    'lote_id', v_old.lote_id,
    'produto_id', v_old.produto_id,
    'envase_id', v_old.envase_id,
    'envase_item_id', v_old.envase_item_id,
    'estoque_item_id', v_old.estoque_item_id,
    'entrega_id', v_old.entrega_id,
    'entrega_item_id', v_old.entrega_item_id,
    'cliente_id', v_old.cliente_id,
    'fazenda_id', v_old.fazenda_id,
    'tipo_etiqueta', v_old.tipo_etiqueta,
    'volume', v_old.volume,
    'unidade', v_old.unidade,
    'quantidade_embalagens', v_old.quantidade_embalagens,
    'conservacao', v_old.conservacao,
    'uso_recomendado', v_old.uso_recomendado,
    'observacoes', v_old.observacoes,
    'substitui_etiqueta_id', v_old.id
  ));

  PERFORM public.rpc_cancelar_etiqueta_produto(p_etiqueta_id, 'Substituída: ' || trim(p_motivo));

  RETURN jsonb_build_object(
    'success', true,
    'etiqueta_anterior_id', p_etiqueta_id,
    'nova_etiqueta_id', v_res->>'etiqueta_id',
    'novo_codigo', v_res->>'codigo_etiqueta'
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.rpc_marcar_etiqueta_impressa(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.rpc_substituir_etiqueta_produto(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_marcar_etiqueta_impressa(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_substituir_etiqueta_produto(uuid, text) TO authenticated;