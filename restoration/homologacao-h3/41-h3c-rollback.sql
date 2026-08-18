-- ============================================================================
-- ROLLBACK H3c (staging) — remove a sincronizacao canonica e a guarda
-- anti-divergencia, restaurando os triggers legados de pricing e as policies
-- B2B anteriores. NAO reverte o backfill de precos (alinhamento forward-only,
-- documentado em docs/auditorias/homologacao-h3-base-tecnica-catalogo.md).
-- ============================================================================
BEGIN;

DROP TRIGGER IF EXISTS trg_zz_catalogo_volumes_sync_mestre ON public.catalogo_volumes;
DROP TRIGGER IF EXISTS trg_zz_produtos_guard_preco ON public.produtos;
DROP TRIGGER IF EXISTS trg_zz_microrganismos_guard_preco ON public.microrganismos;

DROP FUNCTION IF EXISTS public.trg_catalogo_volumes_sync_mestre();
DROP FUNCTION IF EXISTS public.trg_mestre_guard_preco_canonico();
DROP FUNCTION IF EXISTS public.fn_catalogo_sync_mestre_preco(uuid, uuid);
DROP FUNCTION IF EXISTS public.fn_catalogo_litro_canonico(uuid, uuid);

-- Triggers legados sem o desvio de modo de sincronizacao
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
$function$;

CREATE OR REPLACE FUNCTION public.sync_microorganism_pricing()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
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
    NEW.valor_litro_brl := CASE WHEN NEW.valor_dose_brl IS NULL THEN NULL ELSE NEW.valor_dose_brl * 10 END;
  END IF;

  RETURN NEW;
END;
$function$;

DROP POLICY IF EXISTS produtos_b2b_read ON public.produtos;
CREATE POLICY produtos_b2b_read ON public.produtos
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(),'parceiro_b2b') OR public.has_role(auth.uid(),'parceiro_b2b_tecnico')
);

DROP POLICY IF EXISTS micros_b2b_read ON public.microrganismos;
CREATE POLICY micros_b2b_read ON public.microrganismos
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(),'parceiro_b2b') OR public.has_role(auth.uid(),'parceiro_b2b_tecnico')
);

COMMIT;
