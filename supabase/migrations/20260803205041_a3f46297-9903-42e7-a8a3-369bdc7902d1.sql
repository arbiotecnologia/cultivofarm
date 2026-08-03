
-- ============================================================
-- FASE FINAL — Termo de entrega canônico + conferência por item
-- Ambiente: staging ikaauvsflpmamgxmkhoq
-- ============================================================

DO $g$
DECLARE v text;
BEGIN
  SELECT project_ref INTO v FROM public._fiscal_staging_marker WHERE marker = 'STAGING' LIMIT 1;
  IF v IS DISTINCT FROM 'ikaauvsflpmamgxmkhoq' THEN
    RAISE EXCEPTION 'GUARD: somente staging ikaauvsflpmamgxmkhoq';
  END IF;
END $g$;

-- ------------------------------------------------------------
-- 1) Termo versionado e imutável
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.entrega_termos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entrega_id uuid NOT NULL REFERENCES public.entregas(id) ON DELETE CASCADE,
  comprovante_id uuid REFERENCES public.entrega_comprovantes(id) ON DELETE SET NULL,
  versao integer NOT NULL,
  template_versao text NOT NULL DEFAULT 'termo-entrega-v1',
  status text NOT NULL DEFAULT 'rascunho'
    CHECK (status IN ('rascunho','assinado','cancelado','substituido')),
  snapshot jsonb NOT NULL,
  snapshot_hash text NOT NULL,
  cobertura text NOT NULL DEFAULT 'pendente'
    CHECK (cobertura IN ('integral','parcial','pendente')),
  recebedor_nome text,
  recebedor_documento text,
  recebedor_cargo text,
  recebedor_telefone text,
  assinatura_hash text,
  assinatura_tipo text CHECK (assinatura_tipo IN ('digital_tela','fisica_anexada','dispensada')),
  assinado_em timestamptz,
  assinado_por uuid,
  assinatura_origem text,
  idempotency_key text,
  request_fingerprint text,
  pdf_path text,
  pdf_hash text,
  pdf_gerado_em timestamptz,
  cancelado_em timestamptz,
  cancelado_por uuid,
  motivo_cancelamento text,
  substitui_termo_id uuid REFERENCES public.entrega_termos(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT entrega_termos_versao_uk UNIQUE (entrega_id, versao)
);

-- No máximo um termo vivo (rascunho ou assinado) por entrega
CREATE UNIQUE INDEX IF NOT EXISTS entrega_termos_um_vivo_uk
  ON public.entrega_termos (entrega_id)
  WHERE status IN ('rascunho','assinado');

-- Idempotência de assinatura
CREATE UNIQUE INDEX IF NOT EXISTS entrega_termos_idem_uk
  ON public.entrega_termos (entrega_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS entrega_termos_entrega_idx ON public.entrega_termos (entrega_id, versao DESC);

GRANT SELECT ON public.entrega_termos TO authenticated;
GRANT ALL ON public.entrega_termos TO service_role;
ALTER TABLE public.entrega_termos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS entrega_termos_select ON public.entrega_termos;
CREATE POLICY entrega_termos_select ON public.entrega_termos
FOR SELECT TO authenticated
USING (
  public.is_delivery_staff(auth.uid())
  OR public.is_financial_staff(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.entregas e
    WHERE e.id = entrega_termos.entrega_id
      AND e.cliente_id = ANY (public.get_cliente_ids_for_user(auth.uid()))
  )
);
-- Escrita exclusivamente por RPC SECURITY DEFINER (deny-by-default: sem policies de write)

-- ------------------------------------------------------------
-- 2) Conferência por item / embalagem
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.entrega_conferencia_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entrega_id uuid NOT NULL REFERENCES public.entregas(id) ON DELETE CASCADE,
  etiqueta_id uuid REFERENCES public.produto_etiquetas(id) ON DELETE RESTRICT,
  embalagem_id uuid REFERENCES public.estoque_embalagens(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('aceito','recusado','pendente')),
  quantidade numeric NOT NULL DEFAULT 1 CHECK (quantidade > 0),
  motivo text,
  conferido_em timestamptz,
  conferido_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT entrega_conf_motivo_ck CHECK (status <> 'recusado' OR length(coalesce(motivo,'')) >= 5)
);

CREATE UNIQUE INDEX IF NOT EXISTS entrega_conf_etiqueta_uk
  ON public.entrega_conferencia_itens (entrega_id, etiqueta_id) WHERE etiqueta_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS entrega_conf_embalagem_uk
  ON public.entrega_conferencia_itens (entrega_id, embalagem_id) WHERE embalagem_id IS NOT NULL;

