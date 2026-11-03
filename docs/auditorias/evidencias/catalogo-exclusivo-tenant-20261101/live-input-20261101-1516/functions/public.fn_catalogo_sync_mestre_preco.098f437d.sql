CREATE OR REPLACE FUNCTION public.fn_catalogo_sync_mestre_preco(p_produto_id uuid, p_microrganismo_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
