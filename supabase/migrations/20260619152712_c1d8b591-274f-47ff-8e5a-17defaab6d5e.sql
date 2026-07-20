
-- 1. Schema additions (idempotent)
ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS valor_dose_brl numeric,
  ADD COLUMN IF NOT EXISTS valor_litro_brl numeric;

ALTER TABLE public.microrganismos
  ADD COLUMN IF NOT EXISTS valor_litro_brl numeric;

ALTER TABLE public.catalogo_volumes
  ADD COLUMN IF NOT EXISTS preco_litro_brl numeric,
  ADD COLUMN IF NOT EXISTS valor_dose_100ml_brl numeric,
  ADD COLUMN IF NOT EXISTS doses_por_volume numeric;

-- 2. Utility calculation functions
CREATE OR REPLACE FUNCTION public.calculate_valor_litro_from_dose(p_valor_dose numeric)
RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE WHEN p_valor_dose IS NULL THEN NULL ELSE p_valor_dose * 10 END;
$$;

CREATE OR REPLACE FUNCTION public.calculate_valor_dose_from_litro(p_valor_litro numeric)
RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE WHEN p_valor_litro IS NULL THEN NULL ELSE p_valor_litro / 10 END;
$$;

CREATE OR REPLACE FUNCTION public.calculate_valor_ha_from_dose(p_dose_ml_ha numeric, p_valor_dose numeric)
RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE
    WHEN p_dose_ml_ha IS NULL OR p_valor_dose IS NULL OR p_dose_ml_ha <= 0 THEN NULL
    ELSE (p_dose_ml_ha / 100.0) * p_valor_dose
  END;
$$;

-- 3a. Microrganismos trigger
CREATE OR REPLACE FUNCTION public.sync_microorganism_pricing()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  dose_changed boolean := false;
  litro_changed boolean := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.valor_dose_brl IS NOT NULL AND NEW.valor_litro_brl IS NULL THEN
      NEW.valor_litro_brl := NEW.valor_dose_brl * 10;
    ELSIF NEW.valor_litro_brl IS NOT NULL AND NEW.valor_dose_brl IS NULL THEN
      NEW.valor_dose_brl := NEW.valor_litro_brl / 10;
    ELSIF NEW.valor_dose_brl IS NOT NULL AND NEW.valor_litro_brl IS NOT NULL THEN
      -- dose canonical when inconsistent
      IF NEW.valor_litro_brl <> NEW.valor_dose_brl * 10 THEN
        NEW.valor_litro_brl := NEW.valor_dose_brl * 10;
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  dose_changed := NEW.valor_dose_brl IS DISTINCT FROM OLD.valor_dose_brl;
  litro_changed := NEW.valor_litro_brl IS DISTINCT FROM OLD.valor_litro_brl;

  IF dose_changed AND NOT litro_changed THEN
    NEW.valor_litro_brl := CASE WHEN NEW.valor_dose_brl IS NULL THEN NULL ELSE NEW.valor_dose_brl * 10 END;
  ELSIF litro_changed AND NOT dose_changed THEN
    NEW.valor_dose_brl := CASE WHEN NEW.valor_litro_brl IS NULL THEN NULL ELSE NEW.valor_litro_brl / 10 END;
  ELSIF dose_changed AND litro_changed THEN
    -- both changed: dose wins
    NEW.valor_litro_brl := CASE WHEN NEW.valor_dose_brl IS NULL THEN NULL ELSE NEW.valor_dose_brl * 10 END;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_microorganism_pricing ON public.microrganismos;
CREATE TRIGGER trg_sync_microorganism_pricing
  BEFORE INSERT OR UPDATE ON public.microrganismos
  FOR EACH ROW EXECUTE FUNCTION public.sync_microorganism_pricing();