GRANT SELECT ON public.entrega_conferencia_itens TO authenticated;
GRANT ALL ON public.entrega_conferencia_itens TO service_role;
ALTER TABLE public.entrega_conferencia_itens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS entrega_conf_select ON public.entrega_conferencia_itens;
CREATE POLICY entrega_conf_select ON public.entrega_conferencia_itens
FOR SELECT TO authenticated
USING (
  public.is_delivery_staff(auth.uid())
  OR public.is_financial_staff(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.entregas e
    WHERE e.id = entrega_conferencia_itens.entrega_id
      AND e.cliente_id = ANY (public.get_cliente_ids_for_user(auth.uid()))
  )
);

-- ------------------------------------------------------------
-- 3) Imutabilidade pós-assinatura
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_entrega_termos_immutability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'rascunho' THEN
      RAISE EXCEPTION 'termo_imutavel: documento % nao pode ser excluido', OLD.id
        USING ERRCODE = 'raise_exception';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status IN ('assinado','cancelado','substituido') THEN
    IF NEW.snapshot IS DISTINCT FROM OLD.snapshot
       OR NEW.snapshot_hash IS DISTINCT FROM OLD.snapshot_hash
       OR NEW.versao IS DISTINCT FROM OLD.versao
       OR NEW.template_versao IS DISTINCT FROM OLD.template_versao
       OR NEW.entrega_id IS DISTINCT FROM OLD.entrega_id
       OR NEW.recebedor_nome IS DISTINCT FROM OLD.recebedor_nome
       OR NEW.recebedor_documento IS DISTINCT FROM OLD.recebedor_documento
       OR NEW.assinatura_hash IS DISTINCT FROM OLD.assinatura_hash
       OR NEW.assinado_em IS DISTINCT FROM OLD.assinado_em
       OR NEW.assinado_por IS DISTINCT FROM OLD.assinado_por
       OR NEW.cobertura IS DISTINCT FROM OLD.cobertura THEN
      RAISE EXCEPTION 'termo_imutavel: documento assinado nao pode ser alterado'
        USING ERRCODE = 'raise_exception';
    END IF;
    -- PDF só pode ser gravado uma vez por versão
    IF OLD.pdf_path IS NOT NULL AND NEW.pdf_path IS DISTINCT FROM OLD.pdf_path THEN
      RAISE EXCEPTION 'termo_pdf_imutavel: ja existe PDF ativo para esta versao'
        USING ERRCODE = 'raise_exception';
    END IF;
    IF OLD.status <> 'assinado' AND NEW.status <> OLD.status THEN
      RAISE EXCEPTION 'termo_estado_terminal: transicao % -> % proibida', OLD.status, NEW.status
        USING ERRCODE = 'raise_exception';
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_entrega_termos_immutability ON public.entrega_termos;
CREATE TRIGGER trg_entrega_termos_immutability
BEFORE UPDATE OR DELETE ON public.entrega_termos
FOR EACH ROW EXECUTE FUNCTION public.tg_entrega_termos_immutability();

CREATE OR REPLACE FUNCTION public.tg_entrega_conf_lock_after_sign()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE v_eid uuid := coalesce(NEW.entrega_id, OLD.entrega_id);
BEGIN
  IF EXISTS (SELECT 1 FROM public.entrega_termos t
             WHERE t.entrega_id = v_eid AND t.status = 'assinado') THEN
    RAISE EXCEPTION 'conferencia_bloqueada: existe termo assinado para esta entrega'
      USING ERRCODE = 'raise_exception';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_entrega_conf_lock ON public.entrega_conferencia_itens;
CREATE TRIGGER trg_entrega_conf_lock
BEFORE INSERT OR UPDATE OR DELETE ON public.entrega_conferencia_itens
FOR EACH ROW EXECUTE FUNCTION public.tg_entrega_conf_lock_after_sign();

