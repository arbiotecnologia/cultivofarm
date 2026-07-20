-- 1. Remover restrição de entrega única por OS
ALTER TABLE public.entregas
  DROP CONSTRAINT IF EXISTS unique_ordem_servico_entrega;

-- 2. Adicionar valor 'cancelada' ao enum status_entrega
ALTER TYPE public.status_entrega ADD VALUE IF NOT EXISTS 'cancelada';

-- 3. Campos de rastreabilidade do cancelamento
ALTER TABLE public.entregas
  ADD COLUMN IF NOT EXISTS cancelada_por uuid,
  ADD COLUMN IF NOT EXISTS cancelada_em timestamptz,
  ADD COLUMN IF NOT EXISTS motivo_cancelamento text;

-- 4. Atualizar trigger de validação para ignorar entregas canceladas
CREATE OR REPLACE FUNCTION public.fn_validate_entrega_estoque()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_estoque_id uuid;
  v_qtd_fisica_disponivel numeric;
  v_qtd_reservada_os numeric;
  v_qtd_ja_entregue_lote_os numeric;
  v_lote_codigo text;
BEGIN
  -- Se a entrega já está sendo criada/atualizada como cancelada, não validar saldo
  IF NEW.status::text = 'cancelada' THEN
    RETURN NEW;
  END IF;

  v_estoque_id := NEW.estoque_produto_id;

  IF v_estoque_id IS NULL THEN
    RAISE EXCEPTION 'ID do estoque não informado na entrega.' USING ERRCODE = 'check_violation';
  END IF;

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

  -- Acumula somente entregas válidas (ignora canceladas)
  SELECT COALESCE(SUM(quantidade_entregue), 0)
  INTO v_qtd_ja_entregue_lote_os
  FROM public.entregas
  WHERE estoque_produto_id = v_estoque_id 
    AND ordem_servico_id = NEW.ordem_servico_id
    AND id <> NEW.id
    AND status::text <> 'cancelada';

  IF NEW.quantidade_entregue > v_qtd_fisica_disponivel THEN
    RAISE EXCEPTION 'Saldo físico insuficiente no lote %. Disponível: %, Solicitado: %.',
      v_lote_codigo, v_qtd_fisica_disponivel, NEW.quantidade_entregue
      USING ERRCODE = 'check_violation';
  END IF;

  IF (v_qtd_ja_entregue_lote_os + NEW.quantidade_entregue) > v_qtd_reservada_os THEN
    RAISE EXCEPTION 'Quantidade excede o saldo reservado para esta Ordem de Serviço no lote %. Reservado total: %, Já entregue: %, Saldo restante: %.',
      v_lote_codigo, v_qtd_reservada_os, v_qtd_ja_entregue_lote_os, (v_qtd_reservada_os - v_qtd_ja_entregue_lote_os)
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;

-- 5. Trigger leve para registrar quem/quando cancelou
CREATE OR REPLACE FUNCTION public.fn_entrega_marcar_cancelamento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status::text = 'cancelada'
     AND (TG_OP = 'INSERT' OR OLD.status::text IS DISTINCT FROM 'cancelada') THEN
    NEW.cancelada_em := COALESCE(NEW.cancelada_em, now());
    NEW.cancelada_por := COALESCE(NEW.cancelada_por, auth.uid());
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_entrega_marcar_cancelamento ON public.entregas;
CREATE TRIGGER trg_entrega_marcar_cancelamento
BEFORE INSERT OR UPDATE ON public.entregas
FOR EACH ROW EXECUTE FUNCTION public.fn_entrega_marcar_cancelamento();