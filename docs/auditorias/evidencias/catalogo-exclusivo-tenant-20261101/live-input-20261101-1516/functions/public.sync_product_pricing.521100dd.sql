CREATE OR REPLACE FUNCTION public.sync_product_pricing()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  dose_changed boolean := false;
  litro_changed boolean := false;
  ha_changed boolean := false;
  doseha_changed boolean := false;
BEGIN
  -- H3c: durante a sincronizacao canonica (catalogo_volumes -> mestre) os
  -- valores ja chegam prontos; nao reprocessar.
  IF COALESCE(current_setting('arbio.catalogo_sync', true), 'off') = 'on' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
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
$function$
