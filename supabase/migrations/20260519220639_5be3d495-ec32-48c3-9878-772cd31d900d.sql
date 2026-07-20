CREATE OR REPLACE FUNCTION public.check_os_status_transition()
RETURNS TRIGGER AS $$
DECLARE
  status_order text[] := ARRAY['aberta', 'aprovada', 'programada', 'em_producao', 'em_cq', 'envase', 'pronto_entrega', 'entregue', 'finalizada'];
  old_idx int;
  new_idx int;
BEGIN
  -- Se o status não mudou, permite
  IF (OLD.status = NEW.status) THEN
    RETURN NEW;
  END IF;

  -- Se o novo status é 'cancelada', permite (regra de negócio para cancelamento em qualquer fase)
  IF (NEW.status = 'cancelada') THEN
    RETURN NEW;
  END IF;

  -- Encontra os índices na esteira
  SELECT i INTO old_idx FROM unnest(status_order) WITH ORDINALITY AS t(val, i) WHERE val = OLD.status;
  SELECT i INTO new_idx FROM unnest(status_order) WITH ORDINALITY AS t(val, i) WHERE val = NEW.status;

  -- Validações:
  -- 1. Se o status antigo ou novo não estão na lista (e não é cancelamento), lança erro
  IF old_idx IS NULL OR new_idx IS NULL THEN
    RAISE EXCEPTION 'Status inválido ou transição não permitida para o fluxo operacional.';
  END IF;

  -- 2. Permite apenas avançar 1 posição por vez
  IF new_idx != old_idx + 1 THEN
    RAISE EXCEPTION 'Transição de status inválida na esteira de produção: % -> %. A próxima etapa obrigatória é %.', 
      OLD.status, NEW.status, status_order[old_idx + 1];
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Aplica o trigger na tabela ordens_servico (módulo operacional)
DROP TRIGGER IF EXISTS trg_check_os_status_transition ON public.ordens_servico;
CREATE TRIGGER trg_check_os_status_transition
BEFORE UPDATE OF status ON public.ordens_servico
FOR EACH ROW EXECUTE FUNCTION public.check_os_status_transition();

-- Aplica o trigger na tabela ordens_servico_onfarm (módulo on-farm)
DROP TRIGGER IF EXISTS trg_check_os_onfarm_status_transition ON public.ordens_servico_onfarm;
CREATE TRIGGER trg_check_os_onfarm_status_transition
BEFORE UPDATE OF status ON public.ordens_servico_onfarm
FOR EACH ROW EXECUTE FUNCTION public.check_os_status_transition();