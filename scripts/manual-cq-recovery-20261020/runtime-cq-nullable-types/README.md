# Tipos CQ nullable (produto-only)
- useCQReferencia.ts e ParametrosCQPage.tsx: microrganismo_id string|null; normalizeCQReferenceIds (vazio->NULL, ambos vazios falha).
- Edição global continua fechada (TENANT_CAN_EDIT_GLOBAL_CATALOG); sem grants/SQL/gates.
- Rollback: copiar rollback/*.review para os caminhos e remover src/test/cq/parametros-cq-normalize.test.ts.
