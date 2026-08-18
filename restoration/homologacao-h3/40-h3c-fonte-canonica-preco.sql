-- ============================================================================
-- FASE H3c — CORRECAO FOCADA POS-H3 (staging ikaauvsflpmamgxmkhoq)
-- Objetivos:
--   H3-012 (P1) Duas fontes editaveis de preco vivo (catalogo_volumes x mestre).
--                catalogo_volumes passa a ser a UNICA fonte canonica editavel;
--                produtos/microrganismos.valor_* viram CACHE DERIVADO.
--   H3-013 (P1) Policies B2B de produtos/microrganismos exigiam apenas papel.
--                Agora exigem tambem ativo = true AND b2b_enabled = true.
-- Direcao unica de sincronizacao: catalogo_volumes -> mestre. Nunca o inverso.
-- Reversivel: restoration/homologacao-h3/41-h3c-rollback.sql
-- Nao recalcula historico (pedidos/simulacoes usam snapshot proprio).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Preco/litro canonico (unico) e deteccao de tiers por volume
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_catalogo_litro_canonico(
  p_produto_id uuid,
  p_microrganismo_id uuid,
  OUT litro numeric,
  OUT tiers integer
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT min(round(cv.preco_litro_brl,2)),
         COALESCE(count(DISTINCT round(cv.preco_litro_brl,2)),0)::int
  FROM public.catalogo_volumes cv
  WHERE cv.ativo = true
    AND cv.preco_litro_brl IS NOT NULL
    AND cv.produto_id IS NOT DISTINCT FROM p_produto_id
    AND cv.microrganismo_id IS NOT DISTINCT FROM p_microrganismo_id;
$fn$;

REVOKE ALL ON FUNCTION public.fn_catalogo_litro_canonico(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_catalogo_litro_canonico(uuid,uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2) Triggers legados de pricing do mestre passam a respeitar o modo de
--    sincronizacao canonica (evita reescrita/arredondamento em cascata).
-- ---------------------------------------------------------------------------
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
  IF COALESCE(current_setting('arbio.catalogo_sync', true), 'off') = 'on' THEN
    RETURN NEW;
  END IF;

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

-- ---------------------------------------------------------------------------
-- 3) Sincronizacao canonica: catalogo_volumes -> cache derivado no mestre
--    - preco/L unico  => cache preenchido com o valor canonico exato;
--    - tiers por volume => cache ZERADO (NULL): campos legados nao podem
--      fingir fonte unica; caminhos comerciais usam catalogo_volumes;
--    - sem apresentacao ativa => cache legado preservado (fallback).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_catalogo_sync_mestre_preco(
  p_produto_id uuid,
  p_microrganismo_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_litro numeric;
  v_tiers integer;
BEGIN
  IF num_nonnulls(p_produto_id, p_microrganismo_id) <> 1 THEN RETURN; END IF;

  SELECT litro, tiers INTO v_litro, v_tiers
  FROM public.fn_catalogo_litro_canonico(p_produto_id, p_microrganismo_id);

  IF COALESCE(v_tiers,0) = 0 THEN
    RETURN; -- sem apresentacao ativa: preserva fallback legado
  END IF;

  PERFORM set_config('arbio.catalogo_sync', 'on', true);

  IF p_produto_id IS NOT NULL THEN
    IF v_tiers = 1 AND COALESCE(v_litro,0) > 0 THEN
      UPDATE public.produtos p
         SET valor_litro_brl = v_litro,
             valor_dose_brl  = round(v_litro / 10.0, 2),
             valor_ha_brl    = CASE WHEN COALESCE(p.dose_ml_ha,0) > 0
                                    THEN round(v_litro * (p.dose_ml_ha / 1000.0), 2) END
       WHERE p.id = p_produto_id
         AND (p.valor_litro_brl IS DISTINCT FROM v_litro
              OR p.valor_dose_brl IS DISTINCT FROM round(v_litro / 10.0, 2));
    ELSE
      UPDATE public.produtos p
         SET valor_litro_brl = NULL, valor_dose_brl = NULL, valor_ha_brl = NULL
       WHERE p.id = p_produto_id
         AND (p.valor_litro_brl IS NOT NULL OR p.valor_dose_brl IS NOT NULL OR p.valor_ha_brl IS NOT NULL);
    END IF;
  ELSE
    IF v_tiers = 1 AND COALESCE(v_litro,0) > 0 THEN
      UPDATE public.microrganismos m
         SET valor_litro_brl = v_litro,
             valor_dose_brl  = round(v_litro / 10.0, 2)
       WHERE m.id = p_microrganismo_id
         AND (m.valor_litro_brl IS DISTINCT FROM v_litro
              OR m.valor_dose_brl IS DISTINCT FROM round(v_litro / 10.0, 2));
    ELSE
      UPDATE public.microrganismos m
         SET valor_litro_brl = NULL, valor_dose_brl = NULL
       WHERE m.id = p_microrganismo_id
         AND (m.valor_litro_brl IS NOT NULL OR m.valor_dose_brl IS NOT NULL);
    END IF;
  END IF;

  PERFORM set_config('arbio.catalogo_sync', 'off', true);
END
$fn$;

REVOKE ALL ON FUNCTION public.fn_catalogo_sync_mestre_preco(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_catalogo_sync_mestre_preco(uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.trg_catalogo_volumes_sync_mestre()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    PERFORM public.fn_catalogo_sync_mestre_preco(OLD.produto_id, OLD.microrganismo_id);
  END IF;
  IF TG_OP <> 'DELETE' THEN
    PERFORM public.fn_catalogo_sync_mestre_preco(NEW.produto_id, NEW.microrganismo_id);
  END IF;
  RETURN NULL;
END
$fn$;

DROP TRIGGER IF EXISTS trg_zz_catalogo_volumes_sync_mestre ON public.catalogo_volumes;
CREATE TRIGGER trg_zz_catalogo_volumes_sync_mestre
AFTER INSERT OR UPDATE OR DELETE ON public.catalogo_volumes
FOR EACH ROW EXECUTE FUNCTION public.trg_catalogo_volumes_sync_mestre();

-- ---------------------------------------------------------------------------
-- 4) Guarda anti-divergencia no mestre (direcao unica).
--    Roda DEPOIS dos triggers legados (ordem alfabetica: trg_zz_*).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_mestre_guard_preco_canonico()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
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
$fn$;

DROP TRIGGER IF EXISTS trg_zz_produtos_guard_preco ON public.produtos;
CREATE TRIGGER trg_zz_produtos_guard_preco
BEFORE INSERT OR UPDATE ON public.produtos
FOR EACH ROW EXECUTE FUNCTION public.trg_mestre_guard_preco_canonico();

DROP TRIGGER IF EXISTS trg_zz_microrganismos_guard_preco ON public.microrganismos;
CREATE TRIGGER trg_zz_microrganismos_guard_preco
BEFORE INSERT OR UPDATE ON public.microrganismos
FOR EACH ROW EXECUTE FUNCTION public.trg_mestre_guard_preco_canonico();

COMMENT ON COLUMN public.produtos.valor_litro_brl IS
  'LEGADO NAO-CANONICO / CACHE DERIVADO de catalogo_volumes (H3c). Nao editar diretamente.';
COMMENT ON COLUMN public.produtos.valor_dose_brl IS
  'LEGADO NAO-CANONICO / CACHE DERIVADO de catalogo_volumes (H3c). Nao editar diretamente.';
COMMENT ON COLUMN public.produtos.valor_ha_brl IS
  'LEGADO NAO-CANONICO / CACHE DERIVADO de catalogo_volumes x dose_ml_ha (H3c).';
COMMENT ON COLUMN public.microrganismos.valor_litro_brl IS
  'LEGADO NAO-CANONICO / CACHE DERIVADO de catalogo_volumes (H3c). Nao editar diretamente.';
COMMENT ON COLUMN public.microrganismos.valor_dose_brl IS
  'LEGADO NAO-CANONICO / CACHE DERIVADO de catalogo_volumes (H3c). Nao editar diretamente.';

-- ---------------------------------------------------------------------------
-- 5) Backfill unico: alinha o cache derivado ao canonico vigente.
--    Corrige BioInseticida 02 (169.80 -> 216.67), E.M (150 -> 100) e
--    Pantoea agglomerans (NULL -> 250). Historico de pedidos intocado.
-- ---------------------------------------------------------------------------
DO $backfill$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT DISTINCT produto_id, microrganismo_id
    FROM public.catalogo_volumes WHERE ativo = true
  LOOP
    PERFORM public.fn_catalogo_sync_mestre_preco(r.produto_id, r.microrganismo_id);
  END LOOP;
END
$backfill$;

-- ---------------------------------------------------------------------------
-- 6) Policies B2B do mestre: papel + item ativo + b2b_enabled
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS produtos_b2b_read ON public.produtos;
CREATE POLICY produtos_b2b_read ON public.produtos
FOR SELECT TO authenticated
USING (
  (public.has_role(auth.uid(),'parceiro_b2b') OR public.has_role(auth.uid(),'parceiro_b2b_tecnico'))
  AND ativo = true
  AND COALESCE(b2b_enabled, false) = true
);

DROP POLICY IF EXISTS micros_b2b_read ON public.microrganismos;
CREATE POLICY micros_b2b_read ON public.microrganismos
FOR SELECT TO authenticated
USING (
  (public.has_role(auth.uid(),'parceiro_b2b') OR public.has_role(auth.uid(),'parceiro_b2b_tecnico'))
  AND ativo = true
  AND COALESCE(b2b_enabled, false) = true
);
