# P0b — Decisão sobre a migration classificada como auth/RLS

**Version:** `20260727161408`

## O que ela realmente faz

Leitura integral do arquivo:

- cria tabela no schema `public` com FK para `auth.users(id)`;
- habilita RLS e cria policies na tabela **pública** criada;
- lê `vault.decrypted_secrets` para resolver credenciais de provedor.

## O que ela **não** faz

- não executa `CREATE`/`ALTER`/`DROP` em `auth`, `storage`, `realtime`,
  `supabase_functions` ou `vault`;
- não cria trigger em schema gerenciado;
- não altera parâmetros de replicação, nem `ALTER DATABASE`;
- não altera policies de tabelas gerenciadas.

## Classificação corrigida

A marcação "auth/RLS" da P0 é **imprecisa**. A migration é uma migration de
schema `public` com **referência de leitura** a `auth.users` (FK, padrão
suportado) e **dependência de runtime** de `vault`.

## Condição de promoção

Bloqueio real não é `auth`, é **Vault**:

1. confirmar que a extensão/schema `vault` existe em produção e que
   `vault.decrypted_secrets` é legível pelo papel que aplicará a migration;
2. confirmar que os segredos referenciados existem em produção **por nome**
   (nunca por valor) — ver `16-secrets-checklist.md`;
3. se o Vault não estiver disponível, **não** conceder privilégio extra nem
   criar contorno: a migration fica fora da onda e o domínio dependente
   permanece desligado.

Enquanto (1) e (2) não forem verificados em leitura autorizada em produção, esta
migration permanece **BLOQUEADA_REQUER_DECISAO**.

## Prechecks (somente leitura, a executar pelo runner)

```sql
SELECT to_regnamespace('vault') IS NOT NULL AS vault_schema;
SELECT has_table_privilege(current_user, 'vault.decrypted_secrets', 'SELECT') AS pode_ler;
SELECT to_regclass('auth.users') IS NOT NULL AS auth_users_ok;
```

## Rollback

Forward-only: `DROP POLICY` / `DROP TABLE` da tabela pública criada, apenas se
ela estiver vazia. Nada em schema gerenciado é tocado, logo não há reversão de
`auth` a fazer.


## Adendo P0c — decisão corrigida: PROMOVER

Evidência de produção: o schema `vault` existe, `vault.decrypted_secrets`
existe e o executor tem `USAGE`+`SELECT`. Nenhum segredo externo é necessário
para aplicar o schema: os 4 slots `secret_*` nascem `NULL` e todas as flags de
entrega nascem `false`.

Artefato: `promotion-sql/20260727161408__promocao.sql` — guarda canônica de
promoção, precheck de Vault/`auth.users` e pós-check de flags `false`,
`secret_* IS NULL`, ausência de policy, ACL sem anon/authenticated/PUBLIC e RPC
de runtime executável somente por `service_role`. Nenhum segredo é criado ou
copiado; integrações permanecem desligadas. Onda **P3**.
