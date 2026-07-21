# Fase Fiscal 3.0 — Backfill sintético (Opção B)

## Status
**TESTE PREPARADO — EXECUÇÃO PENDENTE EM STAGING.**

Nenhum dado sintético foi inserido no projeto real. Nenhum schema `fiscal_test` foi criado em produção.

## Objetivo
Provar, em ambiente Docker local isolado, que:
1. As migrations fiscais canônicas (`20260721000000`, `20260721010000`) aplicadas sobre dados legados **preservam** todos os registros pré-existentes.
2. As invariantes da Fase 2 são satisfeitas após o backfill (uniqueness com `environment`, FKs, policies, mascaramento).

## Arquivos
| Arquivo | Papel |
| --- | --- |
| `fixtures.sql`        | 12 registros pré-migration (produtos, clientes, invoices legadas). |
| `01-prepare.sql`      | Cria schema `fiscal_test` isolado + dependências mínimas. |
| `02-apply-migrations.sh` | Aplica fundação + hardening em ordem. |
| `03-verify.sql`       | Asserções via `SELECT ... EXCEPT` para cada invariante. |
| `99-cleanup.sql`      | `DROP SCHEMA fiscal_test CASCADE`. |

## Como executar (Docker local — NUNCA em produção)

```sh
docker run --rm -d --name pg-fiscal-test \
  -e POSTGRES_PASSWORD=temp -p 55432:5432 postgres:15
sleep 3
export PGURL='postgres://postgres:temp@localhost:55432/postgres'

psql "$PGURL" -f restoration/backfill-fiscal-fase3/01-prepare.sql
psql "$PGURL" -f restoration/backfill-fiscal-fase3/fixtures.sql
bash restoration/backfill-fiscal-fase3/02-apply-migrations.sh "$PGURL"
psql "$PGURL" -f restoration/backfill-fiscal-fase3/03-verify.sql
psql "$PGURL" -f restoration/backfill-fiscal-fase3/99-cleanup.sql
docker rm -f pg-fiscal-test
```

## Regras
- Nunca apontar `PGURL` para o projeto real da AR Bio.
- Nunca comitar dumps do banco resultante.
- Falha em `03-verify.sql` é bloqueante.
