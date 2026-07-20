
ALTER TABLE public.estoque_produto
  ADD COLUMN IF NOT EXISTS microrganismo_id uuid REFERENCES public.microrganismos(id);

CREATE OR REPLACE FUNCTION public.fn_criar_programacao_da_os()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exists uuid;
BEGIN
  IF TG_TABLE_NAME = 'ordens_servico' THEN
    IF NEW.produto_id IS NULL AND NEW.microrganismo_id IS NULL THEN
      RETURN NEW;
    END IF;
    SELECT id INTO v_exists FROM public.programacao_producao
      WHERE ordem_servico_id = NEW.id LIMIT 1;
    IF v_exists IS NULL THEN
      INSERT INTO public.programacao_producao (
        ordem_servico_id, produto_id, microrganismo_id,
        volume_necessario, data_programada, status
      ) VALUES (
        NEW.id, NEW.produto_id, NEW.microrganismo_id,
        NEW.volume_total_ml, NEW.data_programada, 'aguardando'
      );
    END IF;
  ELSIF TG_TABLE_NAME = 'ordens_servico_onfarm' THEN
    IF NEW.produto_id IS NULL THEN
      RETURN NEW;
    END IF;
    SELECT id INTO v_exists FROM public.programacao_producao
      WHERE ordem_servico_onfarm_id = NEW.id LIMIT 1;
    IF v_exists IS NULL THEN
      INSERT INTO public.programacao_producao (
        ordem_servico_onfarm_id, produto_id,
        volume_necessario, data_programada, status
      ) VALUES (
        NEW.id, NEW.produto_id,
        NEW.volume_total_ml, NEW.data_recomendada, 'aguardando'
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_criar_programacao_os ON public.ordens_servico;
CREATE TRIGGER trg_criar_programacao_os
  AFTER INSERT ON public.ordens_servico
  FOR EACH ROW EXECUTE FUNCTION public.fn_criar_programacao_da_os();

DROP TRIGGER IF EXISTS trg_criar_programacao_os_onfarm ON public.ordens_servico_onfarm;
CREATE TRIGGER trg_criar_programacao_os_onfarm
  AFTER INSERT ON public.ordens_servico_onfarm
  FOR EACH ROW EXECUTE FUNCTION public.fn_criar_programacao_da_os();

INSERT INTO public.programacao_producao (ordem_servico_id, produto_id, microrganismo_id, volume_necessario, data_programada, status)
SELECT os.id, os.produto_id, os.microrganismo_id, os.volume_total_ml, os.data_programada, 'aguardando'
FROM public.ordens_servico os
LEFT JOIN public.programacao_producao pp ON pp.ordem_servico_id = os.id
WHERE pp.id IS NULL
  AND (os.produto_id IS NOT NULL OR os.microrganismo_id IS NOT NULL);

INSERT INTO public.programacao_producao (ordem_servico_onfarm_id, produto_id, volume_necessario, data_programada, status)
SELECT os.id, os.produto_id, os.volume_total_ml, os.data_recomendada, 'aguardando'
FROM public.ordens_servico_onfarm os
LEFT JOIN public.programacao_producao pp ON pp.ordem_servico_onfarm_id = os.id
WHERE pp.id IS NULL
  AND os.produto_id IS NOT NULL;
