# Fase Fiscal 3.0 — Migrations canônicas

## Diretório canônico
`supabase/migrations/` passa a ser a **única** fonte de verdade para as migrations fiscais. `restoration/migrations/` foi reduzido a stubs apontando para os arquivos canônicos e não deve ser reintroduzido como fonte.

## Arquivos canonizados nesta fase

| Versão              | Arquivo canônico                                                              | SHA-256                                                            |
| ------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `20260721000000`    | `supabase/migrations/20260721000000_fiscal_fase2_fundacao.sql`                | `e22db0bc2f1112266ce6cf34cb1373f1be5a382e5563f65c3b827a09111de941` |
| `20260721010000`    | `supabase/migrations/20260721010000_fiscal_fase2_1_hardening.sql`             | `85b833dbc6b3d4746019c5851c18584dcb1bc06fb7bcbd533e0168f4d7cd5bf2` |

Cópia foi **byte-a-byte** a partir de `restoration/migrations/` (hashes idênticos). Nenhuma alteração de semântica foi feita nesta fase — as migrations continuam idempotentes (guards `IF NOT EXISTS`, `DROP POLICY IF EXISTS`, `CREATE OR REPLACE`, `pg_constraint` lookup antes de `ADD CONSTRAINT`).

## Estado no banco (projeto AR Bio)
Ambas as versões já foram aplicadas no projeto real e estão registradas em `supabase_migrations.schema_migrations`. **Não reaplicar.**

## Reconciliação em staging / produção

Para bancos que já receberam a versão via canal fora da CLI, registrar sem re-executar:

```sql
INSERT INTO supabase_migrations.schema_migrations (version)
VALUES ('20260721000000'), ('20260721010000')
ON CONFLICT (version) DO NOTHING;
```

## Reconstrução de banco novo (dev/staging vazio)
Aplicar todas as migrations de `supabase/migrations/` em ordem cronológica (nome do arquivo). As duas versões desta fase são idempotentes e podem ser re-executadas com segurança em base vazia.

## Verificação de integridade
Recalcular hashes antes de qualquer release:

```sh
sha256sum supabase/migrations/20260721000000_fiscal_fase2_fundacao.sql \
          supabase/migrations/20260721010000_fiscal_fase2_1_hardening.sql
```

Divergência em relação à tabela acima é bloqueante.

## Bloqueio previsto no plano
O sandbox permitiu escrita direta em `supabase/migrations/`. Nenhum bloqueio ocorreu; caminho alternativo (patch externo) não foi necessário.
