
-- =====================================================================
-- Ciclo 5 · §2 Motor transacional de reconciliação da entrega
-- Ambiente: staging ikaauvsflpmamgxmkhoq
-- =====================================================================

-- 1) Tabela de reconciliação -----------------------------------------
CREATE TABLE IF NOT EXISTS public.entrega_reconciliacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entrega_id uuid NOT NULL REFERENCES public.entregas(id) ON DELETE RESTRICT,
  termo_id uuid REFERENCES public.entrega_termos(id) ON DELETE RESTRICT,
  termo_versao integer,
  status text NOT NULL DEFAULT 'reconciliada',
  itens_total integer NOT NULL DEFAULT 0,
  itens_aceitos integer NOT NULL DEFAULT 0,
  itens_recusados integer NOT NULL DEFAULT 0,
  quantidade_aceita numeric(14,3) NOT NULL DEFAULT 0,
  quantidade_recusada numeric(14,3) NOT NULL DEFAULT 0,
  volume_aceito numeric(14,3) NOT NULL DEFAULT 0,
  volume_recusado numeric(14,3) NOT NULL DEFAULT 0,
  ratio_aceito numeric(6,5) NOT NULL DEFAULT 0,
  faturavel boolean NOT NULL DEFAULT false,
  valor_faturavel_max numeric(14,2),
  resumo jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text,
  request_fingerprint text,
  reconciliado_em timestamptz NOT NULL DEFAULT now(),
  reconciliado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT entrega_reconc_status_chk CHECK (status IN ('reconciliada','cancelada')),
  CONSTRAINT entrega_reconc_ratio_chk CHECK (ratio_aceito >= 0 AND ratio_aceito <= 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS entrega_reconc_uq_ativa
  ON public.entrega_reconciliacoes (entrega_id)
  WHERE status = 'reconciliada';

CREATE INDEX IF NOT EXISTS entrega_reconc_termo_idx
  ON public.entrega_reconciliacoes (termo_id);

GRANT SELECT ON public.entrega_reconciliacoes TO authenticated;
GRANT ALL ON public.entrega_reconciliacoes TO service_role;

ALTER TABLE public.entrega_reconciliacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS entrega_reconc_select ON public.entrega_reconciliacoes;
CREATE POLICY entrega_reconc_select ON public.entrega_reconciliacoes
  FOR SELECT TO authenticated
  USING (public.is_delivery_staff(auth.uid()) OR public.is_financial_staff(auth.uid()));

-- Sem policies de INSERT/UPDATE/DELETE: escrita exclusiva via SECURITY DEFINER.

-- Imutabilidade: nenhuma linha pode ser alterada/removida fora das RPCs.
CREATE OR REPLACE FUNCTION public.tg_entrega_reconc_immutability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'entrega_reconciliacao_imutavel: delete proibido';
  END IF;
  IF NEW.entrega_id IS DISTINCT FROM OLD.entrega_id
     OR NEW.termo_id IS DISTINCT FROM OLD.termo_id
     OR NEW.itens_aceitos IS DISTINCT FROM OLD.itens_aceitos
     OR NEW.itens_recusados IS DISTINCT FROM OLD.itens_recusados
     OR NEW.quantidade_aceita IS DISTINCT FROM OLD.quantidade_aceita
     OR NEW.resumo IS DISTINCT FROM OLD.resumo
     OR NEW.request_fingerprint IS DISTINCT FROM OLD.request_fingerprint THEN
    RAISE EXCEPTION 'entrega_reconciliacao_imutavel: campos congelados';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_entrega_reconc_immutability ON public.entrega_reconciliacoes;
CREATE TRIGGER trg_entrega_reconc_immutability
  BEFORE UPDATE OR DELETE ON public.entrega_reconciliacoes
  FOR EACH ROW EXECUTE FUNCTION public.tg_entrega_reconc_immutability();

-- 2) Vínculo de reentrega --------------------------------------------
ALTER TABLE public.entregas
  ADD COLUMN IF NOT EXISTS reentrega_origem_id uuid REFERENCES public.entregas(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS entregas_reentrega_origem_uq
  ON public.entregas (reentrega_origem_id)
  WHERE reentrega_origem_id IS NOT NULL;

-- 3) RPC de reconciliação transacional --------------------------------
CREATE OR REPLACE FUNCTION public.rpc_entrega_reconciliar_v1(
  p_entrega_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
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

  -- Termo assinado vigente é pré-requisito
  SELECT * INTO v_t FROM public.entrega_termos
   WHERE entrega_id = p_entrega_id AND status = 'assinado'
   ORDER BY versao DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'termo_nao_assinado'; END IF;

  -- Totais da conferência
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

  v_fp := encode(digest(
    v_t.snapshot_hash || '|' || v_total::text || '|' || v_ok::text || '|' || v_no::text
    || '|' || v_qtd_ok::text || '|' || v_qtd_no::text, 'sha256'), 'hex');

  -- Replay idempotente
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

  -- Baixa/estorno item a item
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

        SELECT coalesce(volume,0) INTO v_vol_ok FROM public.estoque_embalagens WHERE id = v_item.embalagem_id;
      END IF;
      IF v_item.etiqueta_id IS NOT NULL THEN
        UPDATE public.produto_etiquetas
           SET entrega_id = p_entrega_id, updated_at = now()
         WHERE id = v_item.etiqueta_id;
      END IF;
    ELSE
      -- recusado: estorno auditado de volta ao estoque
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

  -- Volumes agregados (recalculados de forma determinística)
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
    status = 'entregue',
    entregue_em = coalesce(entregue_em, now()),
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
END $fn$;

REVOKE ALL ON FUNCTION public.rpc_entrega_reconciliar_v1(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_entrega_reconciliar_v1(uuid, text) TO authenticated;

-- 4) Reentrega do saldo recusado --------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_entrega_reentrega_saldo_v1(
  p_entrega_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_e public.entregas%ROWTYPE;
  v_new uuid;
  v_n int := 0;
  v_exist uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'sessao_invalida' USING ERRCODE='insufficient_privilege'; END IF;
  IF NOT public.is_delivery_staff(v_uid) THEN
    RAISE EXCEPTION 'sem_permissao' USING ERRCODE='insufficient_privilege';
  END IF;
  IF coalesce(trim(p_idempotency_key),'') = '' THEN RAISE EXCEPTION 'idempotency_key_obrigatoria'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('entrega_reentrega:' || p_entrega_id::text, 0));

  SELECT * INTO v_e FROM public.entregas WHERE id = p_entrega_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'entrega_nao_encontrada'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.entrega_reconciliacoes
                  WHERE entrega_id = p_entrega_id AND status = 'reconciliada') THEN
    RAISE EXCEPTION 'entrega_nao_reconciliada';
  END IF;

  SELECT id INTO v_exist FROM public.entregas WHERE reentrega_origem_id = p_entrega_id;
  IF v_exist IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'replay', true, 'entrega_id', v_exist);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.entrega_conferencia_itens
                  WHERE entrega_id = p_entrega_id AND status = 'recusado') THEN
    RAISE EXCEPTION 'sem_saldo_recusado';
  END IF;

  INSERT INTO public.entregas (
    ordem_servico_id, ordem_servico_onfarm_id, cliente_id, produto_id, lote_id,
    status, tipo_entrega, assinatura_obrigatoria, comprovante_status,
    financial_status, reentrega_origem_id, observacoes_confirmacao
  ) VALUES (
    v_e.ordem_servico_id, v_e.ordem_servico_onfarm_id, v_e.cliente_id, v_e.produto_id, v_e.lote_id,
    'separado', coalesce(v_e.tipo_entrega,'motorista'), coalesce(v_e.assinatura_obrigatoria, true), 'pendente',
    'PENDING_BILLING', p_entrega_id,
    'Reentrega do saldo recusado na conferencia da entrega de origem.'
  ) RETURNING id INTO v_new;

  INSERT INTO public.entrega_etiquetas (entrega_id, etiqueta_id, created_by, ativo)
  SELECT v_new, ci.etiqueta_id, v_uid, true
    FROM public.entrega_conferencia_itens ci
   WHERE ci.entrega_id = p_entrega_id AND ci.status = 'recusado' AND ci.etiqueta_id IS NOT NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  INSERT INTO public.financial_audit_log (entity_type, entity_id, action, new_data, performed_by)
  VALUES ('entrega', p_entrega_id, 'DELIVERY_REDELIVERY_CREATED',
          jsonb_build_object('entrega_reentrega_id', v_new, 'itens', v_n,
                             'idempotency_key', p_idempotency_key), v_uid);

  RETURN jsonb_build_object('success', true, 'replay', false, 'entrega_id', v_new, 'itens', v_n);
