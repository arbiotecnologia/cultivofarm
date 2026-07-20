
-- =========================================================
-- FASE ENTREGAS 1 — Comprovantes, Assinatura Digital, QR Code
-- =========================================================

-- Sequence for numero_formulario
CREATE SEQUENCE IF NOT EXISTS public.entrega_formulario_seq START 1;

-- ---------- entrega_comprovantes ----------
CREATE TABLE IF NOT EXISTS public.entrega_comprovantes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entrega_id uuid NOT NULL REFERENCES public.entregas(id) ON DELETE CASCADE,
  numero_formulario text NOT NULL UNIQUE,
  tipo text NOT NULL DEFAULT 'formulario_entrega',
  status text NOT NULL DEFAULT 'gerado',
  arquivo_url text,
  arquivo_path text,
  arquivo_nome text,
  arquivo_mime text,
  assinatura_coletada boolean NOT NULL DEFAULT false,
  assinatura_tipo text,
  assinatura_digital_svg text,
  assinatura_digital_png_path text,
  assinatura_hash text,
  assinatura_ip text,
  assinatura_user_agent text,
  assinatura_capturada_em timestamptz,
  recebedor_nome text,
  recebedor_documento text,
  recebedor_cargo text,
  recebedor_telefone text,
  data_assinatura timestamptz,
  validation_token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  validation_hash text,
  validation_url text,
  qr_code_payload text,
  qr_code_path text,
  qr_code_generated_at timestamptz,
  validation_public_enabled boolean NOT NULL DEFAULT true,
  validation_expires_at timestamptz,
  observacoes text,
  ressalvas text,
  possui_ressalvas boolean NOT NULL DEFAULT false,
  gerado_por uuid REFERENCES auth.users(id),
  anexado_por uuid REFERENCES auth.users(id),
  confirmado_por uuid REFERENCES auth.users(id),
  gerado_em timestamptz NOT NULL DEFAULT now(),
  anexado_em timestamptz,
  confirmado_em timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT entrega_comprovantes_tipo_chk CHECK (tipo IN ('formulario_entrega','termo_recebimento','comprovante_assinado','assinatura_digital','foto_recebimento','outro')),
  CONSTRAINT entrega_comprovantes_status_chk CHECK (status IN ('gerado','impresso','aguardando_assinatura','assinatura_digital_coletada','assinado','anexado','confirmado','rejeitado','cancelado')),
  CONSTRAINT entrega_comprovantes_assinatura_tipo_chk CHECK (assinatura_tipo IS NULL OR assinatura_tipo IN ('fisica_anexada','digital_tela','dispensada','nao_coletada'))
);

GRANT SELECT, INSERT, UPDATE ON public.entrega_comprovantes TO authenticated;
GRANT ALL ON public.entrega_comprovantes TO service_role;
ALTER TABLE public.entrega_comprovantes ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_entrega_comprovantes_entrega_id ON public.entrega_comprovantes(entrega_id);
CREATE INDEX IF NOT EXISTS idx_entrega_comprovantes_status ON public.entrega_comprovantes(status);
CREATE INDEX IF NOT EXISTS idx_entrega_comprovantes_numero_formulario ON public.entrega_comprovantes(numero_formulario);
CREATE INDEX IF NOT EXISTS idx_entrega_comprovantes_validation_token ON public.entrega_comprovantes(validation_token);
CREATE INDEX IF NOT EXISTS idx_entrega_comprovantes_validation_hash ON public.entrega_comprovantes(validation_hash);

CREATE TRIGGER trg_entrega_comprovantes_updated_at
  BEFORE UPDATE ON public.entrega_comprovantes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- entrega_ocorrencias ----------
