
-- Limpeza do duplicado: manter o mais antigo (disponivel principal), apagar outros sem reserva
DELETE FROM public.estoque_produto ep
WHERE ep.quantidade_reservada IS NULL
  AND ep.id <> (
    SELECT id FROM public.estoque_produto
    WHERE lote_id = ep.lote_id AND quantidade_reservada IS NULL
    ORDER BY created_at ASC LIMIT 1
  );

CREATE OR REPLACE FUNCTION public.validate_estoque_entrada()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Permite registros parciais (criados pela reserva) — eles têm quantidade_reservada preenchida
  IF NEW.quantidade_reservada IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Exigir envase para o lote
  IF NOT EXISTS (SELECT 1 FROM public.envase WHERE lote_id = NEW.lote_id) THEN
    RAISE EXCEPTION 'Não é possível criar entrada no estoque: o lote ainda não possui registro de envase.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Bloquear duplicidade do registro principal por lote
  IF EXISTS (
    SELECT 1 FROM public.estoque_produto
    WHERE lote_id = NEW.lote_id AND quantidade_reservada IS NULL
  ) THEN
    RAISE EXCEPTION 'Já existe uma entrada de estoque para este lote.'
      USING ERRCODE = 'unique_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_estoque_entrada ON public.estoque_produto;
CREATE TRIGGER trg_validate_estoque_entrada
  BEFORE INSERT ON public.estoque_produto
  FOR EACH ROW EXECUTE FUNCTION public.validate_estoque_entrada();