-- 3b. Produtos trigger
CREATE OR REPLACE FUNCTION public.sync_product_pricing()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  dose_changed boolean := false;
  litro_changed boolean := false;
  ha_changed boolean := false;
  doseha_changed boolean := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Initial fill with dose priority
    IF NEW.valor_dose_brl IS NULL AND NEW.valor_litro_brl IS NOT NULL THEN
      NEW.valor_dose_brl := NEW.valor_litro_brl / 10;
    END IF;
    IF NEW.valor_dose_brl IS NULL AND NEW.valor_ha_brl IS NOT NULL
       AND NEW.dose_ml_ha IS NOT NULL AND NEW.dose_ml_ha > 0 THEN
      NEW.valor_dose_brl := NEW.valor_ha_brl / (NEW.dose_ml_ha / 100.0);
    END IF;
    IF NEW.valor_dose_brl IS NOT NULL THEN
      NEW.valor_litro_brl := NEW.valor_dose_brl * 10;
      IF NEW.dose_ml_ha IS NOT NULL AND NEW.dose_ml_ha > 0 THEN
        NEW.valor_ha_brl := (NEW.dose_ml_ha / 100.0) * NEW.valor_dose_brl;
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  dose_changed    := NEW.valor_dose_brl IS DISTINCT FROM OLD.valor_dose_brl;
  litro_changed   := NEW.valor_litro_brl IS DISTINCT FROM OLD.valor_litro_brl;
  ha_changed      := NEW.valor_ha_brl IS DISTINCT FROM OLD.valor_ha_brl;
  doseha_changed  := NEW.dose_ml_ha IS DISTINCT FROM OLD.dose_ml_ha;

  IF dose_changed THEN
    NEW.valor_litro_brl := CASE WHEN NEW.valor_dose_brl IS NULL THEN NULL ELSE NEW.valor_dose_brl * 10 END;
    IF NEW.dose_ml_ha IS NOT NULL AND NEW.dose_ml_ha > 0 AND NEW.valor_dose_brl IS NOT NULL THEN
      NEW.valor_ha_brl := (NEW.dose_ml_ha / 100.0) * NEW.valor_dose_brl;
    END IF;
  ELSIF litro_changed THEN
    NEW.valor_dose_brl := CASE WHEN NEW.valor_litro_brl IS NULL THEN NULL ELSE NEW.valor_litro_brl / 10 END;
    IF NEW.dose_ml_ha IS NOT NULL AND NEW.dose_ml_ha > 0 AND NEW.valor_dose_brl IS NOT NULL THEN
      NEW.valor_ha_brl := (NEW.dose_ml_ha / 100.0) * NEW.valor_dose_brl;
    END IF;
  ELSIF ha_changed AND NEW.dose_ml_ha IS NOT NULL AND NEW.dose_ml_ha > 0 AND NEW.valor_ha_brl IS NOT NULL THEN
    NEW.valor_dose_brl := NEW.valor_ha_brl / (NEW.dose_ml_ha / 100.0);
    NEW.valor_litro_brl := NEW.valor_dose_brl * 10;
  ELSIF doseha_changed AND NEW.valor_dose_brl IS NOT NULL AND NEW.dose_ml_ha IS NOT NULL AND NEW.dose_ml_ha > 0 THEN
    NEW.valor_ha_brl := (NEW.dose_ml_ha / 100.0) * NEW.valor_dose_brl;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_product_pricing ON public.produtos;
CREATE TRIGGER trg_sync_product_pricing
  BEFORE INSERT OR UPDATE ON public.produtos
  FOR EACH ROW EXECUTE FUNCTION public.sync_product_pricing();

-- 3c. catalogo_volumes trigger
CREATE OR REPLACE FUNCTION public.sync_catalogo_volumes_calc()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.volume_ml IS NOT NULL AND NEW.volume_ml > 0 AND NEW.preco_brl IS NOT NULL THEN
    NEW.preco_litro_brl := NEW.preco_brl / (NEW.volume_ml / 1000.0);
    NEW.valor_dose_100ml_brl := NEW.preco_litro_brl / 10;
  ELSE
    NEW.preco_litro_brl := NULL;
    NEW.valor_dose_100ml_brl := NULL;
  END IF;
  IF NEW.volume_ml IS NOT NULL AND NEW.volume_ml > 0 THEN
    NEW.doses_por_volume := NEW.volume_ml / 100.0;
  ELSE
    NEW.doses_por_volume := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_catalogo_volumes_calc ON public.catalogo_volumes;
CREATE TRIGGER trg_sync_catalogo_volumes_calc
  BEFORE INSERT OR UPDATE ON public.catalogo_volumes
  FOR EACH ROW EXECUTE FUNCTION public.sync_catalogo_volumes_calc();

-- 4. Backfill existing data
-- Microrganismos
UPDATE public.microrganismos
SET valor_litro_brl = valor_dose_brl * 10
WHERE valor_litro_brl IS NULL AND valor_dose_brl IS NOT NULL;

UPDATE public.microrganismos
SET valor_dose_brl = valor_litro_brl / 10
WHERE valor_dose_brl IS NULL AND valor_litro_brl IS NOT NULL;

-- Produtos
UPDATE public.produtos
SET valor_dose_brl = valor_ha_brl / (dose_ml_ha / 100.0)
WHERE valor_dose_brl IS NULL
  AND valor_ha_brl IS NOT NULL
  AND dose_ml_ha IS NOT NULL
  AND dose_ml_ha > 0;

UPDATE public.produtos
SET valor_litro_brl = valor_dose_brl * 10
WHERE valor_litro_brl IS NULL AND valor_dose_brl IS NOT NULL;

UPDATE public.produtos
SET valor_ha_brl = (dose_ml_ha / 100.0) * valor_dose_brl
WHERE valor_ha_brl IS NULL
  AND valor_dose_brl IS NOT NULL
  AND dose_ml_ha IS NOT NULL
  AND dose_ml_ha > 0;

-- catalogo_volumes: touch to fire trigger
UPDATE public.catalogo_volumes SET updated_at = now();
