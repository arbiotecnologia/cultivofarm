
-- 1. Sequence dedicada
CREATE SEQUENCE IF NOT EXISTS public.clientes_codigo_seq START WITH 1;

-- 2. Coluna (inicialmente nullable para backfill)
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS codigo_cliente TEXT;

-- 3. Backfill em ordem de created_at
DO $$
DECLARE
  r RECORD;
  next_n BIGINT;
BEGIN
  FOR r IN SELECT id FROM public.clientes WHERE codigo_cliente IS NULL ORDER BY created_at ASC, id ASC LOOP
    next_n := nextval('public.clientes_codigo_seq');
    UPDATE public.clientes SET codigo_cliente = lpad(next_n::text, 4, '0') WHERE id = r.id;
  END LOOP;
END $$;

-- 4. Constraints
ALTER TABLE public.clientes ALTER COLUMN codigo_cliente SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS clientes_codigo_cliente_key ON public.clientes(codigo_cliente);

-- 5. Trigger BEFORE INSERT
CREATE OR REPLACE FUNCTION public.set_codigo_cliente()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.codigo_cliente IS NULL OR NEW.codigo_cliente = '' THEN
    NEW.codigo_cliente := lpad(nextval('public.clientes_codigo_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_codigo_cliente ON public.clientes;
CREATE TRIGGER trg_set_codigo_cliente
  BEFORE INSERT ON public.clientes
  FOR EACH ROW
  EXECUTE FUNCTION public.set_codigo_cliente();