-- ------------------------------------------------------------
-- 4) Snapshot canônico
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_entrega_build_snapshot_v1(p_entrega_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v jsonb;
BEGIN
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'template_versao', 'termo-entrega-v1',
    'gerado_em', now(),
    'entrega', to_jsonb(e),
    'cliente', (SELECT to_jsonb(c) FROM public.clientes c WHERE c.id = e.cliente_id),
    'ordem_servico', (SELECT to_jsonb(o) FROM public.ordens_servico o WHERE o.id = e.ordem_servico_id),
    'ordem_servico_onfarm', (SELECT to_jsonb(o) FROM public.ordens_servico_onfarm o WHERE o.id = e.ordem_servico_onfarm_id),
    'pedido_b2b', (SELECT to_jsonb(po) FROM public.partner_orders po WHERE po.id = e.partner_order_id),
    'comprovante', (SELECT to_jsonb(cp) FROM public.entrega_comprovantes cp WHERE cp.id = e.comprovante_id),
    'entregador', jsonb_build_object(
      'motorista', e.motorista, 'documento', e.motorista_documento,
      'telefone', e.motorista_telefone, 'veiculo', e.veiculo,
      'placa', e.veiculo_placa, 'tipo', e.veiculo_tipo),
    'destino', jsonb_build_object(
      'destinatario', e.destinatario_nome, 'telefone', e.destinatario_telefone,
      'logradouro', e.endereco_logradouro, 'numero', e.endereco_numero,
      'complemento', e.endereco_complemento, 'bairro', e.endereco_bairro,
      'cidade', e.endereco_cidade, 'uf', e.endereco_uf, 'cep', e.endereco_cep,
      'referencia', e.endereco_referencia, 'origem', e.endereco_origem),
    'recebedor', jsonb_build_object(
      'nome', e.recebedor_nome, 'documento', e.recebedor_documento,
      'cargo', e.recebedor_cargo, 'telefone', e.recebedor_telefone),
    'itens', coalesce((
      SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'etiqueta', to_jsonb(pe),
        'embalagem', (SELECT to_jsonb(eb) FROM public.estoque_embalagens eb WHERE eb.id = pe.embalagem_id),
        'lote', (SELECT to_jsonb(l) FROM public.lotes l WHERE l.id = pe.lote_id),
        'produto', (SELECT to_jsonb(pr) FROM public.produtos pr WHERE pr.id = pe.produto_id),
        'conferencia', (SELECT to_jsonb(ci) FROM public.entrega_conferencia_itens ci
                        WHERE ci.entrega_id = p_entrega_id AND ci.etiqueta_id = pe.id)
      )) ORDER BY pe.id)
      FROM public.entrega_etiquetas ee
      JOIN public.produto_etiquetas pe ON pe.id = ee.etiqueta_id
      WHERE ee.entrega_id = p_entrega_id AND ee.ativo
    ), '[]'::jsonb),
    'checklist', coalesce((SELECT jsonb_agg(to_jsonb(ck) ORDER BY ck.id)
                           FROM public.entrega_checklist ck WHERE ck.entrega_id = p_entrega_id), '[]'::jsonb),
    'ocorrencias', coalesce((SELECT jsonb_agg(to_jsonb(oc) ORDER BY oc.id)
                             FROM public.entrega_ocorrencias oc WHERE oc.entrega_id = p_entrega_id), '[]'::jsonb),
    'divergencias', coalesce((
      SELECT jsonb_agg(jsonb_build_object('etiqueta_id', ci.etiqueta_id, 'status', ci.status,
                                          'quantidade', ci.quantidade, 'motivo', ci.motivo) ORDER BY ci.id)
      FROM public.entrega_conferencia_itens ci
      WHERE ci.entrega_id = p_entrega_id AND ci.status <> 'aceito'), '[]'::jsonb)
  ))
  INTO v
  FROM public.entregas e
  WHERE e.id = p_entrega_id;

  IF v IS NULL THEN
    RAISE EXCEPTION 'entrega_nao_encontrada' USING ERRCODE = 'raise_exception';
  END IF;
  RETURN v;
END $fn$;

