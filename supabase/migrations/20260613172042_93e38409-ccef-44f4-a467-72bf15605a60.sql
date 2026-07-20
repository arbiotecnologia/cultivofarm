
-- =========================
-- Sequence for label codes
-- =========================
CREATE SEQUENCE IF NOT EXISTS public.produto_etiqueta_seq START 1;

-- =========================
-- produto_etiquetas
-- =========================
CREATE TABLE IF NOT EXISTS public.produto_etiquetas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo_etiqueta text NOT NULL UNIQUE,
  tipo_etiqueta text NOT NULL DEFAULT 'principal',
  status text NOT NULL DEFAULT 'gerada',
  lote_id uuid NULL REFERENCES public.lotes(id) ON DELETE SET NULL,
  produto_id uuid NULL REFERENCES public.produtos(id) ON DELETE SET NULL,
  envase_id uuid NULL REFERENCES public.envase(id) ON DELETE SET NULL,
  envase_item_id uuid NULL,
  estoque_item_id uuid NULL,
  entrega_id uuid NULL REFERENCES public.entregas(id) ON DELETE SET NULL,
  entrega_item_id uuid NULL,
  cliente_id uuid NULL REFERENCES public.clientes(id) ON DELETE SET NULL,
  fazenda_id uuid NULL REFERENCES public.fazendas(id) ON DELETE SET NULL,
  produto_nome text NOT NULL,
  protocolo_nome text NULL,
  lote_codigo text NOT NULL,
  volume numeric NULL,
  unidade text NULL,
  quantidade_embalagens integer NULL,
  cepas text[] NULL,
  composicao_resumida text NULL,
  fabricado_em date NULL,
  validade_em date NULL,
  conservacao text NULL,
  uso_recomendado text NULL,
  observacoes text NULL,
  trace_token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  trace_hash text NULL,
  trace_url text NULL,
  qr_code_payload text NULL,
  qr_code_path text NULL,
  qr_code_generated_at timestamptz NULL,
  public_trace_enabled boolean NOT NULL DEFAULT true,
  trace_expires_at timestamptz NULL,
  gerada_por uuid NULL,
  impressa_por uuid NULL,
  ultima_reimpressao_por uuid NULL,
  gerada_em timestamptz NOT NULL DEFAULT now(),
  impressa_em timestamptz NULL,
  ultima_reimpressao_em timestamptz NULL,
  quantidade_impressoes integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT produto_etiquetas_tipo_chk CHECK (tipo_etiqueta IN ('principal','reduzida','caixa','transporte','amostra','interna')),
  CONSTRAINT produto_etiquetas_status_chk CHECK (status IN ('gerada','impressa','reimpressa','cancelada','substituida'))
);

CREATE INDEX IF NOT EXISTS idx_produto_etiquetas_codigo ON public.produto_etiquetas(codigo_etiqueta);
CREATE INDEX IF NOT EXISTS idx_produto_etiquetas_trace_token ON public.produto_etiquetas(trace_token);
CREATE INDEX IF NOT EXISTS idx_produto_etiquetas_trace_hash ON public.produto_etiquetas(trace_hash);
CREATE INDEX IF NOT EXISTS idx_produto_etiquetas_lote_id ON public.produto_etiquetas(lote_id);
CREATE INDEX IF NOT EXISTS idx_produto_etiquetas_produto_id ON public.produto_etiquetas(produto_id);
CREATE INDEX IF NOT EXISTS idx_produto_etiquetas_envase_id ON public.produto_etiquetas(envase_id);
CREATE INDEX IF NOT EXISTS idx_produto_etiquetas_entrega_id ON public.produto_etiquetas(entrega_id);
CREATE INDEX IF NOT EXISTS idx_produto_etiquetas_cliente_id ON public.produto_etiquetas(cliente_id);
CREATE INDEX IF NOT EXISTS idx_produto_etiquetas_fazenda_id ON public.produto_etiquetas(fazenda_id);
CREATE INDEX IF NOT EXISTS idx_produto_etiquetas_status ON public.produto_etiquetas(status);

GRANT SELECT, INSERT, UPDATE ON public.produto_etiquetas TO authenticated;
GRANT ALL ON public.produto_etiquetas TO service_role;

ALTER TABLE public.produto_etiquetas ENABLE ROW LEVEL SECURITY;

