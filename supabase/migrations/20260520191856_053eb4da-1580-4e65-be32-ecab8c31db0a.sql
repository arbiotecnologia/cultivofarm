
ALTER TABLE public.ordens_servico
  ADD COLUMN IF NOT EXISTS microrganismo_id uuid REFERENCES public.microrganismos(id),
  ADD COLUMN IF NOT EXISTS tipo_item text NOT NULL DEFAULT 'produto',
  ADD COLUMN IF NOT EXISTS modo_aplicacao text;

ALTER TABLE public.ordens_servico
  ALTER COLUMN produto_id DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.check_os_item_ref()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.produto_id IS NULL AND NEW.microrganismo_id IS NULL THEN
    RAISE EXCEPTION 'Ordem de Serviço precisa de produto_id OU microrganismo_id';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_os_item_ref ON public.ordens_servico;
CREATE TRIGGER trg_check_os_item_ref
BEFORE INSERT OR UPDATE ON public.ordens_servico
FOR EACH ROW EXECUTE FUNCTION public.check_os_item_ref();
