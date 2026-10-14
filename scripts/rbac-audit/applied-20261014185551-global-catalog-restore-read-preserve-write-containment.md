# 20261014185551 global_catalog_restore_read_preserve_write_containment — RESUMO (não é SQL literal)

Aplicado externamente pelo Codex no canônico `swzpzcwiasxmjutrmvkm`. Texto exato da migration não foi fornecido; este é um resumo honesto. NÃO REAPLICAR a partir deste arquivo.

- REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER em `public.produtos` e `public.microrganismos` FROM PUBLIC, anon, authenticated.
- Substituídas as policies RESTRICTIVE FOR ALL `d51_5_catalog_global_mutation` (produtos) e `d51_5_microorganism_global_mutation` (microrganismos) por policies RESTRICTIVE apenas para INSERT/UPDATE/DELETE exigindo `has_role(auth.uid(),'superadmin')` ativo/readiness E `is_platform_superadmin(auth.uid())`.
- SELECT interno/B2B preexistente preservado; nenhuma nova permissão de leitura criada. Tabelas confirmadas globais (sem tenant).
- Rollback seguro: nunca restaurar DML de cliente; reverter leitura exigiria revisão (voltar a RESTRICTIVE ALL zera leitura de empresas).
