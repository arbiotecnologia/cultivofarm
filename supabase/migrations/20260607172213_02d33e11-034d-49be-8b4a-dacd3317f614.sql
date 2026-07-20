-- 1) Remover triggers/functions legados que duplicavam programacao_producao
DROP TRIGGER IF EXISTS trigger_auto_programacao ON public.ordens_servico;
DROP TRIGGER IF EXISTS trigger_auto_programacao ON public.ordens_servico_onfarm;
DROP TRIGGER IF EXISTS trg_criar_programacao_os ON public.ordens_servico;
DROP TRIGGER IF EXISTS trg_criar_programacao_os_onfarm ON public.ordens_servico_onfarm;
DROP FUNCTION IF EXISTS public.auto_create_programacao() CASCADE;
DROP FUNCTION IF EXISTS public.fn_criar_programacao_da_os() CASCADE;

-- 2) Higienizar duplicados existentes: manter a programação mais antiga; se houver lotes vinculados, preservar a que tem lote
WITH ranked AS (
  SELECT p.id, p.ordem_servico_id, p.ordem_servico_onfarm_id,
         ROW_NUMBER() OVER (
           PARTITION BY COALESCE(p.ordem_servico_id::text, p.ordem_servico_onfarm_id::text)
           ORDER BY (CASE WHEN EXISTS (SELECT 1 FROM public.lotes l WHERE l.programacao_id = p.id) THEN 0 ELSE 1 END),
                    p.created_at ASC
         ) AS rn
  FROM public.programacao_producao p
  WHERE p.ordem_servico_id IS NOT NULL OR p.ordem_servico_onfarm_id IS NOT NULL
)
DELETE FROM public.programacao_producao
WHERE id IN (
  SELECT id FROM ranked WHERE rn > 1
    AND NOT EXISTS (SELECT 1 FROM public.lotes l WHERE l.programacao_id = ranked.id)
);

-- 3) Índices únicos parciais para travar duplicidade no banco
CREATE UNIQUE INDEX IF NOT EXISTS programacao_producao_os_uniq
  ON public.programacao_producao (ordem_servico_id)
  WHERE ordem_servico_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS programacao_producao_os_onfarm_uniq
  ON public.programacao_producao (ordem_servico_onfarm_id)
  WHERE ordem_servico_onfarm_id IS NOT NULL;

-- 4) Tornar as funções de INSERT idempotentes (defesa em profundidade)
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
  IF EXISTS (SELECT 1 FROM public.programacao_producao WHERE ordem_servico_id = NEW.id) THEN
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
  IF EXISTS (SELECT 1 FROM public.programacao_producao WHERE ordem_servico_onfarm_id = NEW.id) THEN
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

-- Recriar triggers (CASCADE acima pode tê-los removido)
DROP TRIGGER IF EXISTS trg_create_programacao_on_os_insert ON public.ordens_servico;
CREATE TRIGGER trg_create_programacao_on_os_insert
AFTER INSERT ON public.ordens_servico
FOR EACH ROW EXECUTE FUNCTION public.fn_create_programacao_on_os_classica_insert();

DROP TRIGGER IF EXISTS trg_create_programacao_on_os_insert ON public.ordens_servico_onfarm;
CREATE TRIGGER trg_create_programacao_on_os_insert
AFTER INSERT ON public.ordens_servico_onfarm
FOR EACH ROW EXECUTE FUNCTION public.fn_create_programacao_on_os_onfarm_insert();