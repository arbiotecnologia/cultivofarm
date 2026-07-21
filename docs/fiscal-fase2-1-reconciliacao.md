# Fase Fiscal 2.1 — Reconciliação de Migrations

**Data:** 2026-07-21

## Contexto

A Fase Fiscal 2 foi aplicada ao banco de produção via `psql` a partir do
arquivo `restoration/fiscal_fase2_fundacao.sql`. Não havia entrada
correspondente em `supabase_migrations.schema_migrations`.

Esta fase (2.1) canoniza o histórico e adiciona uma migration de hardening.

## Restrição operacional do ambiente Lovable

O diretório `supabase/migrations/` deste projeto está bloqueado para
escrita direta pelo sandbox (Lovable exige o uso da ferramenta de
migrations, que só é surfaced quando a integração Cloud está ativa).
Como este projeto usa Supabase externo (não Lovable Cloud), a fonte
canônica dos SQLs desta fase vive em `restoration/migrations/` com
nomes que seguem o padrão de versionamento Supabase.

Arquivos canônicos:

| Version         | Arquivo                                                                       | Propósito                          |
| --------------- | ----------------------------------------------------------------------------- | ---------------------------------- |
| 20260721000000  | `restoration/migrations/20260721000000_fiscal_fase2_fundacao.sql`             | Fundação fiscal (Fase 2, idempotente) |
| 20260721010000  | `restoration/migrations/20260721010000_fiscal_fase2_1_hardening.sql`          | Hardening (Fase 2.1)               |

Ambos os SQLs são idempotentes: usam `CREATE TABLE IF NOT EXISTS`,
`ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`,
`CREATE OR REPLACE VIEW/FUNCTION`, `DROP POLICY IF EXISTS` antes de
`CREATE POLICY`, e blocos `DO $$ ... $$` protegidos por `pg_constraint`
lookup para FKs/checks. Podem ser reexecutados sem efeito colateral.

## Procedimento executado

1. `pg_dump --schema-only` das tabelas fiscais aplicadas → `restoration/fiscal_fase2_applied_schema.sql` (referência).
2. Coleta de views, políticas, funções, triggers e índices via `psql` → `restoration/fiscal_fase2_applied_schema_full.txt`.
3. Cópia de `restoration/fiscal_fase2_fundacao.sql` para `restoration/migrations/20260721000000_fiscal_fase2_fundacao.sql`.
4. Criação e aplicação de `restoration/migrations/20260721010000_fiscal_fase2_1_hardening.sql`.
5. Registro no histórico oficial:

   ```sql
   INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
   VALUES ('20260721000000','fiscal_fase2_fundacao', ARRAY['-- reconciled: applied via psql before versioning']::text[])
   ON CONFLICT (version) DO NOTHING;

   INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
   VALUES ('20260721010000','fiscal_fase2_1_hardening', ARRAY['-- hardening']::text[])
   ON CONFLICT (version) DO NOTHING;
   ```

## Como reproduzir a fundação em uma base vazia

```bash
psql "$PGURL" -v ON_ERROR_STOP=1 \
  -f restoration/migrations/20260721000000_fiscal_fase2_fundacao.sql \
  -f restoration/migrations/20260721010000_fiscal_fase2_1_hardening.sql
```

## Referência histórica

O arquivo original `restoration/fiscal_fase2_fundacao.sql` permanece no
repositório como referência. Ele NÃO é fonte de verdade — qualquer
alteração futura deve ser feita em nova migration versionada, mantendo
o padrão idempotente.
