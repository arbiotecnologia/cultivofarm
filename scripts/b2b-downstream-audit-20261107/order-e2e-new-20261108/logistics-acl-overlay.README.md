# Overlay ACL de função PRE40/INSTALL41/POST42 — REVIEW_ONLY, INATIVO

## Origem

Relato do auditor (09/11/2026 13:34 UTC, produção `swzpzcwiasxmjutrmvkm`): após aprovação humana, `31` foi instalado e POST32 passou. PRE40 parou com `B2B_RESALE_PRE_ACL_DRIFT platform_private.b2b_internal_order_snapshot_guard()`. Dos 15 pins de função, corpo MD5 e owner coincidem 15/15 e ACL 14/15. A única diferença é a ACL real `{postgres=X/postgres,service_role=X/postgres}`, enquanto o pacote congelado esperava `{postgres=X/postgres}`.

A permissão real é legítima e tem origem versionada: `supabase/migrations/20261008192025_4c4bd075-…sql` cria a função, revoga de `PUBLIC,anon,authenticated` e concede `EXECUTE TO service_role`. A fixture descartável antiga não reproduzia esse GRANT, e por isso o pin congelado ficou incompleto. Não é diferença de ordem textual.

## Delta

- Somente três linhas mudam, uma em cada um de `40`, `41` (no prefixo PRE) e `42`: o pin ACL dessa função passa a comparar arrays `aclitem` ordenados (`COLLATE "C"`) contra a ACL real. A comparação continua sensível ao grantee, ao privilégio, à grant option e ao grantor.
- O corpo MD5 `9cad2aaa…`, o owner, os outros 14 pins, o candidato DDL e `94` ficam byte-idênticos. O gerador prova que, ao reverter a troca, o arquivo volta a ser o congelado.
- Nenhum GRANT/REVOKE é adicionado: a permissão `service_role` existente não é removida nem ampliada. `CREATE OR REPLACE` em `41` preserva a ACL, e POST42 a exige.
- `50–62` e `89–94` são usados do pacote congelado, sem mudança.

## Ordem para o auditor

Não reinstalar `11/21/26/31`. Usar `40`, `41` e `42` deste overlay. Depois, se aprovado, usar `50/51/52` e `60/61/62` do pacote congelado. Os rollbacks seguem o pacote congelado: `94` não toca o guard.

## Limites

Os resultados vêm de um PostgreSQL 17 descartável, com Auth/papéis sintéticos; não provam JWT/RLS/Storage hospedados. O gate de estoque e o de logística ficam OFF. Não há ativação, publicação, SQL hospedado pelo agente, fiscal, envios ou cobrança. Residual: `platform_private.c2_external_origin_contract_valid(jsonb)`, pinado em 50/60 como `{postgres=X/postgres}`, não tem GRANT versionado nas migrations locais. Recomenda-se ao auditor uma leitura READ ONLY da ACL real antes de PRE50, para evitar nova falha em série.
