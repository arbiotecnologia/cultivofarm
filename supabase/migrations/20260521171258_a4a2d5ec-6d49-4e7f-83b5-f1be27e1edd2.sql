-- 1. Coluna
ALTER TABLE public.ordens_servico_onfarm
  ADD COLUMN IF NOT EXISTS numero_os TEXT;

-- 2. Sequência
CREATE SEQUENCE IF NOT EXISTS public.ordens_servico_onfarm_seq START 1;

-- 3. Função e trigger para autopreenchimento
CREATE OR REPLACE FUNCTION public.set_numero_os()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.numero_os IS NULL OR NEW.numero_os = '' THEN
    NEW.numero_os := 'OS-' || to_char(COALESCE(NEW.created_at, now()), 'YYYY')
      || '-' || lpad(nextval('public.ordens_servico_onfarm_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_numero_os ON public.ordens_servico_onfarm;
CREATE TRIGGER trg_set_numero_os
BEFORE INSERT ON public.ordens_servico_onfarm
FOR EACH ROW EXECUTE FUNCTION public.set_numero_os();

-- 4. Backfill (ordem cronológica, respeitando o ano de cada OS)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT id, created_at FROM public.ordens_servico_onfarm
    WHERE numero_os IS NULL OR numero_os = ''
    ORDER BY created_at NULLS LAST, id
  LOOP
    UPDATE public.ordens_servico_onfarm
       SET numero_os = 'OS-' || to_char(COALESCE(r.created_at, now()), 'YYYY')
         || '-' || lpad(nextval('public.ordens_servico_onfarm_seq')::text, 6, '0')
     WHERE id = r.id;
  END LOOP;
END $$;

-- 5. Restrições e índice
ALTER TABLE public.ordens_servico_onfarm
  ALTER COLUMN numero_os SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_ordens_servico_onfarm_numero_os
  ON public.ordens_servico_onfarm(numero_os);