-- SELECT-only; NÃO executar migration. Usar após eventual aplicação EXTERNA autorizada.
-- Reexecutar/exportar integralmente o preflight B3.2 no mesmo snapshot read-only.
-- Expectativa: manifesto antigo idêntico; ampliado difere SOMENTE pelas duas colunas e comentários.
SELECT (SELECT count(*) FROM public.partner_user_clients) AS puc_rows,
 (SELECT count(*) FROM public.partner_technician_clients) AS ptc_rows;
SELECT count(*)=2 AND bool_and(udt_name=CASE column_name WHEN 'grant_origin' THEN 'text' ELSE 'uuid' END
 AND is_nullable='YES' AND column_default IS NULL) AS neutral_columns_shape
FROM information_schema.columns WHERE table_schema='public' AND table_name='partner_technician_clients'
 AND column_name IN ('grant_origin','source_puc_id');
-- Funciona também antes da implantação: jsonb -> chave ausente retorna NULL.
SELECT count(*) FILTER (WHERE to_jsonb(t)->>'grant_origin' IS NOT NULL
 OR to_jsonb(t)->>'source_puc_id' IS NOT NULL) AS populated_untrusted_metadata
FROM public.partner_technician_clients t;
SELECT policyname,permissive,roles,cmd,qual,with_check FROM pg_policies
WHERE schemaname='public' AND tablename='partner_user_clients'
 AND policyname='bf02_assignment_contract_containment';
-- Esperado RESTRICTIVE/ALL, false/false. Ausência/diferença = NO-GO.
-- Zero linhas/policy intacta NÃO prova acesso legítimo A/B, nem revogação ou recuperação.