CREATE TABLE IF NOT EXISTS public.entrega_ocorrencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entrega_id uuid NOT NULL REFERENCES public.entregas(id) ON DELETE CASCADE,
  tipo text NOT NULL,
  descricao text NOT NULL,
  gravidade text NOT NULL DEFAULT 'baixa',
  registrado_por uuid REFERENCES auth.users(id),
  registrado_em timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT entrega_ocorrencias_tipo_chk CHECK (tipo IN ('entrega_parcial','produto_recusado','volume_divergente','recebedor_ausente','endereco_incorreto','produto_avariado','atraso','observacao','ressalva_recebimento','outro')),
  CONSTRAINT entrega_ocorrencias_gravidade_chk CHECK (gravidade IN ('baixa','media','alta','critica'))
);

GRANT SELECT, INSERT ON public.entrega_ocorrencias TO authenticated;
GRANT ALL ON public.entrega_ocorrencias TO service_role;
ALTER TABLE public.entrega_ocorrencias ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_entrega_ocorrencias_entrega_id ON public.entrega_ocorrencias(entrega_id);
CREATE INDEX IF NOT EXISTS idx_entrega_ocorrencias_tipo ON public.entrega_ocorrencias(tipo);

-- ---------- entrega_checklist ----------
CREATE TABLE IF NOT EXISTS public.entrega_checklist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entrega_id uuid NOT NULL REFERENCES public.entregas(id) ON DELETE CASCADE,
  item text NOT NULL,
  concluido boolean NOT NULL DEFAULT false,
  obrigatorio boolean NOT NULL DEFAULT true,
  observacao text,
  concluido_por uuid REFERENCES auth.users(id),
  concluido_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.entrega_checklist TO authenticated;
GRANT ALL ON public.entrega_checklist TO service_role;
ALTER TABLE public.entrega_checklist ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_entrega_checklist_entrega_id ON public.entrega_checklist(entrega_id);