REVOKE ALL ON FUNCTION public.fn_entrega_build_snapshot_v1(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_entrega_build_snapshot_v1(uuid) TO service_role;

-- ------------------------------------------------------------
-- 5) Conferência de itens (aceito / recusado / pendente)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_entrega_registrar_conferencia_v1(
  p_entrega_id uuid,
  p_itens jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_item jsonb;
  v_etq uuid;
  v_status text;
  v_qtd numeric;
  v_motivo text;
  v_emb uuid;
  v_cq boolean;
  v_n integer := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'sessao_invalida'; END IF;
  IF NOT public.is_delivery_staff(v_uid) THEN RAISE EXCEPTION 'sem_permissao'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.entregas WHERE id = p_entrega_id AND status <> 'cancelada') THEN
    RAISE EXCEPTION 'entrega_invalida';
  END IF;
  IF EXISTS (SELECT 1 FROM public.entrega_termos WHERE entrega_id = p_entrega_id AND status = 'assinado') THEN
    RAISE EXCEPTION 'termo_ja_assinado';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('entrega_conf:' || p_entrega_id::text, 0));

  FOR v_item IN SELECT * FROM jsonb_array_elements(coalesce(p_itens, '[]'::jsonb))
  LOOP
    v_etq := nullif(v_item->>'etiqueta_id','')::uuid;
    v_status := coalesce(nullif(v_item->>'status',''), 'pendente');
    v_qtd := coalesce(nullif(v_item->>'quantidade','')::numeric, 1);
    v_motivo := nullif(trim(coalesce(v_item->>'motivo','')), '');

    IF v_etq IS NULL THEN RAISE EXCEPTION 'etiqueta_id_obrigatorio'; END IF;
    IF v_status NOT IN ('aceito','recusado','pendente') THEN
      RAISE EXCEPTION 'status_invalido: %', v_status;
    END IF;

    -- vínculo com a entrega
    IF NOT EXISTS (SELECT 1 FROM public.entrega_etiquetas ee
                   WHERE ee.entrega_id = p_entrega_id AND ee.etiqueta_id = v_etq AND ee.ativo) THEN
      RAISE EXCEPTION 'etiqueta_nao_vinculada_a_entrega';
    END IF;

    SELECT pe.embalagem_id, pe.cq_liberado INTO v_emb, v_cq
    FROM public.produto_etiquetas pe WHERE pe.id = v_etq;

    IF v_status = 'aceito' THEN
      -- etiqueta precisa estar ativa/válida e com CQ liberado
      IF EXISTS (SELECT 1 FROM public.produto_etiquetas pe
                 WHERE pe.id = v_etq
                   AND (pe.status IN ('cancelada','substituida')
                        OR (pe.data_validade IS NOT NULL AND pe.data_validade < current_date))) THEN
        RAISE EXCEPTION 'etiqueta_invalida_ou_vencida';
      END IF;
      IF coalesce(v_cq, false) IS FALSE THEN
        RAISE EXCEPTION 'cq_nao_liberado';
      END IF;
    END IF;

    INSERT INTO public.entrega_conferencia_itens
      (entrega_id, etiqueta_id, embalagem_id, status, quantidade, motivo, conferido_em, conferido_por)
    VALUES (p_entrega_id, v_etq, v_emb, v_status, v_qtd, v_motivo, now(), v_uid)
    ON CONFLICT (entrega_id, etiqueta_id) WHERE etiqueta_id IS NOT NULL
    DO UPDATE SET status = EXCLUDED.status,
                  quantidade = EXCLUDED.quantidade,
                  motivo = EXCLUDED.motivo,
                  embalagem_id = EXCLUDED.embalagem_id,
                  conferido_em = now(),
                  conferido_por = v_uid;
    v_n := v_n + 1;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'itens', v_n,
    'cobertura', public.fn_entrega_cobertura_v1(p_entrega_id));
END $fn$;

