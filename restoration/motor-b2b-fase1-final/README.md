# Fase 1 — Kit de restauracao / correcao de gate (Motor Comercial B2B)

Ambiente unico autorizado: **staging `ikaauvsflpmamgxmkhoq`**.
Producao `navfzbwgwzruipouyfnk` e recusada por guarda fail-fast em todos os scripts.

## Ordem de execucao

```bash
psql "$STAGING_DSN" --single-transaction -v ON_ERROR_STOP=1 -f precheck.sql
psql "$STAGING_DSN" --single-transaction -v ON_ERROR_STOP=1 -f verify.sql
# somente se for necessario reverter (escopo reduzido, ver abaixo):
psql "$STAGING_DSN" --single-transaction -v ON_ERROR_STOP=1 -f rollback.sql
psql "$STAGING_DSN" --single-transaction -v ON_ERROR_STOP=1 -f verify.sql   # deve falhar em V5
```

Nunca exponha o DSN em log, terminal compartilhado ou commit.

## Conteudo

| Arquivo | Papel |
|---------|-------|
| `precheck.sql` | Guarda de staging + pre-requisitos + inventario read-only |
| `verify.sql` | 12 asserts do gate (higiene, anon, hash v2 obrigatorio, idempotencia, produtor inerte, credito, cotacao, tecnico) |
| `rollback.sql` | Rollback forward-safe, sem reabrir falhas de seguranca |
| `INVENTARIO-MIGRATIONS.md` | Classificacao operacional x teste e status de promovibilidade |
| `migrations-removidas/` | Migrations de fixture/harness retiradas da cadeia operacional |

## Harness fora da cadeia de migrations

- `supabase/tests/motor-b2b/fase1-final/01-papeis-rls-harness.sql` — matriz de papeis/RLS
- `supabase/tests/motor-b2b/fase1-final/02-verify-harness.sql` — verify migrado da migration `20260729032912`
- `supabase/tests/motor-b2b/fase1-final/03-concorrencia.mjs` — prova de concorrencia/idempotencia (execucao externa)

## O que o rollback NAO reverte (decisao de seguranca)

- obrigatoriedade de `p_expected_cart_hash` em `create_partner_order_secure`;
- bloqueio `forbidden_financial_terms` para `parceiro_b2b_tecnico`;
- reavaliacao de credito dentro de `respond_b2b_order_quote_secure`;
- `REVOKE` de `EXECUTE` do papel `anon` nas funcoes comerciais B2B;
- exigencia de autenticacao/papel/vinculo em `rpc_b2b_partner_credit`;
- unicidade da tabela de idempotencia de checkout.

Reverter qualquer um desses itens reabriria exposicao financeira ou permitiria
pedido sem preco autoritativo — exige decisao explicita fora deste kit.