-- ---------- ALTER entregas ----------
ALTER TABLE public.entregas
  ADD COLUMN IF NOT EXISTS comprovante_status text NOT NULL DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS comprovante_id uuid REFERENCES public.entrega_comprovantes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS recebedor_nome text,
  ADD COLUMN IF NOT EXISTS recebedor_documento text,
  ADD COLUMN IF NOT EXISTS recebedor_cargo text,
  ADD COLUMN IF NOT EXISTS recebedor_telefone text,
  ADD COLUMN IF NOT EXISTS assinatura_obrigatoria boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS assinatura_tipo text,
  ADD COLUMN IF NOT EXISTS formulario_gerado_em timestamptz,
  ADD COLUMN IF NOT EXISTS formulario_gerado_por uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS comprovante_anexado_em timestamptz,
  ADD COLUMN IF NOT EXISTS comprovante_anexado_por uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS assinatura_digital_capturada_em timestamptz,
  ADD COLUMN IF NOT EXISTS assinatura_digital_capturada_por uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS recebimento_confirmado_em timestamptz,
  ADD COLUMN IF NOT EXISTS recebimento_confirmado_por uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS validation_token uuid,
  ADD COLUMN IF NOT EXISTS validation_hash text;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'entregas_comprovante_status_chk'
  ) THEN
    ALTER TABLE public.entregas ADD CONSTRAINT entregas_comprovante_status_chk
      CHECK (comprovante_status IN ('pendente','formulario_gerado','aguardando_assinatura','assinatura_digital_coletada','anexado','confirmado','dispensado','rejeitado'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_entregas_comprovante_status ON public.entregas(comprovante_status);
CREATE INDEX IF NOT EXISTS idx_entregas_validation_token ON public.entregas(validation_token);

-- ---------- Helper: is_delivery_staff ----------
CREATE OR REPLACE FUNCTION public.is_delivery_staff(_uid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.has_role(_uid,'administrador'::app_role)
      OR public.has_role(_uid,'gestor'::app_role)
      OR public.has_role(_uid,'administrativo'::app_role)
      OR public.has_role(_uid,'producao'::app_role)
      OR public.has_role(_uid,'operador_onfarm'::app_role)
      OR public.has_role(_uid,'aplicador'::app_role);
$$;

-- ---------- RLS Policies ----------
-- entrega_comprovantes
DROP POLICY IF EXISTS "Staff manage entrega_comprovantes" ON public.entrega_comprovantes;
CREATE POLICY "Staff manage entrega_comprovantes" ON public.entrega_comprovantes
  FOR ALL TO authenticated
  USING (public.is_delivery_staff(auth.uid()))
  WITH CHECK (public.is_delivery_staff(auth.uid()));

DROP POLICY IF EXISTS "Financeiro read entrega_comprovantes" ON public.entrega_comprovantes;
CREATE POLICY "Financeiro read entrega_comprovantes" ON public.entrega_comprovantes
  FOR SELECT TO authenticated
  USING (public.is_financial_staff(auth.uid()));

DROP POLICY IF EXISTS "Cliente read own entrega_comprovantes" ON public.entrega_comprovantes;
CREATE POLICY "Cliente read own entrega_comprovantes" ON public.entrega_comprovantes
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.entregas e
    WHERE e.id = entrega_comprovantes.entrega_id
      AND e.cliente_id = ANY (public.get_cliente_ids_for_user(auth.uid()))
  ));

DROP POLICY IF EXISTS "Consultor read linked entrega_comprovantes" ON public.entrega_comprovantes;
CREATE POLICY "Consultor read linked entrega_comprovantes" ON public.entrega_comprovantes
  FOR SELECT TO authenticated
  USING (
    (public.has_role(auth.uid(),'consultor_tecnico'::app_role)
     OR public.has_role(auth.uid(),'tecnico_agronomo'::app_role))
    AND EXISTS (
      SELECT 1 FROM public.entregas e
      WHERE e.id = entrega_comprovantes.entrega_id
        AND e.cliente_id = ANY (public.get_cliente_ids_for_user(auth.uid()))
    )
  );

-- entrega_ocorrencias
DROP POLICY IF EXISTS "Staff manage entrega_ocorrencias" ON public.entrega_ocorrencias;
CREATE POLICY "Staff manage entrega_ocorrencias" ON public.entrega_ocorrencias
  FOR ALL TO authenticated
  USING (public.is_delivery_staff(auth.uid()))
  WITH CHECK (public.is_delivery_staff(auth.uid()));

DROP POLICY IF EXISTS "Financeiro read entrega_ocorrencias" ON public.entrega_ocorrencias;
CREATE POLICY "Financeiro read entrega_ocorrencias" ON public.entrega_ocorrencias
  FOR SELECT TO authenticated USING (public.is_financial_staff(auth.uid()));

DROP POLICY IF EXISTS "Cliente read own entrega_ocorrencias" ON public.entrega_ocorrencias;
CREATE POLICY "Cliente read own entrega_ocorrencias" ON public.entrega_ocorrencias
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.entregas e
    WHERE e.id = entrega_ocorrencias.entrega_id
      AND e.cliente_id = ANY (public.get_cliente_ids_for_user(auth.uid()))
  ));

-- entrega_checklist
DROP POLICY IF EXISTS "Staff manage entrega_checklist" ON public.entrega_checklist;
CREATE POLICY "Staff manage entrega_checklist" ON public.entrega_checklist
  FOR ALL TO authenticated
  USING (public.is_delivery_staff(auth.uid()))
  WITH CHECK (public.is_delivery_staff(auth.uid()));

DROP POLICY IF EXISTS "Cliente read own entrega_checklist" ON public.entrega_checklist;
CREATE POLICY "Cliente read own entrega_checklist" ON public.entrega_checklist
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.entregas e
    WHERE e.id = entrega_checklist.entrega_id
      AND e.cliente_id = ANY (public.get_cliente_ids_for_user(auth.uid()))
  ));

-- ---------- Storage policies (bucket entrega-documentos) ----------
DROP POLICY IF EXISTS "Staff manage entrega-documentos files" ON storage.objects;
CREATE POLICY "Staff manage entrega-documentos files" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'entrega-documentos' AND public.is_delivery_staff(auth.uid()))
  WITH CHECK (bucket_id = 'entrega-documentos' AND public.is_delivery_staff(auth.uid()));