END $fn$;

REVOKE ALL ON FUNCTION public.rpc_entrega_reentrega_saldo_v1(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_entrega_reentrega_saldo_v1(uuid, text) TO authenticated;

-- 5) Faturamento condicionado à reconciliação --------------------------
CREATE OR REPLACE FUNCTION public.fn_entrega_guard_faturamento_v1(
  p_entrega_id uuid,
  p_total numeric
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_r public.entrega_reconciliacoes%ROWTYPE;
  v_conf int;
BEGIN
  SELECT count(*)::int INTO v_conf
    FROM public.entrega_conferencia_itens WHERE entrega_id = p_entrega_id;

  IF v_conf = 0 THEN
    RETURN jsonb_build_object('modo', 'legado', 'ratio_aceito', 1);
  END IF;

  SELECT * INTO v_r FROM public.entrega_reconciliacoes
   WHERE entrega_id = p_entrega_id AND status = 'reconciliada';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'entrega_nao_reconciliada: conclua a conferencia e a reconciliacao antes de faturar'
      USING ERRCODE='check_violation';
  END IF;
  IF NOT v_r.faturavel THEN
    RAISE EXCEPTION 'entrega_nao_faturavel: todos os itens foram recusados'
      USING ERRCODE='check_violation';
  END IF;
  IF v_r.valor_faturavel_max IS NOT NULL AND p_total > v_r.valor_faturavel_max + 0.01 THEN
    RAISE EXCEPTION 'valor_acima_do_aceito' USING ERRCODE='check_violation';
  END IF;

  RETURN jsonb_build_object('modo', 'reconciliado', 'reconciliacao_id', v_r.id,
                            'ratio_aceito', v_r.ratio_aceito);
END $fn$;

REVOKE ALL ON FUNCTION public.fn_entrega_guard_faturamento_v1(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_entrega_guard_faturamento_v1(uuid, numeric) TO authenticated, service_role;
