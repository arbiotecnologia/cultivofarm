# Fase Fiscal 3.0 — Mascaramento recursivo `mask_sensitive_jsonb`

## Objetivo
Garantir que qualquer JSON escrito em `fiscal_audit_log` tenha chaves sensíveis substituídas por `***REDACTED***`, recursivamente, antes da persistência.

## Chaves sensíveis (case-insensitive, match parcial)
`authorization`, `token`, `password`, `senha`, `certificate`, `certificado`, `private_key`, `secret`, `pfx`, `p12`.

Match parcial cobre variantes como `accessToken`, `private_key_pem`, `pfxPassword`.

## Cobertura
- **Contrato TS** (`src/test/fiscal/mask.test.ts`): sempre executa em CI. Espelha o comportamento esperado da função SQL. Cinco casos: topo, aninhado, arrays, primitivos, chaves compostas.
- **Runtime SQL** (`src/test/fiscal/rls/mask.sql.test.ts`): executa a função real via `pg` client quando `PGURL_STAGING` presente. Skip explícito caso contrário.

## Limites conhecidos
- Match é feito por substring, portanto uma chave inocente contendo `secret` (ex.: `secretariado`) também será mascarada. Comportamento intencional (falso-positivo é preferível a vazamento).
- Valores primitivos que "parecem" segredo (ex.: base64 puro em uma chave `data`) **não** são detectados. A defesa é por nome de chave.
- A função SQL depende de `search_path = public, pg_temp` (definida como `SECURITY DEFINER`).

## Regressões a monitorar
- Adição de novas chaves sensíveis: atualizar simultaneamente `SENSITIVE_KEYS` (TS) e a função SQL, com nova migration incremental.
- Alteração de retorno para tipos não-jsonb: quebra o contrato.
