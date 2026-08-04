-- ============================================================
-- FASE 1 — LIVRO-RAZÃO COMPLETO (estoque_movimentacoes)
-- ============================================================
ALTER TABLE public.estoque_movimentacoes
  ADD COLUMN IF NOT EXISTS saldo_anterior numeric,
  ADD COLUMN IF NOT EXISTS saldo_posterior numeric,
  ADD COLUMN IF NOT EXISTS reservado_anterior numeric,
  ADD COLUMN IF NOT EXISTS reservado_posterior numeric,
  ADD COLUMN IF NOT EXISTS volume_anterior numeric,
  ADD COLUMN IF NOT EXISTS volume_posterior numeric,
  ADD COLUMN IF NOT EXISTS unidade text,
  ADD COLUMN IF NOT EXISTS direcao text,
  ADD COLUMN IF NOT EXISTS origem text,
  ADD COLUMN IF NOT EXISTS referencia_tipo text,
  ADD COLUMN IF NOT EXISTS referencia_id uuid,
  ADD COLUMN IF NOT EXISTS movimentacao_origem_id uuid,
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS request_fingerprint text,
  ADD COLUMN IF NOT EXISTS motivo text,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

-- FK de reversão formal (auto-referência)
DO $$ BEGIN
  ALTER TABLE public.estoque_movimentacoes
    ADD CONSTRAINT estoque_mov_origem_fkey
    FOREIGN KEY (movimentacao_origem_id) REFERENCES public.estoque_movimentacoes(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Taxonomia ampliada (operações do motor canônico)
ALTER TABLE public.estoque_movimentacoes DROP CONSTRAINT IF EXISTS estoque_movimentacoes_acao_valida;
ALTER TABLE public.estoque_movimentacoes ADD CONSTRAINT estoque_movimentacoes_acao_valida
  CHECK (acao = ANY (ARRAY[
    'entrada','reserva','cancelamento_reserva','expedicao','estorno_expedicao',
    'entrega','descarte','ajuste','edicao','perda','devolucao','consumo','transferencia'
  ]));

ALTER TABLE public.estoque_movimentacoes DROP CONSTRAINT IF EXISTS estoque_mov_direcao_valida;
ALTER TABLE public.estoque_movimentacoes ADD CONSTRAINT estoque_mov_direcao_valida
  CHECK (direcao IS NULL OR direcao = ANY (ARRAY['entrada','saida','neutro']));

ALTER TABLE public.estoque_movimentacoes DROP CONSTRAINT IF EXISTS estoque_mov_referencia_tipo_valida;
ALTER TABLE public.estoque_movimentacoes ADD CONSTRAINT estoque_mov_referencia_tipo_valida
  CHECK (referencia_tipo IS NULL OR referencia_tipo = ANY (ARRAY[
    'entrega','ordem_servico','ordem_servico_onfarm','partner_order','envase','lote','manual','sistema'
  ]));

ALTER TABLE public.estoque_movimentacoes DROP CONSTRAINT IF EXISTS estoque_mov_saldos_nao_negativos;
ALTER TABLE public.estoque_movimentacoes ADD CONSTRAINT estoque_mov_saldos_nao_negativos
  CHECK (
    COALESCE(saldo_anterior, 0) >= 0 AND COALESCE(saldo_posterior, 0) >= 0
    AND COALESCE(reservado_anterior, 0) >= 0 AND COALESCE(reservado_posterior, 0) >= 0
  );

-- Idempotência: uma chave = um lançamento
CREATE UNIQUE INDEX IF NOT EXISTS uq_estoque_mov_idempotency
  ON public.estoque_movimentacoes (idempotency_key) WHERE idempotency_key IS NOT NULL;
-- Reversão única: um lançamento só pode ser estornado uma vez
CREATE UNIQUE INDEX IF NOT EXISTS uq_estoque_mov_reversao
  ON public.estoque_movimentacoes (movimentacao_origem_id) WHERE movimentacao_origem_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_estoque_mov_referencia
  ON public.estoque_movimentacoes (referencia_tipo, referencia_id) WHERE referencia_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_estoque_mov_cliente ON public.estoque_movimentacoes (cliente_id) WHERE cliente_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_estoque_mov_lote ON public.estoque_movimentacoes (lote_id) WHERE lote_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_estoque_mov_usuario ON public.estoque_movimentacoes (usuario_id) WHERE usuario_id IS NOT NULL;
-- Ordenação determinística (created_at DESC, id DESC) para paginação por cursor
CREATE INDEX IF NOT EXISTS idx_estoque_mov_cursor ON public.estoque_movimentacoes (created_at DESC, id DESC);

-- Histórico legado permanece legível, marcado como migrado
UPDATE public.estoque_movimentacoes
   SET metadata = COALESCE(metadata,'{}'::jsonb) || jsonb_build_object('migracao_origem','legacy')
 WHERE NOT (metadata ? 'migracao_origem');

COMMENT ON TABLE public.estoque_movimentacoes IS
  'Livro-razão append-only de estoque de produto acabado. Snapshot completo antes/depois por operação. Escrita exclusiva via trigger canônico alimentado pelas RPCs do motor (rpc_estoque_*).';

-- ============================================================
-- CONTEXTO DE OPERAÇÃO (preenchido pelas RPCs canônicas)
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_estoque_ctx_open(p_ctx jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM set_config('app.estoque_mov_ctx', COALESCE(p_ctx, '{}'::jsonb)::text, true);
END; $$;
REVOKE ALL ON FUNCTION public.fn_estoque_ctx_open(jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_estoque_ctx_close()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM set_config('app.estoque_mov_ctx', '', true);
END; $$;
REVOKE ALL ON FUNCTION public.fn_estoque_ctx_close() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_estoque_ctx_read()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v text;
BEGIN
  v := NULLIF(current_setting('app.estoque_mov_ctx', true), '');
  IF v IS NULL THEN RETURN NULL; END IF;
  RETURN v::jsonb;
EXCEPTION WHEN OTHERS THEN RETURN NULL;
END; $$;
REVOKE ALL ON FUNCTION public.fn_estoque_ctx_read() FROM PUBLIC, anon, authenticated;

-- ============================================================
-- TRIGGER CANÔNICO: 1 operação = 1 lançamento com snapshot completo
-- ============================================================
CREATE OR REPLACE FUNCTION public.log_estoque_movimentacao()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_ctx jsonb := public.fn_estoque_ctx_read();
  v_acao text;
  v_dir text;
  v_usuario uuid;
  v_old_status text;
  v_new_status text;
  v_qtd numeric;
  v_mudou boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.estoque_movimentacoes
      (estoque_produto_id, acao, quantidade, status_novo, lote_id, usuario_id,
       saldo_anterior, saldo_posterior, reservado_anterior, reservado_posterior,
       volume_anterior, volume_posterior, unidade, direcao,
       origem, referencia_tipo, referencia_id, motivo, idempotency_key, request_fingerprint,
       movimentacao_origem_id, os_id, os_tipo, cliente_id, metadata)
    VALUES (
      NEW.id,
      COALESCE(v_ctx->>'acao', 'entrada'),
      NULLIF(NEW.quantidade, 0), NEW.status::text, NEW.lote_id,
      COALESCE(auth.uid(), (v_ctx->>'usuario_id')::uuid),
      0, COALESCE(NEW.quantidade, 0),
      0, COALESCE(NEW.quantidade_reservada, 0),
      0, COALESCE(NEW.volume_total, 0),
      COALESCE(v_ctx->>'unidade', 'un'), 'entrada',
      COALESCE(v_ctx->>'origem', 'trigger'),
      v_ctx->>'referencia_tipo', (v_ctx->>'referencia_id')::uuid,
      v_ctx->>'motivo', v_ctx->>'idempotency_key', v_ctx->>'request_fingerprint',
      (v_ctx->>'movimentacao_origem_id')::uuid,
      NEW.reservado_para_os_id, NEW.reservado_para_os_tipo, NEW.reservado_para_cliente_id,
      COALESCE(v_ctx->'metadata', '{}'::jsonb)
    );
    RETURN NEW;
  END IF;

  -- Qualquer alteração material de status OU saldo gera exatamente um lançamento
  v_mudou := (OLD.status IS DISTINCT FROM NEW.status)
          OR (COALESCE(OLD.quantidade,0) IS DISTINCT FROM COALESCE(NEW.quantidade,0))
          OR (COALESCE(OLD.quantidade_reservada,0) IS DISTINCT FROM COALESCE(NEW.quantidade_reservada,0))
          OR (COALESCE(OLD.volume_total,0) IS DISTINCT FROM COALESCE(NEW.volume_total,0));
  IF NOT v_mudou THEN RETURN NEW; END IF;

  v_old_status := OLD.status::text;
  v_new_status := NEW.status::text;

  v_acao := COALESCE(v_ctx->>'acao', CASE
    WHEN v_new_status = 'reservado'  AND v_old_status = 'expedido'  THEN 'estorno_expedicao'
    WHEN v_new_status = 'reservado'  AND v_old_status <> 'reservado' THEN 'reserva'
    WHEN v_new_status = 'expedido'   AND v_old_status <> 'expedido'  THEN 'expedicao'
    WHEN v_new_status = 'estornado'                                  THEN 'estorno_expedicao'
    WHEN v_old_status = 'reservado'  AND v_new_status = 'disponivel' THEN 'cancelamento_reserva'
    WHEN v_old_status = v_new_status THEN 'ajuste'
    ELSE 'edicao'
  END);

  v_dir := COALESCE(v_ctx->>'direcao', CASE
    WHEN COALESCE(NEW.quantidade,0) > COALESCE(OLD.quantidade,0) THEN 'entrada'
    WHEN COALESCE(NEW.quantidade,0) < COALESCE(OLD.quantidade,0) THEN 'saida'
    WHEN v_acao IN ('expedicao','descarte','perda','consumo','entrega') THEN 'saida'
    WHEN v_acao IN ('estorno_expedicao','devolucao') THEN 'entrada'
    ELSE 'neutro'
  END);

  v_usuario := COALESCE(auth.uid(), (v_ctx->>'usuario_id')::uuid,
    CASE WHEN v_new_status = 'expedido' THEN NEW.expedido_por ELSE NEW.reservado_por END);

  v_qtd := NULLIF(ABS(COALESCE(NEW.quantidade,0) - COALESCE(OLD.quantidade,0)), 0);
  IF v_qtd IS NULL THEN
    v_qtd := NULLIF(ABS(COALESCE(NEW.quantidade_reservada,0) - COALESCE(OLD.quantidade_reservada,0)), 0);
  END IF;
  IF v_qtd IS NULL THEN
    v_qtd := NULLIF(COALESCE(NEW.quantidade_reservada, NEW.quantidade, 0), 0);
  END IF;

  INSERT INTO public.estoque_movimentacoes
    (estoque_produto_id, acao, quantidade, status_anterior, status_novo,
     os_id, os_tipo, cliente_id, lote_id, usuario_id, observacao,
     saldo_anterior, saldo_posterior, reservado_anterior, reservado_posterior,
     volume_anterior, volume_posterior, unidade, direcao,
     origem, referencia_tipo, referencia_id, motivo,
     idempotency_key, request_fingerprint, movimentacao_origem_id, metadata)
  VALUES (
    NEW.id, v_acao, v_qtd, v_old_status, v_new_status,
    NEW.reservado_para_os_id, NEW.reservado_para_os_tipo, NEW.reservado_para_cliente_id,
    NEW.lote_id, v_usuario, COALESCE(v_ctx->>'observacao', NEW.observacao_reserva),
    COALESCE(OLD.quantidade,0), COALESCE(NEW.quantidade,0),
    COALESCE(OLD.quantidade_reservada,0), COALESCE(NEW.quantidade_reservada,0),
    COALESCE(OLD.volume_total,0), COALESCE(NEW.volume_total,0),
    COALESCE(v_ctx->>'unidade','un'), v_dir,
    COALESCE(v_ctx->>'origem','trigger'),
    v_ctx->>'referencia_tipo', (v_ctx->>'referencia_id')::uuid, v_ctx->>'motivo',
    v_ctx->>'idempotency_key', v_ctx->>'request_fingerprint',
    (v_ctx->>'movimentacao_origem_id')::uuid,
    COALESCE(v_ctx->'metadata','{}'::jsonb)
  );

  IF v_acao = 'reserva' THEN
    INSERT INTO public.notificacoes_operacionais (usuario_id, tipo, titulo, mensagem, link)
    SELECT ur.user_id, 'nova_reserva', 'Nova reserva de estoque',
           'Item reservado aguardando expedição.', '/estoque'
      FROM public.user_roles ur WHERE ur.role = 'administrativo'::app_role;
  END IF;

  RETURN NEW;
END; $$;

-- ============================================================
-- FASE 10 — GOVERNANÇA DA TABELA DE ÓRFÃOS
-- ============================================================
ALTER TABLE public.estoque_movimentacoes_orfaos_backup
  ADD COLUMN IF NOT EXISTS migracao_ref text,
  ADD COLUMN IF NOT EXISTS snapshot_hash text,
  ADD COLUMN IF NOT EXISTS retencao_ate date;

UPDATE public.estoque_movimentacoes_orfaos_backup
   SET migracao_ref = COALESCE(migracao_ref, '20260804-movimentacoes-hardening'),
       snapshot_hash = COALESCE(snapshot_hash,
         encode(digest(coalesce(id::text,'')||'|'||coalesce(estoque_produto_id::text,'')||'|'||
                       coalesce(acao,'')||'|'||coalesce(quantidade::text,'')||'|'||
                       coalesce(created_at::text,''), 'sha256'), 'hex')),
       retencao_ate = COALESCE(retencao_ate, (current_date + interval '5 years')::date);

ALTER TABLE public.estoque_movimentacoes_orfaos_backup ENABLE ROW LEVEL SECURITY;
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT policyname FROM pg_policies
           WHERE schemaname='public' AND tablename='estoque_movimentacoes_orfaos_backup'
  LOOP EXECUTE format('DROP POLICY %I ON public.estoque_movimentacoes_orfaos_backup', r.policyname); END LOOP;
END $$;
CREATE POLICY "orfaos_backup_admin_select" ON public.estoque_movimentacoes_orfaos_backup
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'administrador'::app_role));

REVOKE ALL ON public.estoque_movimentacoes_orfaos_backup FROM anon, PUBLIC;
REVOKE INSERT, UPDATE, DELETE ON public.estoque_movimentacoes_orfaos_backup FROM authenticated;
GRANT SELECT ON public.estoque_movimentacoes_orfaos_backup TO authenticated;
GRANT ALL ON public.estoque_movimentacoes_orfaos_backup TO service_role;

-- Congelada: nenhuma escrita operacional após a migração
DROP TRIGGER IF EXISTS trg_orfaos_backup_frozen ON public.estoque_movimentacoes_orfaos_backup;
CREATE TRIGGER trg_orfaos_backup_frozen
  BEFORE INSERT OR UPDATE OR DELETE ON public.estoque_movimentacoes_orfaos_backup
  FOR EACH ROW EXECUTE FUNCTION public.fn_ledger_append_only();

COMMENT ON TABLE public.estoque_movimentacoes_orfaos_backup IS
  'Evidência histórica congelada (4 registros órfãos removidos na migração 20260804-movimentacoes-hardening). Somente leitura por administrador/service_role. Retenção: 5 anos a partir de 2026-08-04. Nenhuma escrita operacional permitida.';
