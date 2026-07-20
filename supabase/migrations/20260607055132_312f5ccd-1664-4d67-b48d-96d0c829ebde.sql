
ALTER TABLE public.programacao_producao
  ADD COLUMN IF NOT EXISTS responsavel_id uuid REFERENCES auth.users(id);

CREATE OR REPLACE FUNCTION public.fn_notify_lab_on_programacao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_produto_nome text;
  v_cliente_nome text;
BEGIN
  IF NEW.status::text <> 'aguardando' THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(p.nome, m.nome, 'Bioinsumo')
    INTO v_produto_nome
    FROM (SELECT 1) x
    LEFT JOIN public.produtos p ON p.id = NEW.produto_id
    LEFT JOIN public.microrganismos m ON m.id = NEW.microrganismo_id;

  IF NEW.ordem_servico_onfarm_id IS NOT NULL THEN
    SELECT c.nome INTO v_cliente_nome
      FROM public.ordens_servico_onfarm o
      JOIN public.clientes c ON c.id = o.cliente_id
      WHERE o.id = NEW.ordem_servico_onfarm_id;
  ELSIF NEW.ordem_servico_id IS NOT NULL THEN
    SELECT c.nome INTO v_cliente_nome
      FROM public.ordens_servico o
      JOIN public.clientes c ON c.id = o.cliente_id
      WHERE o.id = NEW.ordem_servico_id;
  END IF;

  INSERT INTO public.notificacoes_operacionais (usuario_id, tipo, titulo, mensagem, link)
  SELECT ur.user_id,
         'nova_demanda_producao',
         'Nova demanda de produção',
         COALESCE(v_produto_nome, 'Bioinsumo')
           || COALESCE(' · ' || v_cliente_nome, '')
           || COALESCE(' · ' || ROUND(NEW.volume_necessario / 1000.0, 1)::text || ' L', ''),
         '/pcp?coluna=aguardando'
    FROM public.user_roles ur
   WHERE ur.role IN ('producao', 'administrador', 'gestor');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_lab_on_programacao ON public.programacao_producao;
CREATE TRIGGER trg_notify_lab_on_programacao
AFTER INSERT ON public.programacao_producao
FOR EACH ROW EXECUTE FUNCTION public.fn_notify_lab_on_programacao();