DROP POLICY IF EXISTS "Financeiro read entrega-documentos files" ON storage.objects;
CREATE POLICY "Financeiro read entrega-documentos files" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'entrega-documentos' AND public.is_financial_staff(auth.uid()));

DROP POLICY IF EXISTS "Cliente read own entrega-documentos files" ON storage.objects;
CREATE POLICY "Cliente read own entrega-documentos files" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'entrega-documentos'
    AND EXISTS (
      SELECT 1 FROM public.entregas e
      WHERE e.cliente_id = ANY (public.get_cliente_ids_for_user(auth.uid()))
        AND position(('entregas/' || e.id::text || '/') in storage.objects.name) = 1
    )
  );

-- =========================================================
-- RPCs
-- =========================================================

-- Helper: insert checklist defaults
CREATE OR REPLACE FUNCTION public._entrega_seed_checklist(_entrega_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.entrega_checklist WHERE entrega_id = _entrega_id) THEN
    INSERT INTO public.entrega_checklist (entrega_id, item, obrigatorio) VALUES
      (_entrega_id, 'Conferir cliente e fazenda', true),
      (_entrega_id, 'Conferir produtos', true),
      (_entrega_id, 'Conferir lotes', true),
      (_entrega_id, 'Conferir volumes', true),
      (_entrega_id, 'Conferir validade', true),
      (_entrega_id, 'Conferir formulário impresso ou digital', true),
      (_entrega_id, 'Coletar assinatura do recebedor', true),
      (_entrega_id, 'Registrar ressalvas, se houver', false),
      (_entrega_id, 'Anexar comprovante assinado ou finalizar assinatura digital', true);
  END IF;
END $$;

