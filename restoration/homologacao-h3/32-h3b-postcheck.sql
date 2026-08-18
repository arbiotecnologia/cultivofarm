\pset pager off
\set ON_ERROR_STOP on
BEGIN;

-- ===========================================================================
-- POSTCHECK H3b — staging ikaauvsflpmamgxmkhoq (transacional, ROLLBACK ao fim)
-- ===========================================================================

-- 1) Nenhuma policy permissiva B2B sem exigência de aprovação
SELECT CASE WHEN count(*)=0 THEN 'PASS_H3B_NO_PERMISSIVE_B2B_POLICY'
            ELSE 'FAIL_H3B_NO_PERMISSIVE_B2B_POLICY:'||count(*) END
FROM pg_policies
WHERE schemaname='public'
  AND tablename IN ('microorganism_technical_profiles','product_technical_profiles')
  AND cmd='SELECT'
  AND coalesce(qual,'') NOT LIKE '%aprovado%';

-- 2) Função canônica existe e não é executável por anon
SELECT CASE WHEN count(*)=1 THEN 'PASS_H3B_FN_CANONICA' ELSE 'FAIL_H3B_FN_CANONICA' END
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='fn_catalogo_preco_canonico';

SELECT CASE WHEN NOT has_function_privilege('anon','public.fn_catalogo_preco_canonico(uuid,uuid,text,numeric)','EXECUTE')
            THEN 'PASS_H3B_FN_NO_ANON' ELSE 'FAIL_H3B_FN_NO_ANON' END;

-- 3) Resolvedores comerciais consultam a fonte canônica antes do mestre
SELECT CASE WHEN count(*)=2 THEN 'PASS_H3B_RESOLVERS_CANONICOS'
            ELSE 'FAIL_H3B_RESOLVERS_CANONICOS:'||count(*) END
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public'
  AND p.proname IN ('fn_b2b_resolve_base_unit_price','fn_resolve_commercial_price')
  AND pg_get_functiondef(p.oid) LIKE '%fn_catalogo_preco_canonico%';

-- 4) BioInseticida 02: payload canônico 216.67/L e 21.67/100 mL (não 169.80/16.98)
SELECT CASE
         WHEN public.fn_catalogo_preco_canonico(p.id,NULL,'litro',NULL) = 216.67
          AND public.fn_catalogo_preco_canonico(p.id,NULL,'dose',NULL)  = 21.67
         THEN 'PASS_H3B_BIOINSETICIDA02'
         ELSE 'FAIL_H3B_BIOINSETICIDA02:'
              ||coalesce(public.fn_catalogo_preco_canonico(p.id,NULL,'litro',NULL)::text,'null')
              ||'/'||coalesce(public.fn_catalogo_preco_canonico(p.id,NULL,'dose',NULL)::text,'null')
       END
FROM public.produtos p WHERE p.nome = 'BioInseticida 02';

-- 5) Paridade catálogo → payload comercial em TODOS os itens com volume ativo
SELECT CASE WHEN count(*)=0 THEN 'PASS_H3B_PARIDADE_CATALOGO_PAYLOAD'
            ELSE 'FAIL_H3B_PARIDADE_CATALOGO_PAYLOAD:'||count(*) END
FROM (
  SELECT cv.produto_id, cv.microrganismo_id, round(cv.preco_litro_brl,2) AS litro
  FROM public.catalogo_volumes cv WHERE cv.ativo
  GROUP BY 1,2,3
) x
WHERE public.fn_catalogo_preco_canonico(x.produto_id, x.microrganismo_id, 'litro', NULL) IS DISTINCT FROM x.litro
   OR public.fn_catalogo_preco_canonico(x.produto_id, x.microrganismo_id, 'dose', NULL)
      IS DISTINCT FROM round(x.litro/10.0,2);