-- Internal staff manage everything
CREATE POLICY "Internal manage produto_etiquetas"
  ON public.produto_etiquetas
  FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(),'administrador'::app_role)
    OR public.has_role(auth.uid(),'gestor'::app_role)
    OR public.has_role(auth.uid(),'producao'::app_role)
    OR public.has_role(auth.uid(),'operador_onfarm'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(),'administrador'::app_role)
    OR public.has_role(auth.uid(),'gestor'::app_role)
    OR public.has_role(auth.uid(),'producao'::app_role)
    OR public.has_role(auth.uid(),'operador_onfarm'::app_role)
  );

-- Administrativo and financeiro: read-only
CREATE POLICY "Admin/Financeiro read produto_etiquetas"
  ON public.produto_etiquetas
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(),'administrativo'::app_role)
    OR public.has_role(auth.uid(),'financeiro'::app_role)
    OR public.has_role(auth.uid(),'tecnico_agronomo'::app_role)
    OR public.has_role(auth.uid(),'consultor_tecnico'::app_role)
  );

-- Cliente_produtor: own client's labels only
CREATE POLICY "Cliente_produtor own labels"
  ON public.produto_etiquetas
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(),'cliente_produtor'::app_role)
    AND cliente_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.user_clientes uc
      WHERE uc.user_id = auth.uid() AND uc.cliente_id = produto_etiquetas.cliente_id
    )
  );

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.fn_produto_etiquetas_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
CREATE TRIGGER trg_produto_etiquetas_updated_at
  BEFORE UPDATE ON public.produto_etiquetas
  FOR EACH ROW EXECUTE FUNCTION public.fn_produto_etiquetas_updated_at();

-- =========================
-- produto_etiqueta_eventos
-- =========================
CREATE TABLE IF NOT EXISTS public.produto_etiqueta_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  etiqueta_id uuid NOT NULL REFERENCES public.produto_etiquetas(id) ON DELETE CASCADE,
  evento text NOT NULL,
  descricao text NULL,
  user_id uuid NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_produto_etiqueta_eventos_etiqueta_id ON public.produto_etiqueta_eventos(etiqueta_id);
CREATE INDEX IF NOT EXISTS idx_produto_etiqueta_eventos_evento ON public.produto_etiqueta_eventos(evento);

GRANT SELECT, INSERT ON public.produto_etiqueta_eventos TO authenticated;
GRANT ALL ON public.produto_etiqueta_eventos TO service_role;

ALTER TABLE public.produto_etiqueta_eventos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal manage etiqueta_eventos"
  ON public.produto_etiqueta_eventos
  FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(),'administrador'::app_role)
    OR public.has_role(auth.uid(),'gestor'::app_role)
    OR public.has_role(auth.uid(),'producao'::app_role)
    OR public.has_role(auth.uid(),'operador_onfarm'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(),'administrador'::app_role)
    OR public.has_role(auth.uid(),'gestor'::app_role)
    OR public.has_role(auth.uid(),'producao'::app_role)
    OR public.has_role(auth.uid(),'operador_onfarm'::app_role)
  );

CREATE POLICY "Read etiqueta_eventos"
  ON public.produto_etiqueta_eventos
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(),'administrativo'::app_role)
    OR public.has_role(auth.uid(),'financeiro'::app_role)
    OR public.has_role(auth.uid(),'tecnico_agronomo'::app_role)
    OR public.has_role(auth.uid(),'consultor_tecnico'::app_role)
  );

-- =========================
-- entrega_etiquetas (bridge)
-- =========================
CREATE TABLE IF NOT EXISTS public.entrega_etiquetas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entrega_id uuid NOT NULL REFERENCES public.entregas(id) ON DELETE CASCADE,
  etiqueta_id uuid NOT NULL REFERENCES public.produto_etiquetas(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL,
  UNIQUE (entrega_id, etiqueta_id)
);
CREATE INDEX IF NOT EXISTS idx_entrega_etiquetas_entrega ON public.entrega_etiquetas(entrega_id);
CREATE INDEX IF NOT EXISTS idx_entrega_etiquetas_etiqueta ON public.entrega_etiquetas(etiqueta_id);

GRANT SELECT, INSERT, DELETE ON public.entrega_etiquetas TO authenticated;
GRANT ALL ON public.entrega_etiquetas TO service_role;

ALTER TABLE public.entrega_etiquetas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal manage entrega_etiquetas"
  ON public.entrega_etiquetas
  FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(),'administrador'::app_role)
    OR public.has_role(auth.uid(),'gestor'::app_role)
    OR public.has_role(auth.uid(),'producao'::app_role)
    OR public.has_role(auth.uid(),'operador_onfarm'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(),'administrador'::app_role)
    OR public.has_role(auth.uid(),'gestor'::app_role)
    OR public.has_role(auth.uid(),'producao'::app_role)
    OR public.has_role(auth.uid(),'operador_onfarm'::app_role)
  );