CREATE OR REPLACE FUNCTION public.fn_entrega_cobertura_v1(p_entrega_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT CASE
    WHEN (SELECT count(*) FROM public.entrega_etiquetas ee
          WHERE ee.entrega_id = p_entrega_id AND ee.ativo) = 0 THEN 'pendente'
    WHEN EXISTS (SELECT 1 FROM public.entrega_etiquetas ee
                 LEFT JOIN public.entrega_conferencia_itens ci
                   ON ci.entrega_id = ee.entrega_id AND ci.etiqueta_id = ee.etiqueta_id
                 WHERE ee.entrega_id = p_entrega_id AND ee.ativo
                   AND coalesce(ci.status,'pendente') = 'pendente') THEN 'pendente'
    WHEN EXISTS (SELECT 1 FROM public.entrega_conferencia_itens ci
                 WHERE ci.entrega_id = p_entrega_id AND ci.status = 'recusado') THEN 'parcial'
    ELSE 'integral'
  END
$fn$;

REVOKE ALL ON FUNCTION public.fn_entrega_cobertura_v1(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_entrega_cobertura_v1(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.rpc_entrega_registrar_conferencia_v1(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_entrega_registrar_conferencia_v1(uuid, jsonb) TO authenticated, service_role;

-- ------------------------------------------------------------
-- 6) Geração do termo (rascunho versionado)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_entrega_gerar_termo_v1(
  p_entrega_id uuid,
  p_template_versao text DEFAULT 'termo-entrega-v1'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
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
  v_hash := encode(digest(p_template_versao || '|' || v_snap::text, 'sha256'), 'hex');

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
END $fn$;

REVOKE ALL ON FUNCTION public.rpc_entrega_gerar_termo_v1(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_entrega_gerar_termo_v1(uuid, text) TO authenticated, service_role;

-- ------------------------------------------------------------
-- 7) Assinatura idempotente
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_entrega_assinar_termo_v1(
  p_termo_id uuid,
  p_payload jsonb,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
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

  v_fp := encode(digest(
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
END $fn$;

REVOKE ALL ON FUNCTION public.rpc_entrega_assinar_termo_v1(uuid, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_entrega_assinar_termo_v1(uuid, jsonb, text) TO authenticated, service_role;

-- ------------------------------------------------------------
-- 8) Registro idempotente do PDF (somente backend/service_role)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_entrega_registrar_pdf_termo_v1(
  p_termo_id uuid,
  p_pdf_path text,
  p_pdf_hash text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE v_t public.entrega_termos%ROWTYPE;
BEGIN
  SELECT * INTO v_t FROM public.entrega_termos WHERE id = p_termo_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'termo_nao_encontrado'; END IF;
  IF v_t.status <> 'assinado' THEN RAISE EXCEPTION 'termo_nao_assinado'; END IF;
  IF coalesce(trim(p_pdf_path),'') = '' OR coalesce(trim(p_pdf_hash),'') = '' THEN
    RAISE EXCEPTION 'pdf_path_e_hash_obrigatorios';
  END IF;

  IF v_t.pdf_path IS NOT NULL THEN
    IF v_t.pdf_path = p_pdf_path AND v_t.pdf_hash = p_pdf_hash THEN
      RETURN jsonb_build_object('success', true, 'replay', true, 'pdf_path', v_t.pdf_path);
    END IF;
    RAISE EXCEPTION 'pdf_ja_registrado';
  END IF;

  UPDATE public.entrega_termos
     SET pdf_path = p_pdf_path, pdf_hash = p_pdf_hash, pdf_gerado_em = now()
   WHERE id = p_termo_id;

  RETURN jsonb_build_object('success', true, 'replay', false, 'pdf_path', p_pdf_path);
END $fn$;

REVOKE ALL ON FUNCTION public.rpc_entrega_registrar_pdf_termo_v1(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_entrega_registrar_pdf_termo_v1(uuid, text, text) TO service_role;

-- ------------------------------------------------------------
-- 9) Cancelamento / substituição formal
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_entrega_cancelar_termo_v1(
  p_termo_id uuid,
  p_motivo text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_t public.entrega_termos%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'sessao_invalida'; END IF;
  IF NOT (public.has_role(v_uid,'administrador'::public.app_role)
          OR public.has_role(v_uid,'gestor'::public.app_role)
          OR public.has_role(v_uid,'administrativo'::public.app_role)) THEN
    RAISE EXCEPTION 'sem_permissao';
  END IF;
  IF length(coalesce(trim(p_motivo),'')) < 5 THEN RAISE EXCEPTION 'motivo_obrigatorio'; END IF;

  SELECT * INTO v_t FROM public.entrega_termos WHERE id = p_termo_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'termo_nao_encontrado'; END IF;
  IF v_t.status NOT IN ('rascunho','assinado') THEN RAISE EXCEPTION 'termo_estado_invalido: %', v_t.status; END IF;

  UPDATE public.entrega_termos
     SET status = 'cancelado', cancelado_em = now(), cancelado_por = v_uid,
         motivo_cancelamento = trim(p_motivo)
   WHERE id = p_termo_id;

  INSERT INTO public.financial_audit_log (entity_type, entity_id, action, new_data, performed_by)
  VALUES ('entrega', v_t.entrega_id, 'DELIVERY_TERM_CANCELLED',
          jsonb_build_object('termo_id', p_termo_id, 'versao', v_t.versao, 'motivo', trim(p_motivo)), v_uid);

  RETURN jsonb_build_object('success', true, 'termo_id', p_termo_id, 'status', 'cancelado');
END $fn$;

REVOKE ALL ON FUNCTION public.rpc_entrega_cancelar_termo_v1(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_entrega_cancelar_termo_v1(uuid, text) TO authenticated, service_role;