-- 6) Divergências mestre × catálogo ainda existentes (inventário, não bloqueia)
SELECT 'INFO_H3B_DIVERGENCIA_LEGADO' AS tag, coalesce(p.nome,m.nome) AS item,
       coalesce(p.valor_litro_brl,m.valor_litro_brl) AS legado_litro,
       round(cv.preco_litro_brl,2) AS canonico_litro
FROM public.catalogo_volumes cv
LEFT JOIN public.produtos p ON p.id = cv.produto_id
LEFT JOIN public.microrganismos m ON m.id = cv.microrganismo_id
WHERE cv.ativo
  AND round(coalesce(p.valor_litro_brl, m.valor_litro_brl, -1),2) <> round(cv.preco_litro_brl,2)
GROUP BY 2,3,4 ORDER BY 2;

-- 7) Arredondamento e regra de dose preservados nos 64 volumes ativos
SELECT CASE WHEN count(*)=0 THEN 'PASS_H3B_PRECO_VOLUMES' ELSE 'FAIL_H3B_PRECO_VOLUMES:'||count(*) END
FROM public.catalogo_volumes
WHERE ativo AND volume_ml > 0 AND (
  preco_litro_brl IS DISTINCT FROM round(preco_brl/(volume_ml/1000.0),2)
  OR valor_dose_100ml_brl IS DISTINCT FROM round(round(preco_brl/(volume_ml/1000.0),2)/10.0,2)
  OR doses_por_volume IS DISTINCT FROM round(volume_ml/100.0,4)
);

-- 8) Views sem colunas internas e sem grant para anon
SELECT CASE WHEN count(*)=0 THEN 'PASS_H3B_VIEW_SAFE_COLUMNS' ELSE 'FAIL_H3B_VIEW_SAFE_COLUMNS' END
FROM information_schema.columns
WHERE table_schema='public'
  AND table_name IN ('vw_catalogo_ficha_produtos','vw_catalogo_ficha_microrganismos')
  AND column_name IN ('fornecedor','meio_cultivo','observacoes','preco_tabela','safra_referencia','b2b_enabled');

SELECT CASE WHEN count(*)=0 THEN 'PASS_H3B_VIEW_NO_ANON' ELSE 'FAIL_H3B_VIEW_NO_ANON' END
FROM information_schema.role_table_grants
WHERE table_schema='public' AND grantee='anon'
  AND table_name IN ('vw_catalogo_ficha_produtos','vw_catalogo_ficha_microrganismos');

-- 9) Comportamental por JWT real
DO $$
DECLARE
  v_b2b uuid; v_b2b_tec uuid; v_prod uuid; v_admin uuid;
  n int; n_apr int; n_view int; n_inativo int;
