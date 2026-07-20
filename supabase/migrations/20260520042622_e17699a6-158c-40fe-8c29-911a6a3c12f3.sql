
-- 1) Função geradora de código de lote (LT-YYYY-NNNN)
CREATE OR REPLACE FUNCTION public.gerar_codigo_lote(_ano integer DEFAULT EXTRACT(YEAR FROM now())::int)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prefix text := 'LT-' || _ano::text || '-';
  v_next int;
BEGIN
  SELECT COALESCE(MAX((split_part(codigo_lote, '-', 3))::int), 0) + 1
    INTO v_next
    FROM public.lotes
    WHERE codigo_lote LIKE v_prefix || '%';
  RETURN v_prefix || lpad(v_next::text, 4, '0');
END;
$$;

-- 2) Função de sincronização downstream
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

  -- Garantir que exista uma programação de produção vinculada
  SELECT id INTO v_prog_id
    FROM public.programacao_producao
    WHERE ordem_servico_onfarm_id = NEW.id
    ORDER BY created_at DESC
    LIMIT 1;

  IF v_prog_id IS NULL AND NEW.status::text IN ('em_producao','em_cq','envase','pronto_entrega','entregue','finalizada') THEN
    INSERT INTO public.programacao_producao (produto_id, volume_necessario, data_programada, status, ordem_servico_onfarm_id)
    VALUES (NEW.produto_id, NEW.volume_total_ml, COALESCE(NEW.data_recomendada, CURRENT_DATE), 'aguardando', NEW.id)
    RETURNING id INTO v_prog_id;
  END IF;

  -- Buscar lote existente vinculado à programação
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
      IF v_lote_id IS NULL AND NEW.produto_id IS NOT NULL THEN
        INSERT INTO public.lotes (codigo_lote, produto_id, programacao_id, status, volume_produzido, data_producao)
        VALUES (
          public.gerar_codigo_lote(),
          NEW.produto_id,
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
      -- Garantir que exista lote (caso a OS tenha pulado em_producao)
      IF v_lote_id IS NULL AND NEW.produto_id IS NOT NULL AND v_prog_id IS NOT NULL THEN
        INSERT INTO public.lotes (codigo_lote, produto_id, programacao_id, status, volume_produzido, data_producao)
        VALUES (public.gerar_codigo_lote(), NEW.produto_id, v_prog_id, 'aguardando_cq', NEW.volume_total_ml, CURRENT_DATE)
        RETURNING id INTO v_lote_id;
      ELSIF v_lote_id IS NOT NULL THEN
        UPDATE public.lotes SET status = 'aguardando_cq' WHERE id = v_lote_id AND status <> 'aprovado';
      END IF;

    WHEN 'envase' THEN
      IF v_prog_id IS NOT NULL THEN
        UPDATE public.programacao_producao SET status = 'aprovado' WHERE id = v_prog_id;
      END IF;
      IF v_lote_id IS NOT NULL THEN
        UPDATE public.lotes SET status = 'aprovado' WHERE id = v_lote_id;
      END IF;

    WHEN 'pronto_entrega' THEN
      IF v_lote_id IS NOT NULL AND NEW.produto_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM public.estoque_produto WHERE lote_id = v_lote_id) THEN
          INSERT INTO public.estoque_produto (produto_id, lote_id, quantidade, volume_total, status)
          VALUES (NEW.produto_id, v_lote_id, v_volume_l, NEW.volume_total_ml, 'disponivel');
        END IF;
      END IF;

    WHEN 'entregue' THEN
      IF v_lote_id IS NOT NULL THEN
        UPDATE public.estoque_produto SET status = 'expedido' WHERE lote_id = v_lote_id;
      END IF;

    WHEN 'cancelada' THEN
      IF v_prog_id IS NOT NULL THEN
        UPDATE public.programacao_producao SET status = 'aguardando' WHERE id = v_prog_id;
      END IF;

    ELSE
      NULL;
  END CASE;

  RETURN NEW;
END;
$$;

-- 3) Gatilho
DROP TRIGGER IF EXISTS trg_sync_os_onfarm_downstream ON public.ordens_servico_onfarm;
CREATE TRIGGER trg_sync_os_onfarm_downstream
AFTER UPDATE OF status ON public.ordens_servico_onfarm
FOR EACH ROW
EXECUTE FUNCTION public.sync_os_onfarm_downstream();
