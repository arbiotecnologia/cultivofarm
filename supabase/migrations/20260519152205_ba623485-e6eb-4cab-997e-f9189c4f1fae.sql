
ALTER TABLE public.registros_consultor
  ADD COLUMN IF NOT EXISTS codigo_visita text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_registros_codigo_visita
  ON public.registros_consultor(codigo_visita)
  WHERE codigo_visita IS NOT NULL;

CREATE OR REPLACE FUNCTION public.gerar_codigo_visita(_ano int)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prefix text := 'VT-' || _ano::text || '-';
  v_next int;
BEGIN
  SELECT COALESCE(MAX( (split_part(codigo_visita, '-', 3))::int ), 0) + 1
    INTO v_next
    FROM public.registros_consultor
   WHERE codigo_visita LIKE v_prefix || '%';
  RETURN v_prefix || lpad(v_next::text, 4, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.set_codigo_visita()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ano int;
BEGIN
  IF NEW.codigo_visita IS NULL OR NEW.codigo_visita = '' THEN
    v_ano := EXTRACT(YEAR FROM COALESCE(NEW.data_vistoria, NEW.created_at, now()))::int;
    NEW.codigo_visita := public.gerar_codigo_visita(v_ano);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_codigo_visita ON public.registros_consultor;
CREATE TRIGGER trg_set_codigo_visita
  BEFORE INSERT ON public.registros_consultor
  FOR EACH ROW
  EXECUTE FUNCTION public.set_codigo_visita();

-- Backfill
WITH ranked AS (
  SELECT id,
         EXTRACT(YEAR FROM COALESCE(data_vistoria, created_at, now()))::int AS ano,
         ROW_NUMBER() OVER (
           PARTITION BY EXTRACT(YEAR FROM COALESCE(data_vistoria, created_at, now()))::int
           ORDER BY created_at, id
         ) AS seq
    FROM public.registros_consultor
   WHERE codigo_visita IS NULL
)
UPDATE public.registros_consultor r
   SET codigo_visita = 'VT-' || ranked.ano::text || '-' || lpad(ranked.seq::text, 4, '0')
  FROM ranked
 WHERE r.id = ranked.id;