BEGIN
  -- Fixtures externos "puros": usuários sem nenhum papel interno acumulado
  -- (um parceiro que também é consultor_tecnico enxerga como interno, por direito).
  SELECT ur.user_id INTO v_b2b FROM public.user_roles ur
   WHERE ur.role='parceiro_b2b' AND NOT public.can_view_catalog_internal(ur.user_id) LIMIT 1;
  SELECT ur.user_id INTO v_b2b_tec FROM public.user_roles ur
   WHERE ur.role='parceiro_b2b_tecnico' AND NOT public.can_view_catalog_internal(ur.user_id) LIMIT 1;
  SELECT ur.user_id INTO v_prod FROM public.user_roles ur
   WHERE ur.role='cliente_produtor' AND NOT public.can_view_catalog_internal(ur.user_id) LIMIT 1;
  SELECT user_id INTO v_admin   FROM public.user_roles WHERE role='administrador' LIMIT 1;

  -- B2B: nenhuma ficha não aprovada
  IF v_b2b IS NOT NULL THEN
    PERFORM set_config('request.jwt.claims', json_build_object('sub',v_b2b,'role','authenticated')::text, true);
    PERFORM set_config('role','authenticated', true);
    SELECT count(*) INTO n FROM public.microorganism_technical_profiles WHERE status_validacao <> 'aprovado';
    SELECT count(*) INTO n_apr FROM public.microorganism_technical_profiles WHERE status_validacao = 'aprovado';
    SELECT count(*) INTO n_inativo FROM public.product_technical_profiles WHERE status_validacao <> 'aprovado';
    RESET ROLE;
    IF n = 0 AND n_inativo = 0 THEN
      RAISE NOTICE 'PASS_H3B_B2B_NON_APPROVED_ZERO (aprovados_visiveis=%)', n_apr;
    ELSE
      RAISE EXCEPTION 'FAIL_H3B_B2B_NON_APPROVED micro=% produto=%', n, n_inativo;
    END IF;
  ELSE RAISE NOTICE 'SKIP_H3B_B2B_SEM_FIXTURE'; END IF;

  -- B2B técnico
  IF v_b2b_tec IS NOT NULL THEN
    PERFORM set_config('request.jwt.claims', json_build_object('sub',v_b2b_tec,'role','authenticated')::text, true);
    PERFORM set_config('role','authenticated', true);
    SELECT count(*) INTO n FROM public.microorganism_technical_profiles WHERE status_validacao <> 'aprovado';
    SELECT count(*) INTO n_inativo FROM public.product_technical_profiles WHERE status_validacao <> 'aprovado';
    RESET ROLE;
    IF n = 0 AND n_inativo = 0 THEN RAISE NOTICE 'PASS_H3B_B2B_TECNICO_NON_APPROVED_ZERO';
    ELSE RAISE EXCEPTION 'FAIL_H3B_B2B_TECNICO micro=% produto=%', n, n_inativo; END IF;
  ELSE RAISE NOTICE 'SKIP_H3B_B2B_TECNICO_SEM_FIXTURE'; END IF;

  -- Produtor
  IF v_prod IS NOT NULL THEN
    PERFORM set_config('request.jwt.claims', json_build_object('sub',v_prod,'role','authenticated')::text, true);
    PERFORM set_config('role','authenticated', true);
    SELECT count(*) INTO n FROM public.microorganism_technical_profiles WHERE status_validacao <> 'aprovado';
    SELECT count(*) INTO n_inativo FROM public.product_technical_profiles WHERE status_validacao <> 'aprovado';
    SELECT count(*) INTO n_view FROM public.vw_catalogo_ficha_produtos;
    RESET ROLE;
    IF n = 0 AND n_inativo = 0 THEN
      RAISE NOTICE 'PASS_H3B_PRODUTOR_NON_APPROVED_ZERO (view_produtos=%)', n_view;
    ELSE RAISE EXCEPTION 'FAIL_H3B_PRODUTOR micro=% produto=%', n, n_inativo; END IF;
  ELSE RAISE NOTICE 'SKIP_H3B_PRODUTOR_SEM_FIXTURE'; END IF;

  -- Interno mantém leitura legítima
  IF v_admin IS NOT NULL THEN
    PERFORM set_config('request.jwt.claims', json_build_object('sub',v_admin,'role','authenticated')::text, true);
    PERFORM set_config('role','authenticated', true);
    SELECT count(*) INTO n FROM public.microorganism_technical_profiles;
    SELECT count(*) INTO n_view FROM public.vw_catalogo_ficha_produtos;
    RESET ROLE;
    IF n > 0 AND n_view > 0 THEN RAISE NOTICE 'PASS_H3B_INTERNO_LEITURA (perfis=% view=%)', n, n_view;
    ELSE RAISE EXCEPTION 'FAIL_H3B_INTERNO perfis=% view=%', n, n_view; END IF;
  ELSE RAISE NOTICE 'SKIP_H3B_INTERNO_SEM_FIXTURE'; END IF;
END $$;

-- 10) Views só devolvem itens ativos
SELECT CASE WHEN count(*)=0 THEN 'PASS_H3B_VIEW_SOMENTE_ATIVOS' ELSE 'FAIL_H3B_VIEW_SOMENTE_ATIVOS' END
FROM public.vw_catalogo_ficha_produtos WHERE ativo IS DISTINCT FROM true;

ROLLBACK;
