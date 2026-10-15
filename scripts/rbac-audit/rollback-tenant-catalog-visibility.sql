-- ROLLBACK preferencial da visibilidade por empresa — NÃO APLICAR sem autorização.
-- Revoga somente os NOVOS pontos de entrada. Preserva catalog_tenant_visibility e o ledger (sem DROP, sem DELETE).
-- NUNCA concede escrita em produtos/microrganismos/culturas/formulacoes/catalogo_volumes.
-- A UI deve voltar ao commit anterior (sem chamadas tenant_catalog_*) junto com este script.
REVOKE EXECUTE ON FUNCTION public.tenant_catalog_set_visibility(text,uuid,boolean,integer,text,uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.tenant_catalog_read_visibility(text,uuid[]) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.tenant_catalog_selection_page(text,text,integer,integer,uuid[]) FROM authenticated;
REVOKE EXECUTE ON FUNCTION platform_private.catalog_tenant_set_visibility_core(text,uuid,boolean,integer,text,uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION platform_private.catalog_tenant_read_visibility_core(text,uuid[]) FROM authenticated;
REVOKE EXECUTE ON FUNCTION platform_private.catalog_tenant_selection_core(text,text,integer,integer,uuid[]) FROM authenticated;
-- Verificação pós-rollback (somente leitura):
-- SELECT has_function_privilege('authenticated','public.tenant_catalog_set_visibility(text,uuid,boolean,integer,text,uuid)','EXECUTE'); -- false
-- SELECT count(*) FROM public.catalog_tenant_visibility; SELECT count(*) FROM public.catalog_tenant_visibility_ledger; -- inalterados
