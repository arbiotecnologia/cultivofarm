CREATE OR REPLACE FUNCTION public.trg_mestre_guard_preco_canonico()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_litro numeric;
  v_tiers integer;
BEGIN
  IF COALESCE(current_setting('arbio.catalogo_sync', true), 'off') = 'on' THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'produtos' THEN
    SELECT litro, tiers INTO v_litro, v_tiers FROM public.fn_catalogo_litro_canonico(NEW.id, NULL);
    IF COALESCE(v_tiers,0) = 0 THEN RETURN NEW; END IF;
    IF v_tiers = 1 AND COALESCE(v_litro,0) > 0 THEN
      NEW.valor_litro_brl := v_litro;
      NEW.valor_dose_brl  := round(v_litro / 10.0, 2);
      NEW.valor_ha_brl    := CASE WHEN COALESCE(NEW.dose_ml_ha,0) > 0
                                  THEN round(v_litro * (NEW.dose_ml_ha / 1000.0), 2) END;
    ELSE
      NEW.valor_litro_brl := NULL; NEW.valor_dose_brl := NULL; NEW.valor_ha_brl := NULL;
    END IF;
  ELSE
    SELECT litro, tiers INTO v_litro, v_tiers FROM public.fn_catalogo_litro_canonico(NULL, NEW.id);
    IF COALESCE(v_tiers,0) = 0 THEN RETURN NEW; END IF;
    IF v_tiers = 1 AND COALESCE(v_litro,0) > 0 THEN
      NEW.valor_litro_brl := v_litro;
      NEW.valor_dose_brl  := round(v_litro / 10.0, 2);
    ELSE
      NEW.valor_litro_brl := NULL; NEW.valor_dose_brl := NULL;
    END IF;
  END IF;

  RETURN NEW;
END
$function$
