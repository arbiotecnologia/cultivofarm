
-- 1) programacao_producao: aceitar microrganismo
ALTER TABLE public.programacao_producao ALTER COLUMN produto_id DROP NOT NULL;
ALTER TABLE public.programacao_producao ADD COLUMN IF NOT EXISTS microrganismo_id uuid REFERENCES public.microrganismos(id);
ALTER TABLE public.programacao_producao DROP CONSTRAINT IF EXISTS programacao_producao_item_chk;
ALTER TABLE public.programacao_producao ADD CONSTRAINT programacao_producao_item_chk
  CHECK (produto_id IS NOT NULL OR microrganismo_id IS NOT NULL);

-- 2) lotes: aceitar microrganismo
ALTER TABLE public.lotes ALTER COLUMN produto_id DROP NOT NULL;
ALTER TABLE public.lotes ADD COLUMN IF NOT EXISTS microrganismo_id uuid REFERENCES public.microrganismos(id);
ALTER TABLE public.lotes DROP CONSTRAINT IF EXISTS lotes_item_chk;
ALTER TABLE public.lotes ADD CONSTRAINT lotes_item_chk
  CHECK (produto_id IS NOT NULL OR microrganismo_id IS NOT NULL);

-- 3) Atualizar trigger auto_create_programacao para suportar microrganismo
CREATE OR REPLACE FUNCTION public.auto_create_programacao()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'aprovada' AND (OLD.status IS NULL OR OLD.status <> 'aprovada') THEN
    INSERT INTO public.programacao_producao (
      ordem_servico_id, produto_id, microrganismo_id,
      volume_necessario, data_programada, status
    )
    VALUES (
      NEW.id, NEW.produto_id, NEW.microrganismo_id,
      NEW.volume_total_ml, NEW.data_programada, 'aguardando'
    );
    NEW.status = 'programada';
  END IF;
  RETURN NEW;
END;
$$;

-- 4) Atualizar sync_os_onfarm_downstream para suportar microrganismo
CREATE OR REPLACE FUNCTION public.sync_os_onfarm_downstream()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prog_id uuid;
  v_lote_id uuid;
  v_volume_l numeric;
BEGIN
  IF (OLD.status IS NOT DISTINCT FROM NEW.status) THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_prog_id
    FROM public.programacao_producao
    WHERE ordem_servico_onfarm_id = NEW.id
    ORDER BY created_at DESC
    LIMIT 1;

  IF v_prog_id IS NULL AND NEW.status::text IN ('em_producao','em_cq','envase','pronto_entrega','entregue','finalizada') THEN
    INSERT INTO public.programacao_producao (
      produto_id, microrganismo_id, volume_necessario, data_programada, status, ordem_servico_onfarm_id
    )
    VALUES (
      NEW.produto_id, NEW.microrganismo_id, NEW.volume_total_ml,
      COALESCE(NEW.data_recomendada, CURRENT_DATE), 'aguardando', NEW.id
    )
    RETURNING id INTO v_prog_id;
  END IF;

  IF v_prog_id IS NOT NULL THEN
    SELECT id INTO v_lote_id
      FROM public.lotes
      WHERE programacao_id = v_prog_id
      ORDER BY created_at DESC
      LIMIT 1;
  END IF;

  v_volume_l := COALESCE(NEW.volume_total_ml, 0) / 1000.0;

  CASE NEW.status::text
    WHEN 'programada' THEN
      IF v_prog_id IS NOT NULL THEN
        UPDATE public.programacao_producao
          SET status = 'aguardando', data_programada = COALESCE(NEW.data_recomendada, data_programada, CURRENT_DATE)
          WHERE id = v_prog_id;
      END IF;

    WHEN 'em_producao' THEN
      IF v_prog_id IS NOT NULL THEN
        UPDATE public.programacao_producao SET status = 'em_producao' WHERE id = v_prog_id;
      END IF;
      IF v_lote_id IS NULL AND (NEW.produto_id IS NOT NULL OR NEW.microrganismo_id IS NOT NULL) THEN
        INSERT INTO public.lotes (codigo_lote, produto_id, microrganismo_id, programacao_id, status, volume_produzido, data_producao)
        VALUES (
          public.gerar_codigo_lote(),
          NEW.produto_id,
          NEW.microrganismo_id,
          v_prog_id,
          'em_producao',
          NEW.volume_total_ml,
          CURRENT_DATE
        );
      END IF;

    WHEN 'em_cq' THEN
      IF v_prog_id IS NOT NULL THEN
        UPDATE public.programacao_producao SET status = 'aguardando_cq' WHERE id = v_prog_id;
      END IF;

    WHEN 'envase' THEN
      IF v_prog_id IS NOT NULL THEN
        UPDATE public.programacao_producao SET status = 'aprovado' WHERE id = v_prog_id;
      END IF;

    ELSE
      NULL;
  END CASE;

  RETURN NEW;
END;
$$;