-- ---------- rpc_gerar_formulario_entrega ----------
CREATE OR REPLACE FUNCTION public.rpc_gerar_formulario_entrega(p_entrega_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
  v_hash := encode(digest(p_entrega_id::text || v_num || v_token::text || now()::text, 'sha256'), 'hex');

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
END $$;
GRANT EXECUTE ON FUNCTION public.rpc_gerar_formulario_entrega(uuid) TO authenticated;

-- ---------- rpc_anexar_comprovante_entrega ----------
CREATE OR REPLACE FUNCTION public.rpc_anexar_comprovante_entrega(p_entrega_id uuid, p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_entrega public.entregas%ROWTYPE;
  v_comp_id uuid;
  v_rec_nome text := nullif(trim(coalesce(p_payload->>'recebedor_nome','')), '');
  v_hash text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Sessão inválida'; END IF;
  IF NOT public.is_delivery_staff(v_uid) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  SELECT * INTO v_entrega FROM public.entregas WHERE id = p_entrega_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Entrega não encontrada'; END IF;
  IF v_entrega.status = 'cancelada' THEN RAISE EXCEPTION 'Entrega cancelada'; END IF;
  IF v_entrega.assinatura_obrigatoria AND v_rec_nome IS NULL THEN
    RAISE EXCEPTION 'recebedor_nome é obrigatório';
  END IF;
  IF coalesce(p_payload->>'arquivo_path','') = '' THEN
    RAISE EXCEPTION 'arquivo_path é obrigatório';
  END IF;

  v_comp_id := v_entrega.comprovante_id;
  IF v_comp_id IS NULL THEN
    PERFORM public.rpc_gerar_formulario_entrega(p_entrega_id);
    SELECT comprovante_id INTO v_comp_id FROM public.entregas WHERE id = p_entrega_id;
  END IF;

  UPDATE public.entrega_comprovantes SET
    status = 'anexado',
    arquivo_path = p_payload->>'arquivo_path',
    arquivo_url = p_payload->>'arquivo_url',
    arquivo_nome = p_payload->>'arquivo_nome',
    arquivo_mime = p_payload->>'arquivo_mime',
    assinatura_coletada = true,
    assinatura_tipo = 'fisica_anexada',
    recebedor_nome = v_rec_nome,
    recebedor_documento = nullif(p_payload->>'recebedor_documento',''),
    recebedor_cargo = nullif(p_payload->>'recebedor_cargo',''),
    recebedor_telefone = nullif(p_payload->>'recebedor_telefone',''),
    data_assinatura = coalesce((p_payload->>'data_assinatura')::timestamptz, now()),
    anexado_por = v_uid,
    anexado_em = now(),
    updated_at = now()
  WHERE id = v_comp_id
  RETURNING validation_hash INTO v_hash;

  UPDATE public.entregas SET
    comprovante_status = 'anexado',
    assinatura_tipo = 'fisica_anexada',
    recebedor_nome = coalesce(v_rec_nome, recebedor_nome),
    recebedor_documento = coalesce(nullif(p_payload->>'recebedor_documento',''), recebedor_documento),
    recebedor_cargo = coalesce(nullif(p_payload->>'recebedor_cargo',''), recebedor_cargo),
    recebedor_telefone = coalesce(nullif(p_payload->>'recebedor_telefone',''), recebedor_telefone),
    comprovante_anexado_em = now(),
    comprovante_anexado_por = v_uid,
    updated_at = now()
  WHERE id = p_entrega_id;

  INSERT INTO public.financial_audit_log (entity_type, entity_id, action, new_data, performed_by)
  VALUES ('entrega', p_entrega_id, 'DELIVERY_PROOF_ATTACHED',
          jsonb_build_object('comprovante_id', v_comp_id, 'arquivo_path', p_payload->>'arquivo_path'), v_uid);

  RETURN jsonb_build_object('success', true, 'comprovante_id', v_comp_id, 'validation_hash', v_hash);
END $$;
GRANT EXECUTE ON FUNCTION public.rpc_anexar_comprovante_entrega(uuid, jsonb) TO authenticated;

-- ---------- rpc_coletar_assinatura_digital_entrega ----------
CREATE OR REPLACE FUNCTION public.rpc_coletar_assinatura_digital_entrega(p_entrega_id uuid, p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
    validation_hash = encode(digest(p_entrega_id::text || v_hash || now()::text, 'sha256'), 'hex'),
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
END $$;
GRANT EXECUTE ON FUNCTION public.rpc_coletar_assinatura_digital_entrega(uuid, jsonb) TO authenticated;

-- ---------- rpc_confirmar_recebimento_entrega ----------
CREATE OR REPLACE FUNCTION public.rpc_confirmar_recebimento_entrega(p_entrega_id uuid, p_payload jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
    validation_hash = encode(digest(p_entrega_id::text || coalesce(validation_hash,'') || 'CONF' || now()::text, 'sha256'),'hex'),
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
END $$;
GRANT EXECUTE ON FUNCTION public.rpc_confirmar_recebimento_entrega(uuid, jsonb) TO authenticated;

-- ---------- rpc_dispensar_assinatura_entrega ----------
CREATE OR REPLACE FUNCTION public.rpc_dispensar_assinatura_entrega(p_entrega_id uuid, p_motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
    validation_hash = encode(digest(p_entrega_id::text || 'DISP' || now()::text,'sha256'),'hex'),
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
END $$;
GRANT EXECUTE ON FUNCTION public.rpc_dispensar_assinatura_entrega(uuid, text) TO authenticated;

-- ---------- rpc_registrar_ocorrencia_entrega ----------
CREATE OR REPLACE FUNCTION public.rpc_registrar_ocorrencia_entrega(p_entrega_id uuid, p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Sessão inválida'; END IF;
  IF NOT public.is_delivery_staff(v_uid) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.entregas WHERE id = p_entrega_id) THEN
    RAISE EXCEPTION 'Entrega não encontrada';
  END IF;

  INSERT INTO public.entrega_ocorrencias (entrega_id, tipo, descricao, gravidade, registrado_por, metadata)
  VALUES (
    p_entrega_id,
    coalesce(p_payload->>'tipo','observacao'),
    coalesce(p_payload->>'descricao',''),
    coalesce(p_payload->>'gravidade','baixa'),
    v_uid,
    coalesce(p_payload->'metadata','{}'::jsonb)
  ) RETURNING id INTO v_id;

  INSERT INTO public.financial_audit_log (entity_type, entity_id, action, new_data, performed_by)
  VALUES ('entrega', p_entrega_id, 'DELIVERY_OCCURRENCE_REGISTERED',
          jsonb_build_object('ocorrencia_id', v_id, 'tipo', p_payload->>'tipo'), v_uid);

  RETURN jsonb_build_object('success', true, 'id', v_id);
END $$;
GRANT EXECUTE ON FUNCTION public.rpc_registrar_ocorrencia_entrega(uuid, jsonb) TO authenticated;

-- ---------- rpc_atualizar_checklist_entrega ----------
CREATE OR REPLACE FUNCTION public.rpc_atualizar_checklist_entrega(p_checklist_id uuid, p_concluido boolean, p_observacao text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_entrega_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Sessão inválida'; END IF;
  IF NOT public.is_delivery_staff(v_uid) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  SELECT entrega_id INTO v_entrega_id FROM public.entrega_checklist WHERE id = p_checklist_id;
  IF v_entrega_id IS NULL THEN RAISE EXCEPTION 'Checklist não encontrado'; END IF;

  UPDATE public.entrega_checklist SET
    concluido = p_concluido,
    observacao = coalesce(p_observacao, observacao),
    concluido_por = CASE WHEN p_concluido THEN v_uid ELSE NULL END,
    concluido_em = CASE WHEN p_concluido THEN now() ELSE NULL END
  WHERE id = p_checklist_id;

  INSERT INTO public.financial_audit_log (entity_type, entity_id, action, new_data, performed_by)
  VALUES ('entrega', v_entrega_id, 'DELIVERY_CHECKLIST_UPDATED',
          jsonb_build_object('checklist_id', p_checklist_id, 'concluido', p_concluido), v_uid);

  RETURN jsonb_build_object('success', true);
END $$;
GRANT EXECUTE ON FUNCTION public.rpc_atualizar_checklist_entrega(uuid, boolean, text) TO authenticated;

-- ---------- rpc_validar_comprovante_entrega (PUBLIC) ----------
CREATE OR REPLACE FUNCTION public.rpc_validar_comprovante_entrega(p_validation_token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_comp public.entrega_comprovantes%ROWTYPE;
BEGIN
  SELECT * INTO v_comp FROM public.entrega_comprovantes WHERE validation_token = p_validation_token;
  IF NOT FOUND OR NOT v_comp.validation_public_enabled THEN
    RETURN jsonb_build_object('valido', false, 'mensagem', 'Comprovante não encontrado ou indisponível.');
  END IF;
  IF v_comp.validation_expires_at IS NOT NULL AND v_comp.validation_expires_at < now() THEN
    RETURN jsonb_build_object('valido', false, 'mensagem', 'Comprovante expirado.');
  END IF;
  IF v_comp.status IN ('cancelado','rejeitado') THEN
    RETURN jsonb_build_object('valido', false, 'mensagem', 'Comprovante cancelado.');
  END IF;
  RETURN jsonb_build_object(
    'valido', true,
    'status', v_comp.status,
    'numero_formulario', v_comp.numero_formulario,
    'data_confirmacao', v_comp.confirmado_em,
    'data_assinatura', v_comp.data_assinatura,
    'validation_hash', v_comp.validation_hash,
    'mensagem', 'Comprovante de entrega registrado no sistema AR Bio.'
  );
END $$;
REVOKE ALL ON FUNCTION public.rpc_validar_comprovante_entrega(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_validar_comprovante_entrega(uuid) TO anon, authenticated;
