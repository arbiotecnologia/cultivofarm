
-- 1. Estender estoque_produto
ALTER TABLE public.estoque_produto
  ADD COLUMN IF NOT EXISTS reservado_para_os_id uuid,
  ADD COLUMN IF NOT EXISTS reservado_para_os_tipo text,
  ADD COLUMN IF NOT EXISTS reservado_para_cliente_id uuid,
  ADD COLUMN IF NOT EXISTS quantidade_reservada numeric,
  ADD COLUMN IF NOT EXISTS reservado_por uuid,
  ADD COLUMN IF NOT EXISTS reservado_em timestamptz,
  ADD COLUMN IF NOT EXISTS expedido_por uuid,
  ADD COLUMN IF NOT EXISTS expedido_em timestamptz,
  ADD COLUMN IF NOT EXISTS observacao_reserva text;

-- 2. Histórico/auditoria
CREATE TABLE IF NOT EXISTS public.estoque_movimentacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estoque_produto_id uuid NOT NULL,
  acao text NOT NULL,
  quantidade numeric,
  status_anterior text,
  status_novo text,
  os_id uuid,
  os_tipo text,
  cliente_id uuid,
  usuario_id uuid DEFAULT auth.uid(),
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_estoque_mov_item ON public.estoque_movimentacoes (estoque_produto_id, created_at DESC);

ALTER TABLE public.estoque_movimentacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff read estoque movimentacoes" ON public.estoque_movimentacoes;
CREATE POLICY "Staff read estoque movimentacoes"
  ON public.estoque_movimentacoes FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(),'administrador'::app_role)
    OR has_role(auth.uid(),'gestor'::app_role)
    OR has_role(auth.uid(),'administrativo'::app_role)
  );

DROP POLICY IF EXISTS "Staff insert estoque movimentacoes" ON public.estoque_movimentacoes;
CREATE POLICY "Staff insert estoque movimentacoes"
  ON public.estoque_movimentacoes FOR INSERT TO authenticated
  WITH CHECK (true);

-- 3. Validação da reserva
CREATE OR REPLACE FUNCTION public.validate_estoque_reserva()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status::text = 'reservado' AND (OLD.status IS DISTINCT FROM NEW.status OR OLD.status::text <> 'reservado') THEN
    IF NEW.reservado_para_os_id IS NULL OR NEW.reservado_para_cliente_id IS NULL THEN
      RAISE EXCEPTION 'Reserva requer OS e cliente vinculados.' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.quantidade_reservada IS NULL OR NEW.quantidade_reservada <= 0 THEN
      RAISE EXCEPTION 'Informe uma quantidade reservada maior que zero.' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.quantidade IS NOT NULL AND NEW.quantidade_reservada > NEW.quantidade THEN
      RAISE EXCEPTION 'Quantidade reservada (%) excede o estoque disponível (%).', NEW.quantidade_reservada, NEW.quantidade
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.reservado_em IS NULL THEN NEW.reservado_em := now(); END IF;
    IF NEW.reservado_por IS NULL THEN NEW.reservado_por := auth.uid(); END IF;
  END IF;

  IF NEW.status::text = 'disponivel' AND OLD.status::text = 'reservado' THEN
    NEW.reservado_para_os_id := NULL;
    NEW.reservado_para_os_tipo := NULL;
    NEW.reservado_para_cliente_id := NULL;
    NEW.quantidade_reservada := NULL;
    NEW.reservado_por := NULL;
    NEW.reservado_em := NULL;
    NEW.observacao_reserva := NULL;
  END IF;

  IF NEW.status::text = 'expedido' AND OLD.status::text <> 'expedido' THEN
    IF NEW.expedido_em IS NULL THEN NEW.expedido_em := now(); END IF;
    IF NEW.expedido_por IS NULL THEN NEW.expedido_por := auth.uid(); END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_estoque_reserva ON public.estoque_produto;
CREATE TRIGGER trg_validate_estoque_reserva
  BEFORE UPDATE ON public.estoque_produto
  FOR EACH ROW EXECUTE FUNCTION public.validate_estoque_reserva();

-- 4. Log + notificações
CREATE OR REPLACE FUNCTION public.log_estoque_movimentacao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_acao text;
  v_usuario uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.estoque_movimentacoes (estoque_produto_id, acao, quantidade, status_novo, usuario_id)
    VALUES (NEW.id, 'entrada', NEW.quantidade, NEW.status::text, auth.uid());
    RETURN NEW;
  END IF;

  IF OLD.status IS DISTINCT FROM NEW.status THEN
    v_acao := CASE
      WHEN NEW.status::text = 'reservado' THEN 'reserva'
      WHEN NEW.status::text = 'expedido' THEN 'expedicao'
      WHEN OLD.status::text = 'reservado' AND NEW.status::text = 'disponivel' THEN 'cancelamento_reserva'
      ELSE 'edicao'
    END;
    v_usuario := COALESCE(NEW.reservado_por, NEW.expedido_por, auth.uid());

    INSERT INTO public.estoque_movimentacoes
      (estoque_produto_id, acao, quantidade, status_anterior, status_novo, os_id, os_tipo, cliente_id, usuario_id, observacao)
    VALUES
      (NEW.id, v_acao, COALESCE(NEW.quantidade_reservada, NEW.quantidade), OLD.status::text, NEW.status::text,
       NEW.reservado_para_os_id, NEW.reservado_para_os_tipo, NEW.reservado_para_cliente_id, v_usuario, NEW.observacao_reserva);

    -- Notificar administrativos sobre nova reserva
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

DROP TRIGGER IF EXISTS trg_log_estoque_insert ON public.estoque_produto;
CREATE TRIGGER trg_log_estoque_insert
  AFTER INSERT ON public.estoque_produto
  FOR EACH ROW EXECUTE FUNCTION public.log_estoque_movimentacao();

DROP TRIGGER IF EXISTS trg_log_estoque_update ON public.estoque_produto;
CREATE TRIGGER trg_log_estoque_update
  AFTER UPDATE ON public.estoque_produto
  FOR EACH ROW EXECUTE FUNCTION public.log_estoque_movimentacao();
