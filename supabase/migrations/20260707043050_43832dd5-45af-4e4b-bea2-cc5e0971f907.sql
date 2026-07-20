
CREATE OR REPLACE FUNCTION public.partner_simulation_items_fill_snapshots()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  p RECORD;
  m RECORD;
BEGIN
  IF NEW.item_tipo = 'produto' AND NEW.product_id IS NULL THEN
    NEW.product_id := NEW.item_id;
  ELSIF NEW.item_tipo = 'microrganismo' AND NEW.microrganismo_id IS NULL THEN
    NEW.microrganismo_id := NEW.item_id;
  END IF;

  IF NEW.item_tipo = 'produto' AND NEW.product_id IS NOT NULL THEN
    SELECT codigo, nome INTO p FROM public.produtos WHERE id = NEW.product_id;
    IF FOUND THEN
      NEW.produto_codigo_snapshot := COALESCE(NEW.produto_codigo_snapshot, p.codigo);
      NEW.produto_nome_snapshot   := COALESCE(NEW.produto_nome_snapshot, p.nome, NEW.nome);
    END IF;
    NEW.unidade_medida := COALESCE(NEW.unidade_medida, 'unidade');
  ELSIF NEW.item_tipo = 'microrganismo' AND NEW.microrganismo_id IS NOT NULL THEN
    SELECT codigo, nome INTO m FROM public.microrganismos WHERE id = NEW.microrganismo_id;
    IF FOUND THEN
      NEW.produto_codigo_snapshot := COALESCE(NEW.produto_codigo_snapshot, m.codigo);
      NEW.produto_nome_snapshot   := COALESCE(NEW.produto_nome_snapshot, m.nome, NEW.nome);
    END IF;
    NEW.unidade_medida := COALESCE(NEW.unidade_medida, 'dose');
  END IF;

  NEW.preco_tabela_snapshot := COALESCE(NEW.preco_tabela_snapshot, NEW.valor_unitario_cheio);
  NEW.preco_unitario        := COALESCE(NEW.preco_unitario, NEW.valor_unitario_cheio);
  NEW.desconto_percentual   := COALESCE(NEW.desconto_percentual, 0);

  RETURN NEW;
END;
$$;
