-- Function to advance OS to 'envase' when CQ is approved
CREATE OR REPLACE FUNCTION public.fn_cq_aprovado_avanca_os()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.resultado = 'aprovado' THEN
    -- Find the related OS and advance it if it's currently in 'em_cq'
    UPDATE public.ordens_servico_onfarm
    SET status = 'envase'
    WHERE id IN (
      SELECT programacao_id 
      FROM public.lotes 
      WHERE id = NEW.lote_id
    ) AND status = 'em_cq';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Trigger for CQ approval
DROP TRIGGER IF EXISTS trg_cq_aprovado_avanca_os ON public.controle_qualidade;
CREATE TRIGGER trg_cq_aprovado_avanca_os
AFTER INSERT OR UPDATE ON public.controle_qualidade
FOR EACH ROW
EXECUTE FUNCTION public.fn_cq_aprovado_avanca_os();

-- Function to advance OS to 'pronto_entrega' when bottling is done
CREATE OR REPLACE FUNCTION public.fn_envase_avanca_os()
RETURNS TRIGGER AS $$
BEGIN
  -- Find the related OS and advance it if it's currently in 'envase'
  UPDATE public.ordens_servico_onfarm
  SET status = 'pronto_entrega'
  WHERE id IN (
    SELECT programacao_id 
    FROM public.lotes 
    WHERE id = NEW.lote_id
  ) AND status = 'envase';
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Trigger for bottling
DROP TRIGGER IF EXISTS trg_envase_avanca_os ON public.envase;
CREATE TRIGGER trg_envase_avanca_os
AFTER INSERT ON public.envase
FOR EACH ROW
EXECUTE FUNCTION public.fn_envase_avanca_os();

-- Backfill: Fix stuck OS that already have CQ approved
UPDATE public.ordens_servico_onfarm os
SET status = 'envase'
FROM public.lotes l
JOIN public.controle_qualidade cq ON cq.lote_id = l.id
WHERE os.id = l.programacao_id
AND os.status = 'em_cq'
AND cq.resultado = 'aprovado';

-- Backfill: Fix stuck OS that already have bottling recorded
UPDATE public.ordens_servico_onfarm os
SET status = 'pronto_entrega'
FROM public.lotes l
JOIN public.envase e ON e.lote_id = l.id
WHERE os.id = l.programacao_id
AND os.status = 'envase';

-- Backfill: Ensure production programming status matches OS
UPDATE public.programacao_producao pp
SET status = 'aprovado'
FROM public.ordens_servico_onfarm os
WHERE pp.id = os.id
AND os.status IN ('envase', 'pronto_entrega', 'finalizada')
AND pp.status = 'aguardando_cq';