CREATE POLICY "Read entrega_etiquetas"
  ON public.entrega_etiquetas
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(),'administrativo'::app_role)
    OR public.has_role(auth.uid(),'financeiro'::app_role)
    OR public.has_role(auth.uid(),'tecnico_agronomo'::app_role)
    OR public.has_role(auth.uid(),'consultor_tecnico'::app_role)
  );

-- =========================
-- Augment envase
-- =========================
ALTER TABLE public.envase
  ADD COLUMN IF NOT EXISTS etiqueta_gerada boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS etiqueta_id uuid NULL REFERENCES public.produto_etiquetas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS etiqueta_gerada_em timestamptz NULL,
  ADD COLUMN IF NOT EXISTS etiqueta_gerada_por uuid NULL;

-- =========================
-- RPC: gerar etiqueta
-- =========================
CREATE OR REPLACE FUNCTION public.rpc_gerar_etiqueta_produto(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  v_produto_nome text;
  v_lote_codigo text;
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

  -- Auto-load envase
  IF v_envase_id IS NOT NULL THEN
    SELECT e.lote_id, COALESCE(v_volume, e.volume_por_unidade), COALESCE(v_qtd_emb, e.quantidade)
      INTO v_lote_id, v_volume, v_qtd_emb
    FROM public.envase e WHERE e.id = v_envase_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Envase não encontrado'; END IF;
  END IF;

  IF v_lote_id IS NULL THEN
    RAISE EXCEPTION 'Lote obrigatório';
  END IF;

  -- Load lote/produto info
  SELECT l.codigo_lote, COALESCE(v_produto_id, l.produto_id), l.data_producao
    INTO v_lote_codigo, v_produto_id, v_fabricado_em
  FROM public.lotes l WHERE l.id = v_lote_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lote não encontrado'; END IF;

  IF v_produto_id IS NOT NULL THEN
    SELECT p.nome INTO v_produto_nome FROM public.produtos p WHERE p.id = v_produto_id;
  END IF;
  IF v_produto_nome IS NULL THEN v_produto_nome := 'Bioinsumo AR Bio'; END IF;

  -- Cepas via microrganismos do lote
  SELECT array_remove(ARRAY[m.nome], NULL)
    INTO v_cepas
  FROM public.lotes l
  LEFT JOIN public.microrganismos m ON m.id = l.microrganismo_id
  WHERE l.id = v_lote_id;

  -- Validade: tentar estoque vinculado, senão +6 meses
  IF v_envase_id IS NOT NULL THEN
    SELECT MIN(ep.validade) INTO v_estoque_validade
    FROM public.estoque_produto ep WHERE ep.lote_id = v_lote_id;
  END IF;
  v_validade_em := COALESCE(v_estoque_validade, (v_fabricado_em + INTERVAL '6 months')::date);

  IF v_unidade IS NULL AND v_volume IS NOT NULL THEN
    v_unidade := 'ml';
  END IF;

  -- Sequence
  SELECT nextval('public.produto_etiqueta_seq') INTO v_seq;
  v_codigo := 'AR-LB-' || lpad(v_seq::text, 6, '0');

  v_trace_hash := encode(digest(v_trace_token::text || '|' || v_codigo, 'sha256'), 'hex');
  v_qr_payload := '/rastrear-produto/' || v_trace_token::text;

  INSERT INTO public.produto_etiquetas (
    id, codigo_etiqueta, tipo_etiqueta, status,
    lote_id, produto_id, envase_id, envase_item_id, estoque_item_id,
    entrega_id, entrega_item_id, cliente_id, fazenda_id,
    produto_nome, lote_codigo, volume, unidade, quantidade_embalagens, cepas,
    fabricado_em, validade_em, conservacao, uso_recomendado, observacoes,
    trace_token, trace_hash, qr_code_payload, qr_code_generated_at,
    gerada_por, gerada_em
  ) VALUES (
    v_id, v_codigo, v_tipo, 'gerada',
    v_lote_id, v_produto_id, v_envase_id, v_envase_item_id, v_estoque_item_id,
    v_entrega_id, v_entrega_item_id, v_cliente_id, v_fazenda_id,
    v_produto_nome, v_lote_codigo, v_volume, v_unidade, v_qtd_emb, v_cepas,
    v_fabricado_em, v_validade_em,
    COALESCE(v_conservacao, 'Conservar em local fresco, protegido do sol. Evitar exposição direta ao calor.'),
    COALESCE(v_uso, 'Utilizar conforme recomendação técnica AR Bio.'),
    v_obs,
    v_trace_token, v_trace_hash, v_qr_payload, now(),
    v_uid, now()
  );

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
            jsonb_build_object('tipo', v_tipo, 'codigo', v_codigo));

  INSERT INTO public.financial_audit_log(entity_type, entity_id, action, new_data, performed_by, reason)
    VALUES ('produto_etiqueta', v_id, 'LABEL_GENERATED',
            jsonb_build_object('codigo', v_codigo, 'tipo', v_tipo, 'lote_id', v_lote_id, 'envase_id', v_envase_id),
            v_uid, 'Geração de etiqueta de produto');

  RETURN jsonb_build_object(
    'success', true,
    'etiqueta_id', v_id,
    'codigo_etiqueta', v_codigo,
    'trace_token', v_trace_token,
    'trace_url', v_qr_payload,
    'qr_code_payload', v_qr_payload
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_gerar_etiqueta_produto(jsonb) TO authenticated;

-- =========================
-- RPC: marcar impressa
-- =========================
CREATE OR REPLACE FUNCTION public.rpc_marcar_etiqueta_impressa(p_etiqueta_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    v_new_status := 'reimpressa'; v_event := 'etiqueta_reimpressa';
    UPDATE public.produto_etiquetas
      SET status='reimpressa', ultima_reimpressao_em=now(), ultima_reimpressao_por=v_uid,
          quantidade_impressoes = quantidade_impressoes + 1
      WHERE id = p_etiqueta_id;
  END IF;

  INSERT INTO public.produto_etiqueta_eventos(etiqueta_id, evento, user_id, metadata)
    VALUES (p_etiqueta_id, v_event, v_uid, jsonb_build_object('quantidade_total', v_count+1));

  INSERT INTO public.financial_audit_log(entity_type, entity_id, action, performed_by)
    VALUES ('produto_etiqueta', p_etiqueta_id, upper(v_event), v_uid);

  RETURN jsonb_build_object('success', true, 'status', v_new_status, 'quantidade_impressoes', v_count+1);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_marcar_etiqueta_impressa(uuid) TO authenticated;

-- =========================
-- RPC: cancelar etiqueta
-- =========================
CREATE OR REPLACE FUNCTION public.rpc_cancelar_etiqueta_produto(p_etiqueta_id uuid, p_motivo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF p_motivo IS NULL OR length(trim(p_motivo)) < 3 THEN
    RAISE EXCEPTION 'Motivo obrigatório';
  END IF;
  IF NOT (
    public.has_role(v_uid,'administrador'::app_role)
    OR public.has_role(v_uid,'gestor'::app_role)
    OR public.has_role(v_uid,'producao'::app_role)
  ) THEN
    RAISE EXCEPTION 'Sem permissão para cancelar etiqueta';
  END IF;

  UPDATE public.produto_etiquetas
    SET status='cancelada',
        metadata = metadata || jsonb_build_object('cancelada_em', now(), 'cancelada_por', v_uid, 'motivo', p_motivo)
    WHERE id = p_etiqueta_id AND status <> 'cancelada';
  IF NOT FOUND THEN RAISE EXCEPTION 'Etiqueta não encontrada ou já cancelada'; END IF;

  INSERT INTO public.produto_etiqueta_eventos(etiqueta_id, evento, descricao, user_id, metadata)
    VALUES (p_etiqueta_id, 'etiqueta_cancelada', p_motivo, v_uid, jsonb_build_object('motivo', p_motivo));

  INSERT INTO public.financial_audit_log(entity_type, entity_id, action, performed_by, reason)
    VALUES ('produto_etiqueta', p_etiqueta_id, 'LABEL_CANCELLED', v_uid, p_motivo);

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_cancelar_etiqueta_produto(uuid, text) TO authenticated;

-- =========================
-- RPC: validar rastreio público
-- =========================
CREATE OR REPLACE FUNCTION public.rpc_validar_rastreio_produto(p_trace_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.produto_etiquetas%ROWTYPE;
  v_msg text;
  v_status text;
BEGIN
  SELECT * INTO v_row FROM public.produto_etiquetas WHERE trace_token = p_trace_token;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('valido', false, 'mensagem', 'Etiqueta não encontrada ou indisponível.');
  END IF;
  IF NOT v_row.public_trace_enabled THEN
    RETURN jsonb_build_object('valido', false, 'mensagem', 'Rastreio público desabilitado para esta etiqueta.');
  END IF;
  IF v_row.trace_expires_at IS NOT NULL AND v_row.trace_expires_at < now() THEN
    RETURN jsonb_build_object('valido', false, 'mensagem', 'Rastreio expirado.');
  END IF;
  IF v_row.status = 'cancelada' THEN
    v_status := 'cancelada';
    v_msg := 'Etiqueta cancelada ou substituída. Confirme com a AR Bio.';
  ELSIF v_row.validade_em IS NOT NULL AND v_row.validade_em < CURRENT_DATE THEN
    v_status := 'vencido';
    v_msg := 'Produto com validade expirada. Confirme condições com a AR Bio.';
  ELSE
    v_status := 'ativo';
    v_msg := 'Produto registrado no sistema AR Bio.';
  END IF;

  INSERT INTO public.produto_etiqueta_eventos(etiqueta_id, evento, descricao, metadata)
    VALUES (v_row.id, 'qr_validado', 'Validação pública via QR Code', jsonb_build_object('status', v_status));

  RETURN jsonb_build_object(
    'valido', true,
    'status', v_status,
    'codigo_etiqueta', v_row.codigo_etiqueta,
    'produto_nome', v_row.produto_nome,
    'lote_codigo', v_row.lote_codigo,
    'fabricado_em', v_row.fabricado_em,
    'validade_em', v_row.validade_em,
    'volume', v_row.volume,
    'unidade', v_row.unidade,
    'tipo_etiqueta', v_row.tipo_etiqueta,
    'mensagem', v_msg
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_validar_rastreio_produto(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_validar_rastreio_produto(uuid) TO anon, authenticated;

-- =========================
-- RPC: rastreio interno completo
-- =========================
CREATE OR REPLACE FUNCTION public.rpc_rastreio_produto_interno(p_etiqueta_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.produto_etiquetas%ROWTYPE;
  v_lote jsonb; v_envase jsonb; v_cq jsonb; v_estoque jsonb; v_entrega jsonb; v_eventos jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF public.has_role(v_uid,'cliente_produtor'::app_role)
     AND NOT (public.has_role(v_uid,'administrador'::app_role) OR public.has_role(v_uid,'gestor'::app_role)) THEN
    RAISE EXCEPTION 'Sem permissão para rastreio interno';
  END IF;
  IF NOT (
    public.has_role(v_uid,'administrador'::app_role)
    OR public.has_role(v_uid,'gestor'::app_role)
    OR public.has_role(v_uid,'producao'::app_role)
    OR public.has_role(v_uid,'operador_onfarm'::app_role)
    OR public.has_role(v_uid,'administrativo'::app_role)
    OR public.has_role(v_uid,'financeiro'::app_role)
    OR public.has_role(v_uid,'tecnico_agronomo'::app_role)
    OR public.has_role(v_uid,'consultor_tecnico'::app_role)
  ) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  SELECT * INTO v_row FROM public.produto_etiquetas WHERE id = p_etiqueta_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Etiqueta não encontrada'; END IF;

  SELECT to_jsonb(l) INTO v_lote FROM public.lotes l WHERE l.id = v_row.lote_id;
  SELECT to_jsonb(e) INTO v_envase FROM public.envase e WHERE e.id = v_row.envase_id;
  SELECT jsonb_agg(to_jsonb(cq)) INTO v_cq FROM public.controle_qualidade cq WHERE cq.lote_id = v_row.lote_id;
  SELECT jsonb_agg(to_jsonb(ep)) INTO v_estoque FROM public.estoque_produto ep WHERE ep.lote_id = v_row.lote_id;
  SELECT to_jsonb(en) INTO v_entrega FROM public.entregas en WHERE en.id = v_row.entrega_id;
  SELECT jsonb_agg(to_jsonb(ev) ORDER BY ev.created_at DESC) INTO v_eventos
    FROM public.produto_etiqueta_eventos ev WHERE ev.etiqueta_id = p_etiqueta_id;

  INSERT INTO public.produto_etiqueta_eventos(etiqueta_id, evento, user_id)
    VALUES (p_etiqueta_id, 'rastreio_visualizado', v_uid);

  RETURN jsonb_build_object(
    'etiqueta', to_jsonb(v_row),
    'lote', v_lote,
    'envase', v_envase,
    'controle_qualidade', v_cq,
    'estoque', v_estoque,
    'entrega', v_entrega,
    'eventos', v_eventos
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_rastreio_produto_interno(uuid) TO authenticated;
