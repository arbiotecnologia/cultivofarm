
CREATE OR REPLACE FUNCTION public.fn_validate_entrega_estoque()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_estoque_id uuid;
  v_qtd_fisica_disponivel numeric;
  v_qtd_reservada_os numeric;
  v_qtd_ja_entregue_lote_os numeric;
  v_os_codigo text;
  v_lote_codigo text;
BEGIN
  -- 1. Identificar o item de estoque
  -- Na tabela entregas, temos estoque_produto_id que aponta para o registro de reserva/estoque
  v_estoque_id := NEW.estoque_produto_id;

  IF v_estoque_id IS NULL THEN
    RAISE EXCEPTION 'ID do estoque não informado na entrega.' USING ERRCODE = 'check_violation';
  END IF;

  -- 2. Buscar saldos e códigos para mensagens de erro
  SELECT 
    ep.quantidade, 
    ep.quantidade_reservada,
    l.codigo_lote
  INTO 
    v_qtd_fisica_disponivel, 
    v_qtd_reservada_os,
    v_lote_codigo
  FROM public.estoque_produto ep
  JOIN public.lotes l ON l.id = ep.lote_id
  WHERE ep.id = v_estoque_id;

  -- 3. Calcular quanto já foi entregue DESTE lote PARA ESTA OS
  -- (Importante para entregas parciais cumulativas)
  SELECT COALESCE(SUM(quantidade_entregue), 0)
  INTO v_qtd_ja_entregue_lote_os
  FROM public.entregas
  WHERE estoque_produto_id = v_estoque_id 
    AND ordem_servico_id = NEW.ordem_servico_id
    AND id <> NEW.id; -- desconsiderar o próprio registro se for update (embora RLS bloqueie update)

  -- 4. Validação de Saldo Físico (O que existe no galpão)
  IF NEW.quantidade_entregue > v_qtd_fisica_disponivel THEN
    RAISE EXCEPTION 'Saldo físico insuficiente no lote %. Disponível: %, Solicitado: %.',
      v_lote_codigo, v_qtd_fisica_disponivel, NEW.quantidade_entregue
      USING ERRCODE = 'check_violation';
  END IF;

  -- 5. Validação de Saldo Reservado (O que foi prometido para esta OS)
  -- Se a OS tem uma reserva de 100 unidades, não posso entregar 110.
  IF (v_qtd_ja_entregue_lote_os + NEW.quantidade_entregue) > v_qtd_reservada_os THEN
    RAISE EXCEPTION 'Quantidade excede o saldo reservado para esta Ordem de Serviço no lote %. Reservado total: %, Já entregue: %, Saldo restante: %.',
      v_lote_codigo, v_qtd_reservada_os, v_qtd_ja_entregue_lote_os, (v_qtd_reservada_os - v_qtd_ja_entregue_lote_os)
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_entrega_estoque ON public.entregas;
CREATE TRIGGER trg_validate_entrega_estoque
BEFORE INSERT ON public.entregas
FOR EACH ROW
EXECUTE FUNCTION public.fn_validate_entrega_estoque();
