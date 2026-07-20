
-- =========================================================
-- PARTE A: vincular estoque_produto ao envase e relaxar trigger
-- =========================================================
ALTER TABLE public.estoque_produto
  ADD COLUMN IF NOT EXISTS envase_id uuid REFERENCES public.envase(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_estoque_produto_envase_id
  ON public.estoque_produto(envase_id);

CREATE OR REPLACE FUNCTION public.validate_estoque_entrada()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Reservas parciais (têm quantidade_reservada preenchida) seguem normalmente
  IF NEW.quantidade_reservada IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Exigir envase para o lote
  IF NOT EXISTS (SELECT 1 FROM public.envase WHERE lote_id = NEW.lote_id) THEN
    RAISE EXCEPTION 'Não é possível criar entrada no estoque: o lote ainda não possui registro de envase.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Bloquear duplicidade por envase_id (não mais por lote)
  IF NEW.envase_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.estoque_produto
    WHERE envase_id = NEW.envase_id
      AND quantidade_reservada IS NULL
      AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) THEN
    RAISE EXCEPTION 'Já existe entrada de estoque para este envase.'
      USING ERRCODE = 'unique_violation';
  END IF;

  -- Compat: se a entrada vier sem envase_id, manter a regra antiga de 1 por lote
  IF NEW.envase_id IS NULL AND EXISTS (
    SELECT 1 FROM public.estoque_produto
    WHERE lote_id = NEW.lote_id
      AND envase_id IS NULL
      AND quantidade_reservada IS NULL
      AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) THEN
    RAISE EXCEPTION 'Já existe uma entrada de estoque agregada para este lote.'
      USING ERRCODE = 'unique_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- Backfill: cria estoque_produto para envases sem entrada correspondente
INSERT INTO public.estoque_produto
  (lote_id, produto_id, microrganismo_id, envase_id, quantidade, volume_total, validade, status)
SELECT
  e.lote_id,
  l.produto_id,
  COALESCE(pp.microrganismo_id, l.microrganismo_id),
  e.id,
  e.quantidade,
  (e.quantidade::numeric * e.volume_por_unidade::numeric) / 1000.0,
  COALESCE(
    (SELECT ep.validade FROM public.estoque_produto ep
       WHERE ep.lote_id = e.lote_id AND ep.quantidade_reservada IS NULL
       ORDER BY ep.created_at LIMIT 1),
    (e.data_envase + INTERVAL '6 months')::date
  ),
  'disponivel'
FROM public.envase e
JOIN public.lotes l ON l.id = e.lote_id
LEFT JOIN public.programacao_producao pp ON pp.id = l.programacao_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.estoque_produto ep
   WHERE (ep.envase_id = e.id)
      OR (ep.envase_id IS NULL AND ep.lote_id = e.lote_id AND ep.quantidade_reservada IS NULL)
);

-- Onde já existia 1 entrada agregada por lote, amarra ela ao primeiro envase do lote
UPDATE public.estoque_produto ep
   SET envase_id = sub.envase_id
  FROM (
    SELECT DISTINCT ON (lote_id) lote_id, id AS envase_id
      FROM public.envase
     ORDER BY lote_id, created_at
  ) sub
 WHERE ep.envase_id IS NULL
   AND ep.lote_id = sub.lote_id
   AND ep.quantidade_reservada IS NULL;

-- =========================================================
-- PARTE B: reserva para parceiro (B2B)
-- =========================================================
ALTER TABLE public.estoque_produto
  ADD COLUMN IF NOT EXISTS reservado_para_partner_id uuid REFERENCES public.partner_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reservado_para_partner_order_id uuid REFERENCES public.partner_orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_estoque_produto_partner_id ON public.estoque_produto(reservado_para_partner_id);
CREATE INDEX IF NOT EXISTS idx_estoque_produto_partner_order_id ON public.estoque_produto(reservado_para_partner_order_id);

-- =========================================================
-- PARTE D: novo status "aguardando_reserva" nos pipelines
-- =========================================================
ALTER TYPE public.status_os ADD VALUE IF NOT EXISTS 'aguardando_reserva' BEFORE 'pronto_entrega';
ALTER TYPE public.status_os_onfarm ADD VALUE IF NOT EXISTS 'aguardando_reserva' BEFORE 'pronto_entrega';
