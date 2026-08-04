-- =========================================================
-- MOVIMENTACOES: hardening do livro-razao de estoque
-- =========================================================

-- 1) Backup + limpeza de registros orfaos --------------------------------
CREATE TABLE IF NOT EXISTS public.estoque_movimentacoes_orfaos_backup (
  id uuid PRIMARY KEY,
  estoque_produto_id uuid,
  acao text,
  quantidade numeric,
  status_anterior text,
  status_novo text,
  os_id uuid,
  os_tipo text,
  cliente_id uuid,
  lote_id uuid,
  usuario_id uuid,
  observacao text,
  created_at timestamptz,
  arquivado_em timestamptz NOT NULL DEFAULT now(),
  motivo text NOT NULL DEFAULT 'orfao: estoque_produto_id inexistente'
);
GRANT SELECT ON public.estoque_movimentacoes_orfaos_backup TO authenticated;
GRANT ALL ON public.estoque_movimentacoes_orfaos_backup TO service_role;
ALTER TABLE public.estoque_movimentacoes_orfaos_backup ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "orfaos_backup_admin_read" ON public.estoque_movimentacoes_orfaos_backup;
CREATE POLICY "orfaos_backup_admin_read"
  ON public.estoque_movimentacoes_orfaos_backup FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'administrador'::app_role));

INSERT INTO public.estoque_movimentacoes_orfaos_backup
  (id, estoque_produto_id, acao, quantidade, status_anterior, status_novo,
   os_id, os_tipo, cliente_id, lote_id, usuario_id, observacao, created_at)
SELECT m.id, m.estoque_produto_id, m.acao, m.quantidade, m.status_anterior, m.status_novo,
       m.os_id, m.os_tipo, m.cliente_id, m.lote_id, m.usuario_id, m.observacao, m.created_at
FROM public.estoque_movimentacoes m
WHERE NOT EXISTS (SELECT 1 FROM public.estoque_produto p WHERE p.id = m.estoque_produto_id)
ON CONFLICT (id) DO NOTHING;

DELETE FROM public.estoque_movimentacoes m
WHERE NOT EXISTS (SELECT 1 FROM public.estoque_produto p WHERE p.id = m.estoque_produto_id);

-- 2) Integridade estrutural do livro-razao --------------------------------
ALTER TABLE public.estoque_movimentacoes
  DROP CONSTRAINT IF EXISTS estoque_movimentacoes_estoque_produto_id_fkey;
ALTER TABLE public.estoque_movimentacoes
  ADD CONSTRAINT estoque_movimentacoes_estoque_produto_id_fkey
  FOREIGN KEY (estoque_produto_id) REFERENCES public.estoque_produto(id) ON DELETE RESTRICT;

ALTER TABLE public.estoque_movimentacoes
  DROP CONSTRAINT IF EXISTS estoque_movimentacoes_quantidade_positiva;
ALTER TABLE public.estoque_movimentacoes
  ADD CONSTRAINT estoque_movimentacoes_quantidade_positiva
  CHECK (quantidade IS NULL OR quantidade > 0);

ALTER TABLE public.estoque_movimentacoes
  DROP CONSTRAINT IF EXISTS estoque_movimentacoes_acao_valida;
ALTER TABLE public.estoque_movimentacoes
  ADD CONSTRAINT estoque_movimentacoes_acao_valida
  CHECK (acao IN (
    'entrada','reserva','cancelamento_reserva','expedicao','estorno_expedicao',
    'entrega','descarte','ajuste','edicao'
  ));

ALTER TABLE public.estoque_movimentacoes ALTER COLUMN usuario_id SET DEFAULT auth.uid();

CREATE INDEX IF NOT EXISTS idx_estoque_mov_created_at ON public.estoque_movimentacoes (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_estoque_mov_acao_created ON public.estoque_movimentacoes (acao, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_estoque_mov_os ON public.estoque_movimentacoes (os_id) WHERE os_id IS NOT NULL;

-- 3) Append-only: histórico concluido é imutável --------------------------
CREATE OR REPLACE FUNCTION public.fn_ledger_append_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RAISE EXCEPTION 'Livro de movimentações é append-only: % não é permitido em %. Use estorno/cancelamento formal.',
    TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

DROP TRIGGER IF EXISTS trg_estoque_mov_append_only ON public.estoque_movimentacoes;
CREATE TRIGGER trg_estoque_mov_append_only
  BEFORE UPDATE OR DELETE ON public.estoque_movimentacoes
  FOR EACH ROW EXECUTE FUNCTION public.fn_ledger_append_only();

DROP TRIGGER IF EXISTS trg_emb_mov_append_only ON public.estoque_embalagem_movimentacoes;
CREATE TRIGGER trg_emb_mov_append_only
  BEFORE UPDATE OR DELETE ON public.estoque_embalagem_movimentacoes
  FOR EACH ROW EXECUTE FUNCTION public.fn_ledger_append_only();

-- 4) RLS: leitura autorizada, escrita apenas via SECURITY DEFINER ---------
DROP POLICY IF EXISTS "Adm read estoque_movimentacoes" ON public.estoque_movimentacoes;
DROP POLICY IF EXISTS "Admin/Gestor/Producao access on estoque_movimentacoes" ON public.estoque_movimentacoes;
DROP POLICY IF EXISTS "OnFarm scoped insert estoque_mov" ON public.estoque_movimentacoes;
DROP POLICY IF EXISTS "OnFarm scoped select estoque_mov" ON public.estoque_movimentacoes;

