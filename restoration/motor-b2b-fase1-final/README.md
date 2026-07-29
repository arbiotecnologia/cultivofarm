# Fase 1 — Kit de restauracao da correcao consolidada final (Motor Comercial B2B)

Ambiente unico autorizado: **staging `ikaauvsflpmamgxmkhoq`**.
Producao `navfzbwgwzruipouyfnk` e recusada por guarda fail-fast em todos os scripts.

## Ordem de execucao

```bash
psql "$STAGING_DSN" --single-transaction -v ON_ERROR_STOP=1 -f precheck.sql
psql "$STAGING_DSN" --single-transaction -v ON_ERROR_STOP=1 -f verify.sql
# somente se for necessario reverter:
psql "$STAGING_DSN" --single-transaction -v ON_ERROR_STOP=1 -f rollback.sql
psql "$STAGING_DSN" --single-transaction -v ON_ERROR_STOP=1 -f verify.sql   # deve falhar em V4/V5
```

Nunca exponha o DSN em log, terminal compartilhado ou commit.

## Conteudo

| Arquivo | Papel |
|---------|-------|
| `precheck.sql` | Guarda de staging + verificacao de pre-requisitos + inventario read-only |
| `verify.sql` | 8 asserts da correcao consolidada (higiene, anon, hash, produtor inerte, credito, cotacao, simulacao) |
| `rollback.sql` | Rollback forward-safe, sem tocar em dado operacional |
| `migrations-removidas/` | Migrations de fixture/teste retiradas da cadeia operacional (ver abaixo) |

## Higiene da cadeia de migrations

As migrations abaixo criavam tabelas de evidencia (`_motor_b2b_fase1_int_evidence`,
`_motor_b2b_fase1_quote_evidence`) usadas apenas como harness de teste e foram
retiradas de `supabase/migrations/` para este diretorio:

- `20260729024115_da3ffea7-27bb-421b-9b17-e1690e54b6de.sql`
- `20260729024354_5a4941a5-3b77-47fe-bd62-d3ca4b461a0f.sql`
- `20260729024929_e409c643-c43d-4419-88cd-8bf754cf7bad.sql`

Reconciliacao: as tabelas de evidencia foram removidas do banco de staging pela
migration consolidada `20260729031837`. O conteudo funcional dessas migrations
(RPC `respond_b2b_order_quote_secure` e afins) permanece na cadeia operacional
nas migrations subsequentes — nenhuma regra de negocio foi perdida.

## O que o rollback NAO reverte (decisao de seguranca)

- `REVOKE` de `EXECUTE` do papel `anon` nas funcoes comerciais B2B;
- exigencia de autenticacao/papel/vinculo em `rpc_b2b_partner_credit`;
- ocultacao de dados de credito para `parceiro_b2b_tecnico`.

Reverter qualquer um desses itens reabriria exposicao de dado financeiro e
deve ser feito apenas por decisao explicita, fora deste kit.