CREATE OR REPLACE FUNCTION public.fn_create_programacao_on_os_onfarm_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status::text NOT IN ('aberta','aprovada','programada') THEN
    RETURN NEW;
  END IF;
  IF NEW.produto_id IS NULL THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.programacao_producao
    (produto_id, volume_necessario, data_programada, status, ordem_servico_onfarm_id)
  VALUES
    (NEW.produto_id, NEW.volume_total_ml,
     COALESCE(NEW.data_recomendada, CURRENT_DATE), 'aguardando', NEW.id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_create_programacao_on_os_classica_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status::text NOT IN ('aberta','aprovada','programada') THEN
    RETURN NEW;
  END IF;
  IF NEW.produto_id IS NULL AND NEW.microrganismo_id IS NULL THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.programacao_producao
    (produto_id, microrganismo_id, volume_necessario, data_programada, status, ordem_servico_id)
  VALUES
    (NEW.produto_id, NEW.microrganismo_id, NEW.volume_total_ml,
     COALESCE(NEW.data_programada, CURRENT_DATE), 'aguardando', NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_programacao_on_os_insert ON public.ordens_servico_onfarm;
CREATE TRIGGER trg_create_programacao_on_os_insert
AFTER INSERT ON public.ordens_servico_onfarm
FOR EACH ROW EXECUTE FUNCTION public.fn_create_programacao_on_os_onfarm_insert();

DROP TRIGGER IF EXISTS trg_create_programacao_on_os_insert ON public.ordens_servico;
CREATE TRIGGER trg_create_programacao_on_os_insert
AFTER INSERT ON public.ordens_servico
FOR EACH ROW EXECUTE FUNCTION public.fn_create_programacao_on_os_classica_insert();

CREATE OR REPLACE FUNCTION public.fn_sync_os_classica_downstream()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prog_id uuid;
  v_lote_id uuid;
BEGIN
  IF (OLD.status IS NOT DISTINCT FROM NEW.status) THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_prog_id FROM public.programacao_producao
   WHERE ordem_servico_id = NEW.id ORDER BY created_at DESC LIMIT 1;

  IF v_prog_id IS NULL
     AND NEW.status::text IN ('aprovada','programada','em_producao','em_cq','envase','pronto_entrega','entregue','finalizada')
     AND (NEW.produto_id IS NOT NULL OR NEW.microrganismo_id IS NOT NULL) THEN
    INSERT INTO public.programacao_producao
      (produto_id, microrganismo_id, volume_necessario, data_programada, status, ordem_servico_id)
    VALUES
      (NEW.produto_id, NEW.microrganismo_id, NEW.volume_total_ml,
       COALESCE(NEW.data_programada, CURRENT_DATE), 'aguardando', NEW.id)
    RETURNING id INTO v_prog_id;
  END IF;

  IF v_prog_id IS NOT NULL THEN
    SELECT id INTO v_lote_id FROM public.lotes
      WHERE programacao_id = v_prog_id ORDER BY created_at DESC LIMIT 1;
  END IF;

  CASE NEW.status::text
    WHEN 'aprovada' THEN
      IF v_prog_id IS NOT NULL THEN
        UPDATE public.programacao_producao SET status = 'aguardando' WHERE id = v_prog_id;
      END IF;
    WHEN 'programada' THEN
      IF v_prog_id IS NOT NULL THEN
        UPDATE public.programacao_producao
           SET status = 'aguardando',
               data_programada = COALESCE(NEW.data_programada, data_programada, CURRENT_DATE)
         WHERE id = v_prog_id;
      END IF;
    WHEN 'em_producao' THEN
      IF v_prog_id IS NOT NULL THEN
        UPDATE public.programacao_producao SET status = 'em_producao' WHERE id = v_prog_id;
      END IF;
      IF v_lote_id IS NULL AND (NEW.produto_id IS NOT NULL OR NEW.microrganismo_id IS NOT NULL) THEN
        INSERT INTO public.lotes (codigo_lote, produto_id, microrganismo_id, programacao_id, status, volume_produzido, data_producao)
        VALUES (public.gerar_codigo_lote(), NEW.produto_id, NEW.microrganismo_id, v_prog_id,
                'em_producao', NEW.volume_total_ml, CURRENT_DATE);
      END IF;
    WHEN 'em_cq' THEN
      IF v_prog_id IS NOT NULL THEN
        UPDATE public.programacao_producao SET status = 'aguardando_cq' WHERE id = v_prog_id;
      END IF;
      IF v_lote_id IS NOT NULL THEN
        UPDATE public.lotes SET status = 'aguardando_cq' WHERE id = v_lote_id;
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

DROP TRIGGER IF EXISTS trg_sync_os_classica_downstream ON public.ordens_servico;
CREATE TRIGGER trg_sync_os_classica_downstream
AFTER UPDATE ON public.ordens_servico
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_os_classica_downstream();

CREATE OR REPLACE FUNCTION public.sync_os_onfarm_downstream()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prog_id uuid;
  v_lote_id uuid;
BEGIN
  IF (OLD.status IS NOT DISTINCT FROM NEW.status) THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_prog_id FROM public.programacao_producao
   WHERE ordem_servico_onfarm_id = NEW.id ORDER BY created_at DESC LIMIT 1;

  IF v_prog_id IS NULL
     AND NEW.status::text IN ('aprovada','programada','em_producao','em_cq','envase','pronto_entrega','entregue','finalizada')
     AND NEW.produto_id IS NOT NULL THEN
    INSERT INTO public.programacao_producao
      (produto_id, volume_necessario, data_programada, status, ordem_servico_onfarm_id)
    VALUES
      (NEW.produto_id, NEW.volume_total_ml,
       COALESCE(NEW.data_recomendada, CURRENT_DATE), 'aguardando', NEW.id)
    RETURNING id INTO v_prog_id;
  END IF;

  IF v_prog_id IS NOT NULL THEN
    SELECT id INTO v_lote_id FROM public.lotes
      WHERE programacao_id = v_prog_id ORDER BY created_at DESC LIMIT 1;
  END IF;

  CASE NEW.status::text
    WHEN 'aprovada' THEN
      IF v_prog_id IS NOT NULL THEN
        UPDATE public.programacao_producao SET status = 'aguardando' WHERE id = v_prog_id;
      END IF;
    WHEN 'programada' THEN
      IF v_prog_id IS NOT NULL THEN
        UPDATE public.programacao_producao
          SET status = 'aguardando',
              data_programada = COALESCE(NEW.data_recomendada, data_programada, CURRENT_DATE)
          WHERE id = v_prog_id;
      END IF;
    WHEN 'em_producao' THEN
      IF v_prog_id IS NOT NULL THEN
        UPDATE public.programacao_producao SET status = 'em_producao' WHERE id = v_prog_id;
      END IF;
      IF v_lote_id IS NULL AND NEW.produto_id IS NOT NULL THEN
        INSERT INTO public.lotes (codigo_lote, produto_id, programacao_id, status, volume_produzido, data_producao)
        VALUES (public.gerar_codigo_lote(), NEW.produto_id, v_prog_id,
                'em_producao', NEW.volume_total_ml, CURRENT_DATE);
      END IF;
    WHEN 'em_cq' THEN
      IF v_prog_id IS NOT NULL THEN
        UPDATE public.programacao_producao SET status = 'aguardando_cq' WHERE id = v_prog_id;
      END IF;
      IF v_lote_id IS NOT NULL THEN
        UPDATE public.lotes SET status = 'aguardando_cq' WHERE id = v_lote_id;
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

INSERT INTO public.programacao_producao
  (produto_id, volume_necessario, data_programada, status, ordem_servico_onfarm_id)
SELECT o.produto_id, o.volume_total_ml,
       COALESCE(o.data_recomendada, CURRENT_DATE), 'aguardando', o.id
  FROM public.ordens_servico_onfarm o
 WHERE o.status::text IN ('aberta','aprovada','programada')
   AND o.produto_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.programacao_producao pp WHERE pp.ordem_servico_onfarm_id = o.id);

INSERT INTO public.programacao_producao
  (produto_id, microrganismo_id, volume_necessario, data_programada, status, ordem_servico_id)
SELECT o.produto_id, o.microrganismo_id, o.volume_total_ml,
       COALESCE(o.data_programada, CURRENT_DATE), 'aguardando', o.id
  FROM public.ordens_servico o
 WHERE o.status::text IN ('aberta','aprovada','programada')
   AND (o.produto_id IS NOT NULL OR o.microrganismo_id IS NOT NULL)
   AND NOT EXISTS (SELECT 1 FROM public.programacao_producao pp WHERE pp.ordem_servico_id = o.id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.programacao_producao;