CREATE POLICY "estoque_mov_select_interno"
  ON public.estoque_movimentacoes FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'administrador'::app_role)
    OR public.has_role(auth.uid(), 'gestor'::app_role)
    OR public.has_role(auth.uid(), 'producao'::app_role)
    OR public.has_role(auth.uid(), 'administrativo'::app_role)
  );

CREATE POLICY "estoque_mov_select_onfarm"
  ON public.estoque_movimentacoes FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'operador_onfarm'::app_role)
    AND (public.fn_onfarm_scope_cliente(cliente_id) OR public.fn_onfarm_scope_lote(lote_id))
  );

DROP POLICY IF EXISTS "emb_mov_insert" ON public.estoque_embalagem_movimentacoes;
DROP POLICY IF EXISTS "emb_mov_select" ON public.estoque_embalagem_movimentacoes;
CREATE POLICY "emb_mov_select"
  ON public.estoque_embalagem_movimentacoes FOR SELECT TO authenticated
  USING (public.can_user_access_estoque_embalagem(embalagem_id));

-- 5) Grants: deny-by-default para anon/PUBLIC -----------------------------
REVOKE ALL ON public.estoque_movimentacoes FROM anon, PUBLIC;
REVOKE ALL ON public.estoque_embalagem_movimentacoes FROM anon, PUBLIC;
REVOKE ALL ON public.estoque_produto FROM anon, PUBLIC;
REVOKE ALL ON public.estoque_embalagens FROM anon, PUBLIC;

REVOKE INSERT, UPDATE, DELETE ON public.estoque_movimentacoes FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.estoque_embalagem_movimentacoes FROM authenticated;
GRANT SELECT ON public.estoque_movimentacoes TO authenticated;
GRANT SELECT ON public.estoque_embalagem_movimentacoes TO authenticated;
GRANT ALL ON public.estoque_movimentacoes TO service_role;
GRANT ALL ON public.estoque_embalagem_movimentacoes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.estoque_produto TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.estoque_embalagens TO authenticated;
GRANT ALL ON public.estoque_produto TO service_role;
GRANT ALL ON public.estoque_embalagens TO service_role;

-- 6) Registro automático canônico e único ---------------------------------
CREATE OR REPLACE FUNCTION public.log_estoque_movimentacao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_acao text;
  v_usuario uuid;
  v_old text;
  v_new text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.estoque_movimentacoes
      (estoque_produto_id, acao, quantidade, status_novo, lote_id, usuario_id)
    VALUES (NEW.id, 'entrada', NULLIF(NEW.quantidade, 0), NEW.status::text, NEW.lote_id, auth.uid());
    RETURN NEW;
  END IF;

  IF OLD.status IS DISTINCT FROM NEW.status THEN
    v_old := OLD.status::text;
    v_new := NEW.status::text;

    v_acao := CASE
      WHEN v_new = 'reservado'  AND v_old = 'expedido'  THEN 'estorno_expedicao'
      WHEN v_new = 'reservado'                          THEN 'reserva'
      WHEN v_new = 'expedido'                           THEN 'expedicao'
      WHEN v_new = 'estornado'                          THEN 'estorno_expedicao'
      WHEN v_old = 'reservado' AND v_new = 'disponivel' THEN 'cancelamento_reserva'
      ELSE 'edicao'
    END;

    v_usuario := COALESCE(
      auth.uid(),
      CASE WHEN v_new = 'expedido' THEN NEW.expedido_por ELSE NEW.reservado_por END
    );

    INSERT INTO public.estoque_movimentacoes
      (estoque_produto_id, acao, quantidade, status_anterior, status_novo,
       os_id, os_tipo, cliente_id, lote_id, usuario_id, observacao)
    VALUES
      (NEW.id, v_acao,
       NULLIF(COALESCE(NEW.quantidade_reservada, NEW.quantidade), 0),
       v_old, v_new,
       NEW.reservado_para_os_id, NEW.reservado_para_os_tipo, NEW.reservado_para_cliente_id,
       NEW.lote_id, v_usuario, NEW.observacao_reserva);

    IF v_acao = 'reserva' THEN
      INSERT INTO public.notificacoes_operacionais (usuario_id, tipo, titulo, mensagem, link)
      SELECT ur.user_id, 'nova_reserva', 'Nova reserva de estoque',
             'Item reservado aguardando expedição.', '/estoque'
        FROM public.user_roles ur
       WHERE ur.role = 'administrativo'::app_role;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;