\pset pager off
\set ON_ERROR_STOP on
BEGIN;
-- 1) Arredondamento determinístico
SELECT CASE WHEN count(*)=0 THEN 'PASS_H3_ROUNDING' ELSE 'FAIL_H3_ROUNDING:'||count(*) END
FROM public.catalogo_volumes
WHERE (preco_litro_brl IS NOT NULL AND preco_litro_brl <> round(preco_litro_brl,2))
   OR (valor_dose_100ml_brl IS NOT NULL AND valor_dose_100ml_brl <> round(valor_dose_100ml_brl,2));
-- 2) Regra 1 L = 10 doses / dose 100 mL
SELECT CASE WHEN count(*)=0 THEN 'PASS_H3_DOSE_RULE' ELSE 'FAIL_H3_DOSE_RULE:'||count(*) END
FROM public.catalogo_volumes
WHERE volume_ml > 0 AND (
  doses_por_volume IS DISTINCT FROM round(volume_ml/100.0,4)
  OR (preco_brl IS NOT NULL AND (
        preco_litro_brl IS DISTINCT FROM round(preco_brl/(volume_ml/1000.0),2)
     OR valor_dose_100ml_brl IS DISTINCT FROM round(round(preco_brl/(volume_ml/1000.0),2)/10.0,2)))
);
-- 3) Coerência litro = dose × 10 nos mestres
SELECT CASE WHEN count(*)=0 THEN 'PASS_H3_MESTRES_PRECO' ELSE 'FAIL_H3_MESTRES_PRECO:'||count(*) END FROM (
  SELECT 1 FROM public.produtos WHERE valor_litro_brl IS NOT NULL AND valor_dose_brl IS NOT NULL
     AND round(valor_litro_brl,2) IS DISTINCT FROM round(valor_dose_brl*10,2)
  UNION ALL
  SELECT 1 FROM public.microrganismos WHERE valor_litro_brl IS NOT NULL AND valor_dose_brl IS NOT NULL
     AND round(valor_litro_brl,2) IS DISTINCT FROM round(valor_dose_brl*10,2)
) x;
-- 4) Nenhuma policy ampla remanescente em produtos/microrganismos
SELECT CASE WHEN count(*)=0 THEN 'PASS_H3_NO_BROAD_SELECT' ELSE 'FAIL_H3_NO_BROAD_SELECT:'||count(*) END
FROM pg_policies WHERE schemaname='public' AND tablename IN ('produtos','microrganismos')
  AND cmd='SELECT' AND btrim(coalesce(qual,''))='true';
-- 5) Views de ficha existem e não expõem colunas sensíveis
SELECT CASE WHEN count(*)=0 THEN 'PASS_H3_VIEW_SAFE_COLUMNS' ELSE 'FAIL_H3_VIEW_SAFE_COLUMNS' END
FROM information_schema.columns
WHERE table_schema='public' AND table_name IN ('vw_catalogo_ficha_produtos','vw_catalogo_ficha_microrganismos')
  AND column_name IN ('fornecedor','meio_cultivo','observacoes','preco_tabela','safra_referencia');
-- 6) anon sem acesso às views
SELECT CASE WHEN count(*)=0 THEN 'PASS_H3_VIEW_NO_ANON' ELSE 'FAIL_H3_VIEW_NO_ANON' END
FROM information_schema.role_table_grants
WHERE table_schema='public' AND grantee='anon'
  AND table_name IN ('vw_catalogo_ficha_produtos','vw_catalogo_ficha_microrganismos');
-- 7) Comportamental: cliente_produtor não lê tabelas mestres, mas lê a view
DO $$
DECLARE v_produtor uuid; v_admin uuid; n_tab int; n_view int; n_admin int;
BEGIN
  SELECT user_id INTO v_produtor FROM public.user_roles WHERE role='cliente_produtor' LIMIT 1;
  SELECT user_id INTO v_admin FROM public.user_roles WHERE role='administrador' LIMIT 1;
  IF v_produtor IS NULL OR v_admin IS NULL THEN RAISE NOTICE 'SKIP_H3_BEHAVIOR_NO_FIXTURE'; RETURN; END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_produtor,'role','authenticated')::text, true);
  PERFORM set_config('role','authenticated', true);
  SELECT count(*) INTO n_tab FROM public.produtos;
  SELECT count(*) INTO n_view FROM public.vw_catalogo_ficha_produtos;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_admin,'role','authenticated')::text, true);
  PERFORM set_config('role','authenticated', true);
  SELECT count(*) INTO n_admin FROM public.produtos;
  RESET ROLE;

  IF n_tab = 0 AND n_view > 0 AND n_admin > 0 THEN
    RAISE NOTICE 'PASS_H3_BEHAVIOR produtor_tabela=% produtor_view=% admin_tabela=%', n_tab, n_view, n_admin;
  ELSE
    RAISE EXCEPTION 'FAIL_H3_BEHAVIOR produtor_tabela=% produtor_view=% admin_tabela=%', n_tab, n_view, n_admin;
  END IF;
END $$;
ROLLBACK;
