-- ROLLBACK PREFERENCIAL do candidato proposed-platform-global-product-composition.sql (somente se aplicado).
-- NÃO executar sem autorização específica. Preserva TODOS os dados e o histórico:
--   * revoga EXECUTE das RPCs (leitura/escrita) — a UI passa a falhar fechada ("Não foi possível consultar a composição");
--   * mantém tabelas, declarações, conjuntos, ledger, policies e triggers de coerência (o guard de família continua
--     protegendo dados existentes; sem declarações ele é inócuo);
--   * NÃO faz DROP, DELETE ou TRUNCATE. Reverter a UI = voltar o commit do painel/botão "Composição".
-- Reativar depois = GRANT EXECUTE ... TO authenticated nas 4 funções abaixo (mesma assinatura).
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_setting('request.jwt.claims', true) IS NOT NULL AND current_setting('request.jwt.claims', true) <> '' THEN
    RAISE EXCEPTION 'composition_rollback_must_run_as_owner'; END IF;
  IF to_regprocedure('public.platform_read_global_product_composition(uuid,integer,integer)') IS NULL THEN
    RAISE EXCEPTION 'composition_rollback_not_applied'; END IF;
END $$;
-- Evidência antes (anexar): contagens preservadas.
SELECT (SELECT count(*) FROM public.produto_composicao_conjuntos) AS conjuntos,
       (SELECT count(*) FROM public.produto_composicao_declaracoes) AS declaracoes,
       (SELECT count(*) FROM public.catalog_platform_admin_audit WHERE operation='set_global_product_composition') AS ledger;
REVOKE EXECUTE ON FUNCTION public.platform_read_global_product_composition(uuid,integer,integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.platform_set_global_product_composition(uuid,timestamptz,text,jsonb,text,uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION platform_private.read_global_product_composition_core(uuid,integer,integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION platform_private.set_global_product_composition_core(uuid,timestamptz,text,jsonb,text,uuid) FROM authenticated;
DO $$ BEGIN
  IF has_function_privilege('authenticated','public.platform_set_global_product_composition(uuid,timestamptz,text,jsonb,text,uuid)','EXECUTE')
    OR has_function_privilege('authenticated','public.platform_read_global_product_composition(uuid,integer,integer)','EXECUTE') THEN
    RAISE EXCEPTION 'composition_rollback_grant_remains'; END IF;
END $$;
COMMIT;

-- -------------------------------------------------------------------------------------------
-- REMOÇÃO DESTRUTIVA (NÃO é o padrão; comentada). Só com autorização explícita do proprietário, após
-- exportar `produto_composicao_conjuntos`, `produto_composicao_declaracoes` e o ledger para a evidência.
-- O ledger 'set_global_product_composition' é imutável e permanece mesmo nesse cenário.
-- DROP TRIGGER produtos_composicao_family_guard ON public.produtos;
-- DROP FUNCTION public.platform_set_global_product_composition(uuid,timestamptz,text,jsonb,text,uuid);
-- DROP FUNCTION public.platform_read_global_product_composition(uuid,integer,integer);
-- DROP FUNCTION platform_private.set_global_product_composition_core(uuid,timestamptz,text,jsonb,text,uuid);
-- DROP FUNCTION platform_private.read_global_product_composition_core(uuid,integer,integer);
-- DROP TABLE public.produto_composicao_declaracoes; DROP TABLE public.produto_composicao_conjuntos;
