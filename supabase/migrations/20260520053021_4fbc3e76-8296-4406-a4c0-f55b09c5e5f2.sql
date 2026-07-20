
-- Fix CQ → OS advance trigger
CREATE OR REPLACE FUNCTION public.fn_cq_aprovado_avanca_os()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_prog_id uuid;
  v_os_onfarm_id uuid;
  v_os_id uuid;
BEGIN
  IF NEW.resultado::text <> 'aprovado' THEN
    RETURN NEW;
  END IF;

  SELECT programacao_id INTO v_prog_id FROM public.lotes WHERE id = NEW.lote_id;
  IF v_prog_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT ordem_servico_onfarm_id, ordem_servico_id
    INTO v_os_onfarm_id, v_os_id
    FROM public.programacao_producao
    WHERE id = v_prog_id;

  -- Mirror status on programacao and lote
  UPDATE public.programacao_producao SET status = 'aprovado' WHERE id = v_prog_id;
  UPDATE public.lotes SET status = 'aprovado' WHERE id = NEW.lote_id;

  -- Advance OS On-Farm if it is at em_producao or em_cq
  IF v_os_onfarm_id IS NOT NULL THEN
    UPDATE public.ordens_servico_onfarm
      SET status = 'envase'
      WHERE id = v_os_onfarm_id
        AND status::text IN ('em_producao','em_cq');
  END IF;

  -- Advance legacy OS if it is at em_producao or em_cq
  IF v_os_id IS NOT NULL THEN
    UPDATE public.ordens_servico
      SET status = 'envase'
      WHERE id = v_os_id
        AND status::text IN ('em_producao','em_cq');
  END IF;

  RETURN NEW;
END;
$function$;

-- Fix Envase → OS advance trigger
CREATE OR REPLACE FUNCTION public.fn_envase_avanca_os()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_prog_id uuid;
  v_os_onfarm_id uuid;
  v_os_id uuid;
BEGIN
  SELECT programacao_id INTO v_prog_id FROM public.lotes WHERE id = NEW.lote_id;
  IF v_prog_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT ordem_servico_onfarm_id, ordem_servico_id
    INTO v_os_onfarm_id, v_os_id
    FROM public.programacao_producao
    WHERE id = v_prog_id;

  -- Ensure lote is marked as aprovado (envase only passes if CQ aprovado)
  UPDATE public.lotes SET status = 'aprovado' WHERE id = NEW.lote_id AND status::text <> 'aprovado';
  UPDATE public.programacao_producao SET status = 'aprovado' WHERE id = v_prog_id AND status::text <> 'aprovado';

  IF v_os_onfarm_id IS NOT NULL THEN
    UPDATE public.ordens_servico_onfarm
      SET status = 'pronto_entrega'
      WHERE id = v_os_onfarm_id
        AND status::text = 'envase';
  END IF;

  IF v_os_id IS NOT NULL THEN
    UPDATE public.ordens_servico
      SET status = 'pronto_entrega'
      WHERE id = v_os_id
        AND status::text = 'envase';
  END IF;

  RETURN NEW;
END;
$function$;

-- Backfill: sync existing records
-- 1. Lotes com CQ aprovado mas lote ainda não aprovado
UPDATE public.lotes l
  SET status = 'aprovado'
  WHERE l.status::text <> 'aprovado'
    AND EXISTS (
      SELECT 1 FROM public.controle_qualidade cq
      WHERE cq.lote_id = l.id AND cq.resultado::text = 'aprovado'
    );

-- 2. Programações com lote aprovado
UPDATE public.programacao_producao pp
  SET status = 'aprovado'
  WHERE pp.status::text <> 'aprovado'
    AND EXISTS (
      SELECT 1 FROM public.lotes l
      WHERE l.programacao_id = pp.id AND l.status::text = 'aprovado'
    );

-- 3. OS On-Farm presas em em_producao/em_cq com lote aprovado → envase
UPDATE public.ordens_servico_onfarm os
  SET status = 'envase'
  WHERE os.status::text IN ('em_producao','em_cq')
    AND EXISTS (
      SELECT 1 FROM public.programacao_producao pp
      JOIN public.lotes l ON l.programacao_id = pp.id
      WHERE pp.ordem_servico_onfarm_id = os.id AND l.status::text = 'aprovado'
    );

-- 4. OS legadas presas em em_producao/em_cq com lote aprovado → envase
UPDATE public.ordens_servico os
  SET status = 'envase'
  WHERE os.status::text IN ('em_producao','em_cq')
    AND EXISTS (
      SELECT 1 FROM public.programacao_producao pp
      JOIN public.lotes l ON l.programacao_id = pp.id
      WHERE pp.ordem_servico_id = os.id AND l.status::text = 'aprovado'
    );

-- 5. OS On-Farm em envase com envase registrado → pronto_entrega
UPDATE public.ordens_servico_onfarm os
  SET status = 'pronto_entrega'
  WHERE os.status::text = 'envase'
    AND EXISTS (
      SELECT 1 FROM public.programacao_producao pp
      JOIN public.lotes l ON l.programacao_id = pp.id
      JOIN public.envase e ON e.lote_id = l.id
      WHERE pp.ordem_servico_onfarm_id = os.id
    );

-- 6. OS legadas em envase com envase registrado → pronto_entrega
UPDATE public.ordens_servico os
  SET status = 'pronto_entrega'
  WHERE os.status::text = 'envase'
    AND EXISTS (
      SELECT 1 FROM public.programacao_producao pp
      JOIN public.lotes l ON l.programacao_id = pp.id
      JOIN public.envase e ON e.lote_id = l.id
      WHERE pp.ordem_servico_id = os.id
    );
