-- ============================================================================
-- POSTCHECK H3c — comportamental e transacional (termina em ROLLBACK).
-- Executar: psql "$STAGING_DSN" -v ON_ERROR_STOP=1 -f 42-h3c-postcheck.sql
-- ============================================================================
BEGIN;

-- A) Zero divergencia entre canonico e cache derivado (itens com apresentacao ativa)
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n
  FROM public.produtos p, LATERAL public.fn_catalogo_litro_canonico(p.id, NULL) c
  WHERE p.ativo AND c.tiers = 1
    AND round(p.valor_litro_brl, 2) IS DISTINCT FROM c.litro;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL_H3C_DIVERGENCIA_PRODUTOS: %', n; END IF;

  SELECT count(*) INTO n
  FROM public.microrganismos m, LATERAL public.fn_catalogo_litro_canonico(NULL, m.id) c
  WHERE m.ativo AND c.tiers = 1
    AND round(m.valor_litro_brl, 2) IS DISTINCT FROM c.litro;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL_H3C_DIVERGENCIA_MICROS: %', n; END IF;
  RAISE NOTICE 'PASS_H3C_ZERO_DIVERGENCIA';
END $$;

-- B) Caso BioInseticida 02: canonico, cache e resolvedor comercial coerentes
DO $$
DECLARE v_id uuid; v_mestre numeric; v_canon numeric; v_b2b jsonb;
BEGIN
  SELECT id, round(valor_litro_brl,2) INTO v_id, v_mestre FROM public.produtos WHERE nome = 'BioInseticida 02';
  v_canon := round(public.fn_catalogo_preco_canonico(v_id, NULL, 'litro'), 2);
  v_b2b   := public.fn_b2b_resolve_base_unit_price(NULL, v_id, NULL, 'litro');
  IF v_canon <> 216.67 OR v_mestre <> 216.67
     OR round((v_b2b->>'base_price')::numeric,2) <> 216.67
     OR v_b2b->>'price_source' <> 'catalog_volume_price' THEN
    RAISE EXCEPTION 'FAIL_H3C_BIOINSETICIDA02: mestre=% canon=% b2b=%', v_mestre, v_canon, v_b2b;
  END IF;
  RAISE NOTICE 'PASS_H3C_BIOINSETICIDA02';
END $$;

-- C) Guarda anti-divergencia: edicao direta no mestre nao cria segunda fonte
DO $$
DECLARE v_id uuid; v_after numeric;
BEGIN
  SELECT id INTO v_id FROM public.produtos WHERE nome = 'BioInseticida 02';
  UPDATE public.produtos SET valor_litro_brl = 999.99 WHERE id = v_id;
  SELECT round(valor_litro_brl,2) INTO v_after FROM public.produtos WHERE id = v_id;
  IF v_after <> 216.67 THEN RAISE EXCEPTION 'FAIL_H3C_GUARD_MESTRE: %', v_after; END IF;
  RAISE NOTICE 'PASS_H3C_GUARD_MESTRE';
END $$;

-- D) Direcao unica: alterar catalogo_volumes propaga ao cache derivado
DO $$
DECLARE v_id uuid; v_after numeric; v_dose numeric;
BEGIN
  SELECT id INTO v_id FROM public.produtos WHERE nome = 'BioInseticida 02';
  UPDATE public.catalogo_volumes SET preco_brl = 1100 WHERE produto_id = v_id AND volume_ml = 5000;
  UPDATE public.catalogo_volumes SET preco_brl = 4400 WHERE produto_id = v_id AND volume_ml = 20000;
  SELECT round(valor_litro_brl,2), round(valor_dose_brl,2) INTO v_after, v_dose
    FROM public.produtos WHERE id = v_id;
  IF v_after <> 220.00 OR v_dose <> 22.00 THEN
    RAISE EXCEPTION 'FAIL_H3C_SYNC_VOLUME: litro=% dose=%', v_after, v_dose;
  END IF;
  RAISE NOTICE 'PASS_H3C_SYNC_VOLUME';
END $$;

-- E) Tiers por volume: cache legado nao pode fingir fonte unica
DO $$
DECLARE v_id uuid; v_litro numeric; v_src text;
BEGIN
  SELECT id INTO v_id FROM public.produtos WHERE nome = 'BioInseticida 02';
  UPDATE public.catalogo_volumes SET preco_brl = 1500 WHERE produto_id = v_id AND volume_ml = 5000;
  SELECT valor_litro_brl INTO v_litro FROM public.produtos WHERE id = v_id;
  IF v_litro IS NOT NULL THEN RAISE EXCEPTION 'FAIL_H3C_TIERS_CACHE: %', v_litro; END IF;
  v_src := public.fn_b2b_resolve_base_unit_price(NULL, v_id, NULL, 'litro', 5000)->>'price_source';
  IF v_src <> 'catalog_volume_price' THEN RAISE EXCEPTION 'FAIL_H3C_TIERS_SOURCE: %', v_src; END IF;
  RAISE NOTICE 'PASS_H3C_TIERS_SEM_FONTE_DUPLA';
END $$;

-- F) Policies B2B exigem papel + ativo + b2b_enabled
DO $$
DECLARE d text;
BEGIN
  FOR d IN
    SELECT pg_get_expr(pol.polqual, pol.polrelid)
    FROM pg_policy pol
    WHERE pol.polname IN ('produtos_b2b_read','micros_b2b_read')
  LOOP
    IF d NOT LIKE '%ativo%' OR d NOT LIKE '%b2b_enabled%' THEN
      RAISE EXCEPTION 'FAIL_H3C_POLICY_B2B: %', d;
    END IF;
  END LOOP;
  RAISE NOTICE 'PASS_H3C_POLICY_B2B';
END $$;

-- G) anon nao executa as funcoes de sincronizacao
DO $$
BEGIN
  IF has_function_privilege('anon', 'public.fn_catalogo_sync_mestre_preco(uuid,uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_catalogo_litro_canonico(uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL_H3C_ANON_EXEC';
  END IF;
  RAISE NOTICE 'PASS_H3C_ANON_SEM_EXEC';
END $$;

ROLLBACK;
